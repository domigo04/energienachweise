# backend/app/routers/quotes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

from ..database import get_db
from ..models.user import User, Role
from ..models.projects import (
    ExpertRequest,
    ExpertQuote,
    Project,
    RequestStatus,
    ProjektStatus,
)
from ..schemas.quote_schema import QuoteOut
from ..deps import current_user, require_roles

router = APIRouter(prefix="/quotes", tags=["quotes"])


class QuoteCreate(BaseModel):
    preis: float = Field(..., ge=0)
    kommentar: Optional[str] = None


@router.post("/requests/{request_id}", response_model=QuoteOut)
def create_quote(
    request_id: int,
    data: QuoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.experte, Role.admin])),
):
    # Request prüfen: gehört dem Experten?
    req = db.query(ExpertRequest).filter(ExpertRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request nicht gefunden")
    if user.role != Role.admin and req.experte_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Status auf responded setzen (falls noch requested)
    if req.status == RequestStatus.requested:
        req.status = RequestStatus.responded

    quote = ExpertQuote(
        request_id=request_id,
        preis=data.preis,
        kommentar=data.kommentar,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return quote


@router.post("/{quote_id}/accept")
def accept_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.kunde, Role.admin])),
):
    quote = (
        db.query(ExpertQuote)
        .join(ExpertRequest, ExpertRequest.id == ExpertQuote.request_id)
        .join(Project, Project.id == ExpertRequest.project_id)
        .filter(ExpertQuote.id == quote_id)
        .first()
    )
    if not quote:
        raise HTTPException(status_code=404, detail="Offerte nicht gefunden")

    # Projekt + Request laden (für Besitz/Status)
    req = db.query(ExpertRequest).filter(ExpertRequest.id == quote.request_id).first()
    proj = db.query(Project).filter(Project.id == req.project_id).first()
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Diesen Request akzeptieren, andere Requests des Projekts ablehnen
    req.status = RequestStatus.accepted
    db.query(ExpertRequest).filter(
        ExpertRequest.project_id == proj.id,
        ExpertRequest.id != req.id,
    ).update({ExpertRequest.status: RequestStatus.rejected})

    # Projektstatus auf "ausf" setzen
    proj.status = ProjektStatus.ausf

    db.commit()
    return {"ok": True}


@router.post("/{quote_id}/reject")
def reject_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.kunde, Role.admin])),
):
    quote = (
        db.query(ExpertQuote)
        .join(ExpertRequest, ExpertRequest.id == ExpertQuote.request_id)
        .join(Project, Project.id == ExpertRequest.project_id)
        .filter(ExpertQuote.id == quote_id)
        .first()
    )
    if not quote:
        raise HTTPException(status_code=404, detail="Offerte nicht gefunden")

    req = db.query(ExpertRequest).filter(ExpertRequest.id == quote.request_id).first()
    proj = db.query(Project).filter(Project.id == req.project_id).first()
    if user.role != Role.admin and proj.kunde_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    req.status = RequestStatus.rejected
    db.commit()
    return {"ok": True}
