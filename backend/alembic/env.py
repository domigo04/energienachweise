import os, sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# --- Pfade & .env laden ---
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)  # damit "app" importierbar ist

from dotenv import load_dotenv
load_dotenv(os.path.join(BASE_DIR, ".env"))

# --- App-Model-Metadata importieren ---
from app.database import Base  # enthält declarative_base()
# Falls du weitere Models/Tabellen hinzufügst, sorge dafür, dass sie importiert sind,
# z.B. so:
from app.models import user  # noqa: F401  (damit Alembic die Tabellen sieht)

# this is the Alembic Config object, which provides access
# to the values within the .ini file in use.
config = context.config

# Datenbank-URL direkt aus .env
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL", "sqlite:///./backend/privcontrol.db"))

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# target_metadata auf unsere Models setzen
target_metadata = Base.metadata

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
