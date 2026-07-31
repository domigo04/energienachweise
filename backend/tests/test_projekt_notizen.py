"""Projektjournal: Autorenspur, Stecknadel und Änderungsprotokoll.

Die drei Zusagen aus Dominics Vorgabe (2026-07-31) sind hier festgehalten:
der Autor bleibt sichtbar, eine fremde Bearbeitung ist erkennbar, und jede
Änderung landet mit Zeitpunkt im Protokoll.
"""
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import User  # noqa: F401 — registriert hc_users (FK-Ziel)
from app.models.subscription import SubscriptionPlan  # noqa: F401 — FK-Ziel
from app.models.heizungscockpit import HcAuditEvent, HcProject, HcProjectNote
from app.routers import hc_notizen


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _projekt(db):
    p = HcProject(tenant_id=1, erstellt_von=1, name="Testprojekt")
    db.add(p)
    db.commit()
    return p


DOMINIC = SimpleNamespace(id=1, tenant_id=1, name="Dominic", email="d@example.invalid")
LUCA = SimpleNamespace(id=2, tenant_id=1, name="Luca", email="l@example.invalid")


def test_eintrag_traegt_autor_und_landet_im_protokoll():
    db = _db()
    p = _projekt(db)
    out = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(
        kind="sitzung", titel="Bauherrensitzung", text="Beschluss: Sole/Wasser",
    ), user=DOMINIC, db=db)

    assert out["autor_name"] == "Dominic"
    assert out["bearbeitet_at"] is None          # noch nie bearbeitet
    assert out["erledigt"] is False
    ereignis = db.query(HcAuditEvent).filter(HcAuditEvent.action == "notiz_erstellt").one()
    assert ereignis.actor_name == "Dominic"
    assert ereignis.project_id == p.id
    assert ereignis.created_at is not None


def test_fremde_bearbeitung_bleibt_sichtbar_und_ueberschreibt_den_autor_nicht():
    db = _db()
    p = _projekt(db)
    erstellt = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(titel="Offene Punkte"),
                                  user=DOMINIC, db=db)

    geaendert = hc_notizen.aendern(p.id, erstellt["id"],
                                   hc_notizen.NotePatch(text="Ergänzung von Luca"),
                                   user=LUCA, db=db)

    assert geaendert["autor_name"] == "Dominic"          # Autor bleibt
    assert geaendert["bearbeitet_von_name"] == "Luca"    # Bearbeiter kommt dazu
    assert geaendert["bearbeitet_at"] is not None
    ereignis = db.query(HcAuditEvent).filter(HcAuditEvent.action == "notiz_bearbeitet").one()
    assert ereignis.actor_name == "Luca"
    assert "Text" in ereignis.details_json


def test_ohne_echte_aenderung_entsteht_keine_bearbeitungsspur():
    """Ein Speichern ohne Inhaltsänderung darf den Eintrag nicht als bearbeitet
    markieren — sonst steht bei jedem Öffnen ein fremder Name daneben."""
    db = _db()
    p = _projekt(db)
    erstellt = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(titel="Notiz", text="A"),
                                  user=DOMINIC, db=db)
    unveraendert = hc_notizen.aendern(p.id, erstellt["id"],
                                      hc_notizen.NotePatch(titel="Notiz", text="A"),
                                      user=LUCA, db=db)
    assert unveraendert["bearbeitet_at"] is None
    assert db.query(HcAuditEvent).filter(HcAuditEvent.action == "notiz_bearbeitet").count() == 0


def test_stecknadel_haengt_am_schema_und_wird_gefiltert():
    db = _db()
    p = _projekt(db)
    mit_nadel = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(
        titel="Ventil prüfen",
        pin=hc_notizen.PinIn(schema_id=7, x=1200.0, y=480.0, node_id="n5"),
    ), user=DOMINIC, db=db)
    hc_notizen.anlegen(p.id, hc_notizen.NoteIn(titel="Ohne Nadel"), user=DOMINIC, db=db)

    assert mit_nadel["pin"] == {"schema_id": 7, "x": 1200.0, "y": 480.0, "node_id": "n5"}

    # Der Editor fragt genau die Nadeln seines Schemas ab.
    im_schema = hc_notizen.liste(p.id, schema_id=7, user=DOMINIC, db=db)["notizen"]
    assert [n["titel"] for n in im_schema] == ["Ventil prüfen"]
    assert hc_notizen.liste(p.id, schema_id=8, user=DOMINIC, db=db)["notizen"] == []
    # Ohne Filter ist beides da.
    assert len(hc_notizen.liste(p.id, user=DOMINIC, db=db)["notizen"]) == 2


def test_nadel_verschieben_und_entfernen():
    db = _db()
    p = _projekt(db)
    n = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(
        titel="Am Verteiler", pin=hc_notizen.PinIn(schema_id=3, x=10.0, y=20.0),
    ), user=DOMINIC, db=db)

    verschoben = hc_notizen.aendern(p.id, n["id"], hc_notizen.NotePatch(
        pin=hc_notizen.PinIn(schema_id=3, x=99.0, y=140.0)), user=DOMINIC, db=db)
    assert verschoben["pin"]["x"] == 99.0

    ohne = hc_notizen.aendern(p.id, n["id"], hc_notizen.NotePatch(pin_entfernen=True),
                              user=DOMINIC, db=db)
    assert ohne["pin"] is None
    assert hc_notizen.liste(p.id, schema_id=3, user=DOMINIC, db=db)["notizen"] == []


def test_pendenz_erledigen_haelt_person_und_zeitpunkt_fest():
    db = _db()
    p = _projekt(db)
    n = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(kind="aufgabe", titel="Offerte einholen"),
                           user=DOMINIC, db=db)
    offen = hc_notizen.liste(p.id, offen=True, user=DOMINIC, db=db)["notizen"]
    assert len(offen) == 1

    erledigt = hc_notizen.aendern(p.id, n["id"], hc_notizen.NotePatch(erledigt=True),
                                  user=LUCA, db=db)
    assert erledigt["erledigt"] is True
    assert erledigt["erledigt_von_name"] == "Luca"
    assert erledigt["erledigt_at"] is not None
    assert hc_notizen.liste(p.id, offen=True, user=DOMINIC, db=db)["notizen"] == []


def test_fremde_firma_sieht_die_eintraege_nicht():
    db = _db()
    p = _projekt(db)
    hc_notizen.anlegen(p.id, hc_notizen.NoteIn(titel="Intern"), user=DOMINIC, db=db)
    fremd = SimpleNamespace(id=9, tenant_id=2, name="Fremd", email="f@example.invalid")
    try:
        hc_notizen.liste(p.id, user=fremd, db=db)
        assert False, "hätte 404 liefern müssen"
    except Exception as e:  # HTTPException
        assert getattr(e, "status_code", None) == 404


def test_unbekannte_eintragsart_wird_abgelehnt():
    db = _db()
    p = _projekt(db)
    try:
        hc_notizen.anlegen(p.id, hc_notizen.NoteIn(kind="phantasie"), user=DOMINIC, db=db)
        assert False, "hätte 422 liefern müssen"
    except Exception as e:
        assert getattr(e, "status_code", None) == 422


def test_loeschen_protokolliert_und_entfernt():
    db = _db()
    p = _projekt(db)
    n = hc_notizen.anlegen(p.id, hc_notizen.NoteIn(titel="Weg damit"), user=DOMINIC, db=db)
    hc_notizen.loeschen(p.id, n["id"], user=LUCA, db=db)
    assert db.query(HcProjectNote).count() == 0
    assert db.query(HcAuditEvent).filter(HcAuditEvent.action == "notiz_geloescht").count() == 1
