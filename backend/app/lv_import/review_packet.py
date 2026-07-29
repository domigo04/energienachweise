"""Kompaktes Übergabeformat zwischen deterministischem LV-Parser und Review.

Das LLM soll nie das vollständige PDF erneut lesen. Es erhält ausschliesslich
die vom Parser normalisierten Mengen, Kostenpositionen und Konsistenzhinweise.
So bleibt die Sprachmodell-Aufgabe klein: Logik prüfen und Unklarheiten
markieren, nicht Tabellen/OCR ein zweites Mal auswerten.
"""
from __future__ import annotations

import json
import math


def _value(feature):
    return feature.get("value") if isinstance(feature, dict) else None


def build_review_packet(features: dict, costs: list[dict]) -> dict:
    """Tokenarmes JSON-Paket und deterministische Plausibilitätsprüfungen."""
    values = {
        key: {
            "value": feature.get("value"),
            "confidence": feature.get("confidence"),
            "page": feature.get("source_page"),
        }
        for key, feature in sorted((features or {}).items())
        if isinstance(feature, dict) and feature.get("value") is not None
    }
    cost_rows = [
        {
            "id": str(row.get("original_position") or row.get("bkp_nr") or index),
            "title": str(row.get("original_title") or "")[:120],
            "norm": row.get("canonical_key"),
            "amount": row.get("detected_amount"),
            "group_total": bool(row.get("is_group_total")),
        }
        for index, row in enumerate(costs or [])
        if row.get("detected_amount") is not None or row.get("original_title")
    ]
    checks: list[dict] = []
    source = _value((features or {}).get("pipe_length_source_m"))
    distribution = _value((features or {}).get("pipe_length_distribution_m"))
    total = _value((features or {}).get("pipe_length_m"))
    if all(isinstance(v, (int, float)) for v in (source, distribution, total)):
        delta = abs((source + distribution) - total)
        if delta > max(1.0, total * 0.01):
            checks.append({
                "code": "pipe_total_mismatch",
                "severity": "warning",
                "message": "Rohrmeter total entsprechen nicht Quelle + Verteilung.",
            })
    boreholes = _value((features or {}).get("borehole_count"))
    each = _value((features or {}).get("borehole_length_each_m"))
    bore_total = _value((features or {}).get("borehole_total_m"))
    if all(isinstance(v, (int, float)) for v in (boreholes, each, bore_total)):
        if abs(boreholes * each - bore_total) > max(1.0, bore_total * 0.01):
            checks.append({
                "code": "borehole_total_mismatch",
                "severity": "warning",
                "message": "Bohrmeter entsprechen nicht Anzahl × Länge je Sonde.",
            })
    if not any(not row["group_total"] and row["amount"] is not None for row in cost_rows):
        checks.append({
            "code": "no_cost_positions",
            "severity": "warning",
            "message": "Keine auswertbare Kostenposition erkannt.",
        })
    packet = {
        "features": values,
        "costs": cost_rows,
        "checks": checks,
        "instruction": (
            "Prüfe nur fachliche Widersprüche. Erfinde keine Werte. "
            "Melde Unklarheiten für die menschliche Freigabe."
        ),
    }
    compact = json.dumps(packet, ensure_ascii=False, separators=(",", ":"))
    return {
        "packet": packet,
        "characters": len(compact),
        # Robuste Vorabschätzung ohne Tokenizer-Abhängigkeit.
        "estimated_tokens": math.ceil(len(compact) / 4),
        "deterministic_checks": checks,
    }
