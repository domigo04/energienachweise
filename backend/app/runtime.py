"""Laufzeitregeln, die einen unsicheren Produktionsstart verhindern."""

import os


PRODUCTION_ENVIRONMENTS = {"prod", "production"}
INSECURE_SECRET_KEYS = {"", "dev-secret-change-me"}
RAILWAY_MARKERS = (
    "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_SERVICE_ID",
)


def is_production(environment: str | None = None) -> bool:
    if environment is not None:
        return environment.strip().lower() in PRODUCTION_ENVIRONMENTS
    value = os.getenv("ENVIRONMENT", "").strip().lower()
    # Railway setzt diese Marker automatisch. Fehlt dort versehentlich die
    # eigene Variable ENVIRONMENT, darf die App nie auf den lokalen
    # SQLite-Fallback und den Entwicklungs-Seed wechseln.
    return value in PRODUCTION_ENVIRONMENTS or any(
        os.getenv(marker) for marker in RAILWAY_MARKERS
    )


def production_configuration_errors(
    *,
    environment: str | None = None,
    database_url: str | None = None,
    secret_key: str | None = None,
) -> list[str]:
    """Liefert alle fatalen Produktionsfehler, ohne Seiteneffekte.

    Die reine Funktion ist absichtlich separat testbar. Im lokalen Betrieb
    bleibt SQLite erlaubt; in Produktion muss die Datenbank persistent sein.
    """
    if not is_production(environment):
        return []

    db_url = database_url if database_url is not None else os.getenv("DATABASE_URL", "")
    jwt_secret = secret_key if secret_key is not None else os.getenv("SECRET_KEY", "")
    errors = []
    if not db_url:
        errors.append("DATABASE_URL fehlt")
    elif db_url.lower().startswith("sqlite"):
        errors.append("SQLite ist in Produktion nicht erlaubt; DATABASE_URL muss auf PostgreSQL zeigen")
    elif not db_url.lower().startswith(("postgresql://", "postgresql+psycopg2://")):
        errors.append("DATABASE_URL muss in Produktion eine PostgreSQL-URL sein")
    if jwt_secret in INSECURE_SECRET_KEYS or len(jwt_secret) < 32:
        errors.append("SECRET_KEY fehlt oder ist zu kurz (mindestens 32 Zeichen)")
    return errors


def assert_safe_runtime_configuration(**overrides) -> None:
    errors = production_configuration_errors(**overrides)
    if errors:
        raise RuntimeError("Unsichere Produktionskonfiguration: " + "; ".join(errors))
