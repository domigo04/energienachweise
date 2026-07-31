"""Die EINE Liste der Feature-Schlüssel und Limits.

Backend-Guards, Plan-Seed, Admin-Oberflächen und Frontend beziehen ihre
Schlüssel ausschliesslich von hier. Ein Feature-Name darf nirgends sonst als
freier String auftauchen — sonst driften Plan, Guard und Anzeige auseinander
und ein Tippfehler schaltet stillschweigend nichts frei.
"""
from __future__ import annotations

import enum


class Feature(str, enum.Enum):
    """Kanonische Feature-Schlüssel. Der Wert ist stabil und wird gespeichert."""

    SCHEMA_EDITOR = "schema_editor"
    HYDRAULIC_CALCULATIONS = "hydraulic_calculations"
    LV_IMPORT = "lv_import"
    LV_AI_REVIEW = "lv_ai_review"
    COST_ESTIMATION = "cost_estimation"
    REFERENCE_PROJECTS = "reference_projects"
    PDF_EXPORT = "pdf_export"
    COMPANY_ADMIN = "company_admin"
    ADVANCED_CALCULATORS = "advanced_calculators"
    DXF_EXPORT = "dxf_export"


FEATURE_KEYS: tuple[str, ...] = tuple(f.value for f in Feature)

# Was ein Schlüssel bedeutet — auch die Erklärung gibt es nur einmal.
FEATURE_LABELS: dict[str, str] = {
    Feature.SCHEMA_EDITOR: "Schemaeditor verwenden",
    Feature.HYDRAULIC_CALCULATIONS: "Hydraulische Berechnungen verwenden",
    Feature.LV_IMPORT: "LV hochladen, parsen und manuell prüfen",
    Feature.LV_AI_REVIEW: "KI-Analyse, Visual Review und semantische Zuordnung",
    Feature.COST_ESTIMATION: "Kostenschätzungen erstellen",
    Feature.REFERENCE_PROJECTS: "Referenzprojekte verwenden und auswerten",
    Feature.PDF_EXPORT: "PDF-Export erzeugen",
    Feature.COMPANY_ADMIN: "Firmenadministration verwenden",
    Feature.ADVANCED_CALCULATORS: "Erweiterte Fachrechner verwenden",
    Feature.DXF_EXPORT: "DXF-Export verwenden",
}

# Funktionen, die es im Produkt noch nicht gibt. Sie dürfen in keinem Plan
# aktiv sein und werden im UI nicht als verfügbar angeboten.
NOT_IMPLEMENTED: frozenset[str] = frozenset({Feature.DXF_EXPORT.value})


class Limit(str, enum.Enum):
    """Mengenbegrenzungen. Sie hängen an einem Feature-Schlüssel."""

    MAX_USERS = "max_users"
    MAX_PROJECTS = "max_projects"
    LV_IMPORTS_PER_MONTH = "lv_imports_per_month"
    LV_AI_IMPORTS_PER_MONTH = "lv_ai_imports_per_month"
    AI_BUDGET_USD_PER_MONTH = "ai_budget_usd_per_month"
    MAX_PDF_PAGES = "max_pdf_pages"


LIMIT_KEYS: tuple[str, ...] = tuple(limit.value for limit in Limit)

# Welches Limit gehört zu welchem Feature? Ein Feature hat höchstens eines —
# mehr wäre über `configuration` abzubilden.
FEATURE_LIMIT: dict[str, str] = {
    Feature.LV_IMPORT.value: Limit.LV_IMPORTS_PER_MONTH.value,
    Feature.LV_AI_REVIEW.value: Limit.LV_AI_IMPORTS_PER_MONTH.value,
    Feature.PDF_EXPORT.value: Limit.MAX_PDF_PAGES.value,
}

# Zustände eines Abonnements. Nur `active` und `trial` erlauben Zugriff.
ACTIVE_STATUS: frozenset[str] = frozenset({"active", "trial"})
SUBSCRIPTION_STATUS: tuple[str, ...] = (
    "active", "trial", "suspended", "expired", "cancelled",
)

# Fehlercodes — im Frontend auswertbar, nicht bloss Text.
FEATURE_NOT_AVAILABLE = "FEATURE_NOT_AVAILABLE"
SUBSCRIPTION_INACTIVE = "SUBSCRIPTION_INACTIVE"
FEATURE_LIMIT_REACHED = "FEATURE_LIMIT_REACHED"
PROJECT_SEQUENCE_LIMIT_REACHED = "PROJECT_SEQUENCE_LIMIT_REACHED"

# ── Startpläne ─────────────────────────────────────────────────────────────
# `internal` und `enterprise` schalten nur frei, was es wirklich gibt —
# `dxf_export` bleibt überall aus, solange die Funktion fehlt.
_ALLE_VORHANDENEN = tuple(k for k in FEATURE_KEYS if k not in NOT_IMPLEMENTED)

STARTER_PLANS: tuple[dict, ...] = (
    {
        "key": "basic", "name": "Basic",
        "description": "Schema, Hydraulik und PDF-Export.",
        "features": {
            Feature.SCHEMA_EDITOR.value: True,
            Feature.HYDRAULIC_CALCULATIONS.value: True,
            Feature.PDF_EXPORT.value: True,
            Feature.COMPANY_ADMIN.value: True,
            Feature.ADVANCED_CALCULATORS.value: True,
            Feature.LV_IMPORT.value: False,
            Feature.LV_AI_REVIEW.value: False,
            Feature.COST_ESTIMATION.value: False,
            Feature.REFERENCE_PROJECTS.value: False,
            Feature.DXF_EXPORT.value: False,
        },
        "limits": {},
    },
    {
        "key": "professional", "name": "Professional",
        "description": "Zusätzlich LV-Import, KI-Auswertung, Kosten und Referenzen.",
        "features": {
            **{k: True for k in _ALLE_VORHANDENEN},
            Feature.DXF_EXPORT.value: False,
        },
        "limits": {Feature.LV_AI_REVIEW.value: 20},
    },
    {
        "key": "enterprise", "name": "Enterprise",
        "description": "Alle vorhandenen Funktionen ohne Mengenbegrenzung.",
        "features": {
            **{k: True for k in _ALLE_VORHANDENEN},
            Feature.DXF_EXPORT.value: False,
        },
        "limits": {},
    },
    {
        "key": "internal", "name": "Intern",
        "description": "Interne Nutzung — alle vorhandenen Funktionen, keine Limits.",
        "features": {
            **{k: True for k in _ALLE_VORHANDENEN},
            Feature.DXF_EXPORT.value: False,
        },
        "limits": {},
    },
)

# Plan für Firmen, die noch keinen haben. Bewusst `internal`: bestehende Kunden
# nutzen heute alle Funktionen, und eine Migration darf niemandem etwas
# wegnehmen. Die Umstufung auf einen bezahlten Plan ist danach ein bewusster
# Schritt des Plattformadmins.
DEFAULT_PLAN_KEY = "internal"


def as_frontend() -> dict:
    """Schlüssel und Beschriftungen fürs Frontend — eine Quelle für beides."""
    return {
        "features": [
            {"key": key, "label": FEATURE_LABELS[key],
             "implemented": key not in NOT_IMPLEMENTED}
            for key in FEATURE_KEYS
        ],
        "limits": list(LIMIT_KEYS),
        "subscription_status": list(SUBSCRIPTION_STATUS),
    }
