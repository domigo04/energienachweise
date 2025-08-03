from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from enum import Enum

# --- Enums ---
class RoleEnum(str, Enum):
    admin = "admin"
    kunde = "kunde"
    experte = "experte"

class PersonentypEnum(str, Enum):
    natuerliche_person = "natuerliche_person"
    firma = "firma"

# --- Anzeige eines Users ---
class UserSchema(BaseModel):
    id: int
    email: EmailStr
    role: RoleEnum
    is_verified: bool

    # Gemeinsame Felder
    personentyp: Optional[PersonentypEnum] = None

    # Expertenfelder
    fachbereiche: Optional[List[str]] = []
    berufsnachweis: Optional[str] = None
    mitarbeiteranzahl: Optional[int] = None

    # Kundendaten (Firma oder natürliche Person)
    firma: Optional[str] = None
    gewerbe: Optional[str] = None
    vorname: Optional[str] = None
    nachname: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# --- Registrierung Kunden ---
class CustomerRegisterSchema(BaseModel):
    email: EmailStr
    password: str
    personentyp: PersonentypEnum
    firma: Optional[str] = None
    mitarbeiteranzahl: Optional[int] = None
    gewerbe: Optional[str] = None
    vorname: Optional[str] = None
    nachname: Optional[str] = None

# --- Registrierung Experten ---
class ExpertRegisterSchema(BaseModel):
    email: EmailStr
    password: str
    personentyp: PersonentypEnum
    fachbereiche: List[str]
    berufsnachweis: Optional[str] = None
    firma: Optional[str] = None
    mitarbeiteranzahl: Optional[int] = None
    vorname: Optional[str] = None
    nachname: Optional[str] = None

# --- Expertenprofil aktualisieren ---
class ExpertUpdateSchema(BaseModel):
    personentyp: Optional[PersonentypEnum]
    fachbereiche: Optional[List[str]]
    berufsnachweis: Optional[str]
    mitarbeiteranzahl: Optional[int]
