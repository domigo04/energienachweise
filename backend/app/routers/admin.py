from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.user import User, Role
from ..schemas.user_schema import UserOut
from ..auth import decode_token

router = APIRouter(prefix="/admin", tags=["admin"])

def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = decode_token(authorization.split(" ",1)[1])
    if payload.get("role") != Role.admin.value:
        raise HTTPException(status_code=403, detail="Admin only")
    return payload

@router.get("/experts/unverified", response_model=List[UserOut])
def list_unverified(db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    users = db.query(User).filter(User.role==Role.experte, User.is_verified==False).all()
    # fachbereiche als Liste
    result = []
    for u in users:
        out = UserOut.model_validate(u)
        out.fachbereiche = u.fachbereiche.split(",") if u.fachbereiche else []
        result.append(out)
    return result

@router.post("/experts/{expert_id}/verify", response_model=UserOut)
def verify_expert(expert_id: int, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    user = db.query(User).filter(User.id==expert_id, User.role==Role.experte).first()
    if not user:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")
    user.is_verified = True
    db.commit(); db.refresh(user)
    out = UserOut.model_validate(user)
    out.fachbereiche = user.fachbereiche.split(",") if user.fachbereiche else []
    return out
