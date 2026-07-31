"""Punkt 4 — BKP-spezifische Ähnlichkeit.

Jede BKP-Gruppe gewichtet ANDERE Merkmale: die Wärmeerzeugung stützt sich auf
Erzeugertyp/-leistung/Bohrmeter/Speicher, die Verteilung auf EBF/Pumpen/Ventile/
Rohrmeter, die Messung auf Wärmezähler/Einheiten/Nutzung.

Fehlende Werte verschlechtern den Score NICHT: nur Merkmale, die in BEIDEN
Profilen vorhanden sind, zählen — ihr Gewicht bildet den Nenner. Fehlt alles,
gibt es keinen Score (→ manuell schätzen, nie 0 CHF; siehe Punkt 5).

Die Gewichte sind zentral und bewusst noch nicht „final" — die alte Methode wird
erst ersetzt, wenn diese hier per Backtest messbar besser ist.
"""
from __future__ import annotations

from typing import Optional

# Kategoriale Merkmale: exakte Übereinstimmung statt Zahlenverhältnis.
CATEGORICAL = {"generator_type", "building_use"}

# Zentrale, konfigurierbare Gewichte je BKP-Gruppe (Merkmal → Gewicht).
BKP_WEIGHTS: dict[str, dict[str, float]] = {
    "erzeugung": {
        "generator_type": 3.0,
        "generator_power_kw": 3.0,
        "borehole_total_m": 2.0,
        "storage_volume_l": 1.5,
        "generator_count": 1.0,
    },
    "verteilung": {
        "ebf_m2": 2.0,
        "generator_power_kw": 1.5,
        "valve_2way_count": 1.5,
        "valve_3way_count": 1.0,
        "pipe_length_m": 1.5,
    },
    "messung": {
        "units": 2.0,
        "building_use": 1.5,
    },
}


def _num(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def feature_similarity(key: str, a, b) -> Optional[float]:
    """Ähnlichkeit eines Merkmals in [0,1] — oder None, wenn ein Wert fehlt
    (fehlende Merkmale werden aus der Wertung ausgeschlossen, nicht bestraft)."""
    if a is None or a == "" or b is None or b == "":
        return None
    if key in CATEGORICAL:
        return 1.0 if str(a).strip().lower() == str(b).strip().lower() else 0.0
    fa, fb = _num(a), _num(b)
    if fa is None or fb is None:
        return None
    if fa == 0 and fb == 0:
        return 1.0
    if fa <= 0 or fb <= 0:
        return 1.0 if fa == fb else 0.0
    return min(fa, fb) / max(fa, fb)   # Verhältnis-Ähnlichkeit


def _datenbasis(verfuegbar: int, gesamt: int) -> str:
    if gesamt == 0 or verfuegbar == 0:
        return "keine"
    anteil = verfuegbar / gesamt
    if anteil >= 0.66:
        return "gut"
    if anteil >= 0.34:
        return "mittel"
    return "schwach"


def bkp_similarity(target: dict, referenz: dict, gruppe: str) -> dict:
    """Ähnlichkeit zweier Vergleichsprofile für EINE BKP-Gruppe.

    Rückgabe (auch Erklärung für Punkt 5):
        score        0..1 oder None (keine gemeinsamen Merkmale)
        datenbasis   keine | schwach | mittel | gut
        treiber      je Merkmal: Ähnlichkeit, Gewicht, Werte, verfügbar
    """
    weights = BKP_WEIGHTS.get(gruppe, {})
    total_w = 0.0
    score_sum = 0.0
    verfuegbar = 0
    treiber = []
    for key, w in weights.items():
        a, b = target.get(key), referenz.get(key)
        sim = feature_similarity(key, a, b)
        if sim is None:
            treiber.append({"key": key, "verfuegbar": False, "gewicht": w,
                            "ziel": a, "referenz": b})
            continue
        verfuegbar += 1
        total_w += w
        score_sum += w * sim
        treiber.append({"key": key, "verfuegbar": True, "gewicht": w,
                        "aehnlichkeit": round(sim, 3), "ziel": a, "referenz": b})
    score = round(score_sum / total_w, 3) if total_w > 0 else None
    return {
        "gruppe": gruppe,
        "score": score,
        "datenbasis": _datenbasis(verfuegbar, len(weights)),
        "treiber": treiber,
    }


def ranking(target: dict, referenzen: list[tuple], gruppe: str) -> list[dict]:
    """Referenzen (Liste von (id, name, profil)) nach BKP-Ähnlichkeit sortieren.
    Referenzen ohne gemeinsame Merkmale (score None) landen hinten."""
    out = []
    for ref_id, name, profil in referenzen:
        res = bkp_similarity(target, profil, gruppe)
        out.append({"ref_id": ref_id, "name": name, **res})
    out.sort(key=lambda r: (r["score"] is not None, r["score"] or 0), reverse=True)
    return out
