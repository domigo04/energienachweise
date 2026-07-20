from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import Role, User
from app.models.heizungscockpit import HcHeatingGroup, HcProject, HcProjectBaseData
from app.models.kv import Kostenschaetzung
from app.data.projektfreigaben import kostenschaetzung_freigabe, leere_kostenschaetzung_freigabe
from app.schemas.hc_schemas import (
    HeatingGroupOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdate,
)
from app.calculations.heizgruppen import berechne_rl_gemischt, pruefe_plausibilitaet

router = APIRouter(prefix="/api/v1/projects", tags=["Heizungscockpit – Projekte"])


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


def _owned_query(db: Session, user: User):
    """Projekte der Firma; Nicht-Admins sehen nur ihre eigenen (Projekte pro User)."""
    q = db.query(HcProject).filter(HcProject.tenant_id == user.tenant_id)
    if user.role != Role.admin:
        q = q.filter(HcProject.erstellt_von == user.id)
    return q


def _get_owned(db: Session, user: User, project_id: int) -> HcProject:
    project = _owned_query(db, user).filter(HcProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return project


@router.get("", response_model=List[ProjectOut])
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _owned_query(db, user).order_by(HcProject.created_at.desc()).all()


@router.post("", response_model=ProjectDetailOut, status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = HcProject(
        tenant_id=user.tenant_id,
        erstellt_von=user.id,
        name=body.name,
        standort=body.standort,
        kunde=body.kunde,
        beschreibung=body.beschreibung,
    )
    db.add(project)
    db.flush()

    bd_in = body.base_data
    bd = HcProjectBaseData(
        tenant_id=user.tenant_id,
        project_id=project.id,
        t_aussen=bd_in.t_aussen if bd_in else -8.0,
        t_innen=bd_in.t_innen if bd_in else 20.0,
        heizungssystem=bd_in.heizungssystem if bd_in else "gemischt",
        warmwasser_bedarf_kw=bd_in.warmwasser_bedarf_kw if bd_in else None,
        gebaeudekategorie=bd_in.gebaeudekategorie if bd_in else None,
        klimastation=bd_in.klimastation if bd_in else None,
    )
    db.add(bd)
    db.commit()
    db.refresh(project)
    return _build_detail(project)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _build_detail(_get_owned(db, user, project_id))


@router.get("/{project_id}/freigaben")
def get_project_freigaben(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Leichte Statusübersicht; lädt bewusst weder Ergebnis noch Referenzdetails."""
    _get_owned(db, user, project_id)
    ks = db.query(Kostenschaetzung).filter(
        Kostenschaetzung.project_id == project_id,
        Kostenschaetzung.tenant_id == user.tenant_id,
    ).first()
    item = kostenschaetzung_freigabe(ks.inputs_json, ks.updated_at) if ks else leere_kostenschaetzung_freigabe()
    return {
        "freigaben": [item],
        "anzahl_freigegeben": int(item["freigegeben"]),
        "anzahl_module": 1,
    }


@router.patch("/{project_id}", response_model=ProjectDetailOut)
def update_project(project_id: int, body: ProjectUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_owned(db, user, project_id)

    for field in ("name", "standort", "kunde", "beschreibung", "status"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(project, field, val)
    project.updated_at = datetime.utcnow()

    if body.base_data:
        if not project.base_data:
            bd = HcProjectBaseData(tenant_id=user.tenant_id, project_id=project.id)
            db.add(bd)
            db.flush()
        for field in ("t_aussen", "t_innen", "heizungssystem", "warmwasser_bedarf_kw", "gebaeudekategorie", "klimastation"):
            val = getattr(body.base_data, field, None)
            if val is not None:
                setattr(project.base_data, field, val)
        project.base_data.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(project)
    return _build_detail(project)


@router.delete("/{project_id}", status_code=204)
def archive_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_owned(db, user, project_id)
    project.status = "archiviert"
    project.updated_at = datetime.utcnow()
    db.commit()


@router.delete("/archiviert/alle")
def delete_all_archived(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Löscht alle EIGENEN archivierten Projekte endgültig (kein firmenweiter
    Nuke-Knopf — jeder räumt nur seine eigenen archivierten Projekte weg)."""
    archivierte = _owned_query(db, user).filter(HcProject.status == "archiviert").all()
    ids = [p.id for p in archivierte]
    if ids:
        db.query(Kostenschaetzung).filter(Kostenschaetzung.project_id.in_(ids)).delete(synchronize_session=False)
        for p in archivierte:
            db.delete(p)
        db.commit()
    return {"geloescht": len(ids)}


@router.delete("/{project_id}/endgueltig", status_code=204)
def delete_project_permanent(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Löscht ein Projekt wirklich (nicht nur archivieren). Eine evtl.
    verknüpfte Kostenschätzung wird zuerst gelöscht — dafür gibt es keine
    ORM-Kaskade (Kostenschaetzung.project_id ist ein reiner FK ohne
    relationship auf HcProject)."""
    project = _get_owned(db, user, project_id)
    db.query(Kostenschaetzung).filter(Kostenschaetzung.project_id == project_id).delete()
    db.delete(project)
    db.commit()
