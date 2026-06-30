from typing import List
from fastapi import APIRouter
from pydantic import BaseModel
from app.calculations.druckverlust import berechne_kreis

router = APIRouter(prefix="/api/v1/druckverlust", tags=["Heizungscockpit – Druckverlust"])


class Apparat(BaseModel):
    name: str
    anzahl: float = 1.0
    dp_kpa: float = 0.0


class KreisInput(BaseModel):
    name: str
    rohrlange_m: float = 0.0
    druckgefaelle_pam: float = 70.0
    apparate: List[Apparat] = []


class DruckverlustInput(BaseModel):
    kreise: List[KreisInput]


@router.post("/berechnen")
def druckverlust_berechnen(body: DruckverlustInput):
    results = []
    for k in body.kreise:
        result = berechne_kreis(
            k.rohrlange_m,
            k.druckgefaelle_pam,
            [{"name": a.name, "anzahl": a.anzahl, "dp_kpa": a.dp_kpa} for a in k.apparate],
        )
        result["kreis_name"] = k.name
        results.append(result)
    return {"kreise": results}
