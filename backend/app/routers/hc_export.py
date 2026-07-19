import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.calculations.hydraulik import berechne_schema
from app.database import get_db
from app.export.pdf import erzeuge_pdf
from app.models.heizungscockpit import HcProject, HcSchema

router = APIRouter(prefix="/api/v1", tags=["Heizungscockpit – Export"])

TENANT_ID = 1


@router.get("/schemas/{schema_id}/pdf")
def schema_pdf(schema_id: int, inhalt: str = "beides", db: Session = Depends(get_db)):
    """PDF-Export: inhalt = schema | berechnungen | beides (Abnahme F4).

    Schema als Vektor (SVG→PDF, A3 quer) inkl. Legende; Berechnungen pro
    Bauteil mit Eingaben + Resultat + Einheit; Deckblatt immer dabei.
    """
    if inhalt not in ("schema", "berechnungen", "beides"):
        raise HTTPException(status_code=422, detail="inhalt muss schema, berechnungen oder beides sein")
    s = (db.query(HcSchema)
         .filter(HcSchema.id == schema_id, HcSchema.tenant_id == TENANT_ID)
         .first())
    if not s:
        raise HTTPException(status_code=404, detail="Schema nicht gefunden")
    p = (db.query(HcProject)
         .filter(HcProject.id == s.project_id, HcProject.tenant_id == TENANT_ID)
         .first())

    try:
        graph = json.loads(s.graph_json) if s.graph_json else {}
    except Exception:
        graph = {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    results = berechne_schema(nodes, edges)

    pdf = erzeuge_pdf(p.name if p else "Projekt", s.name or "Schema", inhalt, nodes, edges, results)
    # HTTP-Header sind Latin-1 — Dateiname auf sichere Zeichen reduzieren
    sicher = re.sub(r"[^A-Za-z0-9_-]+", "_", (p.name if p else "Projekt")).strip("_") or "Projekt"
    dateiname = f"{sicher}_{inhalt}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{dateiname}"'},
    )
