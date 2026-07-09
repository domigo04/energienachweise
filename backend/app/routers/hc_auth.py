"""Auth-Router: Registrierung (mit Admin-Freischaltung), Login (JWT), eigenes
Profil (ansehen + ändern), Admin-Benutzerverwaltung. Alle Endpunkte unter
/api/v1/auth/.

Registrierung trennt Firma vs. Einzelperson (tenant_id): eine Einzelperson
bekommt eine eigene, private Firma (niemand sonst sieht ihre Auswertungsdaten);
bei "Firma" wird nach Name gesucht — existiert sie, tritt man bei, sonst wird
sie neu angelegt. Freischaltung bleibt bei einem einzigen globalen Admin
(Dominic) — eigene Firmen-Admins sind ein späterer Ausbauschritt.
"""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, require_admin, verify_password
from app.database import get_db
from app.models.auth import Firma, Role, User

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    konto_typ: Literal["einzelperson", "firma"] = "einzelperson"
    firmenname: Optional[str] = None


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
    firma_name: Optional[str] = None
    abo_plan: Optional[str] = None
    model_config = {"from_attributes": True}


def _user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.firma_name = user.firma.name if user.firma else None
    out.abo_plan = user.firma.abo_plan if user.firma else None
    return out


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserPatch(BaseModel):
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    role: Optional[Role] = None


class MePatch(BaseModel):
    name: Optional[str] = None
    aktuelles_passwort: Optional[str] = None
    neues_passwort: Optional[str] = None


def _firma_fuer_registrierung(body: RegisterIn, db: Session) -> Firma:
    if body.konto_typ == "einzelperson":
        firma = Firma(name=f"{(body.name or body.email).strip()} (Einzelperson)")
        db.add(firma)
        db.flush()
        return firma

    name_norm = (body.firmenname or "").strip()
    if not name_norm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte einen Firmennamen angeben.")
    firma = db.query(Firma).filter(func.lower(Firma.name) == name_norm.lower()).first()
    if not firma:
        firma = Firma(name=name_norm)
        db.add(firma)
        db.flush()
    return firma


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Diese E-Mail ist bereits registriert.")
    firma = _firma_fuer_registrierung(body, db)
    user = User(
        tenant_id=firma.id,
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
    return TokenOut(access_token=token, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: MePatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.name is not None:
        user.name = body.name
    if body.neues_passwort:
        if not body.aktuelles_passwort or not verify_password(body.aktuelles_passwort, user.password_hash):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aktuelles Passwort ist falsch.")
        user.password_hash = hash_password(body.neues_passwort)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/admin/users", response_model=List[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [_user_out(u) for u in users]


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
    return _user_out(user)
