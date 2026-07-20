import json


STATUS_LABELS = {
    "nicht_begonnen": "Nicht begonnen",
    "entwurf": "Entwurf",
    "unvollstaendig": "Unvollständig",
    "fachlich_geprueft": "Fachlich geprüft",
    "freigegeben": "Freigegeben",
    "exportiert": "Exportiert",
}


def kostenschaetzung_freigabe(inputs_json: str | None, updated_at=None) -> dict:
    """Kompakte Projektübersicht ohne das grosse Ergebnis-JSON zu laden."""
    try:
        inputs = json.loads(inputs_json or "{}")
    except (TypeError, ValueError):
        inputs = {}
    workflow = inputs.get("_workflow") or {}
    status = workflow.get("status") or "entwurf"
    if status not in STATUS_LABELS:
        status = "entwurf"
    freigegeben = status in {"freigegeben", "exportiert"}
    return {
        "key": "grobkostenschaetzung",
        "titel": "Grobkostenschätzung",
        "status": status,
        "status_label": STATUS_LABELS[status],
        "freigegeben": freigegeben,
        "exportiert": status == "exportiert",
        "variante": workflow.get("variante") or "netto",
        "version_nr": workflow.get("version_nr") or 0,
        "freigegeben_at": workflow.get("freigegeben_at"),
        "updated_at": updated_at.isoformat() if updated_at else None,
    }


def leere_kostenschaetzung_freigabe() -> dict:
    return {
        "key": "grobkostenschaetzung", "titel": "Grobkostenschätzung",
        "status": "nicht_begonnen", "status_label": STATUS_LABELS["nicht_begonnen"],
        "freigegeben": False, "exportiert": False, "variante": None,
        "version_nr": 0, "freigegeben_at": None, "updated_at": None,
    }
