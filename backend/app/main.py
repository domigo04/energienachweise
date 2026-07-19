# app/main.py
import os, json, traceback
from fastapi import Depends, FastAPI
from sqlalchemy import text
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

# ---------- Router ----------
from app.routers.hc_auth import router as hc_auth_router
from app.routers.hc_projects import router as hc_projects_router
from app.routers.hc_groups import router as hc_groups_router
from app.routers.hc_ventil import router as hc_ventil_router
from app.routers.hc_druckverlust import router as hc_druckverlust_router
from app.routers.hc_ravel import router as hc_ravel_router
from app.routers.hc_schema import router as hc_schema_router
from app.routers.hc_hydraulik import router as hc_hydraulik_router
from app.routers.hc_bkp import router as hc_bkp_router
from app.routers.hc_export import router as hc_export_router
from app.routers.hc_auswertung import router as hc_auswertung_router
from app.routers.hc_bauindex import router as hc_bauindex_router
from app.routers.hc_grobkostenschaetzung import router as hc_grobkostenschaetzung_router

from app.auth import get_current_user

_auth = [Depends(get_current_user)]  # verlangt gültiges Login

# Öffentlich: Registrieren/Login (Profil/Admin schützen sich selbst)
app.include_router(hc_auth_router)

# Geschützt: alles rund um Projekte, Auswertung, Rechner
app.include_router(hc_projects_router, dependencies=_auth)
app.include_router(hc_groups_router, dependencies=_auth)
app.include_router(hc_ventil_router, dependencies=_auth)
app.include_router(hc_druckverlust_router, dependencies=_auth)
app.include_router(hc_ravel_router, dependencies=_auth)
app.include_router(hc_schema_router, dependencies=_auth)
app.include_router(hc_hydraulik_router, dependencies=_auth)
app.include_router(hc_bkp_router, dependencies=_auth)
app.include_router(hc_auswertung_router, dependencies=_auth)
app.include_router(hc_bauindex_router, dependencies=_auth)
app.include_router(hc_grobkostenschaetzung_router, dependencies=_auth)

# PDF-Export wird per window.open() geöffnet (kann kein Bearer-Token mitgeben) → offen.
app.include_router(hc_export_router)

# ---------- DB-Init & Seed ----------
from app.database import Base, engine, SessionLocal
from app.models.heizungscockpit import (  # noqa: F401 — Tabellen vor create_all importieren
    HcProject, HcProjectBaseData, HcGroupTemplate, HcHeatingGroup, HcCalculationResult, HcSchema,
    BkpEintrag, HcGruppeTyp,
)
from app.models.auth import Firma, User, Role  # noqa: F401
from app.models.kv import RefProjekt, RefKostenzeile, RefProjektGewerk, Kostenschaetzung, BauindexEintrag  # noqa: F401
from app.models.grobkostenschaetzung import Korrekturfaktor  # noqa: F401
from app.auth import hash_password


def _ensure_columns():
    """Fehlende Spalten auf bestehenden Tabellen ergänzen — SQLite-Dev UND
    Postgres-Prod. Bei frisch angelegten Tabellen unnötig (create_all legt die
    schon vollständig an); nötig, sobald eine Tabelle schon vor einer neuen
    Spalte im Modell existierte. Früher lief das nur auf SQLite (früher return
    bei Postgres) — dadurch blieben auf dem Server nach jedem Modell-Update
    Spalten wie hc_firmen.abo_plan dauerhaft fehlend, was den Start-Seed
    (_seed_admin) mit einer stillen SQL-Exception abbrechen liess und so den
    Produktions-Login blockierte."""
    to_add = {
        "hc_project_base_data": [("gebaeudekategorie", "VARCHAR"), ("klimastation", "VARCHAR")],
        "hc_projects": [("erstellt_von", "INTEGER")],
        "ref_projekte": [
            ("anlagenkonfiguration", "VARCHAR"),
            ("installierte_leistung_neu_kw", "FLOAT"), ("flaeche_fbh_m2", "FLOAT"),
            ("flaeche_tabs_m2", "FLOAT"), ("flaeche_deckenstrahlplatten_m2", "FLOAT"),
            ("anzahl_heizkoerper", "INTEGER"), ("anzahl_waermemessungen", "INTEGER"),
            ("anzahl_schaltgeraetekombinationen", "INTEGER"), ("laufmeter_rohre_heizung", "FLOAT"),
            ("bww_bei_heizung", "BOOLEAN"), ("weiterbetrieb_umbau", "BOOLEAN"), ("etappierung", "BOOLEAN"),
        ],
        "hc_firmen": [("abo_plan", "VARCHAR")],
        "ref_kostenzeilen": [("gewerk", "VARCHAR")],
    }
    is_sqlite = engine.url.get_backend_name().startswith("sqlite")
    # Einmalige Dev-Migration (2026-07-14): die kurzlebige parallele
    # Referenzprojekt-Datenbank der Grobkostenschätzung ist abgeschafft —
    # die Schätzung liest jetzt direkt die Auswertung (ref_projekte). Die
    # verwaisten Tabellen enthielten nur Demo-Daten und waren nie deployed.
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS bkp_betraege"))
        conn.execute(text("DROP TABLE IF EXISTS referenz_projekte"))
        conn.commit()
    with engine.connect() as conn:
        for table, cols in to_add.items():
            if is_sqlite:
                existing = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}
                for name, typ in cols:
                    if name not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {typ}"))
            else:
                # Postgres 9.6+: ADD COLUMN IF NOT EXISTS macht die separate
                # Existenzprüfung überflüssig und ist bei jedem Neustart idempotent.
                for name, typ in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {typ}"))
        conn.commit()
        # ALTER TABLE trägt den SQLAlchemy-Python-Default nicht nach — bestehende
        # Zeilen hätten sonst z.B. abo_plan=NULL statt "kostenlos".
        conn.execute(text("UPDATE hc_firmen SET abo_plan = 'kostenlos' WHERE abo_plan IS NULL"))
        conn.execute(text("UPDATE ref_kostenzeilen SET gewerk = 'heizung' WHERE gewerk IS NULL"))
        conn.commit()


def _seed_group_templates(db):
    if db.query(HcGroupTemplate).count() > 0:
        return
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


def _seed_korrekturfaktoren(db):
    if db.query(Korrekturfaktor).count() > 0:
        return
    faktoren = [
        Korrekturfaktor(name="Sanierung", faktor=1.20, aktiv=True),
        Korrekturfaktor(name="Weiterbetrieb", faktor=1.10, aktiv=True),
        Korrekturfaktor(name="Etappierung", faktor=1.08, aktiv=True),
    ]
    db.add_all(faktoren)
    db.commit()
    print(f"[INIT] {len(faktoren)} Korrekturfaktoren angelegt")


def _seed_admin(db):
    """Firma (SIREGO) + Erst-Admin sicherstellen. Zugangsdaten aus .env
    (ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD). Synchronisiert Passwort/Rolle/
    Freischaltung bei JEDEM Start auf die aktuelle Umgebungsvariable — nicht
    nur beim ersten Anlegen. Grund: ohne das bleibt ein einmal gesetztes altes
    Passwort für immer aktiv, egal was später in .env geändert wird (genau das
    Problem, das den Login auf dem Server blockiert hat)."""
    firma = db.query(Firma).filter(Firma.id == 1).first()
    if not firma:
        db.add(Firma(id=1, name="SIREGO GmbH"))
        db.commit()
    admin_email = os.getenv("ADMIN_EMAIL", "dominicgoulon@icloud.com").lower().strip()
    admin_pw = os.getenv("ADMIN_INITIAL_PASSWORD", "Sirego2004!")
    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        admin = User(tenant_id=1, email=admin_email, name="Dominic Goulon")
        db.add(admin)
    admin.password_hash = hash_password(admin_pw)
    admin.role = Role.admin
    admin.is_verified = True
    admin.is_active = True
    db.commit()


@app.on_event("startup")
def init_db_and_seed():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        print("DB init error:")
        traceback.print_exc()

    try:
        _ensure_columns()
    except Exception:
        print("Column migration error:")
        traceback.print_exc()

    db = SessionLocal()
    try:
        try:
            _seed_group_templates(db)
        except Exception:
            db.rollback()
            print("Seed error (group templates):")
            traceback.print_exc()
        try:
            _seed_admin(db)
            print(f"[INIT] Admin-Konto sichergestellt: {os.getenv('ADMIN_EMAIL', 'dominicgoulon@icloud.com').lower().strip()}")
        except Exception:
            db.rollback()
            print("Seed error (admin):")
            traceback.print_exc()
        try:
            _seed_korrekturfaktoren(db)
        except Exception:
            db.rollback()
            print("Seed error (korrekturfaktoren):")
            traceback.print_exc()
    finally:
        db.close()
