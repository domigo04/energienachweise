from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from app.calculations.ventil import berechne_kvs, KVS_REIHE

router = APIRouter(prefix="/api/v1/ventil", tags=["Heizungscockpit – Ventilauslegung"])


class VentilInput(BaseModel):
    volumenstrom_m3h: float
    dp_var_kpa: float
    kvs_gewaehlt: Optional[float] = None


@router.post("/berechnen")
def ventil_berechnen(body: VentilInput):
    return berechne_kvs(body.volumenstrom_m3h, body.dp_var_kpa, body.kvs_gewaehlt)


@router.get("/kvs-reihe")
def get_kvs_reihe():
    return {"kvs_reihe": KVS_REIHE}
