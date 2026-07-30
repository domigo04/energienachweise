"""Visuelle, verifizierte LV-Auswertung mit dem vollständigen PDF.

Viele ausgefüllte Unternehmer-LVs enthalten überlagerte Formularwerte. Der
extrahierte Text kann dadurch z.B. ``118500`` enthalten, obwohl auf der Seite
sichtbar ``150`` steht. Diese Stufe gibt deshalb dem gerenderten Seitenbild
Vorrang, prüft alle Summen deterministisch und startet bei Widersprüchen genau
einen Korrekturdurchgang. Nur ein widerspruchsfreies Resultat darf in den
Freigabe-Status gelangen.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any

from app.lv_import import norm_lv
from app.lv_import.feature_keys import FEATURE_DEFS, FEATURE_KEYS

DEFAULT_MODEL = "gpt-5.6"
MIN_FEATURE_CONFIDENCE = 0.75
TOLERANCE_CHF = 1.0

SYSTEM_PROMPT = """Du bist ein erfahrener Schweizer HLK-Fachplaner und liest
ein vollständiges Heizungs-LV wie ein Mensch. Werte IMMER die sichtbar
gerenderte PDF-Seite aus. Unsichtbarer/überlagerter PDF-Text ist nur ein
Hinweis; wenn Text und Seitenbild widersprechen, gewinnt der sichtbare Wert.

Ermittle technische Gesamtmengen (Rohrmeter, Pumpen, Ventile,
Fussbodenheizungsverteiler, Wärmezähler, Speicher, Erzeuger und Erdsonden)
sowie alle Kosten aus der Kostenzusammenstellung. Unterscheide Stückzahl,
Abmessung, Leistung, Einheitspreis und Positionsbetrag. Erwähnungen in
Fliesstext oder technischen Daten sind keine bestellten Stückzahlen.

Beispiel: sichtbar «Länge/Sonde 150 m» und «Total Sonden 6» bedeutet 6
Erdsonden, 150 m je Sonde und 900 m total. Erfasse bei Kosten jede
Einzelposition, jedes ausgewiesene BKP-Gruppentotal und das Gewerktotal.
Erfinde nichts; fehlende Werte bleiben null. Liefere Seite und kurzen
sichtbaren Beleg. Schweizer Apostrophe sind Tausendertrennzeichen."""

_NULLABLE_NUMBER = {"anyOf": [{"type": "number"}, {"type": "null"}]}
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": FEATURE_KEYS},
                    "value": {"anyOf": [
                        {"type": "number"}, {"type": "string"}, {"type": "null"},
                    ]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "source_page": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "evidence": {"type": "string"},
                    "reason": {"type": "string"},
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
                    "evidence": {"type": "string"},
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
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["features", "costs", "group_totals", "trade_total", "warnings"],
    "additionalProperties": False,
}


def enabled() -> bool:
    return os.getenv("LV_VISUAL_REVIEW_ENABLED", "true").strip().lower() not in {
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


def validate(result: dict) -> list[str]:
    """Prüft Geldsummen, Dubletten und technisch unmögliche Mengen."""
    issues: list[str] = []
    costs = result.get("costs") or []
    groups = result.get("group_totals") or []
    if not costs:
        issues.append("Keine Einzelkosten aus der Kostenzusammenstellung erkannt.")
    if not groups:
        issues.append("Keine BKP-Gruppentotale erkannt.")
    if _number(result.get("trade_total")) is None:
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


def _call(client, pdf_bytes: bytes, model: str, correction: str | None = None) -> dict:
    task = (
        "Lies das gesamte angehängte LV visuell aus. Die Kostenzusammenstellung "
        "ist für Preise maßgeblich. Gib den vollständigen strukturierten Datensatz zurück."
    )
    if correction:
        task += (
            "\n\nDer erste Durchgang war rechnerisch widersprüchlich. Lies die "
            "betroffenen Seiten erneut visuell und liefere den kompletten korrigierten "
            f"Datensatz. Fehler:\n{correction}"
        )
    encoded = base64.b64encode(pdf_bytes).decode("ascii")
    response = client.responses.create(
        model=model,
        timeout=float(os.getenv("LV_VISUAL_REVIEW_TIMEOUT_SECONDS", "180")),
        store=False,
        reasoning={"effort": os.getenv("LV_VISUAL_REVIEW_REASONING", "high")},
        max_output_tokens=int(os.getenv("LV_VISUAL_REVIEW_MAX_OUTPUT_TOKENS", "12000")),
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
    try:
        parsed = json.loads(_response_text(response))
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def review(pdf_bytes: bytes, *, client=None, model: str | None = None) -> dict:
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
    model = model or config["visual_review_model"]
    result: dict = {}
    issues: list[str] = []
    attempts = 0
    try:
        attempts = 1
        result = _call(client, pdf_bytes, model)
        issues = validate(result)
        if issues:
            attempts = 2
            correction = "\n".join(f"- {issue}" for issue in issues)
            result = _call(client, pdf_bytes, model, correction)
            issues = validate(result)
    except Exception as exc:
        issues = [f"{type(exc).__name__}: {str(exc)[:300]}"]
    return {
        "called": attempts > 0,
        "success": bool(result and not issues),
        "attempts": attempts,
        "result": result,
        "issues": issues,
        **config,
    }


def apply_result(features: dict, result: dict) -> tuple[list[dict], dict]:
    """Visuell belegte Werte überschreiben den unzuverlässigen PDF-Textparser."""
    applied = 0
    for item in result.get("features") or []:
        key = item.get("key")
        value = item.get("value")
        confidence = _number(item.get("confidence")) or 0
        if key not in FEATURE_KEYS or value is None or confidence < MIN_FEATURE_CONFIDENCE:
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
        "visual_review_features_applied": applied,
        "visual_review_costs_applied": len(result.get("costs") or []),
        "visual_review_trade_total": result.get("trade_total"),
        "visual_review_warnings": [
            str(w)[:300] for w in (result.get("warnings") or [])[:30]
        ],
    }
