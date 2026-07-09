"""Auth-Modelle: Firma (Mandant) + Benutzer.

`tenant_id` überall im Projekt = Firma-ID. Start: eine Firma (SIREGO). Neue
Registrierungen sind `is_verified=False` und müssen vom Admin freigeschaltet
werden. Tabellennamen mit `hc_`-Präfix, damit sie nicht mit alten Marktplatz-
Tabellen (`users`) kollidieren.
"""
from datetime import datetime
import enum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class Firma(Base):
    __tablename__ = "hc_firmen"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    # Platzhalter fürs künftige Abomodell (z.B. Tarif nach Anzahl auswertbarer
    # Projekte) — noch keine Durchsetzung/Zahlungslogik, nur die Spalte.
    abo_plan = Column(String, default="kostenlos")
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="firma", cascade="all, delete-orphan")


class Role(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "hc_users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("hc_firmen.id"), default=1, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=True)
    role = Column(SAEnum(Role), default=Role.user, nullable=False)
    is_verified = Column(Boolean, default=False)  # Admin muss freischalten
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    firma = relationship("Firma", back_populates="users")
