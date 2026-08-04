"""Die Kette Wärmepumpe → Erdsondenfeld → Solepumpe muss im Schema geschlossen sein.

Fachlicher Ablauf, den diese Tests absichern:

    Heizleistung + COP        → Quellenleistung Q0
    Q0 + spez. Entzugsleistung → erforderliche Bohrmeter
    Q0 + Sole-ΔT + Wärmeträger → Solevolumenstrom
    Volumenstrom + Rohre       → Druckverlust und Förderhöhe
    Förderhöhe + Volumenstrom  → Betriebspunkt der Solepumpe

Damit genügen für die Pumpenauswahl im Fabrikatskatalog zwei Zahlen.
"""

import pytest

from app.calculations.hydraulik import berechne_schema
from app.calculations.waermepumpe import CE_WASSER, berechne_waermepumpe

SOLE_VL, SOLE_RL = "#eab308", "#16a34a"
VL, RL = "#ef4444", "#3b82f6"


def _kante(i, s, t, farbe, sh=None, th=None):
    e = {"id": i, "source": s, "target": t, "style": {"stroke": farbe}}
    if sh:
        e["sourceHandle"] = sh
    if th:
        e["targetHandle"] = th
    return e


def _schema(**ews_extra):
    ews_data = {
        "sonden_anzahl": 5, "sonden_laenge_m": 180, "entzugsleistung_w_m": 45,
        "sole_rohr_sonde": "pe32x2.9",
        "sole_zuleitung_verteiler_m": 30, "sole_zuleitung_wp_m": 16,
        "sole_zusatzinhalt_l": 5, "sole_dp_wp_mws": 1.0,
    }
    ews_data.update(ews_extra)
    nodes = [
        {"id": "wp", "type": "erzeuger", "position": {"x": 0, "y": 0}, "data": {
            "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
            "vl_temp": 35, "rl_temp": 30, "sole_vl": 0, "sole_rl": -3,
        }},
        {"id": "ews", "type": "erdsonden", "position": {"x": -600, "y": 300}, "data": ews_data},
        {"id": "solepumpe", "type": "pump", "position": {"x": -300, "y": 200}, "data": {}},
        {"id": "sp", "type": "speicher", "position": {"x": 300, "y": 0}, "data": {}},
        # Ohne Verbraucher rechnet das Schema nur die Leerfassung — für die
        # Solekette braucht es deshalb einen vollständigen Heizkreis.
        {"id": "vt", "type": "verteiler", "position": {"x": 600, "y": 0},
         "data": {"abgaenge": 2}},
        {"id": "g1", "type": "gruppe", "position": {"x": 600, "y": 400},
         "data": {"q_kw": 24, "vl_temp": 35, "rl_temp": 28}},
    ]
    edges = [
        _kante("e1", "wp", "sp", VL, "vl", None),
        _kante("e2", "sp", "wp", RL, None, "rl"),
        _kante("e3", "wp", "solepumpe", SOLE_RL, "source_return", None),
        _kante("e4", "solepumpe", "ews", SOLE_RL),
        _kante("e5", "ews", "wp", SOLE_VL, None, "source_flow"),
        _kante("e6", "sp", "vt", VL),
        _kante("e7", "vt", "sp", RL),
        _kante("e8", "vt", "g1", VL),
        _kante("e9", "g1", "vt", RL),
    ]
    return nodes, edges


def test_quellenleistung_und_volumenstrom_erreichen_das_sondenfeld():
    r = berechne_schema(*_schema())
    wp = r["heatpump_results"]["wp"]
    ews = r["erdsonden_results"]["ews"]
    dv = ews["druckverlust"]

    # 40 kW bei COP 4 → 10 kW elektrisch → 30 kW aus dem Erdreich
    assert wp["q_source_kw"] == pytest.approx(30)
    assert ews["quellenleistung_kw"] == pytest.approx(30)
    assert ews["leistungsquelle"] == "Wärmepumpe"
    # 30 kW / 45 W/m · 1.1 Sicherheit
    assert ews["erforderlich_gesamt_m"] == pytest.approx(733.3, abs=0.1)

    # Der Volumenstrom der Wärmepumpe ist auch der des Sondenfelds.
    assert dv["volumenstrom_m3_h"] == pytest.approx(wp["source_flow_m3h"], abs=0.01)
    assert dv["volumenstrom_quelle"] == "Wärmepumpe im Schema"


def test_solevolumenstrom_nutzt_den_waermetraeger_des_sondenfelds():
    """Sole an der Wärmepumpe und Sole im Sondenkreis sind dieselbe Flüssigkeit."""
    r = berechne_schema(*_schema(sole_traeger="antifrogen_n_25"))
    wp = r["heatpump_results"]["wp"]

    # Antifrogen N 25 %: cp 3.78 kJ/kgK · ρ 1050 kg/m³ / 3600 = 1.1025 kWh/(m³·K)
    assert wp["source_ce"] == pytest.approx(1.1025, abs=1e-3)
    assert wp["source_ce_quelle"] == "waermetraeger"
    # V' = 30 kW / (1.1025 · 3 K)
    assert wp["source_flow_m3h"] == pytest.approx(9.07, abs=0.01)
    # Mit der Wasserkonstante wäre der Volumenstrom rund 5 % kleiner.
    mit_wasser = 30 / (CE_WASSER * 3)
    assert wp["source_flow_m3h"] > mit_wasser
    assert not any("Wasserkonstante" in w for w in wp["warnings"])


def test_eingabe_an_der_waermepumpe_schlaegt_den_waermetraeger():
    r = berechne_schema(*_schema(sole_traeger="antifrogen_l_30"))
    nodes, edges = _schema(sole_traeger="antifrogen_l_30")
    for n in nodes:
        if n["id"] == "wp":
            n["data"]["sole_ce"] = 1.05
    manuell = berechne_schema(nodes, edges)["heatpump_results"]["wp"]

    assert r["heatpump_results"]["wp"]["source_ce_quelle"] == "waermetraeger"
    assert manuell["source_ce"] == pytest.approx(1.05)
    assert manuell["source_ce_quelle"] == "eingabe"


def test_ohne_sondenfeld_bleibt_die_wasserwarnung():
    """Ohne bekannten Wärmeträger wird sichtbar mit Wasser gerechnet."""
    r = berechne_waermepumpe(
        {"generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
         "sole_vl": 0, "sole_rl": -3},
        hat_quellenseite=True,
    )

    assert r["source_ce_quelle"] == "wasser"
    assert any("Wasserkonstante" in w for w in r["warnings"])


def test_solepumpe_erhaelt_betriebspunkt_aus_dem_sondenfeld():
    r = berechne_schema(*_schema())
    dv = r["erdsonden_results"]["ews"]["druckverlust"]
    p = r["pumpen_results"]["solepumpe"]

    assert p["ist_solepumpe"] is True
    assert p["erdsonden_id"] == "ews" and p["wp_id"] == "wp"
    # Genau die zwei Zahlen, die der Fabrikatskatalog braucht.
    assert p["v"] == pytest.approx(r["heatpump_results"]["wp"]["source_flow_m3h"], abs=0.01)
    assert p["foerderhoehe_mws"] == pytest.approx(dv["foerderhoehe_mws"])
    assert p["foerderhoehe_kpa"] == pytest.approx(dv["foerderhoehe_mws"] * 9.80665, abs=0.05)
    # Aufschlüsselung bleibt nachvollziehbar.
    assert p["dp_leitungen_mws"] == dv["druckverlust_leitungen_mws"]
    assert p["dp_wp_mws"] == dv["druckverlust_wp_mws"]
    assert p["warnings"] == []


def test_solepumpe_wird_nicht_dem_heizungsverteiler_zugeordnet():
    """Vorher lief die Verteilersuche quer durch den Solekreis bis zum Verteiler
    der Heizseite und ordnete der Solepumpe dessen Astdruckverlust zu."""
    p = berechne_schema(*_schema())["pumpen_results"]["solepumpe"]

    assert p["ist_solepumpe"] is True
    assert "verteiler_id" not in p
    assert "dp_ast_kpa" not in p


def test_heizungspumpe_bleibt_unveraendert():
    """Die bestehende Logik für Pumpen im Heizkreis darf nicht kippen."""
    nodes, edges = _schema()
    nodes.append({"id": "heizpumpe", "type": "pump", "position": {"x": 450, "y": 0},
                  "data": {"rohr_m": 60, "pam": 70, "apparate_kpa": 10}})
    edges.append(_kante("e10", "sp", "heizpumpe", VL))

    p = berechne_schema(nodes, edges)["pumpen_results"]["heizpumpe"]

    assert p.get("ist_solepumpe") is None
    assert p["dp_gemeinsam_kpa"] == pytest.approx(60 * 70 / 1000 + 10)


def test_mehrere_sondenfelder_werden_nicht_still_zusammengefasst():
    nodes, edges = _schema()
    zweites = dict(nodes[1])
    zweites["id"] = "ews2"
    zweites["data"] = dict(nodes[1]["data"])
    nodes.append(zweites)
    edges.append(_kante("e10", "solepumpe", "ews2", SOLE_RL))
    edges.append(_kante("e11", "ews2", "wp", SOLE_VL, None, "source_flow"))

    p = berechne_schema(nodes, edges)["pumpen_results"]["solepumpe"]

    assert p["foerderhoehe_mws"] is None
    assert any("Mehrere Erdsondenfelder" in w for w in p["warnings"])


def test_pdf_weist_den_betriebspunkt_der_solepumpe_aus():
    from app.export.pdf import berechnungs_abschnitte

    nodes, edges = _schema()
    for n in nodes:
        if n["id"] == "solepumpe":
            n["data"]["nr"] = 3
    r = berechne_schema(nodes, edges)
    abschnitt = next(a for a in berechnungs_abschnitte(nodes, r) if a["nr"] == 3)

    assert ("Einbauort", "Quellenkreis (Sole)", "") in abschnitt["eingaben"]
    assert any(z[0] == "Betriebspunkt für die Fabrikatswahl" for z in abschnitt["resultate"])
    assert any(z[0] == "Förderhöhe gesamt" and z[2] == "mWs" for z in abschnitt["resultate"])
