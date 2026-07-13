"""Grobkostenschätzung (BKP) — Berechnungskern. Eigenständiges Modul, siehe
models/grobkostenschaetzung.py und CLAUDE.md, Abschnitt "Grobkostenschätzung
(BKP)" für die Einordnung neben der bestehenden Auswertung/Kostenschätzung.

Reine Funktionen (Dicts/Listen rein, Dicts/Zahlen raus) — keine DB-Abhängigkeit,
damit jede Formel isoliert mit pytest getestet werden kann (CLAUDE.md-Regel).
Alle 7 Bausteine:
1. Zeitgewicht          — Halbwertszeit 3 Jahre
2. Ähnlichkeitssuche    — Hard-Filter + Score + Zeitgewicht → Rang (Top 3–5)
3. Hochrechnung Weg A   — Kennwert (CHF/kW, CHF/m² EBF, %-Anteil bei BKP 249)
4. Faktor-Brücke Weg B  — gelernte Mengen-Faktoren (nur mit Stufe-2-Daten)
5. Kreuzcheck           — Abweichung Weg A/B → Vertrauen
6. Potenzfunktion       — K = a×X^b, nur wenn n≥8 im Segment und R²>0.7
7. Korrekturfaktoren    — Sanierung/Weiterbetrieb/Etappierung, aus DB-Tabelle
"""
import math
from datetime import date
from typing import Optional

import numpy as np

KATEGORIE_ORDER = ["EFH", "MFH_2_5", "MFH_6_10", "MFH_11plus", "Gewerbe", "Industrie"]

# Treiber je BKP-Gruppe für Weg A (Kennwert-Hochrechnung). BKP 249 hat keinen
# Treiber — läuft als %-Anteil vom Zwischentotal (siehe weg_a_bkp_249).
_TREIBER_FELD = {"241": "leistung_kw", "242": "leistung_kw", "243": "ebf_m2", "247": "ebf_m2", "248": "ebf_m2"}
_TREIBER_EINHEIT = {"241": "CHF/kW", "242": "CHF/kW", "243": "CHF/m² EBF", "247": "CHF/m² EBF", "248": "CHF/m² EBF"}

# Faktor-Brücke (Weg B): welche Stufe-2-Menge, geteilt durch welche
# Schlüsselgrösse, gehört zu welcher BKP-Gruppe.
_FAKTOR_DEF = {
    "rohr_faktor": {"menge_feld": "rohrmeter", "schluessel_feld": "ebf_m2", "bkp": "243", "einheit": "CHF/m"},
    "hk_faktor": {"menge_feld": "hk_anzahl", "schluessel_feld": "ebf_m2", "bkp": "243", "einheit": "CHF/Stk"},
    "bohr_faktor": {"menge_feld": "bohrmeter", "schluessel_feld": "leistung_kw", "bkp": "241", "einheit": "CHF/m"},
}


# ── 1) Zeitgewicht ───────────────────────────────────────────────────────────

def zeitgewicht(alter_jahre: float, halbwertszeit_jahre: float = 3.0) -> float:
    """Exponentieller Zerfall: neuere Referenzen zählen mehr. Bei
    Halbwertszeit 3.0 Jahre: 3 Jahre alt → 0.5, heute (0 Jahre) → 1.0."""
    if alter_jahre < 0:
        alter_jahre = 0.0
    lam = math.log(2) / halbwertszeit_jahre
    return math.exp(-lam * alter_jahre)


def alter_in_jahren(datum_abrechnung: date, heute: Optional[date] = None) -> float:
    heute = heute or date.today()
    return (heute - datum_abrechnung).days / 365.25


# ── 2) Ähnlichkeitssuche (3 Ebenen) ─────────────────────────────────────────

def hard_filter(kandidat: dict, ziel: dict) -> bool:
    """Ebene 1 — muss identisch sein, sonst scheidet die Referenz aus."""
    return (
        kandidat.get("wp_typ") == ziel.get("wp_typ")
        and kandidat.get("projektart") == ziel.get("projektart")
        and bool(kandidat.get("hat_erdsonden")) == bool(ziel.get("hat_erdsonden"))
    )


def groessennaehe(a: Optional[float], b: Optional[float]) -> float:
    """Verhältnis min/max, 1.0 bei Gleichheit — log-skalenfreundlich: 50 vs.
    100 ist gleich "nah" wie 100 vs. 200."""
    if not a or not b or a <= 0 or b <= 0:
        return 0.0
    return min(a, b) / max(a, b)


def kategorienaehe(a: str, b: str) -> float:
    """Gleiche Gebäudekategorie 1.0, Nachbarklasse (z.B. MFH_2_5↔MFH_6_10)
    0.5, sonst 0.0."""
    if a == b:
        return 1.0
    try:
        i, j = KATEGORIE_ORDER.index(a), KATEGORIE_ORDER.index(b)
    except ValueError:
        return 0.0
    return 0.5 if abs(i - j) == 1 else 0.0


def abgabetyp_naehe(a: str, b: str) -> float:
    """Gleiche Wärmeabgabe 1.0, wenn eine Seite "gemischt" ist 0.5, sonst 0.2."""
    if a == b:
        return 1.0
    if a == "gemischt" or b == "gemischt":
        return 0.5
    return 0.2


def aehnlichkeits_score(kandidat: dict, ziel: dict) -> float:
    """Ebene 2 — gewichtete Summe (0..1)."""
    return (
        0.35 * groessennaehe(kandidat.get("ebf_m2"), ziel.get("ebf_m2"))
        + 0.25 * groessennaehe(kandidat.get("leistung_kw"), ziel.get("leistung_kw"))
        + 0.20 * kategorienaehe(kandidat.get("gebaeudekategorie"), ziel.get("gebaeudekategorie"))
        + 0.20 * abgabetyp_naehe(kandidat.get("abgabe_dominant"), ziel.get("abgabe_dominant"))
    )


def finde_referenzen(kandidaten: list, ziel: dict, top_n: int = 5, heute: Optional[date] = None) -> list:
    """Ebene 1+2+3: Hard-Filter → Score → ×Zeitgewicht = Rang. Gibt die
    Kandidaten (angereichert mit 'score'/'zeitgewicht'/'rang') absteigend
    sortiert zurück — oben die Top n (3–5), wie im Auftrag verlangt."""
    gefiltert = [k for k in kandidaten if hard_filter(k, ziel)]
    angereichert = []
    for k in gefiltert:
        score = aehnlichkeits_score(k, ziel)
        gewicht = zeitgewicht(alter_in_jahren(k["datum_abrechnung"], heute))
        rang = score * gewicht
        angereichert.append({**k, "score": round(score, 4), "zeitgewicht": round(gewicht, 4), "rang": round(rang, 4)})
    angereichert.sort(key=lambda r: r["rang"], reverse=True)
    return angereichert[:top_n]


# ── Hilfsfunktion: Perzentil (für Bandbreite P25–P75) ───────────────────────

def perzentil(werte: list, q: float) -> float:
    """Linear interpoliertes Perzentil."""
    v = sorted(werte)
    if not v:
        return 0.0
    pos = (len(v) - 1) * q
    lo = math.floor(pos)
    rest = pos - lo
    return v[lo] + rest * (v[lo + 1] - v[lo]) if lo + 1 < len(v) else v[lo]


# ── 3) Hochrechnung Weg A — Kennwert ────────────────────────────────────────

def kennwerte_je_referenz(referenzen: list, bkp_gruppe: str) -> list:
    """Kennwert (Betrag/Treiber) je Referenz für eine BKP-Gruppe — nur
    Referenzen mit Betrag>0 und gültigem Treiber zählen mit."""
    feld = _TREIBER_FELD.get(bkp_gruppe)
    out = []
    for r in referenzen:
        betrag = (r.get("bkp_betraege") or {}).get(bkp_gruppe)
        treiber = r.get(feld) if feld else None
        if betrag and betrag > 0 and treiber and treiber > 0:
            jahr = r["datum_abrechnung"].year if hasattr(r.get("datum_abrechnung"), "year") else None
            out.append({"kennwert": betrag / treiber, "gewicht": r.get("rang", 1.0), "name": r.get("name"), "jahr": jahr})
    return out


def weg_a_hochrechnung(referenzen: list, bkp_gruppe: str, ziel: dict) -> Optional[dict]:
    """Weg A für 241/242/243/247/248: gewichteter Mittelwert des Kennwerts ×
    Treibergrösse des Zielprojekts. BKP 249 läuft separat (weg_a_bkp_249)."""
    if bkp_gruppe not in _TREIBER_FELD:
        raise ValueError(f"BKP {bkp_gruppe} hat keinen Treiber — 249 läuft über weg_a_bkp_249()")
    paare = kennwerte_je_referenz(referenzen, bkp_gruppe)
    if not paare:
        return None
    treiber_wert = ziel.get(_TREIBER_FELD[bkp_gruppe])
    if not treiber_wert or treiber_wert <= 0:
        return None
    sw = sum(p["gewicht"] for p in paare)
    kennwert_mittel = sum(p["kennwert"] * p["gewicht"] for p in paare) / sw
    werte = [p["kennwert"] for p in paare]
    return {
        "betrag": kennwert_mittel * treiber_wert,
        "kennwert": kennwert_mittel,
        "einheit": _TREIBER_EINHEIT[bkp_gruppe],
        "n": len(paare),
        "bandbreite": (perzentil(werte, 0.25) * treiber_wert, perzentil(werte, 0.75) * treiber_wert),
        "referenzen": paare,
    }


def weg_a_bkp_249(referenzen: list, zwischentotal: float) -> Optional[dict]:
    """BKP 249 (Diverses) als gewichteter %-Anteil vom Zwischentotal der
    übrigen BKP-Gruppen (typisch 8–12%) — hat keinen eigenen Treiber."""
    paare = []
    for r in referenzen:
        betraege = r.get("bkp_betraege") or {}
        betrag_249 = betraege.get("249")
        subtotal_andere = sum(v for k, v in betraege.items() if k != "249" and v)
        if betrag_249 and betrag_249 > 0 and subtotal_andere > 0:
            paare.append({"anteil": betrag_249 / subtotal_andere, "gewicht": r.get("rang", 1.0), "name": r.get("name")})
    if not paare or zwischentotal <= 0:
        return None
    sw = sum(p["gewicht"] for p in paare)
    anteil_mittel = sum(p["anteil"] * p["gewicht"] for p in paare) / sw
    return {
        "betrag": anteil_mittel * zwischentotal, "kennwert": anteil_mittel, "einheit": "% vom Zwischentotal",
        "n": len(paare), "referenzen": paare,
    }


# ── 4) Faktor-Brücke Weg B — nur mit Stufe-2-Daten ─────────────────────────

def lerne_faktor(referenzen: list, faktor_name: str) -> Optional[dict]:
    """Lernt aus Referenzen (zeitgewichtet) den Mengen-Faktor (z.B. m Rohr
    pro m² EBF) UND den Einheitspreis (CHF/m) für die zugehörige BKP-Gruppe."""
    d = _FAKTOR_DEF[faktor_name]
    menge_paare, preis_paare = [], []
    for r in referenzen:
        menge = r.get(d["menge_feld"])
        schluessel = r.get(d["schluessel_feld"])
        betrag = (r.get("bkp_betraege") or {}).get(d["bkp"])
        gewicht = r.get("rang", 1.0)
        if menge and menge > 0 and schluessel and schluessel > 0:
            menge_paare.append((menge / schluessel, gewicht))
        if betrag and betrag > 0 and menge and menge > 0:
            preis_paare.append((betrag / menge, gewicht))
    if not menge_paare or not preis_paare:
        return None
    faktor = sum(v * g for v, g in menge_paare) / sum(g for _, g in menge_paare)
    einheitspreis = sum(v * g for v, g in preis_paare) / sum(g for _, g in preis_paare)
    return {"faktor": faktor, "einheitspreis": einheitspreis, "bkp": d["bkp"], "einheit": d["einheit"], "n": len(menge_paare)}


def weg_b_hochrechnung(referenzen: list, faktor_name: str, ziel: dict) -> Optional[dict]:
    """Weg B: menge_geschätzt = gelernter Faktor × Schlüsselgrösse des
    Zielprojekts, kosten = menge × gelernter Einheitspreis."""
    d = _FAKTOR_DEF[faktor_name]
    gelernt = lerne_faktor(referenzen, faktor_name)
    if not gelernt:
        return None
    schluessel_ziel = ziel.get(d["schluessel_feld"])
    if not schluessel_ziel or schluessel_ziel <= 0:
        return None
    menge_geschaetzt = gelernt["faktor"] * schluessel_ziel
    betrag = menge_geschaetzt * gelernt["einheitspreis"]
    return {
        "betrag": betrag, "bkp": d["bkp"], "menge_geschaetzt": menge_geschaetzt,
        "faktor": gelernt["faktor"], "einheitspreis": gelernt["einheitspreis"], "n": gelernt["n"],
        "rechenweg": f"{faktor_name} {gelernt['faktor']:.2f} × {schluessel_ziel:g} = "
                     f"{menge_geschaetzt:.0f} × {gelernt['einheitspreis']:.0f} {gelernt['einheit']} = {betrag:.0f} CHF",
    }


# ── 5) Kreuzcheck — Abweichung Weg A/B → Vertrauen ─────────────────────────

def kreuzcheck(betrag_a: Optional[float], betrag_b: Optional[float], n_referenzen: int) -> dict:
    """Beide Wege vorhanden → Abweichung entscheidet. Nur Weg A → Vertrauen
    nach Anzahl Referenzen (n≥4 hoch, 2–3 mittel, <2 niedrig)."""
    if betrag_a and betrag_b:
        abweichung = abs(betrag_a - betrag_b) / betrag_a if betrag_a else 1.0
        if abweichung < 0.15:
            vertrauen = "hoch"
        elif abweichung < 0.30:
            vertrauen = "mittel"
        else:
            vertrauen = "niedrig"
        hinweis = "Abweichung zwischen Kennwert- und Mengen-Weg gross — manuell prüfen" if vertrauen == "niedrig" else None
        return {"vertrauen": vertrauen, "abweichung_prozent": round(abweichung * 100, 1), "hinweis": hinweis}

    if n_referenzen >= 4:
        vertrauen = "hoch"
    elif n_referenzen >= 2:
        vertrauen = "mittel"
    else:
        vertrauen = "niedrig"
    return {"vertrauen": vertrauen, "abweichung_prozent": None, "hinweis": None}


# ── 6) Potenzfunktion — K = a×X^b (nur bei n≥8, R²>0.7) ────────────────────

def potenzfit(x_werte: list, y_werte: list, gewichte: list) -> Optional[dict]:
    """Log-log lineare Regression: log(y) = log(a) + b×log(x), gewichtet mit
    den Zeitgewichten (als Regressionsgewichte, per numpy.polyfit)."""
    x = np.array(x_werte, dtype=float)
    y = np.array(y_werte, dtype=float)
    w = np.array(gewichte, dtype=float)
    if len(x) < 2 or np.any(x <= 0) or np.any(y <= 0):
        return None
    log_x, log_y = np.log(x), np.log(y)
    b, log_a = np.polyfit(log_x, log_y, 1, w=np.sqrt(w))
    a = math.exp(log_a)
    y_pred = a * x ** b
    ss_res = np.sum(w * (y - y_pred) ** 2)
    y_mittel = np.sum(w * y) / np.sum(w)
    ss_tot = np.sum(w * (y - y_mittel) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {"a": float(a), "b": float(b), "r2": r2}


def potenzfunktion_schaetzung(referenzen: list, bkp_gruppe: str, x_feld: str, ziel_x: float) -> Optional[dict]:
    """Nur verwenden wenn n≥8 im Segment UND R²>0.7 — sonst None, Aufrufer
    fällt auf Weg A zurück (siehe Auftrag Punkt 6)."""
    punkte = []
    for r in referenzen:
        betrag = (r.get("bkp_betraege") or {}).get(bkp_gruppe)
        x = r.get(x_feld)
        if betrag and betrag > 0 and x and x > 0:
            punkte.append((x, betrag, r.get("rang", 1.0)))
    if len(punkte) < 8:
        return None
    fit = potenzfit([p[0] for p in punkte], [p[1] for p in punkte], [p[2] for p in punkte])
    if not fit or fit["r2"] <= 0.7:
        return None
    betrag = fit["a"] * ziel_x ** fit["b"]
    return {"betrag": betrag, "a": fit["a"], "b": fit["b"], "r2": fit["r2"], "n": len(punkte)}


# ── 7) Korrekturfaktoren ────────────────────────────────────────────────────

def wende_korrekturfaktoren_an(betrag: float, ziel: dict, faktoren: list) -> dict:
    """Multipliziert der Reihe nach alle zutreffenden, aktiven Korrekturfaktoren.
    faktoren: [{"name": "Sanierung", "faktor": 1.2, "aktiv": True}, ...]."""
    zuordnung = {
        "Sanierung": ziel.get("projektart") == "Sanierung",
        "Weiterbetrieb": bool(ziel.get("weiterbetrieb_umbau")),
        "Etappierung": bool(ziel.get("etappierung")),
    }
    ergebnis = betrag
    angewendet = []
    for f in faktoren:
        if not f.get("aktiv", True):
            continue
        if zuordnung.get(f["name"]):
            ergebnis *= f["faktor"]
            angewendet.append(f"{f['name']} ×{f['faktor']}")
    return {"betrag": ergebnis, "angewendet": angewendet}
