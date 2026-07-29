"""Produktionsbaseline ohne destruktive Startmigrationen.

Revision ID: 20260729_01
Revises:
Create Date: 2026-07-29
"""

from alembic import op
import sqlalchemy as sa

from app.database import Base
from app.models import auth, grobkostenschaetzung, heizungscockpit, kv, lv_import  # noqa: F401


revision = "20260729_01"
down_revision = "20250831_01"
branch_labels = None
depends_on = None


LEGACY_COLUMNS = {
    "hc_project_base_data": [
        ("gebaeudekategorie", sa.String()),
        ("klimastation", sa.String()),
        ("ebf_m2", sa.Float()),
        ("anzahl_nutzungseinheiten", sa.Integer()),
        ("projektart", sa.String()),
        ("region", sa.String()),
        ("zertifizierung", sa.String()),
    ],
    "hc_projects": [
        ("erstellt_von", sa.Integer()),
        ("verantwortlicher_id", sa.Integer()),
    ],
    "ref_projekte": [
        ("anlagenkonfiguration", sa.String()),
        ("installierte_leistung_neu_kw", sa.Float()),
        ("flaeche_fbh_m2", sa.Float()),
        ("flaeche_tabs_m2", sa.Float()),
        ("flaeche_deckenstrahlplatten_m2", sa.Float()),
        ("anzahl_heizkoerper", sa.Integer()),
        ("anzahl_waermemessungen", sa.Integer()),
        ("anzahl_schaltgeraetekombinationen", sa.Integer()),
        ("laufmeter_rohre_heizung", sa.Float()),
        ("bww_bei_heizung", sa.Boolean()),
        ("weiterbetrieb_umbau", sa.Boolean()),
        ("etappierung", sa.Boolean()),
    ],
    "hc_firmen": [
        ("abo_plan", sa.String()),
        ("is_active", sa.Boolean()),
    ],
    "hc_users": [
        ("admin_pw_seed_fingerprint", sa.String()),
        ("firma_role", sa.String()),
        ("firma_admin_beantragt_at", sa.DateTime()),
        ("firma_admin_bestaetigt_at", sa.DateTime()),
        ("firma_admin_bestaetigt_von", sa.Integer()),
        ("last_login_at", sa.DateTime()),
    ],
    "ref_kostenzeilen": [("gewerk", sa.String())],
}

INDEXES = [
    ("ix_hc_projects_erstellt_von", "hc_projects", ["erstellt_von"]),
    ("ix_hc_projects_tenant_id", "hc_projects", ["tenant_id"]),
    ("ix_hc_projects_verantwortlicher_id", "hc_projects", ["verantwortlicher_id"]),
    ("ix_hc_users_tenant_id", "hc_users", ["tenant_id"]),
    ("ix_hc_audit_events_tenant_created_at", "hc_audit_events", ["tenant_id", "created_at"]),
    ("ix_hc_heating_groups_project_id", "hc_heating_groups", ["project_id"]),
    ("ix_hc_heating_groups_tenant_id", "hc_heating_groups", ["tenant_id"]),
]


def upgrade() -> None:
    bind = op.get_bind()

    # Neue Installationen erhalten das vollständige aktuelle Modell. Bei einer
    # bestehenden Produktionsdatenbank ist create_all(checkfirst=True)
    # ausschliesslich additiv und verändert keine vorhandene Tabelle.
    Base.metadata.create_all(bind=bind, checkfirst=True)

    inspector = sa.inspect(bind)
    for table_name, definitions in LEGACY_COLUMNS.items():
        if table_name not in inspector.get_table_names():
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, column_type in definitions:
            if column_name not in existing:
                op.add_column(table_name, sa.Column(column_name, column_type, nullable=True))

    inspector = sa.inspect(bind)
    for index_name, table_name, columns in INDEXES:
        if table_name not in inspector.get_table_names():
            continue
        existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
        if index_name not in existing_indexes:
            op.create_index(index_name, table_name, columns, unique=False)

    # Python-Defaults werden bei ALTER TABLE nicht rückwirkend angewendet.
    op.execute("UPDATE hc_firmen SET abo_plan = 'kostenlos' WHERE abo_plan IS NULL")
    op.execute("UPDATE hc_firmen SET is_active = TRUE WHERE is_active IS NULL")
    op.execute("UPDATE hc_users SET firma_role = 'mitglied' WHERE firma_role IS NULL")
    op.execute("UPDATE ref_kostenzeilen SET gewerk = 'heizung' WHERE gewerk IS NULL")


def downgrade() -> None:
    # Ein automatisches Downgrade der Baseline würde produktive Fach- und
    # Benutzerdaten löschen. Rollback erfolgt durch Code-Rollback plus Restore.
    raise RuntimeError("Die Produktionsbaseline darf nicht destruktiv zurückgesetzt werden")
