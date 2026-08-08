"""Serverseitigen Widerruf von Benutzer-Sessions einführen.

Revision ID: 20260808_01
Revises: 20260803_02
"""
from alembic import op
import sqlalchemy as sa


revision = "20260808_01"
down_revision = "20260803_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("hc_users"):
        return
    columns = {column["name"] for column in inspector.get_columns("hc_users")}
    if "session_version" not in columns:
        with op.batch_alter_table("hc_users") as batch:
            batch.add_column(sa.Column(
                "session_version",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ))


def downgrade() -> None:
    raise RuntimeError(
        "Der serverseitige Session-Widerruf darf nicht automatisch entfernt werden."
    )
