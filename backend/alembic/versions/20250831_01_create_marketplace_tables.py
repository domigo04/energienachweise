"""create marketplace tables

Revision ID: 20250831_01
Revises: 20250831_00
Create Date: 2025-08-31
"""
from alembic import op
import sqlalchemy as sa

revision = "20250831_01"
down_revision = "20250831_00"
branch_labels = None
depends_on = None

def upgrade():
    # Projects
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kunde_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("egid", sa.String(50), nullable=True),
        sa.Column("parzelle", sa.String(50), nullable=True),
        sa.Column("adresse", sa.String(255), nullable=True),
        sa.Column("ort", sa.String(120), nullable=True),
        sa.Column("kontrolltyp", sa.String(50), nullable=True),
        sa.Column("status", sa.Enum("plan", "ausf", "done", name="project_status"), server_default="plan"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # ProjectEvidence
    op.create_table(
        "project_evidences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("fachbereich", sa.String(120), nullable=False),
        sa.Column("en_code", sa.String(50), nullable=False),
        sa.Column("swiss_transfer_url", sa.String(500), nullable=True),
        sa.Column("required_docs", sa.Text(), nullable=True),
    )

    # ExpertRequest
    op.create_table(
        "expert_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("experte_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.Enum("requested", "responded", "accepted", "rejected", "expired", name="request_status"), server_default="requested"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # ExpertQuote
    op.create_table(
        "expert_quotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("expert_requests.id"), nullable=False),
        sa.Column("preis", sa.Float(), nullable=True),
        sa.Column("kommentar", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

def downgrade():
    op.drop_table("expert_quotes")
    op.drop_table("expert_requests")
    op.drop_table("project_evidences")
    op.drop_table("projects")
