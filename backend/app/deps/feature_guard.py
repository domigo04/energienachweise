"""Zentrale Zugriffsprüfung für kostenpflichtige Funktionen.

`require_feature("lv_import")` als FastAPI-Dependency vor die Route hängen —
damit gilt die Prüfung im Backend und nicht nur in der Oberfläche. Ein
ausgeblendeter Knopf ist keine Berechtigung; die Route muss selbst sperren.

Geprüft wird in dieser Reihenfolge, weil die früheren Gründe die späteren
erübrigen:

    Benutzer aktiv → Firma vorhanden und aktiv → Abo gültig
    → Feature effektiv aktiviert → Limit nicht erreicht → Rolle darf es
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import Firma, Role, User
from app.plan_features import (
    FEATURE_LIMIT_REACHED, FEATURE_NOT_AVAILABLE, SUBSCRIPTION_INACTIVE, Feature,
)
from app.routers.hc_auth import get_current_user
from app.services import features as feature_service

# Rollen, die eine Funktion ausführen dürfen. Standard: jedes aktive
# Firmenmitglied. Nur ausdrücklich verwaltende Funktionen sind enger.
_NUR_FIRMENADMIN = frozenset({Feature.COMPANY_ADMIN.value})


def _fehler(status: int, code: str, nachricht: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": nachricht})


def _ist_firmenadmin(user: User) -> bool:
    return user.firma_role == "admin" or user.role == Role.admin


def pruefe_feature(db: Session, user: User, feature_key: str) -> None:
    """Wirft eine HTTPException, wenn der Zugriff nicht erlaubt ist."""
    if not user.is_active:
        raise _fehler(403, SUBSCRIPTION_INACTIVE, "Benutzerkonto ist nicht aktiv.")
    if not user.tenant_id:
        raise _fehler(403, FEATURE_NOT_AVAILABLE, "Benutzer gehört zu keiner Firma.")

    firma = db.get(Firma, user.tenant_id)
    if firma is None or not firma.is_active:
        raise _fehler(403, SUBSCRIPTION_INACTIVE, "Firma ist nicht aktiv.")

    # Der globale Plattformadmin muss produktive Funktionen prüfen und
    # Supportfälle bearbeiten können, unabhängig vom Plan seiner Stammfirma.
    # Inaktive Benutzer oder Firmen bleiben auch für ihn weiterhin gesperrt.
    if user.role == Role.admin:
        return

    zustand = feature_service.company_plan(db, user.tenant_id)
    if not zustand.active:
        raise _fehler(
            403, SUBSCRIPTION_INACTIVE,
            f"Abonnement ist nicht aktiv (Status: {zustand.status}).",
        )

    wirkung = feature_service.get_effective_feature(db, user.tenant_id, feature_key)
    if not wirkung.enabled:
        nachricht = wirkung.reason or (
            "Diese Funktion ist firmenintern deaktiviert."
            if not wirkung.internally_enabled
            else "Diese Funktion ist in Ihrem aktuellen Plan nicht enthalten."
        )
        raise _fehler(403, FEATURE_NOT_AVAILABLE, nachricht)

    if wirkung.limit_reached:
        raise _fehler(
            429, FEATURE_LIMIT_REACHED,
            f"Das Kontingent für diesen Monat ist aufgebraucht "
            f"({wirkung.used}/{wirkung.limit}).",
        )

    if feature_key in _NUR_FIRMENADMIN and not _ist_firmenadmin(user):
        raise _fehler(403, FEATURE_NOT_AVAILABLE,
                      "Diese Funktion ist der Firmenadministration vorbehalten.")


def require_feature(feature_key: str):
    """Dependency-Fabrik: `Depends(require_feature("lv_import"))`.

    Gibt den geprüften Benutzer zurück, damit die Route ihn direkt verwenden
    kann und keine zweite `get_current_user`-Abhängigkeit braucht.
    """

    def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        pruefe_feature(db, user, feature_key)
        # Für Routen, die danach Verbrauch zählen wollen.
        request.state.feature_key = feature_key
        return user

    return dependency


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    """Plattformadministration — die bestehende globale Adminrolle."""
    if user.role != Role.admin:
        raise _fehler(403, FEATURE_NOT_AVAILABLE,
                      "Nur die Plattformadministration darf das.")
    return user


def require_company_admin(user: User = Depends(get_current_user)) -> User:
    """Firmenadministration — bestehende Firmenrolle, kein neues Rollensystem."""
    if not _ist_firmenadmin(user):
        raise _fehler(403, FEATURE_NOT_AVAILABLE,
                      "Nur die Firmenadministration darf das.")
    return user
