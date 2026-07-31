"""Pläne, Feature-Freischaltungen und Nutzung.

Drei Zugänge auf dieselbe Grundlage:

* `/company/features`  – jeder angemeldete Benutzer, nur lesen
* `/company/settings`  – Firmenadmin, darf erlaubte Features intern abschalten
* `/admin/plans/...`   – Plattformadmin, vergibt Pläne, Overrides und Limits

Die Grenze zwischen Firmen- und Plattformadmin ist die entscheidende: ein
Firmenadmin kann nie etwas freischalten, was der Plan nicht hergibt.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.feature_guard import require_company_admin, require_platform_admin
from app.models.auth import Firma, User
from app.models.subscription import (
    CompanyFeatureOverride, CompanyFeatureSetting, FeatureUsage, PlanFeature,
    SubscriptionPlan,
)
from app.plan_features import (
    FEATURE_KEYS, FEATURE_LABELS, NOT_IMPLEMENTED, SUBSCRIPTION_STATUS, as_frontend,
)
from app.routers.hc_auth import get_current_user
from app.services import features as feature_service

router = APIRouter(prefix="/api/v1", tags=["Heizungscockpit – Pläne und Features"])


def _pruefe_feature_key(key: str) -> str:
    if key not in FEATURE_KEYS:
        raise HTTPException(status_code=422, detail=f"Unbekanntes Feature '{key}'")
    return key


# ── Für alle: welche Funktionen gelten für mich? ───────────────────────────

@router.get("/company/features")
def eigene_features(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Der EINE Endpunkt, aus dem das Frontend seinen Feature-Zustand bezieht."""
    daten = feature_service.company_features(db, user.tenant_id)
    daten["catalog"] = as_frontend()
    return daten


# ── Firmenadmin ────────────────────────────────────────────────────────────

class InternerSchalter(BaseModel):
    feature_key: str
    internally_enabled: bool


@router.get("/company/settings")
def firmen_einstellungen(
    user: User = Depends(require_company_admin), db: Session = Depends(get_db),
):
    daten = feature_service.company_features(db, user.tenant_id)
    daten["catalog"] = as_frontend()
    daten["usage"] = [
        {
            "feature_key": u.feature_key, "period_start": u.period_start.isoformat(),
            "period_end": u.period_end.isoformat(),
            "usage_count": u.usage_count, "usage_amount": u.usage_amount,
        }
        for u in db.query(FeatureUsage)
        .filter(FeatureUsage.company_id == user.tenant_id)
        .order_by(FeatureUsage.period_start.desc()).limit(24).all()
    ]
    return daten


@router.put("/company/settings")
def firmen_einstellung_setzen(
    body: InternerSchalter,
    user: User = Depends(require_company_admin), db: Session = Depends(get_db),
):
    """Ein erlaubtes Feature firmenintern ab- oder wieder einschalten.

    Einschalten geht nur, wenn Plan oder Override es hergeben — sonst wäre das
    eine kostenpflichtige Selbstbedienung.
    """
    key = _pruefe_feature_key(body.feature_key)
    if body.internally_enabled:
        # Zum Einschalten muss die Grundlage stimmen. Dafür wird der interne
        # Schalter kurz ausgeblendet betrachtet.
        wirkung = feature_service.get_effective_feature(db, user.tenant_id, key)
        erlaubt = wirkung.enabled or (
            wirkung.source in (feature_service.PLAN, feature_service.COMPANY_OVERRIDE)
            and not wirkung.internally_enabled
        )
        if not erlaubt:
            raise HTTPException(status_code=403, detail={
                "code": "FEATURE_NOT_AVAILABLE",
                "message": "Diese Funktion ist in Ihrem Plan nicht enthalten.",
            })

    zeile = db.query(CompanyFeatureSetting).filter(
        CompanyFeatureSetting.company_id == user.tenant_id,
        CompanyFeatureSetting.feature_key == key,
    ).one_or_none()
    if zeile is None:
        zeile = CompanyFeatureSetting(company_id=user.tenant_id, feature_key=key)
        db.add(zeile)
    zeile.internally_enabled = bool(body.internally_enabled)
    zeile.updated_by_user_id = user.id
    zeile.updated_at = datetime.utcnow()
    db.commit()
    return feature_service.get_effective_feature(db, user.tenant_id, key).as_dict()


# ── Plattformadmin ─────────────────────────────────────────────────────────

@router.get("/admin/plans")
def plaene(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    return [
        {
            "id": p.id, "key": p.key, "name": p.name, "description": p.description,
            "active": p.active,
            "features": {
                f.feature_key: {"enabled": f.enabled, "limit_value": f.limit_value}
                for f in p.features
            },
        }
        for p in db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).all()
    ]


@router.get("/admin/companies")
def firmen(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    plaene_nach_id = {p.id: p for p in db.query(SubscriptionPlan).all()}
    out = []
    for firma in db.query(Firma).order_by(Firma.name).all():
        plan = plaene_nach_id.get(firma.subscription_plan_id)
        out.append({
            "id": firma.id, "name": firma.name, "is_active": firma.is_active,
            "plan_key": plan.key if plan else None,
            "plan_name": plan.name if plan else None,
            "subscription_status": firma.subscription_status or "active",
            "plan_started_at": firma.plan_started_at.isoformat() if firma.plan_started_at else None,
            "plan_expires_at": firma.plan_expires_at.isoformat() if firma.plan_expires_at else None,
        })
    return out


@router.get("/admin/companies/{company_id}/features")
def firmen_features(
    company_id: int, _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    if db.get(Firma, company_id) is None:
        raise HTTPException(status_code=404, detail="Firma nicht gefunden")
    daten = feature_service.company_features(db, company_id)
    daten["catalog"] = as_frontend()
    daten["overrides"] = [
        {
            "feature_key": o.feature_key, "enabled": o.enabled,
            "limit_value": o.limit_value, "reason": o.reason,
        }
        for o in db.query(CompanyFeatureOverride)
        .filter(CompanyFeatureOverride.company_id == company_id).all()
    ]
    daten["usage"] = [
        {
            "feature_key": u.feature_key, "period_start": u.period_start.isoformat(),
            "usage_count": u.usage_count, "usage_amount": u.usage_amount,
        }
        for u in db.query(FeatureUsage)
        .filter(FeatureUsage.company_id == company_id)
        .order_by(FeatureUsage.period_start.desc()).limit(24).all()
    ]
    return daten


class PlanZuweisung(BaseModel):
    plan_key: Optional[str] = None
    subscription_status: Optional[str] = None
    plan_expires_at: Optional[datetime] = None


@router.put("/admin/companies/{company_id}/plan")
def plan_zuweisen(
    company_id: int, body: PlanZuweisung,
    admin: User = Depends(require_platform_admin), db: Session = Depends(get_db),
):
    firma = db.get(Firma, company_id)
    if firma is None:
        raise HTTPException(status_code=404, detail="Firma nicht gefunden")
    if body.plan_key is not None:
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.key == body.plan_key).one_or_none()
        if plan is None:
            raise HTTPException(status_code=422, detail=f"Unbekannter Plan '{body.plan_key}'")
        firma.subscription_plan_id = plan.id
        firma.plan_started_at = firma.plan_started_at or datetime.utcnow()
    if body.subscription_status is not None:
        if body.subscription_status not in SUBSCRIPTION_STATUS:
            raise HTTPException(status_code=422, detail="Unbekannter Abo-Status")
        firma.subscription_status = body.subscription_status
    if body.plan_expires_at is not None:
        firma.plan_expires_at = body.plan_expires_at
    db.commit()
    return feature_service.company_features(db, company_id)


class OverrideEingabe(BaseModel):
    feature_key: str
    enabled: Optional[bool] = None
    limit_value: Optional[int] = None
    reason: Optional[str] = None


@router.put("/admin/companies/{company_id}/overrides")
def override_setzen(
    company_id: int, body: OverrideEingabe,
    admin: User = Depends(require_platform_admin), db: Session = Depends(get_db),
):
    if db.get(Firma, company_id) is None:
        raise HTTPException(status_code=404, detail="Firma nicht gefunden")
    key = _pruefe_feature_key(body.feature_key)
    if key in NOT_IMPLEMENTED and body.enabled:
        raise HTTPException(status_code=422, detail={
            "code": "FEATURE_NOT_AVAILABLE",
            "message": f"'{FEATURE_LABELS[key]}' ist noch nicht verfügbar.",
        })
    zeile = db.query(CompanyFeatureOverride).filter(
        CompanyFeatureOverride.company_id == company_id,
        CompanyFeatureOverride.feature_key == key,
    ).one_or_none()
    if zeile is None:
        zeile = CompanyFeatureOverride(company_id=company_id, feature_key=key,
                                       created_by_user_id=admin.id)
        db.add(zeile)
    zeile.enabled = body.enabled
    zeile.limit_value = body.limit_value
    zeile.reason = body.reason
    zeile.updated_at = datetime.utcnow()
    db.commit()
    return feature_service.get_effective_feature(db, company_id, key).as_dict()


@router.delete("/admin/companies/{company_id}/overrides/{feature_key}", status_code=204)
def override_entfernen(
    company_id: int, feature_key: str,
    _: User = Depends(require_platform_admin), db: Session = Depends(get_db),
):
    db.query(CompanyFeatureOverride).filter(
        CompanyFeatureOverride.company_id == company_id,
        CompanyFeatureOverride.feature_key == feature_key,
    ).delete()
    db.commit()


class PlanFeatureEingabe(BaseModel):
    feature_key: str
    enabled: Optional[bool] = None
    limit_value: Optional[int] = None


@router.put("/admin/plans/{plan_key}/features")
def plan_feature_setzen(
    plan_key: str, body: PlanFeatureEingabe,
    _: User = Depends(require_platform_admin), db: Session = Depends(get_db),
):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.key == plan_key).one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden")
    key = _pruefe_feature_key(body.feature_key)
    if key in NOT_IMPLEMENTED and body.enabled:
        raise HTTPException(status_code=422, detail={
            "code": "FEATURE_NOT_AVAILABLE",
            "message": f"'{FEATURE_LABELS[key]}' ist noch nicht verfügbar.",
        })
    zeile = db.query(PlanFeature).filter(
        PlanFeature.plan_id == plan.id, PlanFeature.feature_key == key).one_or_none()
    if zeile is None:
        zeile = PlanFeature(plan_id=plan.id, feature_key=key, enabled=False)
        db.add(zeile)
    if body.enabled is not None:
        zeile.enabled = body.enabled
    zeile.limit_value = body.limit_value
    zeile.updated_at = datetime.utcnow()
    db.commit()
    return {"plan": plan.key, "feature_key": key,
            "enabled": zeile.enabled, "limit_value": zeile.limit_value}
