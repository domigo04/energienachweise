"""Leitungen ändern (Issue #72) — hydraulisch gleichwertige Graphen.

Versatz, Stutzen, Dehnen bis Kante und Verbinden ändern ausschliesslich die
*Geometrie* im Editor. Sie verändern dabei aber die Topologie des gespeicherten
Graphen:

* Stutzen und Dehnen ERSETZEN eine Leitung durch zwei Leitungen, die an einem
  freien Anker (`junction`) hängen.
* Verbinden führt zwei solche Leitungen wieder zu einer zusammen und entfernt
  den Anker dazwischen.
* Versatz legt eine zusätzliche, freistehende Leitung ins Schema.

Das Akzeptanzkriterium aus dem Issue lautet: „Nach jedem Befehl rechnet das
Backend dasselbe wie bei einer von Hand gleich gezeichneten Leitung."

Diese Datei nagelt genau das fest — nicht die Geometrie (die liegt rein und
getestet im Frontend), sondern die Gleichwertigkeit der entstehenden Graphen.
Sie ist damit die Rückversicherung gegen den einzigen Fehler, der hier wirklich
weh täte: eine Leitung, die im Bild richtig aussieht, aber hydraulisch anders
gerechnet wird als vorher.
"""
import pytest

from app.calculations.hydraulik import berechne_schema

VL = "#ef4444"
RL = "#3b82f6"


def _basis_graph():
    """Erzeuger → Verteiler mit drei Kreisen; der Hauptstrang ist EINE Leitung.

    Bewusst dieselbe Anlage wie in `test_hydraulik.py`, damit die Zahlen dort
    nachzulesen sind. Es sind erfundene Beispielwerte, keine Projektdaten.
    """
    nodes = [
        {"id": "we", "type": "erzeuger", "data": {"label": "WE"}},
        {"id": "vt", "type": "verteiler", "data": {"label": "Verteiler", "abgaenge": 3}},
        {"id": "g1", "type": "gruppe",
         "data": {"label": "G1", "q_kw": "5", "vl_temp": "35", "rl_temp": "28", "dp_kpa": "12"}},
        {"id": "g2", "type": "gruppe",
         "data": {"label": "G2", "q_kw": "8", "vl_temp": "55", "rl_temp": "45", "dp_kpa": "20"}},
        {"id": "g3", "type": "gruppe",
         "data": {"label": "G3", "q_kw": "10", "vl_temp": "60", "rl_temp": "45", "dp_kpa": "8"}},
    ]
    edges = [
        {"id": "e_vl1", "source": "vt", "sourceHandle": "vl-1", "target": "g1", "targetHandle": "vl", "stroke": VL},
        {"id": "e_rl1", "source": "g1", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-1", "stroke": RL},
        {"id": "e_vl2", "source": "vt", "sourceHandle": "vl-2", "target": "g2", "targetHandle": "vl", "stroke": VL},
        {"id": "e_rl2", "source": "g2", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-2", "stroke": RL},
        {"id": "e_vl3", "source": "vt", "sourceHandle": "vl-3", "target": "g3", "targetHandle": "vl", "stroke": VL},
        {"id": "e_rl3", "source": "g3", "sourceHandle": "rl", "target": "vt", "targetHandle": "rl-3", "stroke": RL},
        # Der Hauptstrang — auf ihn wirken die vier Befehle im Test.
        {"id": "e_vlm", "source": "we", "sourceHandle": "vl", "target": "vt", "targetHandle": "vl-main", "stroke": VL},
        {"id": "e_rlm", "source": "vt", "sourceHandle": "rl-main", "target": "we", "targetHandle": "rl", "stroke": RL},
    ]
    return nodes, edges


def _anker(node_id):
    """Ein freier CAD-Anker, wie ihn Stutzen und Dehnen im Editor erzeugen."""
    return {"id": node_id, "type": "junction", "data": {"cad_anchor": True}}


def _vorlauf_geteilt(teile=1):
    """Hauptvorlauf in `teile + 1` Stücke zerlegt, verbunden über freie Anker.

    Genau diese Form hinterlassen Stutzen und Dehnen bis Kante. Verbinden führt
    sie wieder auf `teile = 0` zurück.
    """
    nodes, edges = _basis_graph()
    edges = [e for e in edges if e["id"] != "e_vlm"]
    knoten = ["we"] + [f"anker{i}" for i in range(1, teile + 1)] + ["vt"]
    for i in range(1, teile + 1):
        nodes.append(_anker(f"anker{i}"))
    for i in range(len(knoten) - 1):
        quelle, ziel = knoten[i], knoten[i + 1]
        edges.append({
            "id": f"e_vlm_{i}",
            "source": quelle,
            "sourceHandle": "vl" if quelle == "we" else "center-source",
            "target": ziel,
            "targetHandle": "vl-main" if ziel == "vt" else "center-target",
            "stroke": VL,
        })
    return nodes, edges


def _hauptstrang_fluss(ergebnis):
    """Massenstrom auf allen Stücken des Hauptvorlaufs."""
    return [wert for eid, wert in ergebnis["edge_flows"].items() if eid.startswith("e_vlm")]


# ── Verbinden (JOIN) und Stutzen/Dehnen (TRIM/EXTEND) ───────────────────────
# Beide Richtungen derselben Gleichwertigkeit: aus einer Leitung werden zwei,
# aus zwei wieder eine. Am gerechneten Ergebnis darf sich dabei nichts ändern.

def test_geteilter_hauptstrang_rechnet_wie_die_durchgehende_leitung():
    durchgehend = berechne_schema(*_basis_graph())
    geteilt = berechne_schema(*_vorlauf_geteilt(teile=1))

    assert geteilt["verteiler_results"]["vt"] == durchgehend["verteiler_results"]["vt"]
    assert geteilt["gruppe_results"] == durchgehend["gruppe_results"]
    # Der Fluss im Hauptstrang bleibt derselbe — und beide Stücke tragen ihn.
    erwartet = durchgehend["edge_flows"]["e_vlm"]
    fluesse = _hauptstrang_fluss(geteilt)
    assert len(fluesse) == 2
    assert all(f == pytest.approx(erwartet, abs=1e-9) for f in fluesse)


def test_mehrfach_geteilter_hauptstrang_bleibt_gleichwertig():
    """Stutzen zwischen zwei Begrenzungen hinterlässt drei Stücke."""
    durchgehend = berechne_schema(*_basis_graph())
    geteilt = berechne_schema(*_vorlauf_geteilt(teile=2))

    assert geteilt["verteiler_results"]["vt"] == durchgehend["verteiler_results"]["vt"]
    fluesse = _hauptstrang_fluss(geteilt)
    assert len(fluesse) == 3
    assert all(f == pytest.approx(durchgehend["edge_flows"]["e_vlm"], abs=1e-9) for f in fluesse)


def test_verbinden_erzeugt_keine_neue_warnung():
    """Der Anker zwischen zwei Stücken darf keine Meldung auslösen — weder als
    zusätzlicher Knoten noch als fehlender."""
    assert berechne_schema(*_vorlauf_geteilt(teile=1))["warnungen"] \
        == berechne_schema(*_basis_graph())["warnungen"]


def test_geteilte_leitung_bekommt_dieselbe_dimension():
    """Gleicher Fluss heisst gleiche DN — sonst stünde nach dem Stutzen im Plan
    plötzlich eine andere Nennweite als vorher."""
    durchgehend = berechne_schema(*_basis_graph())["leitung_results"]
    geteilt = berechne_schema(*_vorlauf_geteilt(teile=1))["leitung_results"]
    referenz = durchgehend.get("e_vlm")
    assert referenz is not None
    for eid, wert in geteilt.items():
        if eid.startswith("e_vlm"):
            assert wert == referenz


# ── Dehnen bis Kante (EXTEND) ──────────────────────────────────────────────
# Die verlängerte Leitung dockt an einer bestehenden an. Dabei entsteht ein
# echtes T-Stück: die getroffene Leitung wird geteilt und beide Hälften hängen
# am selben Knoten wie das verlängerte Ende.

def test_t_stueck_aus_dehnen_laesst_den_hauptstrang_unveraendert():
    """Die verlängerte Leitung hängt am selben Anker wie die beiden Hälften der
    getroffenen Leitung. Solange ihr anderes Ende noch frei ist, darf sie am
    Hauptstrang nichts ändern."""
    nodes, edges = _vorlauf_geteilt(teile=1)
    # Genau das Ergebnis von „Dehnen bis Kante": das verlängerte Ende sitzt auf
    # `anker1`, die getroffene Leitung ist dort in zwei Hälften geteilt.
    nodes.append(_anker("ast_ende"))
    edges.append({
        "id": "e_ast", "source": "anker1", "sourceHandle": "center-source",
        "target": "ast_ende", "targetHandle": "center-target", "stroke": VL,
    })
    ergebnis = berechne_schema(nodes, edges)
    referenz = berechne_schema(*_basis_graph())

    fluesse = _hauptstrang_fluss(ergebnis)
    assert len(fluesse) == 2
    assert all(f == pytest.approx(referenz["edge_flows"]["e_vlm"], abs=1e-9) for f in fluesse)
    assert ergebnis["verteiler_results"]["vt"] == referenz["verteiler_results"]["vt"]
    assert ergebnis["warnungen"] == referenz["warnungen"]


# ── Versatz (OFFSET) ───────────────────────────────────────────────────────
# Die Kopie ist eine eigenständige, zunächst freistehende Leitung mit zwei
# Ankern. Sie darf die bestehende Anlage nicht beeinflussen.

def test_versatz_kopie_laesst_die_bestehende_berechnung_unveraendert():
    vorher = berechne_schema(*_basis_graph())

    nodes, edges = _basis_graph()
    nodes += [_anker("kopie_a"), _anker("kopie_b")]
    edges.append({
        "id": "e_versatz", "source": "kopie_a", "sourceHandle": "center-source",
        "target": "kopie_b", "targetHandle": "center-target", "stroke": RL,
    })
    nachher = berechne_schema(nodes, edges)

    assert nachher["verteiler_results"] == vorher["verteiler_results"]
    assert nachher["gruppe_results"] == vorher["gruppe_results"]
    assert nachher["warnungen"] == vorher["warnungen"]
    # Die bestehenden Leitungen behalten Fluss und Dimension.
    for eid, wert in vorher["edge_flows"].items():
        assert nachher["edge_flows"][eid] == pytest.approx(wert, abs=1e-9)


def test_versatz_kopie_traegt_noch_keinen_fluss():
    """Eine freistehende Kopie ist noch an nichts angeschlossen. Sie darf darum
    keinen Volumenstrom erfinden — erst das Anschliessen macht sie wirksam."""
    nodes, edges = _basis_graph()
    nodes += [_anker("kopie_a"), _anker("kopie_b")]
    edges.append({
        "id": "e_versatz", "source": "kopie_a", "sourceHandle": "center-source",
        "target": "kopie_b", "targetHandle": "center-target", "stroke": RL,
    })
    ergebnis = berechne_schema(nodes, edges)
    assert not ergebnis["edge_flows"].get("e_versatz")
