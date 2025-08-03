from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.schemas.user_schema import CustomerRegisterSchema, UserSchema
from passlib.hash import bcrypt
from app.auth import get_current_user
from jose import jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.environ["SECRET_KEY"]
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

router = APIRouter()

@router.post("/customers/register", response_model=UserSchema)
def register_customer(user_data: CustomerRegisterSchema, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")

    hashed_pw = bcrypt.hash(user_data.password)

    new_user = User(
        email=user_data.email,
        password=hashed_pw,
        role="kunde",
        is_verified=True,
        personentyp=user_data.personentyp,
        firma=user_data.firma,
        mitarbeiteranzahl=user_data.mitarbeiteranzahl,
        gewerbe=user_data.gewerbe,
        vorname=user_data.vorname,
        nachname=user_data.nachname
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

def create_token(user_id: int, role: str):
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/customers/login")
def login_customer(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username, User.role == "kunde").first()

    if not user or not bcrypt.verify(form_data.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültige Anmeldedaten")

    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="E-Mail noch nicht bestätigt")

    token = create_token(user.id, user.role)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "is_verified": user.is_verified
        }
    }

@router.get("/customers/projects")
def get_customer_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "kunde":
        raise HTTPException(status_code=403, detail="Zugriff verweigert")

    return db.query(Project).filter(Project.customer_id == current_user.id).all()
