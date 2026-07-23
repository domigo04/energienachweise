from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import HcGroupTemplate, HcHeatingGroup, HcProject
from app.schemas.hc_schemas import (
    GroupTemplateOut,
    HeatingGroupCreate,
    HeatingGroupOut,
    HeatingGroupStatusUpdate,
    HeatingGroupUpdate,
    ReorderRequest,
)
from app.calculations.heizgruppen import berechne_volumenstrom, pruefe_plausibilitaet

router = APIRouter(tags=["Heizungscockpit – Gruppen"])


def _group_to_out(g: HcHeatingGroup) -> HeatingGroupOut:
    warnings = pruefe_plausibilitaet(g.leistung_kw, g.vorlauf, g.ruecklauf, str(g.status))
    return HeatingGroupOut(
        id=g.id,
        name=g.name,
        typ=g.typ,
        leistung_kw=g.leistung_kw,
        vorlauf=g.vorlauf,
        ruecklauf=g.ruecklauf,
        volumenstrom_m3h=g.volumenstrom_m3h,
        status=g.status,
        sort_order=g.sort_order,
        template_id=g.template_id,
        warnings=warnings,
    )


@router.get("/api/v1/group-templates", response_model=List[GroupTemplateOut])
def list_templates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Systemvorlagen gelten global; firmeneigene Vorlagen dürfen die
    # Mandantengrenze nicht überschreiten.
    return (
        db.query(HcGroupTemplate)
        .filter(or_(HcGroupTemplate.is_system.is_(True), HcGroupTemplate.tenant_id == user.tenant_id))
        .order_by(HcGroupTemplate.name)
        .all()
    )


@router.get("/api/v1/projects/{project_id}/groups", response_model=List[HeatingGroupOut])
def list_groups(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == user.tenant_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return [_group_to_out(g) for g in project.heating_groups]


@router.post("/api/v1/projects/{project_id}/groups", response_model=HeatingGroupOut, status_code=201)
def add_group(project_id: int, body: HeatingGroupCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == user.tenant_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    volumenstrom = berechne_volumenstrom(body.leistung_kw, body.vorlauf, body.ruecklauf)
    max_order = max((g.sort_order for g in project.heating_groups), default=-1)

    group = HcHeatingGroup(
        tenant_id=user.tenant_id,
        project_id=project_id,
        template_id=body.template_id,
        name=body.name,
        typ=body.typ,
        leistung_kw=body.leistung_kw,
        vorlauf=body.vorlauf,
        ruecklauf=body.ruecklauf,
        volumenstrom_m3h=volumenstrom,
        sort_order=max_order + 1,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_to_out(group)


@router.patch("/api/v1/groups/{group_id}", response_model=HeatingGroupOut)
def update_group(group_id: int, body: HeatingGroupUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = (
        db.query(HcHeatingGroup)
        .filter(HcHeatingGroup.id == group_id, HcHeatingGroup.tenant_id == user.tenant_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")

    for field in ("name", "leistung_kw", "vorlauf", "ruecklauf", "sort_order"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(group, field, val)

    group.volumenstrom_m3h = berechne_volumenstrom(group.leistung_kw, group.vorlauf, group.ruecklauf)
    group.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(group)
    return _group_to_out(group)


@router.patch("/api/v1/groups/{group_id}/status", response_model=HeatingGroupOut)
def update_group_status(group_id: int, body: HeatingGroupStatusUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = (
        db.query(HcHeatingGroup)
        .filter(HcHeatingGroup.id == group_id, HcHeatingGroup.tenant_id == user.tenant_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")
    group.status = body.status
    group.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(group)
    return _group_to_out(group)


@router.delete("/api/v1/groups/{group_id}", status_code=204)
def delete_group(group_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = (
        db.query(HcHeatingGroup)
        .filter(HcHeatingGroup.id == group_id, HcHeatingGroup.tenant_id == user.tenant_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")
    db.delete(group)
    db.commit()


@router.post("/api/v1/projects/{project_id}/groups/reorder", response_model=List[HeatingGroupOut])
def reorder_groups(project_id: int, body: ReorderRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == user.tenant_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    for order, gid in enumerate(body.group_ids):
        db.query(HcHeatingGroup).filter(
            HcHeatingGroup.id == gid, HcHeatingGroup.project_id == project_id,
            HcHeatingGroup.tenant_id == user.tenant_id,
        ).update({"sort_order": order})
    db.commit()
    db.refresh(project)
    return [_group_to_out(g) for g in project.heating_groups]
