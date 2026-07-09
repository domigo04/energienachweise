"""Baupreisindex-Verwaltung: manuelle Einträge (zuverlässiger Normalfall) +
ein Best-Effort-Automatikabruf gegen die offizielle BFS-Quelle (opendata.swiss).

- GET  /                       → alle Einträge (jeder angemeldete Nutzer)
- POST /                       → manuellen Eintrag anlegen/überschreiben (Admin)
- DELETE /{id}                 → Eintrag löschen (Admin)
- POST /automatisch-aktualisieren → Abruf-Versuch auslösen (Admin)
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.data.bauindex_bfs import fetch_bfs_baupreisindex
from app.database import get_db
from app.models.auth import User
from app.models.kv import BauindexEintrag

router = APIRouter(prefix="/api/v1/bauindex", tags=["KV – Baupreisindex"])


class BauindexIn(BaseModel):
    periode: date
    wert: float


class BauindexOut(BaseModel):
    id: int
    periode: date
    wert: float
    quelle: str
    model_config = {"from_attributes": True}


@router.get("", response_model=list[BauindexOut])
def list_eintraege(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(BauindexEintrag).filter(BauindexEintrag.tenant_id == user.tenant_id)
        .order_by(BauindexEintrag.periode.desc()).all()
    )


@router.post("", response_model=BauindexOut, status_code=201)
def upsert_eintrag(body: BauindexIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    eintrag = (
        db.query(BauindexEintrag)
        .filter(BauindexEintrag.tenant_id == admin.tenant_id, BauindexEintrag.periode == body.periode)
        .first()
    )
    if eintrag:
        eintrag.wert = body.wert
        eintrag.quelle = "manuell"
    else:
        eintrag = BauindexEintrag(tenant_id=admin.tenant_id, periode=body.periode, wert=body.wert, quelle="manuell")
        db.add(eintrag)
    db.commit()
    db.refresh(eintrag)
    return eintrag


@router.delete("/{eintrag_id}", status_code=204)
def delete_eintrag(eintrag_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    eintrag = (
        db.query(BauindexEintrag)
        .filter(BauindexEintrag.id == eintrag_id, BauindexEintrag.tenant_id == admin.tenant_id)
        .first()
    )
    if not eintrag:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eintrag nicht gefunden")
    db.delete(eintrag)
    db.commit()


@router.post("/automatisch-aktualisieren")
def automatisch_aktualisieren(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Abruf gegen die BFS-Quelle (opendata.swiss), live verifiziert. Schlägt er
    trotzdem fehl (Netzwerk/Format geändert), ändert sich an der Datenbank
    nichts — die manuelle Eingabe bleibt zusätzlich immer möglich."""
    ergebnis = fetch_bfs_baupreisindex()
    if not ergebnis["erfolg"]:
        return {"erfolg": False, "meldung": ergebnis["meldung"], "neue_eintraege": 0}

    neu = 0
    for e in ergebnis["eintraege"]:
        vorhanden = (
            db.query(BauindexEintrag)
            .filter(BauindexEintrag.tenant_id == admin.tenant_id, BauindexEintrag.periode == e["periode"])
            .first()
        )
        if vorhanden:
            if vorhanden.quelle == "bfs-automatisch":
                vorhanden.wert = e["wert"]
            continue  # manuelle Einträge nicht überschreiben
        db.add(BauindexEintrag(tenant_id=admin.tenant_id, periode=e["periode"], wert=e["wert"], quelle="bfs-automatisch"))
        neu += 1
    db.commit()
    return {"erfolg": True, "meldung": ergebnis["meldung"], "neue_eintraege": neu}
