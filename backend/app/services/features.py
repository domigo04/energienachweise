"""Effektive Feature-Freischaltung je Firma — der EINE Ort dieser Entscheidung.

Die Kette ist bewusst kurz und in dieser Reihenfolge bindend:

    1. Firmen-Override (Plattformadmin)   – schlägt den Plan in beide Richtungen
    2. Plan-Feature                        – was der Tarif hergibt
    3. sonst                               – deaktiviert

Danach greift der firmeninterne Schalter: er kann ein erlaubtes Feature
abschalten, aber nie eines freischalten, das der Plan nicht hergibt.

Zuletzt entscheidet das Limit. Ein Limit ist immer eine Menge pro Monat oder
insgesamt; `None` heisst unbegrenzt.
"""
from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.auth import Firma
from app.models.subscription import (
    CompanyFeatureOverride, CompanyFeatureSetting, FeatureUsage, PlanFeature,
    SubscriptionPlan,
)
from app.plan_features import (
    ACTIVE_STATUS, DEFAULT_PLAN_KEY, FEATURE_KEYS, FEATURE_LIMIT, NOT_IMPLEMENTED,
)

COMPANY_OVERRIDE = "company_override"
PLAN = "plan"
DEFAULT_DISABLED = "default_disabled"
NOT_IMPLEMENTED_SOURCE = "not_implemented"


@dataclass
class EffectiveFeature:
    feature_key: str
    enabled: bool
    source: str
    limit: int | None = None
    used: int = 0
    internally_enabled: bool = True
    subscription_status: str | None = None
    reason: str | None = None

    @property
    def remaining(self) -> int | None:
        if self.limit is None:
            return None
        return max(0, self.limit - self.used)

    @property
    def limit_reached(self) -> bool:
        return self.limit is not None and self.used >= self.limit

    def as_dict(self) -> dict:
        return {
            "feature_key": self.feature_key,
            "enabled": self.enabled,
            "source": self.source,
            "limit": self.limit,
            "used": self.used,
            "remaining": self.remaining,
            "internally_enabled": self.internally_enabled,
            "reason": self.reason,
        }


@dataclass
class CompanyPlan:
    plan: SubscriptionPlan | None
    status: str
    started_at: datetime | None = None
    expires_at: datetime | None = None
    features: dict = field(default_factory=dict)

    @property
    def active(self) -> bool:
        """Erlaubt der Abozustand überhaupt Zugriff?"""
        if self.status not in ACTIVE_STATUS:
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True


def aktuelle_periode(jetzt: datetime | None = None) -> tuple[datetime, datetime]:
    """Kalendermonat als Abrechnungsperiode — erster Tag bis Monatsende."""
    jetzt = jetzt or datetime.utcnow()
    start = jetzt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    letzter = monthrange(jetzt.year, jetzt.month)[1]
    ende = jetzt.replace(day=letzter, hour=23, minute=59, second=59, microsecond=0)
    return start, ende


def _plan_von(db: Session, firma: Firma) -> SubscriptionPlan | None:
    if firma.subscription_plan_id:
        plan = db.get(SubscriptionPlan, firma.subscription_plan_id)
        if plan:
            return plan
    # Ohne zugewiesenen Plan gilt der Default. Er nimmt bestehenden Firmen
    # nichts weg — die Umstufung ist ein bewusster Schritt des Plattformadmins.
    return db.query(SubscriptionPlan).filter(
        SubscriptionPlan.key == DEFAULT_PLAN_KEY).one_or_none()


def company_plan(db: Session, company_id: int) -> CompanyPlan:
    firma = db.get(Firma, company_id)
    if firma is None:
        return CompanyPlan(plan=None, status="expired")
    plan = _plan_von(db, firma)
    return CompanyPlan(
        plan=plan,
        status=firma.subscription_status or "active",
        started_at=firma.plan_started_at,
        expires_at=firma.plan_expires_at,
    )


def _verbrauch(db: Session, company_id: int, feature_key: str) -> int:
    start, _ = aktuelle_periode()
    zeile = db.query(FeatureUsage).filter(
        FeatureUsage.company_id == company_id,
        FeatureUsage.feature_key == feature_key,
        FeatureUsage.period_start == start,
    ).one_or_none()
    return int(zeile.usage_count or 0) if zeile else 0


def get_effective_feature(db: Session, company_id: int, feature_key: str) -> EffectiveFeature:
    """Gilt dieses Feature für diese Firma — und wie viel ist davon übrig?"""
    if feature_key in NOT_IMPLEMENTED:
        return EffectiveFeature(
            feature_key=feature_key, enabled=False, source=NOT_IMPLEMENTED_SOURCE,
            reason="Funktion ist noch nicht verfügbar.",
        )

    zustand = company_plan(db, company_id)
    aktiviert = False
    quelle = DEFAULT_DISABLED
    limit: int | None = None

    plan_feature = None
    if zustand.plan is not None:
        plan_feature = db.query(PlanFeature).filter(
            PlanFeature.plan_id == zustand.plan.id,
            PlanFeature.feature_key == feature_key,
        ).one_or_none()
    if plan_feature is not None:
        aktiviert = bool(plan_feature.enabled)
        limit = plan_feature.limit_value
        quelle = PLAN if aktiviert else DEFAULT_DISABLED

    override = db.query(CompanyFeatureOverride).filter(
        CompanyFeatureOverride.company_id == company_id,
        CompanyFeatureOverride.feature_key == feature_key,
    ).one_or_none()
    if override is not None:
        if override.enabled is not None:
            aktiviert = bool(override.enabled)
            quelle = COMPANY_OVERRIDE
        if override.limit_value is not None:
            limit = override.limit_value
            quelle = COMPANY_OVERRIDE

    # Firmeninterner Schalter: darf nur abschalten.
    einstellung = db.query(CompanyFeatureSetting).filter(
        CompanyFeatureSetting.company_id == company_id,
        CompanyFeatureSetting.feature_key == feature_key,
    ).one_or_none()
    intern = True if einstellung is None else bool(einstellung.internally_enabled)

    used = _verbrauch(db, company_id, feature_key) if limit is not None else 0
    return EffectiveFeature(
        feature_key=feature_key,
        enabled=bool(aktiviert and intern),
        source=quelle,
        limit=limit,
        used=used,
        internally_enabled=intern,
        subscription_status=zustand.status,
    )


def company_features(db: Session, company_id: int) -> dict:
    """Alle Features einer Firma auf einmal — Grundlage von GET /company/features."""
    zustand = company_plan(db, company_id)
    return {
        "plan": {
            "key": zustand.plan.key if zustand.plan else None,
            "name": zustand.plan.name if zustand.plan else None,
            "status": zustand.status,
            "active": zustand.active,
            "started_at": zustand.started_at.isoformat() if zustand.started_at else None,
            "expires_at": zustand.expires_at.isoformat() if zustand.expires_at else None,
        },
        "features": {
            key: get_effective_feature(db, company_id, key).as_dict()
            for key in FEATURE_KEYS
        },
    }


def zaehle_nutzung(
    db: Session, company_id: int, feature_key: str, *,
    count: int = 1, amount: float | None = None,
) -> FeatureUsage:
    """Verbrauch atomar erhöhen.

    Wird bewusst erst aufgerufen, wenn der kostenpflichtige Vorgang tatsächlich
    beginnt — nicht schon beim Prüfen des Guards. Ein Import zählt als EIN
    Vorgang, auch wenn er intern mehrere LLM-Aufrufe macht; die tatsächlichen
    Kosten landen in `usage_amount`.
    """
    start, ende = aktuelle_periode()
    zeile = db.query(FeatureUsage).filter(
        FeatureUsage.company_id == company_id,
        FeatureUsage.feature_key == feature_key,
        FeatureUsage.period_start == start,
    ).one_or_none()
    if zeile is None:
        zeile = FeatureUsage(
            company_id=company_id, feature_key=feature_key,
            period_start=start, period_end=ende, usage_count=0, usage_amount=0.0,
        )
        db.add(zeile)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            zeile = db.query(FeatureUsage).filter(
                FeatureUsage.company_id == company_id,
                FeatureUsage.feature_key == feature_key,
                FeatureUsage.period_start == start,
            ).one()
    zeile.usage_count = (zeile.usage_count or 0) + count
    if amount is not None:
        zeile.usage_amount = (zeile.usage_amount or 0.0) + amount
    zeile.updated_at = datetime.utcnow()
    db.flush()
    return zeile


def limit_key_fuer(feature_key: str) -> str | None:
    return FEATURE_LIMIT.get(feature_key)
