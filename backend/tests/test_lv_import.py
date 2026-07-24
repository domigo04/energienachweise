"""LV-Import — Extraktionskern (B4-B8, B12). Reine Logik ohne DB/PDF-Bytes."""
from app.lv_import.feature_extract import extract_features
from app.lv_import.cost_extract import extract_costs
from app.lv_import.normalization import parse_number, parse_int
from app.lv_import.feature_keys import FEATURE_TO_CONTEXT, context_key


def _pages(text):
    return [{"page": 17, "text": text}]


# ── Normalisierung (Schweizer Zahlenformate) ────────────────────────────────

def test_parse_number_schweizer_format():
    assert parse_number("1'500") == 1500
    assert parse_number("1’500") == 1500
    assert parse_number("82,5") == 82.5
    assert parse_number("82.5") == 82.5
    assert parse_number("720") == 720
    assert parse_number("kein") is None
    assert parse_int("3 ") == 3


# ── B6 — konservatives Zählen ───────────────────────────────────────────────

def test_pump_menge_wird_gezaehlt():
    f = extract_features(_pages("Pos. 241.123\nHocheffizienz-Umwälzpumpe\nMenge 3 Stk."))
    assert f["pump_count"]["value"] == 3
    assert f["pump_count"]["confidence"] == "high"
    assert f["pump_count"]["source_page"] == 17
    assert "Umwälzpumpe" in f["pump_count"]["source_text"]


def test_pump_ohne_menge_wird_nicht_geraten():
    """Erwähnt, aber keine Menge → value None, confidence low (kein geratenes 1)."""
    f = extract_features(_pages("Umwälzpumpe im Heizkreis"))
    assert f["pump_count"]["value"] is None
    assert f["pump_count"]["confidence"] == "low"


def test_mehrere_positionen_summiert():
    text = "Umwälzpumpe\nMenge 2 Stk\nInlinepumpe\nMenge 3 Stk"
    f = extract_features(_pages(text))
    assert f["pump_count"]["value"] == 5


# ── B7 — Leistung / Speicher / Bohrmeter ────────────────────────────────────

def test_erzeugerleistung_und_typ():
    f = extract_features(_pages("Sole/Wasser-Wärmepumpe 82 kW"))
    assert f["generator_power_kw"]["value"] == 82
    assert f["generator_type"]["value"] == "ews_wp"


def test_speichervolumen():
    f = extract_features(_pages("Pufferspeicher 1'500 Liter"))
    assert f["storage_volume_l"]["value"] == 1500


def test_erdsonden_count_und_bohrmeter():
    f = extract_features(_pages("4 Erdsonden à 180 m"))
    assert f["borehole_count"]["value"] == 4
    assert f["borehole_total_m"]["value"] == 720


def test_erdsonden_ohne_tiefe_nur_count():
    f = extract_features(_pages("2 Erdsonden für Sole"))
    assert f["borehole_count"]["value"] == 2
    assert f["borehole_total_m"]["value"] is None
    assert f["borehole_total_m"]["confidence"] == "low"


def test_ventile_2_und_3_weg():
    text = "2-Weg-Ventil DN20\nMenge 6 Stk\nMischventil DN25\nMenge 2 Stk"
    f = extract_features(_pages(text))
    assert f["valve_2way_count"]["value"] == 6
    assert f["valve_3way_count"]["value"] == 2


def test_nicht_erwaehnte_features_fehlen():
    f = extract_features(_pages("Nur ein bisschen Text ohne Bauteile"))
    assert "pump_count" not in f
    assert "generator_power_kw" not in f


# ── B8 — BKP-Kosten best-effort ─────────────────────────────────────────────

def test_bkp_betrag_erkannt():
    costs = extract_costs(_pages("BKP 241 Wärmeerzeugung CHF 45'000"))
    assert len(costs) == 1
    assert costs[0]["bkp_nr"] == "241"
    assert costs[0]["detected_amount"] == 45000
    assert costs[0]["confidence"] == "high"


def test_bkp_ohne_betrag_blockiert_nicht():
    costs = extract_costs(_pages("BKP 242 Wärmeverteilung"))
    assert costs[0]["bkp_nr"] == "242"
    assert costs[0]["detected_amount"] is None
    assert costs[0]["confidence"] == "medium"


# ── B12 — gemeinsame Feature-Sprache ────────────────────────────────────────

def test_feature_keys_mappen_auf_projectcontext():
    from app.project_context import PARAMETER_BY_KEY
    for feature_key, ctx_key in FEATURE_TO_CONTEXT.items():
        assert ctx_key in PARAMETER_BY_KEY, f"{feature_key} → {ctx_key} fehlt im ProjectContext"
    assert context_key("pump_count") == "anzahl_pumpen"
    assert context_key("borehole_total_m") == "bohrmeter"


# ── B1/B11 — Modell + Freigabe-Übernahme (DB) ───────────────────────────────

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401 — registriert hc_users
from app.models.heizungscockpit import HcProject  # noqa: F401 — FK-Ziel project_id
from app.models.lv_import import LvImport, LvImportFeature, LvImportCost, LvImportStatus
from app.models.kv import RefProjekt, RefKostenzeile


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_lv_import_status_und_features_persistieren():
    db = _db()
    imp = LvImport(tenant_id=1, filename="lv.pdf", file_hash="abc",
                   status=LvImportStatus.review.value, page_count=3)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="pump_count", value="3", confidence="high",
                           source_page=17, source_text="Umwälzpumpe … Menge 3 Stk."))
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="241", detected_amount=45000.0, confidence="high"))
    db.commit()

    geladen = db.query(LvImport).first()
    assert geladen.status == "review"
    assert geladen.features[0].key == "pump_count"
    assert geladen.features[0].confirmed is False
    assert geladen.costs[0].detected_amount == 45000.0


def test_freigabe_uebernimmt_in_refprojekt():
    """B11 — erst nach Freigabe entsteht ein RefProjekt mit den bestätigten Werten."""
    from app.routers.hc_lv_import import approve_lv
    from types import SimpleNamespace

    db = _db()
    imp = LvImport(tenant_id=1, filename="MFH.pdf", file_hash="h", status=LvImportStatus.review.value)
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(lv_import_id=imp.id, key="generator_power_kw", value="82", confidence="medium"))
    db.add(LvImportFeature(lv_import_id=imp.id, key="borehole_total_m", value="720", confidence="high"))
    db.add(LvImportFeature(lv_import_id=imp.id, key="generator_type", value="ews_wp", confidence="medium"))
    db.add(LvImportFeature(lv_import_id=imp.id, key="heat_meter_count", value="10",
                           confirmed_value="13", confidence="medium"))
    db.add(LvImportCost(lv_import_id=imp.id, bkp_nr="241", detected_amount=45000.0))
    db.commit()

    user = SimpleNamespace(id=1, tenant_id=1, name="Dominic", email="d@x.ch")
    res = approve_lv(imp.id, user=user, db=db)

    assert db.query(LvImport).first().status == "approved"
    ref = db.query(RefProjekt).first()
    assert ref is not None
    assert ref.heizleistung_kw == 82.0
    assert ref.bohrmeter == 720.0
    assert ref.anzahl_waermemessungen == 13          # confirmed_value gewinnt
    assert ref.waermeerzeuger == ["ews_wp"]
    zeile = db.query(RefKostenzeile).first()
    assert zeile.bkp_nr == "241" and zeile.betrag_chf == 45000.0
    assert res["ref_projekt_id"] == ref.id


def test_nicht_freigegeben_hat_kein_refprojekt():
    db = _db()
    imp = LvImport(tenant_id=1, filename="x.pdf", file_hash="h2", status=LvImportStatus.review.value)
    db.add(imp)
    db.commit()
    assert db.query(RefProjekt).count() == 0
    assert imp.ref_projekt_id is None
