"""Kommerzielle Konditionen bleiben nach der LV-Freigabe editierbar."""
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401
from app.models.heizungscockpit import HcProject  # noqa: F401
from app.models.kv import RefProjekt, RefProjektGewerk
from app.models.lv_import import (
    LvImport, LvImportCondition, LvImportFeature, LvImportStatus,
)
from app.models.subscription import SubscriptionPlan  # noqa: F401
from app.routers.hc_auswertung import RefProjektIn, get_ref, update_ref
from app.routers.hc_lv_import import approve_lv


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
        projekt_name="MFH Rosenweg", projektart="Neubau",
        gebaeudetyp="Mehrfamilienhaus", zertifizierung="Minergie",
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
    db.add_all([
        LvImportCondition(
            lv_import_id=imp.id, original_label="Rabatt", kind="percent",
            direction="deduction", rate_percent=5, order_index=1,
        ),
        LvImportCondition(
            lv_import_id=imp.id, original_label="Baureinigung", kind="fixed",
            direction="deduction", amount=500, order_index=2,
        ),
    ])
    db.commit()

    result = approve_lv(imp.id, user=_user(), db=db)
    ref_id = result["ref_projekt_id"]
    commercial = db.query(RefProjektGewerk).one().commercial_json
    assert commercial["base_amount"] == 100000
    assert commercial["vat_rate"] == 8.1
    assert commercial["subtotal_excl_vat"] == 94500
    assert commercial["total_incl_vat"] == 102154.5

    output = get_ref(ref_id, user=_user(), db=db)
    assert output["name"] == "MFH Rosenweg"
    assert output["projektart"] == "Neubau"
    assert output["gebaeudetyp"] == "Mehrfamilienhaus"
    assert output["zertifizierung"] == "Minergie"
    assert output["ebf_m2"] == 1850
    assert output["anzahl_einheiten"] == 16
    assert output["heizleistung_kw"] == 80
    assert output["features"]["generator_power_kw"] == "80"
    assert [row["label"] for row in output["lv_commercial"]["conditions"]] == [
        "Rabatt", "Baureinigung",
    ]


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
