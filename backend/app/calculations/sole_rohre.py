"""Rohr-, Druckstufen- und Wärmeträgertabellen für den Erdsonden-Solekreis.

Quellen:
- SIA 384/6:2021 «Erdwärmesonden», wiedergegeben in der FWS-Präsentation
  «WP-/EWS-Technik Update 2021» (Dr. Walter J. Eugster):
  Tabelle 10 (Rohrmasse und Nenndruck), Tabelle 8 (Druckstufen und SDR),
  Tabelle S. 13 (Nenndruckstufe nach Tiefenbereich).
- `Erdsonden.xlsx`, Zellkommentare zu `Innen-Durchmesser`, `Wärmeträger Dichte`
  und `kinematische Zähigkeit`.

Die Werte sind eine Auswahl, keine freie Eingabe: ein Innendurchmesser gehört
immer zu einem realen Rohr, und dieses Rohr bringt seine Nenndruckstufe mit.
"""


# ── Rohre ───────────────────────────────────────────────────────────────────
# `pn` ist der Nenndruck des Rohrs, `quelle` sagt, woher die Masse stammen.
# SIA/FWS Tabelle 10 ist massgebend; die beiden Zeilen aus der Excel-Vorlage
# bleiben wählbar, damit bestehende Berechnungen nachvollziehbar bleiben.
ROHRE = {
    "pe25x2.3": {
        "bezeichnung": "PE 25 × 2.3", "aussen_mm": 25, "innen_mm": 20.4,
        "wand_mm": 2.3, "pn": "PN 16", "sdr": "SDR 11",
        "quelle": "Erdsonden.xlsx / HAKA-Normsonde", "sonde": True,
    },
    "pe32x3.0": {
        "bezeichnung": "PE 32 × 3.0", "aussen_mm": 32, "innen_mm": 26.0,
        "wand_mm": 3.0, "pn": "PN 16", "sdr": "SDR 11",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe32x2.9": {
        "bezeichnung": "PE 32 × 2.9", "aussen_mm": 32, "innen_mm": 26.2,
        "wand_mm": 2.9, "pn": "PN 16", "sdr": "SDR 11",
        "quelle": "Erdsonden.xlsx / HAKA-Normsonde", "sonde": True,
    },
    "pe32x3.6": {
        "bezeichnung": "PE 32 × 3.6", "aussen_mm": 32, "innen_mm": 24.8,
        "wand_mm": 3.6, "pn": "PN 20", "sdr": "SDR 9",
        "quelle": "Rohrreihe SDR 9 (in Tabelle 10 nicht aufgeführt)", "sonde": True,
    },
    "pe40x3.7": {
        "bezeichnung": "PE 40 × 3.7", "aussen_mm": 40, "innen_mm": 32.6,
        "wand_mm": 3.7, "pn": "PN 16", "sdr": "SDR 11",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe40x4.5": {
        "bezeichnung": "PE 40 × 4.5", "aussen_mm": 40, "innen_mm": 31.0,
        "wand_mm": 4.5, "pn": "PN 20", "sdr": "SDR 9",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe40x5.4": {
        "bezeichnung": "PE 40 × 5.4", "aussen_mm": 40, "innen_mm": 29.2,
        "wand_mm": 5.4, "pn": "PN 25", "sdr": "SDR 7.4",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe50x4.6": {
        "bezeichnung": "PE 50 × 4.6", "aussen_mm": 50, "innen_mm": 40.8,
        "wand_mm": 4.6, "pn": "PN 16", "sdr": "SDR 11",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe50x4.7": {
        "bezeichnung": "PE 50 × 4.7", "aussen_mm": 50, "innen_mm": 40.6,
        "wand_mm": 4.7, "pn": "PN 16", "sdr": "SDR 11",
        "quelle": "Erdsonden.xlsx", "sonde": False,
    },
    "pe50x5.6": {
        "bezeichnung": "PE 50 × 5.6", "aussen_mm": 50, "innen_mm": 38.8,
        "wand_mm": 5.6, "pn": "PN 20", "sdr": "SDR 9",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe50x6.9": {
        "bezeichnung": "PE 50 × 6.9", "aussen_mm": 50, "innen_mm": 36.4,
        "wand_mm": 6.9, "pn": "PN 25", "sdr": "SDR 7.4",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
    "pe50x8.9": {
        "bezeichnung": "PE 50 × 8.9", "aussen_mm": 50, "innen_mm": 32.0,
        "wand_mm": 8.9, "pn": "PN 32", "sdr": "SDR 5.6",
        "quelle": "SIA 384/6:2021 Tabelle 10", "sonde": True,
    },
}

# Rangfolge der Nenndruckstufen für den Vergleich «reicht das Rohr?».
PN_RANG = {"PN 16": 16, "PN 20": 20, "PN 25": 25, "PN 32": 32, "PN 40": 40}

# SDR je Druckstufe und zulässige Differenzdrücke, SIA 384/6:2021 Tabelle 8.
DRUCKSTUFEN = {
    "PN 16": {"sdr": "SDR 11", "aussen_ueber_innen_60h_bar": -8.2,
              "innen_ueber_aussen_60h_bar": 22.8, "betrieb_50a_bar": 16.0},
    "PN 20": {"sdr": "SDR 9", "aussen_ueber_innen_60h_bar": -12.5,
              "innen_ueber_aussen_60h_bar": 28.5, "betrieb_50a_bar": 20.0},
    "PN 25": {"sdr": "SDR 7.4", "aussen_ueber_innen_60h_bar": -18.4,
              "innen_ueber_aussen_60h_bar": 35.6, "betrieb_50a_bar": 25.0},
    "PN 32": {"sdr": "SDR 5.6", "aussen_ueber_innen_60h_bar": -31.3,
              "innen_ueber_aussen_60h_bar": 45.6, "betrieb_50a_bar": 32.0},
    "PN 40": {"sdr": "SDR 5", "aussen_ueber_innen_60h_bar": -38.9,
              "innen_ueber_aussen_60h_bar": 57.0, "betrieb_50a_bar": 40.0},
}

# Erforderliche Nenndruckstufe nach Sondentiefe, SIA 384/6:2021 (informativ).
# Der Überdruck am Sondenfuss enthält 3 bar Betriebsdruck.
DRUCKSTUFE_NACH_TIEFE = [
    (0, 170, "PN 16", 20),
    (171, 200, "PN 20", 24),
    (201, 260, "PN 25", 30),
    (261, 360, "PN 32", 41),
]

# Bohrdurchmesser, SIA 384/6:2021 (informativ).
BOHRDURCHMESSER_MM = {32: {"hammer": 115, "spuel": 121},
                      40: {"hammer": 130, "spuel": 136},
                      50: {"hammer": 160, "spuel": 165}}


def erforderliche_druckstufe(tiefe_m: float) -> dict:
    """Nenndruckstufe, die eine Sonde dieser Tiefe am Sondenfuss braucht."""
    tiefe = float(tiefe_m)
    for von, bis, pn, bar in DRUCKSTUFE_NACH_TIEFE:
        if tiefe <= bis:
            return {"tiefe_m": round(tiefe, 1), "bereich": f"{von}–{bis} m",
                    "pn": pn, "max_ueberdruck_bar": bar,
                    "sdr": DRUCKSTUFEN[pn]["sdr"], "ausserhalb": False}
    letzte = DRUCKSTUFE_NACH_TIEFE[-1]
    return {"tiefe_m": round(tiefe, 1), "bereich": f"> {letzte[1]} m",
            "pn": None, "max_ueberdruck_bar": None, "sdr": None, "ausserhalb": True}


def rohr(key: str) -> dict:
    if key not in ROHRE:
        raise ValueError(f"Unbekanntes Rohr: {key}")
    return {"key": key, **ROHRE[key]}


# ── Wärmeträger ─────────────────────────────────────────────────────────────
# Dichte, kinematische Zähigkeit und Frostschutzgrenze stammen 1:1 aus den
# Zellkommentaren von `Erdsonden.xlsx`. Die spezifische Wärmekapazität steht
# dort NICHT und ist ein Richtwert; sie wird nur für den Ersatzweg
# «Volumenstrom aus Quellenleistung und Sole-ΔT» gebraucht.
WAERMETRAEGER = {
    "antifrogen_l_21_4": {
        "produkt": "Antifrogen L (Propylenglykol)", "konzentration_pct": 21.4,
        "dichte_kg_m3": 1028.0, "viskositaet_mm2_s": 5.03, "frostschutz_c": -8.0,
        "cp_kj_kgk": 3.93,
    },
    "antifrogen_l_25": {
        "produkt": "Antifrogen L (Propylenglykol)", "konzentration_pct": 25.0,
        "dichte_kg_m3": 1033.0, "viskositaet_mm2_s": 5.98, "frostschutz_c": -10.1,
        "cp_kj_kgk": 3.88,
    },
    "antifrogen_l_30": {
        "produkt": "Antifrogen L (Propylenglykol)", "konzentration_pct": 30.0,
        "dichte_kg_m3": 1039.0, "viskositaet_mm2_s": 7.65, "frostschutz_c": -13.5,
        "cp_kj_kgk": 3.80,
    },
    "antifrogen_n_20": {
        "produkt": "Antifrogen N (Ethylenglykol)", "konzentration_pct": 20.0,
        "dichte_kg_m3": 1040.0, "viskositaet_mm2_s": 3.49, "frostschutz_c": -10.4,
        "cp_kj_kgk": 3.85,
    },
    "antifrogen_n_25": {
        "produkt": "Antifrogen N (Ethylenglykol)", "konzentration_pct": 25.0,
        "dichte_kg_m3": 1050.0, "viskositaet_mm2_s": 4.15, "frostschutz_c": -13.6,
        "cp_kj_kgk": 3.78,
    },
    "ethanol_10": {
        "produkt": "Ethanol", "konzentration_pct": 10.0,
        "dichte_kg_m3": 982.0, "viskositaet_mm2_s": 2.82, "frostschutz_c": -4.5,
        "cp_kj_kgk": 4.30,
    },
    "ethanol_20": {
        "produkt": "Ethanol", "konzentration_pct": 20.0,
        "dichte_kg_m3": 969.0, "viskositaet_mm2_s": 4.29, "frostschutz_c": -10.5,
        "cp_kj_kgk": 4.20,
    },
    "ethanol_30": {
        "produkt": "Ethanol", "konzentration_pct": 30.0,
        "dichte_kg_m3": 654.0, "viskositaet_mm2_s": 5.96, "frostschutz_c": -20.5,
        "cp_kj_kgk": 4.05,
        # 654 kg/m³ steht so in der Vorlage, ist aber für ein 30-%-Ethanol-
        # Wasser-Gemisch physikalisch nicht plausibel (erwartet ~950 kg/m³).
        "warnung": ("Dichte 654 kg/m³ stammt aus der Vorlage, ist für ein "
                    "30-%-Ethanol-Wasser-Gemisch aber unplausibel. Vor Gebrauch "
                    "gegen das Produktdatenblatt prüfen."),
    },
}

# Dichte des Glykolkonzentrats (Antifrogen N), Blatt `glykol_Erdsonden`.
KONZENTRAT_DICHTE_KG_L = 1.14


def waermetraeger(key: str) -> dict:
    if key not in WAERMETRAEGER:
        raise ValueError(f"Unbekannter Wärmeträger: {key}")
    return {"key": key, **WAERMETRAEGER[key]}


def waermetraeger_liste() -> list:
    """Auswahlliste fürs Frontend, nach Produkt und Konzentration sortiert."""
    return [
        {"key": k, "label": f"{v['produkt']} {v['konzentration_pct']:g} %", **v}
        for k, v in WAERMETRAEGER.items()
    ]


def rohr_liste(nur_sonde: bool = False) -> list:
    return [
        {"key": k,
         "label": f"{v['bezeichnung']} — innen {v['innen_mm']:g} mm — {v['pn']}",
         **v}
        for k, v in ROHRE.items()
        if not nur_sonde or v.get("sonde")
    ]
