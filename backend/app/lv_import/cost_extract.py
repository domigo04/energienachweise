"""B8 — BKP-Beträge best-effort erkennen. Blockiert den Import NIE; fehlende
oder unsichere Beträge werden im Review manuell ergänzt (confirmed_amount)."""
from __future__ import annotations

import re

from app.lv_import.normalization import parse_number
from app.lv_import.feature_extract import _seiten_zeilen, HIGH, MEDIUM

# BKP-Nummer: "BKP 241", "BKP 242.3" oder eine führende 2xx(.x)-Position.
_BKP = re.compile(r"bkp\s*(\d{3}(?:\.\d+)?)|^\s*(2\d{2}(?:\.\d+)?)\b", re.IGNORECASE)
# Betrag mit CHF/Fr. — nur mit Währungsmarker, um Mengen nicht als Preise zu lesen.
_CHF = re.compile(r"(?:chf|fr\.?)\s*([\d’'\s.]+\d)|([\d’'\s.]+\d)\s*(?:chf|fr\.?)", re.IGNORECASE)


def extract_costs(pages) -> list[dict]:
    """Alle erkannten Kostenpositionen je BKP SAMMELN und aggregieren — nicht
    „erster Treffer gewinnt". Beträge derselben BKP werden summiert, die Zahl der
    Einzelpositionen und die erste Fundstelle festgehalten."""
    zeilen = _seiten_zeilen(pages)
    agg: dict[str, dict] = {}
    reihenfolge: list[str] = []
    for seite, line in zeilen:
        b = _BKP.search(line)
        if not b:
            continue
        bkp_nr = b.group(1) or b.group(2)
        c = _CHF.search(line)
        betrag = parse_number(c.group(1) or c.group(2)) if c else None
        if bkp_nr not in agg:
            agg[bkp_nr] = {
                "bkp_nr": bkp_nr, "summe": 0.0, "mit_betrag": 0, "positionen": 0,
                "source_page": seite, "source_text": line,
            }
            reihenfolge.append(bkp_nr)
        eintrag = agg[bkp_nr]
        eintrag["positionen"] += 1
        if betrag is not None:
            eintrag["summe"] += betrag
            eintrag["mit_betrag"] += 1

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
