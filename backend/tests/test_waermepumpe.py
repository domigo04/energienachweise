"""Wärmepumpe — Erzeugerkreis (heizseitig) und Quellenkreis (Sole).

Prüft die Physik (PHYSIK §1, Energiebilanz der WP) UND die Topologie:
welche Leitungen zu welchem Kreis gehören und wo ein Kreis endet.
Keine echten Projektdaten — nur erfundene Testschemas.
"""
from app.calculations.hydraulik import _wp_kreis, berechne_schema
from app.calculations.waermepumpe import (
    CE_WASSER, berechne_waermepumpe, elektrische_leistung, volumenstrom,
)


# ── Reine Rechnung ──────────────────────────────────────────────────────────
def test_quellenleistung_ist_heizleistung_minus_elektrische_leistung():
    """§8: Q_source = Q_heat − P_el, mit P_el = Q_heat / COP."""
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 50, "rl_temp": 30, "cop": 4}, hat_quellenseite=True)
    assert res["p_el_kw"] == 12.5
    assert res["q_source_kw"] == 37.5
    assert res["p_el_quelle"] == "cop"


def test_heizvolumenstrom_nach_physik_paragraph_1():
    """50 kW bei 50/30 → 50 / (1.163 · 20) = 2.1496 m³/h."""
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 50, "rl_temp": 30, "cop": 4}, hat_quellenseite=True)
    assert res["heating_dt"] == 20
    assert res["heating_flow_m3h"] == round(50 / (1.163 * 20), 4) == 2.1496


def test_quellenleistung_wird_nie_der_heizleistung_gleichgesetzt():
    """§9: ohne COP und ohne P_el gibt es keine Quellenleistung — nur einen Hinweis."""
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 50, "rl_temp": 30, "generator_type": "ews_wp"},
        hat_quellenseite=True)
    assert res["q_source_kw"] is None
    assert res["source_flow_m3h"] is None
    assert any("COP oder elektrische Leistungsaufnahme" in w for w in res["warnings"])


def test_explizite_elektrische_leistung_schlaegt_cop():
    """§10: es darf nur EINE Wahrheit geben — die Eingabe gewinnt."""
    p_el, quelle = elektrische_leistung(50, 4, 10)
    assert (p_el, quelle) == (10, "eingabe")
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 50, "rl_temp": 30, "cop": 4, "p_el_kw": 10},
        hat_quellenseite=True)
    assert res["p_el_kw"] == 10.0
    assert res["q_source_kw"] == 40.0


def test_solevolumenstrom_kennzeichnet_die_wasserannahme():
    """§11: keine versteckte Wasserannahme — der Stoffwert wird ausgewiesen."""
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 50, "rl_temp": 30, "cop": 4,
         "sole_vl": 4, "sole_rl": 0}, hat_quellenseite=True)
    assert res["source_dt"] == 4
    assert res["source_flow_m3h"] == round(37.5 / (CE_WASSER * 4), 4)
    assert res["source_ce"] == CE_WASSER
    assert res["source_ce_quelle"] == "wasser"
    assert any("Wasserkonstante" in w for w in res["warnings"])


def test_eigener_stoffwert_der_sole_wird_verwendet():
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 50, "rl_temp": 30, "cop": 4,
         "sole_vl": 4, "sole_rl": 0, "sole_ce": 1.05}, hat_quellenseite=True)
    assert res["source_ce_quelle"] == "eingabe"
    assert res["source_flow_m3h"] == round(37.5 / (1.05 * 4), 4)
    assert not any("Wasserkonstante" in w for w in res["warnings"])


def test_warnungen_bei_unmoeglichen_temperaturen_und_cop():
    res = berechne_waermepumpe(
        {"leistung_kw": 50, "vl_temp": 30, "rl_temp": 40, "cop": 0.9,
         "sole_vl": 0, "sole_rl": 4}, hat_quellenseite=True)
    assert res["heating_flow_m3h"] is None
    assert any("nicht höher als der Rücklauf" in w for w in res["warnings"])
    assert any("COP" in w for w in res["warnings"])
    assert any("Sole-ΔT" in w for w in res["warnings"])


def test_gaskessel_wird_nicht_nach_cop_gefragt():
    res = berechne_waermepumpe(
        {"leistung_kw": 30, "vl_temp": 70, "rl_temp": 50, "generator_type": "gas"})
    assert res["q_source_kw"] is None
    assert res["warnings"] == []
    assert res["heating_flow_m3h"] == round(30 / (1.163 * 20), 4)


def test_volumenstrom_ohne_gueltiges_dt_ist_none():
    assert volumenstrom(50, 0) is None
    assert volumenstrom(50, -5) is None
    assert volumenstrom(None, 20) is None


# ── Topologie ───────────────────────────────────────────────────────────────
def _leitung(eid, source, target, layer, **data):
    return {"id": eid, "source": source, "target": target,
            "data": {"layer_id": layer, **data}}


WP = {"id": "wp", "type": "erzeuger", "data": {
    "label": "WP", "generator_type": "ews_wp", "leistung_kw": 50,
    "vl_temp": 50, "rl_temp": 30, "cop": 4, "sole_vl": 4, "sole_rl": 0}}


def test_wp_puffer_kreis_alle_leitungen_gleicher_fluss():
    """§45: WP → Pumpe → Puffer → zurück. Alle seriellen Leitungen tragen V'_heiz."""
    nodes = [
        WP,
        {"id": "p1", "type": "pump", "data": {"label": "Ladepumpe"}},
        {"id": "sp", "type": "speicher", "data": {"label": "Puffer"}},
    ]
    edges = [
        _leitung("e1", "wp", "p1", "heizung_vl", sourceHandle="heating_flow"),
        _leitung("e2", "p1", "sp", "heizung_vl"),
        _leitung("e3", "sp", "wp", "heizung_rl", targetHandle="heating_return"),
    ]
    edges[0]["sourceHandle"] = "heating_flow"
    edges[2]["targetHandle"] = "heating_return"
    res = berechne_schema(nodes, edges)

    v = res["heatpump_results"]["wp"]["heating_flow_m3h"]
    assert v == 2.1496
    for eid in ("e1", "e2", "e3"):
        assert res["edge_flows"][eid] == v
    assert res["node_flows"]["p1"] == v          # Pumpe im Kreis
    assert res["node_flows"]["wp"] == v
    assert res["leitung_results"]["e2"]["dn"]    # Dimensionierung sieht den Fluss


def test_dreiwegeventil_beendet_den_vorrangkreis():
    """WP → 3WV gehört noch zum Ladekreis; hinter dem 3WV beginnt der durch
    dessen Vorrangstellung gewählte separate Kreis."""
    nodes = [
        WP,
        {"id": "v3", "type": "valve3", "data": {}},
        {"id": "sp", "type": "speicher", "data": {}},
    ]
    edges = [
        _leitung("bis_ventil", "wp", "v3", "heizung_vl", sourceHandle="heating_flow"),
        _leitung("nach_ventil", "v3", "sp", "heizung_vl"),
    ]
    edge_ids, _, grenzen = _wp_kreis(
        "wp", "heating", edges, {node["id"]: node for node in nodes},
    )
    assert edge_ids == {"bis_ventil"}
    assert "valve3" in grenzen


def test_solekreis_rechnet_mit_quellenleistung_nicht_mit_heizleistung():
    """§46: Erdsonden → Solepumpe → WP → zurück, mit Q_source = 37.5 kW."""
    nodes = [
        WP,
        {"id": "sp1", "type": "pump", "data": {"label": "Solepumpe"}},
        {"id": "ews", "type": "erdsonden", "data": {"label": "Erdsonden"}},
    ]
    edges = [
        _leitung("s1", "ews", "sp1", "sole_vl"),
        _leitung("s2", "sp1", "wp", "sole_vl"),
        _leitung("s3", "wp", "ews", "sole_rl"),
    ]
    edges[1]["targetHandle"] = "source_flow"
    edges[2]["sourceHandle"] = "source_return"
    res = berechne_schema(nodes, edges)

    wp = res["heatpump_results"]["wp"]
    assert wp["q_source_kw"] == 37.5
    v_sole = wp["source_flow_m3h"]
    # Der Wärmeträger des angeschlossenen Sondenfelds gilt auch am Verdampfer.
    # Ohne eigene Wahl ist das der Vorgabewert Antifrogen N 25 %, mit dem auch
    # der Sondenkreis rechnet — sonst stünden zwei Stoffwerte im selben Kreis.
    assert wp["source_ce_quelle"] == "waermetraeger"
    assert v_sole == round(37.5 / (wp["source_ce"] * 4), 4)
    assert v_sole > round(37.5 / (CE_WASSER * 4), 4)
    # NICHT der Heizvolumenstrom — die Quellenleistung ist kleiner
    assert v_sole != wp["heating_flow_m3h"]
    for eid in ("s1", "s2", "s3"):
        assert res["edge_flows"][eid] == v_sole
    assert res["node_flows"]["sp1"] == v_sole


def test_heiz_und_solekreis_bleiben_getrennt():
    """Beide Kreise an derselben WP dürfen sich nicht vermischen."""
    nodes = [
        WP,
        {"id": "sp", "type": "speicher", "data": {}},
        {"id": "ews", "type": "erdsonden", "data": {}},
    ]
    edges = [
        _leitung("h1", "wp", "sp", "heizung_vl"),
        _leitung("h2", "sp", "wp", "heizung_rl"),
        _leitung("s1", "wp", "ews", "sole_vl"),
        _leitung("s2", "ews", "wp", "sole_rl"),
    ]
    res = berechne_schema(nodes, edges)
    wp = res["heatpump_results"]["wp"]
    assert res["edge_flows"]["h1"] == res["edge_flows"]["h2"] == wp["heating_flow_m3h"]
    assert res["edge_flows"]["s1"] == res["edge_flows"]["s2"] == wp["source_flow_m3h"]
    # Der Solekreis läuft mit kleinem ΔT (4 K) und trägt deshalb den GRÖSSEREN
    # Volumenstrom, obwohl er die kleinere Leistung überträgt. Genau darum darf
    # kein Kreis den Wert des anderen bekommen.
    assert wp["source_flow_m3h"] > wp["heating_flow_m3h"]


def test_freie_wp_anschlusszone_erkennt_kreise_ueber_leitungslayer():
    """Neutrale Zonen-Handles tragen absichtlich keine Semantik. Sole/Heizung
    müssen deshalb aus layer_id erkannt werden, egal wo am WP-Rand angedockt."""
    nodes = [
        WP,
        {"id": "sp", "type": "speicher", "data": {}},
        {"id": "ews", "type": "erdsonden", "data": {}},
    ]
    edges = [
        _leitung("h1", "wp", "sp", "heizung_vl"),
        _leitung("h2", "sp", "wp", "heizung_rl"),
        _leitung("s1", "wp", "ews", "sole_vl"),
        _leitung("s2", "ews", "wp", "sole_rl"),
    ]
    edges[0]["sourceHandle"] = "wz-r-28"
    edges[1]["targetHandle"] = "wz-b-63"
    edges[2]["sourceHandle"] = "wz-l-41"
    edges[3]["targetHandle"] = "wz-t-72"
    result = berechne_schema(nodes, edges)
    wp = result["heatpump_results"]["wp"]
    assert result["edge_flows"]["h1"] == wp["heating_flow_m3h"]
    assert result["edge_flows"]["s1"] == wp["source_flow_m3h"]
    assert wp["source_flow_m3h"] != wp["heating_flow_m3h"]


def test_speicher_trennt_erzeuger_und_verbraucherkreis():
    """§47: Der Puffer ist die Kreisgrenze — beide Seiten dürfen unterschiedliche
    Volumenströme führen. Verbraucher: 20 kW bei 40/30 (ΔT 10) → deutlich mehr
    Fluss als die WP-Seite mit 50 kW bei ΔT 20."""
    nodes = [
        WP,
        {"id": "sp", "type": "speicher", "data": {}},
        {"id": "vt", "type": "verteiler", "data": {}},
        {"id": "g1", "type": "gruppe", "data": {"q_kw": 20, "vl_temp": 40, "rl_temp": 30}},
    ]
    edges = [
        _leitung("h1", "wp", "sp", "heizung_vl"),
        _leitung("h2", "sp", "wp", "heizung_rl"),
        _leitung("v1", "sp", "vt", "heizung_vl"),
        _leitung("v2", "vt", "sp", "heizung_rl"),
        _leitung("a1", "vt", "g1", "heizung_vl"),
        _leitung("a2", "g1", "vt", "heizung_rl"),
    ]
    edges[2]["targetHandle"] = "vl-main"
    edges[3]["sourceHandle"] = "rl-main"
    edges[4]["sourceHandle"] = "vl-1"
    edges[5]["targetHandle"] = "rl-1"
    res = berechne_schema(nodes, edges)

    v_wp = res["heatpump_results"]["wp"]["heating_flow_m3h"]
    v_verbraucher = round(20 / (1.163 * 10), 4)
    assert res["edge_flows"]["h1"] == v_wp == 2.1496
    assert res["edge_flows"]["a1"] == v_verbraucher == 1.7197
    assert res["edge_flows"]["v1"] == v_verbraucher      # Verbraucherseite
    assert v_wp != v_verbraucher                          # ausdrücklich getrennt


def test_bestandsschema_ohne_semantische_ports_nutzt_den_medien_layer():
    """Altes Schema mit generischen Handles: die Zuordnung gelingt über den
    Layer, wird aber als solche ausgewiesen (nicht als gesicherter Anschluss)."""
    nodes = [WP, {"id": "ews", "type": "erdsonden", "data": {}},
             {"id": "sp", "type": "speicher", "data": {}}]
    edges = [
        _leitung("s1", "wp", "ews", "sole_vl"),
        _leitung("s2", "ews", "wp", "sole_rl"),
        _leitung("h1", "wp", "sp", "heizung_vl"),
        _leitung("h2", "sp", "wp", "heizung_rl"),
    ]
    for e in edges:
        e["sourceHandle"] = "left"
        e["targetHandle"] = "right"
    res = berechne_schema(nodes, edges)["heatpump_results"]["wp"]
    assert res["source_port_quelle"] == "layer"
    assert res["heating_port_quelle"] == "layer"
    assert res["source_flow_m3h"] and res["heating_flow_m3h"]


def test_alte_handle_ids_vl_rl_bleiben_die_heizungsseite():
    nodes = [WP, {"id": "sp", "type": "speicher", "data": {}}]
    edges = [
        {"id": "h1", "source": "wp", "target": "sp", "sourceHandle": "vl", "data": {}},
        {"id": "h2", "source": "sp", "target": "wp", "targetHandle": "rl", "data": {}},
    ]
    res = berechne_schema(nodes, edges)["heatpump_results"]["wp"]
    assert res["heating_port_quelle"] == "port"
    assert res["heating_flow_m3h"] == 2.1496


def test_warnung_wenn_der_heizkreis_nirgends_endet():
    nodes = [WP, {"id": "j1", "type": "junction", "data": {"cad_anchor": True}}]
    edges = [_leitung("h1", "wp", "j1", "heizung_vl")]
    res = berechne_schema(nodes, edges)["heatpump_results"]["wp"]
    assert any("keinem Speicher" in w for w in res["warnings"])


def test_luftwasser_wp_bilanziert_umweltleistung_ohne_solekreis():
    nodes = [{
        "id": "lwwp",
        "type": "erzeuger",
        "data": {
            "generator_type": "lwwp",
            "leistung_kw": 50,
            "vl_temp": 50,
            "rl_temp": 30,
            "cop": 4,
            "aussenluft_temp": -8,
            "fortluft_temp": -12,
        },
    }]

    res = berechne_schema(nodes, [])["heatpump_results"]["lwwp"]

    assert res["heating_flow_m3h"] == round(50 / (1.163 * 20), 4)
    assert res["p_el_kw"] == 12.5
    assert res["q_source_kw"] == 37.5
    assert res["source_flow_m3h"] is None
    assert res["hat_hydraulischen_quellenkreis"] is False
    assert not any("Sole" in warning for warning in res["warnings"])
