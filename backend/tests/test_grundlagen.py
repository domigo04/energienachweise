"""Grundlage jeder Berechnung (Issue #84).

Diese Datei sichert zwei Dinge, die leicht auseinanderlaufen:

1. Die vier Berechnungen mit Norm tragen sie im Ergebnis und im Export.
2. Rechenweg und PDF nennen **denselben Wortlaut**. Zwei Formulierungen für
   dieselbe Angabe wären der sichere Weg zu einem Nachweis, der etwas anderes
   behauptet als der Bildschirm.

Was hier NICHT geprüft wird: ob die eingetragene Norm fachlich die richtige ist.
Das ist eine Aussage des Fachplaners, keine des Testlaufs.
"""
import pytest

from app.calculations.grundlagen import (
    GRUNDLAGEN,
    grundlage,
    grundlage_text,
    grundlage_zeile,
    mit_grundlage,
    offene_grundlagen,
)

# Die achtzehn Module aus der Tabelle in Issue #84.
MODULE = [
    "betriebsfaelle", "bkp", "bww_sia385", "druckverlust", "einzel", "expansion",
    "grobkostenschaetzung", "heizgruppen", "hydraulik", "kostenschaetzung",
    "leitungsdimension", "ravel", "schema_mengen", "schema_sizing",
    "sole_druckverlust", "sole_rohre", "ventil", "waermepumpe",
]

# Entscheid Dominic 2026-08-07: nur diese vier haben eine einschlägige Norm.
# Die Auswahl folgt dem Schaden, den ein Auslegungsfehler anrichtet.
MIT_NORM = {
    "expansion": "SWKI 301-01",
    "sole_druckverlust": "SIA 384/6",
    "sole_rohre": "SIA 384/6",
    "bww_sia385": "SIA 385/2",
}
OHNE_NORM = [m for m in MODULE if m not in MIT_NORM]


def test_jedes_berechnungsmodul_ist_erfasst():
    """Ein Modul, das gar nicht in der Registry steht, fiele stillschweigend
    durch — genau die Lücke, die dieses Issue schliesst."""
    assert set(GRUNDLAGEN) == set(MODULE)


# ── Die vier kritischen Auslegungen ────────────────────────────────────────
# Bricht einer dieser Tests, fehlt einem Nachweis seine Norm — oder es steht
# eine andere darin als entschieden.

@pytest.mark.parametrize("modul,bezeichnung", sorted(MIT_NORM.items()))
def test_kritische_auslegung_nennt_ihre_norm(modul, bezeichnung):
    g = grundlage(modul)
    assert g["angegeben"] is True
    assert g["bezeichnung"] == bezeichnung
    assert bezeichnung in g["text"]


def test_expansionsgefaess_nennt_swki_301_01():
    """Der Fall, an dem das Issue hing: Norm oder Hausmethode? Antwort Dominic
    2026-08-07: SWKI 301-01."""
    g = grundlage("expansion")
    assert g["bezeichnung"] == "SWKI 301-01"
    # Ohne Ausgabejahr — es wurde keines genannt, und eine erfundene Jahreszahl
    # wäre schlimmer als keine.
    assert g["ausgabe"] is None
    assert g["text"] == "SWKI 301-01"


def test_erdsonden_nennen_sia_384_6_mit_ausgabe():
    for modul in ("sole_druckverlust", "sole_rohre"):
        g = grundlage(modul)
        assert g["bezeichnung"] == "SIA 384/6"
        assert g["ausgabe"] == "2021"
        assert g["text"].startswith("SIA 384/6:2021")


def test_nur_entschiedene_normen_stehen_drin():
    """Schutz gegen eine geratene Normangabe: im Nachweis darf ausschliesslich
    auftauchen, was Dominic ausdrücklich entschieden hat."""
    erlaubt = set(MIT_NORM.values())
    genannt = {e.bezeichnung for e in GRUNDLAGEN.values() if e is not None}
    assert genannt == erlaubt


def test_jede_norm_nennt_ihre_fundstelle():
    """Wer die Angabe anzweifelt, muss sie nachschlagen können, statt sie zu
    glauben."""
    for schluessel, eintrag in GRUNDLAGEN.items():
        if eintrag is not None:
            assert eintrag.fundstelle, f"{schluessel} ohne Fundstelle"


# ── Die unkritischen Berechnungen ──────────────────────────────────────────
# Für sie gibt es keine Norm. Im Nachweis steht dazu NICHTS — der frühere
# Hinweis «Grundlage nicht angegeben» las sich wie ein Versäumnis.

@pytest.mark.parametrize("modul", OHNE_NORM)
def test_ohne_norm_steht_nichts_im_nachweis(modul):
    g = grundlage(modul)
    assert g["angegeben"] is False
    assert g["text"] == ""
    assert grundlage_zeile(modul) == ""


def test_ventil_und_technischer_speicher_tragen_keine_norm():
    """Ausdrücklich benannt (Dominic 2026-08-07): eine falsche Ventil- oder
    Speicherauslegung ist nicht kritisch und hat keine einschlägige Norm."""
    for modul in ("ventil", "schema_sizing"):
        assert grundlage(modul)["angegeben"] is False


def test_unbekannter_schluessel_erfindet_keine_grundlage():
    assert grundlage_text("gibt-es-nicht") == ""
    assert grundlage("gibt-es-nicht")["angegeben"] is False


def test_offene_zeilen_sind_abrufbar():
    offen = set(offene_grundlagen())
    assert offen == set(OHNE_NORM)
    assert not offen & set(MIT_NORM)


# ── Ergebnis und Rechenweg ─────────────────────────────────────────────────

def test_mit_grundlage_traegt_die_angabe_ins_ergebnis():
    resultat = mit_grundlage({"vn_l": 123.4}, "expansion")
    assert resultat["vn_l"] == 123.4                     # Zahl unangetastet
    assert resultat["grundlage"]["bezeichnung"] == "SWKI 301-01"


def test_mit_grundlage_laesst_den_rechenweg_unberuehrt():
    """Der Rechenweg ist eine Folge SETZBARER Formelschritte — jeder Eintrag
    braucht LaTeX und eine Breite grösser null (`test_export_formelsatz`). Eine
    Textangabe gehört deshalb nicht hinein; sie steht als eigenes Feld daneben
    und wird vom Abschnitt als Kopfzeile gezogen."""
    schritte = [{"groesse": "V", "formel": "V = a · b", "eingesetzt": "2 · 3",
                 "ergebnis": "6"}]
    resultat = mit_grundlage({"rechenweg": schritte}, "bww_sia385")
    assert resultat["rechenweg"] == schritte
    assert len(resultat["rechenweg"]) == 1


def test_rechenweg_und_pdf_nennen_denselben_wortlaut():
    """Der Kern des Issues: eine Quelle, ein Wortlaut."""
    for modul in MIT_NORM:
        zeile = grundlage_zeile(modul)
        assert zeile == f"Grundlage: {grundlage_text(modul)}"
        assert grundlage_text(modul) in zeile


# ── Die Berechnungen selbst ────────────────────────────────────────────────

def test_brauchwarmwasser_ergebnis_traegt_die_grundlage():
    from app.calculations.bww_sia385 import bww_auslegung
    r = bww_auslegung(personen=12)
    assert r["grundlage"]["bezeichnung"] == "SIA 385/2"
    assert r["speichervolumen_l"] > 0            # Zahlen davon unberührt


def test_expansion_ergebnis_traegt_swki_301_01():
    from app.calculations.expansion import berechne_expansion
    r = berechne_expansion({
        "anlageinhalt_l": 500, "speicher_l": 200, "t_mittel": 50,
        "leistung_kw": 20, "hoehe_m": 10, "psv_bar": 3,
    })
    assert r is not None
    assert r["grundlage"]["text"] == "SWKI 301-01"
    assert r["vorschlag_l"] in (8, 12, 18, 25, 35, 50, 80, 100, 140, 200,
                                250, 300, 400, 500, 600, 800, 1000)


def test_ventil_ergebnis_traegt_keine_grundlage():
    from app.calculations.ventil import berechne_kvs
    r = berechne_kvs(2.5, 20)
    assert r["grundlage"]["angegeben"] is False
    assert r["grundlage"]["text"] == ""
