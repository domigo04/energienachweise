"""Ladezeit der Projektliste — Schutz gegen das N+1 auf base_data.

Bewiesener Ausgangszustand (2026-07-20): GET /api/v1/projects serialisierte
jedes Projekt inkl. base_data → pro Projekt ein eigener Lazy-Load, also 1 + N
SQL-Abfragen. Auf Railway/Postgres ist jede Abfrage ein Netzwerk-Roundtrip →
Liste wächst linear langsamer. Fix: base_data aus ProjectOut (Liste) entfernt,
nur noch in ProjectDetailOut (Einzelprojekt). Dieser Test friert das ein: die
Liste darf NICHT mit der Projektzahl mehr Abfragen machen.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.heizungscockpit import HcProject, HcProjectBaseData
from app.schemas.hc_schemas import ProjectDetailOut, ProjectOut


def _frische_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return engine, Session()


def _zaehler(engine):
    zahl = {"n": 0}

    @event.listens_for(engine, "before_cursor_execute")
    def _c(conn, cur, statement, params, ctx, many):  # noqa: ANN001
        if statement.lstrip().upper().startswith("SELECT"):
            zahl["n"] += 1

    return zahl


def _n_projekte(db, n):
    for i in range(n):
        p = HcProject(tenant_id=1, erstellt_von=1, name=f"Projekt {i}")
        db.add(p)
        db.flush()
        db.add(HcProjectBaseData(tenant_id=1, project_id=p.id))
    db.commit()


def test_projektliste_kein_n_plus_1():
    """Liste über N Projekte macht eine feste, kleine Zahl SELECTs — nicht 1+N."""
    engine, db = _frische_db()
    _n_projekte(db, 12)
    db.expire_all()  # nichts aus dem Identity-Map-Cache, echte Ladung erzwingen

    zahl = _zaehler(engine)
    rows = db.query(HcProject).filter(HcProject.tenant_id == 1).all()
    _ = [ProjectOut.model_validate(r) for r in rows]  # Serialisierung wie im Router

    # 1 SELECT für die Projektliste. Entscheidend: KEINE 12 base_data-Nachladungen.
    assert zahl["n"] <= 2, f"Projektliste löste {zahl['n']} SELECTs aus — N+1 zurück?"


def test_projektliste_ohne_base_data():
    """ProjectOut (Liste) trägt bewusst kein base_data-Feld mehr."""
    assert "base_data" not in ProjectOut.model_fields
    assert "base_data" in ProjectDetailOut.model_fields


def test_einzelprojekt_hat_base_data_noch():
    """Detailsicht liefert base_data weiterhin — Fachdaten unverändert."""
    engine, db = _frische_db()
    p = HcProject(tenant_id=1, erstellt_von=1, name="Eins")
    db.add(p)
    db.flush()
    db.add(HcProjectBaseData(tenant_id=1, project_id=p.id, t_aussen=-8.0, t_innen=20.0))
    db.commit()

    proj = db.query(HcProject).filter(HcProject.id == p.id).first()
    detail = ProjectDetailOut.model_validate(
        {
            "id": proj.id, "name": proj.name, "standort": None, "kunde": None,
            "beschreibung": None, "status": proj.status,
            "created_at": proj.created_at, "updated_at": proj.updated_at,
            "base_data": proj.base_data,
        }
    )
    assert detail.base_data is not None
    assert detail.base_data.t_aussen == -8.0
