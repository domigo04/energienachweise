"""Betriebsfälle einer Wärmepumpenanlage mit Brauchwarmwasser-Vorrang.

Ein 3-Weg-Ventil gibt es in zwei Ausführungen. Das mischende Ventil regelt eine
Temperatur; das **umschaltende** Ventil kennt nur zwei Stellungen. Sitzt es im
Kreis zwischen Wärmepumpe und technischem Speicher, läuft die Anlage entweder
im Brauchwarmwasser- oder im Heizbetrieb — nie in beiden zugleich.

Daraus folgt die zentrale Regel dieses Moduls: **Heizlast und BWW-Ladeleistung
werden nie addiert.** Jeder Betriebsfall wird einzeln gerechnet; für die
Auslegung der Quellenseite gilt der grössere der beiden.

Die Bemessung des Brauchwarmwassers selbst (Speichervolumen und Ladeleistung
aus Wohnungen, Personen oder Ausbaustandard) gehört NICHT hierher. Sie folgt
aus Dominics Berechnungsexcel, sobald es vorliegt. Bis dahin ist die
Ladeleistung eine sichtbare Eingabe.
"""

from typing import Optional

from app.calculations.waermepumpe import berechne_waermepumpe
from app.calculations.grundlagen import mit_grundlage

HEIZEN = "heizen"
BWW = "bww"


def _zahl(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def ist_umschaltventil(d: dict) -> bool:
    """Umschaltend statt mischend — die Funktion ist eine sichtbare Eingabe."""
    return str((d or {}).get("funktion") or "mischend") == "umschaltend"


def _bww_daten(wp_d: dict, ladeleistung_kw: Optional[float]) -> dict:
    """Die Wärmepumpe im BWW-Betriebspunkt.

    Andere Vorlauftemperatur, anderer COP, andere Leistung — sonst dieselbe
    Maschine und dieselbe Quellenseite.
    """
    return {
        **wp_d,
        "leistung_kw": ladeleistung_kw,
        "vl_temp": wp_d.get("bww_vl_temp"),
        "rl_temp": wp_d.get("bww_rl_temp"),
        "cop": wp_d.get("bww_cop"),
        "p_el_kw": wp_d.get("bww_p_el_kw"),
    }


def _kennwerte(res: dict) -> dict:
    """Nur die Grössen, die einen Betriebsfall unterscheiden."""
    return {
        "q_heiz_kw": res.get("q_heat_kw"),
        "vl_c": res.get("heating_vl"),
        "rl_c": res.get("heating_rl"),
        "dt_k": res.get("heating_dt"),
        "heizvolumenstrom_m3h": res.get("heating_flow_m3h"),
        "cop": res.get("cop"),
        "p_el_kw": res.get("p_el_kw"),
        "q_source_kw": res.get("q_source_kw"),
        "sole_dt_k": res.get("source_dt"),
        "solevolumenstrom_m3h": res.get("source_flow_m3h"),
        "warnungen": res.get("warnings") or [],
    }


def betriebsfaelle(wp_d: dict, *, bww_ladeleistung_kw: Optional[float] = None,
                   hat_quellenseite: bool = False,
                   sole_ce_auto: Optional[float] = None) -> dict:
    """Heiz- und BWW-Betrieb getrennt rechnen und den massgebenden Fall nennen.

    Massgebend für die Quellenseite — Erdsonden, Solekreis, Solepumpe — ist der
    Fall mit der grösseren Quellenleistung. Der andere Fall bleibt sichtbar,
    damit der Fachplaner beide Zustände beurteilen kann.
    """
    heizen = _kennwerte(berechne_waermepumpe(wp_d, hat_quellenseite, sole_ce_auto))
    heizen.update({"key": HEIZEN, "titel": "Heizbetrieb"})

    ladeleistung = _zahl(bww_ladeleistung_kw)
    if ladeleistung is None:
        ladeleistung = _zahl(wp_d.get("bww_leistung_kw"))
    bww = _kennwerte(berechne_waermepumpe(
        _bww_daten(wp_d, ladeleistung), hat_quellenseite, sole_ce_auto))
    bww.update({"key": BWW, "titel": "Brauchwarmwasser-Vorrang"})

    faelle = [heizen, bww]
    warnungen = []

    fehlend = [b for b in ("bww_vl_temp", "bww_cop") if _zahl(wp_d.get(b)) is None]
    if ladeleistung is None:
        warnungen.append(
            "BWW-Ladeleistung fehlt; der Vorrangbetrieb ist damit nicht "
            "berechenbar. Sie ist bis auf Weiteres eine Eingabe."
        )
    if fehlend:
        warnungen.append(
            "Für den BWW-Betriebspunkt fehlen Vorlauftemperatur oder COP bei "
            "BWW-Temperatur. Der COP im Heizbetrieb gilt dort nicht."
        )

    mit_quelle = [f for f in faelle if f["q_source_kw"] is not None]
    massgebend = max(mit_quelle, key=lambda f: f["q_source_kw"]) if mit_quelle else None
    if massgebend and len(mit_quelle) == 2:
        anderer = next(f for f in mit_quelle if f["key"] != massgebend["key"])
        summe = massgebend["q_source_kw"] + anderer["q_source_kw"]
        warnungen.append(
            f"Umschaltventil: {massgebend['titel']} ist mit "
            f"{massgebend['q_source_kw']:.1f} kW Quellenleistung massgebend. "
            f"Die Lasten werden nicht addiert — {summe:.1f} kW wären fachlich falsch."
        )

    return mit_grundlage({
        "hat_vorrang": True,
        "faelle": faelle,
        "massgebend": massgebend["key"] if massgebend else None,
        "massgebend_q_source_kw": massgebend["q_source_kw"] if massgebend else None,
        "bww_ladeleistung_kw": ladeleistung,
        "warnungen": warnungen,
    }, 'betriebsfaelle')
