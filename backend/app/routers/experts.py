from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.user import User, Role
from ..schemas.user_schema import ExpertRegister, UserOut
from ..auth import hash_password

router = APIRouter(prefix="/experts", tags=["experts"])

@router.post("/register", response_model=UserOut)
def expert_register(data: ExpertRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="E-Mail bereits vergeben")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role=Role.experte,
        personentyp=data.personentyp,
        vorname=data.vorname,
        nachname=data.nachname,
        firmenname=data.firmenname,
        fachbereiche=",".join(data.fachbereiche),
        mitarbeiteranzahl=data.mitarbeiteranzahl,
        berufsnachweis=data.berufsnachweis,
        is_verified=False
    )
    db.add(user); db.commit(); db.refresh(user)

    out = UserOut.model_validate(user)
    out.fachbereiche = user.fachbereiche.split(",") if user.fachbereiche else []
    return out
