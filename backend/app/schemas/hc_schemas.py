from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ProjectStatus(str, Enum):
    aktiv = "aktiv"
    archiviert = "archiviert"


class HeizungsSystem(str, Enum):
    fbh = "FBH"
    hk = "HK"
    gemischt = "gemischt"


class GruppeTyp(str, Enum):
    fbh = "FBH"
    hk = "HK"
    lufterhitzer = "Lufterhitzer"
    bww = "BWW"
    lueftungsregister = "Lueftungsregister"
    wandheizung = "Wandheizung"
    tabs = "TABS"
    konvektoren = "Konvektoren"


class GruppeStatus(str, Enum):
    aktiv = "aktiv"
    inaktiv = "inaktiv"
    ignoriert = "ignoriert"


class ProjectBaseDataIn(BaseModel):
    t_aussen: float = -8.0
    t_innen: float = 20.0
    heizungssystem: HeizungsSystem = HeizungsSystem.gemischt
    warmwasser_bedarf_kw: Optional[float] = None
    gebaeudekategorie: Optional[str] = None
    klimastation: Optional[str] = None
    # Zentrale Projektgrunddaten (Quelle A) — einmal hier gepflegt
    ebf_m2: Optional[float] = None
    anzahl_nutzungseinheiten: Optional[int] = None
    projektart: Optional[str] = None
    region: Optional[str] = None
    zertifizierung: Optional[str] = None


class ProjectCreate(BaseModel):
    name: str
    standort: Optional[str] = None
    kunde: Optional[str] = None
    beschreibung: Optional[str] = None
    base_data: Optional[ProjectBaseDataIn] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    standort: Optional[str] = None
    kunde: Optional[str] = None
    beschreibung: Optional[str] = None
    status: Optional[ProjectStatus] = None
    base_data: Optional[ProjectBaseDataIn] = None


class ProjectBaseDataOut(BaseModel):
    t_aussen: float
    t_innen: float
    heizungssystem: HeizungsSystem
    warmwasser_bedarf_kw: Optional[float]
    gebaeudekategorie: Optional[str] = None
    klimastation: Optional[str] = None
    ebf_m2: Optional[float] = None
    anzahl_nutzungseinheiten: Optional[int] = None
    projektart: Optional[str] = None
    region: Optional[str] = None
    zertifizierung: Optional[str] = None

    model_config = {"from_attributes": True}


class ProjectParameterUpdate(BaseModel):
    """Ergänzung / Übersteuerung eines Projektparameters (Quelle C / §6).
    Werte werden als Text abgelegt; None löscht die jeweilige Angabe wieder."""
    external_value: Optional[str] = None
    manual_override: Optional[str] = None
    quelle_notiz: Optional[str] = None
    confidence: Optional[str] = None
    notiz: Optional[str] = None


class HeatingGroupCreate(BaseModel):
    name: str
    typ: GruppeTyp
    leistung_kw: float = 0.0
    vorlauf: float
    ruecklauf: float
    template_id: Optional[int] = None
    sort_order: int = 0


class HeatingGroupUpdate(BaseModel):
    name: Optional[str] = None
    leistung_kw: Optional[float] = None
    vorlauf: Optional[float] = None
    ruecklauf: Optional[float] = None
    sort_order: Optional[int] = None


class HeatingGroupStatusUpdate(BaseModel):
    status: GruppeStatus


class HeatingGroupOut(BaseModel):
    id: int
    name: str
    typ: GruppeTyp
    leistung_kw: float
    vorlauf: float
    ruecklauf: float
    volumenstrom_m3h: Optional[float]
    status: GruppeStatus
    sort_order: int
    template_id: Optional[int]
    warnings: List[str] = []

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    # Leichte Projekt-Metadaten für die Liste (GET /projects). Bewusst OHNE
    # base_data — sonst löst Pydantic beim Serialisieren pro Projekt einen
    # eigenen Lazy-Load von base_data aus (N+1: 1 + N Abfragen). Die Liste
    # zeigt nur Name/Ort/Kunde/Status/Datum, base_data braucht sie nie.
    # Die Detailsicht (ProjectDetailOut) hängt base_data wieder an.
    id: int
    name: str
    standort: Optional[str]
    kunde: Optional[str]
    beschreibung: Optional[str]
    verantwortlicher_id: Optional[int] = None
    verantwortlicher_name: Optional[str] = None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDetailOut(ProjectOut):
    base_data: Optional[ProjectBaseDataOut] = None
    heating_groups: List[HeatingGroupOut] = []
    summe_leistung_kw: float = 0.0
    summe_volumenstrom_m3h: float = 0.0
    summe_volumenstrom_lh: float = 0.0
    rl_gemischt: Optional[float] = None


class GroupTemplateOut(BaseModel):
    id: int
    name: str
    typ: GruppeTyp
    standard_vl: float
    standard_rl: float
    beschreibung: Optional[str]
    is_system: bool

    model_config = {"from_attributes": True}


class ReorderRequest(BaseModel):
    group_ids: List[int]


# ── Anlagenschema (Hydraulik) ──
class SchemaCreate(BaseModel):
    name: Optional[str] = "Schema"
    graph: Optional[dict] = None


class SchemaUpdate(BaseModel):
    name: Optional[str] = None
    graph: Optional[dict] = None


class SchemaOut(BaseModel):
    id: int
    project_id: int
    name: str
    graph: dict = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SchemaRevisionCreate(BaseModel):
    bezeichnung: Optional[str] = Field(default=None, max_length=120)
    notiz: Optional[str] = Field(default=None, max_length=1000)
    schema_name: Optional[str] = Field(default=None, max_length=200)
    graph: Optional[dict] = None
    calculation: Optional[dict] = None


class SchemaRevisionOut(BaseModel):
    id: int
    schema_id: int
    project_id: int
    version_nr: int
    bezeichnung: Optional[str] = None
    notiz: Optional[str] = None
    calculation_engine_version: str
    diff: dict = Field(default_factory=dict)
    node_count: int
    edge_count: int
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime


class SchemaRevisionDetailOut(SchemaRevisionOut):
    graph: dict = Field(default_factory=dict)
    calculation: Optional[dict] = None


class AuditEventOut(BaseModel):
    id: int
    project_id: int
    schema_id: Optional[int] = None
    revision_id: Optional[int] = None
    action: str
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    details: dict = Field(default_factory=dict)
    created_at: datetime
