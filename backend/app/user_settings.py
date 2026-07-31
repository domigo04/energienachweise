"""Persönliche Editor-Einstellungen eines Benutzers (Feedback Dominic 2026-07-31).

Die Tastenbelegung des Schema-Editors gehört dem *Benutzer*, nicht dem Projekt.
Bisher lag sie in `graph.drawing_config` und war damit Teil des Schemas: zwei
Planer am selben Projekt haben sich gegenseitig die Tasten umgestellt, und beim
Öffnen eines fremden Schemas galt plötzlich eine fremde Belegung.

Diese Datei enthält NUR die Regeln — rein, ohne DB, ohne FastAPI, damit sie
ohne Serverstart prüfbar sind:

* Welche Befehle überhaupt belegbar sind.
* Was eine gültige Taste ist (genau ein Zeichen, klein geschrieben).
* Dass keine zwei Befehle dieselbe Taste bekommen.

Eine doppelte Belegung wird nicht stillschweigend geduldet: sonst löst eine
Taste zwei Befehle aus, und welcher gewinnt, hängt an der Reihenfolge im Code.
Der zuletzt gesetzte Befehl behält die Taste, der frühere fällt auf seinen
Standard zurück — und wenn auch der belegt ist, bleibt er ohne Taste.
"""
from __future__ import annotations

from typing import Optional

# Belegbare Befehle mit ihrer Standardtaste. Die Liste spiegelt bewusst
# DEFAULT_DRAWING_CONFIG im Frontend (`schema/graphMigration.js`) — beide Seiten
# müssen dieselben Befehle kennen, sonst speichert die eine, was die andere
# ignoriert.
STANDARD_SHORTCUTS: dict[str, str] = {
    "shortcut_line": "l",
    "shortcut_polyline": "p",
    "shortcut_rotate": "d",
    "shortcut_mirror": "s",
    "shortcut_align": "a",
    "shortcut_move": "m",
    "shortcut_break": "k",
    "shortcut_stretch": "x",
}

# Tasten, die der Editor fest vergeben hat. Sie stehen nicht zur Belegung frei,
# weil sonst ein Befehl eine Taste bekäme, die er nie zu sehen bekommt.
RESERVIERTE_TASTEN = frozenset({"escape", "enter", "tab", "backspace", "delete", " "})


def _taste(wert) -> Optional[str]:
    """Genau ein Zeichen, klein geschrieben — sonst None (ungültig)."""
    if wert is None:
        return None
    text = str(wert).strip().lower()
    if len(text) != 1 or not text.strip():
        return None
    if text in RESERVIERTE_TASTEN:
        return None
    # Ziffern eröffnen beim Zeichnen die numerische Längeneingabe. Als Befehls-
    # taste würden sie mitten in einer Leitung etwas ganz anderes auslösen.
    if text.isdigit():
        return None
    return text


def bereinige_shortcuts(eingabe: Optional[dict]) -> dict:
    """Vollständige, widerspruchsfreie Tastenbelegung aus einer Teilangabe.

    Unbekannte Schlüssel fliegen raus, ungültige Tasten fallen auf den Standard
    zurück, und eine Taste gehört am Ende genau einem Befehl.
    """
    roh = eingabe if isinstance(eingabe, dict) else {}

    # 1. Wunschtasten einsammeln — in der festen Reihenfolge der Befehle, damit
    #    das Ergebnis nicht von der Reihenfolge im übergebenen Dict abhängt.
    gewuenscht: dict[str, Optional[str]] = {}
    for befehl in STANDARD_SHORTCUTS:
        gewuenscht[befehl] = _taste(roh.get(befehl))

    ergebnis: dict[str, Optional[str]] = {}
    vergeben: set[str] = set()

    # 2. Ausdrücklich gewünschte Tasten zuerst. Bei einem Konflikt gewinnt der
    #    zuletzt genannte Befehl — der Planer hat ihn gerade eingetippt.
    for befehl, taste in gewuenscht.items():
        if taste is None:
            continue
        for anderer, andere_taste in ergebnis.items():
            if andere_taste == taste:
                ergebnis[anderer] = None
                vergeben.discard(taste)
        ergebnis[befehl] = taste
        vergeben.add(taste)

    # 3. Wer keine gültige Wunschtaste hat, bekommt seinen Standard — sofern der
    #    noch frei ist. Sonst bleibt der Befehl bewusst ohne Taste, statt einer
    #    zufälligen Ersatztaste, die niemand erwartet.
    for befehl, standard in STANDARD_SHORTCUTS.items():
        if ergebnis.get(befehl):
            continue
        ergebnis[befehl] = standard if standard not in vergeben else None
        if ergebnis[befehl]:
            vergeben.add(standard)

    return {befehl: ergebnis.get(befehl) for befehl in STANDARD_SHORTCUTS}


def bereinige_einstellungen(eingabe: Optional[dict]) -> dict:
    """Der komplette persönliche Einstellungssatz.

    Heute nur die Tastenbelegung. Die Struktur ist trotzdem verschachtelt, damit
    eine spätere Einstellung (Fangtoleranz, Farbschema) dazukommen kann, ohne
    dass gespeicherte Sätze neu geschrieben werden müssen.
    """
    roh = eingabe if isinstance(eingabe, dict) else {}
    return {"shortcuts": bereinige_shortcuts(roh.get("shortcuts"))}
