import pytest

from app.runtime import (
    assert_safe_runtime_configuration,
    production_configuration_errors,
)


def test_lokale_entwicklung_erlaubt_sqlite_und_dev_secret():
    assert production_configuration_errors(
        environment="development",
        database_url="sqlite:///./lokal.db",
        secret_key="dev-secret-change-me",
    ) == []


def test_produktion_verweigert_sqlite_und_unsicheren_secret():
    errors = production_configuration_errors(
        environment="production",
        database_url="sqlite:///./ephemeral.db",
        secret_key="dev-secret-change-me",
    )
    assert any("SQLite" in error for error in errors)
    assert any("SECRET_KEY" in error for error in errors)


def test_produktion_akzeptiert_postgres_und_starken_secret():
    assert production_configuration_errors(
        environment="production",
        database_url="postgresql+psycopg2://user:pw@db.internal:5432/app",
        secret_key="x" * 48,
    ) == []


def test_unsichere_produktion_stoppt_start():
    with pytest.raises(RuntimeError, match="Unsichere Produktionskonfiguration"):
        assert_safe_runtime_configuration(
            environment="prod",
            database_url="",
            secret_key="kurz",
        )
