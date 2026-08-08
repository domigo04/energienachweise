# app/main.py
import os, json
from fastapi import Depends, FastAPI
from sqlalchemy import inspect, text
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
from app.routers.hc_einzel import router as hc_einzel_router
from app.routers.hc_plans import router as hc_plans_router
from app.routers.hc_schema import router as hc_schema_router
from app.routers.hc_hydraulik import router as hc_hydraulik_router
from app.routers.hc_bkp import router as hc_bkp_router
from app.routers.hc_export import router as hc_export_router
from app.routers.hc_auswertung import router as hc_auswertung_router
from app.routers.hc_bauindex import router as hc_bauindex_router
from app.routers.hc_grobkostenschaetzung import router as hc_grobkostenschaetzung_router
from app.routers.hc_company_admin import router as hc_company_admin_router
from app.routers.hc_lv_import import router as hc_lv_import_router
from app.routers.hc_notizen import router as hc_notizen_router
from app.routers.hc_user_settings import router as hc_user_settings_router
from app.routers.hc_schema_templates import router as hc_schema_templates_router

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
app.include_router(hc_einzel_router, dependencies=_auth)
app.include_router(hc_plans_router, dependencies=_auth)
app.include_router(hc_schema_router, dependencies=_auth)
app.include_router(hc_hydraulik_router, dependencies=_auth)
app.include_router(hc_bkp_router, dependencies=_auth)
app.include_router(hc_auswertung_router, dependencies=_auth)
app.include_router(hc_bauindex_router, dependencies=_auth)
app.include_router(hc_grobkostenschaetzung_router, dependencies=_auth)
app.include_router(hc_company_admin_router, dependencies=_auth)
app.include_router(hc_lv_import_router, dependencies=_auth)
app.include_router(hc_notizen_router, dependencies=_auth)
app.include_router(hc_user_settings_router, dependencies=_auth)
app.include_router(hc_schema_templates_router, dependencies=_auth)

# Die Exportrouten prüfen den Bearer-Token und die Firma zusätzlich selbst.
app.include_router(hc_export_router)

# ---------- DB-Init & Seed ----------
from app.database import Base, engine, SessionLocal
from app.models.heizungscockpit import (  # noqa: F401 — Tabellen vor create_all importieren
    HcAuditEvent, HcProject, HcProjectBaseData, HcGroupTemplate, HcHeatingGroup,
    HcCalculationResult, HcSchema, HcSchemaRevision, BkpEintrag, HcGruppeTyp,
)
from app.models.auth import Firma, User, Role  # noqa: F401
from app.models.kv import RefProjekt, RefKostenzeile, RefProjektGewerk, RefProjektFeature, Kostenschaetzung, BauindexEintrag  # noqa: F401
from app.models.grobkostenschaetzung import Korrekturfaktor  # noqa: F401
from app.models.lv_import import LvImport, LvImportFeature, LvImportCost  # noqa: F401
from app.bootstrap_admin import seed_admin as _seed_admin
from app.runtime import is_production


def _drop_legacy_admin_password_fingerprint(conn, *, is_sqlite: bool) -> None:
    """Entfernt den unsicheren Altwert auch aus historischen lokalen DBs.

    Produktion verwendet dafür ausschliesslich Alembic. Dieser zusätzliche
    Pfad ist nötig, weil lokale Entwicklungsdatenbanken bisher additiv durch
    ``_ensure_columns`` aktualisiert werden und sonst den toten SHA-256-Wert
    behalten würden.
    """
    if is_sqlite:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(hc_users)"))}
        if "admin_pw_seed_fingerprint" in existing:
            conn.execute(text(
                "ALTER TABLE hc_users DROP COLUMN admin_pw_seed_fingerprint"
            ))
        return
    conn.execute(text(
        "ALTER TABLE hc_users DROP COLUMN IF EXISTS admin_pw_seed_fingerprint"
    ))


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
        "hc_project_base_data": [
            ("gebaeudekategorie", "VARCHAR"), ("klimastation", "VARCHAR"),
            ("ebf_m2", "FLOAT"), ("anzahl_nutzungseinheiten", "INTEGER"),
            ("projektart", "VARCHAR"), ("region", "VARCHAR"), ("zertifizierung", "VARCHAR"),
        ],
        "hc_schemas": [("underlay_json", "TEXT")],
        "ref_projekte": [
            ("anlagenkonfiguration", "VARCHAR"),
            ("installierte_leistung_neu_kw", "FLOAT"), ("flaeche_fbh_m2", "FLOAT"),
            ("flaeche_tabs_m2", "FLOAT"), ("flaeche_deckenstrahlplatten_m2", "FLOAT"),
            ("anzahl_heizkoerper", "INTEGER"), ("anzahl_waermemessungen", "INTEGER"),
            ("anzahl_schaltgeraetekombinationen", "INTEGER"), ("laufmeter_rohre_heizung", "FLOAT"),
            ("bww_bei_heizung", "BOOLEAN"), ("weiterbetrieb_umbau", "BOOLEAN"), ("etappierung", "BOOLEAN"),
        ],
        "hc_users": [
            ("admin_pw_seed_version", "VARCHAR"),
            ("session_version", "INTEGER NOT NULL DEFAULT 0"),
            ("firma_role", "VARCHAR"),
            ("firma_admin_beantragt_at", "TIMESTAMP"),
            ("firma_admin_bestaetigt_at", "TIMESTAMP"),
            ("firma_admin_bestaetigt_von", "INTEGER"),
            ("last_login_at", "TIMESTAMP"),
        ],
        "ref_kostenzeilen": [("gewerk", "VARCHAR")],
        "lv_imports": [
            ("extract_method", "VARCHAR"), ("zertifizierung", "VARCHAR"),
            ("ausbauumfang", "VARCHAR"),
            ("projekt_name", "VARCHAR"), ("projekt_nummer", "VARCHAR"),
            ("ort", "VARCHAR"), ("unternehmer", "VARCHAR"), ("offert_datum", "VARCHAR"),
            ("debug_json", "TEXT"),
        ],
        "lv_import_features": [
            ("source_excerpt", "TEXT"), ("source_bbox", "VARCHAR"),
            ("derived_from", "VARCHAR"),
            ("printed_value", "VARCHAR"), ("corrected_value", "VARCHAR"),
            ("selected_source", "VARCHAR"), ("requires_review", "BOOLEAN"),
        ],
        "lv_import_costs": [
            ("original_position", "VARCHAR"), ("original_title", "VARCHAR"),
            ("canonical_key", "VARCHAR"), ("is_group_total", "BOOLEAN"),
            ("validation_status", "VARCHAR"), ("source", "VARCHAR"),
            ("original_amount", "FLOAT"), ("mapping_method", "VARCHAR"),
            ("mapping_confidence", "FLOAT"), ("mapping_reason", "VARCHAR"),
            ("mapping_confirmed", "BOOLEAN"),
            ("source_parent_bkp", "VARCHAR"), ("source_scope_summary", "TEXT"),
            ("source_bbox", "VARCHAR"), ("included_norm_keys", "VARCHAR"),
            ("amount_allocation", "VARCHAR"), ("requires_review", "BOOLEAN"),
        ],
        "lv_import_conditions": [("status", "VARCHAR")],
        "hc_projects": [
            ("erstellt_von", "INTEGER"), ("verantwortlicher_id", "INTEGER"),
            ("project_year", "INTEGER"), ("project_sequence", "INTEGER"),
            ("opened_at", "TIMESTAMP"),
        ],
        "hc_firmen": [
            ("abo_plan", "VARCHAR"), ("is_active", "BOOLEAN"),
            ("subscription_plan_id", "INTEGER"), ("plan_started_at", "TIMESTAMP"),
            ("plan_expires_at", "TIMESTAMP"), ("subscription_status", "VARCHAR"),
        ],
    }
    is_sqlite = engine.url.get_backend_name().startswith("sqlite")
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
        _drop_legacy_admin_password_fingerprint(conn, is_sqlite=is_sqlite)
        conn.commit()
        # ALTER TABLE trägt den SQLAlchemy-Python-Default nicht nach — bestehende
        # Zeilen hätten sonst z.B. abo_plan=NULL statt "kostenlos".
        conn.execute(text("UPDATE hc_firmen SET abo_plan = 'kostenlos' WHERE abo_plan IS NULL"))
        conn.execute(text("UPDATE hc_firmen SET is_active = TRUE WHERE is_active IS NULL"))
        conn.execute(text("UPDATE hc_users SET firma_role = 'mitglied' WHERE firma_role IS NULL"))
        conn.execute(text("UPDATE hc_users SET session_version = 0 WHERE session_version IS NULL"))
        conn.execute(text("UPDATE ref_kostenzeilen SET gewerk = 'heizung' WHERE gewerk IS NULL"))
        conn.execute(text("UPDATE lv_import_costs SET is_group_total = FALSE WHERE is_group_total IS NULL"))
        conn.execute(text("UPDATE lv_import_costs SET mapping_confirmed = FALSE WHERE mapping_confirmed IS NULL"))
        conn.execute(text("UPDATE lv_import_costs SET requires_review = FALSE WHERE requires_review IS NULL"))
        conn.execute(text("UPDATE lv_import_features SET requires_review = FALSE WHERE requires_review IS NULL"))
        conn.execute(text("UPDATE lv_import_conditions SET status = 'priced' WHERE status IS NULL"))
        conn.execute(text(
            "UPDATE hc_firmen SET subscription_status = 'active' "
            "WHERE subscription_status IS NULL"))
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
        ("ix_hc_projects_tenant_id", "hc_projects", "tenant_id"),
        ("ix_hc_projects_verantwortlicher_id", "hc_projects", "verantwortlicher_id"),
        ("ix_hc_users_tenant_id", "hc_users", "tenant_id"),
        ("ix_hc_audit_events_tenant_created_at", "hc_audit_events", "tenant_id, created_at"),
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


@app.on_event("startup")
def init_db_and_seed():
    if is_production():
        # Produktion wird ausschliesslich über Alembic migriert. Ein App-Start
        # darf weder Tabellen/Spalten verändern noch Benutzer oder Demoobjekte
        # anlegen. Fehlende Migrationen stoppen den Deploy klar und früh.
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        tables = set(inspect(engine).get_table_names())
        required = {"alembic_version", "hc_users", "hc_firmen", "hc_projects", "hc_schemas"}
        missing = sorted(required - tables)
        if missing:
            raise RuntimeError(
                "Produktionsdatenbank ist nicht migriert. Fehlende Tabellen: "
                + ", ".join(missing)
                + ". Vor dem Start `python -m alembic -c alembic.ini upgrade head` ausführen."
            )
        return

    # Nur lokale Entwicklung: eine leere SQLite-Datenbank bequem aufbauen und
    # historische lokale DBs nicht-destruktiv ergänzen.
    try:
        Base.metadata.create_all(bind=engine)
        _ensure_columns()
        _ensure_indexes()
    except Exception as exc:
        raise RuntimeError("Lokale Datenbank konnte nicht initialisiert werden") from exc

    db = SessionLocal()
    try:
        try:
            _seed_group_templates(db)
        except Exception as exc:
            db.rollback()
            raise RuntimeError("Lokale Gruppen-Vorlagen konnten nicht angelegt werden") from exc
        try:
            admin_email = _seed_admin(db)
            if admin_email:
                print(f"[INIT] Admin-Konto sichergestellt: {admin_email}")
        except Exception as exc:
            db.rollback()
            raise RuntimeError("Lokales Admin-Konto konnte nicht angelegt werden") from exc
        try:
            _seed_korrekturfaktoren(db)
        except Exception as exc:
            db.rollback()
            raise RuntimeError("Lokale Korrekturfaktoren konnten nicht angelegt werden") from exc
    finally:
        db.close()
