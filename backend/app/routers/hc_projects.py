from datetime import datetime
import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.audit import add_audit_event
from app.auth import get_current_user, ist_firma_admin
from app.database import get_db
from app.models.auth import User
from app.models.heizungscockpit import (
    HcAuditEvent,
    HcHeatingGroup,
    HcProject,
    HcProjectBaseData,
    HcProjectParameter,
)
from app.models.kv import Kostenschaetzung
from app.data.projektfreigaben import kostenschaetzung_freigabe, leere_kostenschaetzung_freigabe
from app.schemas.hc_schemas import (
    HeatingGroupOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectParameterUpdate,
    ProjectUpdate,
)
from app.calculations.heizgruppen import berechne_rl_gemischt, pruefe_plausibilitaet
from app.project_context import PARAMETER_BY_KEY, context_fuer_projekt

router = APIRouter(prefix="/api/v1/projects", tags=["Heizungscockpit – Projekte"])


def _group_to_out(g: HcHeatingGroup) -> HeatingGroupOut:
    warnings = pruefe_plausibilitaet(g.leistung_kw, g.vorlauf, g.ruecklauf, str(g.status))
    return HeatingGroupOut(
        id=g.id,
        name=g.name,
        typ=g.typ,
        leistung_kw=g.leistung_kw,
        vorlauf=g.vorlauf,
        ruecklauf=g.ruecklauf,
        volumenstrom_m3h=g.volumenstrom_m3h,
        status=g.status,
        sort_order=g.sort_order,
        template_id=g.template_id,
        warnings=warnings,
    )


def _build_detail(project: HcProject) -> ProjectDetailOut:
    groups_out = [_group_to_out(g) for g in project.heating_groups]
    aktive = [g for g in project.heating_groups if str(g.status) in ("aktiv", "HcGruppeStatus.aktiv")]
    summe_leistung = sum(g.leistung_kw for g in aktive)
    summe_v = sum(g.volumenstrom_m3h or 0 for g in aktive)
    return ProjectDetailOut(
        id=project.id,
        name=project.name,
        standort=project.standort,
        kunde=project.kunde,
        beschreibung=project.beschreibung,
        verantwortlicher_id=project.verantwortlicher_id,
        verantwortlicher_name=project.verantwortlicher_name,
        status=project.status,
        base_data=project.base_data,
        created_at=project.created_at,
        updated_at=project.updated_at,
        heating_groups=groups_out,
        summe_leistung_kw=round(summe_leistung, 3),
        summe_volumenstrom_m3h=round(summe_v, 4),
        summe_volumenstrom_lh=round(summe_v * 1000, 1),
        rl_gemischt=berechne_rl_gemischt(aktive),
    )


def _company_query(db: Session, user: User):
    """Alle Projekte der eigenen Firma – niemals Projekte anderer Firmen."""
    return db.query(HcProject).filter(HcProject.tenant_id == user.tenant_id)


def _get_company_project(db: Session, user: User, project_id: int) -> HcProject:
    project = _company_query(db, user).filter(HcProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return project


@router.get("", response_model=List[ProjectOut])
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        _company_query(db, user)
        .options(joinedload(HcProject.verantwortlicher))
        .order_by(HcProject.created_at.desc())
        .all()
    )


@router.post("", response_model=ProjectDetailOut, status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = HcProject(
        tenant_id=user.tenant_id,
        erstellt_von=user.id,
        verantwortlicher_id=user.id,
        name=body.name,
        standort=body.standort,
        kunde=body.kunde,
        beschreibung=body.beschreibung,
    )
    db.add(project)
    db.flush()

    bd_in = body.base_data
    bd = HcProjectBaseData(
        tenant_id=user.tenant_id,
        project_id=project.id,
        t_aussen=bd_in.t_aussen if bd_in else -8.0,
        t_innen=bd_in.t_innen if bd_in else 20.0,
        heizungssystem=bd_in.heizungssystem if bd_in else "gemischt",
        warmwasser_bedarf_kw=bd_in.warmwasser_bedarf_kw if bd_in else None,
        gebaeudekategorie=bd_in.gebaeudekategorie if bd_in else None,
        klimastation=bd_in.klimastation if bd_in else None,
        ebf_m2=bd_in.ebf_m2 if bd_in else None,
        anzahl_nutzungseinheiten=bd_in.anzahl_nutzungseinheiten if bd_in else None,
        projektart=bd_in.projektart if bd_in else None,
        region=bd_in.region if bd_in else None,
        zertifizierung=bd_in.zertifizierung if bd_in else None,
    )
    db.add(bd)
    add_audit_event(
        db,
        user=user,
        action="projekt_erstellt",
        project_id=project.id,
        entity_type="projekt",
        entity_id=project.id,
        details={"projekt": project.name},
    )
    db.commit()
    db.refresh(project)
    return _build_detail(project)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _build_detail(_get_company_project(db, user, project_id))


@router.get("/{project_id}/context")
def get_project_context(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Die eine Projektwahrheit (§24): Grunddaten + Schema-Mengen + Ergänzungen
    je Parameter zu effektivem Wert + Herkunft + Status zusammengeführt. Reines
    Lesemodell — hier wird nichts gespeichert."""
    project = _get_company_project(db, user, project_id)
    return context_fuer_projekt(db, project, user.tenant_id)


@router.put("/{project_id}/parameters/{param_key}")
def set_project_parameter(
    project_id: int,
    param_key: str,
    body: ProjectParameterUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ergänzung (external_value) oder Übersteuerung (manual_override) eines
    Parameters setzen — Quelle C / §6. Herkunft (wer, wann) wird protokolliert."""
    if param_key not in PARAMETER_BY_KEY:
        raise HTTPException(status_code=422, detail=f"Unbekannter Parameter: {param_key}")
    project = _get_company_project(db, user, project_id)

    row = (
        db.query(HcProjectParameter)
        .filter(
            HcProjectParameter.project_id == project_id,
            HcProjectParameter.tenant_id == user.tenant_id,
            HcProjectParameter.param_key == param_key,
        )
        .first()
    )
    if not row:
        row = HcProjectParameter(
            tenant_id=user.tenant_id, project_id=project_id, param_key=param_key
        )
        db.add(row)

    before = {
        "external_value": row.external_value,
        "manual_override": row.manual_override,
    }
    row.external_value = body.external_value
    row.manual_override = body.manual_override
    row.quelle_notiz = body.quelle_notiz
    row.confidence = body.confidence
    row.notiz = body.notiz
    row.updated_at = datetime.utcnow()
    row.updated_by = user.id
    row.updated_by_name = user.name or user.email

    add_audit_event(
        db,
        user=user,
        action="parameter_ergaenzt",
        project_id=project.id,
        entity_type="parameter",
        entity_id=None,
        details={
            "parameter": param_key,
            "vorher": before,
            "nachher": {
                "external_value": row.external_value,
                "manual_override": row.manual_override,
            },
        },
    )
    db.commit()
    return context_fuer_projekt(db, project, user.tenant_id)


@router.get("/{project_id}/freigaben")
def get_project_freigaben(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Leichte Statusübersicht; lädt bewusst weder Ergebnis noch Referenzdetails."""
    _get_company_project(db, user, project_id)
    ks = db.query(Kostenschaetzung).filter(
        Kostenschaetzung.project_id == project_id,
        Kostenschaetzung.tenant_id == user.tenant_id,
    ).first()
    item = kostenschaetzung_freigabe(ks.inputs_json, ks.updated_at) if ks else leere_kostenschaetzung_freigabe()
    return {
        "freigaben": [item],
        "anzahl_freigegeben": int(item["freigegeben"]),
        "anzahl_module": 1,
    }


@router.get("/{project_id}/protokoll")
def get_project_audit(
    project_id: int,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Projektaktivitäten werden bewusst erst beim Öffnen des Protokolls geladen."""
    _get_company_project(db, user, project_id)
    rows = (
        db.query(HcAuditEvent)
        .filter(
            HcAuditEvent.project_id == project_id,
            HcAuditEvent.tenant_id == user.tenant_id,
        )
        .order_by(HcAuditEvent.created_at.desc(), HcAuditEvent.id.desc())
        .limit(max(1, min(limit, 250)))
        .all()
    )
    result = []
    for row in rows:
        try:
            details = json.loads(row.details_json or "{}")
        except (TypeError, ValueError):
            details = {}
        result.append({
            "id": row.id,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "action": row.action,
            "actor_id": row.actor_id,
            "actor_name": row.actor_name,
            "details": details if isinstance(details, dict) else {},
            "created_at": row.created_at,
        })
    return result


@router.patch("/{project_id}", response_model=ProjectDetailOut)
def update_project(project_id: int, body: ProjectUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_company_project(db, user, project_id)

    before = {}
    after = {}
    for field in ("name", "standort", "kunde", "beschreibung", "status"):
        val = getattr(body, field, None)
        if val is not None:
            old = getattr(project, field)
            old_value = old.value if hasattr(old, "value") else old
            new_value = val.value if hasattr(val, "value") else val
            if old_value != new_value:
                before[field] = old_value
                after[field] = new_value
            setattr(project, field, val)
    project.updated_at = datetime.utcnow()

    if body.base_data:
        if not project.base_data:
            bd = HcProjectBaseData(tenant_id=user.tenant_id, project_id=project.id)
            db.add(bd)
            db.flush()
        for field in (
            "t_aussen", "t_innen", "heizungssystem", "warmwasser_bedarf_kw",
            "gebaeudekategorie", "klimastation",
            "ebf_m2", "anzahl_nutzungseinheiten", "projektart", "region", "zertifizierung",
        ):
            val = getattr(body.base_data, field, None)
            if val is not None:
                old = getattr(project.base_data, field)
                old_value = old.value if hasattr(old, "value") else old
                new_value = val.value if hasattr(val, "value") else val
                if old_value != new_value:
                    before[f"base_data.{field}"] = old_value
                    after[f"base_data.{field}"] = new_value
                setattr(project.base_data, field, val)
        project.base_data.updated_at = datetime.utcnow()

    if after:
        add_audit_event(
            db,
            user=user,
            action="projekt_aktualisiert",
            project_id=project.id,
            entity_type="projekt",
            entity_id=project.id,
            details={"projekt": project.name, "vorher": before, "nachher": after},
        )
    db.commit()
    db.refresh(project)
    return _build_detail(project)


@router.delete("/{project_id}", status_code=204)
def archive_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_company_project(db, user, project_id)
    before = project.status.value if hasattr(project.status, "value") else str(project.status)
    project.status = "archiviert"
    project.updated_at = datetime.utcnow()
    add_audit_event(
        db,
        user=user,
        action="projekt_archiviert",
        project_id=project.id,
        entity_type="projekt",
        entity_id=project.id,
        details={"projekt": project.name, "vorher": before, "nachher": "archiviert"},
    )
    db.commit()


@router.delete("/archiviert/alle")
def delete_all_archived(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Firmenadmin löscht alle archivierten Projekte der eigenen Firma."""
    if not ist_firma_admin(user):
        raise HTTPException(status_code=403, detail="Nur Firmenadmins dürfen Projekte endgültig löschen")
    archivierte = _company_query(db, user).filter(HcProject.status == "archiviert").all()
    ids = [p.id for p in archivierte]
    if ids:
        db.query(Kostenschaetzung).filter(Kostenschaetzung.project_id.in_(ids)).delete(synchronize_session=False)
        add_audit_event(
            db,
            user=user,
            action="archivierte_projekte_geloescht",
            entity_type="projekt",
            details={"anzahl": len(ids), "projekte": [{"id": p.id, "name": p.name} for p in archivierte]},
        )
        for p in archivierte:
            db.delete(p)
        db.commit()
    return {"geloescht": len(ids)}


@router.delete("/{project_id}/endgueltig", status_code=204)
def delete_project_permanent(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Löscht ein Projekt wirklich (nicht nur archivieren). Eine evtl.
    verknüpfte Kostenschätzung wird zuerst gelöscht — dafür gibt es keine
    ORM-Kaskade (Kostenschaetzung.project_id ist ein reiner FK ohne
    relationship auf HcProject)."""
    if not ist_firma_admin(user):
        raise HTTPException(status_code=403, detail="Nur Firmenadmins dürfen Projekte endgültig löschen")
    project = _get_company_project(db, user, project_id)
    add_audit_event(
        db,
        user=user,
        action="projekt_endgueltig_geloescht",
        project_id=project.id,
        entity_type="projekt",
        entity_id=project.id,
        details={"projekt": project.name},
    )
    db.query(Kostenschaetzung).filter(Kostenschaetzung.project_id == project_id).delete()
    db.delete(project)
    db.commit()
