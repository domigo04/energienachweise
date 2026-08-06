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
    "borehole_count": {"typ": "int", "einheit": None, "label": "Anzahl Bohrungen"},
    "boreholes_present": {"typ": "bool", "einheit": None, "label": "Erdsonden vorhanden"},
    "borehole_length_each_m": {"typ": "float", "einheit": "m", "label": "Länge je Bohrung"},
    "borehole_total_m": {"typ": "float", "einheit": "m", "label": "Bohrmeter total (berechnet)"},
    "buffer_count": {"typ": "int", "einheit": None, "label": "Pufferspeicher"},
    "storage_volume_l": {"typ": "float", "einheit": "l", "label": "Speichervolumen"},
    "pump_count": {"typ": "int", "einheit": None, "label": "Pumpen"},
    "valve_2way_count": {"typ": "int", "einheit": None, "label": "2-Weg-Ventile"},
    "valve_3way_count": {"typ": "int", "einheit": None, "label": "3-Weg-Ventile"},
    "balancing_valve_count": {"typ": "int", "einheit": None, "label": "Abgleichventile (STAD)"},
    "radiator_count": {"typ": "int", "einheit": None, "label": "Heizkörper"},
    "heat_meter_count": {"typ": "int", "einheit": None, "label": "Anzahl Wärmemessungen"},
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
    "pipe_length_m": {
        "typ": "float", "einheit": "m",
        "label": "Rohrmeter total exkl. Fussbodenheizung",
    },
    # Eine pauschale Position «Wärmemessung» belegt, DASS gemessen wird, aber
    # nicht wie oft. Beides getrennt zu führen verhindert eine erfundene Anzahl.
    "heat_metering_present": {
        "typ": "bool", "einheit": None, "label": "Wärmemessung vorhanden",
    },

    # ── Wärmeverteilung und Systemdaten ───────────────────────────────────
    # Systemtemperaturen und Auslegungsaussentemperatur entscheiden über die
    # Wahl der Abgabesysteme und sind darum vergleichsrelevant.
    "distribution_system": {"typ": "text", "einheit": None, "label": "Verteilsystem"},
    "design_flow_temperature_c": {"typ": "float", "einheit": "°C", "label": "Vorlauftemperatur"},
    "design_return_temperature_c": {"typ": "float", "einheit": "°C", "label": "Rücklauftemperatur"},
    "design_outdoor_temperature_c": {"typ": "float", "einheit": "°C", "label": "Auslegungsaussentemperatur"},
    "fresh_water_station_present": {"typ": "bool", "einheit": None, "label": "Frischwasserstation"},
    "storage_count": {"typ": "int", "einheit": None, "label": "Anzahl Speicher"},
    "storage_volume_each_l": {"typ": "float", "einheit": "l", "label": "Volumen je Speicher"},

    # ── Projektmerkmale, die den Preis treiben ────────────────────────────
    # Bewusst wenige normierte Merkmale statt einer Freitextanalyse: nur was
    # den Aufwand messbar verändert und in einer Referenz vergleichbar ist.
    "protected_building": {"typ": "bool", "einheit": None, "label": "Schützenswertes Gebäude"},
    "reversible_installations_required": {
        "typ": "bool", "einheit": None, "label": "Reversible Einbauten gefordert",
    },
    "installation_height_m": {"typ": "float", "einheit": "m", "label": "Montagehöhe"},
    "scaffolding_required": {"typ": "bool", "einheit": None, "label": "Gerüst erforderlich"},
    "integrated_tests_required": {"typ": "bool", "einheit": None, "label": "Integrale Tests"},
    "contractor_workshop_planning_required": {
        "typ": "bool", "einheit": None, "label": "Werkplanung durch Unternehmer",
    },
}

FEATURE_KEYS = list(FEATURE_DEFS.keys())

# Im LV-Review werden bewusst nur grobe, kostenrelevante Kennwerte gespeichert.
# Die übrigen Definitionen bleiben für bestehende Referenzprojekte kompatibel.
LV_IMPORT_FEATURE_KEYS = [
    # Wärmeerzeuger-Typen liegen als bearbeitbare Mehrfachliste in
    # LvImportSystem. Hier bleibt nur die gemeinsame Erzeugerleistung.
    "generator_power_kw",
    # Bohrungen: Anzahl und Länge werden erfasst, die Bohrmeter daraus gerechnet.
    # `boreholes_present` entfällt: eine Bohrung ist vorhanden, sobald die Anzahl
    # grösser als null ist — ein eigenes Ja/Nein-Feld wäre eine zweite Wahrheit.
    "borehole_count", "borehole_length_each_m", "borehole_total_m",
    "fresh_water_station_present",
    # Rohrmeter ohne Fussbodenheizung. Der Schlüssel bleibt `pipe_length_m`,
    # weil bestehende Importe und Referenzprojekte darunter gespeichert sind;
    # die Beschriftung sagt jetzt ausdrücklich, was gemeint ist.
    "pipe_length_m",
]

# Wird gerechnet, nicht eingegeben: Bohrmeter = Anzahl × Länge je Bohrung.
# Im Review nur lesbar, damit keine widersprüchliche dritte Zahl entsteht.
ABGELEITETE_FEATURE_KEYS = ("borehole_total_m",)

# Merkmale, die frühere Fassungen erhoben haben und die weiterhin in der
# Datenbank stehen dürfen, aber nicht mehr erfasst, angezeigt oder für die
# Ähnlichkeit verwendet werden. Bewusst keine Spaltenlöschung — bestehende
# Importe und Referenzprojekte bleiben unangetastet lesbar.
STILLGELEGTE_FEATURE_KEYS = frozenset({
    "generator_type", "generator_count", "generator_types", "boreholes_present",
    "buffer_count", "storage_count", "storage_volume_each_l", "storage_volume_l",
    "floor_heating_pipe_m", "floor_heating_area_m2", "floor_heating_manifold_count",
    "domestic_hot_water_included", "pump_count", "heat_metering_present",
    "heat_meter_count",
    "distribution_system", "design_flow_temperature_c",
    "design_return_temperature_c", "design_outdoor_temperature_c",
    "protected_building", "reversible_installations_required",
    "installation_height_m", "scaffolding_required",
    "integrated_tests_required", "contractor_workshop_planning_required",
})

# LV-Feature-Schlüssel → ProjectContext-Parameterschlüssel (project_context.PARAMETER).
# Nur hier gepflegt (B12). generator_type ist beidseitig gleich benannt.
FEATURE_TO_CONTEXT = {
    # Der ProjectContext liefert für bestehende Hydraulikprojekte weiterhin
    # einen kanonischen Typ. Nur im LV-Review wurde das Einzel-Feld durch die
    # bearbeitbare Mehrfachliste ersetzt.
    "generator_type": "generator_type",
    "generator_count": "anzahl_erzeuger",
    "generator_power_kw": "generator_power_kw",
    "borehole_count": "anzahl_erdsonden",
    "borehole_total_m": "bohrmeter",
    "buffer_count": "anzahl_speicher",
    "storage_volume_l": "speichervolumen_l",
    "valve_2way_count": "anzahl_ventile_2weg",
    "valve_3way_count": "anzahl_ventile_3weg",
    "floor_heating_manifold_count": "anzahl_fbh_verteiler",
    "radiator_count": "anzahl_heizkoerper",
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
    "laufmeter_rohre_heizung": "pipe_length_m",
}

# Zusätzliche Vergleichsmerkmale (Grunddaten) für die BKP-Ähnlichkeit. Keine
# LV-Kostentreiber, aber relevant für Verteilung/Messung. Auch hier ein
# zentrales Mapping je Quelle.
GRUNDDATEN_KEYS = ("ebf_m2", "units", "building_use")
GRUNDDATEN_CONTEXT = {"ebf_m2": "ebf_m2", "units": "anzahl_nutzungseinheiten", "building_use": "nutzung"}
GRUNDDATEN_REFPROJEKT = {"ebf_m2": "ebf_m2", "units": "anzahl_einheiten", "building_use": "gebaeudetyp"}
