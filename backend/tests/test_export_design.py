"""Auftritt der Exporte je Firma.

Der Fehler, den diese Datei verhindert: das SIREGO-Logo landet auf dem
Nachweis einer fremden Firma. Das ist nicht rückholbar, sobald das PDF beim
Bauherrn liegt — also wird es hier festgenagelt, nicht per Augenschein geprüft.
"""
import io

import pytest
from pypdf import PdfReader

from app.export.design import (
    SIREGO,
    STANDARD,
    fuer_firma,
    logo_klein,
    wasserzeichen,
)
from app.export.pdf import erzeuge_pdf


def _seite(pdf: bytes, nr: int = 0):
    return PdfReader(io.BytesIO(pdf)).pages[nr]


def _deckkraefte(seite) -> set:
    gs = seite["/Resources"].get("/ExtGState")
    if not gs:
        return set()
    return {o.get_object().get("/ca") for _, o in gs.get_object().items()}


def _bilder(seite) -> list:
    xo = seite["/Resources"].get("/XObject")
    if not xo:
        return []
    return [o.get_object() for _, o in xo.get_object().items()
            if o.get_object().get("/Subtype") == "/Image"]


NODES = [{"id": "ex", "type": "expansion",
          "data": {"nr": 1, "label": "MAG", "anlageinhalt_l": 500, "speicher_l": 200,
                   "t_mittel": 50, "leistung_kw": 20, "hoehe_m": 10, "psv_bar": 3}}]


# ── Zuordnung Firma → Marke ────────────────────────────────────────────────

@pytest.mark.parametrize("name", ["SIREGO", "sirego", "  SIREGO GmbH  ", "Sirego AG"])
def test_sirego_bekommt_die_eigene_marke(name):
    assert fuer_firma(name) is SIREGO


@pytest.mark.parametrize("name", [None, "", "   ", "Muster Haustechnik AG",
                                  "Nicht-Sirego GmbH", "Siregx"])
def test_jede_andere_firma_bekommt_den_standard(name):
    """Im Zweifel Standard. Ein geratener Treffer wäre hier ein fremdes Logo
    auf einem fremden Nachweis."""
    assert fuer_firma(name) is STANDARD


def test_standard_traegt_kein_wasserzeichen():
    assert STANDARD.hat_wasserzeichen is False
    assert STANDARD.logo_datei is None


def test_sirego_traegt_logo_und_markenblau():
    assert SIREGO.hat_wasserzeichen is True
    assert SIREGO.deckkraft == 0.2                      # wie in der Vorlage
    rot, gruen, blau = SIREGO.akzent
    assert (round(rot, 3), round(gruen, 3), round(blau, 3)) == (0.071, 0.667, 0.992)


def test_standard_behaelt_den_bisherigen_roten_akzent():
    """Für andere Firmen darf sich nichts ändern — auch nicht die Akzentfarbe."""
    assert STANDARD.akzent == (0.86, 0.15, 0.15)


# ── Was im PDF wirklich ankommt ────────────────────────────────────────────

def test_fremde_firma_bekommt_kein_logo_ins_pdf():
    pdf = erzeuge_pdf("P", "S", "berechnungen", NODES, [], {},
                      marke=fuer_firma("Muster Haustechnik AG"))
    seite = _seite(pdf)
    assert _bilder(seite) == []
    assert 0.2 not in _deckkraefte(seite)


def test_sirego_bekommt_das_wasserzeichen_mit_20_prozent():
    pdf = erzeuge_pdf("P", "S", "berechnungen", NODES, [], {}, marke=SIREGO)
    seite = _seite(pdf)
    assert _bilder(seite), "kein Logo im PDF"
    assert 0.2 in _deckkraefte(seite), "Wasserzeichen ist nicht transparent"


def test_ohne_angabe_gilt_der_standard():
    """Der Vorgabewert entscheidet, was ein Aufrufer bekommt, der die Marke
    (noch) nicht kennt — das muss der Standard sein, nie SIREGO."""
    ohne = erzeuge_pdf("P", "S", "berechnungen", NODES, [], {})
    mit_standard = erzeuge_pdf("P", "S", "berechnungen", NODES, [], {}, marke=STANDARD)
    assert _bilder(_seite(ohne)) == []
    assert len(_bilder(_seite(ohne))) == len(_bilder(_seite(mit_standard)))


def test_zeichnen_ohne_marke_ist_folgenlos():
    """`wasserzeichen` und `logo_klein` müssen für STANDARD stumm bleiben,
    statt sich auf ein Vorgabelogo zu verlassen."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdfcanvas

    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    wasserzeichen(c, *A4, STANDARD)
    assert logo_klein(c, 10, 10, 20, STANDARD) == 0.0
    c.showPage()
    c.save()
    assert _bilder(_seite(buf.getvalue())) == []
