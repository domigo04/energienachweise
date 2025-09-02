from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.user import User, Role
from ..models.projects import (
    Project,
    ProjectEvidence,
    Kontrolltyp as KTyp,
    ProjektStatus as PStat,
)
from ..schemas.project_schema import (
    ProjectCreate,
    ProjectOut,
    ProjectPatch,
    EvidenceCreate,
    EvidenceOut,
)
from ..deps import current_user, require_roles

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectOut)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.kunde, Role.admin])),
):
    proj = Project(
        kunde_id=user.id,
        name=data.name,
        egid=data.egid,
        parzelle=data.parzelle,
        adresse=data.adresse,
        ort=data.ort,
        kontrolltyp=KTyp(data.kontrolltyp),
        status=PStat.plan,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


@router.get("/mine", response_model=List[ProjectOut])
def list_my_projects(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.kunde, Role.admin])),
):
    q = db.query(Project)
    if user.role == Role.kunde:
        q = q.filter(Project.kunde_id == user.id)
    return q.order_by(Project.created_at.desc()).all()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return proj


@router.patch("/{project_id}", response_model=ProjectOut)
def patch_project(
    project_id: int,
    data: ProjectPatch,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if data.kontrolltyp is not None:
        proj.kontrolltyp = KTyp(data.kontrolltyp)
    if data.status is not None:
        proj.status = PStat(data.status)

    db.commit()
    db.refresh(proj)
    return proj


# ---------- Evidences ----------

@router.post("/{project_id}/evidences", response_model=EvidenceOut)
def add_evidence(
    project_id: int,
    data: EvidenceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    ev = ProjectEvidence(
        project_id=project_id,
        fachbereich=data.fachbereich,
        en_code=data.en_code,
        swiss_transfer_url=str(data.swiss_transfer_url) if data.swiss_transfer_url else None,
        required_docs=data.required_docs or [],
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/{project_id}/evidences", response_model=List[EvidenceOut])
def list_evidences(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return (
        db.query(ProjectEvidence)
        .filter(ProjectEvidence.project_id == project_id)
        .order_by(ProjectEvidence.created_at.desc())
        .all()
    )


@router.delete("/{project_id}/evidences/{evid}")
def delete_evidence(
    project_id: int,
    evid: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    ev = (
        db.query(ProjectEvidence)
        .filter(ProjectEvidence.id == evid, ProjectEvidence.project_id == project_id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Nachweis nicht gefunden")
    db.delete(ev)
    db.commit()
    return {"ok": True}