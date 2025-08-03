from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from passlib.hash import bcrypt
from pydantic import BaseModel
from ..models.user import User
from ..database import get_db
from ..auth import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginSchema(BaseModel):
    email: str
    password: str

@router.post("/login")
def login_user(data: LoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not bcrypt.verify(data.password, user.password):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")

    token = create_access_token(data={"sub": str(user.id)})

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "vorname": user.vorname or "",
        "email": user.email
    }
