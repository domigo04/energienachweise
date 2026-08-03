"""Vollständige kommerzielle Konditionen am Referenzprojekt speichern.

Revision ID: 20260803_01
Revises: 20260801_02
"""
from alembic import op
import sqlalchemy as sa


revision = "20260803_01"
down_revision = "20260801_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("ref_projekt_gewerke"):
        return
    columns = {
        column["name"]
        for column in inspector.get_columns("ref_projekt_gewerke")
    }
    if "commercial_json" not in columns:
        with op.batch_alter_table("ref_projekt_gewerke") as batch:
            batch.add_column(sa.Column("commercial_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("ref_projekt_gewerke"):
        return
    columns = {
        column["name"]
        for column in inspector.get_columns("ref_projekt_gewerke")
    }
    if "commercial_json" in columns:
        with op.batch_alter_table("ref_projekt_gewerke") as batch:
            batch.drop_column("commercial_json")
