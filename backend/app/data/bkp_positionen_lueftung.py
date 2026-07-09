"""BKP-Positions-Katalog Lüftung (Gewerk "lueftung") — ERSTER ENTWURF,
abgeleitet aus Dominics 3-Plan-Vorlage (2026-07-09). Dort ist Lüftung nur auf
Gruppen-Ebene erfasst (keine Dezimal-Unterpositionen wie bei Heizung) —
Dominic soll das gegenprüfen, bevor produktiv damit gearbeitet wird.

Treiber: gelüftete Fläche [m²] (einzige Bezugsgrösse in der Vorlage mit Stern).
"""

BKP_GRUPPEN_LUEFTUNG = {
    "244": "Lüftungsanlagen",
    "245": "Klimaanlagen",
    "249": "Übriges Lüftung",
}

BKP_POSITIONEN_LUEFTUNG = [
    {"bkp_nr": "244", "bezeichnung": "Lüftungsanlagen"},
    {"bkp_nr": "245", "bezeichnung": "Klimaanlagen (Kühlung/Befeuchtung)"},
    {"bkp_nr": "249", "bezeichnung": "Übriges Lüftung"},
]

TREIBER_LUEFTUNG = "gelueftete_flaeche"
TREIBER_LABEL_LUEFTUNG = "CHF/m² gelüftete Fläche"
