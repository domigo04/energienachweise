"""Formelsatz und Diagramme im PDF-Export.

Geprüft wird, was Dominic im Export sehen will: echte Brüche statt «/»,
Formelzeichen statt Behelfsnamen, der vollständige Rechenweg von Erdsonden
und Brauchwarmwasser sowie die Diagramme der Auslegung.
"""
import io

import pytest
from pypdf import PdfReader

from app.calculations.bww_sia385 import bww_auslegung
from app.calculations.hydraulik import berechne_schema
from app.calculations.schema_sizing import erdsondenfeld
from app.calculations.sole_druckverlust import sole_druckverlust
from app.export.diagramme import _obergrenze, balkendiagramm, saeulendiagramm
from app.export.formelsatz import formel
from app.export.pdf import berechnungs_abschnitte, erzeuge_pdf


class Stift:
    """Canvas-Ersatz, der jeden Zeichenbefehl mitschreibt."""

    def __init__(self):
        self.texte = []      # (x, y, text, font, groesse)
        self.linien = []     # (x1, y1, x2, y2)
        self.rechtecke = []
        self.font = ("Helvetica", 10)

    def setFont(self, name, groesse, leading=None):
        self.font = (name, groesse)

    def drawString(self, x, y, text):
        self.texte.append((x, y, text, *self.font))

    drawRightString = drawCentredString = drawString

    def line(self, x1, y1, x2, y2):
        self.linien.append((x1, y1, x2, y2))

    def rect(self, x, y, breite, hoehe, stroke=1, fill=0):
        self.rechtecke.append((x, y, breite, hoehe, fill))

    def circle(self, x, y, r, stroke=1, fill=0):
        self.rechtecke.append((x - r, y - r, 2 * r, 2 * r, fill))

    def stringWidth(self, text, font, groesse):
        return len(text) * groesse * 0.5

    def beginPath(self):
        return Pfad(self)

    def drawPath(self, pfad, **_):
        self.linien.extend(pfad.strecken)

    def setLineWidth(self, *_):
        pass

    setFillColorRGB = setStrokeColorRGB = saveState = restoreState = setDash = setLineWidth
    translate = scale = setLineWidth


class Pfad:
    def __init__(self, stift):
        self.strecken, self.letzter = [], None

    def moveTo(self, x, y):
        self.letzter = (x, y)

    def lineTo(self, x, y):
        self.strecken.append((*self.letzter, x, y))
        self.letzter = (x, y)


def _erdsonden_graph():
    """Wärmepumpe mit Erdsondenfeld und BWW-Speicher — nur Testdaten."""
    nodes = [
        {"id": "wp", "type": "erzeuger", "position": {"x": 0, "y": 300},
         "data": {"label": "SW-WP", "nr": 1, "generator_type": "swwp", "leistung_kw": 24,
                  "cop": 4.5, "vl_temp": 35, "rl_temp": 28, "sole_vl": 0, "sole_rl": -3}},
        {"id": "ews", "type": "erdsonden", "position": {"x": 0, "y": 600},
         "data": {"label": "Sondenfeld", "nr": 2, "sonden_anzahl": 5, "sonden_laenge_m": 220,
                  "entzugsleistung_w_m": 35, "sole_zuleitung_verteiler_m": 30,
                  "sole_zuleitung_verteiler_gesamt_vl_rl_m": 300, "sole_zuleitung_wp_m": 16,
                  "sole_zusatzinhalt_l": 5, "sole_dp_wp_mws": 3.2,
                  "sole_volumenstrom_m3h": 4.2}},
        {"id": "bww", "type": "bww", "position": {"x": 400, "y": 100},
         "data": {"label": "BWW", "nr": 3, "speicher_liter": 800,
                  "bww_wohnungen": [{"name": f"Wohnung {i}", "flaeche_m2": 92}
                                    for i in range(1, 7)],
                  "bww_speicherkonfiguration": "aussen"}},
    ]
    return nodes, berechne_schema(nodes, [])


# ── Formelsatz ──────────────────────────────────────────────────────────────
def test_bruch_wird_als_bruch_gesetzt_nicht_als_schraegstrich():
    stift = Stift()
    formel(r"\frac{Q_0}{q_E}", groesse=10).zeichne(stift, 0, 100)

    waagrecht = [l for l in stift.linien if l[1] == l[3]]
    assert len(waagrecht) == 1, "Bruchstrich fehlt"
    strich_y = waagrecht[0][1]
    zaehler = next(t for t in stift.texte if t[2] == "Q")
    nenner = next(t for t in stift.texte if t[2] == "q")
    assert zaehler[1] > strich_y > nenner[1], "Zähler und Nenner stehen nicht übereinander"
    assert "/" not in "".join(t[2] for t in stift.texte)


def test_formelzeichen_kursiv_wortzusatz_aufrecht_und_griechisch_als_zeichen():
    stift = Stift()
    formel(r"\lambda \cdot p_{\mathrm{dyn}}", groesse=10).zeichne(stift, 0, 0)
    schriften = {t[2]: t[3] for t in stift.texte}

    assert schriften["p"] == "Times-Italic"          # Formelzeichen
    assert schriften["dyn"] == "Times-Roman"         # Wortzusatz im Index
    assert schriften["λ"] == "Times-Roman"           # echtes Zeichen, keine Ersatzschrift
    assert "\\lambda" not in schriften


def test_hochgestellt_und_tiefgestellt_stehen_an_derselben_basis():
    stift = Stift()
    formel(r"d_i^2", groesse=10).zeichne(stift, 0, 50)
    hoch = next(t for t in stift.texte if t[2] == "2")
    tief = next(t for t in stift.texte if t[2] == "i")

    assert hoch[1] > 50 > tief[1]
    assert hoch[0] == pytest.approx(tief[0], abs=0.01)
    assert hoch[4] < 10 and tief[4] < 10           # kleiner als die Grundschrift


def test_klammern_wachsen_mit_dem_inhalt():
    klein = formel(r"\left(x\right)", groesse=10)
    gross = formel(r"\left(\frac{a}{b}\right)", groesse=10)

    assert gross.hoehe > klein.hoehe
    stift = Stift()
    gross.zeichne(stift, 0, 0)
    klammern = [t for t in stift.texte if t[2] in ("(", ")")]
    assert len(klammern) == 2
    assert klammern[0][4] == klammern[1][4] > 10   # beide Klammern gleich gross


def test_breite_formel_wird_auf_die_spalte_verkleinert():
    lang = r"Re < 2340:\ \mathrm{laminar};\quad Re > 1300d_k:\ \mathrm{turbulent\ rau}"
    passend = formel(lang, groesse=8.5, max_breite=120)

    assert passend.breite == pytest.approx(120, abs=0.01)
    assert 0 < passend.skala < 1


def test_ohne_latex_bleibt_der_klartext_stehen():
    ersatz = formel(None, groesse=8, fallback="V = Q / (1.163 · ΔT)")
    stift = Stift()
    ersatz.zeichne(stift, 0, 0)

    assert stift.texte[0][2] == "V = Q / (1.163 · ΔT)"
    assert ersatz.breite > 0


def test_unlesbares_latex_faellt_auf_den_klartext_zurueck():
    assert formel("\\frac{", groesse=8, fallback="Q / t").breite > 0


def test_jeder_rechenschritt_von_erdsonden_und_bww_ist_setzbar():
    """Kein Schritt der beiden Auslegungen darf im Export leer bleiben."""
    solekreis = sole_druckverlust(
        sonden_anzahl=5, sonden_tiefe_m=220, sonden_innen_d_mm=26.2,
        zuleitung_verteiler_m=30, zuleitung_verteiler_innen_d_mm=40.8,
        zuleitung_wp_m=16, zuleitung_wp_innen_d_mm=40.8, volumenstrom_m3_h=4.2,
        druckverlust_wp_mws=3.2, sonden_pn="PN16")
    bww = bww_auslegung(wohnungen=[{"name": "W1", "flaeche_m2": 92}] * 6)
    feld = erdsondenfeld(quellenleistung_kw=22, sonden_anzahl=5, sonden_laenge_m=220,
                         spezifische_entzugsleistung_w_m=35)

    schritte = solekreis["rechenweg"] + bww["rechenweg"] + feld["rechenweg"]
    assert len(schritte) > 30
    for schritt in schritte:
        for schluessel, ersatz in (("formel_latex", "formel"),
                                   ("eingesetzt_latex", "eingesetzt")):
            gesetzt = formel(schritt.get(schluessel), groesse=8.5,
                             fallback=schritt.get(ersatz))
            assert gesetzt.breite > 0, schritt
            assert gesetzt.hoehe > 0, schritt


# ── Diagramme ───────────────────────────────────────────────────────────────
def test_achsenende_liegt_immer_ueber_dem_hoechsten_wert():
    for wert in (0.35, 3.2, 47, 713, 2807, 0.004):
        assert _obergrenze(wert) >= wert


def test_saeulendiagramm_zeichnet_saeulen_und_linie_je_stunde():
    punkte = [{"stunde": h, "stundenvolumen_l": h * 2, "kumuliert_l": h * 10}
              for h in range(24)]
    stift = Stift()
    saeulendiagramm(stift, 0, 0, 400, 150, titel="Summenlinie", punkte=punkte,
                    x_schluessel="stunde", einheit="L",
                    saeule=("stundenvolumen_l", "Stundenspitze", (0, 0, 1)),
                    linien=[("kumuliert_l", "aufsummiert", (1, 0, 0))])

    saeulen = [r for r in stift.rechtecke if r[4] == 1 and r[2] > 8]
    assert len(saeulen) == 23                     # Stunde 0 hat den Wert 0
    assert len(stift.linien) >= 23                # Summenlinie über alle Stunden
    assert any("Summenlinie" == t[2] for t in stift.texte)


def test_balkendiagramm_zeigt_fehlende_werte_als_strich():
    stift = Stift()
    balkendiagramm(stift, 0, 0, 400, 60, titel="Bohrmeter",
                   eintraege=[("Gewählt", 1100, (0, 0, 1)), ("Erforderlich", None, (1, 0, 0))],
                   einheit="m")

    beschriftungen = [t[2] for t in stift.texte]
    assert "1'100 m" in beschriftungen
    assert "—" in beschriftungen


# ── Export ──────────────────────────────────────────────────────────────────
def test_export_enthaelt_rechenweg_und_diagramme_von_erdsonden_und_bww():
    nodes, results = _erdsonden_graph()
    abschnitte = {a["titel"]: a for a in berechnungs_abschnitte(nodes, results)}

    ews = abschnitte["Erdsondenfeld"]
    gruppen = [s.get("gruppe") for s in ews["rechenweg"]]
    assert "0 Bohrmeterauslegung" in gruppen        # Bohrmeter aus schema_sizing
    assert any(g and "Füllinhalt" in g for g in gruppen)          # Solekreis
    assert any(g and "Pumpenbetriebspunkt" in g for g in gruppen)
    assert all(s.get("formel_latex") for s in ews["rechenweg"])
    assert [d["titel"] for d in ews["diagramme"]] == [
        "Bohrmeter — gewählt gegen erforderlich",
        "Druckverlust im Solekreis und Betriebspunkt der Solepumpe",
        "Füllinhalt des Solekreises und Wärmeträger",
    ]

    bww = abschnitte["Brauchwarmwasser-Speicher"]
    assert [s["groesse"] for s in bww["rechenweg"]][:2] == ["n_{p,i}", "V_{W,d,1}"]
    assert all(s.get("formel_latex") for s in bww["rechenweg"])
    assert len(bww["diagramme"]) == 3
    assert all(len(d["punkte"]) == 24 for d in bww["diagramme"])


def test_erdsonden_warnungen_stehen_im_export():
    nodes, results = _erdsonden_graph()
    abschnitte = {a["titel"]: a for a in berechnungs_abschnitte(nodes, results)}
    hinweise = " ".join(abschnitte["Erdsondenfeld"]["hinweise"])

    # Die Feldwarnungen (Druckstufe, Strömung) waren bisher nur im Editor sichtbar.
    assert "PN" in hinweise
    assert results["erdsonden_results"]["ews"]["warnings"]


def test_pdf_setzt_formeln_statt_schraegstrich_klartext():
    nodes, results = _erdsonden_graph()
    pdf = erzeuge_pdf("Testprojekt", "Schema", "berechnungen", nodes, [], results)
    text = "\n".join(seite.extract_text() or ""
                     for seite in PdfReader(io.BytesIO(pdf)).pages)

    assert pdf.startswith(b"%PDF")
    # Rechenweg beider Bauteile im Dokument …
    assert "Bohrmeterauslegung" in text
    assert "Pumpenbetriebspunkt" in text
    assert "Leistungsberechnung" in text
    # … Diagramme …
    assert "Summenliniendiagramm Montag bis Freitag" in text
    assert "Ladefunktion Montag bis Freitag" in text
    assert "Bohrmeter — gewählt gegen erforderlich" in text
    # … und keine Klartextformel mit Schrägstrich mehr.
    assert "Q = V · cp · ΔΘ / (n_z · t_z · 3600 · η)" not in text
    assert "Lerf = Q0 · 1000 / qE · SF" not in text
    assert "V' = Q0 · 3600 / (c · ΔT · ρ)" not in text
