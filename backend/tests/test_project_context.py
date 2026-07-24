"""P1 — Projekt als zentrale Datenstruktur (One Source of Truth).

Diese Tests sichern ab, dass jede Projekttatsache genau EINMAL existiert und
die Kostenschätzung sie aus dem Projekt liest statt neu abzufragen. Aufgebaut
in denselben Scheiben wie der Umsetzungsplan:

  Schritt 1 — zentrale Projektgrunddaten (Quelle A / project_value)
  Schritt 2 — Mengen live aus dem Schema (Quelle B / schema_value)
  Schritt 4 — Herkunftsmodell §6 (external_value / manual_override)
  Schritt 3 — ProjectContext führt alles zu effective_value zusammen
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401 — registriert hc_users (FK-Ziel) vor create_all
from app.models.heizungscockpit import (
    HcProject,
    HcProjectBaseData,
    HcProjectParameter,
    HcSchema,
)
from app.schemas.hc_schemas import ProjectBaseDataOut
from app.calculations.schema_mengen import mengen_aus_schema


def _frische_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return engine, Session()


# ── Schritt 1 — Projektgrunddaten zentral ──────────────────────────────────

def test_grunddaten_leben_am_projekt():
    """EBF, Nutzungseinheiten, Projektart, Region und Zertifizierung werden am
    Projekt gespeichert — nicht mehr nur ins Kostenformular getippt."""
    engine, db = _frische_db()
    p = HcProject(tenant_id=1, erstellt_von=1, name="MFH Musterstrasse")
    db.add(p)
    db.flush()
    db.add(HcProjectBaseData(
        tenant_id=1, project_id=p.id,
        ebf_m2=1420.0, anzahl_nutzungseinheiten=10,
        projektart="Neubau", region="Zürich", zertifizierung="Minergie",
    ))
    db.commit()

    bd = db.query(HcProjectBaseData).filter_by(project_id=p.id).first()
    assert bd.ebf_m2 == 1420.0
    assert bd.anzahl_nutzungseinheiten == 10
    assert bd.projektart == "Neubau"
    assert bd.region == "Zürich"
    assert bd.zertifizierung == "Minergie"


def test_grunddaten_im_out_schema():
    """Die neuen Grunddaten kommen über die Detailsicht auch beim Client an."""
    for feld in ("ebf_m2", "anzahl_nutzungseinheiten", "projektart", "region", "zertifizierung"):
        assert feld in ProjectBaseDataOut.model_fields

    out = ProjectBaseDataOut.model_validate({
        "t_aussen": -8.0, "t_innen": 20.0, "heizungssystem": "gemischt",
        "warmwasser_bedarf_kw": None, "ebf_m2": 1420.0,
        "anzahl_nutzungseinheiten": 10, "projektart": "Neubau",
        "region": "Zürich", "zertifizierung": None,
    })
    assert out.ebf_m2 == 1420.0
    assert out.anzahl_nutzungseinheiten == 10
    assert out.projektart == "Neubau"


# ── Schritt 2 — Mengen live aus dem Schema ──────────────────────────────────

def _n(nid, typ, data=None):
    return {"id": nid, "type": typ, "data": data or {}}


def test_leerer_graph_liefert_nichts():
    """Ohne Bauteile weiss das Schema nichts — kein geratenes 0."""
    assert mengen_aus_schema("") == {}
    assert mengen_aus_schema("{}") == {}
    assert mengen_aus_schema({"nodes": []}) == {}


def test_zaehlt_eigenstaendige_bauteile():
    graph = {"nodes": [
        _n("e1", "erzeuger"),
        _n("sp1", "speicher"), _n("bw1", "bww"),
        _n("vt1", "verteiler"),
        _n("p1", "pump"), _n("p2", "pump"),
        _n("v2a", "valve2"),
        _n("v3a", "valve3"),
        _n("wz1", "waermezaehler"), _n("wz2", "waermezaehler"),
    ]}
    m = mengen_aus_schema(graph)
    assert m["anzahl_erzeuger"] == 1
    assert m["anzahl_speicher"] == 2          # speicher + bww
    assert m["anzahl_verteiler"] == 1
    assert m["anzahl_pumpen"] == 2
    assert m["anzahl_ventile_2weg"] == 1
    assert m["anzahl_ventile_3weg"] == 1
    assert m["anzahl_waermezaehler"] == 2
    assert "leistung_kw" not in m             # keine Gruppe → Leistung unbekannt


def test_gruppen_default_pumpe_und_ventiltyp():
    """Ventiltyp je Schaltung (Vorgabe Dominic): Einspritz + Drossel → 2-Weg,
    nur Beimisch → 3-Weg. Drosselgruppe hat zudem keine Pumpe."""
    graph = {"nodes": [
        _n("g1", "gruppe", {"q_kw": "20"}),                      # Default einspritz → 2-Weg
        _n("g2", "gruppe", {"q_kw": "10", "schaltung": "drossel"}),  # Drossel → 2-Weg, keine Pumpe
        _n("g3", "gruppe", {"q_kw": "5", "hat_pumpe": False, "schaltung": "beimisch"}),  # Beimisch → 3-Weg
    ]}
    m = mengen_aus_schema(graph)
    assert m["anzahl_heizgruppen"] == 3
    # g1 Pumpe + g2 keine (drossel) + g3 keine (abgewählt) = 1
    assert m["anzahl_pumpen"] == 1
    # g1 einspritz→2-Weg, g2 drossel→2-Weg = 2 ; g3 beimisch→3-Weg = 1
    assert m["anzahl_ventile_2weg"] == 2
    assert m["anzahl_ventile_3weg"] == 1
    assert m["leistung_kw"] == 35.0           # 20 + 10 + 5


def test_waermezaehler_nur_bei_explizitem_flag():
    """hat_wz zählt nur wenn ausdrücklich True — kein stiller Default."""
    graph = {"nodes": [
        _n("g1", "gruppe", {"q_kw": "20", "hat_wz": True}),
        _n("g2", "gruppe", {"q_kw": "20"}),                 # None → kein WZ
        _n("g3", "gruppe", {"q_kw": "20", "hat_wz": False}),
        _n("wz1", "waermezaehler"),                          # eigenständiger WZ
    ]}
    m = mengen_aus_schema(graph)
    assert m["anzahl_waermezaehler"] == 2     # g1 + wz1


# ── Schritt 3+4 — ProjectContext führt die vier Quellen zusammen ─────────────

from types import SimpleNamespace

from app.project_context import (
    build_context,
    effective_map,
    vorbelegung_aus_context,
    STATUS_BEKANNT,
    STATUS_ERKANNT,
    STATUS_ERGAENZUNG,
    STATUS_UNBEKANNT,
)


def _param(context, key):
    return next(p for p in context["parameter"] if p["key"] == key)


def _wz_graph(schema_wz=3):
    return {"nodes": [_n(f"wz{i}", "waermezaehler") for i in range(schema_wz)]
            + [_n("g1", "gruppe", {"q_kw": "20"})]}


def test_waermezaehler_schema_plus_ergaenzung_ist_13():
    """Der Kern aus §3/§6: 3 aus Schema + 10 ergänzt = 13, Status bekannt."""
    rows = [SimpleNamespace(param_key="anzahl_waermezaehler", external_value="10",
                            manual_override=None, confidence="mittel",
                            quelle_notiz="Grundriss", updated_by_name="Dominic")]
    ctx = build_context(base_data=None, graph_json=_wz_graph(3), parameter_rows=rows)
    wz = _param(ctx, "anzahl_waermezaehler")
    assert wz["schema_value"] == 3
    assert wz["external_value"] == 10
    assert wz["effective_value"] == 13
    assert wz["source"] == "schema+extern"
    assert wz["status"] == STATUS_BEKANNT


def test_waermezaehler_ohne_ergaenzung_verlangt_ergaenzung():
    """Nur Schema, keine Gebäudeangabe → Status ergänzung_erforderlich (§7 fragt nach)."""
    ctx = build_context(base_data=None, graph_json=_wz_graph(3), parameter_rows=[])
    wz = _param(ctx, "anzahl_waermezaehler")
    assert wz["effective_value"] == 3
    assert wz["status"] == STATUS_ERGAENZUNG


def test_manual_override_gewinnt():
    rows = [SimpleNamespace(param_key="anzahl_waermezaehler", external_value="10",
                            manual_override="20", confidence=None,
                            quelle_notiz=None, updated_by_name="Dominic")]
    ctx = build_context(base_data=None, graph_json=_wz_graph(3), parameter_rows=rows)
    wz = _param(ctx, "anzahl_waermezaehler")
    assert wz["effective_value"] == 20
    assert wz["source"] == "manuell"
    assert wz["status"] == STATUS_BEKANNT


def test_schema_wert_ist_erkannt_projekt_wert_ist_bekannt():
    base = SimpleNamespace(ebf_m2=1420.0, anzahl_nutzungseinheiten=10,
                           gebaeudekategorie="MFH", projektart="Neubau",
                           region="Zürich", zertifizierung=None)
    graph = {"nodes": [_n("g1", "gruppe", {"q_kw": "20"}), _n("p1", "pump")]}
    ctx = build_context(base_data=base, graph_json=graph, parameter_rows=[])
    # Projektwert
    ebf = _param(ctx, "ebf_m2")
    assert ebf["effective_value"] == 1420.0
    assert ebf["source"] == "projekt"
    assert ebf["status"] == STATUS_BEKANNT
    # Schemawert (nicht ergänzbar) → erkannt
    pumpen = _param(ctx, "anzahl_pumpen")
    assert pumpen["effective_value"] == 2      # g1-Default-Pumpe + standalone p1
    assert pumpen["source"] == "schema"
    assert pumpen["status"] == STATUS_ERKANNT


def test_unbekannter_wert_blockiert_nicht():
    """Bohrmeter kennt weder Schema noch Projekt → unbekannt, aber Kontext baut (§25)."""
    ctx = build_context(base_data=None, graph_json={"nodes": []}, parameter_rows=[])
    bohr = _param(ctx, "bohrmeter")
    assert bohr["effective_value"] is None
    assert bohr["status"] == STATUS_UNBEKANNT
    # effective_map liefert trotzdem einen vollständigen Datensatz (COST_INPUT)
    m = effective_map(ctx)
    assert "bohrmeter" in m and m["bohrmeter"] is None
    assert set(p["key"] for p in ctx["parameter"]) == set(m.keys())


def test_zusammenfassung_zaehlt_status():
    ctx = build_context(base_data=None, graph_json=_wz_graph(3), parameter_rows=[])
    z = ctx["zusammenfassung"]
    assert z["anzahl_parameter"] == len(ctx["parameter"])
    summe = z["bekannt"] + z["erkannt"] + z["ergaenzung_erforderlich"] + z["unbekannt"]
    assert summe == z["anzahl_parameter"]


def test_persistenz_roundtrip_mit_echten_orm_zeilen():
    """Base-Data + Schema + gespeicherte Ergänzung → build_context erzeugt 13.
    Deckt Spaltennamen (HcProjectParameter) und die Modell↔Assembler-Kopplung ab."""
    engine, db = _frische_db()
    p = HcProject(tenant_id=1, erstellt_von=1, name="MFH")
    db.add(p)
    db.flush()
    db.add(HcProjectBaseData(tenant_id=1, project_id=p.id, ebf_m2=1420.0,
                             anzahl_nutzungseinheiten=10, projektart="Neubau"))
    db.add(HcSchema(tenant_id=1, project_id=p.id, name="S",
                    graph_json='{"nodes":[{"id":"wz1","type":"waermezaehler","data":{}},'
                               '{"id":"wz2","type":"waermezaehler","data":{}},'
                               '{"id":"wz3","type":"waermezaehler","data":{}}]}'))
    db.add(HcProjectParameter(tenant_id=1, project_id=p.id,
                              param_key="anzahl_waermezaehler", external_value="10",
                              quelle_notiz="Grundriss", updated_by=1, updated_by_name="Dominic"))
    db.commit()

    base = db.query(HcProjectBaseData).filter_by(project_id=p.id).first()
    schema = db.query(HcSchema).filter_by(project_id=p.id).first()
    rows = db.query(HcProjectParameter).filter_by(project_id=p.id).all()

    ctx = build_context(base, schema.graph_json, rows)
    wz = _param(ctx, "anzahl_waermezaehler")
    assert wz["effective_value"] == 13
    assert wz["source"] == "schema+extern"
    assert wz["updated_by_name"] == "Dominic"
    assert _param(ctx, "ebf_m2")["effective_value"] == 1420.0


# ── Schritt 5 — Vorbelegung der Kostenschätzung aus dem Context ──────────────

def test_vorbelegung_uebersetzt_bekannte_werte():
    """Kostenschätzung bekommt EBF/Leistung/Nutzung usw. aus dem Projekt — nicht
    mehr neu getippt. Unbekanntes fehlt bewusst (kein geratener Default)."""
    base = SimpleNamespace(ebf_m2=1420.0, anzahl_nutzungseinheiten=10,
                           gebaeudekategorie="MFH", projektart="Neubau",
                           region="Zürich", zertifizierung=None)
    graph = {"nodes": [_n("g1", "gruppe", {"q_kw": "72"})]}
    vb = vorbelegung_aus_context(build_context(base, graph, []))
    assert vb["ebf_m2"] == 1420.0
    assert vb["anzahl_ne"] == 10          # umbenannt auf das SchaetzungIn-Feld
    assert vb["nutzung"] == "MFH"
    assert vb["projektart"] == "Neubau"
    assert vb["leistung_kw"] == 72.0
    # Bohrmeter unbekannt → NICHT in der Vorbelegung (blockiert nicht, §25)
    assert "bohrmeter" not in vb


# ── §4 — strukturierter Erzeugertyp aus dem Schema ──────────────────────────

def test_generator_type_strukturiert_gewinnt():
    """Strukturierter generator_type ist die Primärquelle (§4)."""
    graph = {"nodes": [_n("e1", "erzeuger", {"generator_type": "ews_wp", "typ": "irgendwas"})]}
    m = mengen_aus_schema(graph)
    assert m["generator_type"] == "ews_wp"


def test_generator_type_freitext_nur_fallback():
    """Ohne strukturierten Typ wird der frühere Freitext schwach normalisiert."""
    assert mengen_aus_schema({"nodes": [_n("e", "erzeuger", {"typ": "Sole/Wasser-Wärmepumpe"})]})["generator_type"] == "ews_wp"
    assert mengen_aus_schema({"nodes": [_n("e", "erzeuger", {"typ": "Fernwärme"})]})["generator_type"] == "fernwaerme"
    # Unbekannter Freitext → gar kein Typ (nicht raten, §3)
    assert "generator_type" not in mengen_aus_schema({"nodes": [_n("e", "erzeuger", {"typ": "???"})]})


def test_erdsonden_zaehlt_tatsaechliche_sonden():
    """§11: Ein Feld mit 4 Sonden zählt als 4, nicht als 1."""
    graph = {"nodes": [_n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180})]}
    assert mengen_aus_schema(graph)["anzahl_erdsonden"] == 4
    # Mehrere Felder werden summiert.
    graph2 = {"nodes": [
        _n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180}),
        _n("es2", "erdsonden", {"sonden_anzahl": 2, "sonden_laenge_m": 150}),
    ]}
    assert mengen_aus_schema(graph2)["anzahl_erdsonden"] == 6
    # Feld ohne Sondenangabe zählt als mindestens eine Sonde (nicht 0).
    assert mengen_aus_schema({"nodes": [_n("es", "erdsonden", {})]})["anzahl_erdsonden"] == 1


def test_generator_type_merge_mehrere_erzeuger():
    """§11: gleicher Typ bleibt, verschiedene Familien werden hybrid."""
    zwei_ews = {"nodes": [
        _n("e1", "erzeuger", {"generator_type": "ews_wp"}),
        _n("e2", "erzeuger", {"generator_type": "ews_wp"}),
    ]}
    assert mengen_aus_schema(zwei_ews)["generator_type"] == "ews_wp"
    ews_plus_gas = {"nodes": [
        _n("e1", "erzeuger", {"generator_type": "ews_wp"}),
        _n("e2", "erzeuger", {"generator_type": "gas"}),
    ]}
    assert mengen_aus_schema(ews_plus_gas)["generator_type"] == "hybrid"


def test_schemawert_override_prioritaet():
    """§11: Bei echten Schemawerten gilt manual_override → schema → extern."""
    graph = {"nodes": [_n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180})]}  # schema 720 m
    # Schema schlägt eine externe Ergänzung (Schema ist die primäre Quelle).
    ext_row = [SimpleNamespace(param_key="bohrmeter", external_value="600",
                              manual_override=None, confidence=None, quelle_notiz=None,
                              updated_by_name=None)]
    ctx = build_context(base_data=None, graph_json=graph, parameter_rows=ext_row)
    bohr = _param(ctx, "bohrmeter")
    assert bohr["effective_value"] == 720.0
    assert bohr["source"] == "schema"
    # Override gewinnt immer.
    ovr_row = [SimpleNamespace(param_key="bohrmeter", external_value="600",
                              manual_override="800", confidence=None, quelle_notiz="Bohrprotokoll",
                              updated_by_name="Dominic")]
    ctx2 = build_context(base_data=None, graph_json=graph, parameter_rows=ovr_row)
    bohr2 = _param(ctx2, "bohrmeter")
    assert bohr2["effective_value"] == 800.0
    assert bohr2["source"] == "manuell"
    # Ohne Schemawert dient die externe Ergänzung als Fallback.
    ctx3 = build_context(base_data=None, graph_json={"nodes": []}, parameter_rows=ext_row)
    assert _param(ctx3, "bohrmeter")["effective_value"] == 600.0
    assert _param(ctx3, "bohrmeter")["source"] == "extern"


def test_generator_type_landet_im_context():
    graph = {"nodes": [_n("e1", "erzeuger", {"generator_type": "ews_wp", "leistung_kw": "82"})]}
    ctx = build_context(base_data=None, graph_json=graph, parameter_rows=[])
    gt = _param(ctx, "generator_type")
    assert gt["effective_value"] == "ews_wp"
    assert gt["source"] == "schema"
    assert gt["status"] == STATUS_ERKANNT


# ── §5 — Erzeuger- und Verbraucherleistung trennen ──────────────────────────

def test_erzeuger_und_verbraucherleistung_getrennt():
    """WP = 82 kW installiert, Verbrauchergruppen = 70 kW — nicht vermischen."""
    graph = {"nodes": [
        _n("e1", "erzeuger", {"leistung_kw": "82"}),
        _n("g1", "gruppe", {"q_kw": "40"}),
        _n("g2", "gruppe", {"q_kw": "30"}),
    ]}
    m = mengen_aus_schema(graph)
    assert m["generator_power_kw"] == 82.0
    assert m["consumer_power_kw"] == 70.0
    assert m["leistung_kw"] == 70.0        # Bestandsname = Verbraucherleistung
    ctx = build_context(base_data=None, graph_json=graph, parameter_rows=[])
    assert _param(ctx, "generator_power_kw")["effective_value"] == 82.0
    assert _param(ctx, "leistung_kw")["effective_value"] == 70.0


# ── §6 — Erdsonden → Bohrmeter live aus dem Schema ──────────────────────────

def test_bohrmeter_aus_erdsonden_abgeleitet():
    """4 Sonden × 180 m → 720 Bohrmeter, direkt aus dem Schema (§6)."""
    graph = {"nodes": [_n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": "180"})]}
    assert mengen_aus_schema(graph)["bohrmeter"] == 720.0
    ctx = build_context(base_data=None, graph_json=graph, parameter_rows=[])
    bohr = _param(ctx, "bohrmeter")
    assert bohr["schema_value"] == 720.0
    assert bohr["effective_value"] == 720.0
    assert bohr["source"] == "schema"


def test_bohrmeter_strukturierte_felder_bevorzugt():
    graph = {"nodes": [_n("es1", "erdsonden", {"probe_count": 5, "probe_depth_m": 200,
                                               "sonden_anzahl": 4, "sonden_laenge_m": 180})]}
    assert mengen_aus_schema(graph)["bohrmeter"] == 1000.0


def test_bohrmeter_mehrere_felder_summiert():
    graph = {"nodes": [
        _n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180}),
        _n("es2", "erdsonden", {"sonden_anzahl": 2, "sonden_laenge_m": 150}),
    ]}
    assert mengen_aus_schema(graph)["bohrmeter"] == 720.0 + 300.0


def test_bohrmeter_unvollstaendig_bleibt_unbekannt():
    """Nur Anzahl ohne Länge → kein geratenes 0, Grösse bleibt unbekannt (§25)."""
    graph = {"nodes": [_n("es1", "erdsonden", {"sonden_anzahl": 4})]}
    assert "bohrmeter" not in mengen_aus_schema(graph)


# ── §7 — Speichervolumen live aus dem Schema ────────────────────────────────

def test_speichervolumen_summiert():
    """2 × 750 l → 1'500 l total (§7)."""
    graph = {"nodes": [
        _n("sp1", "speicher", {"speicher_liter": "750"}),
        _n("sp2", "speicher", {"speicher_liter": "750"}),
    ]}
    m = mengen_aus_schema(graph)
    assert m["anzahl_speicher"] == 2
    assert m["speichervolumen_l"] == 1500.0
    ctx = build_context(base_data=None, graph_json=graph, parameter_rows=[])
    assert _param(ctx, "speichervolumen_l")["effective_value"] == 1500.0


def test_speichervolumen_strukturiert_bevorzugt():
    graph = {"nodes": [_n("sp1", "speicher", {"storage_volume_l": 1000, "speicher_liter": 750})]}
    assert mengen_aus_schema(graph)["speichervolumen_l"] == 1000.0


def test_speicher_ohne_volumen_bleibt_unbekannt():
    graph = {"nodes": [_n("sp1", "speicher", {})]}
    m = mengen_aus_schema(graph)
    assert m["anzahl_speicher"] == 1
    assert "speichervolumen_l" not in m       # Anzahl bekannt, Volumen unbekannt


# ── §49 — vollständiges Golden Project (darf nie unbemerkt brechen) ──────────

def test_golden_project_kompletter_context():
    """MFH mit EWS-WP: der komplette erwartete ProjectContext aus §49."""
    graph = {"nodes": [
        _n("e1", "erzeuger", {"generator_type": "ews_wp", "leistung_kw": "82"}),
        _n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180}),
        _n("sp1", "speicher", {"speicher_liter": 750}),
        _n("sp2", "speicher", {"speicher_liter": 750}),
        _n("p1", "pump"), _n("p2", "pump"), _n("p3", "pump"), _n("p4", "pump"),
        _n("v2a", "valve2"), _n("v2b", "valve2"), _n("v2c", "valve2"),
        _n("v2d", "valve2"), _n("v2e", "valve2"), _n("v2f", "valve2"),
        _n("v3a", "valve3"), _n("v3b", "valve3"),
        _n("wz1", "waermezaehler"), _n("wz2", "waermezaehler"), _n("wz3", "waermezaehler"),
    ]}
    base = SimpleNamespace(ebf_m2=1420.0, anzahl_nutzungseinheiten=10,
                           gebaeudekategorie="MFH", projektart="Neubau",
                           region="Zürich", zertifizierung=None)
    # 10 zusätzliche Wohnungswärmezähler ausserhalb des Schemas (§8)
    rows = [SimpleNamespace(param_key="anzahl_waermezaehler", external_value="10",
                            manual_override=None, confidence="mittel",
                            quelle_notiz="Gebäude", updated_by_name="Dominic")]
    ctx = build_context(base, graph, rows)
    eff = effective_map(ctx)

    assert eff["generator_type"] == "ews_wp"
    assert eff["generator_power_kw"] == 82.0
    assert eff["anzahl_erdsonden"] == 4          # §11: Sonden summiert, nicht Felder gezählt
    assert eff["bohrmeter"] == 720.0             # 4 × 180 m
    assert eff["speichervolumen_l"] == 1500.0
    assert eff["anzahl_speicher"] == 2
    assert eff["anzahl_pumpen"] == 4
    assert eff["anzahl_ventile_2weg"] == 6
    assert eff["anzahl_ventile_3weg"] == 2
    assert eff["anzahl_waermezaehler"] == 13     # 3 Schema + 10 ergänzt
    assert eff["ebf_m2"] == 1420.0
    assert eff["anzahl_nutzungseinheiten"] == 10
