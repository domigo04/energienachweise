"""Automatische Leitungsdimensionierung — Rohr-Reibungstabelle (Dominic).

Für einen gegebenen Durchfluss wird die kleinste Dimension (DN) gewählt, bei
der der Reibungsdruckverlust R ≤ 70 Pa/m bleibt (Dominics Maximalwert).
Datenquelle: Dominics Rohrnetz-Tabelle (R [Pa/m] × DN → Kapazität [kg/h]).
"""
from typing import Optional

R_STUFEN = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]
R_MAX = 70.0  # Dominics Maximalwert — nie darüber dimensionieren

# Kapazität [kg/h] je DN und R-Stufe (Reihenfolge = R_STUFEN)
DN_KAPAZITAET = {
    "DN10": [48.5, 53.9, 59.0, 63.7, 68.2, 72.5, 76.5, 80.4, 84.2, 87.8, 91.3],
    "DN15": [96.1, 106.8, 116.6, 125.9, 134.6, 142.9, 150.8, 158.5, 165.8, 172.9, 179.7],
    "DN20": [219, 243, 266, 286, 306, 325, 342, 359, 376, 392, 407],
    "DN25": [412, 456, 498, 536, 573, 607, 640, 672, 702, 732, 760],
    "DN32": [876, 970, 1056, 1137, 1214, 1286, 1356, 1422, 1486, 1548, 1607],
    "DN40": [1322, 1463, 1593, 1715, 1829, 1938, 2042, 2142, 2237, 2330, 2419],
    "DN50": [2868, 3170, 3449, 3710, 3956, 4189, 4412, 4625, 4830, 5027, 5218],
    "DN65": [5481, 6054, 6584, 7079, 7545, 7987, 8408, 8812, 9200, 9573, 9934],
    "DN80": [8384, 9257, 10063, 10816, 11525, 12197, 12838, 13452, 14041, 14609, 15158],
    "DN100 (108.0x2.9)": [14600, 16100, 17500, 18800, 20000, 21200, 22300, 23300, 24300, 25300, 26300],
    "DN100 (114.3x3.2)": [16800, 18600, 20200, 21700, 23100, 24400, 25700, 26900, 28100, 29200, 30300],
    "DN125": [29100, 32100, 34800, 37400, 39800, 42100, 44300, 46400, 48400, 50300, 52200],
    "DN150": [48200, 53100, 57700, 61900, 65900, 69700, 73300, 76800, 80100, 83300, 86400],
    "DN175": [70200, 77300, 83900, 90100, 95900, 101400, 106600, 111600, 116400, 121000, 125500],
    "DN200": [99000, 109000, 118000, 127000, 135000, 142000, 150000, 157000, 163000, 170000, 176000],
    "DN250": [179000, 197000, 213000, 229000, 243000, 257000, 270000, 283000, 295000, 307000, 318000],
    "DN300": [282000, 310000, 336000, 361000, 384000, 406000, 426000, 446000, 465000, 483000, 501000],
}

_R_MAX_INDEX = R_STUFEN.index(R_MAX)


def _interpoliere_r(flow_kg_h: float, kapazitaeten: list) -> float:
    """R [Pa/m] für einen Durchfluss — lineare Interpolation der Stufen-Tabelle."""
    if flow_kg_h <= kapazitaeten[0]:
        steig = (kapazitaeten[1] - kapazitaeten[0]) / (R_STUFEN[1] - R_STUFEN[0])
        return R_STUFEN[0] - (kapazitaeten[0] - flow_kg_h) / steig
    for i in range(len(R_STUFEN) - 1):
        if kapazitaeten[i] <= flow_kg_h <= kapazitaeten[i + 1]:
            f = (flow_kg_h - kapazitaeten[i]) / (kapazitaeten[i + 1] - kapazitaeten[i])
            return R_STUFEN[i] + f * (R_STUFEN[i + 1] - R_STUFEN[i])
    steig = (kapazitaeten[-1] - kapazitaeten[-2]) / (R_STUFEN[-1] - R_STUFEN[-2])
    return R_STUFEN[-1] + (flow_kg_h - kapazitaeten[-1]) / steig


def automatische_dimension(volumenstrom_m3h: float) -> Optional[dict]:
    """Wählt die kleinste DN, bei der R ≤ 70 Pa/m bleibt (Dominics Regel).

    Durchfluss kommt als m³/h (Editor-Einheit) und wird auf kg/h umgerechnet
    (×1000, wie Dominics Tabelle sie angibt).
    """
    if not volumenstrom_m3h or volumenstrom_m3h <= 0:
        return None
    flow_kg_h = volumenstrom_m3h * 1000
    for dn, kap in DN_KAPAZITAET.items():
        if kap[_R_MAX_INDEX] >= flow_kg_h:
            return {"dn": dn, "pam": round(_interpoliere_r(flow_kg_h, kap), 1)}
    letzte_dn, letzte_kap = list(DN_KAPAZITAET.items())[-1]
    return {
        "dn": letzte_dn,
        "pam": round(_interpoliere_r(flow_kg_h, letzte_kap), 1),
        "warnung": f"Durchfluss übersteigt {letzte_dn} bei {R_MAX:.0f} Pa/m — grössere Dimension prüfen",
    }
