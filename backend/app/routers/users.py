from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import user as user_model
from passlib.hash import bcrypt
from pydantic import BaseModel
from typing import List
from ..schemas.user_schema import UserSchema  # falls du ein Schema nutzt

router = APIRouter(prefix="/admin", tags=["admin"])

class AdminLoginSchema(BaseModel):
    email: str
    password: str

@router.post("/login")
def admin_login(data: AdminLoginSchema, db: Session = Depends(get_db)):
    admin = db.query(user_model.User).filter_by(email=data.email, role="admin").first()
    if not admin or not bcrypt.verify(data.password, admin.password):
        raise HTTPException(status_code=401, detail="Ungültige Login-Daten")
    return {"message": "Login erfolgreich", "admin_id": admin.id}

@router.get("/users")
def get_all_users(db: Session = Depends(get_db)):
    return db.query(user_model.User).all()

@router.get("/experten")
def get_experten(db: Session = Depends(get_db)):
    return db.query(user_model.User).filter(user_model.User.role == "experte").all()

@router.get("/kunden")
def get_kunden(db: Session = Depends(get_db)):
    return db.query(user_model.User).filter(user_model.User.role == "kunde").all()

@router.get("/experten/unbestaetigt", response_model=List[UserSchema])
def get_unverified_experts(db: Session = Depends(get_db)):
    return db.query(user_model.User).filter(
        user_model.User.role == "experte",
        user_model.User.is_verified == False
    ).all()