from typing import List

# Empfohlene Preissteigerungsraten nach Energieträger (RAVEL Tabelle 3, aktualisiert)
PREISSTEIGERUNG_DEFAULTS = {
    "Öl": 2.5,
    "Gas": 2.5,
    "Wärmepumpe (Strom)": 1.5,
    "Holzpellets": 2.0,
    "Fernwärme": 2.0,
    "Strom allgemein": 1.5,
    "Sonstiges": 2.0,
}


def annuitaetsfaktor(i: float, n: int) -> float:
    """a = i·(1+i)^n / ((1+i)^n − 1)"""
    if n <= 0:
        return 1.0
    if i <= 0:
        return 1.0 / n
    return i * (1 + i) ** n / ((1 + i) ** n - 1)


def mittelwertfaktor(i: float, e: float, n: int) -> float:
    """
    Mittelwertfaktor nach RAVEL:
    i ≠ e: m = a · [1 − (1+r)^−n] / r   wobei r = (i−e)/(1+e)
    i = e: m = n · a
    """
    a = annuitaetsfaktor(i, n)
    if abs(i - e) < 1e-10:
        return n * a
    r = (i - e) / (1 + e)
    if abs(r) < 1e-10:
        return n * a
    return a * (1 - (1 + r) ** (-n)) / r


def berechne_variante(
    name: str,
    investition: float,
    nutzungsdauer: int,
    zinssatz_pct: float,
    betrieb_pa: float,
    betrieb_steigerung_pct: float,
    energie_pa: float,
    energie_steigerung_pct: float,
) -> dict:
    i = zinssatz_pct / 100.0
    e_b = betrieb_steigerung_pct / 100.0
    e_e = energie_steigerung_pct / 100.0
    n = nutzungsdauer

    a = annuitaetsfaktor(i, n)
    kapitalkosten = investition * a

    m_b = mittelwertfaktor(i, e_b, n)
    betrieb_mittel = betrieb_pa * m_b

    m_e = mittelwertfaktor(i, e_e, n)
    energie_mittel = energie_pa * m_e

    mjk = kapitalkosten + betrieb_mittel + energie_mittel

    warnings = []
    if nutzungsdauer > 40:
        warnings.append("Ungewöhnlich lange Nutzungsdauer (> 40 Jahre)")
    if energie_steigerung_pct > zinssatz_pct:
        warnings.append("Energiepreissteigerung > Zinssatz — Mittelwertfaktor steigt stark")

    return {
        "name": name,
        "investition": investition,
        "nutzungsdauer": n,
        "zinssatz_pct": zinssatz_pct,
        "annuitaetsfaktor": round(a, 5),
        "kapitalkosten": round(kapitalkosten, 0),
        "mittelwertfaktor_betrieb": round(m_b, 4),
        "betrieb_mittel": round(betrieb_mittel, 0),
        "mittelwertfaktor_energie": round(m_e, 4),
        "energie_mittel": round(energie_mittel, 0),
        "mjk": round(mjk, 0),
        "warnings": warnings,
    }


def vergleiche_varianten(varianten: List[dict]) -> dict:
    results = [berechne_variante(**v) for v in varianten]
    results_sorted = sorted(results, key=lambda x: x["mjk"])
    for idx, r in enumerate(results_sorted):
        r["rang"] = idx + 1
    return {
        "varianten": results_sorted,
        "guenstigste": results_sorted[0]["name"] if results_sorted else None,
        "preissteigerung_defaults": PREISSTEIGERUNG_DEFAULTS,
    }
