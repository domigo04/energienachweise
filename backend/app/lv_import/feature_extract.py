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
    # Spezifische Quellenbegriffe haben Vorrang vor einer früheren generischen
    # Erwähnung wie «Primärkreis WP».
    for code, hints in GENERATOR_TYPE_TERMS:
        for seite, line in zeilen:
            low = line.lower()
            if any(h in low for h in hints):
                return {"value": code, "confidence": MEDIUM,
                        "source_page": seite, "source_text": line}
    return None


def _mehrfachwerte(zeilen, registry: str) -> Optional[dict]:
    """Alle vorkommenden Codes eines mehrwertigen Merkmals (Punkt 6/7).

    Ein Projekt kann „EWS-WP + Gas" oder „FBH + Heizkörper" haben. Erkannt wird
    über die zentrale Registry — es entstehen nie Freitexte, nur Codes.
    """
    from app import fachwerte

    gefunden: list[str] = []
    quelle = None
    for seite, line in zeilen:
        code = fachwerte.normalize(registry, line)
        if not code or code == "sonstige":
            continue
        if code not in gefunden:
            gefunden.append(code)
            if quelle is None:
                quelle = (seite, line)
    if not gefunden:
        return None
    return {"value": ",".join(gefunden), "codes": gefunden,
            "confidence": MEDIUM if len(gefunden) == 1 else LOW,
            "source_page": quelle[0], "source_text": quelle[1]}


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


def _pipe_length(zeilen):
    """Rohrmeter (B7/§11 Item 7): Laufmeter aus Rohr-/Leitungspositionen summieren.
    LV-Formate sind sehr unterschiedlich → bewusst konservativ und mit tiefer/
    mittlerer Confidence; wird nichts gefunden, bleibt der Wert manuell zu erfassen."""
    total = 0.0
    treffer = 0
    quelle = None
    for i, (seite, line) in enumerate(zeilen):
        if not any(t in line.lower() for t in FEATURE_TERMS["pipe"]):
            continue
        for j in range(i, min(i + 2, len(zeilen))):
            m = _METER.search(zeilen[j][1])
            if m:
                v = parse_number(m.group(1))
                if v:
                    total += v
                    treffer += 1
                    if quelle is None:
                        quelle = (seite, line)
                break
    if not quelle:
        return None
    return {"value": round(total, 1),
            "confidence": MEDIUM if treffer >= 2 else LOW,
            "source_page": quelle[0], "source_text": quelle[1]}


def extract_features(pages, word_pages=None) -> dict:
    """Alle MVP-Features aus den Seiten ableiten. Nur gefundene Features stehen
    im Ergebnis (kein Rauschen); jeder Wert trägt Herkunft + Confidence.

    Reihenfolge der Autorität (Punkt 10/11): die strengen, einheitengebundenen
    Extraktoren aus `quantities` gewinnen. Die alte zeilennahe Heuristik bleibt
    nur als Fallback für Formate, in denen die strenge Variante nichts findet —
    so wird kein bestehender Import schlechter (Punkt 28).
    """
    zeilen = _seiten_zeilen(pages)
    result: dict[str, dict] = {}

    # ── 1) Strenge Extraktion (Einheit + Kontext verlangt) ─────────────────
    from app.lv_import import quantities as q

    rows = q.build_rows(pages, word_pages)
    streng: dict[str, dict] = {}
    bauteile = q.component_counts(rows)
    for family, key in (("pump", "pump_count"), ("valve_2way", "valve_2way_count"),
                        ("valve_3way", "valve_3way_count"),
                        ("balancing_valve", "balancing_valve_count"),
                        ("radiator", "radiator_count"),
                        ("heat_meter", "heat_meter_count"),
                        ("floor_heating_manifold", "floor_heating_manifold_count")):
        if family in bauteile:
            streng[key] = bauteile[family]
    streng.update(q.boreholes(rows))
    streng.update(q.storages(rows))
    streng.update(q.pipe_lengths(rows))
    streng.update(q.generator_power(rows))
    result.update(streng)

    # ── 2) Alte Heuristik nur für noch fehlende Werte ──────────────────────
    for family, key in (("pump", "pump_count"), ("valve_2way", "valve_2way_count"),
                        ("valve_3way", "valve_3way_count"), ("heat_meter", "heat_meter_count"),
                        ("floor_heating_manifold", "floor_heating_manifold_count"),
                        ("buffer", "buffer_count"), ("heat_generator", "generator_count")):
        if _fehlt(result, key):
            f = _count_feature(zeilen, family)
            if f is not None:
                result[key] = f

    for key, fn in (("generator_type", _generator_type),
                    ("generator_power_kw", _generator_power),
                    ("storage_volume_l", _storage_volume),
                    ("pipe_length_m", _pipe_length)):
        if _fehlt(result, key):
            f = fn(zeilen)
            if f is not None:
                result[key] = f

    # Mehrwertige Merkmale (Punkt 6/7) — immer über die zentrale Registry.
    for key, registry in (("generator_types", "generator_types"),
                          ("heat_delivery_types", "heat_delivery_types")):
        if _fehlt(result, key):
            f = _mehrfachwerte(zeilen, registry)
            if f is not None:
                result[key] = f

    if _fehlt(result, "borehole_count") or _fehlt(result, "borehole_total_m"):
        cnt, mtr = _borehole(zeilen)
        if cnt is not None and _fehlt(result, "borehole_count"):
            result["borehole_count"] = cnt
        if mtr is not None and _fehlt(result, "borehole_total_m"):
            result["borehole_total_m"] = mtr

    _bauteilmengen_ergaenzen(pages, result)

    # Überlagerte Formularwerte dürfen nicht als technisch plausible Mengen
    # erscheinen. Solche Felder bleiben offen und gehen gezielt in die visuelle
    # Prüfung, statt z.B. CHF 87'050 als Sondenanzahl zu speichern.
    count = (result.get("borehole_count") or {}).get("value")
    if count is not None and not 1 <= float(count) <= 200:
        result["borehole_count"] = {
            "value": None, "confidence": LOW,
            "source_page": (result.get("borehole_count") or {}).get("source_page"),
            "source_text": "Parserwert unplausibel; visuell prüfen",
        }
    each = (result.get("borehole_length_each_m") or {}).get("value")
    if each is not None and not 10 <= float(each) <= 1000:
        result["borehole_length_each_m"] = {
            "value": None, "confidence": LOW,
            "source_page": (result.get("borehole_length_each_m") or {}).get("source_page"),
            "source_text": "Parserwert unplausibel; visuell prüfen",
        }

    # Warmwasser ist eine Ja/Nein-Angabe. Eine klare enthaltene BWW-Position
    # reicht als konservativer positiver Nachweis; bei fehlender Evidenz bleibt
    # das Feld bewusst offen.
    if _fehlt(result, "domestic_hot_water_included"):
        for seite, line in zeilen:
            low = line.casefold()
            if any(term in low for term in (
                "brauchwarmwasserspeicher", "warmwasserbereitung",
                "wassererwärmer", "wassererwaermer", "bww-speicher",
            )):
                result["domestic_hot_water_included"] = {
                    "value": True, "confidence": MEDIUM,
                    "source_page": seite, "source_text": line,
                }
                break
    return result


def _fehlt(result: dict, key: str) -> bool:
    """True, wenn für `key` noch kein belastbarer Wert vorliegt."""
    vorhanden = result.get(key)
    return vorhanden is None or vorhanden.get("value") is None


def _bauteilmengen_ergaenzen(pages, result: dict) -> None:
    """Block C #11 — Bauteilmengen aus Positionsblöcken NUR dort ergänzen, wo die
    zeilenbasierte Zählung nichts Belastbares fand. So profitieren block-
    formatierte LVs, ohne die bestehende Zählung zu verändern."""
    # Lazy import: positions.py nutzt _seiten_zeilen aus diesem Modul.
    from app.lv_import.positions import component_quantities

    mengen = component_quantities(pages)
    if not mengen:
        return
    familie_zu_key = {
        "pump": "pump_count", "valve_2way": "valve_2way_count",
        "valve_3way": "valve_3way_count", "heat_meter": "heat_meter_count",
        "floor_heating_manifold": "floor_heating_manifold_count",
        "buffer": "buffer_count",
    }
    for family, key in familie_zu_key.items():
        m = mengen.get(family)
        if not m:
            continue
        vorhanden = result.get(key)
        if vorhanden is None or vorhanden.get("value") is None:
            result[key] = {"value": int(round(m["summe"])), "confidence": MEDIUM,
                           "source_page": m["source_page"], "source_text": m["source_text"]}
    rohr = mengen.get("pipe")
    if rohr:
        vorhanden = result.get("pipe_length_m")
        if vorhanden is None or vorhanden.get("value") is None:
            result["pipe_length_m"] = {"value": round(rohr["summe"], 1), "confidence": MEDIUM,
                                       "source_page": rohr["source_page"], "source_text": rohr["source_text"]}
