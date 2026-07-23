from datetime import datetime
import enum
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
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
    erstellt_von = Column(Integer, nullable=True, index=True)  # Ersteller für spätere Nachvollziehbarkeit
    status = Column(SAEnum(HcProjectStatus), default=HcProjectStatus.aktiv)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    base_data = relationship("HcProjectBaseData", back_populates="project", uselist=False, cascade="all, delete-orphan")
    heating_groups = relationship(
        "HcHeatingGroup", back_populates="project",
        cascade="all, delete-orphan",
        order_by="HcHeatingGroup.sort_order"
    )
    schemas = relationship(
        "HcSchema", back_populates="project",
        cascade="all, delete-orphan",
        order_by="HcSchema.created_at"
    )


class HcProjectBaseData(Base):
    __tablename__ = "hc_project_base_data"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, default=1)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), unique=True)
    t_aussen = Column(Float, default=-8.0)
    t_innen = Column(Float, default=20.0)
    heizungssystem = Column(SAEnum(HcHeizungsSystem), default=HcHeizungsSystem.gemischt)
    gebaeudekategorie = Column(String, nullable=True)
    klimastation = Column(String, nullable=True)
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
    tenant_id = Column(Integer, default=1, index=True)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), index=True)
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


class BkpGebaeudekategorie(str, enum.Enum):
    efh = "EFH"
    mfh_2_5 = "MFH_2_5"
    mfh_6_10 = "MFH_6_10"
    mfh_11plus = "MFH_11plus"
    gewerbe = "Gewerbe"
    industrie = "Industrie"


class BkpWpTyp(str, enum.Enum):
    sole_wasser = "sole_wasser"
    luft_wasser = "luft_wasser"
    wasser_wasser = "wasser_wasser"
    alle = "alle"


class BkpEintrag(Base):
    """BKP-Kostenschätzung (Phase 3) — Tabelle ab Tag 1 vorhanden, bleibt vorerst LEER.

    Ein Eintrag = ein ausgewerteter Devi-/Submissions-Betrag für eine
    BKP-Position (Auftrag v3.0 Kap. 4.4). Zeitgewichtung: calculations/bkp.py.
    """
    __tablename__ = "bkp_eintraege"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    bkp_nr = Column(String, nullable=False, index=True)  # z.B. "242.3"
    bkp_name = Column(String, nullable=False)
    gebaeudekategorie = Column(SAEnum(BkpGebaeudekategorie), nullable=False)
    wp_typ = Column(SAEnum(BkpWpTyp), nullable=True)
    betrag_chf = Column(Float, nullable=False)
    datum_submission = Column(Date, nullable=False)   # bestimmt Zeitgewicht
    gewicht = Column(Float, nullable=True)            # berechnet, Halbwertszeit ~3 Jahre
    ngf_m2 = Column(Float, nullable=True)             # → Kennwert CHF/m² NGF
    leistung_kw = Column(Float, nullable=True)        # → Kennwert CHF/kW
    projekt_id = Column(Integer, ForeignKey("hc_projects.id"), nullable=True)
    quelle = Column(String, nullable=True)            # "Devi" | "Submission" | "Richtpreis" | "Ist-Kosten"
    created_at = Column(DateTime, default=datetime.utcnow)


class HcSchema(Base):
    """Anlagenschema (Hydraulik) — die eine Wahrheit eines Projekts.

    Speichert den kompletten React-Flow-Graphen (Bauteile + Leitungen inkl.
    aller Auslegungs-Eingaben) als JSON. Aus diesem Graphen lässt sich später
    die Stückliste / Kostenschätzung ableiten.
    """
    __tablename__ = "hc_schemas"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, index=True)
    project_id = Column(Integer, ForeignKey("hc_projects.id"), index=True)
    name = Column(String, nullable=False, default="Schema")
    graph_json = Column(Text, nullable=False, default="{}")  # {nodes:[...], edges:[...]}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("HcProject", back_populates="schemas")
    revisions = relationship(
        "HcSchemaRevision",
        back_populates="schema",
        cascade="all, delete-orphan",
        order_by="HcSchemaRevision.version_nr",
    )


class HcSchemaRevision(Base):
    """Unveränderlicher, explizit gespeicherter Stand eines Anlagenschemas."""

    __tablename__ = "hc_schema_revisions"
    __table_args__ = (
        UniqueConstraint("schema_id", "version_nr", name="uq_hc_schema_revision_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    schema_id = Column(Integer, ForeignKey("hc_schemas.id"), nullable=False, index=True)
    version_nr = Column(Integer, nullable=False)
    bezeichnung = Column(String, nullable=True)
    notiz = Column(Text, nullable=True)
    graph_json = Column(Text, nullable=False)
    calculation_json = Column(Text, nullable=True)
    calculation_engine_version = Column(String, nullable=False, default="hydraulik-v1")
    diff_json = Column(Text, nullable=False, default="{}")
    node_count = Column(Integer, nullable=False, default=0)
    edge_count = Column(Integer, nullable=False, default=0)
    created_by = Column(Integer, nullable=True, index=True)
    created_by_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    schema = relationship("HcSchema", back_populates="revisions")


class HcAuditEvent(Base):
    """Schlankes, firmenweites Änderungsprotokoll.

    Der eigentliche Graph bleibt im Revisions-Snapshot. Das Ereignis enthält
    nur die verständliche Zusammenfassung, damit Projektverläufe schnell
    geladen und später nach Benutzer gefiltert werden können.
    """

    __tablename__ = "hc_audit_events"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, default=1, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    schema_id = Column(Integer, nullable=True, index=True)
    revision_id = Column(Integer, nullable=True, index=True)
    entity_type = Column(String, nullable=False, default="schema")
    entity_id = Column(Integer, nullable=True)
    action = Column(String, nullable=False)
    actor_id = Column(Integer, nullable=True, index=True)
    actor_name = Column(String, nullable=True)
    details_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
