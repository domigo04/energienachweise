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

# Heizungscockpit
from app.routers.hc_projects import router as hc_projects_router
from app.routers.hc_groups import router as hc_groups_router
from app.routers.hc_ventil import router as hc_ventil_router
from app.routers.hc_druckverlust import router as hc_druckverlust_router
from app.routers.hc_ravel import router as hc_ravel_router

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(customer_router)
app.include_router(experts_router)
app.include_router(projects_router)
app.include_router(quotes_router)
app.include_router(requests_router)
app.include_router(matching_router)
app.include_router(hc_projects_router)
app.include_router(hc_groups_router)
app.include_router(hc_ventil_router)
app.include_router(hc_druckverlust_router)
app.include_router(hc_ravel_router)

# ---------- DB-Init & Admin-Seed ----------
from app.database import Base, engine, SessionLocal, get_db
from app.models.user import User, Role
from app.models.heizungscockpit import (  # noqa: F401 — Tabellen müssen vor create_all importiert sein
    HcProject, HcProjectBaseData, HcGroupTemplate, HcHeatingGroup, HcCalculationResult,
)
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

    # Heizungscockpit: Gruppen-Vorlagen einmalig anlegen
    from app.models.heizungscockpit import HcGroupTemplate, HcGruppeTyp
    db2 = SessionLocal()
    try:
        if db2.query(HcGroupTemplate).count() == 0:
            templates = [
                HcGroupTemplate(name="Fussbodenheizung (FBH)", typ=HcGruppeTyp.fbh, standard_vl=35.0, standard_rl=28.0, beschreibung="VL 35 / RL 28 °C", is_system=True),
                HcGroupTemplate(name="Heizkörper modern (HK)", typ=HcGruppeTyp.hk, standard_vl=55.0, standard_rl=45.0, beschreibung="VL 55 / RL 45 °C", is_system=True),
                HcGroupTemplate(name="Heizkörper alt (HK)", typ=HcGruppeTyp.hk, standard_vl=70.0, standard_rl=55.0, beschreibung="VL 70 / RL 55 °C", is_system=True),
                HcGroupTemplate(name="Lufterhitzer", typ=HcGruppeTyp.lufterhitzer, standard_vl=60.0, standard_rl=45.0, beschreibung="VL 60 / RL 45 °C", is_system=True),
                HcGroupTemplate(name="Brauchwarmwasser (BWW)", typ=HcGruppeTyp.bww, standard_vl=65.0, standard_rl=55.0, beschreibung="VL 65 / RL 55 °C", is_system=True),
                HcGroupTemplate(name="Lüftungsregister", typ=HcGruppeTyp.lueftungsregister, standard_vl=60.0, standard_rl=45.0, beschreibung="VL 60 / RL 45 °C", is_system=True),
                HcGroupTemplate(name="Wandheizung", typ=HcGruppeTyp.wandheizung, standard_vl=35.0, standard_rl=28.0, beschreibung="VL 35 / RL 28 °C", is_system=True),
                HcGroupTemplate(name="TABS (Betonkernaktivierung)", typ=HcGruppeTyp.tabs, standard_vl=30.0, standard_rl=25.0, beschreibung="VL 30 / RL 25 °C", is_system=True),
                HcGroupTemplate(name="Konvektoren", typ=HcGruppeTyp.konvektoren, standard_vl=55.0, standard_rl=45.0, beschreibung="VL 55 / RL 45 °C", is_system=True),
            ]
            db2.add_all(templates)
            db2.commit()
            print(f"[INIT] {len(templates)} Gruppen-Vorlagen angelegt")
    except Exception as e:
        print("Gruppen-Vorlagen seed error:", e)
    finally:
        db2.close()

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
