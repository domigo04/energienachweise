"""Auth-Modelle: Firma (Mandant) + Benutzer.

`tenant_id` überall im Projekt = Firma-ID. Start: eine Firma (SIREGO). Neue
Registrierungen sind `is_verified=False` und müssen vom Admin freigeschaltet
werden. Tabellennamen mit `hc_`-Präfix, damit sie nicht mit alten Marktplatz-
Tabellen (`users`) kollidieren.
"""
from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Firma(Base):
    __tablename__ = "hc_firmen"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Platzhalter fürs künftige Abomodell (z.B. Tarif nach Anzahl auswertbarer
    # Projekte) — noch keine Durchsetzung/Zahlungslogik, nur die Spalte.
    abo_plan = Column(String, default="kostenlos")
    # Abomodell: der Plan bestimmt, welche Funktionen die Firma nutzen darf.
    # `abo_plan` bleibt als Altfeld bestehen und wird nicht mehr ausgewertet.
    subscription_plan_id = Column(Integer, ForeignKey("subscription_plans.id"),
                                  nullable=True, index=True)
    plan_started_at = Column(DateTime, nullable=True)
    plan_expires_at = Column(DateTime, nullable=True)
    subscription_status = Column(String, nullable=False, default="active")
    logo_data_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="firma", cascade="all, delete-orphan")


class Role(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "hc_users"
    __table_args__ = (
        CheckConstraint(
            "role = 'admin' OR tenant_id IS NOT NULL",
            name="ck_hc_users_tenant_required_for_non_admin",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("hc_firmen.id"), nullable=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=True)
    role = Column(SAEnum(Role), default=Role.user, nullable=False)
    # Firmenrolle ist bewusst getrennt von `role`: `role=admin` ist der
    # globale Plattformadmin. `firma_role=admin` verwaltet nur die eigene Firma.
    firma_role = Column(String, default="mitglied", nullable=False)
    firma_admin_beantragt_at = Column(DateTime, nullable=True)
    firma_admin_bestaetigt_at = Column(DateTime, nullable=True)
    firma_admin_bestaetigt_von = Column(Integer, nullable=True)
    is_verified = Column(Boolean, default=False)  # Admin muss freischalten
    is_active = Column(Boolean, default=True)
    # Serverseitige Widerrufsgrenze für alle Zugriffstokens dieses Benutzers.
    # Ein Token gilt nur, solange sein `sv`-Claim diesem Wert entspricht.
    session_version = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)
    # Nicht geheime Versionskennung des zuletzt bewusst aus der Deployment-
    # Konfiguration übernommenen Adminpassworts. Sie enthält keinerlei aus dem
    # Passwort ableitbare Daten und verhindert trotzdem unbeabsichtigte Resets.
    admin_pw_seed_version = Column(String, nullable=True)

    firma = relationship("Firma", back_populates="users")
