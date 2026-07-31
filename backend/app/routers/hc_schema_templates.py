"""Firmenweite Schema-Vorlagen — Standardschaltungen wiederverwenden.

Feedback Dominic 2026-07-31: gewisse Schemas sollen als Vorlage gespeichert und
immer wieder verwendet werden können.

Zwei bewusste Entscheide:

1. **Eine Vorlage ist eine Kopie**, kein Verweis. Ändert sich das Projekt, aus
   dem sie stammt, bleibt die Vorlage, wie sie war — sonst würde sich eine
   Standardschaltung unter der Hand verändern.
2. **Vorlagen sind firmenweit** (Regel 5/6). Wer in der Firma arbeitet, sieht
   und verwendet sie; über die Mandantengrenze hinaus ist keine sichtbar.
   Löschen darf nur, wer sie angelegt hat, oder ein Firmenadmin — eine Vorlage
   ist gemeinsames Arbeitsmaterial, kein Privatbesitz.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import HcSchema, HcSchemaTemplate

router = APIRouter(prefix="/api/v1/schema-templates", tags=["Heizungscockpit – Vorlagen"])


class VorlageIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    beschreibung: str = ""
    # Entweder ein bestehendes Schema als Quelle …
    schema_id: Optional[int] = None
    # … oder der Graph direkt (der Editor speichert den aktuellen Stand).
    graph: Optional[dict] = None


class VorlagePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    beschreibung: Optional[str] = None


def _zaehle(graph: dict) -> tuple[int, int]:
    return len(graph.get("nodes") or []), len(graph.get("edges") or [])


def _out(row: HcSchemaTemplate, mit_graph: bool = False) -> dict:
    daten = {
        "id": row.id,
        "name": row.name,
        "beschreibung": row.beschreibung or "",
        "node_count": row.node_count,
        "edge_count": row.edge_count,
        "created_by": row.created_by,
        "created_by_name": row.created_by_name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
    if mit_graph:
        try:
            daten["graph"] = json.loads(row.graph_json or "{}")
        except (TypeError, ValueError):
            daten["graph"] = {"nodes": [], "edges": []}
    return daten


def _vorlage(template_id: int, user: User, db: Session) -> HcSchemaTemplate:
    row = (
        db.query(HcSchemaTemplate)
        .filter(HcSchemaTemplate.id == template_id,
                HcSchemaTemplate.tenant_id == user.tenant_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Vorlage nicht gefunden")
    return row


@router.get("")
def vorlagen_liste(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(HcSchemaTemplate)
        .filter(HcSchemaTemplate.tenant_id == user.tenant_id)
        .order_by(HcSchemaTemplate.name)
        .all()
    )
    return [_out(r) for r in rows]


@router.get("/{template_id}")
def vorlage_lesen(template_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Mit Graph — das ist der Aufruf, mit dem der Editor eine Vorlage lädt."""
    return _out(_vorlage(template_id, user, db), mit_graph=True)


@router.post("", status_code=201)
def vorlage_anlegen(body: VorlageIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    graph = body.graph
    quelle_schema = None
    if graph is None:
        if body.schema_id is None:
            raise HTTPException(422, "Es braucht ein Schema oder einen Graphen als Quelle")
        quelle_schema = (
            db.query(HcSchema)
            .filter(HcSchema.id == body.schema_id, HcSchema.tenant_id == user.tenant_id)
            .first()
        )
        if quelle_schema is None:
            raise HTTPException(404, "Schema nicht gefunden")
        try:
            graph = json.loads(quelle_schema.graph_json or "{}")
        except (TypeError, ValueError):
            graph = {}

    graph = graph if isinstance(graph, dict) else {}
    nodes, edges = _zaehle(graph)
    if nodes == 0:
        raise HTTPException(422, "Ein leeres Schema ergibt keine Vorlage")

    row = HcSchemaTemplate(
        tenant_id=user.tenant_id,
        name=body.name.strip(),
        beschreibung=(body.beschreibung or "").strip(),
        graph_json=json.dumps(graph, separators=(",", ":"), ensure_ascii=False),
        node_count=nodes,
        edge_count=edges,
        quelle_project_id=quelle_schema.project_id if quelle_schema else None,
        quelle_schema_id=body.schema_id,
        created_by=user.id,
        created_by_name=user.name or user.email,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.patch("/{template_id}")
def vorlage_umbenennen(template_id: int, body: VorlagePatch,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _vorlage(template_id, user, db)
    if body.name is not None:
        row.name = body.name.strip()
    if body.beschreibung is not None:
        row.beschreibung = body.beschreibung.strip()
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{template_id}", status_code=204)
def vorlage_loeschen(template_id: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    row = _vorlage(template_id, user, db)
    darf = row.created_by == user.id or user.firma_role == "admin" or user.role.value == "admin"
    if not darf:
        raise HTTPException(403, "Nur die Erstellerin oder ein Firmenadmin darf eine Vorlage löschen")
    db.delete(row)
    db.commit()
    return None
