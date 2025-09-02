"""create users table

Revision ID: 20250831_00
Revises:
Create Date: 2025-08-31
"""
from alembic import op
import sqlalchemy as sa

revision = "20250831_00"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.Enum("admin", "experte", "kunde", name="role"), nullable=False, server_default="kunde"),
        sa.Column("personentyp", sa.Enum("natürliche Person", "Firma", name="personentyp"), nullable=True),
        sa.Column("vorname", sa.String(length=120), nullable=True),
        sa.Column("nachname", sa.String(length=120), nullable=True),
        sa.Column("firmenname", sa.String(length=200), nullable=True),
        sa.Column("mitarbeiteranzahl", sa.Integer(), nullable=True),
        sa.Column("fachbereiche", sa.String(length=255), nullable=True),
        sa.Column("berufsnachweis", sa.Text(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_users_email", "users", ["email"])

def downgrade():
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
