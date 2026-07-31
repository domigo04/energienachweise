"""Projektjournal — Notizen, Pendenzen und Stecknadeln im Anlagenschema.

Drei Zusagen, die dieses Modul einlöst (Dominic 2026-07-31):

1. **Autor und Bearbeiter sind sichtbar.** Wer den Eintrag geschrieben hat,
   bleibt stehen; wer ihn später geändert hat, kommt zusätzlich dazu.
2. **Ein Eintrag kann an einer Stelle im Schema hängen.** Die Stecknadel trägt
   Schema und Weltkoordinate, wahlweise am Bauteil.
3. **Jede Änderung landet im Änderungsprotokoll** — mit Zeitpunkt und Person,
   wie jede andere relevante Änderung im Cockpit (Regel 9).

Projekte sind firmenweit (Regel 6): jeder Benutzer der Firma sieht und
bearbeitet die Einträge seiner Projekte. Die Mandantengrenze ist `tenant_id`.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.audit import add_audit_event
from app.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import HcNoteKind, HcProject, HcProjectNote

router = APIRouter(prefix="/api/v1/projects", tags=["Heizungscockpit – Journal"])

KINDS = tuple(k.value for k in HcNoteKind)


class PinIn(BaseModel):
    schema_id: int
    x: float
    y: float
    node_id: Optional[str] = None


class NoteIn(BaseModel):
    kind: str = HcNoteKind.notiz.value
    titel: str = Field(default="", max_length=200)
    text: str = ""
    faellig_am: Optional[date] = None
    pin: Optional[PinIn] = None


class NotePatch(BaseModel):
    kind: Optional[str] = None
    titel: Optional[str] = Field(default=None, max_length=200)
    text: Optional[str] = None
    faellig_am: Optional[date] = None
    erledigt: Optional[bool] = None
    # `pin` weglassen = Nadel unverändert; ausdrücklich null = Nadel entfernen.
    pin: Optional[PinIn] = None
    pin_entfernen: bool = False


def _projekt(db: Session, user: User, project_id: int) -> HcProject:
    projekt = db.query(HcProject).filter(
        HcProject.id == project_id,
        HcProject.tenant_id == user.tenant_id,
    ).first()
    if not projekt:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return projekt


def _notiz(db: Session, user: User, project_id: int, note_id: int) -> HcProjectNote:
    notiz = db.query(HcProjectNote).filter(
        HcProjectNote.id == note_id,
        HcProjectNote.project_id == project_id,
        HcProjectNote.tenant_id == user.tenant_id,
    ).first()
    if not notiz:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return notiz


def _pruefe_kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail={
            "message": "Unbekannte Eintragsart.", "erlaubt": list(KINDS),
        })
    return kind


def _out(n: HcProjectNote) -> dict:
    return {
        "id": n.id,
        "kind": n.kind,
        "titel": n.titel or "",
        "text": n.text or "",
        "faellig_am": n.faellig_am.isoformat() if n.faellig_am else None,
        "erledigt": n.erledigt_at is not None,
        "erledigt_at": n.erledigt_at.isoformat() if n.erledigt_at else None,
        "erledigt_von_name": n.erledigt_von_name,
        # Autor bleibt, auch wenn jemand anders bearbeitet hat.
        "autor_name": n.autor_name,
        "autor_id": n.autor_id,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "bearbeitet_at": n.bearbeitet_at.isoformat() if n.bearbeitet_at else None,
        "bearbeitet_von_name": n.bearbeitet_von_name,
        "pin": ({"schema_id": n.schema_id, "x": n.pin_x, "y": n.pin_y, "node_id": n.pin_node_id}
                if n.schema_id is not None and n.pin_x is not None and n.pin_y is not None
                else None),
    }


def _pin_setzen(notiz: HcProjectNote, pin: Optional[PinIn]) -> None:
    if pin is None:
        notiz.schema_id = notiz.pin_x = notiz.pin_y = notiz.pin_node_id = None
        return
    notiz.schema_id = pin.schema_id
    notiz.pin_x = pin.x
    notiz.pin_y = pin.y
    notiz.pin_node_id = pin.node_id


@router.get("/{project_id}/notizen")
def liste(project_id: int, schema_id: Optional[int] = None, offen: bool = False,
          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Das Journal, neueste zuerst. `schema_id` liefert nur die Einträge mit
    Stecknadel in genau diesem Schema — das ist die Abfrage des Editors."""
    _projekt(db, user, project_id)
    q = db.query(HcProjectNote).filter(
        HcProjectNote.project_id == project_id,
        HcProjectNote.tenant_id == user.tenant_id,
    )
    if schema_id is not None:
        q = q.filter(HcProjectNote.schema_id == schema_id,
                     HcProjectNote.pin_x.isnot(None))
    if offen:
        q = q.filter(HcProjectNote.erledigt_at.is_(None))
    eintraege = q.order_by(HcProjectNote.created_at.desc(), HcProjectNote.id.desc()).all()
    return {"notizen": [_out(n) for n in eintraege]}


@router.post("/{project_id}/notizen", status_code=201)
def anlegen(project_id: int, body: NoteIn,
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _projekt(db, user, project_id)
    notiz = HcProjectNote(
        tenant_id=user.tenant_id,
        project_id=project_id,
        kind=_pruefe_kind(body.kind),
        titel=(body.titel or "").strip(),
        text=body.text or "",
        faellig_am=body.faellig_am,
        autor_id=user.id,
        autor_name=user.name or user.email,
    )
    _pin_setzen(notiz, body.pin)
    db.add(notiz)
    db.flush()
    add_audit_event(
        db, user=user, action="notiz_erstellt", project_id=project_id,
        entity_type="notiz", entity_id=notiz.id,
        schema_id=notiz.schema_id,
        details={"art": notiz.kind, "titel": notiz.titel, "mit_stecknadel": notiz.pin_x is not None},
    )
    db.commit()
    db.refresh(notiz)
    return _out(notiz)


@router.patch("/{project_id}/notizen/{note_id}")
def aendern(project_id: int, note_id: int, body: NotePatch,
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _projekt(db, user, project_id)
    notiz = _notiz(db, user, project_id, note_id)

    geaendert: list[str] = []
    if body.kind is not None and body.kind != notiz.kind:
        notiz.kind = _pruefe_kind(body.kind)
        geaendert.append("Art")
    if body.titel is not None and body.titel.strip() != (notiz.titel or ""):
        notiz.titel = body.titel.strip()
        geaendert.append("Titel")
    if body.text is not None and body.text != (notiz.text or ""):
        notiz.text = body.text
        geaendert.append("Text")
    if body.faellig_am is not None and body.faellig_am != notiz.faellig_am:
        notiz.faellig_am = body.faellig_am
        geaendert.append("Fälligkeit")
    if body.pin_entfernen:
        if notiz.pin_x is not None:
            _pin_setzen(notiz, None)
            geaendert.append("Stecknadel entfernt")
    elif body.pin is not None:
        _pin_setzen(notiz, body.pin)
        geaendert.append("Stecknadel")
    if body.erledigt is not None and body.erledigt != (notiz.erledigt_at is not None):
        if body.erledigt:
            notiz.erledigt_at = datetime.utcnow()
            notiz.erledigt_von_name = user.name or user.email
            geaendert.append("erledigt")
        else:
            notiz.erledigt_at = None
            notiz.erledigt_von_name = None
            geaendert.append("wieder offen")

    if not geaendert:
        return _out(notiz)

    # Der Autor bleibt unangetastet — nur die Bearbeitungsspur wächst.
    notiz.bearbeitet_at = datetime.utcnow()
    notiz.bearbeitet_von_id = user.id
    notiz.bearbeitet_von_name = user.name or user.email
    add_audit_event(
        db, user=user, action="notiz_bearbeitet", project_id=project_id,
        entity_type="notiz", entity_id=notiz.id, schema_id=notiz.schema_id,
        details={"titel": notiz.titel, "geaendert": geaendert, "autor": notiz.autor_name},
    )
    db.commit()
    db.refresh(notiz)
    return _out(notiz)


@router.delete("/{project_id}/notizen/{note_id}")
def loeschen(project_id: int, note_id: int,
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _projekt(db, user, project_id)
    notiz = _notiz(db, user, project_id, note_id)
    add_audit_event(
        db, user=user, action="notiz_geloescht", project_id=project_id,
        entity_type="notiz", entity_id=notiz.id,
        details={"titel": notiz.titel, "autor": notiz.autor_name},
    )
    db.delete(notiz)
    db.commit()
    return {"deleted": True}
