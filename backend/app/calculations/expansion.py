"""Expansionsgefäss — Auslegung nach Dominics Excel «Expanion_dominic_goulon.xlsx».

Methode (PHYSIK.md §8, aus dem Excel übernommen):
- e aus Stufentabelle (Mitteltemperatur × Medium; grösste Stufe ≤ t_mittel).
- Faktor X aus der Erzeugerleistung: ≤10 kW → 3.0, linear fallend bis 150 kW → 1.5.
- EWS (Erdsonden): e = 0.016 und X = 2.5 fix.
- Vex,tot = Vsys·e·X + Vsto·e   (EWS: Vsys·e·X)
- pfin = pSV / 1.15 · p0 = Höhe·9.81·1050·10⁻⁵ + 0.3 bar
- VN,min = Vex,tot · (pfin + 1) / (pfin − p0) → nächstgrössere Norm-Grösse.
"""
from typing import Optional

# Ausdehnung e (absolut, nicht %) je Mitteltemperatur — Stufen wie im Excel
E_TABELLE = {
    "heizungswasser": {15: 0.002, 20: 0.0027, 25: 0.0033, 30: 0.004, 35: 0.00575,
                       40: 0.0075, 45: 0.00975, 50: 0.012, 55: 0.0145, 60: 0.017,
                       65: 0.02, 70: 0.023, 75: 0.026, 80: 0.029, 85: 0.0325,
                       90: 0.036, 95: 0.0397, 100: 0.0434, 105: 0.0477, 110: 0.052},
    "frostschutz30": {15: 0.0058125, 20: 0.0084, 25: 0.001075, 30: 0.0129, 35: 0.0145,
                      40: 0.016, 45: 0.0185, 50: 0.021, 55: 0.0235, 60: 0.026,
                      65: 0.0285, 70: 0.031, 75: 0.0345, 80: 0.038, 85: 0.041,
                      90: 0.044, 95: 0.048, 100: 0.052, 105: 0.056, 110: 0.06},
    "frostschutz40": {15: 0.0065625, 20: 0.0092, 25: 0.011875, 30: 0.017, 35: 0.019,
                      40: 0.021, 45: 0.00225, 50: 0.024, 55: 0.027, 60: 0.03,
                      65: 0.033, 70: 0.036, 75: 0.0395, 80: 0.043, 85: 0.0465,
                      90: 0.05, 95: 0.054, 100: 0.058, 105: 0.0655, 110: 0.073},
}

# Handelsübliche Nenngrössen [Liter]
NORM_GROESSEN = [8, 12, 18, 25, 35, 50, 80, 100, 140, 200, 250, 300, 400, 500, 600, 800, 1000]


def _f(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def ausdehnung_e(t_mittel: float, medium: str = "heizungswasser") -> float:
    """Stufenwert wie im Excel (MATCH mit 1): grösste Stufe ≤ t_mittel."""
    tabelle = E_TABELLE.get(medium, E_TABELLE["heizungswasser"])
    stufen = sorted(tabelle)
    passend = [t for t in stufen if t <= t_mittel]
    return tabelle[passend[-1] if passend else stufen[0]]


def faktor_x(leistung_kw: float) -> float:
    """Wasserreserve-Faktor X: ≤10 kW → 3.0, linear bis 150 kW → 1.5, danach 1.5.

    Wie das Excel (VLOOKUP mit Stufen auf ganze kW)."""
    kw = int(leistung_kw)
    if kw <= 10:
        return 3.0
    if kw >= 150:
        return 1.5
    return 3.0 - (kw - 10) * (1.5 / 140)


def berechne_expansion(d: dict) -> Optional[dict]:
    """Nennvolumen VN nach Dominics Excel-Methode.

    Eingaben (node.data): anlageinhalt_l (Vsys), speicher_l (Vsto, optional),
    t_mittel, leistung_kw, medium (heizungswasser|frostschutz30|frostschutz40|ews),
    hoehe_m (statische Höhe), psv_bar (SV-Ansprechdruck).
    """
    vsys = _f(d.get("anlageinhalt_l"))
    vsto = _f(d.get("speicher_l")) or 0.0
    t_mittel = _f(d.get("t_mittel"))
    leistung = _f(d.get("leistung_kw"))
    hoehe = _f(d.get("hoehe_m"))
    psv = _f(d.get("psv_bar"))
    medium = str(d.get("medium") or "heizungswasser")
    ews = medium == "ews"
    if not vsys or vsys <= 0 or hoehe is None or psv is None or (not ews and (t_mittel is None or leistung is None)):
        return None

    if ews:
        e, x = 0.016, 2.5
        vex_tot = vsys * e * x
    else:
        e = ausdehnung_e(t_mittel, medium)
        x = faktor_x(leistung)
        vex_tot = vsys * e * x + vsto * e

    pfin = psv / 1.15                                  # Ventilgenauigkeit
    p0 = hoehe * 9.81 * 1050 * 1e-5 + 0.3              # Vordruck [bar]
    if pfin <= p0:
        return {"fehler": f"pfin = {pfin:.2f} bar (pSV/1.15) muss über dem Vordruck p0 = {p0:.2f} bar liegen — SV-Ansprechdruck zu klein oder Anlage zu hoch"}

    vn = vex_tot * (pfin + 1) / (pfin - p0)
    vorschlag = next((g for g in NORM_GROESSEN if g >= vn), NORM_GROESSEN[-1])
    return {
        "e": round(e, 5),
        "x": round(x, 3),
        "vex_l": round(vsys * e, 2),
        "vwr_l": round(vsys * e * (x - 1), 2),
        "vex_tot_l": round(vex_tot, 2),
        "p0_bar": round(p0, 3),
        "pfin_bar": round(pfin, 3),
        "vn_l": round(vn, 1),
        "vorschlag_l": vorschlag,
    }
