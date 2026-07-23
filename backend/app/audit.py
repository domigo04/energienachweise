"""Gemeinsamer Helfer für das firmenweite Änderungsprotokoll."""

import enum
import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.heizungscockpit import HcAuditEvent


def _json_default(value: Any):
    if isinstance(value, enum.Enum):
        return value.value
    return str(value)


def add_audit_event(
    db: Session,
    *,
    user: User,
    action: str,
    details: Optional[dict] = None,
    project_id: int = 0,
    entity_type: str = "firma",
    entity_id: Optional[int] = None,
    schema_id: Optional[int] = None,
    revision_id: Optional[int] = None,
    tenant_id: Optional[int] = None,
) -> HcAuditEvent:
    """Fügt ein Ereignis zur laufenden Transaktion hinzu.

    Der aufrufende Endpunkt entscheidet über ``commit``. So werden fachliche
    Änderung und Protokolleintrag immer gemeinsam gespeichert oder verworfen.
    """
    event = HcAuditEvent(
        tenant_id=tenant_id if tenant_id is not None else user.tenant_id,
        project_id=project_id,
        schema_id=schema_id,
        revision_id=revision_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=getattr(user, "id", None),
        actor_name=getattr(user, "name", None) or getattr(user, "email", None),
        details_json=json.dumps(
            details or {},
            separators=(",", ":"),
            ensure_ascii=False,
            default=_json_default,
        ),
    )
    db.add(event)
    return event
