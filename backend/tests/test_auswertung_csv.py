"""CSV-Export/Import der Auswertung — reine Parsing-/Formatierungslogik."""
from datetime import date
from types import SimpleNamespace

import pytest

from app.data.bkp_positionen import BKP_POSITIONEN
from app.routers.hc_auswertung import _bkp_fieldnames, _num, _pdate, _pint, _ref_to_row, _rows_to_csv


def _mock_ref(**kw):
    zeilen = kw.pop("kostenzeilen", [])
    gewerke = kw.pop("gewerke", [])
    base = dict(
        name="Test", projektart=None, gebaeudetyp=None, ausbauumfang=None, zertifizierung=None,
        anlagenkonfiguration=None, waermeerzeuger=[], waermeabgabe=[], bww_bei_heizung=None,
        weiterbetrieb_umbau=None, etappierung=None,
        ebf_m2=None, bohrmeter=None,
        heizleistung_kw=None, anzahl_einheiten=None, datum=None, qualitaet=1.0,
        installierte_leistung_neu_kw=None, flaeche_fbh_m2=None, flaeche_tabs_m2=None,
        flaeche_deckenstrahlplatten_m2=None, anzahl_heizkoerper=None, anzahl_waermemessungen=None,
        anzahl_schaltgeraetekombinationen=None, laufmeter_rohre_heizung=None,
    )
    base.update(kw)
    return SimpleNamespace(
        kostenzeilen=[SimpleNamespace(bkp_nr=b, betrag_chf=v, gewerk="heizung") for b, v in zeilen],
        gewerke=gewerke, **base,
    )


def test_num_pint_pdate_parsen_leer_als_none():
    assert _num("123.5") == 123.5
    assert _num("") is None
    assert _num(None) is None
    assert _num("abc") is None
    assert _pint("8") == 8
    assert _pint("") is None
    assert _pdate("2025-01-31") == date(2025, 1, 31)
    assert _pdate("") is None
    assert _pdate("kein-datum") is None


def test_ref_to_row_setzt_bkp_spalten_und_laesst_rest_leer():
    r = _mock_ref(name="X", waermeerzeuger=["Erdsonden-WP"], kostenzeilen=[("242.3", 80000.0)])
    row = _ref_to_row(r)
    assert row["name"] == "X"
    assert row["waermeerzeuger"] == "Erdsonden-WP"
    assert row["bkp_242.3"] == 80000.0
    andere = [k for k in row if k.startswith("bkp_") and k != "bkp_242.3"]
    assert all(row[k] == "" for k in andere)


def test_rows_to_csv_enthaelt_alle_bkp_spalten_und_bom():
    r = _mock_ref(name="Y")
    text = _rows_to_csv([r])
    assert text.startswith("﻿")
    header = text.lstrip("﻿").splitlines()[0]
    for p in BKP_POSITIONEN:
        assert f"bkp_{p['bkp_nr']}" in header
    assert len(_bkp_fieldnames()) == len(BKP_POSITIONEN)


def test_rows_to_csv_roundtrip_werte():
    import csv
    import io
    r = _mock_ref(name="Z", ebf_m2=1200, heizleistung_kw=42.5, datum=date(2025, 6, 1),
                  kostenzeilen=[("243.1", 55000.0)])
    text = _rows_to_csv([r])
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    row = next(reader)
    assert row["name"] == "Z"
    assert row["ebf_m2"] == "1200"
    assert row["datum"] == "2025-06-01"
    assert row["bkp_243.1"] == "55000.0"
