from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.export.einzel_pdf import einzelberechnung_pdf
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


class Feld(BaseModel):
    """Beschriftung einer Zeile im PDF. Reine Darstellung — die Zahlen kommen
    aus dem Rechenkern, nicht von hier."""

    label: str
    wert: str
    einheit: str = ""


class EinzelberechnungExport(EinzelberechnungInput):
    titel: str
    grundlage: str = ""
    eingabe_zeilen: list[Feld] = []
    ergebnis_zeilen: list[Feld] = []
    hinweise: list[str] = []


@router.post("/export")
def einzelberechnung_export(body: EinzelberechnungExport):
    """PDF einer Einzelberechnung.

    Gerechnet wird hier noch einmal, damit im Export garantiert dieselben Zahlen
    stehen wie auf dem Bildschirm — auch wenn zwischen Anzeige und Klick auf
    «PDF» etwas geändert wurde.
    """
    try:
        resultat = FUNKTIONEN[body.typ](**body.eingaben)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Die Beschriftungen kommen aus der Oberfläche, die Werte aus dem Resultat.
    ergebnisse = [
        {"label": zeile.label, "wert": _zahl(resultat.get(zeile.wert)), "einheit": zeile.einheit}
        for zeile in body.ergebnis_zeilen
        if resultat.get(zeile.wert) is not None
    ]
    pdf = einzelberechnung_pdf(
        titel=body.titel,
        grundlage=body.grundlage,
        eingaben=[zeile.model_dump() for zeile in body.eingabe_zeilen],
        rechenweg=resultat.get("rechenweg") or [],
        ergebnisse=ergebnisse,
        hinweise=body.hinweise,
    )
    dateiname = f"{body.typ}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{dateiname}"'},
    )


def _zahl(wert: Any) -> str:
    """Schweizer Tausendertrennung, wie im Frontend."""
    if not isinstance(wert, (int, float)):
        return str(wert)
    text = f"{wert:,.3f}".rstrip("0").rstrip(".")
    return text.replace(",", "'")
