"""Sparsame visuelle LV-Auswertung nur für ausgewählte Problemseiten.

Viele ausgefüllte Unternehmer-LVs enthalten überlagerte Formularwerte. Der
extrahierte Text kann dadurch z.B. ``118500`` enthalten, obwohl auf der Seite
sichtbar ``150`` steht. Diese Stufe gibt deshalb dem gerenderten Seitenbild
Vorrang, prüft alle Summen deterministisch und startet bei Widersprüchen genau
einen Korrekturdurchgang. Nur ein widerspruchsfreies Resultat darf in den
Freigabe-Status gelangen.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import unicodedata
from typing import Any

from app.lv_import import commercial, norm_lv
from app.lv_import.feature_keys import LV_IMPORT_FEATURE_KEYS
from app.lv_import.llm.budget import (
    ImportLlmBudget, enabled as global_enabled, timeout_seconds,
)

DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_REASONING = "medium"
MIN_FEATURE_CONFIDENCE = 0.75
TOLERANCE_CHF = 1.0

SYSTEM_PROMPT = """Du bist ein erfahrener Schweizer HLK-Fachplaner. Du erhältst
nur gezielt ausgewählte Problem-, Kosten- oder Konditionsseiten eines bereits
geparsten Heizungs-LV. Werte die sichtbar gerenderte Seite aus. Unsichtbarer
oder überlagerter PDF-Text ist nur ein
Hinweis; wenn Text und Seitenbild widersprechen, gewinnt der sichtbare Wert.

Ermittle nur grobe Kennwerte, bepreiste Kostenpositionen und kommerzielle
Konditionen. Lies zusätzlich den sichtbaren Projektkopf: Projektname,
Projektnummer, Ort, Unternehmer und Offertdatum. Fehlende Kopfangaben bleiben
null. Bei den technischen Kennwerten sind besonders wichtig:
Wärmeerzeugertyp und Heizleistung in kW; Anzahl, Länge je Sonde und
Gesamtbohrmeter der Erdsonden; Rohrmeter total ohne Fussbodenheizungsrohre,
dabei die Rohrmeter aus BKP 241.11 (Primärkreis) und BKP 243.1
(Wärmeverteilung) addieren;
Anzahl technische Pufferspeicher, Pumpen und Wärmemessungen/Wärmezähler.
Prüfe jeden im Schema erlaubten technischen Schlüssel; wenn der sichtbare
Nachweis fehlt, gib dafür null zurück statt den Schlüssel still auszulassen.
Für `generator_type` sind nur diese Codes zulässig: `ews_wp` für
Sole/Wasser- oder Erdsonden-WP, `lwwp` für Luft/Wasser-WP, `wasser_wp` nur für
Grundwasser/Wasser-Wasser-WP, ferner `co2_wp`, `fernwaerme`, `holz`, `elektro`
oder `sonstige`. Eine generische Wärmepumpe ist niemals automatisch
`wasser_wp`. Addiere Rohrmeter nur, wenn die sichtbaren Mengen eindeutig sind.
Keine Schrauben, Bögen, Schellen,
Rohrmeter je Dimension oder anderen unbezahlten Einzelmengen als separate
Kostenpositionen. Pauschalen nie künstlich aufteilen.

Beispiel: sichtbar «Länge/Sonde 150 m» und «Total Sonden 6» bedeutet 6
Erdsonden, 150 m je Sonde und 900 m total. Erfasse bei Kosten nur bepreiste
Haupt-/Unterpositionen, Gruppentotale und Gewerktotal. Konditionen bleiben
getrennt. Lies Rabatt, Skonto, weitere prozentuale oder fixe Abzüge/Zuschläge
sowie MWST vollständig. Übernimm bei jeder Kondition den sichtbar ausgewiesenen
Prozentsatz, Betrag und die Berechnungsbasis, soweit vorhanden. Erfinde nichts;
fehlende Werte bleiben null. Belege kurz."""

_TECHNICAL_PAGE_TERMS = {
    "generator": (
        "heizleistung", "nennleistung", "warmeleistung", "warmepumpe",
        "warmeerzeuger", "leistungsbereich",
    ),
    "boreholes": (
        "erdsonde", "erdsonden", "erdwarmesonde", "bohrmeter",
        "sondenlange", "lange sonde",
    ),
    "pipe": (
        "241.11", "primärkreis", "primaerkreis", "243.1 rohrleitungen", "rohrmeter",
        "laufmeter", "rohrleitung", "rohrleitungen", "lfm",
    ),
    "pumps": (
        "pumpe", "pumpen", "umwalzpumpe", "heizkreispumpe", "ladepumpe",
    ),
    "meters": (
        "warmemessung", "warmemessungen", "warmezahler",
        "warmwasserzahler",
    ),
    "storage": (
        "pufferspeicher", "technikspeicher", "technischer speicher",
        "heizungsspeicher", "energiespeicher",
    ),
}
_TECHNICAL_PAGE_FEATURES = {
    "generator": ("generator_type", "generator_power_kw"),
    "boreholes": (
        "borehole_count", "borehole_length_each_m", "borehole_total_m",
    ),
    "pipe": ("pipe_length_m",),
    "pumps": ("pump_count",),
    "meters": ("heat_meter_count",),
    "storage": ("buffer_count",),
}
_COMMERCIAL_PAGE_TERMS = (
    "rabatt", "skonto", "abzug", "abzuge", "zuschlag", "baureinigung",
    "bauwasser", "bauwesenversicherung", "baureklame", "mehrwertsteuer",
    "mwst", "nettosumme", "endsumme",
)

_NULLABLE_NUMBER = {"anyOf": [{"type": "number"}, {"type": "null"}]}
_NULLABLE_STRING = {"anyOf": [{"type": "string"}, {"type": "null"}]}
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "project_data": {
            "type": "object",
            "properties": {
                "project_name": _NULLABLE_STRING,
                "project_number": _NULLABLE_STRING,
                "location": _NULLABLE_STRING,
                "contractor": _NULLABLE_STRING,
                "offer_date": _NULLABLE_STRING,
            },
            "required": [
                "project_name", "project_number", "location", "contractor",
                "offer_date",
            ],
            "additionalProperties": False,
        },
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": LV_IMPORT_FEATURE_KEYS},
                    "value": {"anyOf": [
                        {"type": "number"}, {"type": "string"},
                        {"type": "boolean"}, {"type": "null"},
                    ]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "source_page": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "evidence": {"type": "string", "maxLength": 160},
                    "reason": {"type": "string", "maxLength": 80},
                },
                "required": [
                    "key", "value", "confidence", "source_page", "evidence", "reason",
                ],
                "additionalProperties": False,
            },
        },
        "costs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "position": {"type": "string"},
                    "bkp_group": {"type": "string"},
                    "title": {"type": "string"},
                    "amount": {"type": "number", "minimum": 0},
                    "source_page": {"type": "integer"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "evidence": {"type": "string", "maxLength": 160},
                },
                "required": [
                    "position", "bkp_group", "title", "amount", "source_page",
                    "confidence", "evidence",
                ],
                "additionalProperties": False,
            },
        },
        "group_totals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "bkp_group": {"type": "string"},
                    "title": {"type": "string"},
                    "amount": {"type": "number", "minimum": 0},
                    "source_page": {"type": "integer"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "bkp_group", "title", "amount", "source_page", "confidence",
                ],
                "additionalProperties": False,
            },
        },
        "trade_total": _NULLABLE_NUMBER,
        "conditions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "kind": {"type": "string", "enum": ["percent", "fixed"]},
                    "direction": {
                        "type": "string", "enum": ["deduction", "surcharge"],
                    },
                    "rate_percent": _NULLABLE_NUMBER,
                    "amount": _NULLABLE_NUMBER,
                    "basis_amount": _NULLABLE_NUMBER,
                    "order": {"type": "integer"},
                    "source_page": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                },
                "required": [
                    "label", "kind", "direction", "rate_percent", "amount",
                    "basis_amount", "order", "source_page",
                ],
                "additionalProperties": False,
            },
        },
        "vat_rate": _NULLABLE_NUMBER,
        "stated_subtotal_excl_vat": _NULLABLE_NUMBER,
        "stated_vat_amount": _NULLABLE_NUMBER,
        "stated_total_incl_vat": _NULLABLE_NUMBER,
        "warnings": {
            "type": "array",
            "items": {"type": "string", "maxLength": 160},
        },
    },
    "required": [
        "project_data", "features", "costs", "group_totals", "trade_total", "conditions",
        "vat_rate", "stated_subtotal_excl_vat", "stated_vat_amount",
        "stated_total_incl_vat", "warnings",
    ],
    "additionalProperties": False,
}


def enabled() -> bool:
    return global_enabled() and os.getenv(
        "LV_VISUAL_REVIEW_ENABLED", "true",
    ).strip().lower() not in {
        "0", "false", "no", "off", "nein",
    }


def required() -> bool:
    return enabled() and os.getenv(
        "LV_VISUAL_REVIEW_REQUIRED", "true",
    ).strip().lower() not in {"0", "false", "no", "off", "nein"}


def status() -> dict:
    active = enabled()
    key_ok = bool(os.getenv("OPENAI_API_KEY"))
    return {
        "visual_review_enabled": active,
        "visual_review_required": required(),
        "visual_review_model": os.getenv("LV_VISUAL_REVIEW_MODEL", DEFAULT_MODEL),
        "visual_review_reasoning": os.getenv(
            "LV_VISUAL_REVIEW_REASONING", DEFAULT_REASONING,
        ),
        "visual_review_available": bool(active and key_ok),
        "visual_review_reason": (
            "bereit" if active and key_ok
            else "OPENAI_API_KEY fehlt" if active
            else "deaktiviert"
        ),
    }


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return re.sub(r"\s+", " ", "".join(
        char for char in normalized if not unicodedata.combining(char)
    ).casefold())


def select_technical_review_pages(
    pages: list[dict], features: dict, *, max_pages: int = 8,
) -> list[int]:
    """Wählt wenige bereits geparste Seiten für vollständig fehlende Kennwerte.

    Zuerst gelangt je fehlender Merkmalsgruppe der stärkste Texttreffer in die
    visuelle Prüfung, danach füllen die stärksten weiteren Treffer das kleine
    Gesamtbudget. Damit werden keine eindeutigen Seiten erneut gesendet und ein
    vollständig fehlender Parserwert kann trotzdem von der KI gelesen werden.
    """
    selected: list[int] = []
    ranked_by_group: dict[str, list[tuple[int, int]]] = {}
    for group, keys in _TECHNICAL_PAGE_FEATURES.items():
        # Je Fachgruppe die stärkste Seite prüfen. Ein scheinbar plausibler
        # Parserwert kann aus Standardtext statt aus dem Ausmass stammen.
        needs_review = True
        if not needs_review:
            continue
        ranked: list[tuple[int, int]] = []
        for page in pages or []:
            page_number = page.get("page")
            if not page_number:
                continue
            text = _fold(page.get("text") or "")
            score = sum(text.count(term) for term in _TECHNICAL_PAGE_TERMS[group])
            if score:
                ranked.append((score, int(page_number)))
        if ranked:
            ranked_by_group[group] = sorted(
                ranked, key=lambda item: (-item[0], item[1]),
            )

    # Zuerst jede fehlende Merkmalsgruppe abdecken, damit z.B. Wärmemessungen
    # nicht durch viele Rohrseiten aus dem Seitenbudget verdrängt werden.
    for ranked in ranked_by_group.values():
        page_number = ranked[0][1]
        if page_number not in selected:
            selected.append(page_number)
        if len(selected) >= max_pages:
            return selected

    # Restplätze gehen an die stärksten weiteren Treffer, unabhängig von der
    # Gruppe. Das erlaubt zusätzliche Rohrseiten, ohne andere Kennwerte zu
    # verlieren.
    extras = sorted(
        (item for ranked in ranked_by_group.values() for item in ranked[1:]),
        key=lambda item: (-item[0], item[1]),
    )
    for _, page_number in extras:
        if page_number not in selected:
            selected.append(page_number)
        if len(selected) >= max_pages:
            break
    return selected


def select_commercial_review_pages(
    pages: list[dict], *, max_pages: int = 4,
) -> list[int]:
    """Begrenzt allgemeine Bedingungsseiten auf echte Konditionsfundstellen."""
    ranked: list[tuple[int, int]] = []
    for page in pages or []:
        page_number = page.get("page")
        if not page_number:
            continue
        text = _fold(page.get("text") or "")
        score = sum(text.count(term) for term in _COMMERCIAL_PAGE_TERMS)
        if score:
            ranked.append((score, int(page_number)))
    return [
        page for _, page in sorted(ranked, key=lambda item: (-item[0], item[1]))
        [:max_pages]
    ]


def validate(result: dict, *, require_costs: bool = True) -> list[str]:
    """Prüft Geldsummen, Dubletten und technisch unmögliche Mengen."""
    issues: list[str] = []
    costs = result.get("costs") or []
    groups = result.get("group_totals") or []
    if require_costs and not costs:
        issues.append("Keine Einzelkosten aus der Kostenzusammenstellung erkannt.")
    if require_costs and not groups:
        issues.append("Keine BKP-Gruppentotale erkannt.")
    if require_costs and _number(result.get("trade_total")) is None:
        issues.append("Gewerktotal fehlt.")

    positions = [str(c.get("position") or "").strip() for c in costs]
    duplicates = sorted({p for p in positions if p and positions.count(p) > 1})
    if duplicates:
        issues.append(f"Doppelte Kostenpositionen: {', '.join(duplicates[:10])}.")

    group_by_nr = {
        str(g.get("bkp_group") or "").strip(): _number(g.get("amount"))
        for g in groups
    }
    for nr, total in group_by_nr.items():
        parts = [
            _number(c.get("amount")) for c in costs
            if str(c.get("bkp_group") or "").strip() == nr
        ]
        parts = [p for p in parts if p is not None]
        if total is None or not parts:
            issues.append(f"BKP {nr}: Total oder Einzelpositionen fehlen.")
        elif abs(sum(parts) - total) > TOLERANCE_CHF:
            issues.append(
                f"BKP {nr}: Einzelpositionen {sum(parts):.2f} stimmen nicht "
                f"mit Total {total:.2f} überein."
            )
    trade_total = _number(result.get("trade_total"))
    valid_group_totals = [v for v in group_by_nr.values() if v is not None]
    if trade_total is not None and valid_group_totals:
        group_sum = sum(valid_group_totals)
        if abs(group_sum - trade_total) > TOLERANCE_CHF:
            issues.append(
                f"Gruppentotale {group_sum:.2f} stimmen nicht mit "
                f"Gewerktotal {trade_total:.2f} überein."
            )

    feature_values = {
        f.get("key"): _number(f.get("value"))
        for f in (result.get("features") or [])
    }
    count = feature_values.get("borehole_count")
    each = feature_values.get("borehole_length_each_m")
    total = feature_values.get("borehole_total_m")
    if count is not None and (count < 0 or count > 200):
        issues.append(f"Unplausible Erdsondenanzahl {count:g}.")
    if each is not None and (each < 10 or each > 1000):
        issues.append(f"Unplausible Länge je Erdsonde {each:g} m.")
    if count is not None and each is not None and total is not None:
        if abs(count * each - total) > max(1.0, total * 0.01):
            issues.append(
                f"Erdsondenrechnung {count:g} × {each:g} m ≠ {total:g} m."
            )
    _, condition_issues = commercial.validate(
        trade_total, result.get("conditions") or [], _number(result.get("vat_rate")),
        _number(result.get("stated_subtotal_excl_vat")),
        _number(result.get("stated_vat_amount")),
        _number(result.get("stated_total_incl_vat")),
    )
    issues.extend(condition_issues)
    return issues


def _response_text(response) -> str:
    direct = getattr(response, "output_text", None)
    if direct:
        return direct
    for output in getattr(response, "output", None) or []:
        for content in getattr(output, "content", None) or []:
            text = getattr(content, "text", None)
            if text:
                return text
    return ""


def _selected_pdf(pdf_bytes: bytes, page_numbers: list[int] | None) -> bytes:
    """Erzeugt für den API-Aufruf ein PDF nur mit den ausgewählten Seiten."""
    if not page_numbers:
        return pdf_bytes
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        for number in sorted(set(page_numbers)):
            if 1 <= number <= len(reader.pages):
                writer.add_page(reader.pages[number - 1])
        target = io.BytesIO()
        writer.write(target)
        return target.getvalue() if len(writer.pages) else pdf_bytes
    except Exception:
        return pdf_bytes


def _call(
    client, pdf_bytes: bytes, model: str, budget: ImportLlmBudget,
    correction: str | None = None, original_pages: list[int] | None = None,
    parser_context: dict | None = None,
) -> dict:
    task = (
        "Prüfe nur die angehängten ausgewählten Seiten. Gib den kleinen "
        "strukturierten Datensatz zurück."
    )
    if original_pages:
        page_map = ", ".join(
            f"Teil-PDF {index} = Originalseite {page}"
            for index, page in enumerate(sorted(set(original_pages)), start=1)
        )
        task += f" Verwende bei source_page die Originalseitennummer. Zuordnung: {page_map}."
    if parser_context:
        if parser_context.get("costs_valid"):
            task += (
                "\nDie Kostenpositionen und BKP-Summen sind bereits "
                "deterministisch validiert. Gib costs und group_totals leer "
                "zurück und prüfe nur Technik sowie Konditionen/Endsumme."
            )
        task += (
            "\nKompaktes Parserresultat zum Prüfen:\n"
            + json.dumps(parser_context, ensure_ascii=False, separators=(",", ":"))
        )
    if correction:
        task += (
            "\n\nDer erste Durchgang war rechnerisch widersprüchlich. Lies die "
            "betroffenen Seiten erneut visuell und liefere den kompletten korrigierten "
            f"Datensatz. Fehler:\n{correction}"
        )
    encoded = base64.b64encode(pdf_bytes).decode("ascii")
    estimated_input = max(500, len(pdf_bytes) // 80 + len(task) // 4)
    if not budget.may_call(estimated_input):
        return {}
    reasoning = os.getenv("LV_VISUAL_REVIEW_REASONING", DEFAULT_REASONING)
    budget.start_call(model=model, reasoning=reasoning)
    response = client.responses.create(
        model=model,
        timeout=timeout_seconds(),
        store=os.getenv("LV_LLM_STORE_RESPONSES", "false").strip().lower() in {
            "1", "true", "yes", "on",
        },
        reasoning={"effort": reasoning},
        max_output_tokens=budget.max_output_tokens,
        input=[
            {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": [
                {
                    "type": "input_file", "filename": "leistungsverzeichnis.pdf",
                    "file_data": f"data:application/pdf;base64,{encoded}",
                    "detail": "high",
                },
                {"type": "input_text", "text": task},
            ]},
        ],
        text={"format": {
            "type": "json_schema", "name": "lv_visual_review",
            "strict": True, "schema": RESPONSE_SCHEMA,
        }},
    )
    budget.record(response, estimated_input_tokens=estimated_input)
    try:
        parsed = json.loads(_response_text(response))
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def review(
    pdf_bytes: bytes, *, page_numbers: list[int] | None = None, client=None,
    model: str | None = None, budget: ImportLlmBudget | None = None,
    parser_context: dict | None = None, require_costs: bool = True,
    allow_correction: bool = True,
) -> dict:
    """Visuelle Auswertung plus höchstens ein automatischer Korrekturdurchgang."""
    config = status()
    if client is None and not config["visual_review_available"]:
        return {"called": False, "success": False, "attempts": 0,
                "result": {}, "issues": [config["visual_review_reason"]], **config}
    if not enabled():
        return {"called": False, "success": False, "attempts": 0,
                "result": {}, "issues": ["Visuelle Prüfung deaktiviert."], **config}
    if client is None:
        import openai
        client = openai.OpenAI()
    budget = budget or ImportLlmBudget.from_env()
    model = model or config["visual_review_model"]
    selected_pdf = _selected_pdf(pdf_bytes, page_numbers)
    result: dict = {}
    issues: list[str] = []
    attempts = 0
    try:
        result = _call(
            client, selected_pdf, model, budget, original_pages=page_numbers,
            parser_context=parser_context,
        )
        attempts = budget.calls
        issues = validate(result, require_costs=require_costs)
        if (
            issues and allow_correction
            and budget.may_call(max(500, len(selected_pdf) // 80))
        ):
            correction = "\n".join(f"- {issue}" for issue in issues)
            result = _call(
                client, selected_pdf, model, budget, correction,
                original_pages=page_numbers, parser_context=parser_context,
            )
            attempts = budget.calls
            issues = validate(result, require_costs=require_costs)
    except Exception as exc:
        issues = [f"{type(exc).__name__}: {str(exc)[:300]}"]
    return {
        "called": attempts > 0,
        "success": bool(result and not issues),
        "attempts": attempts,
        "result": result,
        "issues": issues,
        "reviewed_pages": sorted(set(page_numbers or [])),
        **budget.status(),
        **config,
    }


def apply_result(features: dict, result: dict) -> tuple[list[dict], dict]:
    """Visuell belegte Werte überschreiben den unzuverlässigen PDF-Textparser."""
    applied = 0
    for item in result.get("features") or []:
        key = item.get("key")
        value = item.get("value")
        confidence = _number(item.get("confidence")) or 0
        if key not in LV_IMPORT_FEATURE_KEYS or value is None or confidence < MIN_FEATURE_CONFIDENCE:
            continue
        if key == "generator_type":
            from app import fachwerte
            value = fachwerte.normalize("generator_types", value)
            if not value:
                continue
        evidence = str(item.get("evidence") or "")[:300]
        features[key] = {
            "value": value,
            "confidence": "high" if confidence >= 0.9 else "medium",
            "source_page": item.get("source_page"),
            "source_text": evidence,
            "source_excerpt": evidence,
            "derived_from": f"Visuelle KI-PDF-Prüfung: {str(item.get('reason') or '')[:240]}",
        }
        applied += 1

    count = _number((features.get("borehole_count") or {}).get("value"))
    each = _number((features.get("borehole_length_each_m") or {}).get("value"))
    if count is not None and each is not None:
        features["borehole_total_m"] = {
            "value": round(count * each, 2), "confidence": "high",
            "source_page": (features.get("borehole_count") or {}).get("source_page"),
            "source_text": f"{count:g} Erdsonden × {each:g} m",
            "source_excerpt": f"{count:g} × {each:g} m = {count * each:g} m",
            "derived_from": "Deterministisch aus visuell geprüfter Anzahl und Länge",
        }

    rows: list[dict] = []
    costs_by_group: dict[str, list[dict]] = {}
    for item in result.get("costs") or []:
        group = str(item.get("bkp_group") or "").strip()
        amount = round(float(item["amount"]), 2)
        title = str(item.get("title") or "").strip()
        mapping = norm_lv.match_title(title, group)
        row = {
            "bkp_nr": group,
            "original_position": str(item.get("position") or "").strip(),
            "original_title": title,
            "detected_amount": amount,
            "confidence": "high",
            "source_page": item.get("source_page"),
            "source_text": str(item.get("evidence") or "")[:300],
            "positionen": 1, "is_group_total": False,
            "validation_status": "valid",
            "source": "visual_ai_pdf",
            **mapping,
        }
        rows.append(row)
        costs_by_group.setdefault(group, []).append(row)
    for item in result.get("group_totals") or []:
        group = str(item.get("bkp_group") or "").strip()
        amount = round(float(item["amount"]), 2)
        part_sum = round(sum(r["detected_amount"] for r in costs_by_group.get(group, [])), 2)
        rows.append({
            "bkp_nr": group, "original_position": None,
            "original_title": str(item.get("title") or f"Total BKP {group}"),
            "canonical_key": None,
            "detected_amount": amount, "confidence": "high",
            "source_page": item.get("source_page"),
            "source_text": f"Visuell geprüft; Einzelpositionen = CHF {part_sum:,.2f}",
            "positionen": len(costs_by_group.get(group, [])),
            "is_group_total": True, "validation_status": "valid",
            "source": "visual_ai_pdf",
        })
    return rows, {
        "project_data": {
            key: (str(value).strip()[:200] if value not in (None, "") else None)
            for key, value in (result.get("project_data") or {}).items()
            if key in {
                "project_name", "project_number", "location", "contractor",
                "offer_date",
            }
        },
        "visual_review_features_applied": applied,
        "visual_review_costs_applied": len(result.get("costs") or []),
        "visual_review_trade_total": result.get("trade_total"),
        "commercial": commercial.validate(
            _number(result.get("trade_total")), result.get("conditions") or [],
            _number(result.get("vat_rate")),
            _number(result.get("stated_subtotal_excl_vat")),
            _number(result.get("stated_vat_amount")),
            _number(result.get("stated_total_incl_vat")),
        )[0],
        "visual_review_warnings": [
            str(w)[:300] for w in (result.get("warnings") or [])[:30]
        ],
    }
