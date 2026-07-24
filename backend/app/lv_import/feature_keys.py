"""B12 — die EINE gemeinsame Feature-Sprache.

Der LV-Importer und der ProjectContext benennen dieselbe Sache gleich. Die
kanonischen LV-Feature-Schlüssel stehen hier, samt der EINEN Abbildung auf die
ProjectContext-Parameterschlüssel. Kein zweites Mapping irgendwo sonst.
"""
from __future__ import annotations

# MVP-Kostentreiber (B4). value-Typ: "int" (Stück), "float" (Menge), "text".
FEATURE_DEFS = {
    "generator_type": {"typ": "text", "einheit": None, "label": "Erzeugertyp"},
    "generator_count": {"typ": "int", "einheit": None, "label": "Wärmeerzeuger"},
    "generator_power_kw": {"typ": "float", "einheit": "kW", "label": "Erzeugerleistung"},
    "borehole_count": {"typ": "int", "einheit": None, "label": "Erdsonden"},
    "borehole_total_m": {"typ": "float", "einheit": "m", "label": "Bohrmeter"},
    "buffer_count": {"typ": "int", "einheit": None, "label": "Pufferspeicher"},
    "storage_volume_l": {"typ": "float", "einheit": "l", "label": "Speichervolumen"},
    "pump_count": {"typ": "int", "einheit": None, "label": "Pumpen"},
    "valve_2way_count": {"typ": "int", "einheit": None, "label": "2-Weg-Ventile"},
    "valve_3way_count": {"typ": "int", "einheit": None, "label": "3-Weg-Ventile"},
    "heat_meter_count": {"typ": "int", "einheit": None, "label": "Wärmezähler"},
    "pipe_length_m": {"typ": "float", "einheit": "m", "label": "Rohrmeter"},
}

FEATURE_KEYS = list(FEATURE_DEFS.keys())

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
    "pipe_length_m": "rohrmeter",
}


def context_key(feature_key: str) -> str | None:
    return FEATURE_TO_CONTEXT.get(feature_key)
