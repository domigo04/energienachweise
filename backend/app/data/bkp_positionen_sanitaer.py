"""BKP-Positions-Katalog Sanitär (Gewerk "sanitaer") — ERSTER ENTWURF,
abgeleitet aus Dominics 3-Plan-Vorlage (2026-07-09). Dominic soll das
gegenprüfen, bevor produktiv damit gearbeitet wird.

Treiber (Hauptbezugsgrösse mit Stern in der Vorlage): Anzahl Apparate
(Apparate aus BKP 251).
"""

BKP_GRUPPEN_SANITAER = {
    "251": "Allgemeine Sanitärapparate",
    "252": "Spezielle Sanitärapparate",
    "253": "Ver- und Entsorgungsapparate",
    "254": "Leitungen",
    "255": "Dämmungen",
    "256": "Vorwandelemente",
    "258": "Übriges",
}

BKP_POSITIONEN_SANITAER = [
    # 251 — Allgemeine Sanitärapparate
    {"bkp_nr": "251.1a", "bezeichnung": "Allgemeine Sanitärapparate — Lieferung"},
    {"bkp_nr": "251.1b", "bezeichnung": "Allgemeine Sanitärapparate — Montage"},
    # 252 — Spezielle Sanitärapparate
    {"bkp_nr": "252.1a", "bezeichnung": "Nasslöschposten — Lieferung"},
    {"bkp_nr": "252.1b", "bezeichnung": "Nasslöschposten — Montage"},
    {"bkp_nr": "252.2a", "bezeichnung": "Luftentfeuchter — Lieferung"},
    {"bkp_nr": "252.2b", "bezeichnung": "Luftentfeuchter — Montage"},
    {"bkp_nr": "252.3a", "bezeichnung": "Rinnen — Lieferung"},
    {"bkp_nr": "252.3b", "bezeichnung": "Rinnen — Montage"},
    {"bkp_nr": "252.4a", "bezeichnung": "Zähler — Lieferung"},
    {"bkp_nr": "252.4b", "bezeichnung": "Zähler — Montage"},
    {"bkp_nr": "252.5", "bezeichnung": "Sonstige spezielle Sanitärapparate"},
    # 253 — Ver- und Entsorgungsapparate
    {"bkp_nr": "253.1a", "bezeichnung": "Wassererwärmer — Lieferung"},
    {"bkp_nr": "253.1b", "bezeichnung": "Wassererwärmer — Montage"},
    {"bkp_nr": "253.2a", "bezeichnung": "Enthärtungsanlage — Lieferung"},
    {"bkp_nr": "253.2b", "bezeichnung": "Enthärtungsanlage — Montage"},
    {"bkp_nr": "253.3a", "bezeichnung": "Therm. Solaranlage — Lieferung"},
    {"bkp_nr": "253.3b", "bezeichnung": "Therm. Solaranlage — Montage"},
    {"bkp_nr": "253.4a", "bezeichnung": "Druckerhöhung — Lieferung"},
    {"bkp_nr": "253.4b", "bezeichnung": "Druckerhöhung — Montage"},
    {"bkp_nr": "253.5a", "bezeichnung": "Hebeanlage — Lieferung"},
    {"bkp_nr": "253.5b", "bezeichnung": "Hebeanlage — Montage"},
    {"bkp_nr": "253.6a", "bezeichnung": "Druckluftkompressor — Lieferung"},
    {"bkp_nr": "253.6b", "bezeichnung": "Druckluftkompressor — Montage"},
    {"bkp_nr": "253.7a", "bezeichnung": "Osmoseanlagen — Lieferung"},
    {"bkp_nr": "253.7b", "bezeichnung": "Osmoseanlagen — Montage"},
    {"bkp_nr": "253.8", "bezeichnung": "Sonstige Ver- und Entsorgungsapparate"},
    # 254 — Leitungen
    {"bkp_nr": "254.1", "bezeichnung": "Kaltwasserleitungen"},
    {"bkp_nr": "254.2", "bezeichnung": "Warmwasserleitungen"},
    {"bkp_nr": "254.3", "bezeichnung": "Schmutzabwasserleitungen"},
    {"bkp_nr": "254.4", "bezeichnung": "Dachabwasserleitungen"},
    {"bkp_nr": "254.5", "bezeichnung": "Gasleitungen"},
    {"bkp_nr": "254.6", "bezeichnung": "Druckluftleitungen"},
    {"bkp_nr": "254.7", "bezeichnung": "Grundleitungen"},
    {"bkp_nr": "254.8", "bezeichnung": "Sonstige Leitungen"},
    # 255 — Dämmungen
    {"bkp_nr": "255.1", "bezeichnung": "Dämmungen Kaltwasser"},
    {"bkp_nr": "255.2", "bezeichnung": "Dämmungen Warmwasser"},
    {"bkp_nr": "255.3", "bezeichnung": "Dämmungen Schmutzabwasser"},
    {"bkp_nr": "255.4", "bezeichnung": "Dämmungen Dachabwasser"},
    {"bkp_nr": "255.5", "bezeichnung": "Sonstige Dämmungen"},
    # 256 — Vorwandelemente
    {"bkp_nr": "256.1a", "bezeichnung": "Vorwandelemente — Lieferung"},
    {"bkp_nr": "256.1b", "bezeichnung": "Vorwandelemente — Montage"},
    # 258 — Übriges
    {"bkp_nr": "258", "bezeichnung": "Übriges Sanitär"},
]

TREIBER_SANITAER = "anzahl_apparate"
TREIBER_LABEL_SANITAER = "CHF/Apparat"
