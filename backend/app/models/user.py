from sqlalchemy import Boolean, Column, Integer, String, Enum
from sqlalchemy.dialects.mysql import LONGTEXT
import enum
from ..database import Base

class Role(str, enum.Enum):
    admin = "admin"
    experte = "experte"
    kunde = "kunde"

class Personentyp(str, enum.Enum):
    natuerliche_person = "natürliche Person"
    firma = "Firma"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(Role), nullable=False, default=Role.kunde)

    # Expertenfelder
    personentyp = Column(Enum(Personentyp), nullable=True)
    vorname = Column(String(120), nullable=True)
    nachname = Column(String(120), nullable=True)
    firmenname = Column(String(200), nullable=True)
    mitarbeiteranzahl = Column(Integer, nullable=True)
    fachbereiche = Column(String(255), nullable=True)  # CSV (Heizung,Wärmedämmung,…)
    berufsnachweis = Column(LONGTEXT, nullable=True)   # URL/Text

    is_verified = Column(Boolean, nullable=False, default=False)
