"""Sicherer und wiederholbarer Bootstrap des Produktionsadmins."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import hash_password, verify_password
from app.bootstrap_admin import seed_admin
from app.database import Base
from app.models.auth import Firma, Role, User


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def test_bootstrap_legt_auf_leerer_datenbank_admin_an(db, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "Admin@Sirego.ch ")
    monkeypatch.setenv("ADMIN_INITIAL_PASSWORD", "erstes-sicheres-passwort")

    assert seed_admin(db, require_configuration=True) == "admin@sirego.ch"

    company = db.query(Firma).one()
    admin = db.query(User).one()
    assert company.id == 1
    assert admin.tenant_id == company.id
    assert admin.email == "admin@sirego.ch"
    assert admin.role == Role.admin
    assert admin.is_verified is True
    assert admin.is_active is True
    assert verify_password("erstes-sicheres-passwort", admin.password_hash)


def test_bootstrap_bewahrt_manuell_geaendertes_passwort(db, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "admin@sirego.ch")
    monkeypatch.setenv("ADMIN_INITIAL_PASSWORD", "initial-passwort")
    seed_admin(db, require_configuration=True)

    admin = db.query(User).one()
    admin.password_hash = hash_password("manuell-geaendert")
    db.commit()

    seed_admin(db, require_configuration=True)
    db.refresh(admin)

    assert verify_password("manuell-geaendert", admin.password_hash)
    assert not verify_password("initial-passwort", admin.password_hash)


def test_geaenderte_variable_rotiert_admin_passwort(db, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "admin@sirego.ch")
    monkeypatch.setenv("ADMIN_INITIAL_PASSWORD", "altes-passwort")
    seed_admin(db, require_configuration=True)

    monkeypatch.setenv("ADMIN_INITIAL_PASSWORD", "neues-passwort")
    seed_admin(db, require_configuration=True)

    admin = db.query(User).one()
    assert verify_password("neues-passwort", admin.password_hash)
    assert not verify_password("altes-passwort", admin.password_hash)


def test_verpflichtender_bootstrap_stoppt_ohne_variablen(db, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_INITIAL_PASSWORD", raising=False)

    with pytest.raises(RuntimeError, match="ADMIN_EMAIL und ADMIN_INITIAL_PASSWORD"):
        seed_admin(db, require_configuration=True)

    assert db.query(User).count() == 0
