"""E-Mail-Verifikation: Bestätigungszeitpunkt und Token am Benutzer.

Revision ID: 20260801_01
Revises: 20260731_03

Rein additiv: vier neue Spalten auf `hc_users`, keine bestehende wird angefasst,
kein DROP. Mehrfach ausführbar.

**Bestehende Benutzer gelten als bestätigt.** Sie sind bereits von einem Admin
freigeschaltet worden; ihnen nachträglich den Zugang zu sperren wäre eine
Sicherheitsmassnahme auf Kosten derer, die längst geprüft sind. Die Verifikation
gilt ab jetzt für neue Registrierungen.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260801_01"
down_revision = "20260731_03"
branch_labels = None
depends_on = None

_SPALTEN = [
    ("email_bestaetigt_at", sa.DateTime()),
    ("email_token_hash", sa.String()),
    ("email_token_ablauf", sa.DateTime()),
    ("email_token_gesendet_at", sa.DateTime()),
]


def upgrade() -> None:
    bind = op.get_bind()
    vorhanden = {c["name"] for c in sa.inspect(bind).get_columns("hc_users")}
    neu = [(name, typ) for name, typ in _SPALTEN if name not in vorhanden]
    for name, typ in neu:
        op.add_column("hc_users", sa.Column(name, typ, nullable=True))

    if any(name == "email_bestaetigt_at" for name, _ in neu):
        # Altbestand als bestätigt markieren — siehe Kopfkommentar.
        op.execute(
            "UPDATE hc_users SET email_bestaetigt_at = created_at "
            "WHERE email_bestaetigt_at IS NULL"
        )


def downgrade() -> None:
    # Bewusst kein Entfernen: der Bestätigungszeitpunkt ist ein Nachweis.
    pass
