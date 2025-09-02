# backend/app/models/projects.py
from sqlalchemy import (
    Column, Integer, String, Enum, DateTime, ForeignKey, Text, Numeric, JSON, func, Index
)
from sqlalchemy.orm import relationship
import enum

from ..database import Base

class Kontrolltyp(str, enum.Enum):
    pk = "pk"          # Private Kontrolle
    ak = "ak"          # Ausführungskontrolle
    beides = "beides"

class ProjektStatus(str, enum.Enum):
    plan = "plan"
    ausf = "ausf"
    done = "done"

class RequestStatus(str, enum.Enum):
    requested = "requested"
    responded = "responded"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    kunde_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(200), nullable=False)
    egid = Column(String(32), nullable=True)
    parzelle = Column(String(64), nullable=True)
    adresse = Column(String(255), nullable=True)
    ort = Column(String(120), nullable=True)

    kontrolltyp = Column(Enum(Kontrolltyp), nullable=False)
    status = Column(Enum(ProjektStatus), nullable=False, default=ProjektStatus.plan)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    evidences = relationship("ProjectEvidence", back_populates="project", cascade="all, delete-orphan")
    requests = relationship("ExpertRequest", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_projects_kunde_id_created", "kunde_id", "created_at"),
    )

class ProjectEvidence(Base):
    __tablename__ = "project_evidences"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    fachbereich = Column(String(50), nullable=False)
    en_code = Column(String(32), nullable=False)
    swiss_transfer_url = Column(String(500), nullable=True)
    required_docs = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    project = relationship("Project", back_populates="evidences")

class ExpertRequest(Base):
    __tablename__ = "expert_requests"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    experte_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(Enum(RequestStatus), nullable=False, default=RequestStatus.requested)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    project = relationship("Project", back_populates="requests")
    quotes = relationship("ExpertQuote", back_populates="request", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_requests_project_expert", "project_id", "experte_id", unique=True),
    )

class ExpertQuote(Base):
    __tablename__ = "expert_quotes"

    id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey("expert_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    preis = Column(Numeric(10, 2), nullable=False)
    kommentar = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    request = relationship("ExpertRequest", back_populates="quotes")
