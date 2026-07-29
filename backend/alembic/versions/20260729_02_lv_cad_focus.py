"""Projekt-Plankopf, SIA-Phase und Firmenlogo.

Revision ID: 20260729_02
Revises: 20260729_01
Create Date: 2026-07-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260729_02"
down_revision = "20260729_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    project_columns = {
        column["name"] for column in inspector.get_columns("hc_projects")
    }
    for name, column_type in (
        ("projektnummer", sa.String()),
        ("strasse", sa.String()),
        ("plz", sa.String()),
        ("ort", sa.String()),
        ("bauherr", sa.String()),
        ("sia_phase", sa.String()),
        ("projektfortschritt_pct", sa.Integer()),
        ("planbezeichnung", sa.String()),
    ):
        if name not in project_columns:
            op.add_column("hc_projects", sa.Column(name, column_type, nullable=True))

    company_columns = {
        column["name"] for column in inspector.get_columns("hc_firmen")
    }
    if "logo_data_url" not in company_columns:
        op.add_column("hc_firmen", sa.Column("logo_data_url", sa.Text(), nullable=True))

    op.execute("UPDATE hc_projects SET projektfortschritt_pct = 0 WHERE projektfortschritt_pct IS NULL")
    op.execute("UPDATE hc_projects SET planbezeichnung = 'Prinzipschema' WHERE planbezeichnung IS NULL")


def downgrade() -> None:
    op.drop_column("hc_firmen", "logo_data_url")
    for name in (
        "planbezeichnung", "projektfortschritt_pct", "sia_phase", "bauherr",
        "ort", "plz", "strasse", "projektnummer",
    ):
        op.drop_column("hc_projects", name)
