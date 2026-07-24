"""Phase C — Projektstatus für das Project Universe (§16).

Ein einziger Endpunkt liefert je Modul (Projektdaten, Schema, Hydraulik,
Mengen, Kostenschätzung, Dokumentation) Status + kleine Kennzahl und einen
Gesamtfortschritt. Das Frontend rendert nur — es rechnet keinen Status selbst
zusammen (§16). Der Status baut auf der einen Projektwahrheit auf: Grunddaten
und Mengen kommen aus dem ProjectContext, nicht aus einer zweiten Quelle.

`compute_status` ist bewusst eine reine Funktion über bereits geladene Fakten,
damit sie ohne DB testbar bleibt. `status_fuer_projekt` verdrahtet die DB.
"""
from __future__ import annotations

from typing import Optional


# Statuswerte → Farbwelt aus §13 (Frontend mappt die Farbe):
#   not_started grau · in_progress blau · complete grün · warning orange
#   error rot · released violett · stale/incomplete = Zwischenzustände
_SCORE = {
    "complete": 1.0,
    "released": 1.0,
    "warning": 0.7,
    "stale": 0.6,
    "in_progress": 0.5,
    "incomplete": 0.5,
    "error": 0.0,
    "not_started": 0.0,
}

# Grunddaten, die ein Projekt fachlich vollständig machen (Zertifizierung ist
# optional und zählt nicht als Pflichtangabe).
_GRUNDDATEN_PFLICHT = {
    "ebf_m2", "anzahl_nutzungseinheiten", "nutzung", "projektart", "region",
}
_TECHNISCHE_KATEGORIEN = {"erzeugung", "verteilung", "messung"}


def _score(status: str) -> float:
    return _SCORE.get(status, 0.0)


def _project_data_module(context: dict) -> dict:
    params = [p for p in context["parameter"] if p["kategorie"] == "grunddaten"]
    pflicht = [p for p in params if p["key"] in _GRUNDDATEN_PFLICHT]
    vorhanden = [p for p in pflicht if p["effective_value"] is not None]
    fehlend = len(pflicht) - len(vorhanden)
    if not vorhanden:
        status = "not_started"
    elif fehlend == 0:
        status = "complete"
    else:
        status = "incomplete"
    return {
        "status": status,
        "known": len(vorhanden),
        "total": len(pflicht),
        "warnings": fehlend,
    }


def _quantities_module(context: dict) -> dict:
    params = [p for p in context["parameter"] if p["kategorie"] in _TECHNISCHE_KATEGORIEN]
    total = len(params)
    known = sum(1 for p in params if p["effective_value"] is not None)
    offen = sum(1 for p in params if p["status"] == "ergaenzung_erforderlich")
    if known == 0:
        status = "not_started"
    elif known == total and offen == 0:
        status = "complete"
    else:
        status = "incomplete"
    return {"status": status, "known": known, "total": total, "warnings": offen}


def _schema_module(schema_present: bool, node_count: int, edge_count: int,
                   revision_nr: Optional[int], warnings: Optional[int]) -> dict:
    if not schema_present or node_count == 0:
        return {"status": "not_started", "revision": revision_nr or 0,
                "node_count": node_count, "edge_count": edge_count, "warnings": 0}
    w = warnings or 0
    return {
        "status": "warning" if w > 0 else "complete",
        "revision": revision_nr or 0,
        "node_count": node_count,
        "edge_count": edge_count,
        "warnings": w,
    }


def _hydraulics_module(context: dict, schema_present: bool, node_count: int) -> dict:
    if not schema_present or node_count == 0:
        return {"status": "not_started"}
    heizgruppen = next((p for p in context["parameter"] if p["key"] == "anzahl_heizgruppen"), None)
    leistung = next((p for p in context["parameter"] if p["key"] == "leistung_kw"), None)
    hat_gruppen = bool(heizgruppen and (heizgruppen["effective_value"] or 0) > 0)
    if not hat_gruppen:
        return {"status": "not_started"}
    if leistung and leistung["effective_value"] is not None:
        return {"status": "complete"}
    return {"status": "warning"}


def _cost_module(cost_status: Optional[str], version_nr: int, stale: bool) -> dict:
    """cost_status stammt aus dem gespeicherten Workflow (projektfreigaben)."""
    if cost_status in (None, "nicht_begonnen"):
        return {"status": "not_started", "version": 0, "stale": False}
    if stale:
        return {"status": "stale", "version": version_nr, "stale": True}
    if cost_status in ("freigegeben", "exportiert"):
        return {"status": "released", "version": version_nr, "stale": False}
    return {"status": "in_progress", "version": version_nr, "stale": False}


def compute_status(
    *,
    context: dict,
    schema_present: bool,
    node_count: int,
    edge_count: int,
    revision_nr: Optional[int],
    schema_warnings: Optional[int],
    cost_status: Optional[str],
    cost_version_nr: int,
    cost_stale: bool,
) -> dict:
    modules = {
        "project_data": _project_data_module(context),
        "schema": _schema_module(schema_present, node_count, edge_count, revision_nr, schema_warnings),
        "hydraulics": _hydraulics_module(context, schema_present, node_count),
        "quantities": _quantities_module(context),
        "cost_estimate": _cost_module(cost_status, cost_version_nr, cost_stale),
        "documentation": {"status": "not_started"},
    }
    scores = [_score(m["status"]) for m in modules.values()]
    completion = round(sum(scores) / len(scores) * 100) if scores else 0
    return {"completion": completion, "modules": modules}


def _graph_counts(graph_json) -> tuple[int, int]:
    import json
    if isinstance(graph_json, str):
        try:
            graph = json.loads(graph_json or "{}")
        except (TypeError, ValueError):
            graph = {}
    else:
        graph = graph_json or {}
    return len(graph.get("nodes") or []), len(graph.get("edges") or [])


def _schema_warnungen(graph_json) -> Optional[int]:
    """Anzahl Hydraulik-Warnungen aus dem Rechenkern — dieselbe Wahrheit wie im
    Editor (§16). Fehler bei kaputten Graphen dürfen den Status nicht sprengen."""
    import json
    from app.calculations.hydraulik import berechne_schema
    try:
        graph = json.loads(graph_json) if isinstance(graph_json, str) else (graph_json or {})
        res = berechne_schema(graph.get("nodes") or [], graph.get("edges") or [])
        return len(res.get("warnungen") or [])
    except Exception:
        return None


def status_fuer_projekt(db, project, tenant_id: int) -> dict:
    """Projektstatus aus der DB zusammensetzen (§16). Nutzt denselben aktuellen
    Schema-Stand wie der ProjectContext, damit Mengen und Status übereinstimmen."""
    from app.models.heizungscockpit import HcSchema, HcSchemaRevision
    from app.models.kv import Kostenschaetzung
    from app.data.projektfreigaben import kostenschaetzung_freigabe
    from app.project_context import context_fuer_projekt

    context = context_fuer_projekt(db, project, tenant_id)

    schema = (
        db.query(HcSchema)
        .filter(HcSchema.project_id == project.id, HcSchema.tenant_id == tenant_id)
        .order_by(HcSchema.updated_at.desc(), HcSchema.id.desc())
        .first()
    )
    schema_present = schema is not None
    node_count = edge_count = 0
    revision_nr = None
    schema_warnings = None
    schema_updated_at = None
    if schema is not None:
        node_count, edge_count = _graph_counts(schema.graph_json)
        schema_updated_at = schema.updated_at
        letzte_rev = (
            db.query(HcSchemaRevision)
            .filter(HcSchemaRevision.schema_id == schema.id)
            .order_by(HcSchemaRevision.version_nr.desc())
            .first()
        )
        revision_nr = letzte_rev.version_nr if letzte_rev else 0
        if node_count > 0:
            schema_warnings = _schema_warnungen(schema.graph_json)

    ks = (
        db.query(Kostenschaetzung)
        .filter(Kostenschaetzung.project_id == project.id, Kostenschaetzung.tenant_id == tenant_id)
        .first()
    )
    cost_status = None
    cost_version_nr = 0
    cost_stale = False
    if ks is not None:
        freigabe = kostenschaetzung_freigabe(ks.inputs_json, ks.updated_at)
        cost_status = freigabe["status"]
        cost_version_nr = freigabe["version_nr"]
        # Phase-C-Heuristik: Schema nach der Kostenschätzung geändert → veraltet.
        # Phase E verfeinert das über Revisions-ID und Eingabe-Snapshot.
        if schema_updated_at is not None and ks.updated_at is not None:
            cost_stale = schema_updated_at > ks.updated_at

    return compute_status(
        context=context,
        schema_present=schema_present,
        node_count=node_count,
        edge_count=edge_count,
        revision_nr=revision_nr,
        schema_warnings=schema_warnings,
        cost_status=cost_status,
        cost_version_nr=cost_version_nr,
        cost_stale=cost_stale,
    )
