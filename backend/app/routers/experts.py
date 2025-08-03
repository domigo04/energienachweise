from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from passlib.context import CryptContext
from datetime import timedelta

from app.database import get_db
from app.models.user import User, RoleEnum, PersonentypEnum
from app.auth import create_access_token
from app.schemas.user_schema import ExpertRegisterSchema


router = APIRouter(
    prefix="/experts",
    tags=["experts"]
)

# 🔐 Passwort-Kontext initialisieren
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ✅ LOGIN – mit Token
@router.post("/login")
def login_expert(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    expert = db.query(User).filter_by(email=form_data.username, role=RoleEnum.experte).first()

    if not expert:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültige E-Mail")

    if not verify_password(form_data.password, expert.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Falsches Passwort")

    if not expert.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Experte noch nicht verifiziert")

    access_token = create_access_token(
        data={"sub": str(expert.id), "role": expert.role},
        expires_delta=timedelta(minutes=10080)  # 7 Tage
    )

    return {
        "access_token": access_token,
        "user": {
            "id": expert.id,
            "email": expert.email,
            "role": expert.role,
            "is_verified": expert.is_verified
        }
    }



@router.post("/register")
def register_expert(data: ExpertRegisterSchema, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=data.email).first():
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")

    hashed_pw = hash_password(data.password)

    expert = User(
        email=data.email,
        password=hashed_pw,
        role=RoleEnum.experte,
        is_verified=False,
        personentyp=data.personentyp,
        fachbereiche=data.fachbereiche,
        berufsnachweis=data.berufsnachweis.strip() if data.berufsnachweis else None,
        mitarbeiteranzahl=data.mitarbeiteranzahl if data.personentyp == PersonentypEnum.firma else None,
        firma=data.firma if data.personentyp == PersonentypEnum.firma else None,
        vorname=data.vorname if data.personentyp == PersonentypEnum.natuerliche_person else None,
        nachname=data.nachname if data.personentyp == PersonentypEnum.natuerliche_person else None
    )

    db.add(expert)
    db.commit()
    db.refresh(expert)

    return {"message": "Registrierung erfolgreich", "user_id": expert.id}


# ✅ PROFIL LADEN
@router.get("/{expert_id}")
def get_expert_profile(expert_id: int, db: Session = Depends(get_db)):
    expert = db.query(User).filter(User.id == expert_id, User.role == RoleEnum.experte).first()

    if not expert:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")

    return {
        "id": expert.id,
        "email": expert.email,
        "personentyp": expert.personentyp,
        "fachbereiche": expert.fachbereiche,
        "berufsnachweis": expert.berufsnachweis,
        "mitarbeiteranzahl": expert.mitarbeiteranzahl,
        "is_verified": expert.is_verified
    }


# ✅ PROFIL AKTUALISIEREN
class ExpertUpdateSchema(BaseModel):
    personentyp: Optional[PersonentypEnum]
    fachbereiche: Optional[List[str]]
    berufsnachweis: Optional[str]
    mitarbeiteranzahl: Optional[int]

@router.patch("/{expert_id}")
def update_expert(expert_id: int, data: ExpertUpdateSchema, db: Session = Depends(get_db)):
    expert = db.query(User).filter(User.id == expert_id, User.role == RoleEnum.experte).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")

    # personentyp wird direkt zugewiesen (Pydantic wandelt korrekt um)
    if data.personentyp:
        expert.personentyp = data.personentyp
        # Falls Typ "natürliche Person", Mitarbeiteranzahl zurücksetzen
        if data.personentyp == PersonentypEnum.natuerliche_person:
            expert.mitarbeiteranzahl = None

    # Fachbereiche (auch leere Liste speichern)
    if data.fachbereiche is not None:
        expert.fachbereiche = data.fachbereiche

    if data.berufsnachweis is not None:
        expert.berufsnachweis = data.berufsnachweis.strip() or None

    if data.mitarbeiteranzahl is not None:
        expert.mitarbeiteranzahl = data.mitarbeiteranzahl

    db.commit()
    db.refresh(expert)

    return {
        "message": "Profil aktualisiert",
        "expert": {
            "id": expert.id,
            "email": expert.email,
            "personentyp": expert.personentyp,
            "fachbereiche": expert.fachbereiche,
            "berufsnachweis": expert.berufsnachweis,
            "mitarbeiteranzahl": expert.mitarbeiteranzahl,
            "is_verified": expert.is_verified
        }
    }
