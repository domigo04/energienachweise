import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.calculations.hydraulik import berechne_schema
from app.database import get_db
from app.export.pdf import erzeuge_pdf
from app.export.design import fuer_firma
from app.models.auth import User
from app.models.heizungscockpit import HcProject, HcSchema

router = APIRouter(prefix="/api/v1", tags=["Heizungscockpit – Export"])


class SchemaPdfRequest(BaseModel):
    inhalt: str = "beides"
    graph: dict | None = None


def _schema_pdf_response(schema_id: int, inhalt: str, user: User, db: Session,
                         graph_override: dict | None = None):
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
        nodes, edges, results,
        # Der Auftritt gehoert der Firma, die exportiert. Ohne eigene Marke
        # bleibt es beim bisherigen Standard-Look.
        marke=fuer_firma(user.firma.name if user.firma else None),
        plankopf={
            "projektnummer": p.projektnummer if p and p.projektnummer else (str(p.id) if p else "—"),
            "bauherr": (p.bauherr or p.kunde) if p else "—",
            "standort": (
                ", ".join(filter(None, [p.strasse, " ".join(filter(None, [p.plz, p.ort]))]))
                or p.standort or "—"
            ) if p else "—",
            "planer": user.name or user.email,
            "bearbeiter": user.name or user.email,
            "planbezeichnung": (p.planbezeichnung if p and p.planbezeichnung else None) or s.name or "Prinzipschema",
            "dokumentnummer": f"HC-{p.id if p else 'P'}-{s.id}",
            "revision": str(max((revision.version_nr for revision in s.revisions), default=0)),
            "status": (
                f"SIA {p.sia_phase or '—'} · {p.projektfortschritt_pct or 0}%"
                if p else "Entwurf"
            ),
            "planformat": "A3 quer",
            "logo_data_url": user.firma.logo_data_url if user.firma else None,
        },
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
    """Planbasierter Vektorexport aus dem aktuellen, noch nicht gespeicherten Graph."""
    return _schema_pdf_response(
        schema_id, body.inhalt, user, db,
        graph_override=body.graph,
    )
