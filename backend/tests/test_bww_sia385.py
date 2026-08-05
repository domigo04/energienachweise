"""Brauchwarmwasser nach SIA 385/2, geprüft gegen `Warmwasser-Berechnung_SIA385.xlsm`.

Referenzfall des Blattes `Speichervolumen`: eine Wohnung mit 200 m²,
EFH gehobener Standard, Warmhalteband, aussenliegender Wärmetauscher,
2 Ladezyklen à 2 h, ΔΘ 50 K und η 0.95.
"""

import pytest

from app.calculations.bww_sia385 import (
    BEZUGSEINHEITEN,
    bww_auslegung,
    leistungsabgleich,
    personen_aus_nutzflaeche,
    spitzendeckungsfaktor,
)
from app.calculations.hydraulik import berechne_schema

REFERENZ = dict(
    personen=None,
    wohnungen=[{"id": "001", "name": "001", "flaeche_m2": 200}],
    bezugseinheit_key="efh_gehoben",
    warmhaltesystem="warmhalteband", speicherkonfiguration="aussen",
    ladezyklen_pro_tag=2, ladezeit_h=2, temperaturerhoehung_k=50,
    wirkungsgrad=0.95,
)


def test_volumen_und_leistung_entsprechen_der_vorlage():
    r = bww_auslegung(**REFERENZ)

    assert r["personen"] == pytest.approx(3.08, abs=0.01)             # B10
    assert r["nutzwarmwasserbedarf_l_d"] == 229                       # B20 = 228.525
    assert r["steuervolumen_l"] == pytest.approx(114, abs=1)          # B23
    assert r["spitzendeckungsvolumen_l"] == pytest.approx(144, abs=1) # B26
    assert r["bereitschaftsvolumen_l"] == pytest.approx(259, abs=1)   # B29
    assert r["speichervolumen_l"] == pytest.approx(284, abs=1)        # B32
    assert r["anschlussleistung_kw"] == 4.5                           # B46


def test_personen_folgen_der_nutzflaeche():
    """np,i = 3.3 − 2/(1 + (A_NF/100)³), Blatt `Belegungsdaten`."""
    assert personen_aus_nutzflaeche(200) == pytest.approx(3.0778, abs=1e-4)
    assert personen_aus_nutzflaeche(100) == pytest.approx(2.3)
    with pytest.raises(ValueError):
        personen_aus_nutzflaeche(0)

    r = bww_auslegung(**{**REFERENZ, "wohnungen": None, "personen": None,
                         "nutzflaechen_m2": [200, 100, 100]})
    assert r["personen"] == pytest.approx(3.0778 + 2.3 + 2.3, abs=0.01)


def test_strukturierte_wohnungen_behalten_name_flaeche_und_personen():
    r = bww_auslegung(**{**REFERENZ, "personen": None, "wohnungen": [
        {"id": "w-101", "name": "WHG 101", "flaeche_m2": 200},
        {"id": "w-201", "name": "WHG 201", "flaeche_m2": 100},
    ]})

    assert r["personen"] == pytest.approx(3.0778 + 2.3, abs=0.01)
    assert r["wohnungen"] == [
        {"id": "w-101", "name": "WHG 101", "flaeche_m2": 200.0,
         "personen": pytest.approx(3.0778, abs=1e-4)},
        {"id": "w-201", "name": "WHG 201", "flaeche_m2": 100.0,
         "personen": pytest.approx(2.3, abs=1e-4)},
    ]
    assert any(s.get("formel_latex") for s in r["rechenweg"])


def test_spitzendeckungsfaktor_ist_eine_stufentabelle():
    assert spitzendeckungsfaktor(1) == 1.5
    assert spitzendeckungsfaktor(4) == 0.58
    # Zwischenwerte behalten die zuletzt erreichte Stufe (VLOOKUP mit WAHR).
    assert spitzendeckungsfaktor(8) == 0.54
    assert spitzendeckungsfaktor(10) == 0.53
    assert spitzendeckungsfaktor(500) == 0.15


def test_bezugseinheiten_stammen_aus_der_tabelle():
    assert BEZUGSEINHEITEN["mfh_allgemein"]["spitze"] == 45
    assert BEZUGSEINHEITEN["mfh_allgemein"]["durchschnitt"] == 35
    assert BEZUGSEINHEITEN["efh_gehoben"]["spitze"] == 70

    r = bww_auslegung(personen=10, bezugseinheit_key="mfh_allgemein")
    assert r["bezugseinheit_durchschnitt_l_p_d"] == 35
    assert r["bezugseinheit_spitze_l_p_d"] == 45
    # 10 P · 35 l · 1.5
    assert r["nutzwarmwasserbedarf_l_d"] == 525


def test_speicherkonfiguration_wird_in_das_endvolumen_eingerechnet():
    r = bww_auslegung(**REFERENZ)

    assert r["faktor_speicherkonfiguration"] == 1.1
    assert r["speichervolumen_l"] == 284
    assert not r["warnungen"]
    assert any(s["groesse"] == "V_{W,sto,1}" for s in r["rechenweg"])
    assert all(s.get("formel_latex") and s.get("eingesetzt_latex")
               for s in r["rechenweg"])


def test_zu_kleiner_speicher_wird_gemeldet():
    r = bww_auslegung(**{**REFERENZ, "gewaehltes_speichervolumen_l": 200})

    assert r["massgebendes_volumen_l"] == 284
    assert any("kleiner als das berechnete Speichervolumen" in w
               for w in r["warnungen"])


def test_zu_kleine_waermepumpe_liefert_konkrete_ladeoptionen():
    r = bww_auslegung(**REFERENZ)
    leistungsabgleich(r, 2, "BWW-Leistung am Betriebspunkt")

    assert r["leistung_ausreichend"] is False
    assert r["leistungsreserve_kw"] == -2.5
    assert r["ladezeit_min_fuer_wp_h"] > 2
    assert r["ladezyklen_min_fuer_wp"] > 2
    assert any("höher als die verfügbare Wärmepumpenleistung" in w
               for w in r["warnungen"])


def test_ausreichende_waermepumpe_hat_positive_reserve():
    r = bww_auslegung(**REFERENZ)
    leistungsabgleich(r, 10)

    assert r["leistung_ausreichend"] is True
    assert r["leistungsreserve_kw"] == 5.5
    assert "ladezeit_min_fuer_wp_h" not in r


def test_ohne_personen_gibt_es_keine_auslegung():
    r = bww_auslegung(personen=None)
    assert any("Personenzahl oder Nutzflächen fehlen" in w for w in r["warnungen"])
    assert "anschlussleistung_kw" not in r


def test_diagramme_entsprechen_den_stundenprofilen_der_vorlage():
    r = bww_auslegung(**REFERENZ)

    werktag = r["diagramme"]["werktag"]
    wochenende = r["diagramme"]["wochenende"]
    ladefunktion = r["diagramme"]["ladefunktion"]
    assert len(werktag) == len(wochenende) == len(ladefunktion) == 24
    assert sum(p["anteil_prozent"] for p in werktag) == 100
    assert sum(p["anteil_prozent"] for p in wochenende) == 100
    assert werktag[-1]["kumuliert_l"] == pytest.approx(284.47, abs=0.02)
    assert wochenende[-1]["kumuliert_l"] == pytest.approx(284.47, abs=0.02)
    assert ladefunktion[0]["ladekurve_l"] == pytest.approx(29.87, abs=0.02)


def test_ungueltige_eingaben_werden_abgewiesen():
    for feld, wert in [("bezugseinheit_key", "gibtsnicht"),
                       ("warmhaltesystem", "gibtsnicht"),
                       ("ladezyklen_pro_tag", 0), ("wirkungsgrad", 1.5)]:
        with pytest.raises(ValueError):
            bww_auslegung(**{**REFERENZ, feld: wert})


def test_ladeleistung_speist_den_bww_betriebsfall():
    """Die Anschlussleistung aus SIA 385 wird zur Leistung im Vorrangbetrieb."""
    VL, RL = "#ef4444", "#3b82f6"

    def k(i, s, t, f, sh=None, th=None):
        e = {"id": i, "source": s, "target": t, "style": {"stroke": f}}
        if sh:
            e["sourceHandle"] = sh
        if th:
            e["targetHandle"] = th
        return e

    nodes = [
        {"id": "wp", "type": "erzeuger", "data": {
            "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
            "vl_temp": 35, "rl_temp": 30, "sole_vl": 0, "sole_rl": -3,
            "bww_vl_temp": 55, "bww_rl_temp": 45, "bww_cop": 2.6}},
        {"id": "uv", "type": "valve3", "data": {"funktion": "umschaltend"}},
        {"id": "bww", "type": "bww", "data": {
            "bww_personen": 12, "bww_bezugseinheit": "mfh_allgemein",
            "bww_ladezyklen": 2, "bww_ladezeit_h": 2, "speicher_liter": 800}},
        {"id": "sp", "type": "speicher", "data": {}},
        {"id": "vt", "type": "verteiler", "data": {"abgaenge": 2}},
        {"id": "g1", "type": "gruppe", "data": {"q_kw": 24, "vl_temp": 35, "rl_temp": 28}},
    ]
    edges = [k("e1", "wp", "uv", VL, "vl", None), k("e2", "uv", "sp", VL),
             k("e3", "uv", "bww", VL), k("e4", "sp", "wp", RL, None, "rl"),
             k("e5", "sp", "vt", VL), k("e6", "vt", "sp", RL),
             k("e7", "vt", "g1", VL), k("e8", "g1", "vt", RL)]

    r = berechne_schema(nodes, edges)
    auslegung = r["bww_results"]["bww"]
    bf = r["heatpump_results"]["wp"]["betriebsfaelle"]

    assert auslegung["personen"] == 12
    assert auslegung["anschlussleistung_kw"] > 0
    assert auslegung["waermepumpenleistung_kw"] == 40
    assert auslegung["waermepumpenleistung_quelle"] == "Nennleistung der Wärmepumpe"
    assert auslegung["leistung_ausreichend"] is True
    # Die Ladeleistung des Vorrangbetriebs kommt aus der Auslegung.
    assert bf["bww_ladeleistung_kw"] == auslegung["anschlussleistung_kw"]
    bww_fall = next(f for f in bf["faelle"] if f["key"] == "bww")
    assert bww_fall["q_heiz_kw"] == auslegung["anschlussleistung_kw"]


def test_manuelle_ladeleistung_hat_vorrang():
    from app.calculations.hydraulik import _bww_ergebnisse, _bww_ladeleistung

    nodes = [{"id": "bww", "type": "bww", "data": {
        "bww_personen": 12, "bww_ladeleistung_kw": 42, "speicher_liter": 800}}]
    ergebnisse = _bww_ergebnisse(nodes)

    assert ergebnisse["bww"]["anschlussleistung_kw"] != 42
    assert _bww_ladeleistung(nodes, ergebnisse) == 42
