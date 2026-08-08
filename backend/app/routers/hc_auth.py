"""Auth-Router: Registrierung (mit Admin-Freischaltung), Login (JWT), eigenes
Profil (ansehen + ändern), Admin-Benutzerverwaltung. Alle Endpunkte unter
/api/v1/auth/.

Registrierung trennt Firma vs. Einzelperson (tenant_id): eine Einzelperson
bekommt eine eigene, private Firma (niemand sonst sieht ihre Auswertungsdaten);
bei "Firma" wird nach Name gesucht — existiert sie, tritt man bei, sonst wird
sie neu angelegt. Plattformadmins verwalten Mandanten; Firmenadmins verwalten
Mitglieder und Projekte ausschliesslich innerhalb der eigenen Firma.
"""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.audit import add_audit_event
from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_active_company,
    require_admin,
    revoke_user_sessions,
    verify_password,
)
from app.database import get_db
from app.rate_limit import (
    alles_aufraeumen,
    client_ip,
    login_ip_sperre,
    login_konto_sperre,
    register_ip_sperre,
    sperrhinweis,
)
from app.models.auth import Firma, Role, User
from app.models.grobkostenschaetzung import Korrekturfaktor
from app.models.heizungscockpit import HcProject

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    konto_typ: Literal["einzelperson", "firma"] = "einzelperson"
    firmenname: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: Optional[str]
    role: Role
    firma_role: Literal["mitglied", "admin"] = "mitglied"
    firma_admin_beantragt_at: Optional[datetime] = None
    firma_admin_bestaetigt_at: Optional[datetime] = None
    firma_admin_bestaetigt_von: Optional[int] = None
    is_verified: bool
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    firma_name: Optional[str] = None
    firma_active: bool = True
    abo_plan: Optional[str] = None
    model_config = {"from_attributes": True}


def _user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.firma_name = user.firma.name if user.firma else None
    out.abo_plan = user.firma.abo_plan if user.firma else None
    out.firma_active = user.firma.is_active if user.firma else True
    return out


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserPatch(BaseModel):
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    role: Optional[Role] = None
    firma_role: Optional[Literal["mitglied", "admin"]] = None


class MePatch(BaseModel):
    name: Optional[str] = None
    aktuelles_passwort: Optional[str] = None
    neues_passwort: Optional[str] = None


class AdminFirmaPatch(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    abo_plan: Optional[str] = None


def _seed_korrekturfaktoren(db: Session, tenant_id: int):
    """Jede Firma braucht ihre eigenen Korrekturfaktoren (Grobkostenschätzung,
    CLAUDE.md Abschnitt 4) — der Start-Seed in main.py deckt nur tenant_id=1
    (SIREGO) ab, ohne das hier blieben neue Firmen ohne Sanierung/Weiterbetrieb/
    Etappierung-Werte."""
    db.add_all([
        Korrekturfaktor(tenant_id=tenant_id, name="Sanierung", faktor=1.20, aktiv=True),
        Korrekturfaktor(tenant_id=tenant_id, name="Weiterbetrieb", faktor=1.10, aktiv=True),
        Korrekturfaktor(tenant_id=tenant_id, name="Etappierung", faktor=1.08, aktiv=True),
    ])


def _firma_fuer_registrierung(body: RegisterIn, db: Session) -> Firma:
    if body.konto_typ == "einzelperson":
        firma = Firma(name=f"{(body.name or body.email).strip()} (Einzelperson)")
        db.add(firma)
        db.flush()
        _seed_korrekturfaktoren(db, firma.id)
        return firma

    name_norm = (body.firmenname or "").strip()
    if not name_norm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte einen Firmennamen angeben.")
    firma = db.query(Firma).filter(func.lower(Firma.name) == name_norm.lower()).first()
    if not firma:
        firma = Firma(name=name_norm)
        db.add(firma)
        db.flush()
        _seed_korrekturfaktoren(db, firma.id)
    return firma


def _absender(request: Request | None) -> str:
    """Die Adresse, an der die IP-Zähler hängen."""
    if request is None:
        return "unbekannt"
    return client_ip(request.headers.get("x-forwarded-for"), getattr(request.client, "host", None))


def _sperre_pruefen(*zaehler) -> None:
    """Ist einer der Zähler gesperrt, endet der Aufruf hier mit 429.

    Geprüft wird VOR jeder Datenbankabfrage und vor `verify_password`. Sonst
    trüge der Server die Kosten des Angriffs weiter, obwohl er ihn schon
    abgelehnt hat.
    """
    rest = max((sperre.restsperre_s(schluessel) for sperre, schluessel in zaehler), default=0.0)
    if rest <= 0:
        return
    # `Retry-After` ist die maschinenlesbare Hälfte derselben Aussage; ohne sie
    # weiss ein Client nicht, wann er es wieder versuchen darf.
    raise HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        sperrhinweis(rest),
        headers={"Retry-After": str(max(1, int(rest) + 1))},
    )


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db), request: Request = None):
    # `request` steht hinter `db` und trägt einen Vorgabewert, damit bestehende
    # direkte Aufrufe der Funktion (so testet dieses Projekt) weiter stimmen.
    # FastAPI erkennt den Typ und reicht die Anfrage unabhängig von der
    # Reihenfolge durch — `test_http_*` belegt das.
    absender = _absender(request)
    _sperre_pruefen((register_ip_sperre, absender))
    # Aufräumen hängt an den öffentlichen Routen: nur sie legen Schlüssel an,
    # und sie laufen selten genug für einen Durchgang je Aufruf.
    alles_aufraeumen()
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        register_ip_sperre.fehlversuch(absender)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Diese E-Mail ist bereits registriert.")
    firma = _firma_fuer_registrierung(body, db)
    user = User(
        tenant_id=firma.id,
        email=email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=Role.user,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    return {"ok": True, "message": "Anfrage gesendet. Ein Admin schaltet dein Konto frei."}


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db), request: Request = None):
    email = body.email.lower().strip()
    absender = _absender(request)
    _sperre_pruefen((login_konto_sperre, email), (login_ip_sperre, absender))
    alles_aufraeumen()

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        # Beide Zähler laufen mit: der Kontozähler stoppt das Durchprobieren
        # EINES Passworts, der IP-Zähler das Durchprobieren vieler Konten.
        login_konto_sperre.fehlversuch(email)
        login_ip_sperre.fehlversuch(absender)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-Mail oder Passwort falsch.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto ist deaktiviert.")
    require_active_company(user)
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto noch nicht freigeschaltet — bitte auf die Freischaltung warten.")
    # Nur der Kontozähler wird zurückgesetzt. Bliebe auch der IP-Zähler stehen,
    # könnte jemand mit einem einzigen gültigen Konto seine Adresse nach jedem
    # Block wieder freikaufen.
    login_konto_sperre.zuruecksetzen(email)
    user.last_login_at = datetime.utcnow()
    db.commit()
    token = create_access_token(user.id, user.session_version)
    return TokenOut(access_token=token, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: MePatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    changed = {}
    if body.name is not None:
        if body.name != user.name:
            changed["name"] = {"vorher": user.name, "nachher": body.name}
        user.name = body.name
    if body.neues_passwort:
        if not body.aktuelles_passwort or not verify_password(body.aktuelles_passwort, user.password_hash):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aktuelles Passwort ist falsch.")
        user.password_hash = hash_password(body.neues_passwort)
        revoke_user_sessions(user)
        changed["passwort"] = {"geaendert": True}
    if changed:
        add_audit_event(
            db,
            user=user,
            action="eigenes_profil_aktualisiert",
            entity_type="benutzer",
            entity_id=user.id,
            details={"aenderungen": changed},
        )
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/firma-admin/anfragen", response_model=UserOut)
def request_firma_admin(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Firmenmitglied beantragt die Firmenadmin-Rolle.

    Die Rolle wird nicht automatisch vergeben. Nur der Plattformadmin kann sie
    über die Benutzerverwaltung bestätigen.
    """
    if user.role == Role.admin or user.firma_role == "admin":
        raise HTTPException(status.HTTP_409_CONFLICT, "Du besitzt bereits Adminrechte.")
    if user.firma and user.firma.name.endswith("(Einzelperson)"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ein Einzelkonto benötigt keine Firmenadmin-Rolle.")
    if user.firma_admin_beantragt_at is None:
        user.firma_admin_beantragt_at = datetime.utcnow()
        add_audit_event(
            db,
            user=user,
            action="firmenadmin_beantragt",
            entity_type="benutzer",
            entity_id=user.id,
            details={"benutzer": user.name or user.email},
        )
        db.commit()
        db.refresh(user)
    return _user_out(user)


@router.get("/admin/users", response_model=List[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).options(joinedload(User.firma)).order_by(User.created_at.desc()).all()
    return [_user_out(u) for u in users]


@router.get("/admin/overview")
def admin_overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Schlanke Betreiberübersicht ohne Laden von Projekt- oder Ergebnis-JSON."""
    firmen = db.query(Firma).order_by(Firma.created_at.desc()).all()
    user_counts = dict(
        db.query(User.tenant_id, func.count(User.id))
        .group_by(User.tenant_id)
        .all()
    )
    active_counts = dict(
        db.query(User.tenant_id, func.count(User.id))
        .filter(User.is_active.is_(True), User.is_verified.is_(True))
        .group_by(User.tenant_id)
        .all()
    )
    pending_counts = dict(
        db.query(User.tenant_id, func.count(User.id))
        .filter(User.is_verified.is_(False))
        .group_by(User.tenant_id)
        .all()
    )
    company_admin_counts = dict(
        db.query(User.tenant_id, func.count(User.id))
        .filter(User.firma_role == "admin")
        .group_by(User.tenant_id)
        .all()
    )
    project_counts = dict(
        db.query(HcProject.tenant_id, func.count(HcProject.id))
        .group_by(HcProject.tenant_id)
        .all()
    )
    companies = [{
        "id": firma.id,
        "name": firma.name,
        "is_active": firma.is_active,
        "abo_plan": firma.abo_plan,
        "created_at": firma.created_at,
        "user_count": user_counts.get(firma.id, 0),
        "active_user_count": active_counts.get(firma.id, 0),
        "pending_user_count": pending_counts.get(firma.id, 0),
        "firma_admin_count": company_admin_counts.get(firma.id, 0),
        "project_count": project_counts.get(firma.id, 0),
    } for firma in firmen]
    return {
        "kennzahlen": {
            "firmen": len(companies),
            "aktive_firmen": sum(1 for item in companies if item["is_active"]),
            "benutzer": sum(user_counts.values()),
            "offene_registrierungen": sum(pending_counts.values()),
            "offene_firmenadmin_antraege": db.query(User).filter(
                User.firma_admin_beantragt_at.is_not(None),
                User.firma_role != "admin",
            ).count(),
            "projekte": sum(project_counts.values()),
        },
        "firmen": companies,
    }


@router.patch("/admin/firmen/{firma_id}")
def update_firma(
    firma_id: int,
    body: AdminFirmaPatch,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    firma = db.query(Firma).filter(Firma.id == firma_id).first()
    if not firma:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Firma nicht gefunden")
    before = {"name": firma.name, "is_active": firma.is_active, "abo_plan": firma.abo_plan}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Firmenname darf nicht leer sein")
        firma.name = name
    if body.is_active is not None:
        firma.is_active = body.is_active
    if body.abo_plan is not None:
        firma.abo_plan = body.abo_plan.strip() or "kostenlos"
    after = {"name": firma.name, "is_active": firma.is_active, "abo_plan": firma.abo_plan}
    add_audit_event(
        db,
        user=admin,
        action="firma_aktualisiert",
        entity_type="firma",
        entity_id=firma.id,
        tenant_id=firma.id,
        details={"vorher": before, "nachher": after},
    )
    db.commit()
    return after | {"id": firma.id}


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Benutzer nicht gefunden")
    before = {
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "role": user.role.value,
        "firma_role": user.firma_role,
    }
    sessions_widerrufen = (
        (body.is_active is False and user.is_active)
        or (body.is_verified is False and user.is_verified)
    )
    for field in ("is_verified", "is_active", "role"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(user, field, val)
    if sessions_widerrufen:
        revoke_user_sessions(user)
    if body.firma_role is not None:
        user.firma_role = body.firma_role
        if body.firma_role == "admin":
            user.firma_admin_bestaetigt_at = datetime.utcnow()
            user.firma_admin_bestaetigt_von = admin.id
        else:
            user.firma_admin_beantragt_at = None
            user.firma_admin_bestaetigt_at = None
            user.firma_admin_bestaetigt_von = None
    after = {
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "role": user.role.value,
        "firma_role": user.firma_role,
    }
    add_audit_event(
        db,
        user=admin,
        action="plattformadmin_benutzer_aktualisiert",
        entity_type="benutzer",
        entity_id=user.id,
        tenant_id=user.tenant_id,
        details={"benutzer_id": user.id, "benutzer": user.name or user.email, "vorher": before, "nachher": after},
    )
    db.commit()
    db.refresh(user)
    return _user_out(user)
