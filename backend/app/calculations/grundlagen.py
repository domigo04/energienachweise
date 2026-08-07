"""Grundlage jeder Berechnung — Norm, Richtlinie oder benannte Firmenmethode.

Ein Energienachweis wird geprüft. Steht dort ein Expansionsgefäss mit 200 l,
lautet die erste Frage des Prüfers: nach welcher Grundlage? Diese Datei ist die
EINE Stelle, an der diese Antwort steht — Rechenweg und PDF holen sie hier ab,
damit sie nie auseinanderlaufen.

## Die Regel, an der dieses Modul hängt

Eine geratene Normangabe ist schlimmer als gar keine, weil sie geprüft
aussieht. Darum steht hier ausschliesslich, was Dominic ausdrücklich
entschieden hat — mit Fundstelle. Die Zuordnung Berechnung → Grundlage ist eine
**fachliche Aussage**; sie wird hier nicht hergeleitet, nicht recherchiert und
nicht aus der Methode erschlossen.

## Warum nicht jede Berechnung eine Grundlage trägt

Nach Entscheid Dominic (2026-08-07) hängt das am Schaden, den ein Fehler
anrichtet:

* **Kritisch** — Erdsonden, Trinkwarmwasserspeicher und Expansionsgefäss. Eine
  falsche Auslegung ist hier teuer bis gefährlich; sie hat deshalb eine Norm,
  und die gehört in den Nachweis.
* **Unkritisch** — Ventile, technischer Speicher und die übrigen. Für sie gibt
  es schlicht **keine** einschlägige Norm.

Wo keine Grundlage besteht, steht im Nachweis auch **nichts**. Der frühere
Hinweis «Grundlage nicht angegeben» wurde zurückgenommen: er las sich wie ein
Versäumnis, obwohl die Abwesenheit einer Norm dort die richtige Aussage ist.

## Wie eine weitere Zeile ergänzt wird

`GRUNDLAGEN[...] = Grundlage("SIA …", ausgabe="…", abschnitt="…",
fundstelle="Entscheid Dominic <Datum>")` — mehr ist nicht nötig. Rechenweg,
Ergebnis und PDF ziehen die Angabe automatisch nach.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# Ohne Grundlage steht im Nachweis nichts (Entscheid Dominic 2026-08-07).
# Die Konstante bleibt als leerer Text bestehen, damit Aufrufer weiterhin
# gegen einen Wert prüfen können statt gegen `None`.
GRUNDLAGE_FEHLT = ""


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

    # Expansionsgefäss: SWKI 301-01 (Entscheid Dominic 2026-08-07). Der
    # Modulkopf nannte bisher nur «Auslegung nach Dominics Excel»; damit war
    # offen, ob e-Tabelle und Faktor X der Richtlinie folgen oder eine
    # Hausmethode sind. Sie folgen ihr. Ohne Ausgabejahr, weil keines genannt
    # wurde — eine erfundene Jahreszahl wäre schlimmer als keine.
    "expansion": Grundlage(
        bezeichnung="SWKI 301-01",
        fundstelle="Entscheid Dominic 2026-08-07",
    ),
    # Erdsonden-Druckverlust: SIA 384/6 (Entscheid Dominic 2026-08-07). Das
    # Modul zitierte die Norm bisher nur für die Nenndruckstufe und dort als
    # «informativ»; sie gilt für die Auslegung insgesamt. Ausgabe 2021 wie bei
    # `sole_rohre` — dieselbe Norm, in PHYSIK.md §19 mit Jahr belegt.
    "sole_druckverlust": Grundlage(
        bezeichnung="SIA 384/6",
        ausgabe="2021",
        fundstelle="Entscheid Dominic 2026-08-07; Ausgabe aus PHYSIK.md §19",
    ),

    # ── Ohne Grundlage ────────────────────────────────────────────────────
    #
    # Für diese Berechnungen gibt es keine einschlägige Norm (Entscheid Dominic
    # 2026-08-07). Eine falsche Auslegung ist hier nicht kritisch — anders als
    # bei Erdsonden, Trinkwarmwasser und Expansionsgefäss. Im Nachweis steht
    # dazu nichts; das ist die richtige Aussage, kein Versäumnis.
    "betriebsfaelle": None,
    "bkp": None,
    "druckverlust": None,
    "einzel": None,
    "grobkostenschaetzung": None,
    "heizgruppen": None,
    "hydraulik": None,
    "kostenschaetzung": None,
    "leitungsdimension": None,
    "ravel": None,
    "schema_mengen": None,
    "schema_sizing": None,
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

    Ohne Grundlage kommt ein leerer Text zurück — nicht «Grundlage: ». Der
    Aufrufer zeichnet dann gar nichts.
    """
    text = grundlage_text(schluessel)
    return f"Grundlage: {text}" if text else ""


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
