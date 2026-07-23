"""Firmenverwaltung für Mitglieder, Projektverantwortung und Aktivitäten."""

import json
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.audit import add_audit_event
from app.auth import require_firma_admin
from app.database import get_db
from app.models.auth import Role, User
from app.models.heizungscockpit import HcAuditEvent, HcProject

router = APIRouter(prefix="/api/v1/firma-admin", tags=["Firmenverwaltung"])


class FirmenMemberPatch(BaseModel):
    firma_role: Optional[Literal["mitglied", "admin"]] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class ProjektVerantwortlicherPatch(BaseModel):
    verantwortlicher_id: Optional[int] = None


def _member_out(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "firma_role": user.firma_role,
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
        "firma_admin_beantragt_at": user.firma_admin_beantragt_at,
    }


def _project_out(project: HcProject) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "standort": project.standort,
        "kunde": project.kunde,
        "status": project.status.value if hasattr(project.status, "value") else str(project.status),
        "verantwortlicher_id": project.verantwortlicher_id,
        "verantwortlicher_name": project.verantwortlicher_name,
        "updated_at": project.updated_at,
    }


def _details(raw: str) -> dict:
    try:
        parsed = json.loads(raw or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


@router.get("/overview")
def firma_overview(
    admin: User = Depends(require_firma_admin),
    db: Session = Depends(get_db),
):
    """Lädt nur Verwaltungsmetadaten, niemals schwere Schema-/Ergebnis-JSONs."""
    members = (
        db.query(User)
        .filter(User.tenant_id == admin.tenant_id)
        .order_by(User.is_active.desc(), User.name.asc(), User.email.asc())
        .all()
    )
    projects = (
        db.query(HcProject)
        .options(joinedload(HcProject.verantwortlicher))
        .filter(HcProject.tenant_id == admin.tenant_id)
        .order_by(HcProject.updated_at.desc())
        .all()
    )
    events = (
        db.query(HcAuditEvent)
        .filter(HcAuditEvent.tenant_id == admin.tenant_id)
        .order_by(HcAuditEvent.created_at.desc(), HcAuditEvent.id.desc())
        .limit(100)
        .all()
    )
    project_names = {project.id: project.name for project in projects}
    return {
        "firma": {
            "id": admin.firma.id,
            "name": admin.firma.name,
            "abo_plan": admin.firma.abo_plan,
            "is_active": admin.firma.is_active,
            "created_at": admin.firma.created_at,
        },
        "kennzahlen": {
            "aktive_mitglieder": sum(1 for member in members if member.is_active and member.is_verified),
            "offene_registrierungen": sum(1 for member in members if not member.is_verified),
            "firmenadmins": sum(1 for member in members if member.firma_role == "admin" and member.is_active),
            "aktive_projekte": sum(1 for project in projects if getattr(project.status, "value", project.status) == "aktiv"),
            "archivierte_projekte": sum(1 for project in projects if getattr(project.status, "value", project.status) == "archiviert"),
        },
        "mitglieder": [_member_out(member) for member in members],
        "projekte": [_project_out(project) for project in projects],
        "aktivitaeten": [{
            "id": event.id,
            "project_id": event.project_id or None,
            "project_name": project_names.get(event.project_id),
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "action": event.action,
            "actor_id": event.actor_id,
            "actor_name": event.actor_name,
            "details": _details(event.details_json),
            "created_at": event.created_at,
        } for event in events],
    }


@router.patch("/mitglieder/{user_id}")
def update_member(
    user_id: int,
    body: FirmenMemberPatch,
    admin: User = Depends(require_firma_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == admin.tenant_id,
    ).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Firmenmitglied nicht gefunden")
    if target.role == Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Plattformadmins können hier nicht geändert werden")

    before = {
        "firma_role": target.firma_role,
        "is_active": target.is_active,
        "is_verified": target.is_verified,
    }
    next_role = body.firma_role if body.firma_role is not None else target.firma_role
    next_active = body.is_active if body.is_active is not None else target.is_active
    next_verified = body.is_verified if body.is_verified is not None else target.is_verified

    verliert_adminrecht = (
        target.firma_role == "admin"
        and (next_role != "admin" or not next_active or not next_verified)
    )
    if verliert_adminrecht:
        andere_admins = db.query(func.count(User.id)).filter(
            User.tenant_id == admin.tenant_id,
            User.id != target.id,
            User.role != Role.admin,
            User.firma_role == "admin",
            User.is_active.is_(True),
            User.is_verified.is_(True),
        ).scalar() or 0
        if andere_admins == 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Der letzte aktive Firmenadmin kann nicht entfernt oder deaktiviert werden.",
            )

    target.firma_role = next_role
    target.is_active = next_active
    target.is_verified = next_verified
    if next_role == "admin":
        if not next_verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nur freigeschaltete Mitglieder können Firmenadmin werden.")
        target.firma_admin_bestaetigt_at = datetime.utcnow()
        target.firma_admin_bestaetigt_von = admin.id
        target.firma_admin_beantragt_at = None
    elif before["firma_role"] == "admin":
        target.firma_admin_beantragt_at = None
        target.firma_admin_bestaetigt_at = None
        target.firma_admin_bestaetigt_von = None

    after = {
        "firma_role": target.firma_role,
        "is_active": target.is_active,
        "is_verified": target.is_verified,
    }
    add_audit_event(
        db,
        user=admin,
        action="firmenmitglied_aktualisiert",
        entity_type="benutzer",
        entity_id=target.id,
        details={
            "benutzer_id": target.id,
            "benutzer": target.name or target.email,
            "vorher": before,
            "nachher": after,
        },
    )
    db.commit()
    db.refresh(target)
    return _member_out(target)


@router.patch("/projekte/{project_id}/verantwortlicher")
def update_project_responsible(
    project_id: int,
    body: ProjektVerantwortlicherPatch,
    admin: User = Depends(require_firma_admin),
    db: Session = Depends(get_db),
):
    project = db.query(HcProject).options(joinedload(HcProject.verantwortlicher)).filter(
        HcProject.id == project_id,
        HcProject.tenant_id == admin.tenant_id,
    ).first()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")

    before_id = project.verantwortlicher_id
    before_name = project.verantwortlicher_name
    responsible = None
    if body.verantwortlicher_id is not None:
        responsible = db.query(User).filter(
            User.id == body.verantwortlicher_id,
            User.tenant_id == admin.tenant_id,
            User.is_active.is_(True),
            User.is_verified.is_(True),
        ).first()
        if not responsible:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verantwortliche Person ist nicht verfügbar")

    project.verantwortlicher_id = responsible.id if responsible else None
    project.updated_at = datetime.utcnow()
    add_audit_event(
        db,
        user=admin,
        action="projektverantwortung_geaendert",
        project_id=project.id,
        entity_type="projekt",
        entity_id=project.id,
        details={
            "projekt": project.name,
            "vorher": {"id": before_id, "name": before_name},
            "nachher": {
                "id": responsible.id if responsible else None,
                "name": (responsible.name or responsible.email) if responsible else None,
            },
        },
    )
    db.commit()
    db.refresh(project)
    return _project_out(project)
