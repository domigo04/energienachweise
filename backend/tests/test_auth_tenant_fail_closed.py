"""Regressionstests für die zentrale Firmenzuordnung von Benutzern."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_active_company,
)
from app.database import Base
from app.models import subscription  # noqa: F401 — FK-Ziel registrieren
from app.models.auth import Firma, Role, User
from app.routers.hc_auth import LoginIn, login


class _UserQuery:
    def __init__(self, user):
        self.user = user

    def filter(self, *_args):
        return self

    def first(self):
        return self.user


class _UserDb:
    def __init__(self, user):
        self.user = user

    def query(self, _model):
        return _UserQuery(self.user)

    def commit(self):
        pass


def _credentials(user_id: int = 1, session_version: int = 0) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=create_access_token(user_id, session_version),
    )


def _user(*, tenant_id, firma, role=Role.user):
    return SimpleNamespace(
        id=1,
        tenant_id=tenant_id,
        firma=firma,
        role=role,
        is_active=True,
        is_verified=True,
        session_version=0,
    )


@pytest.mark.parametrize(
    ("tenant_id", "firma"),
    [
        (None, None),
        (9999, None),
    ],
)
def test_get_current_user_sperrt_fehlende_und_verwaiste_firma(tenant_id, firma):
    user = _user(tenant_id=tenant_id, firma=firma)

    with pytest.raises(HTTPException) as error:
        get_current_user(_credentials(), _UserDb(user))

    assert error.value.status_code == 403
    assert "gültigen Firma" in error.value.detail


def test_get_current_user_sperrt_inaktive_firma():
    user = _user(
        tenant_id=1,
        firma=SimpleNamespace(id=1, is_active=False),
    )

    with pytest.raises(HTTPException) as error:
        get_current_user(_credentials(), _UserDb(user))

    assert error.value.status_code == 403
    assert error.value.detail == "Die Firma ist deaktiviert"


def test_login_gibt_verwaistem_normalen_benutzer_keinen_token():
    user = _user(tenant_id=9999, firma=None)
    user.email = "verwaist@example.com"
    user.password_hash = hash_password("korrektes-passwort")

    with pytest.raises(HTTPException) as error:
        login(
            LoginIn(email=user.email, password="korrektes-passwort"),
            _UserDb(user),
        )

    assert error.value.status_code == 403
    assert "gültigen Firma" in error.value.detail


def test_plattformadmin_darf_ohne_stammfirma_arbeiten():
    admin = _user(tenant_id=None, firma=None, role=Role.admin)

    assert get_current_user(_credentials(), _UserDb(admin)) is admin
    require_active_company(admin)


def test_neuer_normaler_benutzer_erhaelt_nicht_stillschweigend_firma_eins():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    db.add(Firma(id=1, name="Firma Eins"))
    db.commit()

    user = User(
        email="ohne-firma@example.test",
        password_hash="x",
        role=Role.user,
        is_verified=True,
    )
    db.add(user)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    assert User.__table__.c.tenant_id.default is None
