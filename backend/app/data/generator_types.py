"""Kanonische Erzeugercodes für Berechnung, Legende und Vektorexport."""

GENERATOR_TYPE_LABELS = {
    "ews_wp": "Sole/Wasser-WP (Erdsonden)",
    "lwwp": "Luft/Wasser-WP",
    "wasser_wp": "Wasser/Wasser-WP",
    "co2_wp": "CO₂-Wärmepumpe",
    "fernwaerme": "Fernwärme",
    "gas": "Gaskessel",
    "oel": "Ölkessel",
    "holz": "Holz-/Pelletkessel",
    "elektro": "Elektroheizung",
    "hybrid": "Hybridanlage",
    "sonstige": "Sonstiger Wärmeerzeuger",
}

HEAT_PUMP_TYPES = {"ews_wp", "lwwp", "wasser_wp", "co2_wp", "hybrid"}
SOURCE_CIRCUIT_TYPES = {"ews_wp", "wasser_wp"}


def generator_type_label(value: str | None) -> str | None:
    if not value:
        return None
    return GENERATOR_TYPE_LABELS.get(str(value), str(value))
