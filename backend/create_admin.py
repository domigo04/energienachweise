# backend/create_admin.py
import os
from dotenv import load_dotenv
from app.database import SessionLocal
from app.models.user import User, Role
from app.auth import hash_password

# .env laden (eine Ebene höher)
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_INITIAL_PASSWORD = os.getenv("ADMIN_INITIAL_PASSWORD", "admin")

def main():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if user:
            print("Admin existiert bereits:", ADMIN_EMAIL)
            return
        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_INITIAL_PASSWORD),
            role=Role.admin,
            is_verified=True
        )
        db.add(admin)
        db.commit()
        print("Admin erstellt:", ADMIN_EMAIL)
    finally:
        db.close()

if __name__ == "__main__":
    main()
