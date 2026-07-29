"""Tokenarme KI-Normalisierung des deterministisch vorverarbeiteten LVs.

Das Modell erhält keine PDF-Datei, sondern höchstens 120 Positionszeilen mit
Nummer, Titel, Menge, Einheit, Positionsbetrag und Parser-Kandidaten. Es darf
nur fehlende Werte vorschlagen; sichere Parserwerte und menschliche Freigaben
werden nie überschrieben.
"""
from __future__ import annotations

import json
import os
from typing import Any

from app.lv_import.feature_keys import FEATURE_DEFS, FEATURE_KEYS

MIN_CONFIDENCE = 0.75
DEFAULT_OPENAI_MODEL = "gpt-5.6"

SYSTEM_PROMPT = """Du prüfst ein bereits geparstes Schweizer Heizungs-LV.
Normalisiere nur Werte, die aus den gelieferten Positionen eindeutig belegbar
sind: Rohrmeter, Pumpen, 2-/3-Weg-Ventile, Abgleichventile, Wärmezähler,
Fussbodenheizungsverteiler, Speicher, Wärmeerzeuger und Preise. Verwende nur
erlaubte Feature-Schlüssel und existierende Positions-IDs. Erfinde nichts.
Positionsbetrag bedeutet Total dieser Position, nicht Einheitspreis. Bei
Unsicherheit keinen Wert liefern und stattdessen eine kurze Warnung ausgeben."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "features": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": FEATURE_KEYS},
                    "value": {"anyOf": [{"type": "number"}, {"type": "string"}, {"type": "null"}]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "source_ids": {"type": "array", "items": {"type": "string"}},
                    "reason": {"type": "string"},
                },
                "required": ["key", "value", "confidence", "source_ids", "reason"],
                "additionalProperties": False,
            },
        },
        "costs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "amount": {"anyOf": [{"type": "number"}, {"type": "null"}]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "reason": {"type": "string"},
                },
                "required": ["source_id", "amount", "confidence", "reason"],
                "additionalProperties": False,
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["features", "costs", "warnings"],
    "additionalProperties": False,
}


def enabled() -> bool:
    return os.getenv("LV_REVIEW_LLM_ENABLED", "true").strip().lower() not in {
        "0", "false", "no", "off", "nein",
    }


def _provider_name() -> str | None:
    explicit = os.getenv("LV_REVIEW_LLM_PROVIDER")
    if explicit:
        return explicit.strip().lower()
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"):
        return "anthropic"
    return None


def status() -> dict:
    provider = _provider_name()
    model = os.getenv("LV_REVIEW_LLM_MODEL") or os.getenv("COST_MAPPING_LLM_MODEL")
    if provider == "openai":
        model = model or DEFAULT_OPENAI_MODEL
        key_ok = bool(os.getenv("OPENAI_API_KEY"))
        reason = "bereit" if key_ok else "OPENAI_API_KEY fehlt"
    elif provider == "anthropic":
        key_ok = bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
        reason = "bereit" if key_ok and model else (
            "LV_REVIEW_LLM_MODEL fehlt" if key_ok else "ANTHROPIC_API_KEY fehlt"
        )
    else:
        key_ok = False
        reason = "OPENAI_API_KEY oder ANTHROPIC_API_KEY fehlt"
    aktiv = enabled()
    return {
        "llm_review_enabled": aktiv,
        "llm_review_provider": provider,
        "llm_review_model": model,
        "llm_review_available": bool(aktiv and key_ok and model),
        "llm_review_reason": reason if aktiv else "LV_REVIEW_LLM_ENABLED=false",
    }


def _prompt(packet: dict) -> str:
    allowed = {
        key: {
            "label": definition["label"],
            "type": definition["typ"],
            "unit": definition.get("einheit"),
        }
        for key, definition in FEATURE_DEFS.items()
    }
    return json.dumps(
        {"allowed_features": allowed, "parsed_lv": packet},
        ensure_ascii=False, separators=(",", ":"),
    )


def _parse(text: str) -> dict:
    try:
        value = json.loads(text)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def review(packet: dict, *, provider: str | None = None, model: str | None = None, client=None) -> dict:
    """Ein gebündelter Structured-Output-Aufruf. Jeder Fehler ist soft-fail."""
    config = status()
    provider = provider or config["llm_review_provider"]
    model = model or config["llm_review_model"]
    if client is None and not config["llm_review_available"]:
        return {"called": False, "result": {}, **config}
    if not provider or not model:
        return {"called": False, "result": {}, **config}
    try:
        if provider == "openai":
            if client is None:
                import openai
                client = openai.OpenAI()
            response = client.chat.completions.create(
                model=model,
                timeout=30.0,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _prompt(packet)},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "lv_document_review",
                        "strict": True,
                        "schema": RESPONSE_SCHEMA,
                    },
                },
            )
            message = response.choices[0].message
            if getattr(message, "refusal", None):
                return {"called": True, "result": {}, **config}
            result = _parse(getattr(message, "content", "") or "")
        elif provider == "anthropic":
            if client is None:
                import anthropic
                client = anthropic.Anthropic()
            response = client.messages.create(
                model=model,
                timeout=30.0,
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                output_config={"effort": "low", "format": {
                    "type": "json_schema", "schema": RESPONSE_SCHEMA,
                }},
                messages=[{"role": "user", "content": _prompt(packet)}],
            )
            text = next(
                (block.text for block in (response.content or [])
                 if getattr(block, "type", None) == "text"),
                "",
            )
            result = _parse(text)
        else:
            result = {}
    except Exception:
        result = {}
    return {"called": True, "result": result, **config}


def apply_result(
    features: dict, costs: list[dict], positions: list[dict], result: dict,
) -> dict:
    """Nur belegte, fehlende Parserwerte ergänzen. Closed world + Provenienz."""
    by_id = {str(p.get("pos_nr")): p for p in positions or [] if p.get("pos_nr")}
    applied_features = 0
    applied_costs = 0
    for suggestion in result.get("features") or []:
        key = suggestion.get("key")
        try:
            confidence = float(suggestion.get("confidence"))
        except (TypeError, ValueError):
            continue
        source_ids = [str(s) for s in suggestion.get("source_ids") or []]
        sources = [by_id[s] for s in source_ids if s in by_id]
        value = suggestion.get("value")
        if key not in FEATURE_KEYS or confidence < MIN_CONFIDENCE or value is None or not sources:
            continue
        if (features.get(key) or {}).get("value") is not None:
            continue
        source = sources[0]
        features[key] = {
            "value": value,
            "confidence": "medium",
            "source_page": source.get("source_page"),
            "source_text": source.get("source_text") or source.get("beschreibung"),
            "source_excerpt": f"KI-Normalisierung aus Position {', '.join(source_ids[:6])}",
            "derived_from": str(suggestion.get("reason") or "")[:300],
        }
        applied_features += 1

    cost_by_id = {
        str(row.get("original_position")): row
        for row in costs or [] if row.get("original_position")
    }
    for suggestion in result.get("costs") or []:
        row = cost_by_id.get(str(suggestion.get("source_id") or ""))
        try:
            confidence = float(suggestion.get("confidence"))
            amount = float(suggestion.get("amount"))
        except (TypeError, ValueError):
            continue
        if not row or confidence < MIN_CONFIDENCE or amount < 0:
            continue
        if row.get("detected_amount") is not None:
            continue
        row["detected_amount"] = round(amount, 2)
        row["confidence"] = "medium"
        row["source"] = "llm_normalized_position"
        applied_costs += 1
    return {
        "llm_review_features_applied": applied_features,
        "llm_review_costs_applied": applied_costs,
        "llm_review_warnings": [
            str(warning)[:300] for warning in (result.get("warnings") or [])[:30]
        ],
    }
