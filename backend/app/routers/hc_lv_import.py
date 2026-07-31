"""LV-/Submission-Import (B2, B9, B11).

Aus einem alten Unternehmer-LV entsteht ein geprüfter technischer Fingerprint +
reale BKP-Kosten. Ablauf: Upload → Extraktion → Review/Korrektur → Freigabe.
Erst die Freigabe übernimmt Daten in die Referenzstruktur (RefProjekt); nicht
freigegebene Imports rechnen NIE in der Kostenschätzung mit.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import Role, User
from app.models.lv_import import (
    LvImport, LvImportFeature, LvImportCost, LvImportCondition, LvImportStatus,
    LvImportSystem,
)
from app.models.kv import (
    RefProjekt, RefKostenzeile, RefProjektFeature, RefProjektGewerk,
)
from app.lv_import.pipeline import LvPipeline
from app.lv_import.feature_extract import extract_features
from app.lv_import.cost_extract import cost_rows_from_positions
from app.lv_import.cost_summary import parse_cost_summary, to_cost_rows, has_cost_summary
from app.lv_import.project_extract import extract_project_data
from app.lv_import import commercial, norm_lv
from app.lv_import.llm import resolver as llm
from app.lv_import import commercial, conditions_extract, systems
from app.deps.feature_guard import require_feature
from app.plan_features import Feature
from app.services import features as feature_service
from app import fachwerte
from app.lv_import.feature_keys import (
    ABGELEITETE_FEATURE_KEYS, FEATURE_DEFS, LV_IMPORT_FEATURE_KEYS,
    FEATURE_TO_CONTEXT,
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


def _als_text(wert):
    return None if wert in (None, "") else str(wert)[:255]


def _system_out(s: LvImportSystem) -> dict:
    return {
        "id": s.id, "kind": s.kind, "type_code": s.type_code,
        "label": fachwerte.label(
            "heat_delivery_types" if s.kind == systems.HEAT_EMISSION else "generator_types",
            s.type_code,
        ),
        "source_label": s.source_label, "count": s.count,
        "capacity_kw": s.capacity_kw, "manufacturer": s.manufacturer, "model": s.model,
        "supplied_by": s.supplied_by, "installation_by": s.installation_by,
        "scope_status": s.scope_status, "existing_or_new": s.existing_or_new,
        "confidence": s.confidence, "source_page": s.source_page,
        "source_text": s.source_text, "confirmed": s.confirmed,
    }


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
        # Handschriftliche Korrektur: beide Stände bleiben sichtbar, damit im
        # Review nachvollziehbar ist, was gedruckt stand und was von Hand kam.
        "printed_value": f.printed_value, "corrected_value": f.corrected_value,
        "selected_source": f.selected_source,
        "requires_review": bool(f.requires_review),
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
        # Quellhierarchie getrennt vom Ziel — die Quellnummer ist NICHT die
        # Norm-LV-Nummer.
        "source_parent_bkp": c.source_parent_bkp,
        "source_scope_summary": c.source_scope_summary,
        "included_norm_keys": [
            k for k in (c.included_norm_keys or "").split(",") if k
        ],
        "included_norm_labels": [
            norm_lv.norm_label(k) for k in (c.included_norm_keys or "").split(",") if k
        ],
        "amount_allocation": c.amount_allocation,
        "requires_review": bool(c.requires_review),
        "effective_amount": _cost_effective(c),
    }


def _condition_out(c: LvImportCondition) -> dict:
    return {
        "id": c.id, "original_label": c.original_label, "kind": c.kind,
        "direction": c.direction, "rate_percent": c.rate_percent,
        "amount": c.amount, "basis_amount": c.basis_amount,
        "calculated_amount": c.calculated_amount,
        "running_total": c.running_total, "order": c.order_index,
        "source_page": c.source_page,
        # «Anfrage» ist kein Abzug von null, sondern eine offene Position.
        "status": c.status or "priced",
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
        base["conditions"] = [
            _condition_out(c)
            for c in sorted(imp.conditions, key=lambda x: x.order_index)
        ]
        base["systems"] = [_system_out(s) for s in imp.systems]
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
    user: User = Depends(require_feature(Feature.LV_IMPORT.value)),
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
        if projekt.get("project_type"):
            imp.projektart = projekt["project_type"]["value"]
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
            costs = cost_rows_from_positions(
                positions,
                trust_detected_amounts=pipeline.extraction_method != "ocr",
            )
        # Visuell werden nur Kostenzusammenstellung, Konditionsseiten und
        # konkrete Parser-Konflikte geprüft — nie nochmals das ganze PDF.
        review = build_review_packet(features, costs, positions)
        summary_invalid = (
            not has_cost_summary(summary)
            or any(
                item.get("validation_status") != "valid"
                for item in (summary.get("group_totals") or {}).values()
            )
        )
        # Gut geparste Kosten werden nicht nochmals als Seitenbild an OpenAI
        # gesendet. Nur bei einem echten Summenkonflikt kommen die Kosten-
        # zusammenstellungsseiten dazu. Konditionen werden im ganzen bereits
        # geparsten Dokument gesucht, damit z.B. die Rabattseite 2 nicht wegen
        # einer abweichenden Seitenklasse verloren geht.
        priority_review_pages = {
            p["page"] for p in pipeline.cost_summary_pages
            if summary_invalid and p.get("page")
        }
        commercial_review_pages = visual_review.select_commercial_review_pages(
            pipeline.pages, max_pages=2,
        )
        priority_review_pages.update(commercial_review_pages)
        if summary_invalid:
            priority_review_pages.update(
                visual_review.select_cost_review_pages(
                    pipeline.pages, max_pages=3,
                )
            )
        # Der Projektkopf wird im selben sparsamen Visual-Review-Aufruf geprüft.
        # Kein zusätzlicher API-Call; höchstens die erste Deckblattseite kommt
        # zum bereits kleinen Seitenpaket hinzu.
        priority_review_pages.update(
            p["page"] for p in pipeline.grunddaten_pages[:1] if p.get("page")
        )
        technical_review_pages = visual_review.select_technical_review_pages(
            pipeline.technik_pages, features,
        )
        review_pages = set(priority_review_pages)
        review_pages.update(
            (features.get(key) or {}).get("source_page")
            for key in LV_IMPORT_FEATURE_KEYS
            if (features.get(key) or {}).get("confidence") == "low"
            and (features.get(key) or {}).get("source_page")
        )
        # Vollständig fehlende Kennwerte hatten bisher keine source_page und
        # gelangten deshalb nie zur visuellen KI-Prüfung. Aus den bereits
        # geparsten Technikseiten werden dafür wenige starke Stichworttreffer
        # ergänzt; das PDF wird nicht nochmals ausgelesen.
        review_pages.update(technical_review_pages)
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
        prioritized = sorted(priority_review_pages)
        review_pages = (
            prioritized
            + [page for page in technical_review_pages if page not in priority_review_pages]
            + [page for page in sorted(review_pages)
               if page not in priority_review_pages and page not in technical_review_pages]
        )[:8]
        budget = ImportLlmBudget.from_env()
        # Trennung der beiden Stufen: `lv_import` deckt Upload, Parser und
        # Review ab, `lv_ai_review` zusätzlich jede kostenpflichtige
        # LLM-Auswertung. Fehlt die zweite, bleibt der Import trotzdem nutzbar.
        ki_erlaubt = (
            user.role == Role.admin
            or feature_service.get_effective_feature(
                db, user.tenant_id, Feature.LV_AI_REVIEW.value
            ).enabled
        )
        if not ki_erlaubt:
            review_pages = []
        visual = (
            visual_review.review(
                raw, page_numbers=review_pages, budget=budget,
                parser_context={
                    "features": review["packet"]["features"],
                    "costs": (
                        review["packet"]["costs"] if summary_invalid else []
                    ),
                    "trade_total": summary.get("trade_total"),
                    "checks": review["packet"]["checks"],
                    "costs_valid": not summary_invalid,
                },
                require_costs=summary_invalid,
                # Der zweite visuelle Call übertrug bisher dieselben hoch-
                # aufgelösten PDF-Seiten nochmals. Bei korrekten Parserkosten
                # bleibt ein unsicherer KI-Wert stattdessen manuell prüfbar.
                allow_correction=summary_invalid,
            )
            if review_pages else {
                "called": False, "success": True, "attempts": 0, "result": {},
                "issues": [], "reviewed_pages": [], **budget.status(),
                **visual_review.status(),
            }
        )
        vorhandene_konditionen = 0
        konditionen_quelle = "keine"
        visual_apply = {
            "visual_review_features_applied": 0,
            "visual_review_costs_applied": 0,
            "visual_review_warnings": [],
        }
        if visual.get("result"):
            if (
                visual["result"].get("trade_total") is None
                and summary.get("trade_total") is not None
            ):
                visual["result"]["trade_total"] = summary["trade_total"]
            visual_costs, visual_apply = visual_review.apply_result(
                features, visual["result"],
            )
            visual_project = visual_apply.get("project_data") or {}
            for field, attr in (
                ("project_name", "projekt_name"),
                ("project_number", "projekt_nummer"),
                ("location", "ort"),
                ("contractor", "unternehmer"),
                ("offer_date", "offert_datum"),
            ):
                if visual_project.get(field):
                    setattr(imp, attr, visual_project[field])
            for field, attr, registry in (
                ("building_use", "gebaeudetyp", "building_uses"),
                ("project_type", "projektart", "project_types"),
            ):
                code = fachwerte.normalize(registry, visual_project.get(field))
                if code:
                    setattr(imp, attr, code)
            # Ein fehlerfreier Parser bleibt Kostenquelle. KI-Kosten ersetzen ihn
            # nur, wenn Positionen/Summen fehlen oder widersprüchlich sind.
            visual_costs_complete = bool(
                visual_costs
                and (visual.get("result") or {}).get("group_totals")
                and (visual.get("result") or {}).get("trade_total") is not None
            )
            if summary_invalid and visual_costs_complete:
                # Ein kleiner Summenkonflikt (typisch: schwer lesbare
                # Handschrift) darf nicht dazu führen, dass wir stattdessen
                # offensichtlich falsche OCR-Zahlen aus Detailseiten zeigen.
                # Die visuell gelesenen Werte bleiben sichtbar, aber der ganze
                # Satz bleibt bis zur Bestätigung ein Prüffall.
                if not visual["success"]:
                    for row in visual_costs:
                        row["requires_review"] = True
                        row["confidence"] = "medium"
                        row["validation_status"] = "mismatch"
                costs = visual_costs
            commercial_result = visual_apply.get("commercial") or {}
            vorhandene_konditionen = len(commercial_result.get("conditions") or [])
            if vorhandene_konditionen:
                konditionen_quelle = "visual_ai_pdf"
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
                    status=item.get("status") or "priced",
                ))
        # Konditionen: der Text wird IMMER deterministisch gelesen. Bisher gab
        # es dafür nur die visuelle KI-Prüfung — ohne Schlüssel oder nach einem
        # Timeout blieb die Konditionsliste leer und die Bruttosumme auf 0,
        # obwohl Rabatt, Skonto und MWST lesbar im Dokument stehen. Die KI
        # ergänzt jetzt nur noch, was der Parser nicht gefunden hat.
        kommerzielle_nummern = set(commercial_review_pages)
        konditionen_seiten = [
            page for page in pipeline.pages
            if page.get("page") in kommerzielle_nummern
        ]
        konditionen_seiten += [
            page for page in pipeline.cost_summary_pages
            if page.get("page") not in {p.get("page") for p in konditionen_seiten}
        ]
        konditionen_seiten = konditionen_seiten or pipeline.pages[-3:]
        geparste_konditionen = conditions_extract.parse_conditions(konditionen_seiten)
        if not vorhandene_konditionen and conditions_extract.has_conditions(geparste_konditionen):
            basis = geparste_konditionen["base_amount"]
            if basis is None:
                basis = summary.get("trade_total")
            kette, konditions_hinweise = commercial.validate(
                basis, geparste_konditionen["conditions"],
                geparste_konditionen["vat_rate"], None,
                geparste_konditionen["stated_vat_amount"],
                geparste_konditionen["stated_total_incl_vat"],
            )
            for item in kette.get("conditions") or []:
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
                    status=item.get("status") or "priced",
                ))
            vorhandene_konditionen = len(kette.get("conditions") or [])
            # Auch ohne visuellen Review muss die komplette berechnete Kette im
            # Report landen; sonst zeigt das UI zwar Konditionszeilen, aber
            # keine Abzüge, MWST und Endsumme an.
            visual_apply["commercial"] = kette
            konditionen_quelle = "parser"
        else:
            konditions_hinweise = []

        # Erst nach der autoritativen visuellen Auswertung offene Titel gegen
        # das geschlossene Norm-LV auflösen.
        llm_stat = (
            llm.apply_to_rows(costs, budget=budget) if ki_erlaubt
            else {"sent": 0, "mapped": 0}
        )
        # Ein Import zählt als EIN Vorgang, auch wenn er intern mehrere
        # LLM-Aufrufe macht. Gezählt wird erst, wenn tatsächlich einer lief.
        if ki_erlaubt and budget.calls > 0:
            feature_service.zaehle_nutzung(
                db, user.tenant_id, Feature.LV_AI_REVIEW.value,
                amount=budget.estimated_cost_usd or None,
            )
        feature_service.zaehle_nutzung(db, user.tenant_id, Feature.LV_IMPORT.value)
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
                printed_value=_als_text((f or {}).get("printed_value")),
                corrected_value=_als_text((f or {}).get("corrected_value")),
                selected_source=(f or {}).get("selected_source"),
                requires_review=bool((f or {}).get("requires_review", False)),
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
                source_parent_bkp=c.get("source_parent_bkp")
                or (str(c.get("bkp_nr") or "").split(".")[0] or None),
                source_scope_summary=c.get("source_scope_summary"),
                included_norm_keys=c.get("included_norm_keys"),
                amount_allocation=c.get("amount_allocation"),
                requires_review=bool(c.get("requires_review", False)),
            ))
        # Anlagensysteme: Wärmeabgabe und Wärmeerzeugung. Der Parser findet sie
        # in born-digital LVs, die visuelle Prüfung in Scans — beide Wege enden
        # in derselben Struktur.
        visuelle_systeme = systems.filter_visual_generators_by_page_evidence(
            visual_apply.get("systems") or [], pipeline.pages,
            text_available=pipeline.extraction_method != "image",
        )
        systeme = systems.merge(
            systems.detect(pipeline.technik_pages, systems.HEAT_EMISSION)
            + systems.detect(pipeline.technik_pages, systems.HEAT_GENERATION),
            visuelle_systeme,
        )
        for eintrag in systeme:
            db.add(LvImportSystem(lv_import_id=imp.id, **eintrag))
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
                else "visual_ai_pdf" if visual_apply.get("visual_review_costs_applied")
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
            "visual_review_focused_pages": visual.get("focused_pages") or [],
            "systeme_waermeabgabe": len(systems.delivery_codes(systeme)),
            "systeme_waermeerzeugung": len(systems.generator_codes(systeme)),
            "handschrift_offen": len(visual_apply.get("handwritten_open") or []),
            "konditionen_erkannt": vorhandene_konditionen,
            "konditionen_quelle": konditionen_quelle,
            "konditionen_hinweise": konditions_hinweise,
            "kosten_pruefen": len([c for c in costs if c.get("requires_review")]),
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
def map_costs(import_id: int, user: User = Depends(require_feature(Feature.LV_AI_REVIEW.value)),
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
    # Abgeleitete Werte sind Ergebnisse, keine Eingaben. Wer sie von Hand setzen
    # könnte, erzeugte eine dritte Zahl neben Anzahl und Länge.
    if f.key in ABGELEITETE_FEATURE_KEYS and "confirmed_value" in body:
        raise HTTPException(status_code=422, detail={
            "code": "FEATURE_IS_DERIVED",
            "message": ("Die Bohrmeter werden aus Anzahl und Länge je Bohrung "
                        "berechnet und können nicht direkt gesetzt werden."),
        })
    if "confirmed_value" in body:
        cv = body["confirmed_value"]
        f.confirmed_value = None if cv in (None, "") else str(cv)
    if "confirmed" in body:
        f.confirmed = bool(body["confirmed"])
    db.flush()
    # Ändert sich Anzahl oder Länge, gilt sofort die neue Multiplikation.
    abgeleitet = bohrmeter_neu_berechnen(imp) if f.key in BOHR_EINGABEN else None
    db.commit()
    return {**_feature_out(f),
            "derived": _feature_out(abgeleitet) if abgeleitet is not None else None}


# Eingaben, aus denen die Bohrmeter entstehen.
BOHR_EINGABEN = ("borehole_count", "borehole_length_each_m")


def bohrmeter_neu_berechnen(imp: LvImport):
    """Bohrmeterzeile eines Imports aus den geltenden Eingaben nachziehen."""
    def wert(key):
        zeile = next((x for x in imp.features if x.key == key), None)
        if zeile is None:
            return None
        roh = zeile.confirmed_value if zeile.confirmed_value not in (None, "") else zeile.value
        try:
            return float(roh) if roh not in (None, "") else None
        except (TypeError, ValueError):
            return None

    anzahl, laenge = wert("borehole_count"), wert("borehole_length_each_m")
    ziel = next((x for x in imp.features if x.key == "borehole_total_m"), None)
    if ziel is None or anzahl is None or laenge is None:
        return ziel
    gerechnet = round(anzahl * laenge, 2)
    ziel.value = str(gerechnet)
    ziel.confirmed_value = None
    ziel.derived_from = f"Berechnet aus {anzahl:g} Bohrungen × {laenge:g} m"
    ziel.confidence = "high"
    ziel.requires_review = False
    return ziel


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


@router.put("/{import_id}/commercial")
def update_commercial(
    import_id: int, body: dict,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Rabatt, Skonto und sonstige Konditionen im Review ersetzen/rechnen."""
    imp = _get_import(db, user, import_id)
    if imp.status == LvImportStatus.approved.value:
        raise HTTPException(status_code=409, detail="Freigegebener Import ist gesperrt")

    report = _report(imp)
    raw_conditions = body.get("conditions")
    if not isinstance(raw_conditions, list) or len(raw_conditions) > 30:
        raise HTTPException(status_code=422, detail="Ungültige Konditionsliste")

    def optional_number(value, label):
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail=f"Ungültiger Wert: {label}")

    normalized: list[dict] = []
    for index, item in enumerate(raw_conditions):
        kind = item.get("kind")
        direction = item.get("direction")
        if kind not in {"percent", "fixed"}:
            raise HTTPException(status_code=422, detail="Typ muss Prozent oder Fixbetrag sein")
        if direction not in {"deduction", "surcharge"}:
            raise HTTPException(status_code=422, detail="Richtung muss Abzug oder Zuschlag sein")
        label = str(item.get("original_label") or item.get("label") or "").strip()
        if not label:
            label = "Sonstiger Abzug" if direction == "deduction" else "Sonstiger Zuschlag"
        rate = optional_number(item.get("rate_percent"), f"{label} Prozent")
        amount = optional_number(item.get("amount"), f"{label} Betrag")
        basis = optional_number(item.get("basis_amount"), f"{label} Basis")
        if kind == "percent" and rate is None:
            raise HTTPException(status_code=422, detail=f"Prozentsatz fehlt: {label}")
        if kind == "fixed" and amount is None:
            raise HTTPException(status_code=422, detail=f"Fixbetrag fehlt: {label}")
        normalized.append({
            "label": label[:255], "kind": kind, "direction": direction,
            "rate_percent": rate, "amount": amount, "basis_amount": basis,
            "order": index + 1, "source_page": item.get("source_page"),
        })

    base_amount = report.get("trade_total")
    if base_amount is None:
        einzel = [
            _cost_effective(c) for c in imp.costs
            if not c.is_group_total and _cost_effective(c) is not None
        ]
        gruppen = [
            _cost_effective(c) for c in imp.costs
            if c.is_group_total and _cost_effective(c) is not None
        ]
        base_amount = sum(einzel) if einzel else (sum(gruppen) if gruppen else None)
    vat_rate = optional_number(
        body.get(
            "vat_rate",
            (report.get("commercial") or {}).get("vat_rate"),
        ),
        "MWST",
    )
    calculated = commercial.calculate_chain(base_amount, normalized, vat_rate)

    for condition in list(imp.conditions):
        db.delete(condition)
    db.flush()
    for item in calculated.get("conditions") or []:
        db.add(LvImportCondition(
            lv_import_id=imp.id, original_label=item["label"],
            kind=item["kind"], direction=item["direction"],
            rate_percent=item.get("rate_percent"), amount=item.get("amount"),
            basis_amount=item.get("basis_amount"),
            calculated_amount=item.get("calculated_amount"),
            running_total=item.get("running_total"),
            order_index=int(item.get("order") or 0),
            source_page=item.get("source_page"),
        ))
    report["trade_total"] = base_amount
    report["commercial"] = calculated
    imp.debug_json = json.dumps(report, ensure_ascii=False)
    db.commit()
    rows = (
        db.query(LvImportCondition)
        .filter(LvImportCondition.lv_import_id == imp.id)
        .order_by(LvImportCondition.order_index)
        .all()
    )
    return {
        "conditions": [_condition_out(c) for c in rows],
        "commercial": calculated,
    }


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


def _system_registry(kind: str) -> str:
    if kind == systems.HEAT_EMISSION:
        return "heat_delivery_types"
    if kind == systems.HEAT_GENERATION:
        return "generator_types"
    raise HTTPException(status_code=422, detail="Unbekannte Anlagenart")


def _apply_system_body(row: LvImportSystem, body: dict) -> None:
    if "kind" in body:
        row.kind = str(body["kind"])
    registry = _system_registry(row.kind)
    if "type_code" in body:
        code = fachwerte.normalize(registry, body["type_code"])
        if not code:
            raise HTTPException(status_code=422, detail="Unbekannter Anlagentyp")
        row.type_code = code
    for field in ("source_label", "manufacturer", "model", "source_text"):
        if field in body:
            value = body[field]
            setattr(row, field, None if value in (None, "") else str(value)[:300])
    for field in ("count", "source_page"):
        if field in body:
            try:
                setattr(row, field, None if body[field] in (None, "") else int(float(body[field])))
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail=f"Ungültiger Wert für {field}")
    if "capacity_kw" in body:
        try:
            row.capacity_kw = None if body["capacity_kw"] in (None, "") else float(body["capacity_kw"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Ungültige Leistung")
    for field, allowed in (
        ("supplied_by", {"contractor", "others"}),
        ("installation_by", {"contractor", "others"}),
        ("existing_or_new", {"existing", "new"}),
    ):
        if field in body:
            value = body[field]
            if value not in (None, "") and value not in allowed:
                raise HTTPException(status_code=422, detail=f"Ungültiger Wert für {field}")
            setattr(row, field, value or None)
    if "scope_status" in body:
        value = body["scope_status"]
        code = fachwerte.normalize("scope_status", value) if value not in (None, "") else None
        if value not in (None, "") and not code:
            raise HTTPException(status_code=422, detail="Ungültiger Leistungsumfang")
        row.scope_status = code
    if "confirmed" in body:
        row.confirmed = bool(body["confirmed"])
    # Bei FBH ist nur «vorhanden» relevant. Alte oder manuell mitgesendete
    # Mengen/Leistungen dürfen nicht wieder in die Review-Daten gelangen.
    if row.kind == systems.HEAT_EMISSION and row.type_code == "fbh":
        row.count = None
        row.capacity_kw = None


@router.post("/{import_id}/systems")
def add_system(import_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    imp = _get_import(db, user, import_id)
    if imp.status == LvImportStatus.approved.value:
        raise HTTPException(status_code=409, detail="Freigegebener Import ist gesperrt")
    row = LvImportSystem(lv_import_id=imp.id, kind=str(body.get("kind") or ""),
                         type_code="", confirmed=True, confidence=1.0)
    _apply_system_body(row, body)
    if not row.type_code:
        raise HTTPException(status_code=422, detail="Anlagentyp fehlt")
    db.add(row)
    db.commit()
    db.refresh(row)
    return _system_out(row)


@router.patch("/{import_id}/systems/{system_id}")
def update_system(import_id: int, system_id: int, body: dict,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    imp = _get_import(db, user, import_id)
    if imp.status == LvImportStatus.approved.value:
        raise HTTPException(status_code=409, detail="Freigegebener Import ist gesperrt")
    row = db.query(LvImportSystem).filter(
        LvImportSystem.id == system_id, LvImportSystem.lv_import_id == imp.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Anlagensystem nicht gefunden")
    _apply_system_body(row, body)
    db.commit()
    return _system_out(row)


@router.delete("/{import_id}/systems/{system_id}")
def delete_system(import_id: int, system_id: int,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    imp = _get_import(db, user, import_id)
    if imp.status == LvImportStatus.approved.value:
        raise HTTPException(status_code=409, detail="Freigegebener Import ist gesperrt")
    row = db.query(LvImportSystem).filter(
        LvImportSystem.id == system_id, LvImportSystem.lv_import_id == imp.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Anlagensystem nicht gefunden")
    db.delete(row)
    db.commit()
    return {"deleted": True}


def _parse_offer_date(value: str | None):
    raw = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


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
    systeme_offen = [s.id for s in imp.systems if not s.confirmed]
    if systeme_offen:
        raise HTTPException(status_code=422, detail={
            "message": "Bitte alle Anlagensysteme prüfen, korrigieren oder entfernen.",
            "unconfirmed_systems": systeme_offen,
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

    system_dicts = [{
        "kind": s.kind, "type_code": s.type_code, "scope_status": s.scope_status,
        "capacity_kw": s.capacity_kw,
    } for s in imp.systems]
    # Neue Importe verwenden ausschliesslich die geprüfte Anlagenliste. Der
    # Einzelwert `generator_type` bleibt nur als Altimport-Fallback erhalten.
    erzeuger = systems.generator_codes(system_dicts)
    if not imp.systems:
        erzeuger = fachwerte.normalize_list("generator_types", eff.get("generator_types"))
        if not erzeuger and eff.get("generator_type"):
            erzeuger = fachwerte.normalize_list("generator_types", eff["generator_type"])
    # Wärmeabgabe kommt aus der Systemtabelle — dort liegt sie seit der
    # Mehrfacherfassung mit Anzahl und Lieferant. Das frühere Sammelmerkmal
    # `heat_delivery_types` wird nicht mehr gefüllt; ohne diesen Weg bliebe die
    # Abgabe im Referenzprojekt leer und fehlte im Ähnlichkeitsscore.
    abgabe = systems.reference_delivery_types(system_dicts)
    if not imp.systems:
        legacy_systems = [{
            "kind": systems.HEAT_EMISSION,
            "type_code": code,
            "scope_status": "included",
        } for code in fachwerte.normalize_list(
            "heat_delivery_types", eff.get("heat_delivery_types")
        )]
        abgabe = systems.reference_delivery_types(legacy_systems)

    generator_power = num("generator_power_kw")
    if generator_power is None:
        capacities = [
            float(s["capacity_kw"]) for s in system_dicts
            if s["kind"] == systems.HEAT_GENERATION
            and s["type_code"] in erzeuger and s.get("capacity_kw") is not None
        ]
        generator_power = sum(capacities) if capacities else None
    bww_in_heating = (
        str(eff.get("fresh_water_station_present") or "").lower()
        in {"true", "1", "ja", "yes"}
        or any(c.mapping_confirmed and c.canonical_key in {"243.10", "243.11"}
               for c in imp.costs)
    )

    ref = RefProjekt(
        tenant_id=user.tenant_id, erstellt_von=user.id,
        name=imp.projekt_name or f"LV-Import: {imp.filename}",
        installierte_leistung_neu_kw=generator_power,
        heizleistung_kw=generator_power,
        waermeerzeuger=erzeuger,
        waermeabgabe=abgabe,
        # Hybrid ist kein gewählter Erzeuger, sondern abgeleitet (Punkt 7).
        anlagenkonfiguration=("hybrid" if fachwerte.ist_hybrid(erzeuger)
                              else "monovalent" if len(erzeuger) == 1 else None),
        # Projektgrunddaten aus dem Review (Item 6 / Punkt 20) — kanonische Codes.
        ebf_m2=imp.ebf_m2, anzahl_einheiten=imp.anzahl_einheiten,
        gebaeudetyp=imp.gebaeudetyp, projektart=imp.projektart,
        zertifizierung=imp.zertifizierung,
        datum=_parse_offer_date(imp.offert_datum),
        bww_bei_heizung=bww_in_heating,
    )
    # Legacy-Spalten aus dem EINEN zentralen Mapping befüllen (Rückwärts-
    # kompatibilität zur bestehenden Ähnlichkeit, die noch Spalten liest).
    from app.lv_import.feature_keys import REFPROJEKT_COLUMN_TO_FEATURE
    for column, feature_key in REFPROJEKT_COLUMN_TO_FEATURE.items():
        v = num(feature_key)
        if v is None:
            continue
        setattr(ref, column, v)
    db.add(ref)
    db.flush()

    # Rabatt und Skonto auch in die bestehende Referenzstruktur übernehmen.
    # Die vollständige Konditionskette bleibt am verknüpften LvImport erhalten.
    rabatt = skonto = 0.0
    for condition in imp.conditions:
        label = (condition.original_label or "").casefold()
        if condition.kind != "percent" or condition.direction != "deduction":
            continue
        if "rabatt" in label:
            rabatt = float(condition.rate_percent or 0)
        elif "skonto" in label:
            skonto = float(condition.rate_percent or 0)
    ref.gewerke.append(RefProjektGewerk(
        tenant_id=user.tenant_id, gewerk="heizung",
        rabatt_pct=rabatt, skonto_pct=skonto,
    ))

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
