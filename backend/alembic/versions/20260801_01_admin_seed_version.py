"""Passwortfingerabdruck durch eine nicht geheime Versionskennung ersetzen.

Revision ID: 20260801_01
Revises: 20260731_03

Der frühere SHA-256-Wert erlaubte bei einem Datenbankabfluss schnelle
Passwortversuche. Die neue Spalte enthält nur eine vom Betreiber gewählte
Rotationsversion. Bestehende Werte werden nicht übernommen.
"""
from alembic import op
import sqlalchemy as sa


revision = "20260801_01"
down_revision = "20260731_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("hc_users"):
        return

    columns = {column["name"] for column in inspector.get_columns("hc_users")}
    with op.batch_alter_table("hc_users") as batch:
        if "admin_pw_seed_version" not in columns:
            batch.add_column(sa.Column("admin_pw_seed_version", sa.String(), nullable=True))
        if "admin_pw_seed_fingerprint" in columns:
            batch.drop_column("admin_pw_seed_fingerprint")


def downgrade() -> None:
    raise RuntimeError(
        "Der unsichere Passwortfingerabdruck darf nicht automatisch wiederhergestellt werden."
    )
