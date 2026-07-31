"""Projektjournal: Notizen mit Autor, Bearbeitungsspur und Stecknadel.

Revision ID: 20260731_02
Revises: 20260731_01

Rein additiv: eine neue Tabelle, keine bestehende Spalte wird angefasst. Die
Migration ist mehrfach ausführbar — sie prüft zuerst, ob die Tabelle schon da
ist.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260731_02"
down_revision = "20260731_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("hc_project_notes"):
        return
    op.create_table(
        "hc_project_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="notiz"),
        sa.Column("titel", sa.String(), nullable=False, server_default=""),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        # Stecknadel im Anlagenschema (Weltkoordinate, optional am Bauteil).
        sa.Column("schema_id", sa.Integer(), nullable=True),
        sa.Column("pin_x", sa.Float(), nullable=True),
        sa.Column("pin_y", sa.Float(), nullable=True),
        sa.Column("pin_node_id", sa.String(), nullable=True),
        sa.Column("faellig_am", sa.Date(), nullable=True),
        sa.Column("erledigt_at", sa.DateTime(), nullable=True),
        sa.Column("erledigt_von_name", sa.String(), nullable=True),
        # Autor bleibt; die Bearbeitungsspur kommt zusätzlich dazu.
        sa.Column("autor_id", sa.Integer(), nullable=True),
        sa.Column("autor_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("bearbeitet_at", sa.DateTime(), nullable=True),
        sa.Column("bearbeitet_von_id", sa.Integer(), nullable=True),
        sa.Column("bearbeitet_von_name", sa.String(), nullable=True),
    )
    op.create_index("ix_hc_project_notes_project", "hc_project_notes",
                    ["tenant_id", "project_id"])
    op.create_index("ix_hc_project_notes_schema", "hc_project_notes", ["schema_id"])


def downgrade() -> None:
    # Bewusst kein automatisches Löschen: die Einträge sind Projektwissen.
    pass
