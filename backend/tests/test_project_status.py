"""Phase C — Projektstatus (§16). Sichert die reine Statuslogik ab, ohne DB:
Modulstatus, Gesamtfortschritt, Stale- und not_started-Zustände."""
from app.project_context import build_context
from app.project_status import compute_status


def _n(nid, typ, data=None):
    return {"id": nid, "type": typ, "data": data or {}}


def _golden_context():
    graph = {"nodes": [
        _n("e1", "erzeuger", {"generator_type": "ews_wp", "leistung_kw": "82"}),
        _n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180}),
        _n("sp1", "speicher", {"speicher_liter": 750}),
        _n("g1", "gruppe", {"q_kw": "40"}), _n("g2", "gruppe", {"q_kw": "30"}),
        _n("p1", "pump"), _n("v3a", "valve3"),
        _n("wz1", "waermezaehler"),
    ]}
    from types import SimpleNamespace
    base = SimpleNamespace(ebf_m2=1420.0, anzahl_nutzungseinheiten=10,
                           gebaeudekategorie="MFH", projektart="Neubau",
                           region="Zürich", zertifizierung=None)
    return build_context(base, graph, [])


def _status(**kw):
    defaults = dict(
        context=_golden_context(), schema_present=True, node_count=8, edge_count=6,
        revision_nr=8, schema_warnings=0, cost_status="entwurf",
        cost_version_nr=0, cost_stale=False,
    )
    defaults.update(kw)
    return compute_status(**defaults)


def test_leeres_projekt_ist_not_started():
    ctx = build_context(base_data=None, graph_json={"nodes": []}, parameter_rows=[])
    s = compute_status(
        context=ctx, schema_present=False, node_count=0, edge_count=0,
        revision_nr=None, schema_warnings=None, cost_status=None,
        cost_version_nr=0, cost_stale=False,
    )
    m = s["modules"]
    assert m["project_data"]["status"] == "not_started"
    assert m["schema"]["status"] == "not_started"
    assert m["hydraulics"]["status"] == "not_started"
    assert m["quantities"]["status"] == "not_started"
    assert m["cost_estimate"]["status"] == "not_started"
    assert m["documentation"]["status"] == "not_started"
    assert s["completion"] == 0


def test_projektdaten_vollstaendig():
    m = _status()["modules"]
    assert m["project_data"]["status"] == "complete"
    assert m["project_data"]["total"] == 5           # 5 Pflichtgrunddaten
    assert m["project_data"]["known"] == 5


def test_projektdaten_unvollstaendig():
    from types import SimpleNamespace
    base = SimpleNamespace(ebf_m2=1420.0, anzahl_nutzungseinheiten=None,
                           gebaeudekategorie="MFH", projektart=None,
                           region=None, zertifizierung=None)
    ctx = build_context(base, {"nodes": []}, [])
    m = compute_status(
        context=ctx, schema_present=False, node_count=0, edge_count=0,
        revision_nr=None, schema_warnings=None, cost_status=None,
        cost_version_nr=0, cost_stale=False,
    )["modules"]
    assert m["project_data"]["status"] == "incomplete"
    assert m["project_data"]["warnings"] == 3         # 3 fehlende Pflichtangaben


def test_schema_warnungen_setzen_status():
    assert _status(schema_warnings=0)["modules"]["schema"]["status"] == "complete"
    warn = _status(schema_warnings=2)["modules"]["schema"]
    assert warn["status"] == "warning"
    assert warn["warnings"] == 2
    assert warn["revision"] == 8


def test_hydraulik_complete_bei_leistung():
    assert _status()["modules"]["hydraulics"]["status"] == "complete"


def test_mengen_incomplete_bei_offenen_ergaenzungen():
    # Golden-Context: Wärmezähler ist ergänzbar und ohne Ergänzung → offen.
    q = _status()["modules"]["quantities"]
    assert q["status"] == "incomplete"
    assert q["warnings"] >= 1
    assert q["total"] > 0 and q["known"] > 0


def test_kosten_stale_gewinnt_ueber_status():
    m = _status(cost_status="freigegeben", cost_version_nr=3, cost_stale=True)["modules"]
    assert m["cost_estimate"]["status"] == "stale"
    assert m["cost_estimate"]["version"] == 3
    assert m["cost_estimate"]["stale"] is True


def test_kosten_freigegeben_ist_released():
    m = _status(cost_status="freigegeben", cost_version_nr=3, cost_stale=False)["modules"]
    assert m["cost_estimate"]["status"] == "released"
    assert m["cost_estimate"]["version"] == 3


def test_completion_ist_prozent_zwischen_0_und_100():
    c = _status()["completion"]
    assert isinstance(c, int)
    assert 0 <= c <= 100
    # Golden ohne Doku und mit offener Menge → nicht 100, aber deutlich > 0
    assert 40 < c < 100


# ── DB-Verdrahtung: status_fuer_projekt liest Schema, Revision, Kosten ───────

from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401 — registriert hc_users (FK-Ziel)
from app.models.heizungscockpit import HcProject, HcProjectBaseData, HcSchema
from app.models.kv import Kostenschaetzung
from app.project_status import status_fuer_projekt


def _frische_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_status_fuer_projekt_liest_schema_und_kosten():
    db = _frische_db()
    p = HcProject(tenant_id=1, erstellt_von=1, name="MFH")
    db.add(p)
    db.flush()
    db.add(HcProjectBaseData(tenant_id=1, project_id=p.id, ebf_m2=1420.0,
                             anzahl_nutzungseinheiten=10, gebaeudekategorie="MFH",
                             projektart="Neubau", region="Zürich"))
    db.add(HcSchema(tenant_id=1, project_id=p.id, name="S",
                    graph_json='{"nodes":[{"id":"g1","type":"gruppe","data":{"q_kw":"40"}},'
                               '{"id":"wz1","type":"waermezaehler","data":{}}],"edges":[]}'))
    db.commit()

    s = status_fuer_projekt(db, p, tenant_id=1)
    assert s["modules"]["project_data"]["status"] == "complete"
    assert s["modules"]["schema"]["status"] in ("complete", "warning")
    assert s["modules"]["cost_estimate"]["status"] == "not_started"
    assert 0 < s["completion"] <= 100


def test_status_erkennt_veraltete_kostenschaetzung():
    """Schema nach der Kostenschätzung geändert → cost_estimate = stale (§23)."""
    db = _frische_db()
    p = HcProject(tenant_id=1, erstellt_von=1, name="MFH")
    db.add(p)
    db.flush()
    db.add(HcProjectBaseData(tenant_id=1, project_id=p.id, ebf_m2=1420.0))
    ks = Kostenschaetzung(tenant_id=1, project_id=p.id,
                          inputs_json='{"_workflow": {"status": "freigegeben", "version_nr": 3}}',
                          result_json="{}")
    ks.updated_at = datetime(2026, 1, 1, 10, 0, 0)
    db.add(ks)
    schema = HcSchema(tenant_id=1, project_id=p.id, name="S",
                      graph_json='{"nodes":[{"id":"g1","type":"gruppe","data":{"q_kw":"40"}}],"edges":[]}')
    db.add(schema)
    db.flush()
    schema.updated_at = ks.updated_at + timedelta(days=1)   # Schema neuer als Kosten
    db.commit()

    s = status_fuer_projekt(db, p, tenant_id=1)
    assert s["modules"]["cost_estimate"]["status"] == "stale"
    assert s["modules"]["cost_estimate"]["version"] == 3
