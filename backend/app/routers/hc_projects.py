from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.heizungscockpit import HcHeatingGroup, HcProject, HcProjectBaseData
from app.schemas.hc_schemas import (
    HeatingGroupOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdate,
)
from app.calculations.heizgruppen import berechne_rl_gemischt, pruefe_plausibilitaet

router = APIRouter(prefix="/api/v1/projects", tags=["Heizungscockpit – Projekte"])

TENANT_ID = 1


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


def _build_detail(project: HcProject) -> ProjectDetailOut:
    groups_out = [_group_to_out(g) for g in project.heating_groups]
    aktive = [g for g in project.heating_groups if str(g.status) in ("aktiv", "HcGruppeStatus.aktiv")]
    summe_leistung = sum(g.leistung_kw for g in aktive)
    summe_v = sum(g.volumenstrom_m3h or 0 for g in aktive)
    return ProjectDetailOut(
        id=project.id,
        name=project.name,
        standort=project.standort,
        kunde=project.kunde,
        beschreibung=project.beschreibung,
        status=project.status,
        base_data=project.base_data,
        created_at=project.created_at,
        updated_at=project.updated_at,
        heating_groups=groups_out,
        summe_leistung_kw=round(summe_leistung, 3),
        summe_volumenstrom_m3h=round(summe_v, 4),
        summe_volumenstrom_lh=round(summe_v * 1000, 1),
        rl_gemischt=berechne_rl_gemischt(aktive),
    )


@router.get("", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return (
        db.query(HcProject)
        .filter(HcProject.tenant_id == TENANT_ID)
        .order_by(HcProject.created_at.desc())
        .all()
    )


@router.post("", response_model=ProjectDetailOut, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = HcProject(
        tenant_id=TENANT_ID,
        name=body.name,
        standort=body.standort,
        kunde=body.kunde,
        beschreibung=body.beschreibung,
    )
    db.add(project)
    db.flush()

    bd_in = body.base_data
    bd = HcProjectBaseData(
        tenant_id=TENANT_ID,
        project_id=project.id,
        t_aussen=bd_in.t_aussen if bd_in else -8.0,
        t_innen=bd_in.t_innen if bd_in else 20.0,
        heizungssystem=bd_in.heizungssystem if bd_in else "gemischt",
        warmwasser_bedarf_kw=bd_in.warmwasser_bedarf_kw if bd_in else None,
    )
    db.add(bd)
    db.commit()
    db.refresh(project)
    return _build_detail(project)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == TENANT_ID)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return _build_detail(project)


@router.patch("/{project_id}", response_model=ProjectDetailOut)
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == TENANT_ID)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    for field in ("name", "standort", "kunde", "beschreibung", "status"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(project, field, val)
    project.updated_at = datetime.utcnow()

    if body.base_data:
        if not project.base_data:
            bd = HcProjectBaseData(tenant_id=TENANT_ID, project_id=project.id)
            db.add(bd)
            db.flush()
        for field in ("t_aussen", "t_innen", "heizungssystem", "warmwasser_bedarf_kw"):
            val = getattr(body.base_data, field, None)
            if val is not None:
                setattr(project.base_data, field, val)
        project.base_data.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(project)
    return _build_detail(project)


@router.delete("/{project_id}", status_code=204)
def archive_project(project_id: int, db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == TENANT_ID)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    project.status = "archiviert"
    project.updated_at = datetime.utcnow()
    db.commit()
