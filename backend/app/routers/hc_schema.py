from datetime import datetime
import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.calculations.hydraulik import berechne_schema
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import HcAuditEvent, HcProject, HcSchema, HcSchemaRevision
from app.schemas.hc_schemas import (
    AuditEventOut,
    SchemaCreate,
    SchemaOut,
    SchemaRevisionCreate,
    SchemaRevisionDetailOut,
    SchemaRevisionOut,
    SchemaUpdate,
)

router = APIRouter(prefix="/api/v1", tags=["Heizungscockpit – Schema"])


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


def _require_project(project_id: int, user: User, db: Session) -> HcProject:
    p = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == user.tenant_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return p


def _require_schema(schema_id: int, user: User, db: Session) -> HcSchema:
    s = (
        db.query(HcSchema)
        .filter(HcSchema.id == schema_id, HcSchema.tenant_id == user.tenant_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schema nicht gefunden")
    return s


def _require_schema_for_update(schema_id: int, user: User, db: Session) -> HcSchema:
    """Serialisiert das Erzeugen von Versionsnummern pro Schema auf Postgres."""
    schema = (
        db.query(HcSchema)
        .filter(HcSchema.id == schema_id, HcSchema.tenant_id == user.tenant_id)
        .with_for_update()
        .first()
    )
    if not schema:
        raise HTTPException(status_code=404, detail="Schema nicht gefunden")
    return schema


def _json_dict(raw: str | None) -> dict:
    try:
        value = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _require_revision(revision_id: int, schema: HcSchema, db: Session) -> HcSchemaRevision:
    revision = (
        db.query(HcSchemaRevision)
        .filter(
            HcSchemaRevision.id == revision_id,
            HcSchemaRevision.schema_id == schema.id,
            HcSchemaRevision.tenant_id == schema.tenant_id,
        )
        .first()
    )
    if not revision:
        raise HTTPException(status_code=404, detail="Schema-Stand nicht gefunden")
    return revision


def _item_name(item: dict) -> str:
    data = item.get("data") if isinstance(item.get("data"), dict) else {}
    return str(data.get("label") or data.get("name") or item.get("type") or item.get("id") or "Element")


def _changed_fields(before: dict, after: dict, fields: tuple[str, ...]) -> list[str]:
    changed: list[str] = []
    for field in fields:
        if before.get(field) == after.get(field):
            continue
        if field == "data" and isinstance(before.get(field), dict) and isinstance(after.get(field), dict):
            keys = sorted(set(before[field]) | set(after[field]))
            changed.extend(f"data.{key}" for key in keys if before[field].get(key) != after[field].get(key))
        else:
            changed.append(field)
    return changed


def _graph_diff(before: dict, after: dict) -> dict:
    """Kompakte, menschenlesbare Differenz zwischen zwei gespeicherten Ständen."""

    def index(items) -> dict[str, dict]:
        return {
            str(item.get("id")): item
            for item in (items if isinstance(items, list) else [])
            if isinstance(item, dict) and item.get("id") is not None
        }

    old_nodes = index(before.get("nodes"))
    new_nodes = index(after.get("nodes"))
    old_edges = index(before.get("edges"))
    new_edges = index(after.get("edges"))

    added_nodes = [
        {"id": node_id, "typ": item.get("type"), "name": _item_name(item)}
        for node_id, item in new_nodes.items()
        if node_id not in old_nodes
    ]
    removed_nodes = [
        {"id": node_id, "typ": item.get("type"), "name": _item_name(item)}
        for node_id, item in old_nodes.items()
        if node_id not in new_nodes
    ]
    changed_nodes = []
    for node_id in old_nodes.keys() & new_nodes.keys():
        fields = _changed_fields(
            old_nodes[node_id],
            new_nodes[node_id],
            ("type", "position", "width", "height", "data"),
        )
        if fields:
            changed_nodes.append({
                "id": node_id,
                "typ": new_nodes[node_id].get("type"),
                "name": _item_name(new_nodes[node_id]),
                "felder": fields,
            })

    added_edges = [{"id": edge_id} for edge_id in new_edges if edge_id not in old_edges]
    removed_edges = [{"id": edge_id} for edge_id in old_edges if edge_id not in new_edges]
    changed_edges = []
    for edge_id in old_edges.keys() & new_edges.keys():
        fields = _changed_fields(
            old_edges[edge_id],
            new_edges[edge_id],
            ("source", "target", "sourceHandle", "targetHandle", "type", "data", "style"),
        )
        if fields:
            changed_edges.append({"id": edge_id, "felder": fields})

    return {
        "zusammenfassung": {
            "bauteile_hinzugefuegt": len(added_nodes),
            "bauteile_entfernt": len(removed_nodes),
            "bauteile_geaendert": len(changed_nodes),
            "leitungen_hinzugefuegt": len(added_edges),
            "leitungen_entfernt": len(removed_edges),
            "leitungen_geaendert": len(changed_edges),
        },
        "bauteile": {
            "hinzugefuegt": added_nodes,
            "entfernt": removed_nodes,
            "geaendert": changed_nodes,
        },
        "leitungen": {
            "hinzugefuegt": added_edges,
            "entfernt": removed_edges,
            "geaendert": changed_edges,
        },
    }


def _revision_out(revision: HcSchemaRevision, *, detail: bool = False):
    values = {
        "id": revision.id,
        "schema_id": revision.schema_id,
        "project_id": revision.project_id,
        "version_nr": revision.version_nr,
        "bezeichnung": revision.bezeichnung,
        "notiz": revision.notiz,
        "calculation_engine_version": revision.calculation_engine_version,
        "diff": _json_dict(revision.diff_json),
        "node_count": revision.node_count,
        "edge_count": revision.edge_count,
        "created_by": revision.created_by,
        "created_by_name": revision.created_by_name,
        "created_at": revision.created_at,
    }
    if detail:
        values["graph"] = _json_dict(revision.graph_json)
        values["calculation"] = _json_dict(revision.calculation_json) if revision.calculation_json else None
        return SchemaRevisionDetailOut(**values)
    return SchemaRevisionOut(**values)


def _audit_out(event: HcAuditEvent) -> AuditEventOut:
    return AuditEventOut(
        id=event.id,
        project_id=event.project_id,
        schema_id=event.schema_id,
        revision_id=event.revision_id,
        action=event.action,
        actor_id=event.actor_id,
        actor_name=event.actor_name,
        details=_json_dict(event.details_json),
        created_at=event.created_at,
    )


@router.get("/projects/{project_id}/schemas", response_model=List[SchemaOut])
def list_schemas(project_id: int, limit: int | None = Query(None, ge=1, le=100),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_project(project_id, user, db)
    query = (
        db.query(HcSchema)
        .filter(HcSchema.project_id == project_id, HcSchema.tenant_id == user.tenant_id)
        .order_by(HcSchema.created_at)
    )
    if limit is not None:
        query = query.limit(limit)
    rows = query.all()
    return [_to_out(s) for s in rows]


@router.get("/projects/{project_id}/schema-editor")
def get_schema_editor(project_id: int, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """Schlanker Editor-Start: Projektname und erstes Schema in einer Anfrage.

    Das vollständige ProjectDetail mit Heizgruppen und Summen wird für die
    Zeichenfläche nicht benötigt und war bei grossen Projekten unnötig teuer.
    """
    project = _require_project(project_id, user, db)
    schema = (
        db.query(HcSchema)
        .filter(HcSchema.project_id == project_id, HcSchema.tenant_id == user.tenant_id)
        .order_by(HcSchema.created_at)
        .first()
    )
    return {
        "project": {"id": project.id, "name": project.name},
        "schema": _to_out(schema).model_dump(mode="json") if schema else None,
    }


@router.post("/projects/{project_id}/schemas", response_model=SchemaOut, status_code=201)
def create_schema(project_id: int, body: SchemaCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_project(project_id, user, db)
    s = HcSchema(
        tenant_id=user.tenant_id,
        project_id=project_id,
        name=(body.name or "Schema"),
        graph_json=json.dumps(body.graph or {"nodes": [], "edges": []}),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.get("/schemas/{schema_id}", response_model=SchemaOut)
def get_schema(schema_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _to_out(_require_schema(schema_id, user, db))


@router.put("/schemas/{schema_id}", response_model=SchemaOut)
def save_schema(schema_id: int, body: SchemaUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _require_schema(schema_id, user, db)
    if body.name is not None:
        s.name = body.name
    if body.graph is not None:
        s.graph_json = json.dumps(body.graph)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _to_out(s)


@router.put("/schemas/{schema_id}/graph")
def save_schema_graph(schema_id: int, body: SchemaUpdate,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Kompakter Autosave ohne den grossen Graph erneut zurückzusenden."""
    s = _require_schema(schema_id, user, db)
    if body.name is not None:
        s.name = body.name
    if body.graph is not None:
        s.graph_json = json.dumps(body.graph, separators=(",", ":"), ensure_ascii=False)
    s.updated_at = datetime.utcnow()
    db.commit()
    return {"id": s.id, "updated_at": s.updated_at}


@router.get("/schemas/{schema_id}/revisions", response_model=List[SchemaRevisionOut])
def list_schema_revisions(
    schema_id: int,
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schema = _require_schema(schema_id, user, db)
    rows = (
        db.query(HcSchemaRevision)
        .filter(
            HcSchemaRevision.schema_id == schema.id,
            HcSchemaRevision.tenant_id == user.tenant_id,
        )
        .order_by(HcSchemaRevision.version_nr.desc())
        .limit(limit)
        .all()
    )
    return [_revision_out(row) for row in rows]


@router.post(
    "/schemas/{schema_id}/revisions",
    response_model=SchemaRevisionDetailOut,
    status_code=201,
)
def create_schema_revision(
    schema_id: int,
    body: SchemaRevisionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schema = _require_schema_for_update(schema_id, user, db)
    graph = body.graph if isinstance(body.graph, dict) else _json_dict(schema.graph_json)
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    calculation = berechne_schema(nodes, edges)

    previous = (
        db.query(HcSchemaRevision)
        .filter(
            HcSchemaRevision.schema_id == schema.id,
            HcSchemaRevision.tenant_id == user.tenant_id,
        )
        .order_by(HcSchemaRevision.version_nr.desc())
        .first()
    )
    previous_graph = _json_dict(previous.graph_json) if previous else {}
    diff = _graph_diff(previous_graph, graph)
    version_nr = (
        db.query(func.max(HcSchemaRevision.version_nr))
        .filter(HcSchemaRevision.schema_id == schema.id)
        .scalar()
        or 0
    ) + 1
    actor_name = user.name or user.email
    revision = HcSchemaRevision(
        tenant_id=user.tenant_id,
        project_id=schema.project_id,
        schema_id=schema.id,
        version_nr=version_nr,
        bezeichnung=(body.bezeichnung or "").strip() or None,
        notiz=(body.notiz or "").strip() or None,
        graph_json=json.dumps(graph, separators=(",", ":"), ensure_ascii=False),
        # Ein gespeicherter Stand wird immer nochmals serverseitig gerechnet.
        # So gehört zum Graph garantiert ein Ergebnis derselben Rechenversion,
        # selbst wenn der Live-Request des Editors gerade noch unterwegs war.
        calculation_json=json.dumps(calculation, separators=(",", ":"), ensure_ascii=False),
        calculation_engine_version="hydraulik-v1",
        diff_json=json.dumps(diff, separators=(",", ":"), ensure_ascii=False),
        node_count=len(nodes),
        edge_count=len(edges),
        created_by=user.id,
        created_by_name=actor_name,
    )
    db.add(revision)
    db.flush()

    # Der explizite Stand und der aktuelle Arbeitsstand müssen exakt dieselbe
    # Geometrie tragen, auch wenn der 800-ms-Autosave noch nicht gelaufen ist.
    schema.graph_json = revision.graph_json
    if body.schema_name is not None:
        schema.name = body.schema_name.strip() or schema.name
    schema.updated_at = datetime.utcnow()

    db.add(HcAuditEvent(
        tenant_id=user.tenant_id,
        project_id=schema.project_id,
        schema_id=schema.id,
        revision_id=revision.id,
        entity_type="schema",
        entity_id=schema.id,
        action="schema_stand_gespeichert",
        actor_id=user.id,
        actor_name=actor_name,
        details_json=json.dumps({
            "version_nr": version_nr,
            "bezeichnung": revision.bezeichnung,
            "diff": diff,
        }, separators=(",", ":"), ensure_ascii=False),
    ))
    db.commit()
    db.refresh(revision)
    return _revision_out(revision, detail=True)


@router.get(
    "/schemas/{schema_id}/revisions/{revision_id}",
    response_model=SchemaRevisionDetailOut,
)
def get_schema_revision(
    schema_id: int,
    revision_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schema = _require_schema(schema_id, user, db)
    return _revision_out(_require_revision(revision_id, schema, db), detail=True)


@router.post("/schemas/{schema_id}/revisions/{revision_id}/restore", response_model=SchemaOut)
def restore_schema_revision(
    schema_id: int,
    revision_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schema = _require_schema(schema_id, user, db)
    revision = _require_revision(revision_id, schema, db)
    schema.graph_json = revision.graph_json
    schema.updated_at = datetime.utcnow()
    db.add(HcAuditEvent(
        tenant_id=user.tenant_id,
        project_id=schema.project_id,
        schema_id=schema.id,
        revision_id=revision.id,
        entity_type="schema",
        entity_id=schema.id,
        action="schema_stand_wiederhergestellt",
        actor_id=user.id,
        actor_name=user.name or user.email,
        details_json=json.dumps({
            "version_nr": revision.version_nr,
            "bezeichnung": revision.bezeichnung,
        }, separators=(",", ":"), ensure_ascii=False),
    ))
    db.commit()
    db.refresh(schema)
    return _to_out(schema)


@router.get("/schemas/{schema_id}/audit", response_model=List[AuditEventOut])
def list_schema_audit(
    schema_id: int,
    limit: int = Query(100, ge=1, le=250),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schema = _require_schema(schema_id, user, db)
    rows = (
        db.query(HcAuditEvent)
        .filter(
            HcAuditEvent.schema_id == schema.id,
            HcAuditEvent.tenant_id == user.tenant_id,
        )
        .order_by(HcAuditEvent.created_at.desc(), HcAuditEvent.id.desc())
        .limit(limit)
        .all()
    )
    return [_audit_out(row) for row in rows]


@router.delete("/schemas/{schema_id}", status_code=204)
def delete_schema(schema_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _require_schema(schema_id, user, db)
    db.delete(s)
    db.commit()
