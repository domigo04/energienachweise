"""Brauchwarmwasser-Vorrang: ein Umschaltventil lässt nur einen Fall zu.

Ein 3-Weg-Ventil zwischen Wärmepumpe und technischem Speicher ist ein
Umschaltventil, kein Mischventil. Es gibt deshalb entweder BWW-Betrieb oder
Heizbetrieb — und die beiden Lasten dürfen nie addiert werden.
"""

import pytest

from app.calculations.betriebsfaelle import betriebsfaelle, ist_umschaltventil
from app.calculations.hydraulik import berechne_schema

VL, RL = "#ef4444", "#3b82f6"

WP_DATEN = {
    "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
    "vl_temp": 35, "rl_temp": 30, "sole_vl": 0, "sole_rl": -3,
    "bww_vl_temp": 55, "bww_rl_temp": 45, "bww_cop": 2.6,
}


def _kante(i, s, t, farbe, sh=None, th=None):
    e = {"id": i, "source": s, "target": t, "style": {"stroke": farbe}}
    if sh:
        e["sourceHandle"] = sh
    if th:
        e["targetHandle"] = th
    return e


def _schema(funktion="umschaltend", ladeleistung=30):
    nodes = [
        {"id": "wp", "type": "erzeuger", "data": dict(WP_DATEN)},
        {"id": "uv", "type": "valve3", "data": {"funktion": funktion, "dp_var": 26}},
        {"id": "bww", "type": "bww", "data": {"bww_ladeleistung_kw": ladeleistung,
                                              "speicher_liter": 500}},
        {"id": "sp", "type": "speicher", "data": {}},
        {"id": "vt", "type": "verteiler", "data": {"abgaenge": 2}},
        {"id": "g1", "type": "gruppe", "data": {"q_kw": 24, "vl_temp": 35, "rl_temp": 28}},
    ]
    edges = [
        _kante("e1", "wp", "uv", VL, "vl", None), _kante("e2", "uv", "sp", VL),
        _kante("e3", "uv", "bww", VL), _kante("e4", "sp", "wp", RL, None, "rl"),
        _kante("e5", "sp", "vt", VL), _kante("e6", "vt", "sp", RL),
        _kante("e7", "vt", "g1", VL), _kante("e8", "g1", "vt", RL),
    ]
    return nodes, edges


def test_funktion_unterscheidet_mischen_und_umschalten():
    assert ist_umschaltventil({"funktion": "umschaltend"}) is True
    assert ist_umschaltventil({"funktion": "mischend"}) is False
    # Ohne Angabe bleibt es ein Mischventil — bestehende Schemas ändern sich nicht.
    assert ist_umschaltventil({}) is False


def test_beide_betriebsfaelle_werden_getrennt_gerechnet():
    r = berechne_schema(*_schema())
    bf = r["heatpump_results"]["wp"]["betriebsfaelle"]
    heizen, bww = bf["faelle"]

    assert bf["umschaltventil_id"] == "uv"
    # Heizbetrieb: 40 kW bei COP 4
    assert (heizen["key"], heizen["q_heiz_kw"], heizen["cop"]) == ("heizen", 40.0, 4.0)
    assert heizen["q_source_kw"] == pytest.approx(30)
    # BWW: andere Leistung, andere Temperatur, anderer COP
    assert (bww["key"], bww["q_heiz_kw"], bww["cop"]) == ("bww", 30.0, 2.6)
    assert (bww["vl_c"], bww["rl_c"]) == (55, 45)
    assert bww["q_source_kw"] == pytest.approx(30 * (1 - 1 / 2.6), abs=0.01)
    # Getrennte Volumenströme — der BWW-Betrieb braucht weniger Sole.
    assert bww["solevolumenstrom_m3h"] < heizen["solevolumenstrom_m3h"]


def test_lasten_werden_nicht_addiert():
    r = berechne_schema(*_schema())
    bf = r["heatpump_results"]["wp"]["betriebsfaelle"]

    assert bf["massgebend"] == "heizen"
    assert bf["massgebend_q_source_kw"] == pytest.approx(30)
    summe = sum(f["q_source_kw"] for f in bf["faelle"])
    assert bf["massgebend_q_source_kw"] < summe
    assert any("nicht addiert" in w for w in bf["warnungen"])


def test_grosse_ladeleistung_macht_bww_massgebend():
    r = berechne_schema(*_schema(ladeleistung=90))
    bf = r["heatpump_results"]["wp"]["betriebsfaelle"]

    assert bf["massgebend"] == "bww"
    assert bf["massgebend_q_source_kw"] > 30


def test_mischventil_erzeugt_keine_betriebsfaelle():
    r = berechne_schema(*_schema(funktion="mischend"))

    assert "betriebsfaelle" not in r["heatpump_results"]["wp"]
    # Mischventil bleibt ein Regelventil und wird über kvs ausgelegt.
    assert r["ventil_results"]["uv"].get("funktion") is None


def test_umschaltventil_bekommt_kein_kvs():
    """Es wird nichts gedrosselt — ein kvs wäre hier eine erfundene Zahl."""
    r = berechne_schema(*_schema())
    ventil = r["ventil_results"]["uv"]

    assert ventil["funktion"] == "umschaltend"
    assert "kvs_eff" not in ventil and "pv" not in ventil


def test_fehlende_bww_angaben_werden_benannt_statt_geraten():
    nodes, edges = _schema(ladeleistung=None)
    for n in nodes:
        if n["id"] == "wp":
            n["data"] = {k: v for k, v in WP_DATEN.items() if not k.startswith("bww_")}
    bf = berechne_schema(nodes, edges)["heatpump_results"]["wp"]["betriebsfaelle"]

    assert bf["bww_ladeleistung_kw"] is None
    assert any("Ladeleistung fehlt" in w for w in bf["warnungen"])
    assert any("COP" in w for w in bf["warnungen"])
    # Der Heizbetrieb bleibt trotzdem rechenbar.
    assert bf["faelle"][0]["q_source_kw"] == pytest.approx(30)


def test_betriebsfaelle_ohne_graph_bleiben_pruefbar():
    bf = betriebsfaelle(WP_DATEN, bww_ladeleistung_kw=30, hat_quellenseite=True)

    assert [f["key"] for f in bf["faelle"]] == ["heizen", "bww"]
    assert bf["hat_vorrang"] is True


def test_pdf_weist_beide_betriebsfaelle_aus():
    from app.export.pdf import berechnungs_abschnitte

    nodes, edges = _schema()
    for n in nodes:
        if n["id"] == "wp":
            n["data"]["nr"] = 1
        n.setdefault("position", {"x": 0, "y": 0})
    r = berechne_schema(nodes, edges)
    abschnitt = next(a for a in berechnungs_abschnitte(nodes, r) if a["nr"] == 1)

    zeilen = [z[0] for z in abschnitt["resultate"]]
    assert "— Betriebsfälle (Umschaltventil) —" in zeilen
    assert any("Heizbetrieb ◄ massgebend" in z for z in zeilen)
    assert any("Brauchwarmwasser-Vorrang: Quellenleistung" in z for z in zeilen)
    assert any("nicht addiert" in h for h in abschnitt["hinweise"])
