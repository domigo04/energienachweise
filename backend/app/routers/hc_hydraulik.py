from functools import lru_cache
import json
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.calculations.hydraulik import berechne_schema

router = APIRouter(prefix="/api/v1/hydraulik", tags=["Heizungscockpit – Hydraulik"])


class GraphNode(BaseModel):
    id: str
    type: str
    data: dict = {}


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    stroke: Optional[str] = None    # '#ef4444' = VL, '#3b82f6' = RL
    style: Optional[dict] = None    # alternativ: style.stroke (gespeicherte Graphen)
    data: Optional[dict] = None     # z.B. laenge_m (Leitungsdimensionierung)


class GraphInput(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


@lru_cache(maxsize=128)
def _berechne_gecacht(nodes_json: str, edges_json: str):
    """Reine Hydraulikberechnung für identische Graphen wiederverwenden."""
    return berechne_schema(json.loads(nodes_json), json.loads(edges_json))


@router.post("/berechnen")
def hydraulik_berechnen(body: GraphInput):
    """Rechnet das komplette Anlagenschema (PHYSIK.md §1–§4).

    Der Editor schickt den Graphen, das Backend liefert Flüsse je Leitung/
    Knoten plus Verteiler- und Gruppen-Resultate. Einzige Rechen-Wahrheit.
    """
    nodes = [n.model_dump() for n in body.nodes]
    edges = [e.model_dump() for e in body.edges]
    return _berechne_gecacht(
        json.dumps(nodes, sort_keys=True, separators=(",", ":")),
        json.dumps(edges, sort_keys=True, separators=(",", ":")),
    )
