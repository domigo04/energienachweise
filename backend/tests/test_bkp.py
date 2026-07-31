"""BKP — Zeitgewichtung + Positions-Filter (Auftrag v3.0, Kap. 4.3/4.5)."""
from datetime import date, timedelta

import pytest

from app.calculations.bkp import berechne_gewicht
from app.data.bkp_positionen import BKP_POSITIONEN, filter_positionen


def _vor_jahren(jahre: float) -> date:
    return date.today() - timedelta(days=jahre * 365.25)


def test_gewicht_heute():
    assert berechne_gewicht(date.today()) == pytest.approx(1.0, abs=0.001)


def test_gewicht_halbwertszeit_3_jahre():
    assert berechne_gewicht(_vor_jahren(3)) == pytest.approx(0.5, abs=0.005)


def test_gewicht_6_jahre():
    assert berechne_gewicht(_vor_jahren(6)) == pytest.approx(0.25, abs=0.005)


def test_katalog_vollstaendig():
    # Vollständiges Norm-LV (Dominic 2026-07-14): 8 (241 inkl. Tank/Montage) +
    # 7 (242 inkl. Gas/Öl) + 15 (243 inkl. FWS/BWW) + 2 (247) +
    # 3 (248) + 8 (249) = 43 Positionen
    assert len(BKP_POSITIONEN) == 43
    assert {"243.10", "243.11"}.issubset({p["bkp_nr"] for p in BKP_POSITIONEN})
    nummern = {p["bkp_nr"] for p in BKP_POSITIONEN}
    for nr in ("241.1a", "241.10", "241.14", "242.1", "242.3", "242.7",
               "243.1", "243.9", "247.5", "248.3", "249.8"):
        assert nr in nummern


def test_filter_sole_wasser():
    nummern = {p["bkp_nr"] for p in filter_positionen(wp_typ="sole_wasser")}
    assert "241.14" in nummern   # Erdsonden nur bei Sole/Wasser
    assert "242.3" in nummern    # WP Sole/Wasser
    assert "242.4" not in nummern  # WP Luft/Wasser raus
    assert "243.1" in nummern    # Verteilung gilt immer


def test_filter_luft_wasser():
    nummern = {p["bkp_nr"] for p in filter_positionen(wp_typ="luft_wasser")}
    assert "242.4" in nummern
    assert "241.10" not in nummern  # kein Erdsonden-Primärkreis
    assert "241.14" not in nummern


def test_filter_kategorie():
    efh = {p["bkp_nr"] for p in filter_positionen(wp_typ="luft_wasser", kategorie="EFH")}
    assert "243.4b" not in efh   # Torluftschleier nicht im EFH
    gewerbe = {p["bkp_nr"] for p in filter_positionen(kategorie="Gewerbe")}
    assert "243.4b" in gewerbe


def test_positionsfilter_versteht_codes_und_alte_beschriftungen():
    """Regression (Dominic 2026-07-31): die Auswertung speichert Erzeuger als
    Code ("ews_wp"), der Katalog kannte aber nur die alte Beschriftung. Dadurch
    fielen bei JEDEM neuen Projekt sämtliche Positionen mit Wärmepumpen-Bindung
    weg — BKP 241 und 242 blieben ohne Kosten, obwohl passende Referenzen
    vorhanden waren."""
    code = {p["bkp_nr"] for p in filter_positionen(waermeerzeuger=["ews_wp"])}
    label = {p["bkp_nr"] for p in filter_positionen(waermeerzeuger=["Erdsonden-WP"])}
    assert code == label
    assert {"241.14", "241.11", "242.3", "242.6", "242.7"} <= code
    # Die fremden Wärmepumpen-Positionen bleiben trotzdem draussen.
    assert "242.4" not in code and "242.5" not in code

    luft = {p["bkp_nr"] for p in filter_positionen(waermeerzeuger=["lwwp"])}
    assert "242.4" in luft and "242.3" not in luft
    # Ohne Erdsonden gibt es keine Energielagerung Primärkreis.
    assert not {nr for nr in luft if nr.startswith("241.1") and nr != "241.1a"}

    # Brennstoff-Positionen ebenso: Code wie Beschriftung.
    assert ({p["bkp_nr"] for p in filter_positionen(waermeerzeuger=["gas"])}
            == {p["bkp_nr"] for p in filter_positionen(waermeerzeuger=["Gas"])})
    assert "242.1" in {p["bkp_nr"] for p in filter_positionen(waermeerzeuger=["gas"])}
