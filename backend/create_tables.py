import os
from dotenv import load_dotenv
from app.database import engine, SessionLocal
from app.models.user import Base, User, RoleEnum
from passlib.hash import bcrypt

load_dotenv()

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "info@priv-control.ch")
ADMIN_PASSWORD = os.getenv("ADMIN_INITIAL_PASSWORD", "sirego")

# 📦 Tabellen erstellen
print("🔧 Erstelle Tabellen (falls noch nicht vorhanden)...")
Base.metadata.create_all(bind=engine)

# 🔐 Admin-User seeden (falls nicht vorhanden)
db = SessionLocal()
existing_admin = db.query(User).filter_by(email=ADMIN_EMAIL).first()

if not existing_admin:
    admin_user = User(
        email=ADMIN_EMAIL,
        password=bcrypt.hash(ADMIN_PASSWORD),
        role=RoleEnum.admin
    )
    db.add(admin_user)
    db.commit()
    print(f"✅ Admin-Benutzer erfolgreich angelegt: {ADMIN_EMAIL}")
else:
    print(f"ℹ️ Admin-Benutzer existiert bereits: {ADMIN_EMAIL}")

db.close()
