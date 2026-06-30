from datetime import datetime
import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base


class HcProjectStatus(str, enum.Enum):
    aktiv = "aktiv"
    archiviert = "archiviert"


class HcHeizungsSystem(str, enum.Enum):
    fbh = "FBH"
    hk = "HK"
    gemischt = "gemischt"


class HcGruppeTyp(str, enum.Enum):
    fbh = "FBH"
    hk = "HK"
    lufterhitzer = "Lufterhitzer"
    bww = "BWW"
    lueftungsregister = "Lueftungsregister"
    wandheizung = "Wandheizung"
    tabs = "TABS"
    konvektoren = "Konvektoren"


class HcGruppeStatus(str, enum.Enum):
    aktiv = "aktiv"
    inaktiv = "inaktiv"
    ignoriert = "ignoriert"


class HcModulTyp(str, enum.Enum):
    heizgruppen = "HEIZGRUPPEN"
    volumenstrom = "VOLUMENSTROM"
    kvs_auslegung = "KVS_AUSLEGUNG"
    druckverlust = "DRUCKVERLUST"
    waermeleistung = "WAERMELEISTUNG"
    bww = "BWW"
    expansionsgefaess = "EXPANSIONSGEFAESS"
    erdsonden = "ERDSONDEN"
    jahresenergie = "JAHRESENERGIE"
    ravel_wirtschaftlichkeit = "RAVEL_WIRTSCHAFTLICHKEIT"
    heizdiagramm = "HEIZDIAGRAMM"


class HcProject(Base):
    __tablename__ = "hc_projects"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    name = Column(String, nullable=False)
    standort = Column(String, nullable=True)
    kunde = Column(String, nullable=True)
    beschreibung = Column(Text, nullable=True)
    status = Column(SAEnum(HcProjectStatus), default=HcProjectStatus.aktiv)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    base_data = relationship("HcProjectBaseData", back_populates="project", uselist=False, cascade="all, delete-orphan")
    heating_groups = relationship(
        "HcHeatingGroup", back_populates="project",
        cascade="all, delete-orphan",
        order_by="HcHeatingGroup.sort_order"
    )


class HcProjectBaseData(Base):
    __tablename__ = "hc_project_base_data"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, default=1)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), unique=True)
    t_aussen = Column(Float, default=-8.0)
    t_innen = Column(Float, default=20.0)
    heizungssystem = Column(SAEnum(HcHeizungsSystem), default=HcHeizungsSystem.gemischt)
    warmwasser_bedarf_kw = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("HcProject", back_populates="base_data")


class HcGroupTemplate(Base):
    __tablename__ = "hc_group_templates"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, default=1)
    name = Column(String, nullable=False)
    typ = Column(SAEnum(HcGruppeTyp), nullable=False)
    standard_vl = Column(Float, nullable=False)
    standard_rl = Column(Float, nullable=False)
    beschreibung = Column(String, nullable=True)
    is_system = Column(Boolean, default=True)

    heating_groups = relationship("HcHeatingGroup", back_populates="template")


class HcHeatingGroup(Base):
    __tablename__ = "hc_heating_groups"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1)
    project_id = Column(Integer, ForeignKey("hc_projects.id"))
    template_id = Column(Integer, ForeignKey("hc_group_templates.id"), nullable=True)
    name = Column(String, nullable=False)
    typ = Column(SAEnum(HcGruppeTyp), nullable=False)
    leistung_kw = Column(Float, default=0.0)
    vorlauf = Column(Float, nullable=False)
    ruecklauf = Column(Float, nullable=False)
    volumenstrom_m3h = Column(Float, nullable=True)  # berechnet: Q / (1.163 × ΔT)
    status = Column(SAEnum(HcGruppeStatus), default=HcGruppeStatus.aktiv)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("HcProject", back_populates="heating_groups")
    template = relationship("HcGroupTemplate", back_populates="heating_groups")


class HcCalculationResult(Base):
    __tablename__ = "hc_calculation_results"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, default=1)
    project_id = Column(Integer, ForeignKey("hc_projects.id"))
    modul_typ = Column(SAEnum(HcModulTyp), nullable=False)
    version = Column(Integer, default=1)
    inputs_json = Column(Text)
    results_json = Column(Text)
    notizen = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
