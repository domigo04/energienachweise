"""Regressionstest für die Entfernung des schnellen Admin-Passwortfingerprints."""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.main import _drop_legacy_admin_password_fingerprint


_PFAD = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "20260801_01_admin_seed_version.py"
)
_SPEC = importlib.util.spec_from_file_location("migration_20260801_01", _PFAD)
migration = importlib.util.module_from_spec(_SPEC)
assert _SPEC.loader is not None
_SPEC.loader.exec_module(migration)


def test_migration_entfernt_fingerprint_und_bewahrt_passworthash():
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TABLE hc_users ("
            "id INTEGER PRIMARY KEY, password_hash VARCHAR NOT NULL, "
            "admin_pw_seed_fingerprint VARCHAR)"
        ))
        connection.execute(
            sa.text(
                "INSERT INTO hc_users "
                "(id, password_hash, admin_pw_seed_fingerprint) "
                "VALUES (1, :password_hash, :fingerprint)"
            ),
            {"password_hash": "bcrypt-bleibt", "fingerprint": "schneller-sha256-wert"},
        )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        columns = {column["name"] for column in sa.inspect(connection).get_columns("hc_users")}
        row = connection.execute(sa.text(
            "SELECT password_hash, admin_pw_seed_version FROM hc_users WHERE id = 1"
        )).one()

    assert "admin_pw_seed_fingerprint" not in columns
    assert "admin_pw_seed_version" in columns
    assert row.password_hash == "bcrypt-bleibt"
    assert row.admin_pw_seed_version is None


def test_lokaler_schemaabgleich_entfernt_toten_fingerprint():
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TABLE hc_users ("
            "id INTEGER PRIMARY KEY, password_hash VARCHAR NOT NULL, "
            "admin_pw_seed_version VARCHAR, admin_pw_seed_fingerprint VARCHAR)"
        ))
        connection.execute(
            sa.text(
                "INSERT INTO hc_users "
                "(id, password_hash, admin_pw_seed_version, admin_pw_seed_fingerprint) "
                "VALUES (1, 'bcrypt-bleibt', NULL, 'schneller-sha256-wert')"
            )
        )

        _drop_legacy_admin_password_fingerprint(connection, is_sqlite=True)

        columns = {column["name"] for column in sa.inspect(connection).get_columns("hc_users")}
        row = connection.execute(sa.text(
            "SELECT password_hash, admin_pw_seed_version FROM hc_users WHERE id = 1"
        )).one()

    assert "admin_pw_seed_fingerprint" not in columns
    assert row.password_hash == "bcrypt-bleibt"
    assert row.admin_pw_seed_version is None
