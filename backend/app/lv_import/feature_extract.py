"""B4/B6/B7 — nur die definierten Kostentreiber konservativ erkennen.

Eingabe: Seiten als [{"page": int, "text": str}, ...] (aus pdf_extract).
Ausgabe: {feature_key: {value, unit, confidence, source_page, source_text}}.

Grundsätze:
- Nur Mengen zählen, die zuverlässig als Menge erkennbar sind (B6). Keine
  geratene 1. Fehlt die Menge → value=None, confidence="low".
- Originaltext (Fundstelle) und Seite werden immer mitgegeben (B9).
- Nur die definierten MVP-Features (feature_keys), keine Materialstückliste.
"""
from __future__ import annotations

import re
from typing import Optional

from app.lv_import.synonyms import FEATURE_TERMS, GENERATOR_TYPE_TERMS
from app.lv_import.normalization import parse_number, parse_int

HIGH, MEDIUM, LOW = "high", "medium", "low"

# Mengenangabe in der Nähe eines Bauteil-Treffers: "Menge 3 Stk", "3 Stück",
# "3 Stk.", "Anzahl 3". Bewusst eng — kein wildes Zahlenraten.
_MENGE = re.compile(
    r"(?:menge|anzahl|stk\.?|stück|stueck)\D{0,4}(\d+(?:[.,]\d+)?)"
    r"|(\d+(?:[.,]\d+)?)\s*(?:stk\.?|stück|stueck|st\.)",
    re.IGNORECASE,
)
_KW = re.compile(r"(\d+(?:[.,]\d+)?)\s*kw", re.IGNORECASE)
_LITER = re.compile(r"(\d[\d’'\s.]*)\s*(?:liter|lit\.?|l\b)", re.IGNORECASE)
# "4 Erdsonden à 180 m" / "4 Erdsonden a 180m" / "4 Duplexsonden je 180 m"
_SONDEN = re.compile(
    r"(\d+)\s*(?:erdsonden?|duplexsonden?|erdwärmesonden?|erdwaermesonden?)"
    r"(?:\D{0,6}?(?:à|a|je|zu)\D{0,3}?(\d[\d’'\s.]*)\s*m\b)?",
    re.IGNORECASE,
)
_METER = re.compile(r"(\d[\d’'\s.]*)\s*(?:lfm|laufmeter|m)\b", re.IGNORECASE)


def _seiten_zeilen(pages):
    """Alle Zeilen mit ihrer Seite als flache Liste [(page, line), ...]."""
    out = []
    for p in pages or []:
        seite = p.get("page")
        for line in (p.get("text") or "").splitlines():
            if line.strip():
                out.append((seite, line.strip()))
    return out


def _menge_in_fenster(zeilen, index, fenster=2) -> Optional[float]:
    """Menge in der Trefferzeile oder den nächsten `fenster` Zeilen suchen."""
    for j in range(index, min(index + fenster + 1, len(zeilen))):
        m = _MENGE.search(zeilen[j][1])
        if m:
            return parse_number(m.group(1) or m.group(2))
    return None


def _count_feature(zeilen, family) -> Optional[dict]:
    terms = FEATURE_TERMS[family]
    total = 0.0
    treffer = 0
    mit_menge = 0
    quelle = None
    for i, (seite, line) in enumerate(zeilen):
        low = line.lower()
        if not any(t in low for t in terms):
            continue
        treffer += 1
        menge = _menge_in_fenster(zeilen, i)
        if menge is not None:
            total += menge
            mit_menge += 1
            if quelle is None:
                quelle = (seite, line)
    if treffer == 0:
        return None
    if mit_menge == 0:
        # Erwähnt, aber keine verlässliche Menge → nicht raten (B6).
        seite, line = zeilen[next(i for i, (_, l) in enumerate(zeilen)
                                  if any(t in l.lower() for t in terms))]
        return {"value": None, "confidence": LOW, "source_page": seite, "source_text": line}
    confidence = HIGH if mit_menge == treffer else MEDIUM
    return {"value": int(round(total)), "confidence": confidence,
            "source_page": quelle[0], "source_text": quelle[1]}


def _generator_type(zeilen) -> Optional[dict]:
    for seite, line in zeilen:
        low = line.lower()
        for code, hints in GENERATOR_TYPE_TERMS:
            if any(h in low for h in hints):
                return {"value": code, "confidence": MEDIUM, "source_page": seite, "source_text": line}
    return None


def _generator_power(zeilen) -> Optional[dict]:
    total = 0.0
    quelle = None
    for i, (seite, line) in enumerate(zeilen):
        low = line.lower()
        if not any(t in low for t in FEATURE_TERMS["heat_generator"]):
            continue
        # kW in der Trefferzeile oder direkt daneben
        for j in range(i, min(i + 2, len(zeilen))):
            m = _KW.search(zeilen[j][1])
            if m:
                kw = parse_number(m.group(1))
                if kw:
                    total += kw
                    if quelle is None:
                        quelle = (seite, line)
                break
    if not quelle:
        return None
    return {"value": round(total, 1), "confidence": MEDIUM, "source_page": quelle[0], "source_text": quelle[1]}


def _storage_volume(zeilen) -> Optional[dict]:
    total = 0.0
    quelle = None
    for i, (seite, line) in enumerate(zeilen):
        if not any(t in line.lower() for t in FEATURE_TERMS["buffer"]):
            continue
        for j in range(i, min(i + 2, len(zeilen))):
            m = _LITER.search(zeilen[j][1])
            if m:
                v = parse_number(m.group(1))
                if v:
                    total += v
                    if quelle is None:
                        quelle = (seite, line)
                break
    if not quelle:
        return None
    return {"value": round(total, 1), "confidence": MEDIUM, "source_page": quelle[0], "source_text": quelle[1]}


def _borehole(zeilen):
    """count + total_m aus 'X Erdsonden à Y m' (B7). Mehrere Felder summiert."""
    count = 0
    total_m = 0.0
    hat_tiefe = False
    quelle = None
    for seite, line in zeilen:
        for m in _SONDEN.finditer(line):
            n = parse_int(m.group(1))
            if not n:
                continue
            count += n
            if m.group(2):
                tiefe = parse_number(m.group(2))
                if tiefe:
                    total_m += n * tiefe
                    hat_tiefe = True
            if quelle is None:
                quelle = (seite, line)
    if count == 0:
        return None, None
    cnt = {"value": count, "confidence": HIGH, "source_page": quelle[0], "source_text": quelle[1]}
    mtr = ({"value": round(total_m, 1), "confidence": HIGH if hat_tiefe else LOW,
            "source_page": quelle[0], "source_text": quelle[1]}
           if hat_tiefe else {"value": None, "confidence": LOW,
                              "source_page": quelle[0], "source_text": quelle[1]})
    return cnt, mtr


def extract_features(pages) -> dict:
    """Alle MVP-Features aus den Seiten ableiten. Nur gefundene Features stehen
    im Ergebnis (kein Rauschen); jeder Wert trägt Herkunft + Confidence."""
    zeilen = _seiten_zeilen(pages)
    result: dict[str, dict] = {}

    for family, key in (("pump", "pump_count"), ("valve_2way", "valve_2way_count"),
                        ("valve_3way", "valve_3way_count"), ("heat_meter", "heat_meter_count"),
                        ("buffer", "buffer_count"), ("heat_generator", "generator_count")):
        f = _count_feature(zeilen, family)
        if f is not None:
            result[key] = f

    for key, fn in (("generator_type", _generator_type),
                    ("generator_power_kw", _generator_power),
                    ("storage_volume_l", _storage_volume)):
        f = fn(zeilen)
        if f is not None:
            result[key] = f

    cnt, mtr = _borehole(zeilen)
    if cnt is not None:
        result["borehole_count"] = cnt
    if mtr is not None:
        result["borehole_total_m"] = mtr

    return result
