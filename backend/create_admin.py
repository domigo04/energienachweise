import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.user import User, Role
from app.auth import hash_password

def main():
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_pw = os.getenv("ADMIN_INITIAL_PASSWORD", "admin")

    if not admin_email:
        print("ADMIN_EMAIL fehlt in .env"); return

    db: Session = SessionLocal()
    try:
        u = db.query(User).filter(User.email == admin_email).first()
        if u:
            print("Admin existiert bereits:", admin_email); return

        admin = User(
            email=admin_email,
            password_hash=hash_password(admin_pw),
            role=Role.admin,
            is_verified=True
        )
        db.add(admin); db.commit()
        print("Admin angelegt:", admin_email)
    finally:
        db.close()

if __name__ == "__main__":
    main()
