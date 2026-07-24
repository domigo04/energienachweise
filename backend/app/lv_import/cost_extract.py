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
    zeilen = _seiten_zeilen(pages)
    out: list[dict] = []
    gesehen: set[str] = set()
    for seite, line in zeilen:
        b = _BKP.search(line)
        c = _CHF.search(line)
        if not b:
            continue
        bkp_nr = b.group(1) or b.group(2)
        betrag = parse_number(c.group(1) or c.group(2)) if c else None
        if bkp_nr in gesehen:
            continue
        gesehen.add(bkp_nr)
        out.append({
            "bkp_nr": bkp_nr,
            "detected_amount": betrag,
            "confidence": HIGH if betrag is not None else MEDIUM,
            "source_page": seite,
            "source_text": line,
        })
    return out
