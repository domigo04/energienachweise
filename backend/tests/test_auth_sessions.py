"""Ablauf und serverseitiger Widerruf von Zugriffstokens."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import Base
from app.models import grobkostenschaetzung, kv, lv_import, subscription  # noqa: F401
from app.models.auth import Firma, Role, User
from app.models.heizungscockpit import HcAuditEvent  # noqa: F401
from app.routers.hc_auth import MePatch, UserPatch, update_me, update_user


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def users(session):
    firma = Firma(name="Pilotfirma")
    session.add(firma)
    session.flush()
    user = User(
        tenant_id=firma.id,
        email="pilot@example.com",
        password_hash=hash_password("altes-passwort"),
        role=Role.user,
        is_verified=True,
        is_active=True,
    )
    admin = User(
        tenant_id=firma.id,
        email="admin@example.com",
        password_hash=hash_password("admin-passwort"),
        role=Role.admin,
        is_verified=True,
        is_active=True,
    )
    session.add_all([user, admin])
    session.commit()
    return user, admin


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _assert_unauthorized(token: str, session) -> None:
    with pytest.raises(HTTPException) as error:
        get_current_user(_credentials(token), session)
    assert error.value.status_code == 401


def test_zugriffstoken_laeuft_standardmaessig_nach_15_minuten_ab(users):
    user, _ = users
    token = create_access_token(user.id, user.session_version)
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert ACCESS_TOKEN_EXPIRE_MINUTES == 15
    assert payload["exp"] - payload["iat"] == 15 * 60
    assert payload["sv"] == 0


def test_abgelaufene_und_versionslose_tokens_werden_abgewiesen(session, users):
    user, _ = users
    now = datetime.now(timezone.utc)
    expired = jwt.encode(
        {"sub": str(user.id), "sv": user.session_version, "exp": now - timedelta(seconds=1)},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    legacy = jwt.encode(
        {"sub": str(user.id), "exp": now + timedelta(minutes=5)},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    _assert_unauthorized(expired, session)
    _assert_unauthorized(legacy, session)


def test_passwortwechsel_widerruft_altes_token(session, users):
    user, _ = users
    old_token = create_access_token(user.id, user.session_version)

    update_me(
        MePatch(
            aktuelles_passwort="altes-passwort",
            neues_passwort="neues-passwort",
        ),
        user,
        session,
    )

    assert user.session_version == 1
    assert verify_password("neues-passwort", user.password_hash)
    _assert_unauthorized(old_token, session)
    new_token = create_access_token(user.id, user.session_version)
    assert get_current_user(_credentials(new_token), session).id == user.id


def test_deaktivierung_widerruft_token_auch_nach_reaktivierung(session, users):
    user, admin = users
    old_token = create_access_token(user.id, user.session_version)

    update_user(user.id, UserPatch(is_active=False), admin, session)
    assert user.session_version == 1
    _assert_unauthorized(old_token, session)

    user.is_active = True
    session.commit()
    _assert_unauthorized(old_token, session)
