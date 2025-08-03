from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from app.database import Base
import enum

class ProjectStatus(str, enum.Enum):
    in_planung = "Projekt in Planung"
    ausfuehrung = "Ausführungsplanung"
    abgeschlossen = "Abgeschlossen"

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    customer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.in_planung)

    strasse = Column(String(255), nullable=True)
    plz = Column(Integer, nullable=True)
    ort = Column(String(255), nullable=False)
    gebaeudetyp = Column(String(255), nullable=False)
    kontrollart = Column(String(255), nullable=False)
    energienachweise = Column(JSON, nullable=True)

    # Beziehung zum Kunden
    kunde = relationship("User", back_populates="projekte")
