"""Positionsblock-Parser (Block C #10).

Ein LV besteht aus Positionen. Eine Position beginnt mit einer Positions-/BKP-
Nummer und läuft bis zur nächsten. Innerhalb des Blocks werden Beschreibung,
Menge + Einheit und Beträge (Einzelpreis / Total) konservativ erkannt.

So entsteht EINE strukturierte Grundlage für Kosten UND Bauteilmengen, statt
Zeile für Zeile getrennt zu raten. Grundsatz bleibt B6: was nicht sicher als
Menge/Betrag lesbar ist, bleibt None — nichts wird erfunden.
"""
from __future__ import annotations

import re
from typing import Optional

from app.lv_import.normalization import parse_number
from app.lv_import.feature_extract import _seiten_zeilen
from app.lv_import.synonyms import FEATURE_TERMS

# Positionsstart: optional "Pos."/"Position"/"BKP", dann eine Nummer und danach
# ein beschreibender Text mit Buchstaben. Reine Mengen-/Betragszeilen ("620 m",
# "CHF 45'000", "82 kW") sind KEINE Positionsstarts.
_POS_PREFIX = re.compile(r"^\s*(?:pos\.?|position|bkp)\s*", re.IGNORECASE)
# Separator + Beschreibung sind optional: eine reine Nummernzeile ("241.100")
# eröffnet eine Position, deren Bezeichnung in den Folgezeilen steht.
_POS_NUMMER = re.compile(r"^(\d{1,3}(?:\.\d+){0,3})(?:[\s.):]+(.*))?$")
_BKP_IN = re.compile(r"\bbkp\s*(\d{3}(?:\.\d+)?)|^\s*(2\d{2}(?:\.\d+)?)\b", re.IGNORECASE)
# Geldbetrag: CHF/Fr.-markiert ODER klar als Geld formatiert (Tausender-Apostroph
# bzw. genau zwei Nachkommastellen). So werden Totale auch ohne wiederholten
# CHF-Marker erkannt, ohne blosse Mengen als Preis zu lesen.
_MONEY = re.compile(
    r"(?:chf|fr\.?)\s*([\d’'\s.]+\d)"
    r"|([\d’'\s.]+\d)\s*(?:chf|fr\.?)"
    r"|(\d{1,3}(?:[’' ]\d{3})+(?:[.,]\d{2})?)"
    r"|(\d+[.,]\d{2})(?!\d)",
    re.IGNORECASE,
)
# Menge + Einheit: "1 Stk", "620 m", "45 m²", "3 Stück", "1'200 kg".
_MENGE_EINHEIT = re.compile(
    r"(\d[\d’'\s.,]*)\s*"
    r"(stk\.?|stück|stueck|st\.|stg|m²|m2|m³|m3|lfm|laufmeter|m\b|kg|liter|lit\.?|l\b|paar|h\b)",
    re.IGNORECASE,
)
_EINHEIT_KANON = {
    "stk": "stk", "stk.": "stk", "stück": "stk", "stueck": "stk", "st.": "stk", "stg": "stk",
    "m²": "m2", "m2": "m2", "m³": "m3", "m3": "m3", "lfm": "m", "laufmeter": "m", "m": "m",
    "kg": "kg", "liter": "l", "lit": "l", "lit.": "l", "l": "l", "paar": "paar", "h": "h",
}

# Wörter, die eine reine Fortsetzungszeile markieren (nie ein Positionsstart).
_KEIN_START = re.compile(
    r"^\s*(?:chf|fr\.?|total|summe|zwischentotal|menge|anzahl|rabatt|mwst|nachlass)\b",
    re.IGNORECASE,
)


def _hat_buchstaben(text: str) -> bool:
    return bool(re.search(r"[A-Za-zÄÖÜäöüéèà]{2,}", text or ""))


def _position_start(line: str):
    """Nummer + Resttext, wenn die Zeile ein Positionsstart ist, sonst None."""
    if _KEIN_START.match(line):
        return None
    rest = _POS_PREFIX.sub("", line, count=1)
    hat_prefix = rest != line
    m = _POS_NUMMER.match(rest)
    if not m:
        return None
    nummer, beschreibung = m.group(1), (m.group(2) or "").strip()
    # Ohne ausdrückliches Präfix nur akzeptieren, wenn die Nummer hierarchisch
    # (mit Punkt) oder eine BKP-Bereichsnummer (2xx) ist.
    if not hat_prefix:
        ist_hierarchie = "." in nummer
        ist_bkp = re.match(r"^2\d{2}$", nummer.split(".")[0]) is not None
        if not (ist_hierarchie or ist_bkp):
            return None
    # Steht auf der Startzeile schon ein Beschreibungstext, muss er echte Wörter
    # enthalten (filtert reine Mengen-/Spec-Zeilen wie „620 m"). Eine reine
    # Nummernzeile (Beschreibung folgt darunter) ist erlaubt.
    if beschreibung and not _hat_buchstaben(beschreibung):
        return None
    return nummer, beschreibung


def _bkp_aus(nummer: str, block_text: str) -> Optional[str]:
    """3-stellige BKP-Nummer aus der Positionsnummer oder dem Blocktext. Sub-
    Positionen (241.100) werden auf ihre BKP-Gruppe (241) aggregiert."""
    kopf = nummer.split(".")[0]
    if re.match(r"^2\d{2}$", kopf):
        return kopf
    m = _BKP_IN.search(block_text)
    if m:
        return (m.group(1) or m.group(2)).split(".")[0]
    return None


def _menge_einheit(text: str):
    m = _MENGE_EINHEIT.search(text)
    if not m:
        return None, None
    menge = parse_number(m.group(1))
    einheit = _EINHEIT_KANON.get(m.group(2).lower().rstrip("."))
    return menge, einheit


def _betrag(block_text: str) -> Optional[float]:
    """Positions-Total = grösster Geldbetrag im Block (Total ≥ Einzelpreis)."""
    betraege = [parse_number(next((g for g in groups if g), None))
                for groups in _MONEY.findall(block_text)]
    betraege = [x for x in betraege if x is not None]
    return round(max(betraege), 2) if betraege else None


def parse_positions(pages) -> list[dict]:
    """LV in strukturierte Positionen zerlegen. Jede Position trägt Herkunft
    (Seite + Originalzeile), damit im Review nichts blind übernommen wird."""
    zeilen = _seiten_zeilen(pages)
    starts = []  # (index, seite, nummer, beschreibung, startzeile)
    for i, (seite, line) in enumerate(zeilen):
        s = _position_start(line)
        if s:
            starts.append((i, seite, s[0], s[1], line))

    positionen = []
    for k, (idx, seite, nummer, beschreibung, startzeile) in enumerate(starts):
        ende = starts[k + 1][0] if k + 1 < len(starts) else len(zeilen)
        block_zeilen = [zeilen[j][1] for j in range(idx, ende)]
        block_text = "\n".join(block_zeilen)
        # Beschreibung = Text der Startzeile, sonst die beschreibenden Zeilen des
        # Blocks (deckt „Nummer oben, Bezeichnung darunter" ab).
        if not beschreibung:
            beschreibung = " ".join(z for z in block_zeilen if _hat_buchstaben(z))[:200]
        menge, einheit = _menge_einheit(block_text)
        positionen.append({
            "pos_nr": nummer,
            "bkp_nr": _bkp_aus(nummer, block_text),
            "beschreibung": beschreibung,
            "menge": menge,
            "einheit": einheit,
            "betrag": _betrag(block_text),
            "source_page": seite,
            "source_text": startzeile,
        })
    return positionen


# Feature-Familien, deren Menge sich sinnvoll als Stück-/Meter-Menge summieren
# lässt (Block C #11 — Bauteilmengen). „borehole"/„heat_generator" laufen über
# eigene, präzisere Extraktoren und bleiben hier bewusst aussen vor.
_MENGEN_FAMILIEN = ("pump", "valve_2way", "valve_3way", "heat_meter", "buffer", "pipe")


def component_quantities(pages) -> dict:
    """Bauteilmengen je Feature-Familie aus den Positionsblöcken.

    Summiert die Menge jener Positionen, deren Beschreibung eine Bauteil-Familie
    trifft. Rein additive Evidenz: ergänzt die zeilenbasierte Zählung für block-
    formatierte LVs, ersetzt sie nicht (B6 bleibt — nichts wird geraten)."""
    result: dict[str, dict] = {}
    for p in parse_positions(pages):
        if p["menge"] is None:
            continue
        besch = (p["beschreibung"] or "").lower()
        for family in _MENGEN_FAMILIEN:
            if any(t in besch for t in FEATURE_TERMS[family]):
                r = result.setdefault(family, {
                    "summe": 0.0, "positionen": 0,
                    "source_page": p["source_page"], "source_text": p["source_text"],
                })
                r["summe"] += p["menge"]
                r["positionen"] += 1
    return result
