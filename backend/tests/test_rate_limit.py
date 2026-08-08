"""Begrenzung wiederholter Fehlversuche auf Login und Registrierung (#13).

Zwei Ebenen: die reine Zählmechanik (`Versuchssperre`, `client_ip`) und das
tatsächliche Verhalten der beiden öffentlichen Endpunkte.

Es werden ausschliesslich erfundene Zugangsdaten verwendet.
"""
import asyncio
from datetime import datetime
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from app.auth import hash_password
from app.database import get_db
from app.models import subscription  # noqa: F401 — FK-Ziel registrieren
from app.models.auth import Role
from app.rate_limit import (
    LOGIN_IP_GRENZE,
    LOGIN_KONTO_GRENZE,
    REGISTER_IP_GRENZE,
    Versuchssperre,
    alles_leeren,
    client_ip,
    login_ip_sperre,
    login_konto_sperre,
    register_ip_sperre,
    sperrhinweis,
)
from app.routers.hc_auth import LoginIn, RegisterIn, login, register
from app.routers.hc_auth import router as auth_router


PASSWORT = "richtiges-testpasswort"


@pytest.fixture(autouse=True)
def _leere_zaehler():
    """Die Zähler leben im Modul — ohne Rücksetzen färbt ein Test auf den nächsten ab."""
    alles_leeren()
    yield
    alles_leeren()


# ── Zählmechanik ───────────────────────────────────────────────────────────

def _sperre(grenze=3, fenster_s=60, sperre_s=300):
    return Versuchssperre(grenze=grenze, fenster_s=fenster_s, sperre_s=sperre_s)


def test_unter_der_grenze_wird_nicht_gesperrt():
    sperre = _sperre(grenze=3)
    for i in range(2):
        assert sperre.fehlversuch("a", jetzt=100 + i) == 0.0
    assert sperre.restsperre_s("a", jetzt=102) == 0.0


def test_die_grenze_sperrt_fuer_die_volle_dauer():
    sperre = _sperre(grenze=3, sperre_s=300)
    for i in range(3):
        sperre.fehlversuch("a", jetzt=100 + i)
    assert sperre.restsperre_s("a", jetzt=102) == pytest.approx(300)


def test_sperre_laeuft_ab():
    sperre = _sperre(grenze=3, sperre_s=300)
    for i in range(3):
        sperre.fehlversuch("a", jetzt=100 + i)
    assert sperre.restsperre_s("a", jetzt=401) == pytest.approx(1)
    assert sperre.restsperre_s("a", jetzt=403) == 0.0


def test_versuche_ausserhalb_des_fensters_zaehlen_nicht_mehr():
    # Drei Fehlversuche über Stunden verteilt sind kein Angriff, sondern ein
    # Mensch, der sein Passwort dreimal im Jahr vergisst.
    sperre = _sperre(grenze=3, fenster_s=60)
    sperre.fehlversuch("a", jetzt=0)
    sperre.fehlversuch("a", jetzt=1000)
    assert sperre.fehlversuch("a", jetzt=2000) == 0.0
    assert sperre.restsperre_s("a", jetzt=2000) == 0.0


def test_weiterer_versuch_verlaengert_eine_laufende_sperre_nicht_endlos():
    sperre = _sperre(grenze=3, sperre_s=300)
    for i in range(3):
        sperre.fehlversuch("a", jetzt=100 + i)
    sperre.fehlversuch("a", jetzt=200)
    # Die Sperre endet weiterhin bei 402, nicht bei 500.
    assert sperre.restsperre_s("a", jetzt=402) == 0.0


def test_schluessel_sind_voneinander_unabhaengig():
    sperre = _sperre(grenze=3)
    for i in range(3):
        sperre.fehlversuch("a", jetzt=100 + i)
    assert sperre.restsperre_s("a", jetzt=101) > 0
    assert sperre.restsperre_s("b", jetzt=101) == 0.0


def test_zuruecksetzen_loescht_den_schluessel():
    sperre = _sperre(grenze=3)
    for i in range(3):
        sperre.fehlversuch("a", jetzt=100 + i)
    sperre.zuruecksetzen("a")
    assert sperre.restsperre_s("a", jetzt=101) == 0.0


def test_aufraeumen_entfernt_abgelaufene_eintraege_aber_keine_aktiven():
    # Ohne Aufräumen könnte ein Angreifer mit erfundenen Adressen beliebig
    # viele Schlüssel anlegen und den Speicher füllen.
    sperre = _sperre(grenze=3, fenster_s=60, sperre_s=300)
    sperre.fehlversuch("alt", jetzt=0)
    sperre.fehlversuch("neu", jetzt=1000)
    assert sperre.aufraeumen(jetzt=1000) == 1
    assert sperre.restsperre_s("neu", jetzt=1000) == 0.0
    assert sperre.fehlversuch("neu", jetzt=1001) == 0.0   # Zähler von "neu" steht noch


def test_aufraeumen_laesst_gesperrte_eintraege_stehen():
    sperre = _sperre(grenze=2, fenster_s=60, sperre_s=300)
    sperre.fehlversuch("a", jetzt=0)
    sperre.fehlversuch("a", jetzt=1)
    assert sperre.aufraeumen(jetzt=100) == 0
    assert sperre.restsperre_s("a", jetzt=100) > 0


# ── Absenderadresse ────────────────────────────────────────────────────────

def test_client_ip_nimmt_den_letzten_eintrag_der_weiterleitungskette():
    # Die vorderen Einträge darf der Aufrufer frei erfinden; nur den letzten
    # hat der Proxy geschrieben, der uns am nächsten steht.
    assert client_ip("203.0.113.9, 198.51.100.7", "10.0.0.1") == "198.51.100.7"


def test_client_ip_laesst_sich_nicht_durch_erfundene_vordereintraege_umgehen():
    echt = client_ip("198.51.100.7", "10.0.0.1")
    gefaelscht = client_ip("1.2.3.4, 5.6.7.8, 198.51.100.7", "10.0.0.1")
    assert echt == gefaelscht == "198.51.100.7"


def test_client_ip_faellt_auf_die_verbindungsadresse_zurueck():
    assert client_ip(None, "10.0.0.1") == "10.0.0.1"
    assert client_ip("", "10.0.0.1") == "10.0.0.1"


def test_client_ip_hat_immer_einen_schluessel():
    # Lieber alle unbekannten Aufrufer gemeinsam begrenzen als gar nicht.
    assert client_ip(None, None) == "unbekannt"


# ── Meldung ────────────────────────────────────────────────────────────────

def test_sperrhinweis_verraet_nichts_ueber_das_konto():
    text = sperrhinweis(900)
    for verraeterisch in ("mail", "@", "passwort", "konto ", "existiert", "ip"):
        assert verraeterisch not in text.lower()


def test_sperrhinweis_rundet_auf_ganze_minuten_auf():
    assert "1 Minute" in sperrhinweis(1)
    assert "15 Minuten" in sperrhinweis(900)


# ── Verhalten der Endpunkte ────────────────────────────────────────────────

class _Db:
    """Benutzertabelle als Liste; `filter` merkt sich nur die gesuchte E-Mail."""

    def __init__(self, users):
        self.users = users
        self._gesucht = None
        self.commits = 0

    def query(self, _model):
        return self

    def filter(self, kriterium):
        # Der Vergleich ist ein SQLAlchemy-Ausdruck; uns interessiert der Wert
        # der rechten Seite, also die gesuchte E-Mail.
        self._gesucht = getattr(kriterium.right, "value", None)
        return self

    def first(self):
        return next((u for u in self.users if u.email == self._gesucht), None)

    def commit(self):
        self.commits += 1

    def add(self, _obj):
        pass

    def flush(self):
        pass

    def add_all(self, _objs):
        pass


def _user(email, *, aktiv=True, verifiziert=True):
    return SimpleNamespace(
        id=1,
        tenant_id=1,
        email=email,
        password_hash=hash_password(PASSWORT),
        name="Testkonto",
        role=Role.user,
        firma_role="mitglied",
        firma=SimpleNamespace(id=1, name="Testfirma", is_active=True, abo_plan=None),
        firma_admin_beantragt_at=None,
        firma_admin_bestaetigt_at=None,
        firma_admin_bestaetigt_von=None,
        is_active=aktiv,
        is_verified=verifiziert,
        session_version=0,
        created_at=datetime(2026, 1, 1),
        last_login_at=None,
    )


class _Request:
    def __init__(self, ip="198.51.100.7", forwarded=None):
        self.client = SimpleNamespace(host=ip)
        self.headers = {"x-forwarded-for": forwarded} if forwarded else {}


def _anmelden(db, email, passwort, request=None):
    return login(LoginIn(email=email, password=passwort), db, request or _Request())


def test_login_sperrt_nach_zu_vielen_fehlversuchen_mit_429():
    db = _Db([_user("planer@example.com")])
    for _ in range(LOGIN_KONTO_GRENZE):
        with pytest.raises(HTTPException) as fehler:
            _anmelden(db, "planer@example.com", "falsch")
        assert fehler.value.status_code == 401

    with pytest.raises(HTTPException) as fehler:
        _anmelden(db, "planer@example.com", "falsch")
    assert fehler.value.status_code == 429
    assert fehler.value.headers.get("Retry-After")


def test_die_sperre_gilt_auch_fuer_das_richtige_passwort():
    # Sonst wäre sie wirkungslos: der letzte Versuch ist der, der stimmt.
    db = _Db([_user("planer@example.com")])
    for _ in range(LOGIN_KONTO_GRENZE):
        with pytest.raises(HTTPException):
            _anmelden(db, "planer@example.com", "falsch")

    with pytest.raises(HTTPException) as fehler:
        _anmelden(db, "planer@example.com", PASSWORT)
    assert fehler.value.status_code == 429


def test_andere_benutzer_koennen_sich_weiter_anmelden():
    db = _Db([_user("opfer@example.com"), _user("kollege@example.com")])
    for _ in range(LOGIN_KONTO_GRENZE):
        with pytest.raises(HTTPException):
            _anmelden(db, "opfer@example.com", "falsch")

    # Andere Adresse, damit der IP-Zähler nicht mitspielt.
    antwort = _anmelden(db, "kollege@example.com", PASSWORT, _Request(ip="203.0.113.1"))
    assert antwort.access_token


def test_erfolgreiche_anmeldung_setzt_den_kontozaehler_zurueck():
    db = _Db([_user("planer@example.com")])
    for _ in range(LOGIN_KONTO_GRENZE - 1):
        with pytest.raises(HTTPException):
            _anmelden(db, "planer@example.com", "falsch")

    assert _anmelden(db, "planer@example.com", PASSWORT).access_token
    # Der Zähler steht wieder bei null: es sind erneut volle Fehlversuche frei.
    for _ in range(LOGIN_KONTO_GRENZE - 1):
        with pytest.raises(HTTPException) as fehler:
            _anmelden(db, "planer@example.com", "falsch")
        assert fehler.value.status_code == 401


def test_erfolgreiche_anmeldung_setzt_den_ip_zaehler_nicht_zurueck():
    # Sonst könnte jemand mit einem gültigen Konto seine Adresse nach jedem
    # Block wieder freikaufen.
    db = _Db([_user("eigen@example.com")])
    login_ip_sperre.fehlversuch("198.51.100.7")
    vorher = len(login_ip_sperre._eintraege["198.51.100.7"].versuche)

    assert _anmelden(db, "eigen@example.com", PASSWORT).access_token
    assert len(login_ip_sperre._eintraege["198.51.100.7"].versuche) == vorher


def test_ip_zaehler_greift_ueber_viele_verschiedene_konten():
    # Credential Stuffing: jedes Konto nur einmal, der Kontozähler löst also
    # nie aus — die Abwehr muss von der Adresse kommen.
    db = _Db([])
    for i in range(LOGIN_IP_GRENZE):
        with pytest.raises(HTTPException) as fehler:
            _anmelden(db, f"opfer{i}@example.com", "falsch")
        assert fehler.value.status_code == 401

    with pytest.raises(HTTPException) as fehler:
        _anmelden(db, "noch-eins@example.com", "falsch")
    assert fehler.value.status_code == 429


def test_login_pruefen_kostet_keine_datenbankabfrage_wenn_gesperrt():
    db = _Db([_user("planer@example.com")])
    for _ in range(LOGIN_KONTO_GRENZE):
        with pytest.raises(HTTPException):
            _anmelden(db, "planer@example.com", "falsch")
    db.commits = 0
    db._gesucht = "unberuehrt"

    with pytest.raises(HTTPException):
        _anmelden(db, "planer@example.com", "falsch")
    assert db._gesucht == "unberuehrt"      # es wurde gar nicht erst gesucht


def test_deaktiviertes_konto_bleibt_403_und_zaehlt_nicht_als_fehlversuch():
    # Das Passwort stimmte — das ist kein Angriffsversuch.
    db = _Db([_user("gesperrt@example.com", aktiv=False)])
    for _ in range(LOGIN_KONTO_GRENZE + 2):
        with pytest.raises(HTTPException) as fehler:
            _anmelden(db, "gesperrt@example.com", PASSWORT)
        assert fehler.value.status_code == 403


def test_registrierung_wird_pro_adresse_begrenzt():
    db = _Db([_user("schon-da@example.com")])
    for _ in range(REGISTER_IP_GRENZE):
        with pytest.raises(HTTPException) as fehler:
            register(RegisterIn(email="schon-da@example.com", password=PASSWORT), db, _Request())
        assert fehler.value.status_code == 400

    with pytest.raises(HTTPException) as fehler:
        register(RegisterIn(email="neu@example.com", password=PASSWORT), db, _Request())
    assert fehler.value.status_code == 429
    assert fehler.value.headers.get("Retry-After")


def test_registrierung_von_anderer_adresse_bleibt_moeglich():
    db = _Db([_user("schon-da@example.com")])
    for _ in range(REGISTER_IP_GRENZE):
        with pytest.raises(HTTPException):
            register(RegisterIn(email="schon-da@example.com", password=PASSWORT), db, _Request())

    antwort = register(
        RegisterIn(email="neu@example.com", password=PASSWORT),
        db,
        _Request(ip="203.0.113.1"),
    )
    assert antwort["ok"] is True


def test_login_und_registrierung_teilen_sich_die_zaehler_nicht():
    db = _Db([_user("planer@example.com")])
    for _ in range(LOGIN_KONTO_GRENZE):
        with pytest.raises(HTTPException):
            _anmelden(db, "planer@example.com", "falsch")

    # Die Registrierung derselben Adresse ist davon unberührt.
    assert register_ip_sperre.restsperre_s("198.51.100.7") == 0.0


def test_ohne_request_funktioniert_der_login_weiter():
    # Direkte Aufrufe (Bestandstests) übergeben keinen Request.
    db = _Db([_user("planer@example.com")])
    assert login(LoginIn(email="planer@example.com", password=PASSWORT), db).access_token


# ── Über echtes HTTP ───────────────────────────────────────────────────────
#
# Die Aufrufe oben gehen an der FastAPI-Schicht vorbei. Sie können deshalb
# NICHT belegen, dass `Request` und `Response` trotz ihres Vorgabewerts
# tatsächlich durchgereicht werden — und ohne `Request` gäbe es keine Adresse
# und damit keinen IP-Zähler. Genau das prüfen die folgenden Tests.

def _app(db):
    app = FastAPI()
    app.include_router(auth_router)
    app.dependency_overrides[get_db] = lambda: db
    return app


def _post(app, pfad, koerper, headers=None):
    """Eine echte HTTP-Anfrage durch die ASGI-Kette.

    Bewusst über `httpx.ASGITransport` statt über Starlettes `TestClient`: der
    ist in der hier festgelegten Starlette-Version 0.27 mit dem aktuellen
    `httpx` nicht mehr verträglich (`Client.__init__() got an unexpected
    keyword argument 'app'`). Der Transport kommt ohne diese Kopplung aus und
    braucht keine zusätzliche Abhängigkeit.
    """
    async def _lauf():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(pfad, json=koerper, headers=headers or {})
    return asyncio.run(_lauf())


def test_http_login_liefert_429_mit_retry_after():
    app = _app(_Db([_user("planer@example.com")]))
    daten = {"email": "planer@example.com", "password": "falsch"}
    for _ in range(LOGIN_KONTO_GRENZE):
        assert _post(app, "/api/v1/auth/login", daten).status_code == 401

    antwort = _post(app, "/api/v1/auth/login", daten)
    assert antwort.status_code == 429
    assert int(antwort.headers["Retry-After"]) > 0
    assert "example.com" not in antwort.text        # kein Hinweis auf das Konto


def test_http_ip_zaehler_liest_die_weiterleitungskette():
    app = _app(_Db([]))
    angreifer = {"X-Forwarded-For": "198.51.100.7"}
    for i in range(LOGIN_IP_GRENZE):
        antwort = _post(
            app, "/api/v1/auth/login",
            {"email": f"opfer{i}@example.com", "password": "falsch"}, angreifer,
        )
        assert antwort.status_code == 401
    assert _post(
        app, "/api/v1/auth/login",
        {"email": "noch-eins@example.com", "password": "falsch"}, angreifer,
    ).status_code == 429

    # Ein unbeteiligtes Büro an einer anderen Adresse bleibt handlungsfähig.
    assert _post(
        app, "/api/v1/auth/login",
        {"email": "fremd@example.com", "password": "falsch"},
        {"X-Forwarded-For": "203.0.113.1"},
    ).status_code == 401
