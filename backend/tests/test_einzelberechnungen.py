import pytest

from app.calculations.einzel import (
    druckverlust_kvs,
    jahresenergie,
    jaz_und_stromkosten,
    rohrausdehnung,
    speichervolumen_wp,
    waermepumpenleistung,
    waermetauscherflaeche,
)


def test_waermetauscher_wert_aus_excel():
    assert waermetauscherflaeche(110, 4800, 10.4)["flaeche_m2"] == pytest.approx(2.204, abs=0.001)


def test_druckverlust_kvs_wert_aus_excel():
    assert druckverlust_kvs(14.2, 40)["druckverlust_kpa"] == pytest.approx(12.6025, abs=0.001)


def test_rohrausdehnung_stahl_wert_aus_excel():
    result = rohrausdehnung(30, 50, 0.0115)
    assert result["laengenaenderung_mm"] == pytest.approx(17.25)
    assert result["endlaenge_m"] == pytest.approx(30.01725)


def test_waermepumpenleistung_beide_richtungen():
    assert waermepumpenleistung(176.4, 3.5)["quellenleistung_kw"] == pytest.approx(126)
    assert waermepumpenleistung(126, 3.5, "quelle")["heizleistung_kw"] == pytest.approx(176.4)


def test_speicher_wp_viertelstunde():
    result = speichervolumen_wp(29.88, 15, 10)
    assert result["speichervolumen_l"] == pytest.approx(650, abs=1)


def test_jahresenergie_wert_aus_excel():
    result = jahresenergie(30, 17, 3432, 28, 0.388)
    assert result["heizung_kwh_a"] == pytest.approx(62511, abs=1)
    assert result["bww_kwh_a"] == pytest.approx(12329, abs=1)


def test_jaz_gewichtung_und_stromkosten():
    result = jaz_und_stromkosten([3, 3, 3.2, 4, 5, 3.5], [100, 340, 710, 820, 700, 260], 93000, 1, 1, 0.9, 0.19)
    assert result["jaz"] == pytest.approx(3.85, abs=0.01)
    assert result["stromkosten_chf_a"] == pytest.approx(5099, abs=2)


@pytest.mark.parametrize("funktion,args", [
    (waermetauscherflaeche, (0, 4800, 10)),
    (druckverlust_kvs, (1, 0)),
    (waermepumpenleistung, (10, 1)),
])
def test_unplausible_eingaben_werden_abgewiesen(funktion, args):
    with pytest.raises(ValueError):
        funktion(*args)
