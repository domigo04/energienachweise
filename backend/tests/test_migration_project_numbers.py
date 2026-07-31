"""Migrationstest: Backfill der Projektnummern und Planzuweisung.

Geprüft wird der Ablauf, den die Migration `20260731_01` ausführt — gegen eine
Datenbank, die bereits Firmen und Projekte enthält. Nichts darf verloren gehen,
und ein zweiter Lauf darf nichts kaputt machen.
"""
from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import Firma
from app.models.heizungscockpit import HcProject
from app.models.subscription import ProjectNumberSequence, SubscriptionPlan

# Die Migration wird als Modul geladen; sie hängt nur an einer Connection.
import importlib.util
from pathlib import Path

_PFAD = (Path(__file__).resolve().parents[1] / "alembic" / "versions"
         / "20260731_01_project_numbers_and_plans.py")
_spec = importlib.util.spec_from_file_location("migration_20260731_01", _PFAD)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def _altbestand_engine():
    """Datenbank im Zustand VOR der Migration.

    `hc_projects` entsteht bewusst ohne die neuen Unique-Constraints — genau so
    sieht eine bestehende Installation aus, und nur so lässt sich prüfen, dass
    der Backfill doppelte oder ungültige Altnummern auflöst, bevor die
    Constraints greifen.
    """
    from sqlalchemy import UniqueConstraint
    from sqlalchemy.schema import CreateTable

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    tabelle = HcProject.__table__
    unique = [c for c in tabelle.constraints if isinstance(c, UniqueConstraint)]
    for bedingung in unique:
        tabelle.constraints.discard(bedingung)
    try:
        ddl = str(CreateTable(tabelle).compile(engine))
    finally:
        for bedingung in unique:
            tabelle.constraints.add(bedingung)
    with engine.begin() as conn:
        conn.execute(text(ddl))
    # create_all legt nur die noch fehlenden Tabellen an.
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def bestand():
    """Datenbank mit Firmen und Projekten, wie sie vor der Migration aussieht."""
    engine = _altbestand_engine()
    db = sessionmaker(bind=engine)()

    a = Firma(name="Firma A", is_active=True)
    b = Firma(name="Firma B", is_active=True)
    db.add_all([a, b])
    db.commit()

    # Firma A: drei Projekte 2026, eines 2027 — bewusst unsortiert eingefügt.
    db.add_all([
        HcProject(tenant_id=a.id, name="A zweitens",
                  created_at=datetime(2026, 5, 2)),
        HcProject(tenant_id=a.id, name="A erstens",
                  created_at=datetime(2026, 1, 9)),
        HcProject(tenant_id=a.id, name="A drittens",
                  created_at=datetime(2026, 11, 30)),
        HcProject(tenant_id=a.id, name="A 2027", created_at=datetime(2027, 2, 1)),
        HcProject(tenant_id=b.id, name="B erstens", created_at=datetime(2026, 3, 3)),
        HcProject(tenant_id=b.id, name="B zweitens", created_at=datetime(2026, 4, 4)),
    ])
    db.commit()
    yield engine, db, a, b
    db.close()


def _migrieren(engine):
    with engine.begin() as conn:
        bericht = migration.backfill_projektnummern(conn)
        migration.seed_plaene(conn)
    return bericht


def test_alle_daten_bleiben_erhalten(bestand):
    engine, db, a, b = bestand
    vorher = db.query(HcProject).count()
    firmen_vorher = db.query(Firma).count()
    _migrieren(engine)
    db.expire_all()
    assert db.query(HcProject).count() == vorher
    assert db.query(Firma).count() == firmen_vorher


def test_projekte_werden_nach_datum_fortlaufend_nummeriert(bestand):
    engine, db, a, b = bestand
    _migrieren(engine)
    db.expire_all()
    nummern = {
        p.name: p.projektnummer
        for p in db.query(HcProject).filter(HcProject.tenant_id == a.id).all()
    }
    assert nummern["A erstens"] == "26001"
    assert nummern["A zweitens"] == "26002"
    assert nummern["A drittens"] == "26003"
    assert nummern["A 2027"] == "27001"


def test_jede_firma_beginnt_bei_eins(bestand):
    engine, db, a, b = bestand
    _migrieren(engine)
    db.expire_all()
    b_nummern = sorted(
        p.projektnummer
        for p in db.query(HcProject).filter(HcProject.tenant_id == b.id).all()
    )
    assert b_nummern == ["26001", "26002"]


def test_sequenz_steht_auf_dem_hoechsten_wert(bestand):
    engine, db, a, b = bestand
    _migrieren(engine)
    db.expire_all()
    zeile = db.query(ProjectNumberSequence).filter(
        ProjectNumberSequence.company_id == a.id,
        ProjectNumberSequence.year == 2026).one()
    assert zeile.last_sequence == 3
    # Das nächste Projekt bekommt 26004 — keine Wiederverwendung.
    from app.services import project_number as pn
    assert pn.naechste_nummer(db, a.id, 2026)[0] == "26004"


def test_gueltige_bestehende_nummer_wird_uebernommen(bestand):
    engine, db, a, b = bestand
    projekt = db.query(HcProject).filter(HcProject.name == "A zweitens").one()
    projekt.projektnummer = "26042"
    db.commit()
    _migrieren(engine)
    db.expire_all()
    db.refresh(projekt)
    assert projekt.projektnummer == "26042"
    assert projekt.project_sequence == 42
    # Der Zähler steht danach auf dem höchsten vergebenen Wert.
    zeile = db.query(ProjectNumberSequence).filter(
        ProjectNumberSequence.company_id == a.id,
        ProjectNumberSequence.year == 2026).one()
    assert zeile.last_sequence == 42


def test_ungueltige_bestehende_nummer_wird_neu_vergeben_und_gemeldet(bestand):
    engine, db, a, b = bestand
    projekt = db.query(HcProject).filter(HcProject.name == "A erstens").one()
    projekt.projektnummer = "P-2026/17"        # passt nicht zum Format
    db.commit()
    bericht = _migrieren(engine)
    db.expire_all()
    db.refresh(projekt)
    assert projekt.projektnummer == "26001"
    assert any("P-2026/17" in zeile for zeile in bericht), bericht


def test_doppelte_bestehende_nummer_wird_aufgeloest(bestand):
    engine, db, a, b = bestand
    for name in ("A erstens", "A zweitens"):
        db.query(HcProject).filter(HcProject.name == name).one().projektnummer = "26007"
    db.commit()
    _migrieren(engine)
    db.expire_all()
    nummern = [
        p.projektnummer
        for p in db.query(HcProject).filter(HcProject.tenant_id == a.id,
                                            HcProject.project_year == 2026).all()
    ]
    assert len(nummern) == len(set(nummern)), nummern
    assert "26007" in nummern


def test_projekt_ohne_firma_wird_gemeldet_statt_geloescht(bestand):
    engine, db, a, b = bestand
    # Direkt per SQL: das Modell setzt tenant_id sonst automatisch auf 1.
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO hc_projects (tenant_id, name, created_at) "
            "VALUES (NULL, 'Ohne Firma', '2026-06-06 00:00:00')"))
    bericht = _migrieren(engine)
    db.expire_all()
    assert db.query(HcProject).filter(HcProject.name == "Ohne Firma").count() == 1
    assert any("ohne Firma" in zeile for zeile in bericht), bericht


def test_projekt_ohne_datum_nutzt_den_migrationszeitpunkt(bestand):
    engine, db, a, b = bestand
    # Direkt per SQL: created_at trägt im Modell einen Default.
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO hc_projects (tenant_id, name, created_at) "
            f"VALUES ({a.id}, 'Ohne Datum', NULL)"))
    bericht = _migrieren(engine)
    db.expire_all()
    ohne = db.query(HcProject).filter(HcProject.name == "Ohne Datum").one()
    assert ohne.projektnummer is not None
    assert ohne.project_year == datetime.utcnow().year
    assert any("ohne Datum" in zeile for zeile in bericht), bericht


def test_plaene_werden_angelegt_und_firmen_zugewiesen(bestand):
    engine, db, a, b = bestand
    _migrieren(engine)
    db.expire_all()
    schluessel = {p.key for p in db.query(SubscriptionPlan).all()}
    assert {"basic", "professional", "enterprise", "internal"} <= schluessel
    for firma in db.query(Firma).all():
        assert firma.subscription_plan_id is not None


def test_zweiter_lauf_aendert_nichts(bestand):
    """Die Migration muss mehrfach ausführbar sein, ohne etwas zu zerstören."""
    engine, db, a, b = bestand
    _migrieren(engine)
    db.expire_all()
    vorher = {p.id: p.projektnummer for p in db.query(HcProject).all()}
    plaene_vorher = db.query(SubscriptionPlan).count()

    _migrieren(engine)
    db.expire_all()
    nachher = {p.id: p.projektnummer for p in db.query(HcProject).all()}
    assert nachher == vorher
    assert db.query(SubscriptionPlan).count() == plaene_vorher
    # Auch die Sequenz bleibt stehen und springt nicht zurück.
    zeile = db.query(ProjectNumberSequence).filter(
        ProjectNumberSequence.company_id == a.id,
        ProjectNumberSequence.year == 2026).one()
    assert zeile.last_sequence == 3


def test_neustart_nach_migration_verliert_keine_daten(bestand):
    """Simuliert einen Deploy: create_all läuft erneut über dieselbe Datenbank."""
    engine, db, a, b = bestand
    _migrieren(engine)
    db.expire_all()
    vorher = db.query(HcProject).count()

    Base.metadata.create_all(bind=engine)      # wie beim Serverstart
    with engine.connect() as conn:
        anzahl = conn.execute(text("SELECT COUNT(*) FROM hc_projects")).scalar()
    assert anzahl == vorher
