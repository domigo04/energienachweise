# backend/app/routers/requests.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Literal

from ..database import get_db
from ..models.user import User, Role
from ..models.projects import Project, ExpertRequest, RequestStatus
from ..schemas.request_schema import RequestOut
from ..deps import current_user, require_roles

router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("/", response_model=List[RequestOut])
def create_requests(
    project_id: int,
    experten_ids: List[int],
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.kunde, Role.admin])),
):
    # Projekt prüfen + Besitz checken
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    created: List[ExpertRequest] = []
    for eid in experten_ids:
        # Duplikate vermeiden (ein Experte pro Projekt nur 1x)
        existing = (
            db.query(ExpertRequest)
            .filter(ExpertRequest.project_id == project_id, ExpertRequest.experte_id == eid)
            .first()
        )
        if existing:
            continue
        r = ExpertRequest(
            project_id=project_id,
            experte_id=eid,
            status=RequestStatus.requested,
        )
        db.add(r)
        created.append(r)

    if not created:
        raise HTTPException(status_code=400, detail="Keine neuen Anfragen erstellt (Duplikate?)")

    db.commit()
    for r in created:
        db.refresh(r)
    return created


@router.get("/mine", response_model=List[RequestOut])
def list_my_requests(
    role: Literal["kunde", "experte"] = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if role == "kunde":
        # alle Requests zu Projekten des Kunden
        q = (
            db.query(ExpertRequest)
            .join(Project, Project.id == ExpertRequest.project_id)
            .filter(Project.kunde_id == user.id)
            .order_by(ExpertRequest.created_at.desc())
        )
        return q.all()

    if role == "experte":
        q = (
            db.query(ExpertRequest)
            .filter(ExpertRequest.experte_id == user.id)
            .order_by(ExpertRequest.created_at.desc())
        )
        return q.all()

    raise HTTPException(status_code=400, detail="role muss 'kunde' oder 'experte' sein")
