"""Firmenzuordnung normaler Benutzer fail-closed absichern.

Revision ID: 20260801_02
Revises: 20260801_01

Die Migration verändert oder repariert keine Benutzerzuordnung. Sie prüft den
Altbestand vor jeder Schemaänderung und stoppt mit einer anonymen Anzahl, wenn
normale Benutzer ohne gültige Firma vorhanden sind.
"""
from alembic import op
import sqlalchemy as sa


revision = "20260801_02"
down_revision = "20260801_01"
branch_labels = None
depends_on = None

CONSTRAINT_NAME = "ck_hc_users_tenant_required_for_non_admin"


def _invalid_user_counts(bind) -> tuple[int, int]:
    row = bind.execute(sa.text(
        """
        SELECT
            SUM(CASE WHEN u.tenant_id IS NULL THEN 1 ELSE 0 END) AS without_company,
            SUM(CASE WHEN u.tenant_id IS NOT NULL AND f.id IS NULL THEN 1 ELSE 0 END)
                AS orphaned_company
        FROM hc_users AS u
        LEFT JOIN hc_firmen AS f ON f.id = u.tenant_id
        WHERE (u.role IS NULL OR u.role <> 'admin')
          AND (u.tenant_id IS NULL OR f.id IS NULL)
        """
    )).one()
    return int(row.without_company or 0), int(row.orphaned_company or 0)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "hc_users" not in tables:
        return
    if "hc_firmen" not in tables:
        raise RuntimeError(
            "Firmenzuordnung kann nicht geprüft werden: Tabelle hc_firmen fehlt."
        )

    without_company, orphaned_company = _invalid_user_counts(bind)
    if without_company or orphaned_company:
        raise RuntimeError(
            "Unsichere Benutzer-Firmenzuordnungen gefunden; Migration ohne "
            "Datenänderung gestoppt. "
            f"Ohne Firma: {without_company}; verwaiste Firma: {orphaned_company}."
        )

    constraints = {
        constraint["name"]
        for constraint in inspector.get_check_constraints("hc_users")
        if constraint.get("name")
    }
    with op.batch_alter_table("hc_users") as batch:
        batch.alter_column(
            "tenant_id",
            existing_type=sa.Integer(),
            nullable=True,
            server_default=None,
        )
        if CONSTRAINT_NAME not in constraints:
            batch.create_check_constraint(
                CONSTRAINT_NAME,
                "role = 'admin' OR tenant_id IS NOT NULL",
            )


def downgrade() -> None:
    raise RuntimeError(
        "Die fail-closed Firmenzuordnung darf nicht automatisch entfernt werden."
    )
