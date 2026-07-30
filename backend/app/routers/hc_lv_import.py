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
from app.models.lv_import import (
    LvImport, LvImportFeature, LvImportCost, LvImportCondition, LvImportStatus,
)
from app.models.kv import RefProjekt, RefKostenzeile, RefProjektFeature
from app.lv_import.pipeline import LvPipeline
from app.lv_import.feature_extract import extract_features
from app.lv_import.cost_extract import cost_rows_from_positions
from app.lv_import.cost_summary import parse_cost_summary, to_cost_rows, has_cost_summary
from app.lv_import.project_extract import extract_project_data
from app.lv_import import norm_lv
from app.lv_import.llm import resolver as llm
from app import fachwerte
from app.lv_import.feature_keys import (
    FEATURE_DEFS, LV_IMPORT_FEATURE_KEYS, FEATURE_TO_CONTEXT,
)
from app.lv_import import page_classifier as pc
from app.lv_import.review_packet import build_review_packet
from app.lv_import.positions import parse_positions
from app.lv_import.llm import visual_review
from app.lv_import.llm.budget import ImportLlmBudget

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
    if c.mapping_confirmed:
        mapping_status = "automatisch zugeordnet" if c.canonical_key else "nicht zugeordnet"
    elif c.mapping_method == norm_lv.LLM:
        mapping_status = "LLM-Vorschlag"
    elif c.canonical_key:
        mapping_status = "automatisch zugeordnet"
    else:
        mapping_status = "manuell zu prüfen"
    return {
        "id": c.id, "bkp_nr": c.bkp_nr,
        # Punkt 14/17 — Originalnummer, Originaltitel und kanonische Zuordnung.
        "original_position": c.original_position, "original_title": c.original_title,
        "section_path": c.section_path,
        "canonical_key": c.canonical_key,
        "canonical_label": norm_lv.norm_label(c.canonical_key) if c.canonical_key else None,
        "original_amount": c.original_amount,
        "mapping_method": c.mapping_method,
        "mapping_confidence": c.mapping_confidence,
        "mapping_reason": c.mapping_reason,
        "mapping_confirmed": bool(c.mapping_confirmed),
        "mapping_status": mapping_status,
        # Fliesst diese Zeile in die Referenzkosten? Nur mit bestätigter
        # Norm-LV-Zuordnung — sonst bleibt sie nur im Import dokumentiert.
        "in_reference": bool(c.canonical_key and c.mapping_confirmed
                             and not c.is_group_total
                             and _cost_effective(c) is not None),
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
            "gewerk": imp.gewerk, "waehrung": imp.waehrung,
        },
    }
    if detail:
        base["features"] = [_feature_out(f) for f in imp.features]
        base["costs"] = [_cost_out(c) for c in imp.costs]
        base["conditions"] = [{
            "id": c.id, "original_label": c.original_label, "kind": c.kind,
            "direction": c.direction, "rate_percent": c.rate_percent,
            "amount": c.amount, "basis_amount": c.basis_amount,
            "calculated_amount": c.calculated_amount,
            "running_total": c.running_total, "order": c.order_index,
            "source_page": c.source_page,
        } for c in sorted(imp.conditions, key=lambda x: x.order_index)]
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
        imp.gewerk = "heizung"
        imp.waehrung = "CHF"
        if projekt.get("building_use"):
            imp.gebaeudetyp = projekt["building_use"]["value"]
        if projekt.get("units"):
            imp.anzahl_einheiten = projekt["units"]["value"]

        features = extract_features(pipeline.technik_pages, pipeline.technik_word_pages)
        positions = parse_positions(pipeline.lv_pages)
        # Punkt 13 — Kosten primär aus der Kostenzusammenstellung; nur wenn es
        # keine gibt, werden die LV-Positionstotale ausgewertet.
        summary = parse_cost_summary(pipeline.cost_summary_pages,
                                     pipeline.cost_summary_word_pages)
        if has_cost_summary(summary):
            costs = to_cost_rows(summary)
        else:
            # Einzelpositionen bleiben einzeln sichtbar: Menge, Preis und Titel
            # können so vom Menschen direkt in derselben Zeile geprüft werden.
            costs = cost_rows_from_positions(positions)
        # Visuell werden nur Kostenzusammenstellung, Konditionsseiten und
        # konkrete Parser-Konflikte geprüft — nie nochmals das ganze PDF.
        review = build_review_packet(features, costs, positions)
        review_pages = {
            p["page"] for p in (
                pipeline.cost_summary_pages + pipeline.conditions_pages
            ) if p.get("page")
        }
        review_pages.update(
            (features.get(key) or {}).get("source_page")
            for key in LV_IMPORT_FEATURE_KEYS
            if (features.get(key) or {}).get("confidence") == "low"
            and (features.get(key) or {}).get("source_page")
        )
        for check in review["deterministic_checks"]:
            if check.get("severity") != "warning":
                continue
            review_pages.update(
                f.get("source_page") for f in features.values()
                if isinstance(f, dict) and f.get("source_page")
            )
        if pipeline.extraction_method == "image" and not review_pages:
            # Ohne Textebene sind nur ein kleiner Anfangs-/Endseiten-Sample
            # vertretbar; der Import bleibt andernfalls zur manuellen Prüfung.
            all_pages = list(range(1, pipeline.page_count + 1))
            review_pages.update(
                all_pages if len(all_pages) <= 6 else all_pages[:2] + all_pages[-4:]
            )
        review_pages = sorted(review_pages)[:12]
        budget = ImportLlmBudget.from_env()
        visual = (
            visual_review.review(
                raw, page_numbers=review_pages, budget=budget,
                parser_context={
                    "features": review["packet"]["features"],
                    "costs": review["packet"]["costs"],
                    "checks": review["packet"]["checks"],
                },
            )
            if review_pages else {
                "called": False, "success": True, "attempts": 0, "result": {},
                "issues": [], "reviewed_pages": [], **budget.status(),
                **visual_review.status(),
            }
        )
        visual_apply = {
            "visual_review_features_applied": 0,
            "visual_review_costs_applied": 0,
            "visual_review_warnings": [],
        }
        if visual["success"] and visual.get("result"):
            visual_costs, visual_apply = visual_review.apply_result(
                features, visual["result"],
            )
            # Ein fehlerfreier Parser bleibt Kostenquelle. KI-Kosten ersetzen ihn
            # nur, wenn Positionen/Summen fehlen oder widersprüchlich sind.
            summary_invalid = (
                not has_cost_summary(summary)
                or any(
                    item.get("validation_status") != "valid"
                    for item in (summary.get("group_totals") or {}).values()
                )
            )
            if summary_invalid and visual_costs:
                costs = visual_costs
            commercial_result = visual_apply.get("commercial") or {}
            for item in commercial_result.get("conditions") or []:
                db.add(LvImportCondition(
                    lv_import_id=imp.id,
                    original_label=str(item.get("label") or "")[:255],
                    kind=item["kind"], direction=item["direction"],
                    rate_percent=item.get("rate_percent"),
                    amount=item.get("amount"), basis_amount=item.get("basis_amount"),
                    calculated_amount=item.get("calculated_amount"),
                    running_total=item.get("running_total"),
                    order_index=int(item.get("order") or 0),
                    source_page=item.get("source_page"),
                ))
        # Erst nach der autoritativen visuellen Auswertung offene Titel gegen
        # das geschlossene Norm-LV auflösen.
        llm_stat = llm.apply_to_rows(costs, budget=budget)
        # ALLE kanonischen Features anlegen (auch nicht erkannte) → der Nutzer
        # sieht die vollständige Checkliste und kann fehlende Werte ergänzen.
        for key in LV_IMPORT_FEATURE_KEYS:
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
                section_path=c.get("section_path"),
                canonical_key=c.get("canonical_key"),
                original_amount=c.get("detected_amount"),
                mapping_method=c.get("mapping_method"),
                mapping_confidence=c.get("mapping_confidence"),
                mapping_reason=c.get("mapping_reason"),
                is_group_total=bool(c.get("is_group_total", False)),
                validation_status=c.get("validation_status"),
                source=c.get("source"),
                detected_amount=c.get("detected_amount"), confidence=c.get("confidence"),
                source_page=c.get("source_page"), source_text=c.get("source_text"),
                positionen=c.get("positionen", 1),
            ))
        # Punkt 25/30 — Verarbeitungsbericht: was wurde erkannt, was muss geprüft
        # werden. Speist die Import-Zusammenfassung und den Debug-Dump.
        erkannte = [
            k for k in LV_IMPORT_FEATURE_KEYS
            if (features.get(k) or {}).get("value") is not None
        ]
        pruefen = [c["bkp_nr"] for c in costs if not c.get("canonical_key")
                   and not c.get("is_group_total")]
        imp.debug_json = json.dumps({
            **pipeline.debug_dump(),
            "cost_source": (
                "cost_summary" if has_cost_summary(summary)
                else "visual_ai_pdf" if visual["success"]
                else "lv_positions"
            ),
            "features_erkannt": len(erkannte),
            "features_total": len(LV_IMPORT_FEATURE_KEYS),
            "feature_keys_erkannt": erkannte,
            "kostenpositionen": len([c for c in costs if not c.get("is_group_total")]),
            "gruppentotale": len([c for c in costs if c.get("is_group_total")]),
            "kosten_ohne_zuordnung": len(pruefen),
            "llm_positions_sent": llm_stat["sent"],
            "llm_positions_mapped": llm_stat["mapped"],
            "parser_first": True,
            "llm_review_characters": review["characters"],
            "llm_review_estimated_tokens": review["estimated_tokens"],
            "llm_review_positions_sent": review["positions_sent"],
            "deterministic_checks": review["deterministic_checks"],
            "parsed_positions": len(positions),
            "visual_review_called": visual["called"],
            "visual_review_success": visual["success"],
            "visual_review_attempts": visual["attempts"],
            "visual_review_issues": visual["issues"],
            "visual_review_pages": visual.get("reviewed_pages") or [],
            **budget.status(),
            **visual_review.status(),
            **visual_apply,
            **llm.status(),
            "gruppen_validierung": {
                g: i.get("validation_status")
                for g, i in (summary.get("group_totals") or {}).items()},
            "trade_total": summary.get("trade_total"),
            "commercial": visual_apply.get("commercial") or {},
            "projekt_erkannt": sorted(projekt.keys()),
        }, ensure_ascii=False)
        quality_ready = visual["success"] or not visual_review.required()
        imp.status = (
            LvImportStatus.review.value
            if quality_ready else LvImportStatus.extracted.value
        )
    except Exception as exc:
        imp.status = LvImportStatus.failed.value
        imp.debug_json = json.dumps({
            **pipeline.debug_dump(),
            "parser_first": False,
            "error_stage": "extract_and_normalize",
            "error_type": type(exc).__name__,
            "error": str(exc)[:400],
            **visual_review.status(),
        }, ensure_ascii=False)

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


@router.get("/norm-lv")
def norm_lv_positionen(user: User = Depends(get_current_user)):
    """Das Norm-LV als geschlossene Auswahlliste für die manuelle Zuordnung.
    Muss VOR `/{import_id}` stehen."""
    return {**norm_lv.as_frontend(), **llm.status()}


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
             "canonical_label": norm_lv.norm_label(c.canonical_key) if c.canonical_key else None,
             "mapping_method": c.mapping_method,
             "mapping_confidence": c.mapping_confidence,
             "mapping_reason": c.mapping_reason,
             "mapping_confirmed": bool(c.mapping_confirmed),
             "is_group_total": bool(c.is_group_total),
             "validation_status": c.validation_status,
             "detected_amount": c.detected_amount,
             "confirmed_amount": c.confirmed_amount, "source_page": c.source_page}
            for c in imp.costs
        ],
        # Konfiguration des Resolvers — nie Schlüssel, nur Zustand.
        "llm": {**llm.status(),
                "llm_positions_sent": report.get("llm_positions_sent"),
                "llm_positions_mapped": report.get("llm_positions_mapped")},
        "report": report,
    }


@router.post("/{import_id}/map-costs")
def map_costs(import_id: int, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    """KI-Zuordnung für noch offene Kostenpositionen erneut ausführen (Punkt 19).

    Bearbeitet ausschliesslich Positionen mit mapping_confirmed = false und ohne
    bestehende Zuordnung — bestätigte Entscheidungen des Nutzers werden nie
    überschrieben. Ist die KI nicht verfügbar, ist das kein Fehler: die Antwort
    sagt es, der Import bleibt unverändert nutzbar."""
    imp = _get_import(db, user, import_id)
    if imp.status == LvImportStatus.approved.value:
        raise HTTPException(status_code=409, detail="Import ist bereits freigegeben")

    offen = [c for c in imp.costs
             if not c.is_group_total and not c.canonical_key
             and not c.mapping_confirmed and (c.original_title or "")]
    zeilen = [{"original_position": c.original_position, "bkp_nr": c.bkp_nr,
               "original_title": c.original_title, "canonical_key": None,
               "mapping_confirmed": False, "is_group_total": False}
              for c in offen]
    stat = llm.apply_to_rows(zeilen)
    for c, z in zip(offen, zeilen):
        if z.get("mapping_method") or z.get("mapping_reason"):
            c.canonical_key = z.get("canonical_key")
            c.mapping_method = z.get("mapping_method")
            c.mapping_confidence = z.get("mapping_confidence")
            c.mapping_reason = z.get("mapping_reason")
            # mapping_confirmed bleibt bewusst unberührt — nur der Mensch bestätigt.
    db.commit()
    db.refresh(imp)
    return {"import": _import_out(imp, detail=True), **stat, **llm.status()}


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
    # Manuelle Zuordnung ins Norm-LV. Nur Schlüssel aus der geschlossenen Liste;
    # "" bzw. None hebt die Zuordnung auf.
    if "canonical_key" in body:
        key = body["canonical_key"]
        if key in (None, ""):
            c.canonical_key, c.mapping_method = None, None
            c.mapping_confidence, c.mapping_reason = None, "manuell entfernt"
        elif norm_lv.ist_norm_position(key):
            c.canonical_key = key
            c.mapping_method = norm_lv.MANUAL
            c.mapping_confidence = 1.0
            c.mapping_reason = "manuell zugeordnet"
            c.mapping_confirmed = True        # bewusst gewählt = geprüft
        else:
            raise HTTPException(status_code=422, detail={
                "message": "Unbekannte Norm-LV-Position.",
                "canonical_key": key,
            })
    # Betrag geprüft (confirmed) und Zuordnung geprüft (mapping_confirmed) sind
    # zwei verschiedene Aussagen und werden getrennt gesetzt.
    if "confirmed" in body:
        c.confirmed = bool(body["confirmed"])
    if "mapping_confirmed" in body:
        c.mapping_confirmed = bool(body["mapping_confirmed"])
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
                 "offert_datum", "gewerk", "waehrung"):
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
    report = _report(imp)
    if report.get("visual_review_required") and not report.get("visual_review_success"):
        raise HTTPException(status_code=409, detail={
            "message": "Das LV ist noch nicht freigabebereit. Die visuelle "
                       "PDF-Auswertung muss zuerst widerspruchsfrei abgeschlossen werden.",
            "visual_review_issues": report.get("visual_review_issues") or [],
        })

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

    # Zweites, getrenntes Gate: die Norm-LV-Zuordnung. „Betrag stimmt" heisst
    # nicht „Zuordnung stimmt". Bei einer Position ohne Norm-Entsprechung wird
    # damit die bewusste Ausnahme bestätigt — sonst würde ihr Betrag stillschweigend
    # aus der Referenz fallen.
    zuordnung_offen = [
        (c.original_position or c.bkp_nr) for c in imp.costs
        if not c.is_group_total and _cost_effective(c) is not None
        and not c.mapping_confirmed
    ]
    if zuordnung_offen:
        raise HTTPException(status_code=422, detail={
            "message": "Bitte für jede Kostenposition die Norm-LV-Zuordnung prüfen "
                       "(zuordnen oder von der Referenz ausschliessen).",
            "unconfirmed_mappings": zuordnung_offen,
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

    # Referenzkosten enthalten AUSSCHLIESSLICH Positionen mit bestätigter
    # Norm-LV-Zuordnung. Damit sieht ein Import genauso aus wie ein normal nach
    # dem Norm-LV ausgewertetes Projekt — keine halbstandardisierten Gruppenzeilen
    # für Leistungen, die es im Norm-LV nicht gibt.
    #
    # Punkt 14 — mehrere Originalpositionen auf derselben Norm-Position werden zu
    # EINER Zeile summiert. Eine manuelle Projektauswertung erfasst je Norm-
    # Position ebenfalls einen Gesamtbetrag; drei Zeilen „243.5" wären ein anderes
    # Datenformat als der Bestand. Die Originalzeilen bleiben unverändert in
    # LvImportCost erhalten.
    aggregiert: dict[str, dict] = {}
    for c in imp.costs:
        if c.is_group_total or not c.canonical_key or not c.mapping_confirmed:
            continue
        betrag = _cost_effective(c)
        if betrag is None:
            continue
        eintrag = aggregiert.setdefault(c.canonical_key, {"betrag": 0.0, "quellen": []})
        eintrag["betrag"] += float(betrag)
        eintrag["quellen"].append(c.original_position or c.bkp_nr)

    for key, eintrag in sorted(aggregiert.items()):
        db.add(RefKostenzeile(
            tenant_id=user.tenant_id, ref_projekt_id=ref.id, gewerk="heizung",
            bkp_nr=key,
            bkp_name=norm_lv.NORM_BY_KEY[key]["bezeichnung"],
            betrag_chf=round(eintrag["betrag"], 2),
        ))

    imp.status = LvImportStatus.approved.value
    imp.ref_projekt_id = ref.id
    db.commit()
    db.refresh(imp)
    return {"import": _import_out(imp, detail=True), "ref_projekt_id": ref.id,
            "uebernommene_features": {k: v for k, v in eff.items() if v not in (None, "")},
            "feature_mapping": FEATURE_TO_CONTEXT}
