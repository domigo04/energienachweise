"""B8 / Block C #10 — BKP-Beträge aus strukturierten Positionsblöcken erkennen.

Blockiert den Import NIE; fehlende oder unsichere Beträge werden im Review
manuell ergänzt (confirmed_amount). Grundlage ist der Positionsblock-Parser
(positions.py): eine Position = ein Block, Beträge werden je BKP aggregiert —
nicht „erster Treffer gewinnt".
"""
from __future__ import annotations

from app.lv_import.feature_extract import HIGH, MEDIUM
from app.lv_import.positions import parse_positions


def extract_costs(pages) -> list[dict]:
    """Positionen je BKP SAMMELN und aggregieren: Beträge summieren, Zahl der
    Einzelpositionen und erste Fundstelle festhalten."""
    agg: dict[str, dict] = {}
    reihenfolge: list[str] = []
    for p in parse_positions(pages):
        bkp_nr = p.get("bkp_nr")
        if not bkp_nr:
            continue
        if bkp_nr not in agg:
            agg[bkp_nr] = {
                "summe": 0.0, "mit_betrag": 0, "positionen": 0,
                "source_page": p["source_page"], "source_text": p["source_text"],
            }
            reihenfolge.append(bkp_nr)
        e = agg[bkp_nr]
        e["positionen"] += 1
        if p.get("betrag") is not None:
            e["summe"] += p["betrag"]
            e["mit_betrag"] += 1

    out = []
    for bkp_nr in reihenfolge:
        e = agg[bkp_nr]
        hat_betrag = e["mit_betrag"] > 0
        out.append({
            "bkp_nr": bkp_nr,
            "detected_amount": round(e["summe"], 2) if hat_betrag else None,
            "positionen": e["positionen"],
            # high nur, wenn ALLE Positionen einen Betrag hatten.
            "confidence": HIGH if hat_betrag and e["mit_betrag"] == e["positionen"] else MEDIUM,
            "source_page": e["source_page"],
            "source_text": e["source_text"],
        })
    return out
