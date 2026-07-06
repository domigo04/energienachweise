"""Loop C — Kontrollrechnung für jeden Bauteiltyp (Einzelbauteile im Schema)."""
import pytest

from app.calculations.expansion import ausdehnung_e, berechne_expansion, faktor_x
from app.calculations.hydraulik import berechne_schema

VL = "#ef4444"
RL = "#3b82f6"


def _graph_mit_hauptpumpe():
    """WE → Hauptpumpe → 2WV → Verteiler mit 2 Gruppen (Δp 12 / 20 kPa) + WZ + EGF."""
    nodes = [
        {"id": "we", "type": "erzeuger", "data": {}},
        {"id": "hp", "type": "pump", "data": {"label": "Hauptpumpe", "rohr_m": "60", "pam": "70", "apparate_kpa": "10"}},
        {"id": "v2", "type": "valve2", "data": {"label": "Ventil", "dp_var": "26"}},
        {"id": "wz", "type": "waermezaehler", "data": {"label": "WZ", "typ": "Ultraschall"}},
        {"id": "vt", "type": "verteiler", "data": {"abgaenge": 2}},
        {"id": "g1", "type": "gruppe", "data": {"q_kw": "5", "vl_temp": "35", "rl_temp": "28", "dp_kpa": "12"}},
        {"id": "g2", "type": "gruppe", "data": {"q_kw": "10", "vl_temp": "40", "rl_temp": "30", "dp_kpa": "20"}},
        {"id": "eg", "type": "expansion", "data": {"anlageinhalt_l": "500", "t_mittel": "50", "leistung_kw": "10", "hoehe_m": "10", "psv_bar": "3"}},
    ]
    edges = [
        {"id": "e1", "source": "we", "sourceHandle": "vl", "target": "hp", "targetHandle": "top", "stroke": VL},
        {"id": "e2", "source": "hp", "sourceHandle": "bottom", "target": "v2", "targetHandle": "top", "stroke": VL},
        {"id": "e2b", "source": "v2", "sourceHandle": "bottom", "target": "wz", "targetHandle": "top", "stroke": VL},
        {"id": "e3", "source": "wz", "sourceHandle": "bottom", "target": "vt", "targetHandle": "vl-main", "stroke": VL},
        {"id": "e4", "source": "vt", "sourceHandle": "vl-1", "target": "g1", "targetHandle": "vl", "stroke": VL},
        {"id": "e5", "source": "g1", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-1", "stroke": RL},
        {"id": "e6", "source": "vt", "sourceHandle": "vl-2", "target": "g2", "targetHandle": "vl", "stroke": VL},
        {"id": "e7", "source": "g2", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-2", "stroke": RL},
        {"id": "e8", "source": "vt", "sourceHandle": "rl-main", "target": "we", "targetHandle": "rl", "stroke": RL},
    ]
    return nodes, edges


@pytest.fixture(scope="module")
def resultat():
    return berechne_schema(*_graph_mit_hauptpumpe())


def test_hauptpumpe_foerderhoehe_mit_unguenstigstem_ast(resultat):
    """Förderhöhe = Δp gemeinsamer Teil + Δp ungünstigster Ast (Pflichtenheft §5)."""
    p = resultat["pumpen_results"]["hp"]
    # gemeinsamer Teil: 60 m · 70 Pa/m / 1000 + 10 = 14.2 kPa
    assert p["dp_gemeinsam_kpa"] == pytest.approx(14.2, abs=0.01)
    # ungünstigster Ast am Verteiler: max(12, 20) = 20 kPa
    assert p["dp_ast_kpa"] == pytest.approx(20.0, abs=0.01)
    assert p["verteiler_id"] == "vt"
    assert p["foerderhoehe_kpa"] == pytest.approx(34.2, abs=0.01)
    assert p["mws"] == pytest.approx(3.42, abs=0.01)
    # Pumpe fördert den Gesamt-Primärfluss (§4-Beispiel: 1.218 m³/h)
    assert p["v"] == pytest.approx(1.218, abs=0.001)


def test_ventil_einzelbauteil_backend(resultat):
    """Ventil in der Hauptleitung: kvs + Autorität aus dem Leitungs-Durchfluss."""
    v = resultat["ventil_results"]["v2"]
    # V' = 1.218 m³/h · kvs_theor = 1.218/√0.26 = 2.389 → Vorschlag 2.5
    assert v["v"] == pytest.approx(1.218, abs=0.001)
    assert v["kvs_theor"] == pytest.approx(2.389, abs=0.005)
    assert v["kvs_vorschlag"] == 2.5
    # Δpv = (1.218/2.5)² = 0.2374 bar → Pv = 23.74/(23.74+26) = 47.7 %
    assert v["pv"] == pytest.approx(47.7, abs=0.3)


def test_waermezaehler_uebernimmt_durchfluss(resultat):
    """Wärmezähler übernimmt den Durchfluss der Leitung, in der er sitzt."""
    assert resultat["node_flows"]["wz"] == pytest.approx(1.218, abs=0.001)


def test_expansion_im_schema(resultat):
    """500 l, 50 °C (e 0.012), 10 kW (X 3.0), 10 m, pSV 3 bar → VN 50.8 → 80 l."""
    e = resultat["expansion_results"]["eg"]
    assert e["e"] == pytest.approx(0.012, abs=1e-5)
    assert e["x"] == pytest.approx(3.0, abs=0.001)
    assert e["vex_tot_l"] == pytest.approx(18.0, abs=0.01)
    assert e["p0_bar"] == pytest.approx(10 * 9.81 * 1050e-5 + 0.3, abs=0.001)   # 1.330
    assert e["pfin_bar"] == pytest.approx(3 / 1.15, abs=0.001)                  # 2.609
    assert e["vn_l"] == pytest.approx(50.8, abs=0.2)
    assert e["vorschlag_l"] == 80


def test_expansion_excel_beispiel():
    """Kontrollrechnung mit den Beispielwerten aus Dominics Excel:
    Vsys 2133.2 l, 35 °C, 91 kW, Höhe 29 m, pSV 4 bar → VN ≈ 613 l."""
    r = berechne_expansion({"anlageinhalt_l": "2133.2", "t_mittel": "35", "leistung_kw": "91",
                            "hoehe_m": "29", "psv_bar": "4"})
    assert r["e"] == pytest.approx(0.00575, abs=1e-5)
    assert r["x"] == pytest.approx(2.132, abs=0.001)
    assert r["vex_tot_l"] == pytest.approx(26.15, abs=0.05)
    assert r["vn_l"] == pytest.approx(613, abs=2)


def test_expansion_stufen_faktoren_fehler():
    # e-Stufen: 37 °C → Stufe 35 → 0.00575 (keine Interpolation, wie Excel-MATCH)
    assert ausdehnung_e(37) == pytest.approx(0.00575, abs=1e-6)
    # X-Faktor: ≤10 kW → 3.0 · 60 kW → 2.464 · ab 150 kW → 1.5
    assert faktor_x(10) == 3.0
    assert faktor_x(60) == pytest.approx(2.464, abs=0.001)
    assert faktor_x(200) == 1.5
    # EWS: e 0.016, X 2.5 fix (ohne t/Leistung)
    r = berechne_expansion({"anlageinhalt_l": "300", "medium": "ews", "hoehe_m": "5", "psv_bar": "3"})
    assert r["e"] == 0.016 and r["x"] == 2.5
    # Anlage zu hoch für das SV → Fehler
    r2 = berechne_expansion({"anlageinhalt_l": "500", "t_mittel": "50", "leistung_kw": "10", "hoehe_m": "30", "psv_bar": "3"})
    assert "fehler" in r2
    assert berechne_expansion({"anlageinhalt_l": "500"}) is None  # Eingaben fehlen
