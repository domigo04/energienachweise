from typing import Optional, List, Any


def berechne_volumenstrom(leistung_kw: float, vorlauf: float, ruecklauf: float) -> Optional[float]:
    """V' [m³/h] = Q [kW] / (1.163 × ΔT [K])"""
    delta_t = vorlauf - ruecklauf
    if delta_t <= 0 or leistung_kw <= 0:
        return None
    return round(leistung_kw / (1.163 * delta_t), 4)


def berechne_rl_gemischt(gruppen: List[Any]) -> Optional[float]:
    """Gewichtete Rücklauftemperatur: RL_gem = Σ(V'_i × RL_i) / Σ(V'_i)"""
    aktive = [
        g for g in gruppen
        if hasattr(g, "status") and str(g.status) in ("aktiv", "GruppeStatus.aktiv")
        and g.volumenstrom_m3h and g.volumenstrom_m3h > 0
    ]
    if not aktive:
        return None
    summe_vr = sum(g.volumenstrom_m3h * g.ruecklauf for g in aktive)
    summe_v = sum(g.volumenstrom_m3h for g in aktive)
    if summe_v == 0:
        return None
    return round(summe_vr / summe_v, 2)


def pruefe_plausibilitaet(leistung_kw: float, vorlauf: float, ruecklauf: float, status: str) -> List[str]:
    warnings = []
    delta_t = vorlauf - ruecklauf
    if vorlauf <= ruecklauf:
        warnings.append(f"VL muss höher als RL sein (VL={vorlauf}°C ≤ RL={ruecklauf}°C)")
    elif delta_t < 3:
        warnings.append(f"Sehr kleines ΔT ({delta_t:.1f} K), Volumenstrom prüfen")
    if delta_t > 50:
        warnings.append(f"Ungewöhnlich grosses ΔT ({delta_t:.1f} K)")
    if leistung_kw == 0 and "aktiv" in status:
        warnings.append("Leistung nicht gesetzt (0 kW bei aktiver Gruppe)")
    return warnings
