from datetime import datetime
import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.heizungscockpit import HcProject, HcSchema
from app.schemas.hc_schemas import SchemaCreate, SchemaUpdate, SchemaOut

router = APIRouter(prefix="/api/v1", tags=["Heizungscockpit – Schema"])

TENANT_ID = 1


def _to_out(s: HcSchema) -> SchemaOut:
    try:
        graph = json.loads(s.graph_json) if s.graph_json else {}
    except Exception:
        graph = {}
    if not isinstance(graph, dict):
        graph = {}
    return SchemaOut(
        id=s.id,
        project_id=s.project_id,
        name=s.name,
        graph=graph,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _require_project(project_id: int, db: Session) -> HcProject:
    p = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == TENANT_ID)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return p


def _require_schema(schema_id: int, db: Session) -> HcSchema:
    s = (
        db.query(HcSchema)
        .filter(HcSchema.id == schema_id, HcSchema.tenant_id == TENANT_ID)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schema nicht gefunden")
    return s


@router.get("/projects/{project_id}/schemas", response_model=List[SchemaOut])
def list_schemas(project_id: int, db: Session = Depends(get_db)):
    _require_project(project_id, db)
    rows = (
        db.query(HcSchema)
        .filter(HcSchema.project_id == project_id, HcSchema.tenant_id == TENANT_ID)
        .order_by(HcSchema.created_at)
        .all()
    )
    return [_to_out(s) for s in rows]


@router.post("/projects/{project_id}/schemas", response_model=SchemaOut, status_code=201)
def create_schema(project_id: int, body: SchemaCreate, db: Session = Depends(get_db)):
    _require_project(project_id, db)
    s = HcSchema(
        tenant_id=TENANT_ID,
        project_id=project_id,
        name=(body.name or "Schema"),
        graph_json=json.dumps(body.graph or {"nodes": [], "edges": []}),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.get("/schemas/{schema_id}", response_model=SchemaOut)
def get_schema(schema_id: int, db: Session = Depends(get_db)):
    return _to_out(_require_schema(schema_id, db))


@router.put("/schemas/{schema_id}", response_model=SchemaOut)
def save_schema(schema_id: int, body: SchemaUpdate, db: Session = Depends(get_db)):
    s = _require_schema(schema_id, db)
    if body.name is not None:
        s.name = body.name
    if body.graph is not None:
        s.graph_json = json.dumps(body.graph)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.delete("/schemas/{schema_id}", status_code=204)
def delete_schema(schema_id: int, db: Session = Depends(get_db)):
    s = _require_schema(schema_id, db)
    db.delete(s)
    db.commit()
