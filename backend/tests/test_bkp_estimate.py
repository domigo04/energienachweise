"""Punkt 5 — erklärbare BKP-Schätzung: Median/Bandbreite, Referenzen, Treiber,
Datenbasis, und „nie 0 CHF" bei fehlenden Daten."""
from app.bkp_estimate import schaetze_bkp, gruppe_fuer_bkp


def test_gruppe_fuer_bkp():
    assert gruppe_fuer_bkp("242.3") == "erzeugung"
    assert gruppe_fuer_bkp("243") == "verteilung"
    assert gruppe_fuer_bkp("247") == "messung"
    assert gruppe_fuer_bkp("999") == "verteilung"   # Default


def _ref(rid, name, power, betrag):
    return {"ref_id": rid, "name": name,
            "profil": {"generator_power_kw": power, "generator_type": "ews_wp"},
            "kosten": {"242": betrag}}


def test_schaetzung_skaliert_und_erklaert():
    ziel = {"generator_power_kw": 80, "generator_type": "ews_wp"}
    referenzen = [
        _ref(1, "A", 80, 100000),   # gleiche Leistung → skaliert 100000
        _ref(2, "B", 40, 50000),    # halbe Leistung, halbe Kosten → skaliert 100000
        _ref(3, "C", 160, 200000),  # doppelte Leistung → skaliert 100000
    ]
    res = schaetze_bkp(ziel, referenzen, "242")
    assert res["status"] == "geschaetzt"
    assert res["betrag"] == 100000                     # Median der skalierten Werte
    assert res["median"] == 100000
    assert res["gruppe"] == "erzeugung"
    assert res["anzahl_referenzen"] == 3
    # Erklärbarkeit: Referenzen + Treiber + Bandbreite vorhanden
    assert len(res["referenzen"]) == 3
    assert res["referenzen"][0]["skalierung"] is not None
    assert any(t["key"] == "generator_power_kw" for t in res["treiber"])
    assert res["bandbreite"][0] <= res["betrag"] <= res["bandbreite"][1]
    assert res["datenbasis"] in ("gut", "mittel", "schwach")


def test_keine_referenz_mit_kosten_nie_null():
    ziel = {"generator_power_kw": 80}
    referenzen = [{"ref_id": 1, "name": "A", "profil": {"generator_power_kw": 80},
                   "kosten": {"243": 40000}}]   # keine Kosten für 242
    res = schaetze_bkp(ziel, referenzen, "242")
    assert res["status"] == "manuell"
    assert res["betrag"] is None                       # niemals 0 CHF
    assert res["datenbasis"] == "keine"
    assert "manuell" in res["hinweis"].lower()


def test_unskaliert_bei_fehlendem_kennwert_ist_schwaechere_basis():
    ziel = {"generator_type": "ews_wp"}                # keine Ziel-Leistung
    referenzen = [{"ref_id": 1, "name": "A",
                   "profil": {"generator_type": "ews_wp"}, "kosten": {"242": 90000}}]
    res = schaetze_bkp(ziel, referenzen, "242")
    assert res["betrag"] == 90000                      # unskaliert übernommen
    assert res["referenzen"][0]["skalierung"] is None
    assert res["datenbasis"] == "schwach"


def test_bandbreite_zeigt_streuung():
    ziel = {"ebf_m2": 1000}
    referenzen = [
        {"ref_id": 1, "name": "A", "profil": {"ebf_m2": 1000}, "kosten": {"243": 60000}},
        {"ref_id": 2, "name": "B", "profil": {"ebf_m2": 1000}, "kosten": {"243": 100000}},
    ]
    res = schaetze_bkp(ziel, referenzen, "243")
    assert res["bandbreite"] == [60000, 100000]
    assert res["betrag"] == 80000                      # Median
