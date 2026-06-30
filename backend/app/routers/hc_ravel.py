from typing import List
from fastapi import APIRouter
from pydantic import BaseModel
from app.calculations.ravel import vergleiche_varianten, PREISSTEIGERUNG_DEFAULTS

router = APIRouter(prefix="/api/v1/ravel", tags=["Heizungscockpit – RAVEL Wirtschaftlichkeit"])


class RavelVariante(BaseModel):
    name: str
    investition: float
    nutzungsdauer: int = 20
    zinssatz_pct: float = 3.0
    betrieb_pa: float = 0.0
    betrieb_steigerung_pct: float = 2.0
    energie_pa: float = 0.0
    energie_steigerung_pct: float = 2.5


class RavelInput(BaseModel):
    varianten: List[RavelVariante]


@router.post("/berechnen")
def ravel_berechnen(body: RavelInput):
    varianten = [v.model_dump() for v in body.varianten]
    return vergleiche_varianten(varianten)


@router.get("/defaults")
def get_defaults():
    return {"preissteigerung": PREISSTEIGERUNG_DEFAULTS}
