"""Ausbauumfang im LV-Review speichern.

Revision ID: 20260803_02
Revises: 20260803_01
"""
from alembic import op
import sqlalchemy as sa


revision = "20260803_02"
down_revision = "20260803_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("lv_imports"):
        return
    columns = {column["name"] for column in inspector.get_columns("lv_imports")}
    if "ausbauumfang" not in columns:
        with op.batch_alter_table("lv_imports") as batch:
            batch.add_column(sa.Column("ausbauumfang", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("lv_imports"):
        return
    columns = {column["name"] for column in inspector.get_columns("lv_imports")}
    if "ausbauumfang" in columns:
        with op.batch_alter_table("lv_imports") as batch:
            batch.drop_column("ausbauumfang")
