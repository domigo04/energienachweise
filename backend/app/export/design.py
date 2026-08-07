"""Auftritt der Exporte je Firma.

Das Heizungscockpit ist mandantenfähig: ein Export gehört der Firma, die ihn
erzeugt. Deshalb ist der Look hier **keine globale Palette**, sondern eine
`Marke` je Firma.

* `STANDARD` — der Auftritt, den alle Firmen heute haben. Er bleibt Zeichen für
  Zeichen unverändert; wer nicht ausdrücklich eine eigene Marke hat, bekommt
  exakt das bisherige Dokument.
* `SIREGO` — Markenblau und das Logo blass hinter dem Inhalt, nach der
  Vertragsvorlage von SIREGO.

Der Grund für die Trennung: ein Wasserzeichen mit fremdem Logo auf dem Nachweis
einer anderen Firma wäre ein Fehler, den man nicht mehr einfangen kann, sobald
das PDF beim Bauherrn liegt.

## Woher die SIREGO-Werte stammen

Aus der Vorlage gemessen, nicht geschätzt:

* Markenblau `#12AAFD` — dieselbe Farbe trägt `frontend/src/png/logo.png` auf
  43 854 ihrer Pixel; die Vorlage zeichnet sie als `0.0706 0.6667 0.9922 scn`.
* Wasserzeichen mit **20 % Deckkraft** (`/Gs5: ca=0.2` im Grafikzustand).
* Platzierung rechts unten, Bounding-Box `[279, 0, 595, 445]` auf A4.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

from reportlab.lib.utils import ImageReader

LOGO_VERZEICHNIS = Path(__file__).with_name("assets")

PLANER = "SIREGO GmbH · Dominic Goulon · Winterthur"


def _rgb(hexwert: str) -> tuple[float, float, float]:
    """«12AAFD» → (0.071, 0.667, 0.992). reportlab rechnet in 0–1."""
    h = hexwert.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


@dataclass(frozen=True)
class Marke:
    """Der Auftritt einer Firma im Export.

    `logo_datei` ist das Wasserzeichen. `None` heisst ausdrücklich «keines» —
    nicht «noch keines gefunden». Eine Firma ohne eigene Marke bekommt ein
    sauberes Dokument ohne fremdes Zeichen darauf.
    """

    schluessel: str
    akzent: tuple[float, float, float]
    logo_datei: Optional[str] = None
    deckkraft: float = 0.2
    anteil: float = 0.55            # Anteil der Blattbreite

    @property
    def hat_wasserzeichen(self) -> bool:
        return self.logo_datei is not None


# Der heutige Auftritt: roter Akzent, kein Wasserzeichen. Diese Werte sind die
# Farben, die vorher fest im Zeichencode standen — sie bleiben unverändert.
STANDARD = Marke(schluessel="standard", akzent=(0.86, 0.15, 0.15))

SIREGO = Marke(
    schluessel="sirego",
    akzent=_rgb("12AAFD"),
    logo_datei="logo.png",
)

MARKEN = {m.schluessel: m for m in (STANDARD, SIREGO)}


def fuer_firma(firma_name: Optional[str]) -> Marke:
    """Firmenname → Marke. Unbekannt heisst `STANDARD`, nie geraten.

    Bewusst eine Namensprüfung und keine Konfigurationsspalte: solange es genau
    eine Marke gibt, wäre eine Tabelle mehr Mechanik als Nutzen. Kommt eine
    zweite Firma mit eigenem Auftritt dazu, gehört das in die Firmenverwaltung
    (`Firma.logo_data_url` liegt dort bereits) und diese Funktion wird ersetzt.
    """
    name = (firma_name or "").strip().lower()
    if name.startswith("sirego"):
        return SIREGO
    return STANDARD


@lru_cache(maxsize=4)
def _logo(datei: str) -> Optional[ImageReader]:
    """Ein Logo, einmal geladen.

    Fehlt die Datei, wird NICHT gezeichnet und auch nicht abgebrochen: ein
    Export ohne Wasserzeichen ist brauchbar, ein Export, der an einer fehlenden
    Zierde scheitert, nicht.
    """
    try:
        return ImageReader(str(LOGO_VERZEICHNIS / datei))
    except Exception:
        return None


def wasserzeichen(c, seitenbreite: float, seitenhoehe: float,
                  marke: Marke = STANDARD) -> None:
    """Das Logo blass hinter den Inhalt legen — rechts unten wie in der Vorlage.

    Muss VOR dem Inhalt gezeichnet werden; PDF kennt keine Ebenen, es gilt die
    Zeichenreihenfolge. `saveState`/`restoreState` klammert die Deckkraft ein —
    ohne das bliebe die ganze Seite blass.

    Für `STANDARD` passiert hier nichts. Das ist der Normalfall.
    """
    if not marke.hat_wasserzeichen:
        return
    bild = _logo(marke.logo_datei)
    if bild is None:
        return
    quell_b, quell_h = bild.getSize()
    if not quell_b or not quell_h:
        return
    breite = seitenbreite * marke.anteil
    hoehe = breite * quell_h / quell_b
    # Rechts unten, leicht über den Blattrand hinaus — wie in der Vorlage, wo
    # das Logo angeschnitten ist statt frei zu schweben.
    x = seitenbreite - breite * 0.82
    y = -hoehe * 0.10
    c.saveState()
    c.setFillAlpha(marke.deckkraft)
    c.setStrokeAlpha(marke.deckkraft)
    c.drawImage(bild, x, y, width=breite, height=hoehe,
                mask="auto", preserveAspectRatio=True, anchor="sw")
    c.restoreState()


def logo_klein(c, x: float, y: float, hoehe: float,
               marke: Marke = STANDARD) -> float:
    """Das Logo in Originalfarbe für den Seitenkopf. Gibt die Breite zurück."""
    if not marke.hat_wasserzeichen:
        return 0.0
    bild = _logo(marke.logo_datei)
    if bild is None:
        return 0.0
    quell_b, quell_h = bild.getSize()
    if not quell_b or not quell_h:
        return 0.0
    breite = hoehe * quell_b / quell_h
    c.drawImage(bild, x, y, width=breite, height=hoehe,
                mask="auto", preserveAspectRatio=True, anchor="sw")
    return breite
