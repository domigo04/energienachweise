"""B5 — zentrale Synonym-Registry.

Ein Begriff aus dem Unternehmer-LV → eine Feature-Familie. Alle Schreibweisen an
EINER Stelle. Der Originaltext bleibt in der Extraktion immer erhalten; hier wird
nur normalisiert erkannt (lowercase-Vergleich).
"""
from __future__ import annotations

FEATURE_TERMS: dict[str, list[str]] = {
    "pump": [
        "umwälzpumpe", "umwaelzpumpe", "inlinepumpe", "nassläuferpumpe",
        "nasslaeuferpumpe", "trockenläuferpumpe", "trockenlaeuferpumpe",
        "heizungspumpe", "hocheffizienzpumpe", "ladepumpe",
    ],
    "valve_2way": [
        "2-weg-ventil", "2-wege-ventil", "2-wegeventil", "zweiwegeventil",
        "durchgangsregelventil", "durchgangsventil", "motorventil 2w", "regelventil 2-weg",
    ],
    "valve_3way": [
        "3-weg-ventil", "3-wege-ventil", "3-wegeventil", "dreiwegeventil",
        "mischventil", "umschaltventil", "motorventil 3w", "regelventil 3-weg",
    ],
    "heat_meter": [
        "wärmezähler", "waermezaehler", "wärmemengenzähler", "waermemengenzaehler",
        "wmz", "energiezähler heizung",
    ],
    "buffer": [
        "pufferspeicher", "puffer", "technikspeicher", "heizungspufferspeicher",
        "kombispeicher",
    ],
    "borehole": [
        "erdsonde", "erdsonden", "duplexsonde", "duplexsonden", "erdwärmesonde",
        "erdwaermesonde",
    ],
    "heat_generator": [
        "wärmepumpe", "waermepumpe", "sole/wasser-wärmepumpe", "luft/wasser-wärmepumpe",
        "wärmeerzeuger", "erdsonden-wp", "sole-wasser-wp",
    ],
}

# Freitext → strukturierter Erzeugertyp (generator_type, gleiche Codes wie
# schema_mengen.GENERATOR_TYPES für die gemeinsame Feature-Sprache).
GENERATOR_TYPE_TERMS: list[tuple[str, tuple[str, ...]]] = [
    ("ews_wp", ("sole/wasser", "sole-wasser", "erdsonde", "ews", "sole")),
    ("lwwp", ("luft/wasser", "luft-wasser", "aussenluft", "luftwärme")),
    ("wasser_wp", ("wasser/wasser", "wasser-wasser", "grundwasser")),
    ("co2_wp", ("co2", "co₂")),
    ("fernwaerme", ("fernwärme", "fernwaerme", "nahwärme")),
    ("gas", ("gaskessel", "gas-brennwert", "gasheizung", "brennwertkessel")),
    ("oel", ("ölkessel", "oelkessel", "heizöl")),
    ("holz", ("pellet", "schnitzel", "stückholz", "holzheizung")),
    ("elektro", ("elektroheizung", "heizstab", "elektrisch")),
    ("hybrid", ("hybrid",)),
    ("wasser_wp", ("wärmepumpe", "waermepumpe", "wp")),  # generisch zuletzt
]
