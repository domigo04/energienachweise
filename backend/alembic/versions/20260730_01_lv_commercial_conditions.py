"""LV-Konditionen, Kontextpfad und schlanke Projektmetadaten.

Revision ID: 20260730_01
Revises: 20260729_02
"""
from alembic import op
import sqlalchemy as sa

revision = "20260730_01"
down_revision = "20260729_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    import_columns = {c["name"] for c in inspector.get_columns("lv_imports")}
    if "gewerk" not in import_columns:
        op.add_column("lv_imports", sa.Column("gewerk", sa.String(), nullable=True))
    if "waehrung" not in import_columns:
        op.add_column("lv_imports", sa.Column("waehrung", sa.String(), nullable=True))
    cost_columns = {c["name"] for c in inspector.get_columns("lv_import_costs")}
    if "section_path" not in cost_columns:
        op.add_column("lv_import_costs", sa.Column("section_path", sa.String(), nullable=True))
    if not inspector.has_table("lv_import_conditions"):
        op.create_table(
            "lv_import_conditions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lv_import_id", sa.Integer(), sa.ForeignKey("lv_imports.id"), nullable=False),
            sa.Column("original_label", sa.String(), nullable=False),
            sa.Column("kind", sa.String(), nullable=False),
            sa.Column("direction", sa.String(), nullable=False),
            sa.Column("rate_percent", sa.Float(), nullable=True),
            sa.Column("amount", sa.Float(), nullable=True),
            sa.Column("basis_amount", sa.Float(), nullable=True),
            sa.Column("calculated_amount", sa.Float(), nullable=True),
            sa.Column("running_total", sa.Float(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("source_page", sa.Integer(), nullable=True),
        )
        op.create_index(
            "ix_lv_import_conditions_lv_import_id", "lv_import_conditions",
            ["lv_import_id"],
        )


def downgrade() -> None:
    op.drop_index("ix_lv_import_conditions_lv_import_id", table_name="lv_import_conditions")
    op.drop_table("lv_import_conditions")
    op.drop_column("lv_import_costs", "section_path")
    op.drop_column("lv_imports", "waehrung")
    op.drop_column("lv_imports", "gewerk")
