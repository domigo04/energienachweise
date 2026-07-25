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

HIGH, MEDIUM, LOW = "high", "medium", "low"

# Rundungstoleranz der Summenprüfung (Punkt 15).
TOLERANZ_CHF = 1.0
VALID, MISMATCH, UNGEPRUEFT = "valid", "mismatch", "unchecked"

# Betrag am Zeilenende: Schweizer Format mit Apostroph-Tausendern und/oder
# zwei Nachkommastellen.
_BETRAG_ENDE = re.compile(
    r"(\d{1,3}(?:[’'\s]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{4,})\s*$")
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


# ── Punkt 17 — kanonische Kostenpositionen ─────────────────────────────────
# Regel je Schlüssel: ALLE `terms` müssen im normalisierten Titel vorkommen.
# `context` (mindestens einer) bzw. `groups` (BKP-Gruppe) trennen gleichnamige
# Positionen auf verschiedenen Anlagenseiten voneinander.
CANONICAL_COST_POSITIONS: dict[str, dict] = {
    # ── Wärmequelle / Primärkreis (BKP 241) ──
    "source_expansion_safety": {
        "terms": ["expansion"], "context": ["primaerkreis", "ews", "erdsonde", "sole"],
        "groups": ["241"]},
    "source_pipework": {
        "terms": ["rohrleitungen"], "context": ["primaerkreis", "ews", "erdsonde", "sole"],
        "groups": ["241"]},
    "source_equipment_valves": {
        "terms": ["apparate"], "context": ["primaerkreis", "ews", "erdsonde", "sole"],
        "groups": ["241"]},
    "source_installation_transport": {
        "terms": ["montage"], "context": ["primaerkreis", "ews", "erdsonde", "sole"],
        "groups": ["241"]},
    # „Erdsondensammler" enthält als Zeichenkette „erdsonden" — die Position ist
    # aber eine Rohrleitung, keine Bohrung. Darum verlangt `boreholes` einen
    # Bohr-Bezug und schliesst die anderen Gewerkbegriffe ausdrücklich aus.
    "boreholes": {
        "terms": ["erdsonden"], "context": ["bohr", "sondenbohrung"], "groups": ["241"],
        "not_terms": ["sammler", "rohrleitungen", "expansion", "apparate", "isolation",
                      "montage"]},
    # ── Wärmeerzeugung (BKP 242) ──
    "heat_generator": {
        "terms": ["waermeerzeuger"], "context": None, "groups": ["242"]},
    "generation_expansion_safety": {
        "terms": ["expansion"], "context": ["waermeerzeugung", "erzeugung"], "groups": ["242"]},
    "generation_equipment_valves": {
        "terms": ["apparate"], "context": ["waermeerzeugung", "erzeugung"], "groups": ["242"]},
    "generation_installation_transport": {
        "terms": ["montage"], "context": ["waermeerzeugung", "erzeugung"], "groups": ["242"]},
    # ── Wärmeverteilung (BKP 243) ──
    "distribution_pipework": {
        "terms": ["rohrleitungen"], "context": ["verteilung", "heizungsverteilung"],
        "groups": ["243"]},
    "surface_heating": {
        "terms": ["flaechenheizung"], "context": None, "groups": ["243"]},
    "distribution_equipment_valves": {
        "terms": ["apparate"], "context": ["verteilung"], "groups": ["243"]},
    "heat_metering": {
        "terms": ["waermemessung"], "context": None, "groups": ["243"]},
    "distribution_installation_transport": {
        "terms": ["montage"], "context": ["verteilung"], "groups": ["243"]},
    # ── Isolationen (BKP 247) ──
    "insulation_pipework": {
        "terms": ["isolation", "rohrleitungen"], "context": None, "groups": ["247"]},
    "insulation_equipment": {
        "terms": ["isolation", "apparate"], "context": None, "groups": ["247"]},
    # ── Übrige Installationen (BKP 248) ──
    "electrical": {
        "terms": ["elektro"], "context": None, "groups": ["248"]},
    "commissioning": {
        "terms": ["inbetriebnahme"], "context": None, "groups": ["248"]},
    # ── Übrige Arbeiten (BKP 249) ──
    "building_works": {
        "terms": ["bauliche"], "context": None, "groups": ["249"]},
    "provisional_works": {
        "terms": ["provisor"], "context": None, "groups": ["249"]},
    "hourly_works": {
        "terms": ["regiearbeiten"], "context": None, "groups": ["249"]},
}


def canonical_key(title: str, bkp_group: Optional[str] = None) -> Optional[str]:
    """Kanonischer Schlüssel aus dem Titel (Punkt 17).

    Deterministisch: eine Regel passt nur, wenn alle ihre Begriffe vorkommen.
    Bei mehreren Treffern gewinnt die spezifischste (meiste Begriffe + passende
    Gruppe). Bleibt es uneindeutig, wird None geliefert (Punkt 18) — der Nutzer
    prüft die Zuordnung im Review.
    """
    norm = _falte(title)
    if not norm:
        return None
    kandidaten: list[tuple[int, str]] = []
    for key, regel in CANONICAL_COST_POSITIONS.items():
        if not all(t in norm for t in regel["terms"]):
            continue
        if any(t in norm for t in regel.get("not_terms") or ()):
            continue                   # Ausschlussbegriff → diese Regel gilt nicht
        score = len(regel["terms"])
        kontext = regel.get("context")
        gruppen = regel.get("groups") or []
        kontext_ok = bool(kontext) and any(c in norm for c in kontext)
        gruppe_ok = bool(bkp_group) and any(bkp_group.startswith(g) for g in gruppen)
        if kontext:
            # Kontext verlangt: entweder steht er im Titel oder die BKP-Gruppe passt.
            if not (kontext_ok or gruppe_ok):
                continue
            score += 2 if kontext_ok else 1
        elif gruppen:
            if bkp_group and not gruppe_ok:
                continue
            score += 1 if gruppe_ok else 0
        kandidaten.append((score, key))
    if not kandidaten:
        return None
    kandidaten.sort(key=lambda x: -x[0])
    if len(kandidaten) > 1 and kandidaten[0][0] == kandidaten[1][0]:
        return None                    # uneindeutig → lieber nichts (Punkt 18)
    return kandidaten[0][1]


# ── Punkt 14/15 — Zusammenstellung positionsweise auswerten ────────────────

def parse_cost_summary(pages) -> dict:
    """Kostenzusammenstellungs-Seiten auswerten.

    Returns:
        {
          "positions":    [{bkp_group, original_position, original_title,
                            canonical_key, amount, source_page, source_text}],
          "group_totals": {"241": {amount, sum_positions, validation_status, ...}},
          "trade_total":  265664.0 | None,
        }
    """
    positions: list[dict] = []
    group_totals: dict[str, dict] = {}
    group_names: dict[str, str] = {}
    trade_total = None

    for p in pages or []:
        seite = p.get("page")
        for line in (p.get("text") or "").splitlines():
            line = line.strip()
            if not line:
                continue

            # Gruppentotal bzw. Gewerktotal ("Total BKP 24").
            m = _GRUPPE_TOTAL.match(line)
            if m:
                nr, rest = m.group(1), m.group(2)
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
                if not betrag_m:
                    continue
                betrag = parse_number(betrag_m.group(1))
                if betrag is None:
                    continue
                titel = rest[:betrag_m.start()].strip(" .·-—\t")
                if not _HAT_WORT.search(titel):
                    continue
                gruppe = nummer.split(".")[0]
                positions.append({
                    "bkp_group": gruppe,
                    "original_position": nummer,
                    "original_title": titel,
                    "canonical_key": canonical_key(titel, gruppe),
                    "amount": round(betrag, 2),
                    "source_page": seite,
                    "source_text": line[:200],
                })
                continue

            # Gruppenkopf ohne Betrag → nur den Namen merken.
            m = _GRUPPE.match(line)
            if m and not _BETRAG_ENDE.search(line):
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
            "canonical_key": p["canonical_key"],
            "detected_amount": p["amount"],
            "confidence": HIGH if p["canonical_key"] else MEDIUM,
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
