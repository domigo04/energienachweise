"""B1 — LV-Import-Datenmodell. Getrennt von RefProjekt: Importdaten werden erst
NACH ausdrücklicher Freigabe (B11) in die Referenzstruktur übernommen. Nicht
freigegebene Imports dürfen nie in der Kostenschätzung rechnen."""
from datetime import datetime
import enum

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, Boolean,
)
from sqlalchemy.orm import relationship

from app.database import Base


class LvImportStatus(str, enum.Enum):
    uploaded = "uploaded"
    extracted = "extracted"
    review = "review"
    approved = "approved"
    failed = "failed"


class LvImport(Base):
    __tablename__ = "lv_imports"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), nullable=True, index=True)
    filename = Column(String, nullable=False)
    file_hash = Column(String, nullable=False, index=True)     # SHA-256 des Originals
    original_pdf = Column(LargeBinary, nullable=True)          # Original nie überschreiben
    page_count = Column(Integer, nullable=False, default=0)
    is_searchable = Column(Boolean, nullable=False, default=True)  # born-digital vs. Bild-PDF
    status = Column(String, nullable=False, default=LvImportStatus.uploaded.value)
    ref_projekt_id = Column(Integer, nullable=True)            # gesetzt nach Freigabe
    created_by = Column(Integer, nullable=True, index=True)
    created_by_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    features = relationship("LvImportFeature", back_populates="lv_import",
                            cascade="all, delete-orphan")
    costs = relationship("LvImportCost", back_populates="lv_import",
                         cascade="all, delete-orphan")


class LvImportFeature(Base):
    __tablename__ = "lv_import_features"

    id = Column(Integer, primary_key=True, index=True)
    lv_import_id = Column(Integer, ForeignKey("lv_imports.id"), nullable=False, index=True)
    key = Column(String, nullable=False)          # gemeinsame Feature-Sprache (feature_keys)
    value = Column(String, nullable=True)          # erkannter Wert (Text; None = unbekannt)
    unit = Column(String, nullable=True)
    confidence = Column(String, nullable=True)     # high | medium | low
    source_page = Column(Integer, nullable=True)
    source_text = Column(Text, nullable=True)
    confirmed_value = Column(String, nullable=True) # vom Nutzer bestätigt/korrigiert
    confirmed = Column(Boolean, nullable=False, default=False)

    lv_import = relationship("LvImport", back_populates="features")


class LvImportCost(Base):
    __tablename__ = "lv_import_costs"

    id = Column(Integer, primary_key=True, index=True)
    lv_import_id = Column(Integer, ForeignKey("lv_imports.id"), nullable=False, index=True)
    bkp_nr = Column(String, nullable=False)
    detected_amount = Column(Float, nullable=True)
    confirmed_amount = Column(Float, nullable=True)  # später massgebend (B8)
    confidence = Column(String, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_text = Column(Text, nullable=True)

    lv_import = relationship("LvImport", back_populates="costs")
