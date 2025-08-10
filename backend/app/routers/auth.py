from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User, Role
from ..schemas.auth_schema import LoginIn, Token
from ..auth import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=Token)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Experten dürfen sich nur einloggen, wenn verifiziert
    if user.role == Role.experte and not user.is_verified:
        raise HTTPException(status_code=403, detail="Account in Prüfung – noch nicht freigegeben")

    token = create_access_token(str(user.id), user.role.value)
    return {"access_token": token}
