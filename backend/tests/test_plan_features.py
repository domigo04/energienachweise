"""Pläne, Feature-Freischaltung, Overrides, Limits und Backend-Guard."""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.deps.feature_guard import pruefe_feature
from app.models.auth import Firma, Role, User
from app.models.heizungscockpit import HcProject  # noqa: F401 — Fremdschlüsselziel
from app.models.subscription import (
    CompanyFeatureOverride, CompanyFeatureSetting, PlanFeature, SubscriptionPlan,
)
from app.plan_features import Feature, STARTER_PLANS
from app.services import features as fs

LV = Feature.LV_IMPORT.value
KI = Feature.LV_AI_REVIEW.value


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _seed_plaene(db):
    """Startpläne wie in der Migration — hier über dieselbe Definition."""
    for eintrag in STARTER_PLANS:
        plan = SubscriptionPlan(key=eintrag["key"], name=eintrag["name"], active=True)
        db.add(plan)
        db.flush()
        for key, aktiv in eintrag["features"].items():
            db.add(PlanFeature(plan_id=plan.id, feature_key=key, enabled=aktiv,
                               limit_value=eintrag["limits"].get(key)))
    db.commit()


def _firma(db, plan_key="professional", status="active"):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.key == plan_key).one()
    firma = Firma(name=f"Firma {plan_key}", is_active=True,
                  subscription_plan_id=plan.id, subscription_status=status,
                  plan_started_at=datetime.utcnow())
    db.add(firma)
    db.commit()
    return firma


def _user(db, firma, firma_role="mitglied", role=Role.user):
    user = User(tenant_id=firma.id, email=f"u{firma.id}-{firma_role}@example.test",
                password_hash="x", role=role, firma_role=firma_role, is_active=True)
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def welt():
    db = _db()
    _seed_plaene(db)
    yield db
    db.close()


# ── Plan erlaubt / verbietet ───────────────────────────────────────────────

def test_plan_erlaubt_feature(welt):
    firma = _firma(welt, "professional")
    wirkung = fs.get_effective_feature(welt, firma.id, LV)
    assert wirkung.enabled is True
    assert wirkung.source == fs.PLAN
    pruefe_feature(welt, _user(welt, firma), LV)          # kein Fehler


def test_plan_verbietet_feature(welt):
    firma = _firma(welt, "basic")
    assert fs.get_effective_feature(welt, firma.id, LV).enabled is False
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, _user(welt, firma), LV)
    assert fehler.value.status_code == 403
    assert fehler.value.detail["code"] == "FEATURE_NOT_AVAILABLE"


def test_plattformadmin_bleibt_unabhaengig_vom_firmenplan(welt):
    firma = _firma(welt, "basic")
    pruefe_feature(welt, _user(welt, firma, role=Role.admin), LV)


# ── Firmen-Override ────────────────────────────────────────────────────────

def test_override_aktiviert_feature_ausserhalb_des_plans(welt):
    firma = _firma(welt, "basic")
    welt.add(CompanyFeatureOverride(company_id=firma.id, feature_key=KI,
                                    enabled=True, reason="Pilotkunde"))
    welt.commit()
    wirkung = fs.get_effective_feature(welt, firma.id, KI)
    assert wirkung.enabled is True
    assert wirkung.source == fs.COMPANY_OVERRIDE
    pruefe_feature(welt, _user(welt, firma), KI)


def test_override_deaktiviert_feature_trotz_plan(welt):
    firma = _firma(welt, "professional")
    welt.add(CompanyFeatureOverride(company_id=firma.id, feature_key=LV, enabled=False))
    welt.commit()
    assert fs.get_effective_feature(welt, firma.id, LV).enabled is False
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, _user(welt, firma), LV)
    assert fehler.value.status_code == 403


# ── Firmeninterner Schalter ────────────────────────────────────────────────

def test_firmenadmin_deaktiviert_erlaubtes_feature_intern(welt):
    firma = _firma(welt, "professional")
    welt.add(CompanyFeatureSetting(company_id=firma.id, feature_key=LV,
                                   internally_enabled=False))
    welt.commit()
    wirkung = fs.get_effective_feature(welt, firma.id, LV)
    assert wirkung.enabled is False
    assert wirkung.internally_enabled is False
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, _user(welt, firma), LV)
    assert fehler.value.status_code == 403


def test_interner_schalter_kann_nichts_freischalten(welt):
    """Ein Schalter auf «an» hebt einen fehlenden Plan nicht auf."""
    firma = _firma(welt, "basic")
    welt.add(CompanyFeatureSetting(company_id=firma.id, feature_key=KI,
                                   internally_enabled=True))
    welt.commit()
    assert fs.get_effective_feature(welt, firma.id, KI).enabled is False


# ── Limits ─────────────────────────────────────────────────────────────────

def test_monatslimit_erreicht_gibt_429(welt):
    firma = _firma(welt, "professional")      # KI-Limit 20
    user = _user(welt, firma)
    for _ in range(20):
        fs.zaehle_nutzung(welt, firma.id, KI)
    welt.commit()
    wirkung = fs.get_effective_feature(welt, firma.id, KI)
    assert wirkung.limit == 20 and wirkung.used == 20 and wirkung.remaining == 0
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, user, KI)
    assert fehler.value.status_code == 429
    assert fehler.value.detail["code"] == "FEATURE_LIMIT_REACHED"


def test_verbrauch_unter_dem_limit_bleibt_erlaubt(welt):
    firma = _firma(welt, "professional")
    for _ in range(7):
        fs.zaehle_nutzung(welt, firma.id, KI)
    welt.commit()
    wirkung = fs.get_effective_feature(welt, firma.id, KI)
    assert (wirkung.used, wirkung.remaining) == (7, 13)
    pruefe_feature(welt, _user(welt, firma), KI)


def test_override_kann_das_limit_erhoehen(welt):
    firma = _firma(welt, "professional")
    welt.add(CompanyFeatureOverride(company_id=firma.id, feature_key=KI, limit_value=100))
    welt.commit()
    assert fs.get_effective_feature(welt, firma.id, KI).limit == 100


def test_verbrauch_wird_atomar_erhoeht(welt):
    firma = _firma(welt, "professional")
    fs.zaehle_nutzung(welt, firma.id, KI, amount=0.42)
    fs.zaehle_nutzung(welt, firma.id, KI, amount=0.58)
    welt.commit()
    zeile = fs.zaehle_nutzung(welt, firma.id, KI, count=0)
    assert zeile.usage_count == 2
    assert zeile.usage_amount == pytest.approx(1.0)


# ── Abo-Zustand und Firmengrenzen ──────────────────────────────────────────

@pytest.mark.parametrize("status", ["suspended", "expired", "cancelled"])
def test_inaktive_subscription_sperrt(welt, status):
    firma = _firma(welt, "professional", status=status)
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, _user(welt, firma), LV)
    assert fehler.value.status_code == 403
    assert fehler.value.detail["code"] == "SUBSCRIPTION_INACTIVE"


def test_abgelaufener_plan_sperrt(welt):
    firma = _firma(welt, "professional")
    firma.plan_expires_at = datetime.utcnow() - timedelta(days=1)
    welt.commit()
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, _user(welt, firma), LV)
    assert fehler.value.detail["code"] == "SUBSCRIPTION_INACTIVE"


def test_inaktive_firma_sperrt(welt):
    firma = _firma(welt, "professional")
    firma.is_active = False
    welt.commit()
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, _user(welt, firma), LV)
    assert fehler.value.detail["code"] == "SUBSCRIPTION_INACTIVE"


def test_benutzer_ohne_firma_hat_keinen_zugriff(welt):
    """Ohne Firmenzuordnung gibt es keine Freischaltung.

    Der Benutzer wird bewusst nicht gespeichert: `tenant_id` trägt in der
    Datenbank einen Default von 1, wodurch ein Konto ohne Firma stillschweigend
    in Firma 1 landen würde. Geprüft wird hier der Guard selbst.
    """
    _firma(welt, "professional")
    fremd = User(email="ohne@example.test", password_hash="x", role=Role.user,
                 firma_role="mitglied", is_active=True)
    fremd.tenant_id = None
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, fremd, LV)
    assert fehler.value.detail["code"] == "FEATURE_NOT_AVAILABLE"


def test_benutzer_einer_geloeschten_firma_hat_keinen_zugriff(welt):
    _firma(welt, "professional")
    verwaist = User(email="verwaist@example.test", password_hash="x", role=Role.user,
                    firma_role="mitglied", is_active=True)
    verwaist.tenant_id = 9999
    with pytest.raises(HTTPException) as fehler:
        pruefe_feature(welt, verwaist, LV)
    assert fehler.value.detail["code"] == "SUBSCRIPTION_INACTIVE"


def test_firmenfremder_nutzer_sieht_nur_die_eigene_firma(welt):
    """Die Wirkung hängt an der Firma des Nutzers, nicht an einer fremden."""
    a = _firma(welt, "professional")
    b = _firma(welt, "basic")
    assert fs.get_effective_feature(welt, a.id, LV).enabled is True
    assert fs.get_effective_feature(welt, b.id, LV).enabled is False


def test_deaktivierter_benutzer_hat_keinen_zugriff(welt):
    firma = _firma(welt, "professional")
    user = _user(welt, firma)
    user.is_active = False
    welt.commit()
    with pytest.raises(HTTPException):
        pruefe_feature(welt, user, LV)


# ── Rollen und nicht vorhandene Funktionen ─────────────────────────────────

def test_firmenadministration_nur_fuer_firmenadmin(welt):
    firma = _firma(welt, "professional")
    with pytest.raises(HTTPException):
        pruefe_feature(welt, _user(welt, firma, "mitglied"), Feature.COMPANY_ADMIN.value)
    pruefe_feature(welt, _user(welt, firma, "admin"), Feature.COMPANY_ADMIN.value)


def test_nicht_implementierte_funktion_ist_nirgends_aktiv(welt):
    firma = _firma(welt, "enterprise")
    wirkung = fs.get_effective_feature(welt, firma.id, Feature.DXF_EXPORT.value)
    assert wirkung.enabled is False
    assert wirkung.source == fs.NOT_IMPLEMENTED_SOURCE


def test_kein_plan_bedeutet_defaultplan_und_nimmt_nichts_weg(welt):
    """Bestehende Firmen ohne Plan verlieren keine Funktion."""
    firma = Firma(name="Altbestand", is_active=True, subscription_status="active")
    welt.add(firma)
    welt.commit()
    assert fs.get_effective_feature(welt, firma.id, LV).enabled is True


# ── Übersicht fürs Frontend ────────────────────────────────────────────────

def test_company_features_liefert_alle_schluessel(welt):
    from app.plan_features import FEATURE_KEYS

    firma = _firma(welt, "professional")
    daten = fs.company_features(welt, firma.id)
    assert set(daten["features"]) == set(FEATURE_KEYS)
    assert daten["plan"]["key"] == "professional"
    assert daten["plan"]["active"] is True
    assert daten["features"][KI]["limit"] == 20


def test_feature_schluessel_gibt_es_nur_einmal():
    """Keine Feature-Namen als freie Strings verstreut."""
    from app.plan_features import FEATURE_KEYS, FEATURE_LABELS

    assert len(FEATURE_KEYS) == len(set(FEATURE_KEYS))
    assert set(FEATURE_LABELS) == set(FEATURE_KEYS)
