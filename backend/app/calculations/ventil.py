from typing import Optional, List

# Normierte KVS-Reihe (gängige Ventilhersteller)
KVS_REIHE = [0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10.0, 16.0, 25.0, 40.0, 63.0]


def berechne_kvs(volumenstrom_m3h: float, dp_var_kpa: float, kvs_gewaehlt: Optional[float] = None) -> dict:
    """
    kvs_theor = V' / sqrt(Δpvar [bar])
    Δpv_eff   = (V' / kvs_eff)²          [bar]
    Pv        = Δpv_eff / (Δpv_eff + Δpvar)  [%]
    """
    dp_var_bar = dp_var_kpa / 100.0
    if dp_var_bar <= 0 or volumenstrom_m3h <= 0:
        return {"fehler": "Volumenstrom und Δpvar müssen > 0 sein"}

    kvs_theor = volumenstrom_m3h / (dp_var_bar ** 0.5)
    kvs_vorschlag = next((k for k in KVS_REIHE if k >= kvs_theor), KVS_REIHE[-1])
    kvs_eff = kvs_gewaehlt if kvs_gewaehlt is not None else kvs_vorschlag

    dp_v_eff_bar = (volumenstrom_m3h / kvs_eff) ** 2
    dp_v_eff_kpa = dp_v_eff_bar * 100.0
    pv = dp_v_eff_bar / (dp_v_eff_bar + dp_var_bar) * 100.0

    warnings = []
    if pv < 30:
        warnings.append(f"Ventilautorität zu gering ({pv:.1f}% < 30%) — kleineren KVS wählen oder Δpvar erhöhen")
    elif pv > 80:
        warnings.append(f"Hohe Ventilautorität ({pv:.1f}%) — Regelkomfort sehr gut")

    return {
        "volumenstrom_m3h": volumenstrom_m3h,
        "dp_var_kpa": dp_var_kpa,
        "dp_var_bar": round(dp_var_bar, 5),
        "kvs_theor": round(kvs_theor, 4),
        "kvs_vorschlag": kvs_vorschlag,
        "kvs_eff": kvs_eff,
        "kvs_reihe": KVS_REIHE,
        "dp_v_eff_bar": round(dp_v_eff_bar, 6),
        "dp_v_eff_kpa": round(dp_v_eff_kpa, 3),
        "ventilautoritaet_pct": round(pv, 2),
        "warnings": warnings,
    }
