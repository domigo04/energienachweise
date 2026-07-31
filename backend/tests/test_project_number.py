"""Automatische Projektnummer: Format, Mandantentrennung, Nebenläufigkeit."""
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import Firma  # noqa: F401 — Fremdschlüsselziel
from app.models.heizungscockpit import HcProject  # noqa: F401
from app.models.subscription import ProjectNumberSequence
from app.services import project_number as pn


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _anlegen(db, firma_id: int, jahr: int) -> str:
    nummer, y, folge = pn.naechste_nummer(db, firma_id, jahr)
    db.add(HcProject(tenant_id=firma_id, name=f"P{nummer}", projektnummer=nummer,
                     project_year=y, project_sequence=folge))
    db.commit()
    return nummer


# ── Format ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("jahr,folge,erwartet", [
    (2026, 1, "26001"), (2026, 12, "26012"), (2026, 99, "26099"),
    (2026, 100, "26100"), (2026, 999, "26999"), (2027, 1, "27001"),
])
def test_format(jahr, folge, erwartet):
    assert pn.formatiere(jahr, folge) == erwartet
    assert len(erwartet) == 5 and erwartet.isdigit()


def test_erstes_zweites_und_zwoelftes_projekt():
    db = _db()
    assert _anlegen(db, 1, 2026) == "26001"
    assert _anlegen(db, 1, 2026) == "26002"
    for _ in range(9):
        _anlegen(db, 1, 2026)
    assert _anlegen(db, 1, 2026) == "26012"
    db.close()


def test_zweite_firma_beginnt_wieder_bei_eins():
    """Es gibt keine globale Nummerierung über alle Firmen."""
    db = _db()
    assert _anlegen(db, 1, 2026) == "26001"
    assert _anlegen(db, 1, 2026) == "26002"
    assert _anlegen(db, 2, 2026) == "26001"
    db.close()


def test_neues_jahr_beginnt_wieder_bei_eins():
    db = _db()
    _anlegen(db, 1, 2026)
    _anlegen(db, 1, 2026)
    assert _anlegen(db, 1, 2027) == "27001"
    db.close()


def test_zwei_firmen_duerfen_dieselbe_nummer_haben():
    db = _db()
    a = _anlegen(db, 1, 2026)
    b = _anlegen(db, 2, 2026)
    assert a == b == "26001"
    nummern = db.query(HcProject).filter(HcProject.projektnummer == "26001").count()
    assert nummern == 2
    db.close()


def test_dieselbe_firma_nicht_doppelt():
    """Der Unique-Constraint greift, auch wenn jemand direkt schreibt."""
    from sqlalchemy.exc import IntegrityError

    db = _db()
    _anlegen(db, 1, 2026)
    db.add(HcProject(tenant_id=1, name="Doppelt", projektnummer="26001",
                     project_year=2026, project_sequence=1))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()


# ── Nebenläufigkeit und Löschen ────────────────────────────────────────────

def test_gleichzeitige_erstellung_ergibt_verschiedene_nummern():
    """Zwei Sitzungen auf derselben Datenbank dürfen nie dieselbe Nummer ziehen."""
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Sitzung = sessionmaker(bind=engine)
    a, b = Sitzung(), Sitzung()
    try:
        nummer_a, _, _ = pn.naechste_nummer(a, 1, 2026)
        a.commit()
        nummer_b, _, _ = pn.naechste_nummer(b, 1, 2026)
        b.commit()
        assert nummer_a != nummer_b
        assert {nummer_a, nummer_b} == {"26001", "26002"}
    finally:
        a.close()
        b.close()


def test_geloeschte_nummer_wird_nicht_wiederverwendet():
    db = _db()
    _anlegen(db, 1, 2026)
    _anlegen(db, 1, 2026)
    dritte = _anlegen(db, 1, 2026)
    assert dritte == "26003"
    db.query(HcProject).filter(HcProject.projektnummer == "26003").delete()
    db.commit()
    assert _anlegen(db, 1, 2026) == "26004"
    db.close()


def test_ueber_999_projekte_ergibt_kontrollierten_fehler():
    db = _db()
    zeile = ProjectNumberSequence(company_id=1, year=2026, last_sequence=999)
    db.add(zeile)
    db.commit()
    with pytest.raises(pn.ProjectSequenceLimitReached) as fehler:
        pn.naechste_nummer(db, 1, 2026)
    assert fehler.value.code == "PROJECT_SEQUENCE_LIMIT_REACHED"
    db.close()


def test_jahr_kommt_vom_eroeffnungsdatum():
    assert pn.jahr_von(datetime(2027, 3, 4)) == 2027
    # Ohne Datum die Serverzeit — nie ein Browserwert.
    assert pn.jahr_von(None) == datetime.utcnow().year


# ── Schnittstelle ──────────────────────────────────────────────────────────

def test_update_schema_kennt_die_nummernfelder_nicht():
    """Keine versteckte Änderung über die generische PATCH-Route."""
    from app.schemas.hc_schemas import ProjectUpdate

    assert "projektnummer" not in ProjectUpdate.model_fields
    assert "project_year" not in ProjectUpdate.model_fields
    assert "project_sequence" not in ProjectUpdate.model_fields


def test_create_schema_lehnt_mitgesendete_nummer_ab():
    from pydantic import ValidationError
    from app.schemas.hc_schemas import ProjectCreate

    assert "projektnummer" not in ProjectCreate.model_fields
    with pytest.raises(ValidationError):
        ProjectCreate(name="Test", projektnummer="99999")


def test_update_route_fasst_die_nummer_nicht_an():
    """Auch die Feldliste der Route darf die Nummer nicht enthalten."""
    import inspect

    from app.routers import hc_projects

    quelle = inspect.getsource(hc_projects.update_project)
    kopf = quelle.split("for field in (")[1].split("):")[0]
    assert "projektnummer" not in kopf
    assert "project_year" not in kopf
