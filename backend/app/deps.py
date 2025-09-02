# backend/app/deps.py
from typing import Optional, Iterable
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .auth import decode_token
from .models.user import User, Role


def current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    payload = decode_token(authorization.split(" ", 1)[1])
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == int(uid)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.role == Role.experte and not user.is_verified:
        raise HTTPException(status_code=403, detail="Account in Prüfung – noch nicht freigegeben")
    return user


def require_roles(roles: Iterable[Role]):
    roles = set(roles)

    def _dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _dep
