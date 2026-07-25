"""Punkt 5 — erklärbare BKP-Kostenschätzung.

Für jede BKP-Position liefert `schaetze_bkp` eine nachvollziehbare Schätzung:
    - welche Referenzen verwendet wurden (+ Ähnlichkeit + roher/skalierter Betrag)
    - die relevanten Treiber (aus der BKP-Ähnlichkeit, Punkt 4)
    - Median und Bandbreite der vergleichbaren Referenzkosten
    - Datenbasis schwach/mittel/gut
    - keine Daten → status "manuell", Betrag None (NIE 0 CHF)

Referenzkosten werden auf die Zielgrösse skaliert (Kennwert je BKP-Gruppe:
Erzeugung→Leistung, Verteilung→EBF, Messung→Wärmezähler). Fehlt der Kennwert,
geht der Betrag unskaliert ein (schwächere Basis, transparent markiert).
"""
from __future__ import annotations

import statistics
from typing import Optional

from app.bkp_similarity import bkp_similarity, BKP_WEIGHTS

# BKP-Hauptgruppe (erste 3 Stellen) → Ähnlichkeits-/Gewichtsgruppe. Bewusst
# konfigurierbar; Grundlage sind die Schweizer BKP-Gruppen (241 Energielagerung,
# 242 Wärmeerzeugung, 243 Wärmeverteilung, 247 Spezialanlagen, 248 Dämmungen).
BKP_GROUP = {
    "241": "erzeugung",   # Energielagerung / Speicher
    "242": "erzeugung",   # Wärmeerzeugung
    "243": "verteilung",  # Wärmeverteilung
    "247": "messung",     # Spezialanlagen (u. a. Messung/Regelung)
    "248": "verteilung",  # Dämmungen (Verteilung)
    "249": "verteilung",  # Diverses
}
DEFAULT_GROUP = "verteilung"

# Kennwert-Treiber je Gruppe, an dem die Referenzkosten skaliert werden.
KENNWERT_TREIBER = {
    "erzeugung": "generator_power_kw",
    "verteilung": "ebf_m2",
    "messung": "heat_meter_count",
}


def gruppe_fuer_bkp(bkp_nr: str) -> str:
    return BKP_GROUP.get(str(bkp_nr).strip()[:3], DEFAULT_GROUP)


def _num(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _datenbasis(n: int, avg_sim: float, skaliert_anteil: float) -> str:
    if n == 0:
        return "keine"
    if n >= 3 and avg_sim >= 0.55 and skaliert_anteil >= 0.5:
        return "gut"
    if n <= 1 or avg_sim < 0.35 or skaliert_anteil == 0:
        return "schwach"
    return "mittel"


def schaetze_bkp(target: dict, referenzen: list[dict], bkp_nr: str,
                 gruppe: Optional[str] = None, top_n: int = 5) -> dict:
    """target: Vergleichsprofil des Zielprojekts.
    referenzen: [{ref_id, name, profil, kosten: {bkp_nr: betrag}}].
    """
    gruppe = gruppe or gruppe_fuer_bkp(bkp_nr)
    treiber_key = KENNWERT_TREIBER.get(gruppe)
    ziel_treiber = _num(target.get(treiber_key)) if treiber_key else None

    kandidaten = []
    for r in referenzen:
        betrag = _num((r.get("kosten") or {}).get(bkp_nr))
        if betrag is None:
            continue
        sim = bkp_similarity(target, r.get("profil") or {}, gruppe)
        if sim["score"] is None:
            continue
        ref_treiber = _num((r.get("profil") or {}).get(treiber_key)) if treiber_key else None
        if ziel_treiber and ref_treiber and ref_treiber > 0:
            skaliert = betrag * (ziel_treiber / ref_treiber)
            skala = f"{treiber_key}: {ref_treiber:g} → {ziel_treiber:g}"
        else:
            skaliert = betrag
            skala = None
        kandidaten.append({
            "ref_id": r.get("ref_id"), "name": r.get("name"),
            "score": sim["score"], "betrag_roh": round(betrag),
            "betrag_skaliert": round(skaliert), "skalierung": skala,
            "treiber": sim["treiber"],
        })

    kandidaten.sort(key=lambda k: k["score"], reverse=True)
    verwendet = kandidaten[:top_n]

    if not verwendet:
        return {
            "bkp_nr": bkp_nr, "gruppe": gruppe, "status": "manuell",
            "betrag": None, "median": None, "bandbreite": None,
            "datenbasis": "keine", "referenzen": [], "treiber": [],
            "hinweis": "Keine passenden Referenzen — bitte manuell schätzen (nie 0 CHF).",
        }

    werte = sorted(k["betrag_skaliert"] for k in verwendet)
    median = statistics.median(werte)
    avg_sim = statistics.mean(k["score"] for k in verwendet)
    skaliert_anteil = sum(1 for k in verwendet if k["skalierung"]) / len(verwendet)
    return {
        "bkp_nr": bkp_nr, "gruppe": gruppe, "status": "geschaetzt",
        "betrag": round(median), "median": round(median),
        "bandbreite": [werte[0], werte[-1]],
        "datenbasis": _datenbasis(len(verwendet), avg_sim, skaliert_anteil),
        "anzahl_referenzen": len(verwendet),
        "referenzen": [{k: v for k, v in c.items() if k != "treiber"} for c in verwendet],
        "treiber": verwendet[0]["treiber"],   # relevante Treiber der besten Referenz
    }
