"""Grundlage jeder Berechnung (Issue #84) — Mechanismus, nicht Inhalt.

Diese Datei sichert zwei Dinge, die leicht auseinanderlaufen:

1. Jede Berechnung trägt ihre Grundlage im Ergebnis, und eine fehlende Angabe
   steht ausgeschrieben da statt als leeres Feld.
2. Rechenweg und PDF nennen **denselben Wortlaut**. Zwei Formulierungen für
   dieselbe Angabe wären der sichere Weg zu einem Nachweis, der etwas anderes
   behauptet als der Bildschirm.

Was hier NICHT geprüft wird: ob die eingetragene Norm fachlich die richtige ist.
Das ist eine Aussage des Fachplaners, keine des Testlaufs.
"""
import pytest

from app.calculations.grundlagen import (
    GRUNDLAGE_FEHLT,
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


# ── Die Registry deckt alles ab ────────────────────────────────────────────

def test_jedes_berechnungsmodul_ist_erfasst():
    """Ein Modul, das gar nicht in der Registry steht, fiele stillschweigend
    durch — genau die Lücke, die dieses Issue schliesst."""
    assert set(GRUNDLAGEN) == set(MODULE)


@pytest.mark.parametrize("modul", MODULE)
def test_jede_berechnung_liefert_eine_aussage(modul):
    """Entweder eine Grundlage oder ausdrücklich «nicht angegeben» — nie leer."""
    g = grundlage(modul)
    assert g["text"], f"{modul} liefert keinen Text"
    assert g["angegeben"] is (g["text"] != GRUNDLAGE_FEHLT)


def test_fehlende_grundlage_ist_ausgeschrieben_und_nicht_leer():
    assert grundlage_text("expansion") == GRUNDLAGE_FEHLT
    assert grundlage("expansion")["angegeben"] is False
    # Ein unbekannter Schlüssel darf nicht in einen leeren String kippen.
    assert grundlage_text("gibt-es-nicht") == GRUNDLAGE_FEHLT


# ── Die belegten Zeilen ────────────────────────────────────────────────────
# Nur diese beiden stehen heute fest; beide sind im Code und in PHYSIK.md
# belegt. Bricht einer der Tests, wurde eine Norm geraten statt eingetragen.

def test_brauchwarmwasser_nennt_sia_385_2():
    g = grundlage("bww_sia385")
    assert g["angegeben"] is True
    assert g["bezeichnung"] == "SIA 385/2"
    assert "SIA 385/2" in g["text"]


def test_erdsondenrohre_nennen_sia_384_6_mit_ausgabe_und_tabelle():
    g = grundlage("sole_rohre")
    assert g["bezeichnung"] == "SIA 384/6"
    assert g["ausgabe"] == "2021"
    assert "Tabelle 10" in g["abschnitt"]
    assert g["text"].startswith("SIA 384/6:2021")


def test_nur_belegte_normen_stehen_drin():
    """Schutz gegen eine geratene Normangabe: im Nachweis darf ausschliesslich
    auftauchen, was heute im Code oder in PHYSIK.md belegt ist."""
    erlaubt = {"SIA 385/2", "SIA 384/6"}
    genannt = {e.bezeichnung for e in GRUNDLAGEN.values() if e is not None}
    assert genannt <= erlaubt, f"nicht belegte Normangabe: {genannt - erlaubt}"


def test_offene_zeilen_sind_benannt():
    """Die offenen Punkte sind Teil der Übergabe und müssen abrufbar sein."""
    offen = offene_grundlagen()
    assert "expansion" in offen        # Norm vs. Hausmethode, siehe PR
    assert "bww_sia385" not in offen
    assert "sole_rohre" not in offen


# ── Ergebnis und Rechenweg ─────────────────────────────────────────────────

def test_mit_grundlage_traegt_die_angabe_ins_ergebnis():
    resultat = mit_grundlage({"vn_l": 123.4}, "expansion")
    assert resultat["vn_l"] == 123.4          # Zahl unangetastet
    assert resultat["grundlage"]["text"] == GRUNDLAGE_FEHLT


def test_mit_grundlage_laesst_den_rechenweg_unberuehrt():
    """Der Rechenweg ist eine Folge SETZBARER Formelschritte — jeder Eintrag
    braucht LaTeX und eine Breite grösser null (`test_export_formelsatz`). Eine
    Textangabe gehört deshalb nicht hinein; sie steht als eigenes Feld daneben
    und wird vom Rechenweg-Block als Kopfzeile gezogen."""
    schritte = [{"groesse": "V", "formel": "V = a · b", "eingesetzt": "2 · 3",
                 "ergebnis": "6"}]
    resultat = mit_grundlage({"rechenweg": schritte}, "bww_sia385")
    assert resultat["rechenweg"] == schritte
    assert len(resultat["rechenweg"]) == 1


def test_rechenweg_und_pdf_nennen_denselben_wortlaut():
    """Der Kern des Issues: eine Quelle, ein Wortlaut."""
    for modul in MODULE:
        zeile = grundlage_zeile(modul)
        assert zeile == f"Grundlage: {grundlage_text(modul)}"
        assert grundlage_text(modul) in zeile


# ── Die Berechnungen selbst ────────────────────────────────────────────────

def test_brauchwarmwasser_ergebnis_traegt_die_grundlage():
    from app.calculations.bww_sia385 import bww_auslegung
    r = bww_auslegung(personen=12)
    assert r["grundlage"]["bezeichnung"] == "SIA 385/2"
    # Und die Zahlen sind davon unberührt.
    assert r["speichervolumen_l"] > 0


def test_expansion_ergebnis_sagt_dass_die_grundlage_offen_ist():
    from app.calculations.expansion import berechne_expansion
    r = berechne_expansion({
        "anlageinhalt_l": 500, "speicher_l": 200, "t_mittel": 50,
        "leistung_kw": 20, "hoehe_m": 10, "psv_bar": 3,
    })
    assert r is not None
    assert r["grundlage"]["text"] == GRUNDLAGE_FEHLT
    assert r["vorschlag_l"] in (8, 12, 18, 25, 35, 50, 80, 100, 140, 200,
                                250, 300, 400, 500, 600, 800, 1000)
