from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal

class UserBase(BaseModel):
    email: EmailStr

class UserOut(UserBase):
    id: int
    role: Literal["admin","experte","kunde"]
    is_verified: bool
    vorname: Optional[str] = None
    nachname: Optional[str] = None
    firmenname: Optional[str] = None
    personentyp: Optional[Literal["natürliche Person","Firma"]] = None
    fachbereiche: Optional[List[str]] = None
    mitarbeiteranzahl: Optional[int] = None
    berufsnachweis: Optional[str] = None

    class Config:
        from_attributes = True

class ExpertRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    personentyp: Literal["natürliche Person","Firma"]
    vorname: Optional[str] = None
    nachname: Optional[str] = None
    firmenname: Optional[str] = None
    fachbereiche: List[str]
    mitarbeiteranzahl: Optional[int] = None
    berufsnachweis: Optional[str] = None

class CustomerRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
