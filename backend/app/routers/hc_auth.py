"""Auth-Router: Registrierung (mit Admin-Freischaltung), Login (JWT), Profil,
Admin-Benutzerverwaltung. Alle Endpunkte unter /api/v1/auth/.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, require_admin, verify_password
from app.database import get_db
from app.models.auth import Role, User

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

DEFAULT_TENANT = 1


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: Optional[str]
    role: Role
    is_verified: bool
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserPatch(BaseModel):
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    role: Optional[Role] = None


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Diese E-Mail ist bereits registriert.")
    user = User(
        tenant_id=DEFAULT_TENANT,
        email=email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=Role.user,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    return {"ok": True, "message": "Anfrage gesendet. Ein Admin schaltet dein Konto frei."}


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-Mail oder Passwort falsch.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto ist deaktiviert.")
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto noch nicht freigeschaltet — bitte auf die Freischaltung warten.")
    token = create_access_token(user.id)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/admin/users", response_model=List[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Benutzer nicht gefunden")
    for field in ("is_verified", "is_active", "role"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(user, field, val)
    db.commit()
    db.refresh(user)
    return user
