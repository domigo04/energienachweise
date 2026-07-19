"""BKP-Positions-Katalog aus Dominics Norm-Leistungsverzeichnis (Stand 2026-07-14,
vollständig von Dominic geliefert — inkl. Tank/Gas/Öl, die früher weggelassen
waren; sein schriftliches Leistungsverzeichnis ist massgebend).

- wp_typen None  → Position gilt für alle Wärmepumpen-Typen (und für Gas/Öl/Tank,
  die keinem WP-Typ zugeordnet sind — sie erscheinen im Norm-LV, bleiben bei
  Wärmepumpen-Projekten mangels Referenzdaten aber bei 0).
- kategorien None → Position gilt für alle Gebäudekategorien.
"""

BKP_GRUPPEN = {
    "241": "Energielagerung",
    "242": "Wärmeerzeugung",
    "243": "Wärmeverteilung",
    "247": "Spezialanlagen",
    "248": "Dämmungen",
    "249": "Diverses",
}


def _p(nr, bezeichnung, wp_typen=None, kategorien=None, abgabe=None):
    # abgabe (None|"koerper"|"flaeche"|"deckenstrahl"|"luft"): Verteil-Position gilt
    # nur für die passende Wärmeabgabe. None = gilt immer (Rohre, Regelung, Montage …).
    return {"bkp_nr": nr, "bezeichnung": bezeichnung, "wp_typen": wp_typen, "kategorien": kategorien, "abgabe": abgabe}


SOLE = ["sole_wasser"]
ALLE_WP = ["sole_wasser", "luft_wasser", "wasser_wasser"]

BKP_POSITIONEN = [
    # 241 — Energielagerung
    _p("241.1a", "Tank aus Kunststoff"),
    _p("241.1b", "Tank aus Stahl"),
    _p("241.2", "Montage / Transport"),
    _p("241.10", "Expansion und Sicherheit Primärkreis WP / Erdsondensammler", SOLE),
    _p("241.11", "Rohrleitungen Primärkreis WP / Erdsondensammler", SOLE),
    _p("241.12", "Apparate / Armaturen Primärkreis WP / Erdsondensammler", SOLE),
    _p("241.13", "Montage / Transport Primärkreis WP / Erdsondensammler", SOLE),
    _p("241.14", "Erdsonden und Zubehör", SOLE),
    # 242 — Wärmeerzeugung
    _p("242.1", "Gasheizkessel"),
    _p("242.2", "Ölheizkessel"),
    _p("242.3", "Wärmepumpe Sole/Wasser", ["sole_wasser"]),
    _p("242.4", "Wärmepumpe Luft/Wasser", ["luft_wasser"]),
    _p("242.5", "Wärmepumpe Wasser/Wasser", ["wasser_wasser"]),
    _p("242.6", "Expansion und Sicherheit", ALLE_WP),
    _p("242.7", "Montage / Transport Wärmeerzeugung", ALLE_WP),
    # 243 — Wärmeverteilung (243.2*/3*/4* hängen an der Wärmeabgabe, der Rest gilt immer)
    _p("243.1", "Rohrleitungen"),
    _p("243.2a", "Heizkörper (Zwei-Rohr)", abgabe="koerper"),
    _p("243.2b", "Heizkörper (Stern-System)", abgabe="koerper"),
    _p("243.2c", "Badheizkörper", abgabe="koerper"),
    _p("243.3a", "Flächenheizung (Bodenheizung)", abgabe="flaeche"),
    _p("243.3b", "Flächenheizung (Deckenstrahlplatten)", abgabe="deckenstrahl"),
    _p("243.4a", "Luftheizapparate", abgabe="luft"),
    _p("243.4b", "Torluftschleier", None, ["Gewerbe", "Industrie"], abgabe="luft"),
    _p("243.5", "Apparate / Armaturen PWW"),
    _p("243.6", "Regelung"),
    _p("243.7", "Wärmemessung"),
    _p("243.8", "Schaltschrank"),
    _p("243.9", "Montage / Transport Wärmeverteilung"),
    # 247 — Spezialanlagen
    _p("247.5", "Mobile Heizzentrale"),
    _p("247.6", "Kaminanlage"),
    # 248 — Dämmungen
    _p("248.1", "Bodenisolation"),
    _p("248.2", "Rohrisolation Heizung"),
    _p("248.3", "Armaturen-Isolation Heizung"),
    # 249 — Diverses
    _p("249.1", "Wartungsunterlagen"),
    _p("249.2", "Unvorhergesehenes / Anpassungen"),
    _p("249.3", "Demontage"),
    _p("249.4", "Gerüste für Montage in Überhöhen"),
    _p("249.5", "Ausführungsplanung"),
    _p("249.6", "Integraler Test"),
    _p("249.7", "Betriebsoptimierung"),
    _p("249.8", "Montageorganisation und AVOR"),
]


# ── Treiber je BKP (welche Bezugsgrösse bestimmt den Kennwert) ──────────────
# 241 Erdsonden → CHF/Bohrmeter · 242 Erzeugung → CHF/kW ·
# 243.2* Heizkörper → CHF/Einheit · alles übrige → CHF/m² EBF.
TREIBER_LABEL = {
    "bohrmeter": "CHF/Bohrmeter",
    "kw": "CHF/kW",
    "einheiten": "CHF/Einheit",
    "ebf": "CHF/m² EBF",
}


def treiber_fuer_bkp(bkp_nr: str) -> str:
    """Gibt den Treiber-Schlüssel ('bohrmeter'|'kw'|'einheiten'|'ebf') zurück."""
    gruppe = bkp_nr.split(".")[0]
    if gruppe == "241":
        return "bohrmeter"
    if gruppe == "242":
        return "kw"
    if bkp_nr.startswith("243.2"):
        return "einheiten"
    return "ebf"


# ── Komplexitäts-Positionen (Anlagenkonfiguration) ──────────────────────────
# Diese Positionen hängen nicht vom einzelnen Erzeuger ab, sondern davon, wie
# komplex die ANLAGE als Ganzes ist (Regelung/Armaturen/Schaltschrank/Koordination
# für z.B. bivalente oder hybride Systeme). Ein monovalentes Referenzprojekt darf
# hier nicht wie ein Volltreffer zählen — siehe calculations/kostenschaetzung.py.
KOMPLEXITAETS_BKP = {"243.5", "243.6", "243.8", "249.8"}


# Wärmeabgabe-Häkchen (roh) → Positions-Klasse. Ein reines FBH-Projekt darf keine
# Heizkörper-/Luft-Positionen zeigen (Dominic 2026-07-19).
_ABGABE_KLASSE = {
    "FBH": "flaeche", "TABS": "flaeche", "Wandheizung": "flaeche",
    "Deckenstrahlplatten": "deckenstrahl",
    "Heizkörper": "koerper", "Konvektoren": "koerper",
    "Lufterhitzer": "luft",
}


def abgabe_klassen_von(waermeabgabe) -> set:
    """Aus den Wärmeabgabe-Häkchen die relevanten Positions-Klassen ableiten.
    Leer/None = unbekannt → nicht filtern (alle Verteil-Positionen zeigen)."""
    return {_ABGABE_KLASSE[a] for a in (waermeabgabe or []) if a in _ABGABE_KLASSE}


def filter_positionen(wp_typ: str = None, kategorie: str = None, abgabe_klassen=None) -> list:
    """Nur die relevanten Positionen für WP-Typ + Gebäudekategorie + Wärmeabgabe.
    abgabe_klassen leer/None = Abgabe unbekannt → nicht danach filtern."""
    out = []
    for p in BKP_POSITIONEN:
        if wp_typ and p["wp_typen"] is not None and wp_typ not in p["wp_typen"]:
            continue
        if kategorie and p["kategorien"] is not None and kategorie not in p["kategorien"]:
            continue
        if abgabe_klassen and p.get("abgabe") is not None and p["abgabe"] not in abgabe_klassen:
            continue
        gruppe_nr = p["bkp_nr"].split(".")[0]
        out.append({
            "bkp_nr": p["bkp_nr"],
            "bezeichnung": p["bezeichnung"],
            "gruppe_nr": gruppe_nr,
            "gruppe": BKP_GRUPPEN.get(gruppe_nr, ""),
            "abgabe": p.get("abgabe"),  # für die Positions-genaue Referenz-Auswahl
        })
    return out
