"""Persönliche Editor-Einstellungen — Tastenbelegung je Benutzer.

Feedback Dominic 2026-07-31: die Shortcuts sollen unter einem Zahnrad einstellbar
und **pro Benutzer** gespeichert sein. Bisher lagen sie im Schema-Graphen und
gehörten damit dem Projekt: wer ein fremdes Schema öffnete, bekam eine fremde
Belegung, und zwei Planer haben sich gegenseitig die Tasten verstellt.

Die Regeln (gültige Taste, keine Doppelbelegung) stehen rein und getestet in
`app/user_settings.py`; hier wird nur gelesen und geschrieben.
"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import HcUserSettings
from app.user_settings import bereinige_einstellungen

router = APIRouter(prefix="/api/v1/user-settings", tags=["Heizungscockpit – Einstellungen"])


class EinstellungenIn(BaseModel):
    # Bewusst offen: der Inhalt wird von `bereinige_einstellungen` normalisiert,
    # nicht vom Schema. So kostet eine neue Einstellung keine API-Änderung.
    shortcuts: dict | None = None


def _laden(db: Session, user: User) -> HcUserSettings | None:
    return db.query(HcUserSettings).filter(HcUserSettings.user_id == user.id).first()


def _als_dict(row: HcUserSettings | None) -> dict:
    if row is None:
        return {}
    try:
        return json.loads(row.settings_json or "{}")
    except (TypeError, ValueError):
        return {}


@router.get("")
def einstellungen_lesen(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Immer ein vollständiger Satz — auch für einen Benutzer ohne Eintrag.

    Das Frontend soll nicht zwischen «noch nie gespeichert» und «Standard»
    unterscheiden müssen; beides ist derselbe Zustand.
    """
    return bereinige_einstellungen(_als_dict(_laden(db, user)))


@router.put("")
def einstellungen_schreiben(
    body: EinstellungenIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bereinigt = bereinige_einstellungen(body.model_dump())
    row = _laden(db, user)
    if row is None:
        row = HcUserSettings(tenant_id=user.tenant_id, user_id=user.id)
        db.add(row)
    row.settings_json = json.dumps(bereinigt, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.commit()
    return bereinigt
