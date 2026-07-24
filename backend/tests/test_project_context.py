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
    """Gruppe ohne explizite Flags: hat Pumpe + 3-Weg-Ventil (Einspritz-Default).
    Drosselgruppe: keine Pumpe, 2-Weg-Ventil."""
    graph = {"nodes": [
        _n("g1", "gruppe", {"q_kw": "20"}),                      # Default einspritz
        _n("g2", "gruppe", {"q_kw": "10", "schaltung": "drossel"}),
        _n("g3", "gruppe", {"q_kw": "5", "hat_pumpe": False}),   # Pumpe abgewählt
    ]}
    m = mengen_aus_schema(graph)
    assert m["anzahl_heizgruppen"] == 3
    # g1 Pumpe + g2 keine (drossel) + g3 keine (abgewählt) = 1
    assert m["anzahl_pumpen"] == 1
    # g1 einspritz→3-Weg, g3 einspritz→3-Weg = 2 ; g2 drossel→2-Weg = 1
    assert m["anzahl_ventile_3weg"] == 2
    assert m["anzahl_ventile_2weg"] == 1
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
