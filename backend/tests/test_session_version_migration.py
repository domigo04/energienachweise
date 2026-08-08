"""Migration bestehender Benutzer auf eine widerrufbare Session-Version."""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "20260808_01_user_session_version.py"
)
_SPEC = importlib.util.spec_from_file_location("migration_20260808_01", _PATH)
migration = importlib.util.module_from_spec(_SPEC)
assert _SPEC.loader is not None
_SPEC.loader.exec_module(migration)


def test_migration_gibt_altbestand_session_version_null():
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TABLE hc_users (id INTEGER PRIMARY KEY, email VARCHAR NOT NULL)"
        ))
        connection.execute(sa.text(
            "INSERT INTO hc_users (id, email) VALUES (1, 'altbestand@example.test')"
        ))

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        column = next(
            item
            for item in sa.inspect(connection).get_columns("hc_users")
            if item["name"] == "session_version"
        )
        value = connection.execute(sa.text(
            "SELECT session_version FROM hc_users WHERE id = 1"
        )).scalar_one()

    assert column["nullable"] is False
    assert value == 0
