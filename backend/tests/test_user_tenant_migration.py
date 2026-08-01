"""Migrationstests für die fail-closed Benutzer-Firmenzuordnung."""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.exc import IntegrityError


_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "20260801_02_user_tenant_fail_closed.py"
)
_SPEC = importlib.util.spec_from_file_location("migration_20260801_02", _PATH)
migration = importlib.util.module_from_spec(_SPEC)
assert _SPEC.loader is not None
_SPEC.loader.exec_module(migration)


def _schema(connection) -> None:
    connection.execute(sa.text(
        "CREATE TABLE hc_firmen (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL)"
    ))
    connection.execute(sa.text(
        "CREATE TABLE hc_users ("
        "id INTEGER PRIMARY KEY, tenant_id INTEGER DEFAULT 1, "
        "role VARCHAR NOT NULL, email VARCHAR NOT NULL)"
    ))
    connection.execute(sa.text("INSERT INTO hc_firmen (id, name) VALUES (1, 'Firma')"))


def _upgrade(connection) -> None:
    migration.op = Operations(MigrationContext.configure(connection))
    migration.upgrade()


def test_migration_entfernt_default_und_erlaubt_null_nur_fuer_plattformadmin():
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        _schema(connection)
        connection.execute(sa.text(
            "INSERT INTO hc_users (id, tenant_id, role, email) "
            "VALUES (1, 1, 'user', 'mitglied@example.test')"
        ))

        _upgrade(connection)

        tenant_column = next(
            column
            for column in sa.inspect(connection).get_columns("hc_users")
            if column["name"] == "tenant_id"
        )
        constraints = {
            constraint["name"]
            for constraint in sa.inspect(connection).get_check_constraints("hc_users")
        }
        assert tenant_column["default"] is None
        assert migration.CONSTRAINT_NAME in constraints

        with pytest.raises(IntegrityError):
            connection.execute(sa.text(
                "INSERT INTO hc_users (id, tenant_id, role, email) "
                "VALUES (2, NULL, 'user', 'ohne@example.test')"
            ))
        connection.execute(sa.text(
            "INSERT INTO hc_users (id, tenant_id, role, email) "
            "VALUES (3, NULL, 'admin', 'plattform@example.test')"
        ))


@pytest.mark.parametrize(
    ("tenant_id", "expected"),
    [
        (None, "Ohne Firma: 1; verwaiste Firma: 0"),
        (9999, "Ohne Firma: 0; verwaiste Firma: 1"),
    ],
)
def test_migration_stoppt_vor_schemaaenderung_bei_unsicheren_altbestandsdaten(
    tenant_id, expected,
):
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        _schema(connection)
        connection.execute(
            sa.text(
                "INSERT INTO hc_users (id, tenant_id, role, email) "
                "VALUES (1, :tenant_id, 'user', 'altbestand@example.test')"
            ),
            {"tenant_id": tenant_id},
        )

        with pytest.raises(RuntimeError, match=expected):
            _upgrade(connection)

        tenant_column = next(
            column
            for column in sa.inspect(connection).get_columns("hc_users")
            if column["name"] == "tenant_id"
        )
        assert tenant_column["default"] == "1"
        assert sa.inspect(connection).get_check_constraints("hc_users") == []
