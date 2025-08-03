from sqlalchemy import Column, Integer, String, Boolean, Enum as SqlEnum
from sqlalchemy.sql import func
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from app.database import Base
import enum

# --- Enums ---
class RoleEnum(str, enum.Enum):
    admin = "admin"
    kunde = "kunde"
    experte = "experte"

class PersonentypEnum(str, enum.Enum):
    natuerliche_person = "natuerliche_person"
    firma = "firma"

# --- User-Modell ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(SqlEnum(RoleEnum), nullable=False)
    is_verified = Column(Boolean, default=False)

    # Gemeinsame Felder
    personentyp = Column(SqlEnum(PersonentypEnum), nullable=False)

    # Nur für Experten
    fachbereiche = Column(JSON, nullable=True, default=[])
    berufsnachweis = Column(String, nullable=True)
    mitarbeiteranzahl = Column(Integer, nullable=True)

    # Nur für Kunden (Firma)
    firma = Column(String, nullable=True)
    gewerbe = Column(String, nullable=True)

    # Nur für Kunden (natürliche Person)
    vorname = Column(String, nullable=True)
    nachname = Column(String, nullable=True)

    # Beziehung zu Projekten
    projekte = relationship("Project", back_populates="kunde")
