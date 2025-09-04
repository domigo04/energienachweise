# app/main.py
import os, json
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

app = FastAPI()

# ---------- CORS (robust, debug-freundlich) ----------
raw = os.getenv(
    "ALLOWED_ORIGINS",
    '["https://www.energienachweise.com","https://energienachweise.com","http://localhost:5173","http://127.0.0.1:5173"]'
)
try:
    origins = json.loads(raw)
    if not isinstance(origins, list):
        origins = [str(origins)]
except Exception:
    origins = [raw]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(origins)),
    allow_origin_regex=".*",      # Debug: überall erlaubt
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,      # wir nutzen Bearer Tokens, keine Cookies
)

# ---------- Health ----------
@app.get("/healthz")
def healthz():
    return {"ok": True}

# ---------- Router danach importieren ----------
from app.routers.auth import router as auth_router
from app.routers.admin import router as admin_router
from app.routers.customer import router as customer_router
from app.routers.experts import router as experts_router
from app.routers.projects import router as projects_router
from app.routers.quotes import router as quotes_router
from app.routers.requests import router as requests_router
from app.routers.matching import router as matching_router

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(customer_router)
app.include_router(experts_router)
app.include_router(projects_router)
app.include_router(quotes_router)
app.include_router(requests_router)
app.include_router(matching_router)

# ---------- DB-Init & Admin-Seed ----------
from app.database import Base, engine, SessionLocal, get_db
from app.models.user import User, Role  # ggf. Pfade prüfen
from app.auth import hash_password

@app.on_event("startup")
def init_db_and_seed_admin():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print("DB init error:", e)

    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_pass  = os.getenv("ADMIN_INITIAL_PASSWORD", "admin")
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            admin = User(
                email=admin_email,
                password_hash=hash_password(admin_pass),
                role=Role.admin,
                is_verified=True,
            )
            db.add(admin)
            db.commit()
            print(f"[INIT] Admin user created: {admin_email}")
    except OperationalError as e:
        print("OperationalError during admin seed:", e)
    except Exception as e:
        print("Admin seed error:", e)
    finally:
        db.close()

# ---------- DEBUG ENDPOINT ----------
@app.get("/__debug")
def __debug(db: Session = Depends(get_db)):
    insp = inspect(engine)
    has_users = insp.has_table("users")
    user_count = None
    admin_exists = None
    error = None
    try:
        if has_users:
            user_count = db.query(User).count()
            admin_exists = db.query(User).filter(User.email == os.getenv("ADMIN_EMAIL", "info@sirego.ch")).first() is not None
    except Exception as e:
        error = str(e)
    return {
        "db_url": os.getenv("DATABASE_URL"),
        "has_users_table": has_users,
        "user_count": user_count,
        "admin_exists": admin_exists,
        "error": error,
    }
