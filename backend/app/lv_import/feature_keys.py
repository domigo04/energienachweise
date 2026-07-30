"""B12 — die EINE gemeinsame Feature-Sprache.

Der LV-Importer und der ProjectContext benennen dieselbe Sache gleich. Die
kanonischen LV-Feature-Schlüssel stehen hier, samt der EINEN Abbildung auf die
ProjectContext-Parameterschlüssel. Kein zweites Mapping irgendwo sonst.
"""
from __future__ import annotations

# MVP-Kostentreiber (B4). value-Typ: "int" (Stück), "float" (Menge), "text".
FEATURE_DEFS = {
    # Punkt 6/7 — Wärmeerzeuger sind mehrwertig ("EWS-WP + Gas"). `generator_type`
    # bleibt als Einzelwert für die bestehende Ähnlichkeit erhalten (Rückwärts-
    # kompatibilität) und trägt den ERSTEN Erzeuger; `generator_types` hält die
    # vollständige Liste als kommaseparierte Codes.
    "generator_type": {"typ": "text", "einheit": None, "label": "Erzeugertyp (primär)"},
    "generator_types": {"typ": "list", "einheit": None, "label": "Wärmeerzeuger",
                        "registry": "generator_types"},
    "heat_delivery_types": {"typ": "list", "einheit": None, "label": "Wärmeabgabe",
                            "registry": "heat_delivery_types"},
    "generator_count": {"typ": "int", "einheit": None, "label": "Wärmeerzeuger"},
    "generator_power_kw": {"typ": "float", "einheit": "kW", "label": "Erzeugerleistung"},
    "borehole_count": {"typ": "int", "einheit": None, "label": "Erdsonden"},
    "boreholes_present": {"typ": "bool", "einheit": None, "label": "Erdsonden vorhanden"},
    "borehole_length_each_m": {"typ": "float", "einheit": "m", "label": "Länge je Sonde"},
    "borehole_total_m": {"typ": "float", "einheit": "m", "label": "Bohrmeter"},
    "buffer_count": {"typ": "int", "einheit": None, "label": "Pufferspeicher"},
    "storage_volume_l": {"typ": "float", "einheit": "l", "label": "Speichervolumen"},
    "pump_count": {"typ": "int", "einheit": None, "label": "Pumpen"},
    "valve_2way_count": {"typ": "int", "einheit": None, "label": "2-Weg-Ventile"},
    "valve_3way_count": {"typ": "int", "einheit": None, "label": "3-Weg-Ventile"},
    "balancing_valve_count": {"typ": "int", "einheit": None, "label": "Abgleichventile (STAD)"},
    "radiator_count": {"typ": "int", "einheit": None, "label": "Heizkörper"},
    "heat_meter_count": {"typ": "int", "einheit": None, "label": "Wärmezähler"},
    "floor_heating_manifold_count": {
        "typ": "int", "einheit": None, "label": "Fussbodenheizungsverteiler",
    },
    "floor_heating_pipe_m": {
        "typ": "float", "einheit": "m", "label": "Fussbodenheizungsrohr",
    },
    "floor_heating_area_m2": {
        "typ": "float", "einheit": "m²", "label": "Fussbodenheizungsfläche",
    },
    "temporary_heating_present": {
        "typ": "bool", "einheit": None, "label": "Provisorium vorhanden",
    },
    "geocooling_present": {
        "typ": "bool", "einheit": None, "label": "Geocooling vorhanden",
    },
    "domestic_hot_water_included": {
        "typ": "bool", "einheit": None, "label": "Warmwasserbereitung enthalten",
    },
    # Rohrmeter getrennt nach Seite (Punkt 11): Quelle = Primärkreis/Erdsonden-
    # sammler, Verteilung = Heizungsverteilung. pipe_length_m ist die Summe und
    # bleibt der Kostentreiber für die bestehende Ähnlichkeit.
    "pipe_length_source_m": {"typ": "float", "einheit": "m", "label": "Rohrmeter Quelle"},
    "pipe_length_distribution_m": {"typ": "float", "einheit": "m", "label": "Rohrmeter Verteilung"},
    "pipe_length_m": {"typ": "float", "einheit": "m", "label": "Rohrmeter total"},
}

FEATURE_KEYS = list(FEATURE_DEFS.keys())

# Im LV-Review werden bewusst nur grobe, kostenrelevante Kennwerte gespeichert.
# Die übrigen Definitionen bleiben für bestehende Referenzprojekte kompatibel.
LV_IMPORT_FEATURE_KEYS = [
    "generator_type", "generator_count", "generator_power_kw",
    "boreholes_present", "borehole_count", "borehole_length_each_m",
    "borehole_total_m", "pipe_length_m", "floor_heating_pipe_m",
    "floor_heating_area_m2", "heat_meter_count", "buffer_count",
    "temporary_heating_present", "geocooling_present",
    "domestic_hot_water_included",
]

# LV-Feature-Schlüssel → ProjectContext-Parameterschlüssel (project_context.PARAMETER).
# Nur hier gepflegt (B12). generator_type ist beidseitig gleich benannt.
FEATURE_TO_CONTEXT = {
    "generator_type": "generator_type",
    "generator_count": "anzahl_erzeuger",
    "generator_power_kw": "generator_power_kw",
    "borehole_count": "anzahl_erdsonden",
    "borehole_total_m": "bohrmeter",
    "buffer_count": "anzahl_speicher",
    "storage_volume_l": "speichervolumen_l",
    "pump_count": "anzahl_pumpen",
    "valve_2way_count": "anzahl_ventile_2weg",
    "valve_3way_count": "anzahl_ventile_3weg",
    "heat_meter_count": "anzahl_waermezaehler",
    "floor_heating_manifold_count": "anzahl_fbh_verteiler",
    "pipe_length_m": "rohrmeter",
}


def context_key(feature_key: str) -> str | None:
    return FEATURE_TO_CONTEXT.get(feature_key)


# Umkehrung: ProjectContext-Parameterschlüssel → kanonischer Feature-Schlüssel.
CONTEXT_TO_FEATURE = {ctx: feat for feat, ctx in FEATURE_TO_CONTEXT.items()}


# Legacy-RefProjekt-Spalten → kanonischer Feature-Schlüssel. Historische
# Referenzprojekte tragen nur einen Teil der Merkmale als eigene Spalten; der
# Rest existiert erst über die generische RefProjektFeature-Struktur (neue
# Importe). Nur HIER gepflegt (ein zentrales Mapping, B12).
REFPROJEKT_COLUMN_TO_FEATURE = {
    "heizleistung_kw": "generator_power_kw",
    "bohrmeter": "borehole_total_m",
    "anzahl_waermemessungen": "heat_meter_count",
    "laufmeter_rohre_heizung": "pipe_length_m",
}

# Zusätzliche Vergleichsmerkmale (Grunddaten) für die BKP-Ähnlichkeit. Keine
# LV-Kostentreiber, aber relevant für Verteilung/Messung. Auch hier ein
# zentrales Mapping je Quelle.
GRUNDDATEN_KEYS = ("ebf_m2", "units", "building_use")
GRUNDDATEN_CONTEXT = {"ebf_m2": "ebf_m2", "units": "anzahl_nutzungseinheiten", "building_use": "nutzung"}
GRUNDDATEN_REFPROJEKT = {"ebf_m2": "ebf_m2", "units": "anzahl_einheiten", "building_use": "gebaeudetyp"}
