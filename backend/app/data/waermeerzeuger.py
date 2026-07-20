"""Kanonische, reihenfolgeunabhängige Beschreibung der Wärmeerzeuger-Auswahl.

Die Auswahlwerte der Oberfläche bleiben unverändert. Die Signatur verhindert,
dass Nicht-Wärmepumpen (z.B. Gas, Öl und Fernwärme) wegen ``wp_typ=None`` im
gleichen Hard-Filter-Segment landen. Mehrfachauswahlen werden als exakte
Anlagenkombination behandelt.
"""
import re


_ERZEUGER_KLASSEN = {
    "Erdsonden-WP": "sole_wp",
    "Luft/Wasser-WP": "luft_wp",
    "Wasser/Wasser-WP": "wasser_wp",
    "Fernwärme": "fernwaerme",
    "Gas": "gas",
    "Öl": "oel",
    "Pellets/Holz": "holz",
    "Solarthermie": "solarthermie",
}


def _unbekannte_klasse(wert: str) -> str:
    normalisiert = re.sub(r"[^a-z0-9]+", "_", wert.casefold()).strip("_")
    return f"sonstige:{normalisiert}"


def erzeuger_klassen_von(waermeerzeuger) -> tuple[str, ...]:
    """Liefert eindeutige Klassen; Reihenfolge und Duplikate sind irrelevant."""
    klassen = {
        _ERZEUGER_KLASSEN.get(wert, _unbekannte_klasse(wert))
        for wert in (waermeerzeuger or [])
        if isinstance(wert, str) and wert.strip()
    }
    return tuple(sorted(klassen))


def erzeuger_signatur_von(waermeerzeuger) -> str:
    """Stabile Signatur einer Mono- oder Hybridanlage für den Hard-Filter."""
    return "+".join(erzeuger_klassen_von(waermeerzeuger))
