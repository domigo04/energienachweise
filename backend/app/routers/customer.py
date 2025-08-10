from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User, Role
from ..schemas.user_schema import CustomerRegister, UserOut
from ..auth import hash_password

router = APIRouter(prefix="/customers", tags=["customers"])

@router.post("/register", response_model=UserOut)
def customer_register(data: CustomerRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="E-Mail bereits vergeben")
    user = User(email=data.email, password_hash=hash_password(data.password), role=Role.kunde, is_verified=True)
    db.add(user); db.commit(); db.refresh(user)
    return UserOut.model_validate(user)
