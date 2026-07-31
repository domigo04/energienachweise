"""B8 / Block C #10 — BKP-Beträge aus strukturierten Positionsblöcken erkennen.

Blockiert den Import NIE; fehlende oder unsichere Beträge werden im Review
manuell ergänzt (confirmed_amount). Grundlage ist der Positionsblock-Parser
(positions.py): eine Position = ein Block, Beträge werden je BKP aggregiert —
nicht „erster Treffer gewinnt".
"""
from __future__ import annotations

from app.lv_import.feature_extract import HIGH, MEDIUM
from app.lv_import.positions import parse_positions
from app.lv_import import norm_lv


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


def cost_rows_from_positions(
    positions: list[dict], *, trust_detected_amounts: bool = True,
) -> list[dict]:
    """Nicht aggregierte Review-Zeilen: Preis, Menge und Originaltitel bleiben
    pro LV-Position sichtbar. Das ist die Grundlage für «hochladen, kurz
    kontrollieren, freigeben»; Gruppensummen können später weiterhin separat
    geprüft werden.

    Bei OCR-Scans sind Zahlen aus unbepreisten Detailseiten keine belastbaren
    Preise: Datum, Seitennummer, Menge oder Typnummer können in dieselbe
    Textzeile rutschen. In diesem Fall bleiben die Beträge bewusst leer und
    werden visuell bzw. manuell geprüft.
    """
    rows = []
    for position in positions or []:
        bkp_nr = position.get("bkp_nr")
        if not bkp_nr:
            continue
        title = position.get("beschreibung") or ""
        mapping = norm_lv.match_title(title, bkp_nr)
        detected_amount = (
            position.get("betrag") if trust_detected_amounts else None
        )
        rows.append({
            "bkp_nr": bkp_nr,
            "original_position": position.get("pos_nr"),
            "original_title": title,
            "detected_amount": detected_amount,
            "positionen": 1,
            "confidence": HIGH if detected_amount is not None else MEDIUM,
            "source_page": position.get("source_page"),
            "source_text": position.get("source_text"),
            "source": "lv_positions",
            **mapping,
        })
    return rows
