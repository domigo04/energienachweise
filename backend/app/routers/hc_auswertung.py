"""Auswertung — Referenzprojekte (Wissensdatenbank), firmenweit (tenant_id).

CRUD für reale, abgeschlossene Projekte + ihre BKP-Kosten, plus:
- /katalog     → BKP-Positionen (für die Erfassungs-Auswahl) inkl. Treiber
- /analyse     → Kennwert-Streuung je BKP über alle Referenzen (für die Diagramme)
- /export.csv  → alle Referenzprojekte als CSV (Sicherung / Weitergabe)
- /import      → Referenzprojekte aus CSV anlegen (Wiederherstellung / Bulk-Erfassung)
"""
import csv
import io
from collections import defaultdict
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.calculations.kostenschaetzung import netto_aus_brutto, quantile
from app.data.bkp_positionen import BKP_GRUPPEN, BKP_POSITIONEN, TREIBER_LABEL, treiber_fuer_bkp
from app.database import get_db
from app.models.auth import User
from app.models.kv import RefKostenzeile, RefProjekt, RefProjektGewerk

router = APIRouter(prefix="/api/v1/auswertung", tags=["KV – Auswertung (Referenzprojekte)"])

_REF_DRIVER_ATTR = {"ebf": "ebf_m2", "kw": "heizleistung_kw", "einheiten": "anzahl_einheiten", "bohrmeter": "bohrmeter"}


class KostenzeileIn(BaseModel):
    bkp_nr: str
    bkp_name: Optional[str] = None
    betrag_chf: float = 0.0


class RefProjektIn(BaseModel):
    name: str
    projektart: Optional[str] = None
    gebaeudetyp: Optional[str] = None
    ausbauumfang: Optional[str] = None
    zertifizierung: Optional[str] = None
    anlagenkonfiguration: Optional[str] = None
    waermeerzeuger: List[str] = []
    waermeabgabe: List[str] = []
    ebf_m2: Optional[float] = None
    bohrmeter: Optional[float] = None
    heizleistung_kw: Optional[float] = None
    anzahl_einheiten: Optional[int] = None
    # Weitere Bezugsgrössen (Dominic 2026-07-09, aus der 3-Plan-Vorlage übernommen)
    installierte_leistung_neu_kw: Optional[float] = None
    flaeche_fbh_m2: Optional[float] = None
    flaeche_tabs_m2: Optional[float] = None
    flaeche_deckenstrahlplatten_m2: Optional[float] = None
    anzahl_heizkoerper: Optional[int] = None
    anzahl_waermemessungen: Optional[int] = None
    anzahl_schaltgeraetekombinationen: Optional[int] = None
    laufmeter_rohre_heizung: Optional[float] = None
    # Rabatt/Skonto Heizung (Gewerk "heizung" — Grundlage für Brutto→Netto)
    rabatt_pct: float = 0.0
    skonto_pct: float = 0.0
    datum: Optional[date] = None
    qualitaet: float = 1.0
    kostenzeilen: List[KostenzeileIn] = []


def _heizung_gewerk(r: RefProjekt) -> Optional[RefProjektGewerk]:
    return next((g for g in r.gewerke if g.gewerk == "heizung"), None)


def _brutto_netto(r: RefProjekt) -> dict:
    brutto = sum(z.betrag_chf or 0 for z in r.kostenzeilen if z.gewerk == "heizung")
    g = _heizung_gewerk(r)
    rabatt, skonto, korrektur = (g.rabatt_pct, g.skonto_pct, g.korrektur_betrag_chf) if g else (0.0, 0.0, 0.0)
    netto = netto_aus_brutto(brutto, rabatt, skonto) + korrektur
    return {"brutto_chf": round(brutto), "netto_chf": round(netto),
            "rabatt_pct": rabatt, "skonto_pct": skonto}


def _summary(r: RefProjekt) -> dict:
    bn = _brutto_netto(r)
    return {
        "id": r.id, "name": r.name, "projektart": r.projektart, "gebaeudetyp": r.gebaeudetyp,
        "anlagenkonfiguration": r.anlagenkonfiguration or "monovalent",
        "waermeerzeuger": r.waermeerzeuger or [], "waermeabgabe": r.waermeabgabe or [],
        "ebf_m2": r.ebf_m2, "heizleistung_kw": r.heizleistung_kw, "datum": r.datum,
        **bn,
        "summe_kosten": bn["netto_chf"],  # Rückwärtskompatibel: massgebend ist jetzt Netto
    }


def _out(r: RefProjekt) -> dict:
    return {
        **_summary(r),
        "ausbauumfang": r.ausbauumfang, "zertifizierung": r.zertifizierung,
        "bohrmeter": r.bohrmeter, "anzahl_einheiten": r.anzahl_einheiten, "qualitaet": r.qualitaet,
        "installierte_leistung_neu_kw": r.installierte_leistung_neu_kw,
        "flaeche_fbh_m2": r.flaeche_fbh_m2, "flaeche_tabs_m2": r.flaeche_tabs_m2,
        "flaeche_deckenstrahlplatten_m2": r.flaeche_deckenstrahlplatten_m2,
        "anzahl_heizkoerper": r.anzahl_heizkoerper, "anzahl_waermemessungen": r.anzahl_waermemessungen,
        "anzahl_schaltgeraetekombinationen": r.anzahl_schaltgeraetekombinationen,
        "laufmeter_rohre_heizung": r.laufmeter_rohre_heizung,
        "kostenzeilen": [
            {"id": z.id, "bkp_nr": z.bkp_nr, "bkp_name": z.bkp_name, "betrag_chf": z.betrag_chf}
            for z in r.kostenzeilen if z.gewerk == "heizung"
        ],
    }


def _apply(r: RefProjekt, body: RefProjektIn, user: User):
    r.name = body.name
    r.projektart = body.projektart
    r.gebaeudetyp = body.gebaeudetyp
    r.ausbauumfang = body.ausbauumfang
    r.zertifizierung = body.zertifizierung
    r.anlagenkonfiguration = body.anlagenkonfiguration
    r.waermeerzeuger = body.waermeerzeuger
    r.waermeabgabe = body.waermeabgabe
    r.ebf_m2 = body.ebf_m2
    r.bohrmeter = body.bohrmeter
    r.heizleistung_kw = body.heizleistung_kw
    r.anzahl_einheiten = body.anzahl_einheiten
    r.installierte_leistung_neu_kw = body.installierte_leistung_neu_kw
    r.flaeche_fbh_m2 = body.flaeche_fbh_m2
    r.flaeche_tabs_m2 = body.flaeche_tabs_m2
    r.flaeche_deckenstrahlplatten_m2 = body.flaeche_deckenstrahlplatten_m2
    r.anzahl_heizkoerper = body.anzahl_heizkoerper
    r.anzahl_waermemessungen = body.anzahl_waermemessungen
    r.anzahl_schaltgeraetekombinationen = body.anzahl_schaltgeraetekombinationen
    r.laufmeter_rohre_heizung = body.laufmeter_rohre_heizung
    r.datum = body.datum
    r.qualitaet = body.qualitaet
    r.kostenzeilen = [
        RefKostenzeile(tenant_id=user.tenant_id, gewerk="heizung", bkp_nr=z.bkp_nr, bkp_name=z.bkp_name, betrag_chf=z.betrag_chf)
        for z in body.kostenzeilen
    ]
    g = _heizung_gewerk(r)
    if not g:
        g = RefProjektGewerk(tenant_id=user.tenant_id, gewerk="heizung")
        r.gewerke.append(g)
    g.rabatt_pct = body.rabatt_pct
    g.skonto_pct = body.skonto_pct


# ── CSV Export/Import ───────────────────────────────────────────────────────
# Format: eine Zeile = ein Referenzprojekt. Wärmeerzeuger/-abgabe mit ";"
# getrennt in einer Zelle. Pro BKP-Position eine Spalte "bkp_<nr>" — leer,
# wenn nicht erfasst. So bleibt Export→Import verlustfrei (Runde-Trip).
_CSV_BASE_FIELDS = [
    "name", "projektart", "gebaeudetyp", "ausbauumfang", "zertifizierung", "anlagenkonfiguration",
    "waermeerzeuger", "waermeabgabe", "ebf_m2", "bohrmeter", "heizleistung_kw",
    "anzahl_einheiten", "datum", "qualitaet", "rabatt_pct", "skonto_pct",
    "installierte_leistung_neu_kw", "flaeche_fbh_m2", "flaeche_tabs_m2", "flaeche_deckenstrahlplatten_m2",
    "anzahl_heizkoerper", "anzahl_waermemessungen", "anzahl_schaltgeraetekombinationen", "laufmeter_rohre_heizung",
]


def _bkp_fieldnames() -> List[str]:
    return [f"bkp_{p['bkp_nr']}" for p in BKP_POSITIONEN]


def _num_or_leer(v):
    return v if v is not None else ""


def _ref_to_row(r) -> dict:
    g = next((x for x in r.gewerke if x.gewerk == "heizung"), None)
    row = {
        "name": r.name,
        "projektart": r.projektart or "",
        "gebaeudetyp": r.gebaeudetyp or "",
        "ausbauumfang": r.ausbauumfang or "",
        "zertifizierung": r.zertifizierung or "",
        "anlagenkonfiguration": r.anlagenkonfiguration or "",
        "waermeerzeuger": ";".join(r.waermeerzeuger or []),
        "waermeabgabe": ";".join(r.waermeabgabe or []),
        "ebf_m2": _num_or_leer(r.ebf_m2),
        "bohrmeter": _num_or_leer(r.bohrmeter),
        "heizleistung_kw": _num_or_leer(r.heizleistung_kw),
        "anzahl_einheiten": _num_or_leer(r.anzahl_einheiten),
        "datum": r.datum.isoformat() if r.datum else "",
        "qualitaet": r.qualitaet if r.qualitaet is not None else "",
        "rabatt_pct": g.rabatt_pct if g else 0,
        "skonto_pct": g.skonto_pct if g else 0,
        "installierte_leistung_neu_kw": _num_or_leer(r.installierte_leistung_neu_kw),
        "flaeche_fbh_m2": _num_or_leer(r.flaeche_fbh_m2),
        "flaeche_tabs_m2": _num_or_leer(r.flaeche_tabs_m2),
        "flaeche_deckenstrahlplatten_m2": _num_or_leer(r.flaeche_deckenstrahlplatten_m2),
        "anzahl_heizkoerper": _num_or_leer(r.anzahl_heizkoerper),
        "anzahl_waermemessungen": _num_or_leer(r.anzahl_waermemessungen),
        "anzahl_schaltgeraetekombinationen": _num_or_leer(r.anzahl_schaltgeraetekombinationen),
        "laufmeter_rohre_heizung": _num_or_leer(r.laufmeter_rohre_heizung),
    }
    kosten = {z.bkp_nr: z.betrag_chf for z in r.kostenzeilen if z.gewerk == "heizung"}
    for p in BKP_POSITIONEN:
        betrag = kosten.get(p["bkp_nr"])
        row[f"bkp_{p['bkp_nr']}"] = betrag if betrag else ""
    return row


def _rows_to_csv(refs: list) -> str:
    fieldnames = _CSV_BASE_FIELDS + _bkp_fieldnames()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in refs:
        writer.writerow(_ref_to_row(r))
    return "﻿" + buf.getvalue()  # BOM, damit Excel Umlaute korrekt zeigt


def _csv_response(content: str, dateiname: str) -> Response:
    return Response(
        content=content, media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{dateiname}"'},
    )


def _num(v) -> Optional[float]:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _pint(v) -> Optional[int]:
    n = _num(v)
    return int(n) if n is not None else None


def _pdate(v) -> Optional[date]:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        return None


@router.get("")
def list_refs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    refs = (
        db.query(RefProjekt).filter(RefProjekt.tenant_id == user.tenant_id)
        .order_by(RefProjekt.created_at.desc()).all()
    )
    return [_summary(r) for r in refs]


@router.get("/katalog")
def katalog(user: User = Depends(get_current_user)):
    positionen = []
    for p in BKP_POSITIONEN:
        nr = p["bkp_nr"]
        gruppe_nr = nr.split(".")[0]
        treiber = treiber_fuer_bkp(nr)
        positionen.append({
            "bkp_nr": nr, "bezeichnung": p["bezeichnung"], "gruppe_nr": gruppe_nr,
            "gruppe": BKP_GRUPPEN.get(gruppe_nr, ""), "treiber": treiber, "einheit": TREIBER_LABEL[treiber],
        })
    return {"gruppen": BKP_GRUPPEN, "positionen": positionen}


@router.get("/analyse")
def analyse(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    refs = db.query(RefProjekt).filter(RefProjekt.tenant_id == user.tenant_id).all()
    buckets = defaultdict(list)
    for r in refs:
        for z in r.kostenzeilen:
            treiber = treiber_fuer_bkp(z.bkp_nr)
            dv = getattr(r, _REF_DRIVER_ATTR[treiber]) or 0
            if z.betrag_chf and z.betrag_chf > 0 and dv > 0:
                buckets[z.bkp_nr].append(z.betrag_chf / dv)
    name_map = {p["bkp_nr"]: p["bezeichnung"] for p in BKP_POSITIONEN}
    kennwerte = []
    for nr in sorted(buckets):
        vals = buckets[nr]
        treiber = treiber_fuer_bkp(nr)
        kennwerte.append({
            "bkp_nr": nr, "bkp_name": name_map.get(nr, ""), "einheit": TREIBER_LABEL[treiber],
            "count": len(vals), "min": round(min(vals), 2), "q1": round(quantile(vals, 0.25), 2),
            "median": round(quantile(vals, 0.5), 2), "q3": round(quantile(vals, 0.75), 2),
            "max": round(max(vals), 2), "mean": round(sum(vals) / len(vals), 2),
        })
    return {"anzahl": len(refs), "kennwerte": kennwerte}


@router.get("/export.csv")
def export_alle_csv(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    refs = (
        db.query(RefProjekt).filter(RefProjekt.tenant_id == user.tenant_id)
        .order_by(RefProjekt.name).all()
    )
    return _csv_response(_rows_to_csv(refs), "auswertung_referenzprojekte.csv")


@router.post("/import")
async def import_csv(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    bkp_namen = {p["bkp_nr"]: p["bezeichnung"] for p in BKP_POSITIONEN}
    created = 0
    fehler = []
    for i, row in enumerate(reader, start=2):  # Zeile 1 = Header
        name = (row.get("name") or "").strip()
        if not name:
            fehler.append(f"Zeile {i}: kein Name — übersprungen")
            continue
        try:
            r = RefProjekt(
                tenant_id=user.tenant_id, erstellt_von=user.id, name=name,
                projektart=(row.get("projektart") or "").strip() or None,
                gebaeudetyp=(row.get("gebaeudetyp") or "").strip() or None,
                ausbauumfang=(row.get("ausbauumfang") or "").strip() or None,
                zertifizierung=(row.get("zertifizierung") or "").strip() or None,
                anlagenkonfiguration=(row.get("anlagenkonfiguration") or "").strip() or None,
                waermeerzeuger=[x.strip() for x in (row.get("waermeerzeuger") or "").split(";") if x.strip()],
                waermeabgabe=[x.strip() for x in (row.get("waermeabgabe") or "").split(";") if x.strip()],
                ebf_m2=_num(row.get("ebf_m2")), bohrmeter=_num(row.get("bohrmeter")),
                heizleistung_kw=_num(row.get("heizleistung_kw")), anzahl_einheiten=_pint(row.get("anzahl_einheiten")),
                datum=_pdate(row.get("datum")), qualitaet=_num(row.get("qualitaet")) or 1.0,
                installierte_leistung_neu_kw=_num(row.get("installierte_leistung_neu_kw")),
                flaeche_fbh_m2=_num(row.get("flaeche_fbh_m2")), flaeche_tabs_m2=_num(row.get("flaeche_tabs_m2")),
                flaeche_deckenstrahlplatten_m2=_num(row.get("flaeche_deckenstrahlplatten_m2")),
                anzahl_heizkoerper=_pint(row.get("anzahl_heizkoerper")),
                anzahl_waermemessungen=_pint(row.get("anzahl_waermemessungen")),
                anzahl_schaltgeraetekombinationen=_pint(row.get("anzahl_schaltgeraetekombinationen")),
                laufmeter_rohre_heizung=_num(row.get("laufmeter_rohre_heizung")),
            )
            db.add(r)
            db.flush()
            r.gewerke.append(RefProjektGewerk(
                tenant_id=user.tenant_id, gewerk="heizung",
                rabatt_pct=_num(row.get("rabatt_pct")) or 0.0, skonto_pct=_num(row.get("skonto_pct")) or 0.0,
            ))
            for nr, bkp_name in bkp_namen.items():
                betrag = _num(row.get(f"bkp_{nr}"))
                if betrag and betrag > 0:
                    db.add(RefKostenzeile(tenant_id=user.tenant_id, ref_projekt_id=r.id, gewerk="heizung", bkp_nr=nr, bkp_name=bkp_name, betrag_chf=betrag))
            created += 1
        except Exception as e:
            fehler.append(f"Zeile {i}: {e}")
    db.commit()
    return {"created": created, "fehler": fehler}


@router.post("", status_code=201)
def create_ref(body: RefProjektIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = RefProjekt(tenant_id=user.tenant_id, erstellt_von=user.id, name=body.name)
    _apply(r, body, user)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _out(r)


@router.get("/{ref_id}")
def get_ref(ref_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(RefProjekt).filter(RefProjekt.id == ref_id, RefProjekt.tenant_id == user.tenant_id).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Referenzprojekt nicht gefunden")
    return _out(r)


@router.get("/{ref_id}/export.csv")
def export_einzel_csv(ref_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(RefProjekt).filter(RefProjekt.id == ref_id, RefProjekt.tenant_id == user.tenant_id).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Referenzprojekt nicht gefunden")
    return _csv_response(_rows_to_csv([r]), f"referenzprojekt_{r.id}.csv")


@router.put("/{ref_id}")
def update_ref(ref_id: int, body: RefProjektIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(RefProjekt).filter(RefProjekt.id == ref_id, RefProjekt.tenant_id == user.tenant_id).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Referenzprojekt nicht gefunden")
    _apply(r, body, user)
    db.commit()
    db.refresh(r)
    return _out(r)


@router.delete("/{ref_id}", status_code=204)
def delete_ref(ref_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(RefProjekt).filter(RefProjekt.id == ref_id, RefProjekt.tenant_id == user.tenant_id).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Referenzprojekt nicht gefunden")
    db.delete(r)
    db.commit()
