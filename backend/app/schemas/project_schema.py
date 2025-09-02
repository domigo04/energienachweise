# backend/app/schemas/project_schema.py
from pydantic import BaseModel, AnyHttpUrl, ConfigDict
from typing import List, Optional, Literal

Kontrolltyp = Literal["pk", "ak", "beides"]
ProjektStatus = Literal["plan", "ausf", "done"]


class EvidenceCreate(BaseModel):
    fachbereich: str
    en_code: str
    swiss_transfer_url: Optional[AnyHttpUrl] = None
    required_docs: Optional[List[str]] = None


class EvidenceOut(EvidenceCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int


class ProjectCreate(BaseModel):
    name: str
    egid: Optional[str] = None
    parzelle: Optional[str] = None
    adresse: Optional[str] = None
    ort: Optional[str] = None
    kontrolltyp: Kontrolltyp


class ProjectPatch(BaseModel):
    kontrolltyp: Optional[Kontrolltyp] = None
    status: Optional[ProjektStatus] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kunde_id: int
    name: str
    egid: Optional[str] = None
    parzelle: Optional[str] = None
    adresse: Optional[str] = None
    ort: Optional[str] = None
    kontrolltyp: Kontrolltyp
    status: ProjektStatus
    evidences: List[EvidenceOut] = []
