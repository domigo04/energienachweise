"""Hydraulik-Kern — Tests mit konkreten Zahlen gegen PHYSIK.md §1–§4."""
import pytest

from app.calculations.heizgruppen import berechne_volumenstrom
from app.calculations.hydraulik import (
    _stroke,
    berechne_schema,
    berechne_verteiler_gruppen,
    dp_parallel,
    dp_reihe,
)

VL = "#ef4444"
RL = "#3b82f6"


def test_medien_layer_werden_fachlich_als_vl_rl_erkannt():
    assert _stroke({"style": {"stroke": "#06b6d4"}, "data": {"layer_id": "kaelte_vl"}}) == VL
    assert _stroke({"style": {"stroke": "#0e7490"}, "data": {"layer_id": "kaelte_rl"}}) == RL
    assert _stroke({"style": {"stroke": "#8b5cf6"}, "data": {"layer_id": "sole_vl"}}) == VL


# ── §1 Volumenstrom ──────────────────────────────────────────────────────────
def test_volumenstrom_beispiel():
    # 8.5 kW, VL 35 / RL 30 (ΔT 5 K) → 8.5 / (1.163·5) = 1.4617 m³/h
    assert berechne_volumenstrom(8.5, 35, 30) == pytest.approx(1.4617, abs=0.001)


def test_volumenstrom_ungueltig():
    assert berechne_volumenstrom(8.5, 30, 35) is None  # VL ≤ RL
    assert berechne_volumenstrom(0, 35, 28) is None    # keine Leistung


# ── §5 Druckverlust: Reihe addieren, parallel ungünstigster Ast ─────────────
def test_dp_reihe_addiert():
    assert dp_reihe([5.0, 3.0, 2.5]) == 10.5


def test_dp_parallel_max():
    assert dp_parallel([12.0, 20.0, 8.0]) == 20.0
    assert dp_parallel([]) == 0.0


# ── §4 Beispielrechnung aus PHYSIK.md (2 Gruppen) ───────────────────────────
def test_verteiler_physik_beispiel():
    r = berechne_verteiler_gruppen([
        {"name": "FBH", "q_kw": 5, "vl": 35, "rl": 28},
        {"name": "Lufterhitzer", "q_kw": 10, "vl": 40, "rl": 30},
    ])
    assert r["vl_vt"] == 40
    assert r["gruppen"][0]["m_prim"] == pytest.approx(0.358, abs=0.001)
    assert r["gruppen"][1]["m_prim"] == pytest.approx(0.860, abs=0.001)
    assert r["m_prim_total"] == pytest.approx(1.218, abs=0.001)
    assert r["rl_misch"] == pytest.approx(29.4, abs=0.05)
    assert r["q_total"] == 15.0
    # Gruppe 1 spritzt ein (35 < 40), Gruppe 2 nicht (40 = VL_Verteiler)
    assert r["gruppen"][0]["einspritz"] is True
    assert r["gruppen"][1]["einspritz"] is False
    assert r["gruppen"][1]["m_bypass"] == 0.0
    # Energieerhaltung: Q = ṁ·1.163·(VL−RL_misch)
    energie = r["m_prim_total"] * 1.163 * (r["vl_vt"] - r["rl_misch"])
    assert energie == pytest.approx(15.0, abs=0.05)


def test_verteiler_unmoegliche_gruppe_warnt():
    r = berechne_verteiler_gruppen([
        {"name": "A", "q_kw": 5, "vl": 35, "rl": 28},
        {"name": "B", "q_kw": 5, "vl": 30, "rl": 36},  # RL ≥ VL_Verteiler
    ])
    assert len(r["warnings"]) == 1
    assert "physikalisch" in r["warnings"][0]


# ── Schema-Graph: 3 Parallelkreise am Verteiler (Loop-A-Pflichttest) ────────
def _graph_3_kreise():
    """Erzeuger — Verteiler (3 Abgänge) — 3 Verbrauchergruppen.

    G1 FBH 5 kW 35/28 (Δp 12) · G2 HK 8 kW 55/45 (Δp 20) · G3 LE 10 kW 60/45 (Δp 8)
    """
    nodes = [
        {"id": "we", "type": "erzeuger", "data": {"label": "WE"}},
        {"id": "vt", "type": "verteiler", "data": {"label": "Verteiler", "abgaenge": 3}},
        {"id": "g1", "type": "gruppe", "data": {"label": "G1 FBH", "q_kw": "5", "vl_temp": "35", "rl_temp": "28", "dp_kpa": "12"}},
        {"id": "g2", "type": "gruppe", "data": {"label": "G2 HK", "q_kw": "8", "vl_temp": "55", "rl_temp": "45", "dp_kpa": "20"}},
        {"id": "g3", "type": "gruppe", "data": {"label": "G3 LE", "q_kw": "10", "vl_temp": "60", "rl_temp": "45", "dp_kpa": "8"}},
    ]
    edges = [
        {"id": "e_vl1", "source": "vt", "sourceHandle": "vl-1", "target": "g1", "targetHandle": "vl", "stroke": VL},
        {"id": "e_rl1", "source": "g1", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-1", "stroke": RL},
        {"id": "e_vl2", "source": "vt", "sourceHandle": "vl-2", "target": "g2", "targetHandle": "vl", "stroke": VL},
        {"id": "e_rl2", "source": "g2", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-2", "stroke": RL},
        {"id": "e_vl3", "source": "vt", "sourceHandle": "vl-3", "target": "g3", "targetHandle": "vl", "stroke": VL},
        {"id": "e_rl3", "source": "g3", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-3", "stroke": RL},
        {"id": "e_vlm", "source": "we", "sourceHandle": "vl", "target": "vt", "targetHandle": "vl-main", "stroke": VL},
        {"id": "e_rlm", "source": "vt", "sourceHandle": "rl-main", "target": "we", "targetHandle": "rl", "stroke": RL},
    ]
    return nodes, edges


def test_schema_3_parallelkreise():
    r = berechne_schema(*_graph_3_kreise())
    vt = r["verteiler_results"]["vt"]

    # VL Verteiler = höchste Gruppen-VL
    assert vt["vl_vt"] == 60
    # Primärflüsse: Q / (1.163 · (60 − RL))
    m1, m2, m3 = 5 / (1.163 * 32), 8 / (1.163 * 15), 10 / (1.163 * 15)
    assert r["gruppe_results"]["g1"]["m_prim"] == pytest.approx(m1, abs=0.001)   # 0.1344
    assert r["gruppe_results"]["g2"]["m_prim"] == pytest.approx(m2, abs=0.001)   # 0.4586
    assert r["gruppe_results"]["g3"]["m_prim"] == pytest.approx(m3, abs=0.001)   # 0.5732
    # Summen (Leistung + Massenstrom summieren, §5 Pflichtenheft)
    assert vt["q_total"] == 23.0
    assert vt["m_prim_total"] == pytest.approx(m1 + m2 + m3, abs=0.001)          # 1.1662
    # Misch-Rücklauf mengengewichtet
    rl_soll = (m1 * 28 + m2 * 45 + m3 * 45) / (m1 + m2 + m3)
    assert vt["rl_misch"] == pytest.approx(rl_soll, abs=0.05)                    # 43.04
    # Energieerhaltung
    energie = vt["m_prim_total"] * 1.163 * (vt["vl_vt"] - vt["rl_misch"])
    assert energie == pytest.approx(23.0, abs=0.05)
    # Druckverlust: ungünstigster Ast massgebend (NICHT Summe)
    assert vt["dp_max_ast"] == 20.0
    assert vt["dp_max_ast_nr"] == "2"

    # §2: jede Ast-Leitung trägt den Fluss IHRES Kreises …
    assert r["edge_flows"]["e_vl1"] == pytest.approx(m1, abs=0.001)
    assert r["edge_flows"]["e_rl2"] == pytest.approx(m2, abs=0.001)
    # … und nur der Hauptanschluss die Summe (keine Doppelzählung)
    assert r["edge_flows"]["e_vlm"] == pytest.approx(m1 + m2 + m3, abs=0.001)
    assert r["edge_flows"]["e_rlm"] == pytest.approx(m1 + m2 + m3, abs=0.001)

    # Einspritzung: G1 + G2 ja (VL < 60), G3 nein (VL = 60 → prim = sek)
    assert r["gruppe_results"]["g1"]["einspritz"] is True
    assert r["gruppe_results"]["g2"]["einspritz"] is True
    assert r["gruppe_results"]["g3"]["einspritz"] is False
    assert r["gruppe_results"]["g3"]["m_prim"] == r["gruppe_results"]["g3"]["m_sek"]


def test_strang_pumpe_und_ventil():
    """Pumpe (Sekundärkreis) + Ventil (Primärseite) IM Strang auslegen —
    ohne die bestehenden Flüsse zu verändern."""
    nodes, edges = _graph_3_kreise()
    # G2 bekommt Ausrüstungs-Eingaben, G3 hat keine Pumpe
    nodes[3]["data"].update({"ventil_dp_var": "26", "pumpe_rohr_m": "40", "pumpe_apparate_kpa": "15"})
    nodes[4]["data"]["hat_pumpe"] = False
    r = berechne_schema(nodes, edges)

    g2 = r["gruppe_results"]["g2"]
    # Bestehende Flüsse unverändert (Berechnungen nicht anfassen!)
    assert g2["m_prim"] == pytest.approx(8 / (1.163 * 15), abs=0.001)
    # Pumpe: 40 m · 70 Pa/m / 1000 + 15 = 17.8 kPa, V' = m_sek
    assert g2["pumpe"]["dp_kpa"] == pytest.approx(17.8, abs=0.01)
    assert g2["pumpe"]["v"] == g2["m_sek"]
    # Ventil: V' = m_prim 0.4586 · kvs_theor = 0.4586/√0.26 = 0.899 → Vorschlag 1.0
    assert g2["ventil"]["v"] == g2["m_prim"]
    assert g2["ventil"]["kvs_theor"] == pytest.approx(0.899, abs=0.001)
    assert g2["ventil"]["kvs_vorschlag"] == 1.0
    # Δpv = (0.4586/1.0)² = 0.2103 bar = 21.03 kPa → Pv = 21.03/(21.03+26) = 44.7 %
    assert g2["ventil"]["dp_v_eff_kpa"] == pytest.approx(21.03, abs=0.05)
    assert g2["ventil"]["pv"] == pytest.approx(44.7, abs=0.2)

    # G3 ohne Pumpe, G1 ohne Eingaben → Ventil None, Pumpe ohne Förderhöhe
    assert r["gruppe_results"]["g3"]["hat_pumpe"] is False
    assert r["gruppe_results"]["g3"]["pumpe"] is None
    assert r["gruppe_results"]["g1"]["ventil"] is None
    assert r["gruppe_results"]["g1"]["pumpe"]["dp_kpa"] is None


def test_schaltungsarten_regeln():
    """PHYSIK §7: Drossel ohne Pumpe · Drossel kann nicht mischen ·
    Beimisch nie mit Einspritz/Drossel am selben Verteiler."""
    nodes, edges = _graph_3_kreise()
    nodes[2]["data"]["schaltung"] = "beimisch"   # G1 (35/28)
    nodes[3]["data"]["schaltung"] = "einspritz"  # G2
    nodes[4]["data"]["schaltung"] = "drossel"    # G3 (60/45 = Verteiler-VL → ok)
    r = berechne_schema(nodes, edges)

    # Flüsse bleiben EXAKT gleich (Berechnungen nicht anfassen!)
    vt = r["verteiler_results"]["vt"]
    assert vt["m_prim_total"] == pytest.approx(1.1662, abs=0.001)
    assert vt["rl_misch"] == pytest.approx(43.04, abs=0.05)

    # Drossel: nie eine Gruppenpumpe, auch ohne explizites hat_pumpe=False
    g3 = r["gruppe_results"]["g3"]
    assert g3["schaltung"] == "drossel"
    assert g3["hat_pumpe"] is False and g3["pumpe"] is None
    # Beimisch/Einspritz behalten ihre Pumpe
    assert r["gruppe_results"]["g1"]["hat_pumpe"] is True

    # Beimisch + Einspritz/Drossel gemischt → Warnung
    assert any("Beimischung" in w and "druckbehaftet" in w for w in vt["warnings"])

    # Drossel mit VL unter Verteiler-VL → Warnung «kann nicht mischen».
    # G1 auf Einspritz, G3 (Drossel) auf VL 50 → Verteiler-VL = max(35,55,50) = 55.
    nodes[2]["data"]["schaltung"] = "einspritz"
    nodes[4]["data"]["vl_temp"] = "50"
    r2 = berechne_schema(nodes, edges)
    assert any("Drossel kann nicht mischen" in w for w in r2["verteiler_results"]["vt"]["warnings"])
    # Nur Einspritz + Drossel (beide druckbehaftet) → KEINE Misch-Warnung
    assert not any("Beimischung" in w for w in r2["verteiler_results"]["vt"]["warnings"])
    # Dominic-Feedback: alle Warnungen landen zusätzlich gesammelt in "warnungen"
    # (fürs Report-Fenster im Editor) — dieselbe Drossel-Warnung erscheint dort auch.
    assert any("Drossel kann nicht mischen" in w for w in r2["warnungen"])


def test_anschluss_marker_verbindet_virtuell():
    """Zwei Anschluss-Marker mit Buchstabe 'A' ersetzen eine lang gezeichnete
    Leitung: Pumpe → Anschluss A #1 (kein Draht zu #2) → Anschluss A #2
    → Heizkreis. Fluss muss trotzdem durchgereicht werden (PHYSIK §9)."""
    nodes = [
        {"id": "hk", "type": "heizkreis", "data": {"q_kw": "8.5", "vl_temp": "35", "rl_temp": "30"}},
        {"id": "a1", "type": "anschluss", "data": {"buchstabe": "A"}},
        {"id": "a2", "type": "anschluss", "data": {"buchstabe": "A"}},
        {"id": "p", "type": "pump", "data": {}},
    ]
    edges = [
        {"id": "e1", "source": "p", "target": "a1", "stroke": VL},
        {"id": "e2", "source": "a2", "target": "hk", "stroke": VL},
    ]
    r = berechne_schema(nodes, edges)
    assert r["node_flows"]["hk"] == pytest.approx(1.4617, abs=0.001)
    # Ohne echte Kante zwischen a1/a2 muss die Pumpe trotzdem den Fluss sehen
    assert r["node_flows"]["p"] == pytest.approx(1.4617, abs=0.001)
    assert r["anschluss_warnings"] == []


def test_anschluss_ohne_gegenstueck_warnt():
    nodes = [
        {"id": "hk", "type": "heizkreis", "data": {"q_kw": "5", "vl_temp": "35", "rl_temp": "28"}},
        {"id": "a1", "type": "anschluss", "data": {"buchstabe": "B"}},
    ]
    edges = [{"id": "e1", "source": "hk", "target": "a1", "stroke": VL}]
    r = berechne_schema(nodes, edges)
    assert any("Anschluss B" in w and "kein Gegenstück" in w for w in r["anschluss_warnings"])


def test_anschluss_mehr_als_zwei_warnt():
    nodes = [{"id": f"a{i}", "type": "anschluss", "data": {"buchstabe": "C"}} for i in range(3)]
    r = berechne_schema(nodes, [])
    assert any("Anschluss C" in w and "3 Marker" in w for w in r["anschluss_warnings"])


def test_leitung_automatische_dimension_und_laenge():
    """Leitungsdimensionierung (PHYSIK §10): DN + Pa/m automatisch aus dem
    Fluss, Δp zusätzlich wenn eine Länge eingetragen wurde."""
    nodes = [
        {"id": "hk", "type": "heizkreis", "data": {"q_kw": "8.5", "vl_temp": "35", "rl_temp": "30"}},
        {"id": "p", "type": "pump", "data": {}},
    ]
    edges = [{"id": "e1", "source": "p", "target": "hk", "stroke": VL, "data": {"laenge_m": "12"}}]
    r = berechne_schema(nodes, edges)
    lg = r["leitung_results"]["e1"]
    assert lg["dn"] == "DN32"  # 1.4617 m³/h = 1461.7 kg/h (> DN25-Kapazität bei 70 Pa/m)
    assert lg["laenge_m"] == 12.0
    assert lg["dp_kpa"] == pytest.approx(lg["pam"] * 12 / 1000, abs=0.01)


def test_leitung_ohne_laenge_kein_dp():
    nodes = [
        {"id": "hk", "type": "heizkreis", "data": {"q_kw": "8.5", "vl_temp": "35", "rl_temp": "30"}},
        {"id": "p", "type": "pump", "data": {}},
    ]
    edges = [{"id": "e1", "source": "p", "target": "hk", "stroke": VL}]
    r = berechne_schema(nodes, edges)
    assert r["leitung_results"]["e1"]["dp_kpa"] is None
    assert r["leitung_results"]["e1"]["dn"] is not None


def test_schema_freier_kreis_ohne_verteiler():
    """Heizkreis → Pumpe (VL) ohne Verteiler: Leitung trägt den Kreis-Fluss."""
    nodes = [
        {"id": "hk", "type": "heizkreis", "data": {"q_kw": "8.5", "vl_temp": "35", "rl_temp": "30"}},
        {"id": "p", "type": "pump", "data": {}},
    ]
    edges = [{"id": "e1", "source": "p", "target": "hk", "stroke": VL}]
    r = berechne_schema(nodes, edges)
    assert r["node_flows"]["hk"] == pytest.approx(1.4617, abs=0.001)
    assert r["edge_flows"]["e1"] == pytest.approx(1.4617, abs=0.001)
    assert r["node_flows"]["p"] == pytest.approx(1.4617, abs=0.001)
