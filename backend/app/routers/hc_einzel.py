from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.calculations.einzel import (
    druckverlust_kvs,
    jahresenergie,
    jaz_und_stromkosten,
    rohrausdehnung,
    speichervolumen_wp,
    waermepumpenleistung,
    waermetauscherflaeche,
)

router = APIRouter(prefix="/api/v1/einzelberechnungen", tags=["Heizungscockpit – Einzelberechnungen"])


class EinzelberechnungInput(BaseModel):
    typ: Literal[
        "waermetauscher", "druckverlust_kvs", "rohrausdehnung", "waermepumpe",
        "speicher_wp", "jahresenergie", "jaz",
    ]
    eingaben: dict[str, Any]


FUNKTIONEN = {
    "waermetauscher": waermetauscherflaeche,
    "druckverlust_kvs": druckverlust_kvs,
    "rohrausdehnung": rohrausdehnung,
    "waermepumpe": waermepumpenleistung,
    "speicher_wp": speichervolumen_wp,
    "jahresenergie": jahresenergie,
    "jaz": jaz_und_stromkosten,
}


@router.post("/berechnen")
def einzelberechnung_berechnen(body: EinzelberechnungInput):
    try:
        return {"typ": body.typ, "resultat": FUNKTIONEN[body.typ](**body.eingaben)}
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
