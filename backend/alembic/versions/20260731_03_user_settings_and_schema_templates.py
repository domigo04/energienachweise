"""Persönliche Editor-Einstellungen und firmenweite Schema-Vorlagen.

Revision ID: 20260731_03
Revises: 20260731_02

Rein additiv: zwei neue Tabellen, keine bestehende Spalte wird angefasst. Die
Migration ist mehrfach ausführbar — sie prüft je Tabelle, ob sie schon da ist.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260731_03"
down_revision = "20260731_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("hc_user_settings"):
        op.create_table(
            "hc_user_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="1"),
            # Genau ein Satz je Benutzer — die Eindeutigkeit steht in der
            # Datenbank, nicht nur im Anwendungscode.
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("settings_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_hc_user_settings_user", "hc_user_settings",
                        ["user_id"], unique=True)
        op.create_index("ix_hc_user_settings_tenant", "hc_user_settings", ["tenant_id"])

    if not inspector.has_table("hc_schema_templates"):
        op.create_table(
            "hc_schema_templates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("beschreibung", sa.Text(), nullable=False, server_default=""),
            sa.Column("graph_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("node_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("edge_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("quelle_project_id", sa.Integer(), nullable=True),
            sa.Column("quelle_schema_id", sa.Integer(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_by_name", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_hc_schema_templates_tenant", "hc_schema_templates",
                        ["tenant_id", "name"])


def downgrade() -> None:
    # Bewusst kein automatisches Löschen: die Vorlagen sind Firmenwissen und die
    # Tastenbelegung persönliche Arbeitsumgebung.
    pass
