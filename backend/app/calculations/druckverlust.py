from typing import List


def berechne_kreis(rohrlange_m: float, druckgefaelle_pam: float, apparate: List[dict]) -> dict:
    """
    Approximative Druckverlustberechnung:
    Rohr: Länge × Pa/m → kPa
    Apparate: Anzahl × kPa/Stk.
    """
    dp_rohr_kpa = rohrlange_m * druckgefaelle_pam / 1000.0

    apparate_details = []
    dp_apparate_total = 0.0
    for a in apparate:
        anzahl = float(a.get("anzahl", 1))
        dp_kpa = float(a.get("dp_kpa", 0.0))
        total = anzahl * dp_kpa
        apparate_details.append({
            "name": a.get("name", ""),
            "anzahl": anzahl,
            "dp_kpa_pro_stk": dp_kpa,
            "total_kpa": round(total, 3),
        })
        dp_apparate_total += total

    total_kpa = dp_rohr_kpa + dp_apparate_total

    return {
        "dp_rohr_kpa": round(dp_rohr_kpa, 3),
        "dp_apparate_kpa": round(dp_apparate_total, 3),
        "apparate_details": apparate_details,
        "total_kpa": round(total_kpa, 2),
        "total_mws": round(total_kpa / 10.0, 3),
    }
