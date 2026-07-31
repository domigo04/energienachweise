"""Automatische Projektnummern, Firmenpläne und Feature-Freischaltungen.

Revision ID: 20260731_01
Revises: 20260730_01

Nichts wird gelöscht und nichts zurückgesetzt. Der Ablauf hält sich an die
Reihenfolge, die einen Backfill überhaupt erst sicher macht:

    1. neue Spalten und Tabellen nullable anlegen
    2. bestehende Projekte je Firma und Jahr nummerieren
    3. Sequenzen auf den höchsten vergebenen Wert setzen
    4. Startpläne anlegen und Firmen zuweisen
    5. Unique Constraints erst danach setzen

Die Migration ist mehrfach ausführbar: jeder Schritt prüft zuerst, ob er schon
erledigt ist.
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "20260731_01"
down_revision = "20260730_01"
branch_labels = None
depends_on = None

# Muss zur Anwendung passen; hier bewusst dupliziert, damit die Migration auch
# nach einer späteren Umbenennung im Code reproduzierbar bleibt.
_FEATURES = (
    "schema_editor", "hydraulic_calculations", "lv_import", "lv_ai_review",
    "cost_estimation", "reference_projects", "pdf_export", "company_admin",
    "advanced_calculators", "dxf_export",
)
_VORHANDEN = tuple(k for k in _FEATURES if k != "dxf_export")
_PLAENE = (
    ("basic", "Basic", "Schema, Hydraulik und PDF-Export.",
     {"schema_editor": True, "hydraulic_calculations": True, "pdf_export": True,
      "company_admin": True, "advanced_calculators": True}, {}),
    ("professional", "Professional",
     "Zusätzlich LV-Import, KI-Auswertung, Kosten und Referenzen.",
     {k: True for k in _VORHANDEN}, {"lv_ai_review": 20}),
    ("enterprise", "Enterprise", "Alle vorhandenen Funktionen ohne Mengenbegrenzung.",
     {k: True for k in _VORHANDEN}, {}),
    ("internal", "Intern", "Interne Nutzung — alle vorhandenen Funktionen.",
     {k: True for k in _VORHANDEN}, {}),
)
_DEFAULT_PLAN = "internal"


def _spalten(inspector, tabelle) -> set:
    return {c["name"] for c in inspector.get_columns(tabelle)}


def _constraint_namen(inspector, tabelle) -> set:
    namen = {c["name"] for c in inspector.get_unique_constraints(tabelle)}
    namen |= {i["name"] for i in inspector.get_indexes(tabelle) if i.get("unique")}
    return {n for n in namen if n}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ── 1) Neue Spalten, alle nullable ────────────────────────────────────
    projekt_spalten = _spalten(inspector, "hc_projects")
    for name, typ in (
        ("project_year", sa.Integer()),
        ("project_sequence", sa.Integer()),
        ("opened_at", sa.DateTime()),
    ):
        if name not in projekt_spalten:
            op.add_column("hc_projects", sa.Column(name, typ, nullable=True))

    firma_spalten = _spalten(inspector, "hc_firmen")
    for name, typ in (
        ("subscription_plan_id", sa.Integer()),
        ("plan_started_at", sa.DateTime()),
        ("plan_expires_at", sa.DateTime()),
        ("subscription_status", sa.String()),
    ):
        if name not in firma_spalten:
            op.add_column("hc_firmen", sa.Column(name, typ, nullable=True))
    bind.execute(sa.text(
        "UPDATE hc_firmen SET subscription_status = 'active' "
        "WHERE subscription_status IS NULL"))

    # ── 2) Neue Tabellen ──────────────────────────────────────────────────
    if not inspector.has_table("project_number_sequences"):
        op.create_table(
            "project_number_sequences",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), nullable=False, index=True),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("last_sequence", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("company_id", "year", name="uq_project_seq_company_year"),
        )
    if not inspector.has_table("subscription_plans"):
        op.create_table(
            "subscription_plans",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("key", sa.String(), nullable=False, unique=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
    if not inspector.has_table("plan_features"):
        op.create_table(
            "plan_features",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("plan_id", sa.Integer(),
                      sa.ForeignKey("subscription_plans.id"), nullable=False, index=True),
            sa.Column("feature_key", sa.String(), nullable=False, index=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("limit_value", sa.Integer(), nullable=True),
            sa.Column("configuration", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("plan_id", "feature_key", name="uq_plan_feature"),
        )
    if not inspector.has_table("company_feature_overrides"):
        op.create_table(
            "company_feature_overrides",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), nullable=False, index=True),
            sa.Column("feature_key", sa.String(), nullable=False, index=True),
            sa.Column("enabled", sa.Boolean(), nullable=True),
            sa.Column("limit_value", sa.Integer(), nullable=True),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("company_id", "feature_key", name="uq_company_override"),
        )
    if not inspector.has_table("company_feature_settings"):
        op.create_table(
            "company_feature_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), nullable=False, index=True),
            sa.Column("feature_key", sa.String(), nullable=False, index=True),
            sa.Column("internally_enabled", sa.Boolean(), nullable=False,
                      server_default=sa.true()),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("company_id", "feature_key", name="uq_company_setting"),
        )
    if not inspector.has_table("feature_usage"):
        op.create_table(
            "feature_usage",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), nullable=False, index=True),
            sa.Column("feature_key", sa.String(), nullable=False, index=True),
            sa.Column("period_start", sa.DateTime(), nullable=False),
            sa.Column("period_end", sa.DateTime(), nullable=False),
            sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("usage_amount", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("company_id", "feature_key", "period_start",
                                name="uq_feature_usage_period"),
        )

    # ── 3) Backfill der Projektnummern ────────────────────────────────────
    bericht = backfill_projektnummern(bind)
    for zeile in bericht:
        print(f"[migration 20260731_01] {zeile}")

    # ── 4) Pläne anlegen und Firmen zuweisen ──────────────────────────────
    seed_plaene(bind)

    # ── 5) Unique Constraints erst nach erfolgreichem Backfill ────────────
    inspector = sa.inspect(bind)
    vorhandene = _constraint_namen(inspector, "hc_projects")
    if "uq_project_number_company" not in vorhandene:
        # Auf SQLite kann ein nachträglicher Constraint nur als Index entstehen;
        # er wirkt dort genauso.
        op.create_index("uq_project_number_company", "hc_projects",
                        ["tenant_id", "projektnummer"], unique=True)
    if "uq_project_sequence_company_year" not in vorhandene:
        op.create_index("uq_project_sequence_company_year", "hc_projects",
                        ["tenant_id", "project_year", "project_sequence"], unique=True)


def backfill_projektnummern(bind) -> list[str]:
    """Bestehende Projekte nummerieren. Gibt einen Bericht zurück.

    Sortierung innerhalb eines Jahres: opened_at, sonst created_at, sonst id —
    `id` ist der stabile Anker, damit ein zweiter Lauf dieselbe Reihenfolge
    ergibt.
    """
    bericht: list[str] = []
    projekte = bind.execute(sa.text(
        "SELECT id, tenant_id, projektnummer, project_year, project_sequence, "
        "       opened_at, created_at "
        "FROM hc_projects ORDER BY id"
    )).mappings().all()
    if not projekte:
        return ["keine bestehenden Projekte"]

    ohne_firma = [p["id"] for p in projekte if not p["tenant_id"]]
    if ohne_firma:
        # Nicht raten und nichts löschen: solche Projekte bleiben unnummeriert
        # und werden gemeldet.
        bericht.append(
            f"{len(ohne_firma)} Projekt(e) ohne Firma — nicht nummeriert: {ohne_firma[:20]}"
        )

    jetzt = datetime.utcnow()
    ohne_datum = 0
    je_firma_jahr: dict[tuple[int, int], list[dict]] = {}
    for p in projekte:
        if not p["tenant_id"]:
            continue
        datum = p["opened_at"] or p["created_at"]
        if datum is None:
            datum = jetzt
            ohne_datum += 1
        if isinstance(datum, str):
            datum = datetime.fromisoformat(datum.replace("Z", "+00:00"))
        je_firma_jahr.setdefault((p["tenant_id"], datum.year), []).append(
            {**dict(p), "_datum": datum})
    if ohne_datum:
        bericht.append(f"{ohne_datum} Projekt(e) ohne Datum — Migrationszeitpunkt verwendet")

    vergeben = 0
    behalten = 0
    neu_vergeben: list[str] = []
    for (firma, jahr), gruppe in sorted(je_firma_jahr.items()):
        gruppe.sort(key=lambda p: (p["_datum"], p["id"]))
        praefix = f"{jahr % 100:02d}"
        benutzt: set[str] = set()
        # Erster Durchgang: gültige bestehende Nummern behalten.
        for p in gruppe:
            nummer = (p["projektnummer"] or "").strip()
            gueltig = (
                len(nummer) == 5 and nummer.isdigit()
                and nummer.startswith(praefix) and nummer not in benutzt
            )
            p["_behalten"] = gueltig
            if gueltig:
                benutzt.add(nummer)
        # Zweiter Durchgang: alles Übrige fortlaufend füllen.
        naechste = 1
        for p in gruppe:
            if p["_behalten"]:
                folge = int((p["projektnummer"] or "")[2:])
                bind.execute(sa.text(
                    "UPDATE hc_projects SET project_year = :y, project_sequence = :s, "
                    "opened_at = COALESCE(opened_at, :d) WHERE id = :id"
                ), {"y": jahr, "s": folge, "d": p["_datum"], "id": p["id"]})
                behalten += 1
                continue
            while f"{praefix}{naechste:03d}" in benutzt:
                naechste += 1
            if naechste > 999:
                raise RuntimeError(
                    f"Firma {firma}, Jahr {jahr}: mehr als 999 Projekte — "
                    "Backfill abgebrochen, keine Daten geändert."
                )
            nummer = f"{praefix}{naechste:03d}"
            benutzt.add(nummer)
            if p["projektnummer"]:
                neu_vergeben.append(
                    f"Projekt {p['id']}: '{p['projektnummer']}' → {nummer}")
            bind.execute(sa.text(
                "UPDATE hc_projects SET projektnummer = :n, project_year = :y, "
                "project_sequence = :s, opened_at = COALESCE(opened_at, :d) "
                "WHERE id = :id"
            ), {"n": nummer, "y": jahr, "s": naechste, "d": p["_datum"], "id": p["id"]})
            vergeben += 1
            naechste += 1

        # Sequenz auf den höchsten vergebenen Wert setzen.
        hoechste = max(int(n[2:]) for n in benutzt) if benutzt else 0
        vorhandene = bind.execute(sa.text(
            "SELECT last_sequence FROM project_number_sequences "
            "WHERE company_id = :c AND year = :y"), {"c": firma, "y": jahr}).scalar()
        if vorhandene is None:
            bind.execute(sa.text(
                "INSERT INTO project_number_sequences "
                "(company_id, year, last_sequence, created_at) "
                "VALUES (:c, :y, :s, :n)"),
                {"c": firma, "y": jahr, "s": hoechste, "n": jetzt})
        elif vorhandene < hoechste:
            bind.execute(sa.text(
                "UPDATE project_number_sequences SET last_sequence = :s "
                "WHERE company_id = :c AND year = :y"),
                {"s": hoechste, "c": firma, "y": jahr})

    bericht.append(f"{behalten} bestehende Nummer(n) übernommen, {vergeben} neu vergeben")
    bericht.extend(neu_vergeben[:20])
    return bericht


def seed_plaene(bind) -> None:
    """Startpläne anlegen und Firmen ohne Plan zuweisen. Mehrfach ausführbar."""
    jetzt = datetime.utcnow()
    for key, name, beschreibung, features, limits in _PLAENE:
        plan_id = bind.execute(sa.text(
            "SELECT id FROM subscription_plans WHERE key = :k"), {"k": key}).scalar()
        if plan_id is None:
            bind.execute(sa.text(
                "INSERT INTO subscription_plans (key, name, description, active, created_at) "
                "VALUES (:k, :n, :d, :a, :c)"),
                {"k": key, "n": name, "d": beschreibung, "a": True, "c": jetzt})
            plan_id = bind.execute(sa.text(
                "SELECT id FROM subscription_plans WHERE key = :k"), {"k": key}).scalar()
        for feature in _FEATURES:
            vorhanden = bind.execute(sa.text(
                "SELECT id FROM plan_features WHERE plan_id = :p AND feature_key = :f"),
                {"p": plan_id, "f": feature}).scalar()
            if vorhanden is not None:
                continue
            bind.execute(sa.text(
                "INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value, created_at) "
                "VALUES (:p, :f, :e, :l, :c)"),
                {"p": plan_id, "f": feature, "e": bool(features.get(feature, False)),
                 "l": limits.get(feature), "c": jetzt})

    default_id = bind.execute(sa.text(
        "SELECT id FROM subscription_plans WHERE key = :k"), {"k": _DEFAULT_PLAN}).scalar()
    if default_id is not None:
        # Bestehende Firmen behalten alle Funktionen — der Default nimmt nichts weg.
        bind.execute(sa.text(
            "UPDATE hc_firmen SET subscription_plan_id = :p, plan_started_at = :s "
            "WHERE subscription_plan_id IS NULL"),
            {"p": default_id, "s": jetzt})


def downgrade() -> None:
    """Nur die neuen Strukturen entfernen — bestehende Daten bleiben."""
    for name in ("uq_project_number_company", "uq_project_sequence_company_year"):
        try:
            op.drop_index(name, table_name="hc_projects")
        except Exception:                        # noqa: BLE001 — Index fehlt bereits
            pass
    for tabelle in ("feature_usage", "company_feature_settings",
                    "company_feature_overrides", "plan_features",
                    "subscription_plans", "project_number_sequences"):
        op.drop_table(tabelle)
    for spalte in ("subscription_plan_id", "plan_started_at", "plan_expires_at",
                   "subscription_status"):
        op.drop_column("hc_firmen", spalte)
    for spalte in ("project_year", "project_sequence", "opened_at"):
        op.drop_column("hc_projects", spalte)
