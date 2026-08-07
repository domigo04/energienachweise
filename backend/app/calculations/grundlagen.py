"""Grundlage jeder Berechnung — Norm, Richtlinie oder benannte Firmenmethode.

Ein Energienachweis wird geprüft. Steht dort ein Expansionsgefäss mit 200 l,
lautet die erste Frage des Prüfers: nach welcher Grundlage? Diese Datei ist die
EINE Stelle, an der diese Antwort steht — Rechenweg und PDF holen sie hier ab,
damit sie nie auseinanderlaufen.

## Die Regel, an der dieses Modul hängt

Eine geratene Normangabe ist schlimmer als gar keine, weil sie geprüft
aussieht. Darum steht hier ausschliesslich, was im Code oder in `PHYSIK.md`
tatsächlich belegt ist — mit Fundstelle. Alles andere trägt ausdrücklich
`GRUNDLAGE_FEHLT`, und das erscheint sichtbar im Nachweis.

Die Zuordnung Berechnung → Grundlage ist eine **fachliche Aussage**. Sie wird
hier nicht hergeleitet, nicht recherchiert und nicht aus der Methode erschlossen
— sie wird von Dominic eingetragen. Dieses Modul liefert nur den Mechanismus.

## Wie eine offene Zeile geschlossen wird

`GRUNDLAGEN[...] = Grundlage("SWKI 301-01", ausgabe="2013", abschnitt="…",
fundstelle="Entscheid Dominic <Datum>")` — mehr ist nicht nötig. Rechenweg,
Ergebnis und PDF ziehen die Angabe automatisch nach.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# Genau dieser Wortlaut erscheint im Rechenweg UND im PDF, wenn nichts
# hinterlegt ist. Eine Lücke darf nicht wie eine bewusste Entscheidung
# aussehen — deshalb steht sie ausgeschrieben da und nicht als leere Zeile.
GRUNDLAGE_FEHLT = "Grundlage nicht angegeben"


@dataclass(frozen=True)
class Grundlage:
    """Bezeichnung der Grundlage, plus wo vorhanden Ausgabe/Jahr und Abschnitt.

    `fundstelle` ist die Stelle, die die Zuordnung BELEGT — Datei und Zeile oder
    ein Abschnitt in `PHYSIK.md`. Sie steht nicht im Nachweis, sondern dient dem
    Review: Wer die Angabe anzweifelt, kann sie nachschlagen, statt sie zu
    glauben.
    """

    bezeichnung: str
    ausgabe: Optional[str] = None
    abschnitt: Optional[str] = None
    fundstelle: Optional[str] = None

    @property
    def text(self) -> str:
        """Die Angabe, wie sie im Rechenweg und im PDF steht — wortgleich."""
        teil = self.bezeichnung
        if self.ausgabe:
            teil = f"{teil}:{self.ausgabe}"
        if self.abschnitt:
            teil = f"{teil}, {self.abschnitt}"
        return teil


# ── Die Zuordnung ──────────────────────────────────────────────────────────
#
# Schlüssel = Modulname unter `app/calculations/`. Ein Eintrag `None` heisst
# ausdrücklich «noch nicht entschieden», NICHT «keine Grundlage nötig».
#
# Belegt sind heute genau zwei Zeilen. Beide stehen so bereits im Code und in
# `PHYSIK.md`; hier wird nichts Neues behauptet.
GRUNDLAGEN: dict[str, Optional[Grundlage]] = {
    # SIA 385/2 steht im Modulkopf, an `bww_auslegung` und bereits im PDF
    # (`export/pdf.py`, Zeile «Norm»). PHYSIK.md §22 trägt denselben Titel.
    "bww_sia385": Grundlage(
        bezeichnung="SIA 385/2",
        abschnitt="Speichervolumen und Anschlussleistung",
        fundstelle="bww_sia385.py:1 und :194; PHYSIK.md §22; export/pdf.py «Norm»",
    ),
    # Die Rohr- und Druckstufentabellen sind im Modul zeilenweise mit
    # «SIA 384/6:2021 Tabelle 10» bzw. «Tabelle 8» beschriftet; PHYSIK.md §19
    # nennt dieselbe Quelle mit Ausgabejahr.
    "sole_rohre": Grundlage(
        bezeichnung="SIA 384/6",
        ausgabe="2021",
        abschnitt="Tabelle 10 (Rohrmasse) und Tabelle 8 (SDR, Differenzdrücke)",
        fundstelle="sole_rohre.py:4, :29-:86, :100, :109; PHYSIK.md §19",
    ),

    # ── Offen — von Dominic zu entscheiden ────────────────────────────────
    #
    # Bewusst `None` statt einer plausiblen Vermutung. Zu jeder Zeile steht,
    # was im Code über die Herkunft bekannt ist; die Frage dazu liegt in der PR.
    "betriebsfaelle": None,
    "bkp": None,
    "druckverlust": None,
    "einzel": None,
    # Der Modulkopf sagt «Auslegung nach Dominics Excel
    # (Expanion_dominic_goulon.xlsx)», PHYSIK.md §8 ebenso. Ob die e-Tabelle und
    # der Faktor X der SWKI-Richtlinie entsprechen oder eine Hausmethode sind,
    # entscheidet über «SWKI 301-01» vs. «Firmenmethode, angelehnt an
    # SWKI 301-01». Das kann nur der Fachplaner sagen.
    "expansion": None,
    "grobkostenschaetzung": None,
    "heizgruppen": None,
    "hydraulik": None,
    "kostenschaetzung": None,
    "leitungsdimension": None,
    "ravel": None,
    "schema_mengen": None,
    "schema_sizing": None,
    # Zitiert SIA 384/6 NUR für die Nenndruckstufe nach Sondentiefe
    # (sole_druckverlust.py:207/:222, dort ausdrücklich «informativ»). Das
    # Druckverlustverfahren selbst stammt laut PHYSIK.md §18 aus
    # `Erdsonden.xlsx` und rechnet mit Blasius/Nikuradse/Prandtl-Kármán. Die
    # Norm deshalb NICHT auf das ganze Modul zu ziehen wäre eine Ableitung.
    "sole_druckverlust": None,
    "ventil": None,
    "waermepumpe": None,
}


def grundlage(schluessel: str) -> dict:
    """Die Grundlage einer Berechnung als serialisierbares Feld.

    `angegeben` unterscheidet «steht fest» von «noch offen». Der Aufrufer muss
    dafür nicht auf den Text prüfen — sonst entstünde irgendwann ein zweiter
    Wortlaut für dieselbe Lücke.
    """
    eintrag = GRUNDLAGEN.get(schluessel)
    if eintrag is None:
        return {
            "schluessel": schluessel,
            "text": GRUNDLAGE_FEHLT,
            "angegeben": False,
            "bezeichnung": None,
            "ausgabe": None,
            "abschnitt": None,
        }
    return {
        "schluessel": schluessel,
        "text": eintrag.text,
        "angegeben": True,
        "bezeichnung": eintrag.bezeichnung,
        "ausgabe": eintrag.ausgabe,
        "abschnitt": eintrag.abschnitt,
    }


def grundlage_text(schluessel: str) -> str:
    """Nur der Wortlaut — für PDF-Zeilen, die keine Struktur brauchen."""
    return grundlage(schluessel)["text"]


def grundlage_zeile(schluessel: str) -> str:
    """Die Zeile, die im Rechenweg und im PDF steht — an beiden Orten gleich.

    Genau EINE Funktion baut diesen Text. Zwei Formulierungen für dieselbe
    Angabe wären der sichere Weg dahin, dass Editor und Nachweis irgendwann
    Verschiedenes behaupten.
    """
    return f"Grundlage: {grundlage_text(schluessel)}"


def mit_grundlage(resultat: dict, schluessel: str) -> dict:
    """Grundlage als eigenes Feld in ein Ergebnis-Dict eintragen.

    Verändert das übergebene Dict und gibt es zurück, damit ein
    `return mit_grundlage(...)` möglich bleibt.

    Die Angabe kommt bewusst NICHT in die `rechenweg`-Liste. Diese Liste ist
    eine Folge setzbarer Formelschritte — `test_jeder_rechenschritt_…_ist_setzbar`
    und `test_speicherkonfiguration_…` verlangen von jedem Eintrag LaTeX und eine
    Breite grösser null. Eine Grundlage ist keine Formel; sie dort einzureihen
    hiesse, drei berechtigte Prüfungen aufzuweichen. Stattdessen zieht der
    Rechenweg-Block sie über `grundlage_zeile()` als Kopfzeile heran — für den
    Leser steht sie damit im Rechenweg, ohne die Schrittliste zu verfälschen.

    Rechnet NICHTS. Ein bestehender Zahlenwert wird nie angefasst — das ist die
    Bedingung, unter der dieses Feature überhaupt eingebaut werden durfte.
    """
    if not isinstance(resultat, dict):
        return resultat
    resultat["grundlage"] = grundlage(schluessel)
    return resultat


def offene_grundlagen() -> list[str]:
    """Alle Berechnungen ohne hinterlegte Grundlage — für Übergabe und Test."""
    return sorted(k for k, v in GRUNDLAGEN.items() if v is None)
