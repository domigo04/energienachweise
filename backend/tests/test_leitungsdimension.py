"""Automatische Leitungsdimensionierung — Dominics R-Tabelle (PHYSIK.md §10)."""
import pytest

from app.calculations.leitungsdimension import automatische_dimension


def test_beispiel_700_kg_h_dn25_65_pam():
    # 700 kg/h → 0.7 m³/h. Dominics Beispiel: DN25 bei ca. 65 Pa/m.
    r = automatische_dimension(0.7)
    assert r["dn"] == "DN25"
    assert r["pam"] == pytest.approx(65, abs=1)


def test_kleine_dn_bei_kleinem_fluss():
    # 40 kg/h → 0.04 m³/h — passt locker in DN10 (Kapazität bei 70 Pa/m = 87.8 kg/h)
    r = automatische_dimension(0.04)
    assert r["dn"] == "DN10"


def test_nie_ueber_70_pam():
    # Direkt an der DN10/DN15-Grenze: 88 kg/h übersteigt DN10 bei 70 Pa/m knapp (87.8)
    # → nächstgrössere Dimension DN15 wählen, nie über 70 Pa/m hinaus dimensionieren
    r = automatische_dimension(0.088)
    assert r["dn"] == "DN15"
    assert r["pam"] <= 70


def test_riesiger_fluss_ueber_dn300_warnt():
    r = automatische_dimension(600)  # 600'000 kg/h — über DN300 hinaus
    assert r["dn"] == "DN300"
    assert "warnung" in r


def test_kein_fluss_kein_ergebnis():
    assert automatische_dimension(0) is None
    assert automatische_dimension(None) is None
