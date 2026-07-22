import base64
import binascii
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.calculations.hydraulik import berechne_schema
from app.database import get_db
from app.export.pdf import erzeuge_pdf
from app.models.auth import User
from app.models.heizungscockpit import HcProject, HcSchema

router = APIRouter(prefix="/api/v1", tags=["Heizungscockpit – Export"])


class SchemaPdfRequest(BaseModel):
    inhalt: str = "beides"
    graph: dict | None = None
    schema_png: str | None = None


def _png_bytes(data_url: str | None) -> bytes | None:
    if not data_url:
        return None
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise HTTPException(status_code=422, detail="schema_png muss eine PNG-Data-URL sein")
    try:
        raw = base64.b64decode(data_url[len(prefix):], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="schema_png ist ungültig") from exc
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Schema-Abbildung ist zu gross")
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=422, detail="schema_png enthält kein PNG")
    return raw


def _schema_pdf_response(schema_id: int, inhalt: str, user: User, db: Session,
                         graph_override: dict | None = None,
                         schema_png: bytes | None = None):
    if inhalt not in ("schema", "berechnungen", "beides"):
        raise HTTPException(status_code=422, detail="inhalt muss schema, berechnungen oder beides sein")
    s = (db.query(HcSchema)
         .filter(HcSchema.id == schema_id, HcSchema.tenant_id == user.tenant_id)
         .first())
    if not s:
        raise HTTPException(status_code=404, detail="Schema nicht gefunden")
    p = (db.query(HcProject)
         .filter(HcProject.id == s.project_id, HcProject.tenant_id == user.tenant_id)
         .first())

    if graph_override is not None:
        graph = graph_override if isinstance(graph_override, dict) else {}
    else:
        try:
            graph = json.loads(s.graph_json) if s.graph_json else {}
        except Exception:
            graph = {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    results = berechne_schema(nodes, edges)

    pdf = erzeuge_pdf(
        p.name if p else "Projekt", s.name or "Schema", inhalt,
        nodes, edges, results, schema_png=schema_png,
    )
    sicher = re.sub(r"[^A-Za-z0-9_-]+", "_", (p.name if p else "Projekt")).strip("_") or "Projekt"
    dateiname = f"{sicher}_{inhalt}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{dateiname}"'},
    )


@router.get("/schemas/{schema_id}/pdf")
def schema_pdf(schema_id: int, inhalt: str = "beides", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """PDF-Export: inhalt = schema | berechnungen | beides (Abnahme F4).

    Schema als Vektor (SVG→PDF, A3 quer) inkl. Legende; Berechnungen pro
    Bauteil mit Eingaben + Resultat + Einheit; Deckblatt immer dabei.
    Verlangt ein gültiges Bearer-Token (Sicherheits-Review 2026-07-19) — das
    Frontend muss den PDF-Endpunkt darum authentifiziert (Axios-Blob statt
    window.open) aufrufen, siehe hc_export.py::TODO Punkt 3.
    """
    return _schema_pdf_response(schema_id, inhalt, user, db)


@router.post("/schemas/{schema_id}/pdf")
def schema_pdf_exakt(schema_id: int, body: SchemaPdfRequest,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """PDF aus dem aktuellen Graph und der tatsächlichen Browser-Zeichenfläche."""
    return _schema_pdf_response(
        schema_id, body.inhalt, user, db,
        graph_override=body.graph,
        schema_png=_png_bytes(body.schema_png),
    )
