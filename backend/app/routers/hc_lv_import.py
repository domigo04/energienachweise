"""LV-/Submission-Import (B2, B9, B11).

Aus einem alten Unternehmer-LV entsteht ein geprüfter technischer Fingerprint +
reale BKP-Kosten. Ablauf: Upload → Extraktion → Review/Korrektur → Freigabe.
Erst die Freigabe übernimmt Daten in die Referenzstruktur (RefProjekt); nicht
freigegebene Imports rechnen NIE in der Kostenschätzung mit.
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
from app.models.kv import RefProjekt, RefKostenzeile, RefProjektFeature
from app.lv_import.pipeline import LvPipeline
from app.lv_import.feature_extract import extract_features
from app.lv_import.cost_extract import extract_costs
from app.lv_import.cost_summary import parse_cost_summary, to_cost_rows, has_cost_summary
from app.lv_import.project_extract import extract_project_data
from app import fachwerte
from app.lv_import.feature_keys import FEATURE_DEFS, FEATURE_KEYS, FEATURE_TO_CONTEXT
from app.lv_import import page_classifier as pc

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
        # Punkt 12/22: kompakter Auszug + Rechenweg abgeleiteter Werte.
        "source_excerpt": f.source_excerpt, "derived_from": f.derived_from,
        "effective_value": f.confirmed_value if f.confirmed_value not in (None, "") else f.value,
    }


def _cost_effective(c: LvImportCost):
    return c.confirmed_amount if c.confirmed_amount is not None else c.detected_amount


def _cost_out(c: LvImportCost) -> dict:
    return {
        "id": c.id, "bkp_nr": c.bkp_nr,
        # Punkt 14/17 — Originalnummer, Originaltitel und kanonische Zuordnung.
        "original_position": c.original_position, "original_title": c.original_title,
        "canonical_key": c.canonical_key,
        "is_group_total": bool(c.is_group_total),
        "validation_status": c.validation_status, "source": c.source,
        "detected_amount": c.detected_amount, "confirmed_amount": c.confirmed_amount,
        "confidence": c.confidence, "source_page": c.source_page, "source_text": c.source_text,
        "positionen": c.positionen, "confirmed": c.confirmed, "manual": c.manual,
        "effective_amount": _cost_effective(c),
    }


def _import_out(imp: LvImport, detail: bool = False) -> dict:
    base = {
        "id": imp.id, "filename": imp.filename, "file_hash": imp.file_hash,
        "status": imp.status, "page_count": imp.page_count,
        "is_searchable": imp.is_searchable, "extract_method": imp.extract_method,
        "project_id": imp.project_id,
        "ref_projekt_id": imp.ref_projekt_id, "created_by_name": imp.created_by_name,
        "created_at": imp.created_at.isoformat() if imp.created_at else None,
        "grunddaten": {
            "ebf_m2": imp.ebf_m2, "anzahl_einheiten": imp.anzahl_einheiten,
            "gebaeudetyp": imp.gebaeudetyp, "projektart": imp.projektart,
            "zertifizierung": imp.zertifizierung, "region": imp.region,
            # Punkt 19 — aus dem Deckblatt erkannt.
            "projekt_name": imp.projekt_name, "projekt_nummer": imp.projekt_nummer,
            "ort": imp.ort, "unternehmer": imp.unternehmer,
            "offert_datum": imp.offert_datum,
        },
    }
    if detail:
        base["features"] = [_feature_out(f) for f in imp.features]
        base["costs"] = [_cost_out(c) for c in imp.costs]
        # Punkt 25 — Verarbeitungsbericht für die Import-Zusammenfassung.
        base["report"] = _report(imp)
    return base


def _report(imp: LvImport) -> dict:
    try:
        return json.loads(imp.debug_json) if imp.debug_json else {}
    except (ValueError, TypeError):
        return {}


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

    # B3 / P0 #1 / Punkt 29 — EINE Pipeline: Text, Wortkoordinaten, Seiten-
    # klassifikation und alle Extraktoren laufen genau einmal und teilen ihre
    # Zwischenergebnisse. Die Methode (spatial_pdf/text/ocr/image) wird
    # festgehalten, damit im Review sichtbar bleibt, woher ein Wert stammt.
    # Fehler dürfen den Import nicht sprengen.
    pipeline = LvPipeline(raw)
    imp.page_count = pipeline.page_count
    imp.is_searchable = pipeline.is_searchable
    imp.extract_method = pipeline.extraction_method
    try:
        # Punkt 19 — Projektangaben aus dem Deckblatt vorschlagen (nur belegbare;
        # EBF/Zertifizierung/Projektart werden NICHT geraten).
        projekt = extract_project_data(pipeline.grunddaten_pages)
        imp.projekt_name = (projekt.get("project_name") or {}).get("value")
        imp.projekt_nummer = (projekt.get("project_number") or {}).get("value")
        imp.ort = (projekt.get("location") or {}).get("value")
        imp.unternehmer = (projekt.get("contractor") or {}).get("value")
        imp.offert_datum = (projekt.get("offer_date") or {}).get("value")
        if projekt.get("building_use"):
            imp.gebaeudetyp = projekt["building_use"]["value"]
        if projekt.get("units"):
            imp.anzahl_einheiten = projekt["units"]["value"]

        features = extract_features(pipeline.technik_pages, pipeline.technik_word_pages)
        # Punkt 13 — Kosten primär aus der Kostenzusammenstellung; nur wenn es
        # keine gibt, werden die LV-Positionstotale ausgewertet.
        summary = parse_cost_summary(pipeline.cost_summary_pages)
        if has_cost_summary(summary):
            costs = to_cost_rows(summary)
        else:
            costs = [dict(c, source="lv_positions") for c in extract_costs(pipeline.lv_pages)]
        # ALLE kanonischen Features anlegen (auch nicht erkannte) → der Nutzer
        # sieht die vollständige Checkliste und kann fehlende Werte ergänzen.
        for key in FEATURE_KEYS:
            f = features.get(key)
            val = f.get("value") if f else None
            bbox = (f or {}).get("source_bbox")
            db.add(LvImportFeature(
                lv_import_id=imp.id, key=key,
                value=None if val is None else str(val),
                unit=FEATURE_DEFS.get(key, {}).get("einheit"),
                confidence=f.get("confidence") if f else None,
                source_page=f.get("source_page") if f else None,
                source_text=f.get("source_text") if f else None,
                source_excerpt=f.get("source_excerpt") if f else None,
                source_bbox=",".join(str(round(v, 1)) for v in bbox) if bbox else None,
                derived_from=f.get("derived_from") if f else None,
            ))
        for c in costs:
            db.add(LvImportCost(
                lv_import_id=imp.id, bkp_nr=c["bkp_nr"],
                original_position=c.get("original_position"),
                original_title=c.get("original_title"),
                canonical_key=c.get("canonical_key"),
                is_group_total=bool(c.get("is_group_total", False)),
                validation_status=c.get("validation_status"),
                source=c.get("source"),
                detected_amount=c.get("detected_amount"), confidence=c.get("confidence"),
                source_page=c.get("source_page"), source_text=c.get("source_text"),
                positionen=c.get("positionen", 1),
            ))
        # Punkt 25/30 — Verarbeitungsbericht: was wurde erkannt, was muss geprüft
        # werden. Speist die Import-Zusammenfassung und den Debug-Dump.
        erkannte = [k for k, f in features.items() if f.get("value") is not None]
        pruefen = [c["bkp_nr"] for c in costs if not c.get("canonical_key")
                   and not c.get("is_group_total")]
        imp.debug_json = json.dumps({
            **pipeline.debug_dump(),
            "cost_source": "cost_summary" if has_cost_summary(summary) else "lv_positions",
            "features_erkannt": len(erkannte),
            "features_total": len(FEATURE_KEYS),
            "feature_keys_erkannt": erkannte,
            "kostenpositionen": len([c for c in costs if not c.get("is_group_total")]),
            "gruppentotale": len([c for c in costs if c.get("is_group_total")]),
            "kosten_ohne_zuordnung": len(pruefen),
            "gruppen_validierung": {
                g: i.get("validation_status")
                for g, i in (summary.get("group_totals") or {}).items()},
            "trade_total": summary.get("trade_total"),
            "projekt_erkannt": sorted(projekt.keys()),
        }, ensure_ascii=False)
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


@router.get("/fachwerte")
def fachwerte_listen(user: User = Depends(get_current_user)):
    """Punkt 5/20 — die EINE Registry kontrollierter Auswahllisten für das
    Frontend. Muss VOR `/{import_id}` stehen, sonst fängt der int-Pfad zu."""
    from app import fachwerte
    return fachwerte.as_frontend()


@router.get("/ocr-status")
def ocr_status(user: User = Depends(get_current_user)):
    """P0 #1 — Diagnose, ob die deutsche OCR im Deployment einsatzbereit ist
    (Tesseract-Binary + Sprachpaket deu + poppler). Muss VOR `/{import_id}`
    stehen, sonst fängt der int-Pfad die Anfrage ab."""
    from app.lv_import.pdf_extract import ocr_verfuegbar
    return ocr_verfuegbar()


@router.get("/{import_id}")
def get_lv(import_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _import_out(_get_import(db, user, import_id), detail=True)


@router.get("/{import_id}/debug")
def debug_lv(import_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Punkt 30 — Debug-Dump für die Arbeit an echten LVs.

    Zeigt Seitenklassifikation, erkannte Features, Kostenzeilen samt kanonischer
    Zuordnung und die Gruppen-Summenprüfung. Nur für die eigene Firma sichtbar
    (wie jeder andere Import-Zugriff) und im normalen UI nicht verlinkt.
    """
    imp = _get_import(db, user, import_id)
    report = _report(imp)
    return {
        "import_id": imp.id, "filename": imp.filename,
        "extract_method": imp.extract_method,
        "page_classification": report.get("classification", []),
        "page_types": report.get("page_types", {}),
        "cost_source": report.get("cost_source"),
        "gruppen_validierung": report.get("gruppen_validierung", {}),
        "trade_total": report.get("trade_total"),
        "features": [
            {"key": f.key, "value": f.value, "confidence": f.confidence,
             "derived_from": f.derived_from, "source_page": f.source_page,
             "source_text": f.source_text, "source_excerpt": f.source_excerpt,
             "source_bbox": f.source_bbox}
            for f in imp.features
        ],
        "costs": [
            {"bkp_nr": c.bkp_nr, "original_position": c.original_position,
             "original_title": c.original_title, "canonical_key": c.canonical_key,
             "is_group_total": bool(c.is_group_total),
             "validation_status": c.validation_status,
             "detected_amount": c.detected_amount, "source_page": c.source_page}
            for c in imp.costs
        ],
        "report": report,
    }


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
    if "confirmed" in body:
        c.confirmed = bool(body["confirmed"])
    db.commit()
    return _cost_out(c)


@router.post("/{import_id}/costs", status_code=201)
def add_cost(import_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Manuelle BKP-Kostenposition hinzufügen."""
    imp = _get_import(db, user, import_id)
    bkp_nr = str(body.get("bkp_nr") or "").strip()
    if not bkp_nr:
        raise HTTPException(status_code=422, detail="BKP-Nummer fehlt")
    try:
        betrag = None if body.get("confirmed_amount") in (None, "") else float(body["confirmed_amount"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Ungültiger Betrag")
    c = LvImportCost(lv_import_id=imp.id, bkp_nr=bkp_nr, confirmed_amount=betrag,
                     manual=True, confirmed=bool(body.get("confirmed", False)), positionen=1)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _cost_out(c)


@router.delete("/{import_id}/costs/{cost_id}", status_code=204)
def delete_cost(import_id: int, cost_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    imp = _get_import(db, user, import_id)
    c = next((x for x in imp.costs if x.id == cost_id), None)
    if not c:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")
    db.delete(c)
    db.commit()


@router.patch("/{import_id}")
def update_import(import_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Projektgrunddaten im Review ergänzen (Item 6). Fliessen bei Freigabe ins RefProjekt."""
    imp = _get_import(db, user, import_id)
    if "ebf_m2" in body:
        try:
            imp.ebf_m2 = None if body["ebf_m2"] in (None, "") else float(body["ebf_m2"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Ungültige EBF")
    if "anzahl_einheiten" in body:
        try:
            imp.anzahl_einheiten = None if body["anzahl_einheiten"] in (None, "") else int(float(body["anzahl_einheiten"]))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Ungültige Einheiten")
    # Punkt 20 — kategoriale Merkmale nur als kanonischer Code speichern.
    # Freitext wird über die zentrale Registry normalisiert; lässt er sich nicht
    # zuordnen, wird er abgelehnt statt als neue Schreibweise verewigt.
    for feld, registry in (("gebaeudetyp", "building_uses"),
                           ("projektart", "project_types"),
                           ("zertifizierung", "certifications")):
        if feld not in body:
            continue
        val = body[feld]
        if val in (None, ""):
            setattr(imp, feld, None)
            continue
        code = fachwerte.normalize(registry, val)
        if not code:
            raise HTTPException(status_code=422, detail={
                "message": f"Unbekannter Wert für {feld}. Bitte aus der Liste wählen.",
                "feld": feld, "erlaubt": fachwerte.codes(registry),
            })
        setattr(imp, feld, code)
    for feld in ("region", "projekt_name", "projekt_nummer", "ort", "unternehmer",
                 "offert_datum"):
        if feld in body:
            val = body[feld]
            setattr(imp, feld, None if val in (None, "") else str(val)[:200])
    db.commit()
    return _import_out(imp, detail=True)


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

    # Freigabe nur, wenn jeder relevante Wert geprüft ist — bestätigt ODER
    # bewusst als unbekannt markiert (beides setzt confirmed=True).
    unbestaetigt = [f.key for f in imp.features if not f.confirmed]
    if unbestaetigt:
        raise HTTPException(status_code=422, detail={
            "message": "Bitte alle Werte prüfen (bestätigen oder als unbekannt markieren).",
            "unconfirmed": unbestaetigt,
        })

    # Freigabe blockieren, solange VERWENDETE Kosten (mit effektivem Betrag)
    # ungeprüft sind (Item 5).
    kosten_offen = [c.bkp_nr for c in imp.costs if _cost_effective(c) is not None and not c.confirmed]
    if kosten_offen:
        raise HTTPException(status_code=422, detail={
            "message": "Bitte alle verwendeten Kostenpositionen bestätigen.",
            "unconfirmed_costs": kosten_offen,
        })

    eff = {f.key: _effective_feature(f) for f in imp.features}

    def num(key):
        v = eff.get(key)
        try:
            return float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    # Punkt 6/7 — mehrere Wärmeerzeuger und Wärmeabgaben als kanonische Codes.
    # `generator_types` ist die vollständige Liste; fehlt sie (Altimport), wird
    # der Einzelwert `generator_type` verwendet.
    erzeuger = fachwerte.normalize_list("generator_types", eff.get("generator_types"))
    if not erzeuger and eff.get("generator_type"):
        erzeuger = fachwerte.normalize_list("generator_types", eff["generator_type"])
    abgabe = fachwerte.normalize_list("heat_delivery_types", eff.get("heat_delivery_types"))

    ref = RefProjekt(
        tenant_id=user.tenant_id, erstellt_von=user.id,
        name=imp.projekt_name or f"LV-Import: {imp.filename}",
        installierte_leistung_neu_kw=num("generator_power_kw"),
        waermeerzeuger=erzeuger,
        waermeabgabe=abgabe,
        # Hybrid ist kein gewählter Erzeuger, sondern abgeleitet (Punkt 7).
        anlagenkonfiguration="hybrid" if fachwerte.ist_hybrid(erzeuger) else None,
        # Projektgrunddaten aus dem Review (Item 6 / Punkt 20) — kanonische Codes.
        ebf_m2=imp.ebf_m2, anzahl_einheiten=imp.anzahl_einheiten,
        gebaeudetyp=imp.gebaeudetyp, projektart=imp.projektart,
        zertifizierung=imp.zertifizierung,
    )
    # Legacy-Spalten aus dem EINEN zentralen Mapping befüllen (Rückwärts-
    # kompatibilität zur bestehenden Ähnlichkeit, die noch Spalten liest).
    from app.lv_import.feature_keys import REFPROJEKT_COLUMN_TO_FEATURE
    for column, feature_key in REFPROJEKT_COLUMN_TO_FEATURE.items():
        v = num(feature_key)
        if v is None:
            continue
        setattr(ref, column, int(round(v)) if column == "anzahl_waermemessungen" else v)
    db.add(ref)
    db.flush()

    # Kompletter normalisierter Fingerprint (ALLE Merkmale, gemeinsame Sprache).
    for f in imp.features:
        db.add(RefProjektFeature(
            tenant_id=user.tenant_id, ref_projekt_id=ref.id,
            key=f.key, value=eff.get(f.key), unit=f.unit,
        ))

    # Punkt 14/15 — Einzelpositionen sind massgebend. Ein Gruppentotal ist nur
    # eine Kontrollzeile und darf NIE zusätzlich zu seinen Unterpositionen in die
    # Referenzkosten fliessen (sonst zählt jede Gruppe doppelt). Nur wenn eine
    # Gruppe gar keine Einzelposition hat, wird ihr Total selbst verwendet.
    gruppen_mit_positionen = {
        c.bkp_nr for c in imp.costs
        if not c.is_group_total and _cost_effective(c) is not None
    }
    for c in imp.costs:
        betrag = _cost_effective(c)
        if betrag is None:
            continue
        if c.is_group_total and c.bkp_nr in gruppen_mit_positionen:
            continue
        db.add(RefKostenzeile(
            tenant_id=user.tenant_id, ref_projekt_id=ref.id, gewerk="heizung",
            # Originalnummer erhalten, wenn vorhanden (Punkt 14).
            bkp_nr=c.original_position or c.bkp_nr,
            bkp_name=c.original_title, betrag_chf=float(betrag),
        ))

    imp.status = LvImportStatus.approved.value
    imp.ref_projekt_id = ref.id
    db.commit()
    db.refresh(imp)
    return {"import": _import_out(imp, detail=True), "ref_projekt_id": ref.id,
            "uebernommene_features": {k: v for k, v in eff.items() if v not in (None, "")},
            "feature_mapping": FEATURE_TO_CONTEXT}
