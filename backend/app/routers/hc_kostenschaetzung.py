"""Kostenschätzung je Projekt: rechnet gegen die firmenweiten Referenzprojekte
und speichert Eingaben + Ergebnis (wie das Schema, damit nichts verloren geht).

- POST /berechnen           → nur rechnen (Live-Vorschau, ohne Speichern)
- GET  /projekt/{id}        → gespeicherte Schätzung laden
- PUT  /projekt/{id}        → rechnen + speichern
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.calculations.kostenschaetzung import berechne_kostenschaetzung
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import HcProject
from app.models.kv import BauindexEintrag, Kostenschaetzung, RefProjekt

router = APIRouter(prefix="/api/v1/kostenschaetzung", tags=["KV – Kostenschätzung"])


class KsInput(BaseModel):
    projektart: Optional[str] = None
    gebaeudetyp: Optional[str] = None
    ausbauumfang: Optional[str] = None
    zertifizierung: Optional[str] = None
    anlagenkonfiguration: Optional[str] = None
    waermeerzeuger: List[str] = []
    waermeabgabe: List[str] = []
    ebf: Optional[float] = None
    bohrmeter: Optional[float] = None
    heizleistung_kw: Optional[float] = None
    anzahl_einheiten: Optional[int] = None
    baupreisindex_beruecksichtigen: bool = False


def _ref_to_calc_dict(r: RefProjekt) -> dict:
    return {
        "id": r.id, "name": r.name, "projektart": r.projektart, "gebaeudetyp": r.gebaeudetyp,
        "ausbauumfang": r.ausbauumfang, "zertifizierung": r.zertifizierung,
        "anlagenkonfiguration": r.anlagenkonfiguration,
        "waermeerzeuger": r.waermeerzeuger or [], "waermeabgabe": r.waermeabgabe or [],
        "ebf": r.ebf_m2, "bohrmeter": r.bohrmeter, "heizleistung_kw": r.heizleistung_kw,
        "anzahl_einheiten": r.anzahl_einheiten, "datum": r.datum, "qualitaet": r.qualitaet,
        "kosten": {z.bkp_nr: z.betrag_chf for z in r.kostenzeilen},
    }


def _refs(db: Session, tenant_id: int) -> list:
    refs = db.query(RefProjekt).filter(RefProjekt.tenant_id == tenant_id).all()
    return [_ref_to_calc_dict(r) for r in refs]


def _bauindex(db: Session, tenant_id: int) -> list:
    eintraege = db.query(BauindexEintrag).filter(BauindexEintrag.tenant_id == tenant_id).all()
    return [{"periode": e.periode, "wert": e.wert} for e in eintraege]


@router.post("/berechnen")
def berechnen(body: KsInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return berechne_kostenschaetzung(body.model_dump(), _refs(db, user.tenant_id), _bauindex(db, user.tenant_id))


@router.get("/projekt/{project_id}")
def get_saved(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ks = (
        db.query(Kostenschaetzung)
        .filter(Kostenschaetzung.project_id == project_id, Kostenschaetzung.tenant_id == user.tenant_id)
        .first()
    )
    if not ks:
        return {"inputs": None, "result": None}
    return {"inputs": json.loads(ks.inputs_json or "{}"), "result": json.loads(ks.result_json or "{}")}


@router.put("/projekt/{project_id}")
def compute_and_save(project_id: int, body: KsInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == user.tenant_id)
        .first()
    )
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")

    inputs = body.model_dump()
    result = berechne_kostenschaetzung(inputs, _refs(db, user.tenant_id), _bauindex(db, user.tenant_id))

    ks = db.query(Kostenschaetzung).filter(Kostenschaetzung.project_id == project_id).first()
    if not ks:
        ks = Kostenschaetzung(tenant_id=user.tenant_id, project_id=project_id)
        db.add(ks)
    ks.inputs_json = json.dumps(inputs)
    ks.result_json = json.dumps(result)
    db.commit()
    return {"inputs": inputs, "result": result}
