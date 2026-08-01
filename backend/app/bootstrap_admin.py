"""Idempotenter Bootstrap des ersten Plattformadmins.

In Produktion läuft dieses Modul nach den Alembic-Migrationen als eigener
Pre-Deploy-Schritt. Dadurch bleibt der normale App-Start frei von DDL und
Seeds, während eine neue, leere PostgreSQL-Datenbank trotzdem ein nutzbares
Administratorkonto erhält.
"""

import hashlib
import os
from datetime import datetime

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import SessionLocal
from app.models import subscription  # noqa: F401 — Ziel der Firmen-Fremdschlüssel laden
from app.models.auth import Firma, Role, User


def seed_admin(db: Session, *, require_configuration: bool = False) -> str | None:
    """Legt den konfigurierten Admin an oder gleicht ihn sicher ab.

    Das Passwort wird nur übernommen, wenn der Benutzer neu ist oder sich
    ``ADMIN_INITIAL_PASSWORD`` seit dem letzten Bootstrap geändert hat. Ein im
    Konto manuell geändertes Passwort bleibt deshalb über Deployments hinweg
    erhalten.
    """
    admin_email = os.getenv("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.getenv("ADMIN_INITIAL_PASSWORD", "")
    if not admin_email or not admin_password:
        message = (
            "ADMIN_EMAIL und ADMIN_INITIAL_PASSWORD müssen beide als "
            "Umgebungsvariablen gesetzt sein."
        )
        if require_configuration:
            raise RuntimeError(message)
        print(f"[INFO] Admin-Bootstrap übersprungen — {message}")
        return None

    password_fingerprint = hashlib.sha256(admin_password.encode()).hexdigest()

    company = db.query(Firma).filter(Firma.id == 1).first()
    if not company:
        company = Firma(id=1, name="SIREGO GmbH")
        db.add(company)
        db.flush()

    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        admin = User(
            tenant_id=company.id,
            email=admin_email,
            name=os.getenv("ADMIN_NAME", "Administrator"),
            password_hash=hash_password(admin_password),
            admin_pw_seed_fingerprint=password_fingerprint,
        )
        db.add(admin)
    elif admin.admin_pw_seed_fingerprint != password_fingerprint:
        admin.password_hash = hash_password(admin_password)
        admin.admin_pw_seed_fingerprint = password_fingerprint

    admin.role = Role.admin
    admin.is_verified = True
    admin.is_active = True
    # Der Plattformadmin bestätigt seine Adresse nicht per Mail — er wird über
    # die Umgebung gesetzt. Ohne diesen Eintrag würde ihn die
    # E-Mail-Verifikation aus dem eigenen System aussperren.
    if admin.email_bestaetigt_at is None:
        admin.email_bestaetigt_at = datetime.utcnow()
    db.commit()
    return admin_email


def bootstrap_admin() -> str:
    """Führt den verpflichtenden Produktions-Bootstrap transaktional aus."""
    db = SessionLocal()
    try:
        admin_email = seed_admin(db, require_configuration=True)
        assert admin_email is not None
        return admin_email
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    admin_email = bootstrap_admin()
    print(f"[BOOTSTRAP] Admin-Konto sichergestellt: {admin_email}")


if __name__ == "__main__":
    main()
