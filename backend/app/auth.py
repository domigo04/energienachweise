"""Auth-Helfer: Passwort-Hash (bcrypt), JWT-Token (PyJWT) und FastAPI-
Abhängigkeiten für geschützte Endpunkte.

- get_current_user: verlangt gültiges Bearer-Token, lädt den Benutzer,
  lehnt inaktive / nicht freigeschaltete Konten ab.
- require_admin: zusätzlich Admin-Rolle.
"""
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt  # PyJWT
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import Role, User

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
if SECRET_KEY == "dev-secret-change-me":
    # Sicherheits-Review 2026-07-19: ohne eigene SECRET_KEY sind alle Login-
    # Tokens mit einem öffentlich bekannten Schlüssel signiert und fälschbar.
    # Sichtbar im Log statt einer stillen Schwachstelle — kein harter Abbruch,
    # damit ein Server ohne gesetzte Variable nicht überraschend down geht.
    print("[WARNUNG] SECRET_KEY nicht gesetzt — unsicherer Code-Default aktiv. "
          "Für Produktion zwingend eine eigene, geheime Umgebungsvariable setzen.")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 Tage

_bearer = HTTPBearer(auto_error=True)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Nicht angemeldet")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except Exception:
        raise cred_exc
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise cred_exc
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto noch nicht freigeschaltet")
    if user.role != Role.admin and user.firma and not user.firma.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Die Firma ist deaktiviert")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Admins")
    return user


def ist_firma_admin(user: User) -> bool:
    """Plattformadmins haben innerhalb ihrer Firma ebenfalls Firmenadminrechte."""
    return user.role == Role.admin or user.firma_role == "admin"


def require_firma_admin(user: User = Depends(get_current_user)) -> User:
    if not ist_firma_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Firmenadmins")
    return user
