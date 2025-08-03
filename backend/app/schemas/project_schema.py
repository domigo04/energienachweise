from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

# 📌 Projektstatus für API (Frontend-kompatibel)
class ProjektStatus(str, Enum):
    in_planung = "Projekt in Planung"
    ausfuehrung = "Ausführungsplanung"
    abgeschlossen = "Abgeschlossen"

# ✅ Eingabe-Schema beim Erstellen eines Projekts
class ProjectCreate(BaseModel):
    projektname: str = Field(..., alias="title")
    beschreibung: Optional[str] = Field(None, alias="description")
    strasse: Optional[str]
    plz: Optional[int]
    ort: str
    gebaeudetyp: str
    kontrollart: str
    energienachweise: List[str] = []
    status: ProjektStatus = ProjektStatus.in_planung

    class Config:
        populate_by_name = True  # Erlaubt Frontend-Felder wie 'projektname'

# ✅ Ausgabe-Schema für Projekte (z. B. bei GET-Anfragen)
class ProjectOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    strasse: Optional[str]
    plz: Optional[int]
    ort: str
    gebaeudetyp: str
    kontrollart: str
    energienachweise: List[str]
    status: ProjektStatus
    customer_id: int

    class Config:
        from_attributes = True  # erlaubt ORM-Objekte direkt zu verwenden
