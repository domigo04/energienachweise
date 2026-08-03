"""Kommerzielle Konditionen bleiben nach der LV-Freigabe editierbar."""
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401
from app.models.heizungscockpit import HcProject  # noqa: F401
from app.models.kv import RefProjekt, RefProjektGewerk
from app.models.lv_import import (
    LvImport, LvImportFeature, LvImportStatus,
)
from app.models.subscription import SubscriptionPlan  # noqa: F401
from app.routers.hc_auswertung import RefProjektIn, get_ref, update_ref
from app.routers.hc_lv_import import approve_lv, update_commercial, update_import


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _user():
    return SimpleNamespace(id=1, tenant_id=1, name="Dominic", email="d@x.ch")


def test_freigabe_kopiert_konditionen_und_mwst_ins_referenzprojekt():
    db = _db()
    imp = LvImport(
        tenant_id=1, filename="angebot.pdf", file_hash="commercial-copy",
        status=LvImportStatus.review.value,
        projekt_name="MFH Rosenweg",
        ebf_m2=1850, anzahl_einheiten=16,
        debug_json=(
            '{"trade_total":100000,"commercial":{"base_amount":100000,'
            '"vat_rate":8.1,"valid":true,"issues":[]}}'
        ),
    )
    db.add(imp)
    db.flush()
    db.add(LvImportFeature(
        lv_import_id=imp.id, key="generator_power_kw", value="80", confirmed=True,
    ))
    db.commit()

    update_import(imp.id, {
        "projektart": "neubau", "gebaeudetyp": "mfh",
        "ausbauumfang": "vollausbau", "zertifizierung": "minergie",
        "ebf_m2": 1850, "anzahl_einheiten": 16,
    }, user=_user(), db=db)
    update_commercial(imp.id, {
        "vat_rate": 8.1,
        "conditions": [
            {"label": "Rabatt", "kind": "percent",
             "direction": "deduction", "rate_percent": 5},
            {"label": "Baureinigung", "kind": "percent",
             "direction": "deduction", "rate_percent": 0.5},
            {"label": "Baureklame", "kind": "fixed",
             "direction": "deduction", "amount": 200},
        ],
    }, user=_user(), db=db)

    result = approve_lv(imp.id, user=_user(), db=db)
    ref_id = result["ref_projekt_id"]
    commercial = db.query(RefProjektGewerk).one().commercial_json
    assert commercial["base_amount"] == 100000
    assert commercial["vat_rate"] == 8.1
    assert commercial["subtotal_excl_vat"] == 94325
    assert commercial["total_incl_vat"] == 101965.32

    output = get_ref(ref_id, user=_user(), db=db)
    assert output["name"] == "MFH Rosenweg"
    assert output["projektart"] == "neubau"
    assert output["gebaeudetyp"] == "mfh"
    assert output["ausbauumfang"] == "vollausbau"
    assert output["zertifizierung"] == "minergie"
    assert output["ebf_m2"] == 1850
    assert output["anzahl_einheiten"] == 16
    assert output["heizleistung_kw"] == 80
    assert output["features"]["generator_power_kw"] == "80"
    assert [row["label"] for row in output["lv_commercial"]["conditions"]] == [
        "Rabatt", "Baureinigung", "Baureklame",
    ]

    # Bereits mit PR #28 angelegte, unvollständige Snapshots werden beim Laden
    # aus dem weiterhin verknüpften Import ergänzt statt leer angezeigt.
    gewerk = db.query(RefProjektGewerk).one()
    gewerk.commercial_json = {
        "base_amount": 100000, "conditions": [], "vat_rate": 8.1,
    }
    db.commit()
    repaired = get_ref(ref_id, user=_user(), db=db)
    assert [row["label"] for row in repaired["lv_commercial"]["conditions"]] == [
        "Rabatt", "Baureinigung", "Baureklame",
    ]


def test_bestehende_referenzlabels_werden_als_kanonische_codes_geliefert():
    db = _db()
    ref = RefProjekt(
        tenant_id=1, erstellt_von=1, name="Historische Referenz",
        projektart="Neubau", gebaeudetyp="MFH",
        ausbauumfang="Vollausbau", zertifizierung="Gesetz",
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)

    output = get_ref(ref.id, user=_user(), db=db)
    assert output["projektart"] == "neubau"
    assert output["gebaeudetyp"] == "mfh"
    assert output["ausbauumfang"] == "vollausbau"
    assert output["zertifizierung"] == "gesetz"


def test_referenzprojekt_kann_vollstaendige_konditionskette_bearbeiten():
    db = _db()
    ref = RefProjekt(tenant_id=1, erstellt_von=1, name="Referenz")
    db.add(ref)
    db.commit()

    body = RefProjektIn(
        name="Referenz", kostenzeilen=[],
        commercial={
            "base_amount": 50000,
            "vat_rate": 8.1,
            "conditions": [
                {"label": "Rabatt", "kind": "percent",
                 "direction": "deduction", "rate_percent": 4},
                {"label": "Transportzuschlag", "kind": "fixed",
                 "direction": "surcharge", "amount": 700},
            ],
        },
    )
    output = update_ref(ref.id, body, user=_user(), db=db)

    assert output["lv_commercial"]["subtotal_excl_vat"] == 48700
    assert output["lv_commercial"]["vat_amount"] == 3944.7
    assert output["lv_commercial"]["total_incl_vat"] == 52644.7
    gewerk = db.query(RefProjektGewerk).one()
    assert gewerk.rabatt_pct == 4
    assert gewerk.commercial_json["conditions"][1]["direction"] == "surcharge"
