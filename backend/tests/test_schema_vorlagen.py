"""Firmenweite Schema-Vorlagen und persönliche Einstellungen — Zugriff und Grenzen.

Zwei Zusagen aus Dominics Vorgabe (2026-07-31):

* Ein Schema lässt sich als Vorlage speichern und wiederverwenden.
* Die Tastenbelegung ist persönlich und gehört nicht zum Projekt.

Und die zwei Regeln, die dabei nicht verletzt werden dürfen: Vorlagen bleiben
innerhalb der Firma (Regel 5/6), und die Einstellungen des einen Benutzers
sind für den anderen unsichtbar.
"""
import pytest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401 — registriert hc_users (FK-Ziel)
from app.models.subscription import SubscriptionPlan  # noqa: F401 — FK-Ziel
from app.models.heizungscockpit import HcProject, HcSchema
from app.routers import hc_schema_templates as vorlagen
from app.routers import hc_user_settings as einstellungen


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


DOMINIC = SimpleNamespace(id=1, tenant_id=1, name="Dominic", email="d@example.invalid",
                          firma_role="mitglied", role=SimpleNamespace(value="user"))
LUCA = SimpleNamespace(id=2, tenant_id=1, name="Luca", email="l@example.invalid",
                       firma_role="mitglied", role=SimpleNamespace(value="user"))
FREMD = SimpleNamespace(id=3, tenant_id=99, name="Fremd", email="f@example.invalid",
                        firma_role="admin", role=SimpleNamespace(value="user"))

GRAPH = {
    "nodes": [{"id": "e1", "type": "erzeuger", "data": {}},
              {"id": "g1", "type": "gruppe", "data": {"typ": "Fussbodenheizung (FBH)"}}],
    "edges": [{"id": "l1", "source": "e1", "target": "g1"}],
}


def _vorlage(db, user=DOMINIC, name="Standard EWS-WP"):
    return vorlagen.vorlage_anlegen(
        vorlagen.VorlageIn(name=name, beschreibung="Zwei Heizgruppen", graph=GRAPH),
        user=user, db=db)


# ── Vorlagen ────────────────────────────────────────────────────────────────

def test_schema_laesst_sich_als_vorlage_speichern_und_wieder_laden():
    db = _db()
    out = _vorlage(db)
    assert out["node_count"] == 2 and out["edge_count"] == 1
    assert out["created_by_name"] == "Dominic"

    geladen = vorlagen.vorlage_lesen(out["id"], user=DOMINIC, db=db)
    assert geladen["graph"]["nodes"][1]["data"]["typ"] == "Fussbodenheizung (FBH)"


def test_vorlage_aus_einem_bestehenden_schema():
    db = _db()
    projekt = HcProject(tenant_id=1, erstellt_von=1, name="Testprojekt")
    db.add(projekt)
    db.commit()
    s = HcSchema(tenant_id=1, project_id=projekt.id, name="Schema",
                 graph_json='{"nodes":[{"id":"e1","type":"erzeuger"}],"edges":[]}')
    db.add(s)
    db.commit()

    out = vorlagen.vorlage_anlegen(
        vorlagen.VorlageIn(name="Aus Schema", schema_id=s.id), user=DOMINIC, db=db)
    assert out["node_count"] == 1


def test_die_vorlage_ist_eine_kopie_und_folgt_dem_projekt_nicht():
    """Ändert sich das Ursprungsschema, bleibt die Standardschaltung, wie sie war."""
    db = _db()
    projekt = HcProject(tenant_id=1, erstellt_von=1, name="Testprojekt")
    db.add(projekt)
    db.commit()
    s = HcSchema(tenant_id=1, project_id=projekt.id, name="Schema",
                 graph_json='{"nodes":[{"id":"e1","type":"erzeuger"}],"edges":[]}')
    db.add(s)
    db.commit()
    out = vorlagen.vorlage_anlegen(
        vorlagen.VorlageIn(name="Kopie", schema_id=s.id), user=DOMINIC, db=db)

    s.graph_json = '{"nodes":[],"edges":[]}'      # Projekt wird leergeräumt
    db.commit()

    assert vorlagen.vorlage_lesen(out["id"], user=DOMINIC, db=db)["graph"]["nodes"]


def test_leeres_schema_ergibt_keine_vorlage():
    db = _db()
    with pytest.raises(HTTPException) as fehler:
        vorlagen.vorlage_anlegen(
            vorlagen.VorlageIn(name="Leer", graph={"nodes": [], "edges": []}),
            user=DOMINIC, db=db)
    assert fehler.value.status_code == 422


def test_vorlagen_sind_firmenweit_sichtbar_aber_nicht_darueber_hinaus():
    db = _db()
    _vorlage(db)
    # Regel 6: die Kollegin in derselben Firma sieht sie.
    assert len(vorlagen.vorlagen_liste(user=LUCA, db=db)) == 1
    # Regel 5: eine andere Firma sieht nichts.
    assert vorlagen.vorlagen_liste(user=FREMD, db=db) == []


def test_fremde_firma_kann_eine_vorlage_nicht_lesen():
    db = _db()
    out = _vorlage(db)
    with pytest.raises(HTTPException) as fehler:
        vorlagen.vorlage_lesen(out["id"], user=FREMD, db=db)
    assert fehler.value.status_code == 404


def test_loeschen_nur_durch_erstellerin_oder_firmenadmin():
    db = _db()
    out = _vorlage(db)
    with pytest.raises(HTTPException) as fehler:
        vorlagen.vorlage_loeschen(out["id"], user=LUCA, db=db)
    assert fehler.value.status_code == 403

    firmenadmin = SimpleNamespace(id=4, tenant_id=1, name="Chefin", email="c@example.invalid",
                                  firma_role="admin", role=SimpleNamespace(value="user"))
    vorlagen.vorlage_loeschen(out["id"], user=firmenadmin, db=db)
    assert vorlagen.vorlagen_liste(user=DOMINIC, db=db) == []


# ── Persönliche Einstellungen ───────────────────────────────────────────────

def test_ohne_gespeicherten_satz_gilt_die_standardbelegung():
    db = _db()
    satz = einstellungen.einstellungen_lesen(user=DOMINIC, db=db)
    assert satz["shortcuts"]["shortcut_line"] == "l"


def test_die_belegung_gehoert_dem_benutzer_nicht_dem_projekt():
    db = _db()
    einstellungen.einstellungen_schreiben(
        einstellungen.EinstellungenIn(shortcuts={"shortcut_line": "q"}), user=DOMINIC, db=db)

    assert einstellungen.einstellungen_lesen(user=DOMINIC, db=db)["shortcuts"]["shortcut_line"] == "q"
    # Luca arbeitet am selben Projekt und behält seine eigene Belegung.
    assert einstellungen.einstellungen_lesen(user=LUCA, db=db)["shortcuts"]["shortcut_line"] == "l"


def test_zweites_speichern_ueberschreibt_denselben_satz():
    db = _db()
    for taste in ("q", "w"):
        einstellungen.einstellungen_schreiben(
            einstellungen.EinstellungenIn(shortcuts={"shortcut_line": taste}), user=DOMINIC, db=db)
    assert einstellungen.einstellungen_lesen(user=DOMINIC, db=db)["shortcuts"]["shortcut_line"] == "w"
