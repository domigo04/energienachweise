"""Idempotenter Bootstrap des ersten Plattformadmins.

In Produktion läuft dieses Modul nach den Alembic-Migrationen als eigener
Pre-Deploy-Schritt. Dadurch bleibt der normale App-Start frei von DDL und
Seeds, während eine neue, leere PostgreSQL-Datenbank trotzdem ein nutzbares
Administratorkonto erhält.
"""

import os

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import SessionLocal
from app.models import subscription  # noqa: F401 — Ziel der Firmen-Fremdschlüssel laden
from app.models.auth import Firma, Role, User


def seed_admin(db: Session, *, require_configuration: bool = False) -> str | None:
    """Legt den konfigurierten Admin an oder gleicht ihn sicher ab.

    Das Passwort wird nur bei einem neuen Benutzer oder einer bewusst erhöhten
    ``ADMIN_INITIAL_PASSWORD_VERSION`` übernommen. Ein im Konto manuell
    geändertes Passwort bleibt deshalb über Deployments hinweg erhalten, ohne
    einen schnell prüfbaren Passwortfingerabdruck in der Datenbank abzulegen.
    """
    admin_email = os.getenv("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.getenv("ADMIN_INITIAL_PASSWORD", "")
    admin_password_version = os.getenv("ADMIN_INITIAL_PASSWORD_VERSION", "1").strip()
    if not admin_email or not admin_password:
        message = (
            "ADMIN_EMAIL und ADMIN_INITIAL_PASSWORD müssen beide als "
            "Umgebungsvariablen gesetzt sein."
        )
        if require_configuration:
            raise RuntimeError(message)
        print(f"[INFO] Admin-Bootstrap übersprungen — {message}")
        return None
    if not admin_password_version:
        raise RuntimeError("ADMIN_INITIAL_PASSWORD_VERSION darf nicht leer sein.")
    if len(admin_password_version) > 100:
        raise RuntimeError("ADMIN_INITIAL_PASSWORD_VERSION darf höchstens 100 Zeichen lang sein.")
    if admin_password_version == admin_password:
        raise RuntimeError(
            "ADMIN_INITIAL_PASSWORD_VERSION ist eine nicht geheime Versionskennung "
            "und darf nicht dem Passwort entsprechen."
        )

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
            admin_pw_seed_version=admin_password_version,
        )
        db.add(admin)
    elif admin.admin_pw_seed_version is None:
        # Erster Start nach Entfernung des alten SHA-256-Fingerprints: aktuelle
        # Version übernehmen, aber ein eventuell manuell geändertes Passwort
        # ausdrücklich nicht zurücksetzen.
        admin.admin_pw_seed_version = admin_password_version
    elif admin.admin_pw_seed_version != admin_password_version:
        admin.password_hash = hash_password(admin_password)
        admin.admin_pw_seed_version = admin_password_version

    admin.role = Role.admin
    admin.is_verified = True
    admin.is_active = True
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
