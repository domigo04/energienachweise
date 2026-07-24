"""LV-/Submission-Import (B2, B9, B11).

Aus einem alten Unternehmer-LV entsteht ein geprüfter technischer Fingerprint +
reale BKP-Kosten. Ablauf: Upload → Extraktion → Review/Korrektur → Freigabe.
Erst die Freigabe übernimmt Daten in die Referenzstruktur (RefProjekt); nicht
freigegebene Imports rechnen NIE in der Kostenschätzung mit.
"""
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
from app.models.kv import RefProjekt, RefKostenzeile
from app.lv_import.pdf_extract import extract_pages, ist_durchsuchbar
from app.lv_import.feature_extract import extract_features
from app.lv_import.cost_extract import extract_costs
from app.lv_import.feature_keys import FEATURE_DEFS, FEATURE_TO_CONTEXT

router = APIRouter(prefix="/api/v1/lv-imports", tags=["KV – LV-Import"])


def _get_import(db: Session, user: User, import_id: int) -> LvImport:
    imp = (
        db.query(LvImport)
        .filter(LvImport.id == import_id, LvImport.tenant_id == user.tenant_id)
        .first()
    )
    if not imp:
        raise HTTPException(status_code=404, detail="LV-Import nicht gefunden")
    return imp


def _feature_out(f: LvImportFeature) -> dict:
    return {
        "id": f.id, "key": f.key,
        "label": FEATURE_DEFS.get(f.key, {}).get("label", f.key),
        "unit": f.unit, "value": f.value,
        "confirmed_value": f.confirmed_value, "confirmed": f.confirmed,
        "confidence": f.confidence,
        "source_page": f.source_page, "source_text": f.source_text,
        "effective_value": f.confirmed_value if f.confirmed_value not in (None, "") else f.value,
    }


def _cost_out(c: LvImportCost) -> dict:
    return {
        "id": c.id, "bkp_nr": c.bkp_nr,
        "detected_amount": c.detected_amount, "confirmed_amount": c.confirmed_amount,
        "confidence": c.confidence, "source_page": c.source_page, "source_text": c.source_text,
        "effective_amount": c.confirmed_amount if c.confirmed_amount is not None else c.detected_amount,
    }


def _import_out(imp: LvImport, detail: bool = False) -> dict:
    base = {
        "id": imp.id, "filename": imp.filename, "file_hash": imp.file_hash,
        "status": imp.status, "page_count": imp.page_count,
        "is_searchable": imp.is_searchable, "project_id": imp.project_id,
        "ref_projekt_id": imp.ref_projekt_id, "created_by_name": imp.created_by_name,
        "created_at": imp.created_at.isoformat() if imp.created_at else None,
    }
    if detail:
        base["features"] = [_feature_out(f) for f in imp.features]
        base["costs"] = [_cost_out(c) for c in imp.costs]
    return base


@router.post("", status_code=201)
async def upload_lv(
    file: UploadFile = File(...),
    project_id: int | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """B2 — PDF hochladen: Firma prüfen, Original + SHA-256 speichern, Import
    anlegen und Extraktion starten. Original wird nie überschrieben."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Leere Datei")
    file_hash = hashlib.sha256(raw).hexdigest()

    imp = LvImport(
        tenant_id=user.tenant_id, project_id=project_id,
        filename=file.filename or "lv.pdf", file_hash=file_hash,
        original_pdf=raw, created_by=user.id,
        created_by_name=user.name or user.email,
        status=LvImportStatus.uploaded.value,
    )
    db.add(imp)
    db.flush()

    # B3 — Extraktion (born-digital). Fehler dürfen den Import nicht sprengen.
    pages = extract_pages(raw)
    imp.page_count = len(pages)
    imp.is_searchable = ist_durchsuchbar(pages)
    try:
        features = extract_features(pages)
        costs = extract_costs(pages)
        for key, f in features.items():
            val = f.get("value")
            db.add(LvImportFeature(
                lv_import_id=imp.id, key=key,
                value=None if val is None else str(val),
                unit=FEATURE_DEFS.get(key, {}).get("einheit"),
                confidence=f.get("confidence"),
                source_page=f.get("source_page"), source_text=f.get("source_text"),
            ))
        for c in costs:
            db.add(LvImportCost(
                lv_import_id=imp.id, bkp_nr=c["bkp_nr"],
                detected_amount=c.get("detected_amount"), confidence=c.get("confidence"),
                source_page=c.get("source_page"), source_text=c.get("source_text"),
            ))
        imp.status = LvImportStatus.review.value if imp.is_searchable else LvImportStatus.extracted.value
    except Exception:
        imp.status = LvImportStatus.failed.value

    db.commit()
    db.refresh(imp)
    return _import_out(imp, detail=True)


@router.get("")
def list_lv(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(LvImport)
        .filter(LvImport.tenant_id == user.tenant_id)
        .order_by(LvImport.created_at.desc(), LvImport.id.desc())
        .all()
    )
    return [_import_out(imp) for imp in rows]


@router.get("/{import_id}")
def get_lv(import_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _import_out(_get_import(db, user, import_id), detail=True)


@router.patch("/{import_id}/features/{feature_id}")
def update_feature(
    import_id: int, feature_id: int, body: dict,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """B9 — einen erkannten Wert bestätigen oder korrigieren."""
    imp = _get_import(db, user, import_id)
    f = next((x for x in imp.features if x.id == feature_id), None)
    if not f:
        raise HTTPException(status_code=404, detail="Feature nicht gefunden")
    if "confirmed_value" in body:
        cv = body["confirmed_value"]
        f.confirmed_value = None if cv in (None, "") else str(cv)
    if "confirmed" in body:
        f.confirmed = bool(body["confirmed"])
    db.commit()
    return _feature_out(f)


@router.patch("/{import_id}/costs/{cost_id}")
def update_cost(
    import_id: int, cost_id: int, body: dict,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """B8 — BKP-Betrag manuell bestätigen/ergänzen (confirmed_amount)."""
    imp = _get_import(db, user, import_id)
    c = next((x for x in imp.costs if x.id == cost_id), None)
    if not c:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")
    if "confirmed_amount" in body:
        amt = body["confirmed_amount"]
        try:
            c.confirmed_amount = None if amt in (None, "") else float(amt)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Ungültiger Betrag")
    db.commit()
    return _cost_out(c)


def _effective_feature(f: LvImportFeature):
    return f.confirmed_value if f.confirmed_value not in (None, "") else f.value


@router.post("/{import_id}/approve")
def approve_lv(import_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """B11 — Freigabe: erst jetzt Übernahme in die Referenzstruktur (RefProjekt).
    Der vollständige normalisierte Fingerprint bleibt zusätzlich in den
    LvImportFeature-Zeilen erhalten (gemeinsame Feature-Sprache, B12)."""
    imp = _get_import(db, user, import_id)
    if imp.status == LvImportStatus.approved.value:
        raise HTTPException(status_code=409, detail="Import ist bereits freigegeben")

    eff = {f.key: _effective_feature(f) for f in imp.features}

    def num(key):
        v = eff.get(key)
        try:
            return float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    ref = RefProjekt(
        tenant_id=user.tenant_id, erstellt_von=user.id,
        name=f"LV-Import: {imp.filename}",
        heizleistung_kw=num("generator_power_kw"),
        installierte_leistung_neu_kw=num("generator_power_kw"),
        bohrmeter=num("borehole_total_m"),
        anzahl_waermemessungen=int(num("heat_meter_count")) if num("heat_meter_count") is not None else None,
        laufmeter_rohre_heizung=num("pipe_length_m"),
        waermeerzeuger=[eff["generator_type"]] if eff.get("generator_type") else [],
    )
    db.add(ref)
    db.flush()

    for c in imp.costs:
        betrag = c.confirmed_amount if c.confirmed_amount is not None else c.detected_amount
        if betrag is None:
            continue
        db.add(RefKostenzeile(
            tenant_id=user.tenant_id, ref_projekt_id=ref.id, gewerk="heizung",
            bkp_nr=c.bkp_nr, bkp_name=None, betrag_chf=float(betrag),
        ))

    imp.status = LvImportStatus.approved.value
    imp.ref_projekt_id = ref.id
    db.commit()
    db.refresh(imp)
    return {"import": _import_out(imp, detail=True), "ref_projekt_id": ref.id,
            "uebernommene_features": {k: v for k, v in eff.items() if v not in (None, "")},
            "feature_mapping": FEATURE_TO_CONTEXT}
