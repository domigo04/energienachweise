# app/main.py
import hashlib, os, json, traceback
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
    HcAuditEvent, HcProject, HcProjectBaseData, HcGroupTemplate, HcHeatingGroup,
    HcCalculationResult, HcSchema, HcSchemaRevision, BkpEintrag, HcGruppeTyp,
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
        "hc_users": [
            ("admin_pw_seed_fingerprint", "VARCHAR"),
            ("firma_role", "VARCHAR"),
            ("firma_admin_beantragt_at", "TIMESTAMP"),
            ("firma_admin_bestaetigt_at", "TIMESTAMP"),
            ("firma_admin_bestaetigt_von", "INTEGER"),
        ],
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
        conn.execute(text("UPDATE hc_users SET firma_role = 'mitglied' WHERE firma_role IS NULL"))
        conn.execute(text("UPDATE ref_kostenzeilen SET gewerk = 'heizung' WHERE gewerk IS NULL"))
        conn.commit()


def _ensure_indexes():
    """Fehlende Indizes auf BESTEHENDEN Tabellen nachziehen. create_all() legt
    Indizes nur beim ERSTEN Anlegen einer Tabelle an — wird ein index=True erst
    später im Modell ergänzt (z.B. hc_projects.erstellt_von), bleibt die schon
    existierende Prod-Tabelle ohne diesen Index, und Filter darauf machen einen
    Full-Scan. CREATE INDEX IF NOT EXISTS ist auf SQLite wie Postgres idempotent
    und nicht-destruktiv (legt nur an, verändert keine Daten).

    Wichtig für die Ladezeit: die Projektliste filtert pro Nicht-Admin auf
    erstellt_von, jede Heizgruppen-Abfrage auf project_id/tenant_id."""
    idx = [
        ("ix_hc_projects_erstellt_von", "hc_projects", "erstellt_von"),
        ("ix_hc_heating_groups_project_id", "hc_heating_groups", "project_id"),
        ("ix_hc_heating_groups_tenant_id", "hc_heating_groups", "tenant_id"),
    ]
    with engine.connect() as conn:
        for name, table, col in idx:
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({col})"))
        conn.commit()


def _seed_group_templates(db):
    # Die Systemvorlage wird auch in bestehenden Installationen nachgezogen.
    # Bereits im Schema gespeicherte Projektwerte bleiben davon unberührt.
    modern = db.query(HcGroupTemplate).filter(
        HcGroupTemplate.name == "Heizkörper modern (HK)",
        HcGroupTemplate.is_system.is_(True),
    ).first()
    if modern and (modern.standard_vl != 50.0 or modern.standard_rl != 40.0):
        modern.standard_vl = 50.0
        modern.standard_rl = 40.0
        modern.beschreibung = "VL 50 / RL 40 °C"
        db.commit()
    if db.query(HcGroupTemplate).count() > 0:
        return
    templates = [
        HcGroupTemplate(name="Fussbodenheizung (FBH)", typ=HcGruppeTyp.fbh, standard_vl=35.0, standard_rl=28.0, beschreibung="VL 35 / RL 28 °C", is_system=True),
        HcGroupTemplate(name="Heizkörper modern (HK)", typ=HcGruppeTyp.hk, standard_vl=50.0, standard_rl=40.0, beschreibung="VL 50 / RL 40 °C", is_system=True),
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
    (ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD).

    Passwort wird NUR gesetzt, wenn sich ADMIN_INITIAL_PASSWORD seit dem
    letzten Start wirklich geändert hat (Fingerprint-Vergleich über
    `admin_pw_seed_fingerprint`) — nicht mehr bei jedem Neustart. Grund für
    den Vergleich überhaupt: ändert sich die Umgebungsvariable bewusst (z.B.
    Rotation eines geleakten Passworts), muss das durchschlagen — genau das
    Problem, das früher den Produktions-Login blockierte, als ein einmal
    gesetztes altes Passwort für immer aktiv blieb. Aber ein Passwort, das
    Dominic übers Konto SELBST geändert hat, darf der nächste Neustart nicht
    mehr stillschweigend überschreiben (Sicherheits-Review 2026-07-19)."""
    admin_email = os.getenv("ADMIN_EMAIL", "").lower().strip()
    admin_pw = os.getenv("ADMIN_INITIAL_PASSWORD", "")
    if not admin_email or not admin_pw:
        print("[INFO] Admin-Seed übersprungen — ADMIN_EMAIL und "
              "ADMIN_INITIAL_PASSWORD müssen beide als Umgebungsvariablen gesetzt sein.")
        return None
    firma = db.query(Firma).filter(Firma.id == 1).first()
    if not firma:
        db.add(Firma(id=1, name="SIREGO GmbH"))
        db.commit()
    pw_fingerprint = hashlib.sha256(admin_pw.encode()).hexdigest()

    admin = db.query(User).filter(User.email == admin_email).first()
    if not admin:
        admin = User(tenant_id=1, email=admin_email, name=os.getenv("ADMIN_NAME", "Administrator"))
        db.add(admin)
        admin.password_hash = hash_password(admin_pw)
        admin.admin_pw_seed_fingerprint = pw_fingerprint
    elif admin.admin_pw_seed_fingerprint != pw_fingerprint:
        # ADMIN_INITIAL_PASSWORD hat sich seit dem letzten Start geändert (oder
        # der Admin existierte schon vor diesem Fingerprint-Mechanismus) —
        # jetzt übernehmen. Ein manuell übers Konto geändertes Passwort bleibt
        # sonst unangetastet, weil der Fingerprint dann unverändert bleibt.
        admin.password_hash = hash_password(admin_pw)
        admin.admin_pw_seed_fingerprint = pw_fingerprint
    admin.role = Role.admin
    admin.is_verified = True
    admin.is_active = True
    db.commit()
    return admin_email


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

    try:
        _ensure_indexes()
    except Exception:
        print("Index migration error:")
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
            admin_email = _seed_admin(db)
            if admin_email:
                print(f"[INIT] Admin-Konto sichergestellt: {admin_email}")
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
