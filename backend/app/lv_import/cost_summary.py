"""Kostenzusammenstellung als PRIMARY SOURCE (Punkt 13–18).

Der wichtigste Fix für echte Unternehmerangebote: ein LV enthält hunderte
Positionstotale, aber genau EINE saubere Kostenzusammenstellung. Wer stattdessen
wahllos alle Totale im ganzen PDF sammelt, bekommt Doppelzählungen und
Zwischentotale.

Priorität (Punkt 13):
    1. Kostenzusammenstellung
    2. LV-Positions-Totale
    3. manuelle Eingabe

Dabei bleiben drei Ebenen erhalten (Punkt 14): Original-BKP-Gruppe,
Original-Position und Originaltitel — die Detailinformation wird NICHT sofort
auf die Gruppe aggregiert. Zusätzlich wird das Gruppentotal gespeichert und
gegen die Summe der Einzelpositionen geprüft (Punkt 15).

Weil Planer Unterpositionen je Projekt anders nummerieren, kommt die Identität
nicht aus der Nummer, sondern aus einem kanonischen Schlüssel, der über den
normalisierten Titel bestimmt wird (Punkt 17). Ist die Zuordnung nicht
eindeutig, bleibt sie leer — kein aggressives Fuzzy-Matching (Punkt 18).
"""
from __future__ import annotations

import re
from typing import Optional

from app.lv_import.normalization import parse_number
from app.lv_import import norm_lv

HIGH, MEDIUM, LOW = "high", "medium", "low"

# Rundungstoleranz der Summenprüfung (Punkt 15).
TOLERANZ_CHF = 1.0
VALID, MISMATCH, UNGEPRUEFT = "valid", "mismatch", "unchecked"

# Betrag am Zeilenende: Schweizer Format mit Apostroph-Tausendern und/oder
# zwei Nachkommastellen.
_BETRAG_ENDE = re.compile(
    r"(\d{1,3}(?:[’'\s]\d{3})+(?:[.,](?:\d{2}|-))?"
    r"|\d+[.,](?:\d{2}|-)|\d{4,})\s*$")
# Einzelposition: "241.10  Titel ...  1'410.00"
_POSITION = re.compile(r"^\s*(?:pos\.?\s*|bkp\s*)?(\d{3}(?:\.\d+)+)\s+(\S.*)$", re.IGNORECASE)
# Gruppenkopf ohne Betrag: "241  Energielagerung"
_GRUPPE = re.compile(r"^\s*(?:bkp\s*)?(\d{3})\s+(\S.*)$", re.IGNORECASE)
# Gruppentotal: "Total BKP 241 ... 103'252.00" — auch "Total 241", "Summe BKP 241".
_GRUPPE_TOTAL = re.compile(
    r"^\s*(?:total|summe|zwischentotal)\s*(?:bkp\s*)?(\d{2,3})\b(.*)$", re.IGNORECASE)
_HAT_WORT = re.compile(r"[A-Za-zÄÖÜäöüéèà]{3,}")


def _falte(text: str) -> str:
    """Titel normalisieren: klein, Umlaute gefaltet, Mehrfachleerzeichen weg.
    So greift dieselbe Regel für „Primärkreis" und „Primaerkreis"."""
    low = (text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"),
                 ("é", "e"), ("è", "e"), ("à", "a")):
        low = low.replace(a, b)
    return re.sub(r"\s+", " ", low).strip()


# ── Punkt 17 — kanonische Kostenpositionen ────────────────────────────────
# Die geschlossene Liste ist das bestehende Norm-LV (app.data.bkp_positionen);
# die Zuordnung lebt in `norm_lv`. Hier wird sie nur verwendet, damit es genau
# EINE Quelle für Norm-Positionen gibt.
canonical_key = norm_lv.match_title  # Rückwärtskompatibler Name


# ── Punkt 14/15 — Zusammenstellung positionsweise auswerten ────────────────

def _summary_lines(pages, word_pages=None):
    """Zeilen der Zusammenstellung — bevorzugt räumlich (Punkt: Spatial-Parser).

    Mit Wortkoordinaten wird jede Tabellenzeile aus ihren Spalten rekonstruiert
    und der Betrag aus der RECHTESTEN Zahlenspalte gelesen. Das ist deutlich
    robuster als „Zahl am Zeilenende": bei mehrspaltigen Zusammenstellungen
    (z.B. Ausschreibungssumme neben Unternehmersumme) trifft die Textvariante
    sonst die falsche Spalte, und umbrechende Titel zerreissen die Zeile.

    Liefert (seite, text, betrag_rechts) — `betrag_rechts` ist None, wenn keine
    Koordinaten vorliegen; dann entscheidet die Regex am Zeilenende.
    """
    if word_pages:
        from app.lv_import.spatial import group_words_to_rows, row_text

        out = []
        for sp in word_pages:
            seite = sp.get("page")
            for row in group_words_to_rows(sp.get("words") or []):
                text = row_text(row)
                betrag = None
                # Rechteste Spalte, die ein Geldbetrag ist.
                for w in sorted(row, key=lambda x: -x["x0"]):
                    m = _BETRAG_ENDE.match((w.get("text") or "").strip())
                    if m:
                        betrag = parse_number(m.group(1))
                        break
                out.append((seite, text, betrag))
        if out:
            return out
    return [(p.get("page"), line.strip(), None)
            for p in (pages or [])
            for line in (p.get("text") or "").splitlines() if line.strip()]


def parse_cost_summary(pages, word_pages=None) -> dict:
    """Kostenzusammenstellungs-Seiten auswerten.

    Args:
        pages: Textseiten der Klasse `cost_summary`.
        word_pages: dieselben Seiten mit Wortkoordinaten (optional, robuster).

    Returns:
        {
          "positions":    [{bkp_group, original_position, original_title,
                            original_amount, canonical_key, mapping_method,
                            mapping_confidence, mapping_reason, amount,
                            source_page, source_text}],
          "group_totals": {"241": {amount, sum_positions, validation_status, ...}},
          "trade_total":  265664.0 | None,
        }
    """
    positions: list[dict] = []
    group_totals: dict[str, dict] = {}
    group_names: dict[str, str] = {}
    trade_total = None

    for seite, line, betrag_rechts in _summary_lines(pages, word_pages):
        if not line:
            continue

        # Gruppentotal bzw. Gewerktotal ("Total BKP 24").
        m = _GRUPPE_TOTAL.match(line)
        if m:
            nr, rest = m.group(1), m.group(2)
            betrag = betrag_rechts
            if betrag is None:
                betrag_m = _BETRAG_ENDE.search(rest) or _BETRAG_ENDE.search(line)
                betrag = parse_number(betrag_m.group(1)) if betrag_m else None
            if betrag is None:
                continue
            if len(nr) == 2:                       # Gewerktotal (BKP 24)
                trade_total = round(betrag, 2)
            else:
                group_totals[nr] = {
                    "bkp_group": nr, "amount": round(betrag, 2),
                    "source_page": seite, "source_text": line[:200],
                }
            continue

        # Einzelposition mit Betrag.
        m = _POSITION.match(line)
        if m:
            nummer, rest = m.group(1), m.group(2)
            betrag_m = _BETRAG_ENDE.search(rest)
            # Räumlich erkannter Betrag hat Vorrang (rechteste Spalte).
            betrag = betrag_rechts
            if betrag is None:
                betrag = parse_number(betrag_m.group(1)) if betrag_m else None
            if betrag is None:
                continue
            titel = (rest[:betrag_m.start()] if betrag_m else rest).strip(" .·-—\t")
            if not _HAT_WORT.search(titel):
                continue
            gruppe = nummer.split(".")[0]
            # Zuordnung ins Norm-LV: geschlossene Liste, Titel entscheidet.
            zuordnung = norm_lv.match_title(titel, gruppe)
            positions.append({
                "bkp_group": gruppe,
                "original_position": nummer,
                "original_title": titel,
                "section_path": " > ".join(
                    part for part in (
                        f"BKP {gruppe}", group_names.get(gruppe), titel,
                    ) if part
                ),
                "original_amount": round(betrag, 2),
                "amount": round(betrag, 2),
                "source_page": seite,
                "source_text": line[:200],
                **zuordnung,
            })
            continue

        # Gruppenkopf ohne Betrag → nur den Namen merken.
        m = _GRUPPE.match(line)
        if m and not _BETRAG_ENDE.search(line) and betrag_rechts is None:
            group_names[m.group(1)] = m.group(2).strip()

    # Punkt 15 — Summenprüfung je Gruppe.
    for gruppe, info in group_totals.items():
        teil = [p["amount"] for p in positions if p["bkp_group"] == gruppe]
        summe = round(sum(teil), 2)
        info["bkp_name"] = group_names.get(gruppe)
        info["positionen"] = len(teil)
        info["sum_positions"] = summe if teil else None
        if not teil:
            info["validation_status"] = UNGEPRUEFT
        else:
            info["validation_status"] = (
                VALID if abs(summe - info["amount"]) <= TOLERANZ_CHF else MISMATCH)
    # Gruppen, die nur als Positionen vorkommen (kein ausgewiesenes Total).
    for gruppe in {p["bkp_group"] for p in positions} - set(group_totals):
        teil = [p["amount"] for p in positions if p["bkp_group"] == gruppe]
        group_totals[gruppe] = {
            "bkp_group": gruppe, "amount": None, "bkp_name": group_names.get(gruppe),
            "positionen": len(teil), "sum_positions": round(sum(teil), 2),
            "validation_status": UNGEPRUEFT, "source_page": None, "source_text": None,
        }

    return {"positions": positions, "group_totals": group_totals,
            "trade_total": trade_total}


def has_cost_summary(result: dict) -> bool:
    """Taugt das Ergebnis als primäre Kostenquelle?"""
    return bool(result and result.get("positions"))


def to_cost_rows(result: dict) -> list[dict]:
    """Zusammenstellung → Zeilen für LvImportCost (Punkt 14).

    Jede Einzelposition bleibt eine eigene Zeile mit Originalnummer, Originaltitel
    und kanonischem Schlüssel. Zusätzlich wird je Gruppe eine Totalzeile geführt
    (is_group_total), die nur der Kontrolle dient und nie doppelt in die
    Referenzkosten fliesst.
    """
    rows: list[dict] = []
    for p in result.get("positions", []):
        rows.append({
            "bkp_nr": p["bkp_group"],
            "original_position": p["original_position"],
            "original_title": p["original_title"],
            "section_path": p.get("section_path"),
            # Zuordnung + wie sie zustande kam (später messbar, Punkt: Metriken).
            "canonical_key": p.get("canonical_key"),
            "mapping_method": p.get("mapping_method"),
            "mapping_confidence": p.get("mapping_confidence"),
            "mapping_reason": p.get("mapping_reason"),
            "detected_amount": p["amount"],
            "confidence": HIGH if p.get("canonical_key") else MEDIUM,
            "source_page": p["source_page"], "source_text": p["source_text"],
            "positionen": 1, "is_group_total": False,
            "source": "cost_summary",
        })
    for gruppe, info in sorted(result.get("group_totals", {}).items()):
        if info.get("amount") is None:
            continue
        rows.append({
            "bkp_nr": gruppe, "original_position": None,
            "original_title": info.get("bkp_name") or f"Total BKP {gruppe}",
            "canonical_key": None,
            "detected_amount": info["amount"],
            "confidence": HIGH,
            "source_page": info.get("source_page"), "source_text": info.get("source_text"),
            "positionen": info.get("positionen") or 0, "is_group_total": True,
            "validation_status": info.get("validation_status"),
            "source": "cost_summary",
        })
    return rows
