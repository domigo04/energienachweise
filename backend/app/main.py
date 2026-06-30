# app/main.py
import os, json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Heizungscockpit")

# ---------- CORS ----------
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
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# ---------- Health ----------
@app.get("/healthz")
def healthz():
    return {"ok": True}

# ---------- Heizungscockpit-Router ----------
from app.routers.hc_projects import router as hc_projects_router
from app.routers.hc_groups import router as hc_groups_router
from app.routers.hc_ventil import router as hc_ventil_router
from app.routers.hc_druckverlust import router as hc_druckverlust_router
from app.routers.hc_ravel import router as hc_ravel_router
from app.routers.hc_schema import router as hc_schema_router

app.include_router(hc_projects_router)
app.include_router(hc_groups_router)
app.include_router(hc_ventil_router)
app.include_router(hc_druckverlust_router)
app.include_router(hc_ravel_router)
app.include_router(hc_schema_router)

# ---------- DB-Init & Seed ----------
from app.database import Base, engine, SessionLocal
from app.models.heizungscockpit import (  # noqa: F401 — Tabellen vor create_all importieren
    HcProject, HcProjectBaseData, HcGroupTemplate, HcHeatingGroup, HcCalculationResult, HcSchema,
)


@app.on_event("startup")
def init_db_and_seed():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print("DB init error:", e)

    # Heizungscockpit: Gruppen-Vorlagen einmalig anlegen
    from app.models.heizungscockpit import HcGroupTemplate, HcGruppeTyp
    db = SessionLocal()
    try:
        if db.query(HcGroupTemplate).count() == 0:
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
            db.add_all(templates)
            db.commit()
            print(f"[INIT] {len(templates)} Gruppen-Vorlagen angelegt")
    except Exception as e:
        print("Gruppen-Vorlagen seed error:", e)
    finally:
        db.close()
