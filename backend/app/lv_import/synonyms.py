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
        "umschaltkugelhahn", "3-weg-mischventil",
    ],
    # STAD / Abgleich- bzw. Strangregulierventile (Punkt 10, Roadmap P0 #3).
    "balancing_valve": [
        "strangregulierventil", "strangregulierventile", "abgleichventil",
        "abgleichventile", "stad", "stap", "strangabgleichventil",
        "einregulierventil", "drosselventil",
    ],
    # Heizkörper (Roadmap P0 #3).
    "radiator": [
        "heizkörper", "heizkoerper", "radiator", "radiatoren", "flachheizkörper",
        "flachheizkoerper", "röhrenradiator", "handtuchradiator", "badheizkörper",
    ],
    "heat_meter": [
        "wärmezähler", "waermezaehler", "wärmemengenzähler", "waermemengenzaehler",
        "wmz", "energiezähler heizung",
    ],
    "floor_heating_manifold": [
        "bodenheizungsverteiler", "bodenheizungsverteilerkasten",
        "fussbodenheizungsverteiler", "fußbodenheizungsverteiler",
        "fbh-verteiler", "fbh verteiler", "heizkreisverteiler fbh",
        "flächenheizungsverteiler", "flaechenheizungsverteiler",
    ],
    "buffer": [
        "pufferspeicher", "puffer", "technikspeicher", "heizungspufferspeicher",
        "kombispeicher", "technischer speicher", "heizungsspeicher",
        "energiespeicher", "enerval",
    ],
    "borehole": [
        "erdsonde", "erdsonden", "duplexsonde", "duplexsonden", "erdwärmesonde",
        "erdwaermesonde",
    ],
    "heat_generator": [
        "wärmepumpe", "waermepumpe", "sole/wasser-wärmepumpe", "luft/wasser-wärmepumpe",
        "wärmeerzeuger", "erdsonden-wp", "sole-wasser-wp",
    ],
    "pipe": [
        "rohr", "rohrleitung", "verrohrung", "heizungsleitung", "stahlrohr",
        "kupferrohr", "verbundrohr", "pressfitting-rohr",
    ],
}

# ── Rohrmeter (Punkt 11) ───────────────────────────────────────────────────
# Nur echte Heizungs-/Verteilrohre zählen als Rohrmeter.
PIPE_INCLUDE_TERMS: tuple[str, ...] = (
    "geschweisste gasrohre", "geschweisste siederohre", "gasrohre", "siederohre",
    "stahlrohr", "stahlrohre", "c-stahlrohr", "c-stahlrohre", "pressrohr",
    "pressrohre", "pressfitting-rohr", "kupferrohr", "kupferrohre",
    "edelstahlrohr", "edelstahlrohre", "kunststoffrohre verteilung",
    "rohrleitung", "rohrleitungen", "verrohrung", "heizungsleitung",
)
# Flächenheizungsrohre gehören NICHT in die Verteilrohrmeter — sie werden über
# die Fläche kalkuliert und würden die Rohrmeter massiv verfälschen.
PIPE_EXCLUDE_TERMS: tuple[str, ...] = (
    "bodenheizungsrohr", "bodenheizungsrohre", "fbh-rohr", "fbh-rohre",
    "flächenheizungsschlange", "flächenheizungsschlangen",
    "flaechenheizungsschlange", "flaechenheizungsschlangen",
    "heizkreisschlaufe", "heizkreisschlaufen", "bodenheizungsverteiler",
    "fussbodenheizungsrohr", "fussbodenheizungsrohre",
)
# Abschnittstitel, unter denen Rohrmeter nicht als Verteilrohre zählen.
PIPE_EXCLUDE_SECTION_TERMS: tuple[str, ...] = (
    "flächenheizung", "flaechenheizung", "bodenheizung", "fussbodenheizung",
    "fussbodenheizungen", "wandheizung", "tabs",
)
# Quellenseite (Primärkreis/Erdsondensammler) vs. Verteilung.
PIPE_SOURCE_TERMS: tuple[str, ...] = (
    "primärkreis", "primaerkreis", "erdsondensammler", "sondensammler",
    "sole", "quellenkreis", "erdsonde", "erdsonden",
)

# ── Speicherarten (Punkt 9) ────────────────────────────────────────────────
# Nur technisch relevante Heizungsspeicher sind Kostentreiber. Ein Wassererwärmer
# bzw. BWW-Speicher darf nicht automatisch als Pufferspeicher gezählt werden.
TECHNICAL_BUFFER = "technical_buffer"
BWW_STORAGE = "bww_storage"
COMBINED_STORAGE = "combined_storage"
UNKNOWN_STORAGE = "unknown_storage"

STORAGE_TERMS: dict[str, tuple[str, ...]] = {
    TECHNICAL_BUFFER: (
        "pufferspeicher", "technikspeicher", "technischer speicher",
        "heizungspufferspeicher", "heizungsspeicher", "energiespeicher",
        "enerval", "puffer",
    ),
    BWW_STORAGE: (
        "wassererwärmer", "wassererwaermer", "bww-speicher", "bww speicher",
        "brauchwarmwasserspeicher", "warmwasserspeicher", "boiler",
        "trinkwasserspeicher", "bws",
    ),
    COMBINED_STORAGE: (
        "kombispeicher", "kombinationsspeicher", "hygienespeicher",
        "frischwasserspeicher",
    ),
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
    # Eine generische „Wärmepumpe" ist keine Wasser/Wasser-WP. Ohne erkennbare
    # Quelle bleibt sie bewusst unspezifisch und wird im Review geprüft.
    ("sonstige", ("wärmepumpe", "waermepumpe", "wp")),  # generisch zuletzt
]
