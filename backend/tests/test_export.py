"""PDF-Export + Schema-SVG — Zahlen im Dokument müssen stimmen (Abnahme F4)."""
import io

import pytest
from pypdf import PdfReader

from app.calculations.hydraulik import berechne_schema
from app.export.pdf import berechnungs_abschnitte, erzeuge_pdf, legende_zeilen
from app.export.schema_svg import erzeuge_svg, handle_pos, vt_hoehe, vt_stutzen_x

VL = "#ef4444"
RL = "#3b82f6"


def _graph():
    """3 Parallelkreise am Verteiler (wie test_hydraulik) — mit Positionen + Nr."""
    nodes = [
        {"id": "we", "type": "erzeuger", "position": {"x": 0, "y": 300}, "data": {"label": "WE", "nr": 5}},
        {"id": "vt", "type": "verteiler", "position": {"x": 200, "y": 150}, "data": {"label": "Verteiler", "abgaenge": 3, "nr": 4}},
        {"id": "g1", "type": "gruppe", "position": {"x": 330, "y": 186}, "data": {"label": "G1 FBH", "q_kw": "5", "vl_temp": "35", "rl_temp": "28", "dp_kpa": "12", "nr": 1}},
        {"id": "g2", "type": "gruppe", "position": {"x": 500, "y": 186}, "data": {"label": "G2 HK", "q_kw": "8", "vl_temp": "55", "rl_temp": "45", "dp_kpa": "20", "nr": 2}},
        {"id": "g3", "type": "gruppe", "position": {"x": 670, "y": 186}, "data": {"label": "G3 LE", "q_kw": "10", "vl_temp": "60", "rl_temp": "45", "dp_kpa": "8", "nr": 3}},
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


@pytest.fixture(scope="module")
def daten():
    nodes, edges = _graph()
    return nodes, edges, berechne_schema(nodes, edges)


# ── SVG ──────────────────────────────────────────────────────────────────────
def test_svg_enthaelt_verteiler_summen(daten):
    nodes, edges, results = daten
    svg = erzeuge_svg(nodes, edges, results)
    assert svg.startswith("<svg")
    assert "VL 60.0 °C" in svg          # höchste Gruppen-VL
    assert "RL 43.0" in svg             # Misch-Rücklauf
    assert "23.00 kW" in svg            # Σ Leistung
    assert "1.166 m³/h" in svg          # Σ Primärfluss
    assert "Δp Ast 2: 20.0 kPa" in svg  # ungünstigster Ast


def test_svg_strang_und_einspritz(daten):
    nodes, edges, results = daten
    svg = erzeuge_svg(nodes, edges, results)
    assert "G1 FBH" in svg
    # G1 spritzt ein → Bypass sichtbar, m' sekundär in kg/h (0.6142 m³/h → 614 kg/h)
    assert "Bypass" in svg
    assert "614 kg/h" in svg
    # Primärfluss am Strangkopf (0.1344 m³/h → 134 kg/h)
    assert "134 kg/h" in svg


def test_handle_positionen():
    nodes, _ = _graph()
    vt = nodes[1]
    # Standard-Lücke 560 → Gesamthöhe 612; data.hoehe überschreibt (460–1200)
    assert vt_hoehe(vt) == 612
    assert vt_hoehe({"data": {"hoehe": 700}}) == 752
    assert vt_hoehe({"data": {"hoehe": 100}}) == 512   # unter Minimum → geklemmt
    # vl-main links auf halber Balkenhöhe, vl-1 unten am VL-Balken
    assert handle_pos(vt, "vl-main") == (200, 150 + 13)
    x1, y1 = handle_pos(vt, "vl-1")
    assert x1 == 200 + vt_stutzen_x(1) and y1 == 150 + 26
    # rl-1 oben am RL-Balken (Höhe dynamisch)
    _, y_rl = handle_pos(vt, "rl-1")
    assert y_rl == 150 + vt_hoehe(vt) - 26
    # Gruppe: VL oben Mitte, RL unten Mitte
    g1 = nodes[2]
    assert handle_pos(g1, "vl") == (330 + 75, 186)
    assert handle_pos(g1, "rl") == (330 + 75, 186 + 400)


def test_svg_uebernimmt_cad_stuetzpunkte_und_medien_layer():
    nodes = [
        {"id": "a", "type": "erzeuger", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "b", "type": "erzeuger", "position": {"x": 300, "y": 0}, "data": {}},
    ]
    edges = [{
        "id": "k_rl", "source": "a", "sourceHandle": "vl", "target": "b", "targetHandle": "vl",
        "style": {"stroke": "#0e7490"},
        "data": {"layer_id": "kaelte_rl", "corner_radius": 12, "points": [{"x": -300, "y": 200}, {"x": 200, "y": 200}]},
    }]
    svg = erzeuge_svg(nodes, edges, {})
    assert "Q -300 200" in svg
    assert "Q 200 200" in svg
    assert 'stroke="#0e7490"' in svg
    assert 'stroke-dasharray="10,7"' in svg
    # Ein Stützpunkt ausserhalb der Bauteile muss den PDF/SVG-Ausschnitt erweitern.
    assert 'viewBox="-350.0' in svg


def test_svg_cad_anker_sind_unsichtbar_und_polylinie_startet_exakt_am_punkt():
    nodes = [
        {"id": "frei_a", "type": "junction", "position": {"x": 40, "y": 60}, "data": {"cad_anchor": True}},
        {"id": "frei_b", "type": "junction", "position": {"x": 240, "y": 160}, "data": {"cad_anchor": True}},
    ]
    edges = [{
        "id": "cad", "source": "frei_a", "sourceHandle": "center-source",
        "target": "frei_b", "targetHandle": "center-target",
        "style": {"stroke": VL},
        "data": {"layer_id": "heizung_vl", "cad_polyline": True, "points": []},
    }]
    svg = erzeuge_svg(nodes, edges, {})
    assert handle_pos(nodes[0], "center-source") == (40, 60)
    assert 'd="M 40 60 L 240 160"' in svg
    # Alte Junction-Bauteile zeichneten ein schwarzes T-Symbol. CAD-Anker
    # gehören nur zur Topologie und dürfen im Export nicht auftauchen.
    assert 'stroke="#1e293b" stroke-width="6"' not in svg


# ── Legende + Berechnungen ──────────────────────────────────────────────────
def test_legende(daten):
    nodes, edges, results = daten
    zeilen = legende_zeilen(nodes, results)
    assert [z["nr"] for z in zeilen] == [1, 2, 3, 4, 5]  # sortiert nach Nr
    g1 = zeilen[0]
    assert "Einspritz" in g1["werte"] and "0.134" in g1["werte"]
    vt = zeilen[3]
    assert "Δp Ast 2" in vt["werte"]


def test_berechnungs_abschnitte(daten):
    nodes, edges, results = daten
    abschnitte = berechnungs_abschnitte(nodes, results)
    g1 = next(a for a in abschnitte if a["bezeichnung"] == "G1 FBH")
    namen = [r[0] for r in g1["resultate"]]
    assert "V' primär (Verteilerseite)" in namen
    assert ("Einspritzung", "ja", "") in g1["resultate"]
    vt = next(a for a in abschnitte if a["titel"] == "Verteiler")
    assert any("ungünstigster Ast" in r[0] and r[1] == "20.0" for r in vt["resultate"])


# ── PDF (öffnen + Zahlen prüfen) ────────────────────────────────────────────
def test_pdf_beides_zahlen(daten):
    nodes, edges, results = daten
    pdf = erzeuge_pdf("Testprojekt", "Testschema", "beides", nodes, edges, results)
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 4  # Deckblatt + Schema + Legende + Berechnungen
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Testprojekt" in text
    assert "SIREGO" in text
    # Zahlen aus der Physik landen im Dokument
    assert "43.0" in text      # RL Misch
    assert "23.00" in text     # Σ kW
    assert "1.166" in text     # Σ m³/h (auf 3 Dezimalen)
    assert "20.0" in text      # Δp ungünstigster Ast


def test_pdf_nur_schema_und_nur_berechnungen(daten):
    nodes, edges, results = daten
    nur_schema = PdfReader(io.BytesIO(erzeuge_pdf("P", "S", "schema", nodes, edges, results)))
    nur_berech = PdfReader(io.BytesIO(erzeuge_pdf("P", "S", "berechnungen", nodes, edges, results)))
    text_schema = "\n".join(p.extract_text() or "" for p in nur_schema.pages)
    text_berech = "\n".join(p.extract_text() or "" for p in nur_berech.pages)
    assert "Legende" in text_schema and "Berechnungen —" not in text_schema
    assert "Berechnungen —" in text_berech and "Legende" not in text_berech


# ── Leitungsdimensionierung im SVG (PHYSIK §10) ─────────────────────────────
def test_svg_zeigt_automatische_dn(daten):
    nodes, edges, results = daten
    svg = erzeuge_svg(nodes, edges, results)
    # e_vlm/e_rlm tragen 1.1662 m³/h = 1166.2 kg/h → DN32 (DN25 reicht bei 70 Pa/m nicht)
    # Neues Label-Format: DN gross oben, Massenstrom m' in kg/h darunter (Pa/m nur im Klick-Panel)
    assert "DN32" in svg
    assert "1'166 kg/h" in svg


# ── Anschluss-Marker (PHYSIK §9) ─────────────────────────────────────────────
def test_anschluss_in_legende_und_pdf():
    nodes = [
        {"id": "hk", "type": "heizkreis", "position": {"x": 0, "y": 0}, "data": {"q_kw": "5", "vl_temp": "35", "rl_temp": "28"}},
        {"id": "a1", "type": "anschluss", "position": {"x": 100, "y": 0}, "data": {"buchstabe": "A"}},
    ]
    edges = [{"id": "e1", "source": "hk", "target": "a1", "stroke": VL}]
    results = berechne_schema(nodes, edges)
    zeilen = legende_zeilen(nodes, results)
    a_zeile = next(z for z in zeilen if z["bauteil"] == "Anschluss-Marker")
    assert "Buchstabe A" in a_zeile["werte"]

    pdf = erzeuge_pdf("P", "S", "beides", nodes, edges, results)
    reader = PdfReader(io.BytesIO(pdf))
    text = "\n".join(p.extract_text() or "" for p in reader.pages)
    assert "kein Gegenstück gefunden" in text


# ── Drehung um 90° (data.rotation) ──────────────────────────────────────────
def test_drehung_dreht_anschluss_und_symbol():
    from app.export.schema_svg import node_groesse
    node = {"id": "kh", "type": "shutoff", "position": {"x": 100, "y": 100}, "data": {"rotation": 90}}
    w, h = node_groesse(node)
    cx, cy = 100 + w / 2, 100 + h / 2
    # ungedreht sitzt «top» mittig oben …
    assert handle_pos({**node, "data": {}}, "top") == (cx, 100)
    # … nach 90° im Uhrzeigersinn wandert er auf die rechte Seite (halbe Höhe)
    assert handle_pos(node, "top") == (cx + (cy - 100), cy)
    # und das SVG dreht nur das Symbol (rotate-Transform vorhanden)
    assert "rotate(90" in erzeuge_svg([node], [], {})


# ── Anschluss «für separate Gruppe» direkt an der Verbrauchergruppe (§9) ─────
def test_gruppe_anschluss_koppelt_und_zeichnet():
    from app.calculations.hydraulik import _anschluss_gruppen, _anschluss_warnungen
    g = {"id": "g", "type": "gruppe", "position": {"x": 0, "y": 0},
         "data": {"q_kw": "5", "vl_temp": "35", "rl_temp": "28", "hat_anschluss": True, "anschluss_buchstabe": "A"}}
    m = {"id": "m", "type": "anschluss", "position": {"x": 300, "y": 0}, "data": {"buchstabe": "A"}}
    assert _anschluss_gruppen([g, m])["A"] == ["g", "m"]   # Gruppe zählt als Marker
    assert _anschluss_warnungen([g, m]) == []              # Gegenstück gefunden → keine Warnung
    assert _anschluss_warnungen([g])                       # allein → Warnung
    svg = erzeuge_svg([g], [], berechne_schema([g], []))
    assert ">A</text>" in svg                              # Buchstabe an der Gruppe gezeichnet


def test_gruppen_anschluss_uebertraegt_fluss_und_kennwerte():
    # Gruppe mit Häkchen, aber Buchstabe NICHT getippt (UI-Default 'A') → muss trotzdem koppeln
    nodes = [
        {"id": "g", "type": "gruppe", "position": {"x": 0, "y": 0},
         "data": {"q_kw": "10", "vl_temp": "60", "rl_temp": "45", "hat_anschluss": True}},
        {"id": "m", "type": "anschluss", "position": {"x": 300, "y": 0}, "data": {"buchstabe": "A"}},
        {"id": "le", "type": "heizkreis", "position": {"x": 500, "y": 0}, "data": {"q_kw": "0"}},
    ]
    edges = [{"id": "e_out", "source": "m", "sourceHandle": "vl", "target": "le", "targetHandle": "vl", "stroke": VL}]
    r = berechne_schema(nodes, edges)
    m_sek = 10 / (1.163 * 15)                                   # ≈ 0.573 m³/h
    assert r["node_flows"]["m"] == pytest.approx(m_sek, abs=1e-3)     # Marker trägt Gruppenfluss
    assert r["edge_flows"]["e_out"] == pytest.approx(m_sek, abs=1e-3)  # Leitung ab Marker dimensioniert
    ar = r["anschluss_results"]["m"]
    assert ar["q_kw"] == 10 and ar["vl"] == 60 and ar["rl"] == 45      # Leistung + VL/RL übertragen
    assert not any("kein Gegenstück" in w for w in r["anschluss_warnings"])  # Default 'A' koppelt


def test_gruppen_anschluss_uebertraegt_fluss():
    # Gruppe (Anschluss A) → separater Marker A → Leitung auf einen Lufterhitzer.
    # Die Leitung ab dem Marker muss die Wassermenge der Gruppe tragen.
    nodes = [
        {"id": "g", "type": "gruppe", "position": {"x": 0, "y": 0},
         "data": {"q_kw": "5", "vl_temp": "35", "rl_temp": "28", "hat_anschluss": True, "anschluss_buchstabe": "A"}},
        {"id": "m", "type": "anschluss", "position": {"x": 400, "y": 0}, "data": {"buchstabe": "A"}},
        {"id": "lh", "type": "verbraucher", "position": {"x": 520, "y": 0}, "data": {"label": "Lufterhitzer"}},
    ]
    edges = [{"id": "e_lh", "source": "m", "target": "lh", "stroke": VL}]
    r = berechne_schema(nodes, edges)
    m_sek = r["gruppe_results"]["g"]["m_sek"]               # 5/(1.163·7) = 0.6142 m³/h
    assert m_sek == pytest.approx(0.6142, abs=0.001)
    assert r["node_flows"]["m"] == pytest.approx(m_sek, abs=0.001)   # Marker trägt den Fluss
    assert r["edge_flows"]["e_lh"] == pytest.approx(m_sek, abs=0.001)  # Leitung ab Marker auch
    assert not any("kein Gegenstück" in w for w in r["anschluss_warnings"])
