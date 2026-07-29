"""Historischer Alembic-Anker: Benutzerbasis.

Die ursprüngliche Datei fehlte im Repository, obwohl bestehende Datenbanken
diese Revision bereits tragen. Die aktuelle Produktionsbaseline baut neue
Installationen vollständig auf; dieser Anker stellt die bestehende
Versionskette ohne erneute oder destruktive DDL wieder her.
"""

revision = "20250831_00"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
