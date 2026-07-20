"""Grobkostenschätzung (BKP) — rechnet auf den Referenzprojekten der Auswertung
(models/kv.py: RefProjekt/RefKostenzeile). Es gibt bewusst keine eigene
Referenzdatenbank; die Schätzung läuft im Projekt und listet die Kosten auf
Ebene der BKP-Einzelpositionen auf (wie ein Norm-Leistungsverzeichnis).

- POST /schaetzen              → nur rechnen (Live-Vorschau, ohne Speichern)
- GET/PUT /projekt/{id}        → gespeicherte Schätzung laden / rechnen+speichern
- GET/PATCH /korrekturfaktoren → Sanierung/Weiterbetrieb/Etappierung (firmenweit)
- POST/DELETE /beispieldaten   → ~80 Demo-Referenzprojekte in der Auswertung

Zielprojekt und Referenzprojekte werden gleich beschrieben: Wärmeerzeuger- und
Wärmeabgabe-Auswahl (Mehrfach) → Erzeuger-Signatur / Wärmepumpen-Art /
Erdsonden / dominanter Abgabetyp über dieselben Hilfsfunktionen. Die Kostenzeilen der Referenzen sind
bereits auf Positions-Ebene erfasst (RefKostenzeile.bkp_nr = z.B. «243.1»), der
Adapter reicht sie brutto und netto durch.
"""
import json
import re
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.calculations.grobkostenschaetzung import BKP_GRUPPEN_ALLE, berechne_grobkostenschaetzung
from app.calculations.kostenschaetzung import netto_aus_brutto
from app.data.beispiel_referenzprojekte import BEISPIEL_PREFIX, BEISPIEL_PROJEKTE
from app.data.bkp_positionen import BKP_POSITIONEN, abgabe_klassen_von
from app.data.waermeerzeuger import erzeuger_signatur_von
from app.database import get_db
from app.export.grobkostenschaetzung import (
    erzeuge_grobkostenschaetzung_excel,
    erzeuge_grobkostenschaetzung_pdf,
)
from app.models.auth import User
from app.models.grobkostenschaetzung import Korrekturfaktor
from app.models.heizungscockpit import HcProject
from app.models.kv import (
    BauindexEintrag, Kostenschaetzung, KostenschaetzungVersion,
    RefKostenzeile, RefProjekt, RefProjektGewerk,
)

router = APIRouter(prefix="/api/v1/grobkostenschaetzung", tags=["Grobkostenschätzung (BKP)"])


class SchaetzungIn(BaseModel):
    """Das Zielprojekt, für das geschätzt wird — beschrieben wie ein
    Auswertungs-Referenzprojekt (Wärmeerzeuger/-abgabe als Mehrfach-Auswahl)."""
    ebf_m2: float
    leistung_kw: float
    nutzung: str                       # wie Auswertung «Gebäudetyp» (MFH, EFH, Büro, …)
    projektart: str                    # wie Auswertung (Neubau, Sanierung, …)
    zertifizierung: Optional[str] = None  # Minergie usw. — Ähnlichkeits-Faktor (kennt man beim Schätzen)
    anzahl_ne: int
    waermeerzeuger: List[str] = []      # Mehrfach-Auswahl → Wärmepumpen-Art + Erdsonden abgeleitet
    waermeabgabe: List[str] = []        # Mehrfach-Auswahl → dominanter Abgabetyp abgeleitet
    bww_bei_heizung: Optional[bool] = None
    baupreisindex_beruecksichtigen: bool = False
    etappierung: bool = False
    weiterbetrieb_umbau: bool = False
    # Bekannte Mengen (optional) — fliessen direkt als Positions-Bezugsgrössen ein
    rohrmeter: Optional[float] = None
    bohrmeter: Optional[float] = None
    hk_anzahl: Optional[int] = None
    # Redaktionelle Fertigstellung der Schätzung. Je Variante getrennt, damit
    # eine manuelle Nettozahl nicht versehentlich auch als Bruttozahl erscheint.
    manuelle_betraege: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    # Redaktionelle Dokumentation je Variante/BKP. Bearbeiter und Zeitpunkt
    # werden serverseitig gesetzt und können vom Client nicht gefälscht werden.
    manuelle_notizen: Dict[str, Dict[str, dict]] = Field(default_factory=dict)
    ausgeschlossene_positionen: Dict[str, Dict[str, dict]] = Field(default_factory=dict)
    ignorierte_warnungen: List[str] = Field(default_factory=list)


class KorrekturfaktorPatch(BaseModel):
    faktor: Optional[float] = None
    aktiv: Optional[bool] = None


class SchaetzungStatusPatch(BaseModel):
    status: str
    variante: str = "netto"


_GESPERRTE_STATUS = {"freigegeben", "exportiert"}


def _status_fuer_resultat(result: dict, variante: str = "netto") -> str:
    """Vollständigkeit gilt für die Variante, die fachlich abgeschlossen wird.
    Ein fehlender Brutto-Wert darf eine vollständige Netto-Schätzung nicht blockieren."""
    return "unvollstaendig" if (result.get(variante) or {}).get("ist_unvollstaendig") else "entwurf"


def _trenne_referenzdetails(result: dict) -> tuple[dict, dict]:
    """Entfernt grosse Herkunftslisten aus dem Lade-JSON und speichert sie separat."""
    details = {}
    for variante in ("brutto", "netto"):
        details[variante] = {}
        for gruppe in (result.get(variante) or {}).get("gruppen") or []:
            for position in gruppe.get("positionen") or []:
                details[variante][position.get("bkp_nr")] = position.pop("herkunft", [])
    return result, details


def _lade_speicherinhalt(ks: Kostenschaetzung) -> tuple[dict, dict, dict]:
    """Workflow und grosse Details liegen rückwärtskompatibel im bestehenden
    inputs_json. Dadurch benötigt die bestehende Tabelle keine Schemaänderung."""
    inputs = json.loads(ks.inputs_json or "{}")
    workflow = inputs.pop("_workflow", {}) or {}
    details = inputs.pop("_referenzdetails", {}) or {}
    return inputs, workflow, details


def _speichere_inputs(ks: Kostenschaetzung, inputs: dict, workflow: dict, details: dict) -> None:
    ks.inputs_json = json.dumps({
        **inputs, "_workflow": workflow, "_referenzdetails": details,
    })


def _referenzdetails(ks: Kostenschaetzung, result: Optional[dict] = None) -> dict:
    _, _, details = _lade_speicherinhalt(ks)
    if details:
        return details
    # Rückwärtskompatibilität für bereits gespeicherte Ergebnisse, bei denen
    # die Herkunft noch direkt in jeder Position lag.
    result = result or json.loads(ks.result_json or "{}")
    details = {"brutto": {}, "netto": {}}
    for variante in ("brutto", "netto"):
        for gruppe in (result.get(variante) or {}).get("gruppen") or []:
            for position in gruppe.get("positionen") or []:
                details[variante][position.get("bkp_nr")] = position.get("herkunft") or []
    return details


def _ohne_referenzdetails(result: dict) -> dict:
    for variante in ("brutto", "netto"):
        for gruppe in (result.get(variante) or {}).get("gruppen") or []:
            for position in gruppe.get("positionen") or []:
                position.pop("herkunft", None)
    return result


def _mit_referenzdetails(result: dict, details: dict) -> dict:
    for variante in ("brutto", "netto"):
        for gruppe in (result.get(variante) or {}).get("gruppen") or []:
            for position in gruppe.get("positionen") or []:
                position["herkunft"] = (details.get(variante) or {}).get(position.get("bkp_nr"), [])
    return result


def _dokumentiere_manuelle_werte(inputs: dict, bisherige_inputs: dict, user: User) -> None:
    betraege = inputs.get("manuelle_betraege") or {}
    notizen = inputs.get("manuelle_notizen") or {}
    alte_betraege = bisherige_inputs.get("manuelle_betraege") or {}
    alte_notizen = bisherige_inputs.get("manuelle_notizen") or {}
    dokumentiert = {}
    for variante in ("brutto", "netto"):
        dokumentiert[variante] = {}
        for bkp_nr, betrag in (betraege.get(variante) or {}).items():
            notiz = (notizen.get(variante) or {}).get(bkp_nr) or {}
            fachangaben = {
                "begruendung": (notiz.get("begruendung") or "").strip(),
                "quelle": (notiz.get("quelle") or "").strip(),
            }
            alt = (alte_notizen.get(variante) or {}).get(bkp_nr) or {}
            unveraendert = (
                (alte_betraege.get(variante) or {}).get(bkp_nr) == betrag
                and (alt.get("begruendung") or "") == fachangaben["begruendung"]
                and (alt.get("quelle") or "") == fachangaben["quelle"]
            )
            dokumentiert[variante][bkp_nr] = {
                **fachangaben,
                "bearbeiter": alt.get("bearbeiter") if unveraendert else (user.name or user.email),
                "geaendert_at": alt.get("geaendert_at") if unveraendert else datetime.utcnow().isoformat(),
            }
    inputs["manuelle_notizen"] = dokumentiert


# ── Auswahl-Listen → abgeleitete Merkmale (Ziel wie Referenz beschrieben) ────

def _wp_typ_von(waermeerzeuger: list) -> Optional[str]:
    erzeuger = set(waermeerzeuger or [])
    if "Erdsonden-WP" in erzeuger:
        return "sole"
    if "Wasser/Wasser-WP" in erzeuger:
        return "wasser"
    if "Luft/Wasser-WP" in erzeuger:
        return "luft"
    return None  # Gas/Öl/Fernwärme/… — fällt beim Wärmepumpen-Hard-Filter raus


def _hat_erdsonden(waermeerzeuger: list) -> bool:
    return any("erdsonde" in (e or "").lower() for e in (waermeerzeuger or []))


_FLAECHIG = {"FBH", "TABS", "Wandheizung", "Deckenstrahlplatten"}
_KOERPER = {"Heizkörper", "Konvektoren"}


def _abgabe_dominant_von(waermeabgabe: list) -> Optional[str]:
    abgabe = set(waermeabgabe or [])
    flaechig = bool(abgabe & _FLAECHIG)
    koerper = bool(abgabe & _KOERPER)
    if flaechig and koerper:
        return "gemischt"
    if flaechig:
        return "FBH"
    if koerper:
        return "HK"
    if "Lufterhitzer" in abgabe:
        return "Luft"
    return None


# ── Adapter: Auswertungs-Referenzprojekt → Berechnungskern-Dict ─────────────

def _positionen(r: RefProjekt, netto: bool) -> dict:
    """Heizungs-Kostenzeilen als {BKP-Positionsnummer: Betrag}. Netto nach dem
    eigenen Rabatt/Skonto der Referenz (wie überall im KV-Tool)."""
    g = next((x for x in r.gewerke if x.gewerk == "heizung"), None)
    faktor = netto_aus_brutto(1.0, g.rabatt_pct if g else 0.0, g.skonto_pct if g else 0.0) if netto else 1.0
    out = {}
    for z in r.kostenzeilen:
        if z.gewerk != "heizung" or not z.betrag_chf:
            continue
        if (z.bkp_nr or "").split(".")[0] in BKP_GRUPPEN_ALLE:
            out[z.bkp_nr] = out.get(z.bkp_nr, 0.0) + z.betrag_chf * faktor
    return out


def _ref_to_calc_dict(r: RefProjekt) -> dict:
    waermeerzeuger = list(r.waermeerzeuger or [])
    return {
        "id": r.id, "name": r.name,
        "ebf_m2": r.ebf_m2, "leistung_kw": r.heizleistung_kw,
        "nutzung": r.gebaeudetyp, "projektart": r.projektart,
        "zertifizierung": r.zertifizierung,
        "waermeerzeuger": waermeerzeuger,
        "erzeuger_signatur": erzeuger_signatur_von(waermeerzeuger),
        "wp_typ": _wp_typ_von(waermeerzeuger),
        "abgabe_dominant": _abgabe_dominant_von(r.waermeabgabe),
        "abgabe_klassen": abgabe_klassen_von(r.waermeabgabe),  # welche Abgabe-Kosten die Referenz liefern darf
        "hat_erdsonden": _hat_erdsonden(r.waermeerzeuger),
        "anzahl_ne": r.anzahl_einheiten,
        "bww_bei_heizung": r.bww_bei_heizung,
        "datum_abrechnung": r.datum,
        "rohrmeter": r.laufmeter_rohre_heizung, "bohrmeter": r.bohrmeter, "hk_anzahl": r.anzahl_heizkoerper,
        "positionen_brutto": _positionen(r, netto=False),
        "positionen_netto": _positionen(r, netto=True),
    }


def _berechne(body: SchaetzungIn, user: User, db: Session) -> tuple:
    refs = [
        _ref_to_calc_dict(r)
        for r in db.query(RefProjekt).filter(RefProjekt.tenant_id == user.tenant_id).all()
    ]
    faktoren = [
        {"name": f.name, "faktor": f.faktor, "aktiv": f.aktiv}
        for f in db.query(Korrekturfaktor)
        .filter(Korrekturfaktor.tenant_id == user.tenant_id, Korrekturfaktor.aktiv == True)  # noqa: E712
        .all()
    ]
    bauindex = [
        {"periode": e.periode, "wert": e.wert}
        for e in db.query(BauindexEintrag).filter(BauindexEintrag.tenant_id == user.tenant_id).all()
    ]
    ziel = body.model_dump(mode="json")
    ziel["erzeuger_signatur"] = erzeuger_signatur_von(body.waermeerzeuger)
    ziel["wp_typ"] = _wp_typ_von(body.waermeerzeuger)
    ziel["hat_erdsonden"] = _hat_erdsonden(body.waermeerzeuger)
    ziel["abgabe_dominant"] = _abgabe_dominant_von(body.waermeabgabe)

    def rechne(variante_feld: str) -> dict:
        referenzen = [{**m, "positionen": m[variante_feld]} for m in refs]
        variante = "brutto" if variante_feld == "positionen_brutto" else "netto"
        return berechne_grobkostenschaetzung(
            ziel, referenzen, faktoren, bauindex_eintraege=bauindex,
            manuelle_betraege=body.manuelle_betraege.get(variante, {}),
            ausgeschlossene_positionen=set(body.ausgeschlossene_positionen.get(variante, {})),
        )

    result = {"brutto": rechne("positionen_brutto"), "netto": rechne("positionen_netto")}
    # date-Objekte (Abrechnungsdaten der Referenzen) JSON-tauglich machen —
    # nötig fürs Speichern in der Kostenschaetzung-Tabelle (json.dumps).
    return ziel, jsonable_encoder(result)


# ── Schätzung ────────────────────────────────────────────────────────────────

@router.post("/schaetzen")
def schaetzen(body: SchaetzungIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, result = _berechne(body, user, db)
    return result


@router.get("/projekt/{project_id}")
def get_saved(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ks = (
        db.query(Kostenschaetzung)
        .filter(Kostenschaetzung.project_id == project_id, Kostenschaetzung.tenant_id == user.tenant_id)
        .first()
    )
    if not ks:
        return {"inputs": None, "result": None, "status": "entwurf", "freigegeben_at": None, "version_nr": 0}
    inputs, workflow, _ = _lade_speicherinhalt(ks)
    result = json.loads(ks.result_json or "{}")
    # Früher gespeicherte Schätzungen (anderes Format) nicht als neue anzeigen —
    # das neue Format hat den Brutto/Netto-Umschalter (Schlüssel "brutto").
    if "brutto" not in result:
        return {"inputs": None, "result": None, "status": "entwurf", "freigegeben_at": None, "version_nr": 0}
    return {
        "inputs": inputs, "result": _ohne_referenzdetails(result),
        "status": workflow.get("status") or _status_fuer_resultat(result),
        "freigegeben_at": workflow.get("freigegeben_at"),
        "version_nr": workflow.get("version_nr") or 0,
        "workflow_variante": workflow.get("variante") or "netto",
    }


@router.put("/projekt/{project_id}")
def compute_and_save(project_id: int, body: SchaetzungIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = (
        db.query(HcProject)
        .filter(HcProject.id == project_id, HcProject.tenant_id == user.tenant_id)
        .first()
    )
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")
    ks = db.query(Kostenschaetzung).filter(
        Kostenschaetzung.project_id == project_id,
        Kostenschaetzung.tenant_id == user.tenant_id,
    ).first()
    bisherige_inputs, workflow, _ = _lade_speicherinhalt(ks) if ks else ({}, {}, {})
    if ks and workflow.get("status") in _GESPERRTE_STATUS:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Die Kostenschätzung ist freigegeben. Vor einer Neuberechnung zuerst entsperren.",
        )
    inputs, result = _berechne(body, user, db)
    _dokumentiere_manuelle_werte(inputs, bisherige_inputs, user)
    result, details = _trenne_referenzdetails(result)
    if not ks:
        ks = Kostenschaetzung(tenant_id=user.tenant_id, project_id=project_id)
        db.add(ks)
    ks.result_json = json.dumps(result)
    workflow = {
        "status": _status_fuer_resultat(result, workflow.get("variante") or "netto"), "freigegeben_at": None,
        "freigegeben_von": None, "version_nr": workflow.get("version_nr") or 0,
        "variante": workflow.get("variante") or "netto",
    }
    _speichere_inputs(ks, inputs, workflow, details)
    db.commit()
    return {"inputs": inputs, "result": result, "status": workflow["status"], "freigegeben_at": None,
            "version_nr": workflow["version_nr"], "workflow_variante": workflow["variante"]}


@router.get("/projekt/{project_id}/position/{variante}/{bkp_nr}/herkunft")
def get_position_herkunft(project_id: int, variante: str, bkp_nr: str,
                          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if variante not in {"brutto", "netto"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Variante muss brutto oder netto sein")
    ks = db.query(Kostenschaetzung).filter(
        Kostenschaetzung.project_id == project_id,
        Kostenschaetzung.tenant_id == user.tenant_id,
    ).first()
    if not ks:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Noch keine Grobkostenschätzung gespeichert")
    herkunft = (_referenzdetails(ks).get(variante) or {}).get(bkp_nr, [])
    return {"bkp_nr": bkp_nr, "variante": variante, "herkunft": herkunft}


@router.patch("/projekt/{project_id}/status")
def update_schaetzung_status(project_id: int, body: SchaetzungStatusPatch,
                             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Prüft/freigibt den Snapshot oder gibt ihn wieder zur Bearbeitung frei."""
    if body.status not in {"entwurf", "fachlich_geprueft", "freigegeben"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ungültiger Statusübergang")
    if body.variante not in {"brutto", "netto"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Variante muss brutto oder netto sein")
    ks = db.query(Kostenschaetzung).filter(
        Kostenschaetzung.project_id == project_id,
        Kostenschaetzung.tenant_id == user.tenant_id,
    ).first()
    gespeichertes_resultat = json.loads(ks.result_json or "{}") if ks else {}
    if not ks or not gespeichertes_resultat:
        raise HTTPException(status.HTTP_409_CONFLICT, "Zuerst eine Kostenschätzung berechnen und speichern")
    ist_unvollstaendig = _status_fuer_resultat(gespeichertes_resultat, body.variante) == "unvollstaendig"
    if body.status in {"fachlich_geprueft", "freigegeben"} and ist_unvollstaendig:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Unvollständige Schätzungen können nicht geprüft oder freigegeben werden.",
        )
    inputs, workflow, details = _lade_speicherinhalt(ks)
    if body.status == "freigegeben":
        if workflow.get("status") != "fachlich_geprueft" or workflow.get("variante", "netto") != body.variante:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Die Schätzung muss vor der Freigabe fachlich geprüft werden.",
            )
        freigabe_zeit = datetime.utcnow()
        workflow.update({
            "status": "freigegeben", "freigegeben_at": freigabe_zeit.isoformat(),
            "freigegeben_von": user.id, "version_nr": (workflow.get("version_nr") or 0) + 1,
            "variante": body.variante,
        })
        db.add(KostenschaetzungVersion(
            tenant_id=user.tenant_id, project_id=project_id, version_nr=workflow["version_nr"],
            inputs_json=json.dumps(inputs), result_json=ks.result_json,
            details_json=json.dumps(details), freigegeben_at=freigabe_zeit,
            freigegeben_von=user.id,
        ))
    elif body.status == "fachlich_geprueft":
        workflow.update({
            "status": "fachlich_geprueft", "freigegeben_at": None,
            "freigegeben_von": None, "variante": body.variante,
        })
    else:
        workflow.update({
            "status": "unvollstaendig" if ist_unvollstaendig else "entwurf",
            "freigegeben_at": None, "freigegeben_von": None, "variante": body.variante,
        })
    _speichere_inputs(ks, inputs, workflow, details)
    db.commit()
    return {
        "status": workflow["status"], "freigegeben_at": workflow.get("freigegeben_at"),
        "version_nr": workflow.get("version_nr") or 0, "workflow_variante": workflow.get("variante") or "netto",
    }


@router.get("/projekt/{project_id}/versionen")
def list_schaetzung_versionen(project_id: int, user: User = Depends(get_current_user),
                              db: Session = Depends(get_db)):
    versionen = db.query(KostenschaetzungVersion).filter(
        KostenschaetzungVersion.project_id == project_id,
        KostenschaetzungVersion.tenant_id == user.tenant_id,
    ).order_by(KostenschaetzungVersion.version_nr.desc()).all()
    return [{
        "version_nr": v.version_nr, "freigegeben_at": v.freigegeben_at.isoformat(),
        "freigegeben_von": v.freigegeben_von,
    } for v in versionen]


def _export_daten(project_id: int, variante: str, user: User, db: Session) -> tuple:
    if variante not in {"brutto", "netto"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Variante muss brutto oder netto sein")
    project = db.query(HcProject).filter(
        HcProject.id == project_id, HcProject.tenant_id == user.tenant_id
    ).first()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")
    ks = db.query(Kostenschaetzung).filter(
        Kostenschaetzung.project_id == project_id,
        Kostenschaetzung.tenant_id == user.tenant_id,
    ).first()
    if not ks:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Noch keine Grobkostenschätzung gespeichert")
    inputs, workflow, _ = _lade_speicherinhalt(ks)
    inputs["_schaetzung_status"] = workflow.get("status") or "entwurf"
    inputs["_freigegeben_at"] = workflow.get("freigegeben_at")
    inputs["_version_nr"] = workflow.get("version_nr") or 0
    result_alle = json.loads(ks.result_json or "{}")
    result_alle = _mit_referenzdetails(result_alle, _referenzdetails(ks, result_alle))
    result = result_alle.get(variante)
    if not result:
        raise HTTPException(status.HTTP_409_CONFLICT, "Die Schätzung muss zuerst neu berechnet werden")
    return project.name or "Projekt", inputs, result, ks, workflow


def _export_dateiname(projekt_name: str, variante: str, endung: str) -> str:
    sicher = re.sub(r"[^A-Za-z0-9_-]+", "_", projekt_name).strip("_") or "Projekt"
    return f"{sicher}_Grobkostenschaetzung_{variante}.{endung}"


@router.get("/projekt/{project_id}/export.pdf")
def export_pdf(project_id: int, variante: str = "netto",
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    projekt_name, inputs, result, ks, workflow = _export_daten(project_id, variante, user, db)
    pdf = erzeuge_grobkostenschaetzung_pdf(projekt_name, inputs, result, variante)
    if workflow.get("status") == "freigegeben" and workflow.get("variante", "netto") == variante:
        gespeicherte_inputs, _, details = _lade_speicherinhalt(ks)
        workflow["status"] = "exportiert"
        _speichere_inputs(ks, gespeicherte_inputs, workflow, details)
        db.commit()
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_export_dateiname(projekt_name, variante, "pdf")}"'},
    )


@router.get("/projekt/{project_id}/export.xlsx")
def export_excel(project_id: int, variante: str = "netto",
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    projekt_name, inputs, result, ks, workflow = _export_daten(project_id, variante, user, db)
    xlsx = erzeuge_grobkostenschaetzung_excel(projekt_name, inputs, result, variante)
    if workflow.get("status") == "freigegeben" and workflow.get("variante", "netto") == variante:
        gespeicherte_inputs, _, details = _lade_speicherinhalt(ks)
        workflow["status"] = "exportiert"
        _speichere_inputs(ks, gespeicherte_inputs, workflow, details)
        db.commit()
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{_export_dateiname(projekt_name, variante, "xlsx")}"'},
    )


# ── Korrekturfaktoren (firmenweit) ──────────────────────────────────────────

@router.get("/korrekturfaktoren")
def list_korrekturfaktoren(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    faktoren = db.query(Korrekturfaktor).filter(Korrekturfaktor.tenant_id == user.tenant_id).all()
    return [{"id": f.id, "name": f.name, "faktor": f.faktor, "aktiv": f.aktiv} for f in faktoren]


@router.patch("/korrekturfaktoren/{faktor_id}")
def update_korrekturfaktor(faktor_id: int, body: KorrekturfaktorPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(Korrekturfaktor).filter(Korrekturfaktor.id == faktor_id, Korrekturfaktor.tenant_id == user.tenant_id).first()
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Korrekturfaktor nicht gefunden")
    if body.faktor is not None:
        f.faktor = body.faktor
    if body.aktiv is not None:
        f.aktiv = body.aktiv
    db.commit()
    db.refresh(f)
    return {"id": f.id, "name": f.name, "faktor": f.faktor, "aktiv": f.aktiv}


# ── Beispieldaten (~80 Demo-Projekte, landen in der Auswertung) ─────────────

_PROJEKTART_MAP = {"Neubau": "Neubau", "Sanierung": "Sanierung", "Ersatz_WE": "Ersatz Wärmeerzeuger"}
_ERZEUGER_MAP = {"sole": ["Erdsonden-WP"], "luft": ["Luft/Wasser-WP"], "wasser": ["Wasser/Wasser-WP"]}
_ABGABE_MAP = {"FBH": ["FBH"], "HK": ["Heizkörper"], "gemischt": ["FBH", "Heizkörper"], "Luft": ["Lufterhitzer"]}
_POS_NAME = {p["bkp_nr"]: p["bezeichnung"] for p in BKP_POSITIONEN}

# Verteilung eines Gruppen-Betrags auf typische Einzelpositionen (Norm-LV-nah),
# damit die Demo-Auswertungen echte Positions-Kennwerte liefern.
_243_FIX = {"243.1": 0.28, "243.6": 0.14, "243.5": 0.10, "243.7": 0.06, "243.8": 0.06, "243.9": 0.10}
_242_WP_POS = {"sole": "242.3", "luft": "242.4", "wasser": "242.5"}


def _verteile_gruppe(gruppe: str, betrag: float, wp_typ: str, abgabe: str) -> dict:
    if gruppe == "241":
        anteile = {"241.14": 0.55, "241.11": 0.20, "241.10": 0.10, "241.12": 0.08, "241.13": 0.07}
    elif gruppe == "242":
        anteile = {_242_WP_POS.get(wp_typ, "242.3"): 0.75, "242.6": 0.10, "242.7": 0.15}
    elif gruppe == "243":
        anteile = dict(_243_FIX)
        rest = 1.0 - sum(anteile.values())  # ~0.26 für die Wärmeabgabe
        if abgabe == "HK":
            anteile["243.2a"] = rest
        elif abgabe == "gemischt":
            anteile["243.2a"] = rest / 2
            anteile["243.3a"] = rest / 2
        elif abgabe == "Luft":
            anteile["243.4a"] = rest
        else:  # FBH
            anteile["243.3a"] = rest
    elif gruppe == "247":
        anteile = {"247.6": 0.7, "247.5": 0.3}
    elif gruppe == "248":
        anteile = {"248.2": 0.5, "248.1": 0.35, "248.3": 0.15}
    elif gruppe == "249":
        anteile = {"249.2": 0.35, "249.5": 0.20, "249.8": 0.15, "249.1": 0.10, "249.3": 0.10, "249.6": 0.10}
    else:
        anteile = {}
    return {nr: round(betrag * a) for nr, a in anteile.items()}


@router.post("/beispieldaten", status_code=201)
def beispieldaten_laden(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Legt die ~80 Beispiel-Referenzprojekte in der Auswertung an (überspringt
    bereits vorhandene — mehrfach klicken erzeugt keine Duplikate)."""
    vorhanden = {
        r.name for r in db.query(RefProjekt)
        .filter(RefProjekt.tenant_id == user.tenant_id, RefProjekt.name.like(f"{BEISPIEL_PREFIX}%"))
    }
    neu = 0
    for p in BEISPIEL_PROJEKTE:
        if p["name"] in vorhanden:
            continue
        r = RefProjekt(
            tenant_id=user.tenant_id, erstellt_von=user.id, name=p["name"],
            projektart=_PROJEKTART_MAP[p["projektart"]],
            gebaeudetyp=p["nutzung"],
            ausbauumfang="nur Erzeugung" if p["projektart"] == "Ersatz_WE" else "Vollausbau",
            zertifizierung="Gesetz", anlagenkonfiguration="monovalent",
            waermeerzeuger=_ERZEUGER_MAP[p["wp_typ"]],
            waermeabgabe=_ABGABE_MAP[p["abgabe_dominant"]],
            bww_bei_heizung=p["bww_bei_heizung"],
            weiterbetrieb_umbau=p.get("weiterbetrieb_umbau", False),
            etappierung=p.get("etappierung", False),
            ebf_m2=p["ebf_m2"], bohrmeter=p["bohrmeter"], heizleistung_kw=p["leistung_kw"],
            anzahl_einheiten=p["anzahl_ne"], datum=p["datum_abrechnung"], qualitaet=1.0,
            laufmeter_rohre_heizung=p["rohrmeter"], anzahl_heizkoerper=p["hk_anzahl"],
        )
        db.add(r)
        db.flush()
        r.gewerke.append(RefProjektGewerk(
            tenant_id=user.tenant_id, gewerk="heizung",
            rabatt_pct=p.get("rabatt_pct", 0.0), skonto_pct=p.get("skonto_pct", 0.0),
        ))
        for gruppe, betrag in p["bkp"].items():
            for nr, teil in _verteile_gruppe(gruppe, betrag, p["wp_typ"], p["abgabe_dominant"]).items():
                if teil > 0:
                    db.add(RefKostenzeile(
                        tenant_id=user.tenant_id, ref_projekt_id=r.id, gewerk="heizung",
                        bkp_nr=nr, bkp_name=_POS_NAME.get(nr, nr), betrag_chf=teil,
                    ))
        neu += 1
    db.commit()
    return {"neu": neu, "total": len(BEISPIEL_PROJEKTE)}


@router.delete("/beispieldaten")
def beispieldaten_loeschen(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Entfernt alle Beispiel-Projekte wieder (erkennbar am Namens-Präfix) —
    eigene, echte Referenzprojekte bleiben unangetastet."""
    refs = (
        db.query(RefProjekt)
        .filter(RefProjekt.tenant_id == user.tenant_id, RefProjekt.name.like(f"{BEISPIEL_PREFIX}%"))
        .all()
    )
    for r in refs:
        db.delete(r)
    db.commit()
    return {"geloescht": len(refs)}
