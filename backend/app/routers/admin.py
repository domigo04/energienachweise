from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.user import User, RoleEnum
from app.schemas.user_schema import UserSchema, ExpertUpdateSchema
from pydantic import BaseModel
from dotenv import load_dotenv
import os

router = APIRouter(prefix="/admin", tags=["admin"])

# .env laden
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

# --- Admin Login ---
class AdminLoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
def admin_login(data: AdminLoginRequest):
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_INITIAL_PASSWORD")

    if data.email != admin_email or data.password != admin_password:
        raise HTTPException(status_code=401, detail="Falsche Zugangsdaten")
    
    return {"message": "Login erfolgreich!", "role": "admin"}

# --- Alle Experten anzeigen ---
@router.get("/experts", response_model=List[UserSchema])
def list_experts(db: Session = Depends(get_db)):
    experts = db.query(User).filter(User.role == RoleEnum.experte).all()
    return [UserSchema.model_validate(e) for e in experts]

# --- Experte verifizieren ---
@router.patch("/experts/{expert_id}/verify")
def verify_expert(expert_id: int, db: Session = Depends(get_db)):
    expert = db.query(User).filter(User.id == expert_id, User.role == RoleEnum.experte).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")
    expert.is_verified = True
    db.commit()
    return {"message": "Experte verifiziert"}

# --- Experte löschen ---
@router.delete("/experts/{expert_id}")
def delete_expert(expert_id: int, db: Session = Depends(get_db)):
    expert = db.query(User).filter(User.id == expert_id, User.role == RoleEnum.experte).first()
    if not expert:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")
    db.delete(expert)
    db.commit()
    return {"message": "Experte gelöscht"}

# --- Einzelnes Expertenprofil anzeigen ---
@router.get("/experten/{expert_id}", response_model=UserSchema)
def get_experte_detail(expert_id: int, db: Session = Depends(get_db)):
    experte = db.query(User).filter(User.id == expert_id, User.role == RoleEnum.experte).first()
    if not experte:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")
    return experte

# --- Expertenprofil bearbeiten ---
@router.put("/experten/{expert_id}")
def update_experte(
    expert_id: int,
    data: ExpertUpdateSchema,
    db: Session = Depends(get_db)
):
    experte = db.query(User).filter(User.id == expert_id, User.role == RoleEnum.experte).first()

    if not experte:
        raise HTTPException(status_code=404, detail="Experte nicht gefunden")

    experte.personentyp = data.personentyp
    experte.fachbereiche = data.fachbereiche
    experte.berufsnachweis = data.berufsnachweis
    experte.mitarbeiteranzahl = data.mitarbeiteranzahl

    db.commit()
    db.refresh(experte)
    return {"message": "Experte aktualisiert", "user_id": experte.id}

# --- Alle Kunden anzeigen ---
@router.get("/kunden", response_model=List[UserSchema])
def list_customers(db: Session = Depends(get_db)):
    kunden = db.query(User).filter(User.role == RoleEnum.kunde).all()
    return [UserSchema.model_validate(k) for k in kunden]

# --- Kunden löschen ---
@router.delete("/kunden/{kunde_id}")
def delete_customer(kunde_id: int, db: Session = Depends(get_db)):
    kunde = db.query(User).filter(User.id == kunde_id, User.role == RoleEnum.kunde).first()
    if not kunde:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    db.delete(kunde)
    db.commit()
    return {"message": "Kunde gelöscht"}
