# backend/app/routers/matching.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models.user import User, Role
from ..schemas.user_schema import UserOut
from ..deps import require_roles

router = APIRouter(prefix="/experts", tags=["matching"])


@router.get("/search", response_model=List[UserOut])
def search_experts(
    fachbereich: Optional[str] = Query(None, description="Filter nach Fachbereich (z.B. Heizung)"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles([Role.kunde, Role.admin])),
):
    """
    V1: einfache Suche ohne Geodistanz.
    - listet verifizierte Experten
    - optional Filter nach Fachbereich (Substring in CSV)
    """
    q = db.query(User).filter(User.role == Role.experte, User.is_verified == True)  # noqa: E712
    if fachbereich:
        q = q.filter(User.fachbereiche.ilike(f"%{fachbereich}%"))

    experts = q.limit(limit).all()

    # fachbereiche von CSV -> Liste für das Schema
    out: List[UserOut] = []
    for u in experts:
        m = UserOut.model_validate(u)
        m.fachbereiche = u.fachbereiche.split(",") if u.fachbereiche else []
        out.append(m)
    return out
