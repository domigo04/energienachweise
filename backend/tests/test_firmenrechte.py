"""Firmenweite Projekte, Firmenadmin-Antrag und Mandantentrennung."""

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import Firma, Role, User
from app.models.heizungscockpit import HcGroupTemplate, HcGruppeTyp, HcProject
from app.routers.hc_auth import UserPatch, request_firma_admin, update_user
from app.routers.hc_groups import list_templates
from app.routers.hc_projects import (
    _company_query,
    _get_company_project,
    delete_project_permanent,
)


def _frische_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _firma_mit_usern(db):
    firma = Firma(name="Planer AG")
    andere_firma = Firma(name="Andere AG")
    db.add_all([firma, andere_firma])
    db.flush()
    anna = User(
        tenant_id=firma.id, email="anna@example.com", password_hash="x",
        name="Anna", role=Role.user, firma_role="mitglied", is_verified=True,
    )
    beat = User(
        tenant_id=firma.id, email="beat@example.com", password_hash="x",
        name="Beat", role=Role.user, firma_role="mitglied", is_verified=True,
    )
    fremd = User(
        tenant_id=andere_firma.id, email="fremd@example.com", password_hash="x",
        role=Role.user, firma_role="admin", is_verified=True,
    )
    db.add_all([anna, beat, fremd])
    db.flush()
    return firma, andere_firma, anna, beat, fremd


class FirmenrechteTest(unittest.TestCase):
    def test_projekte_sind_firmenweit_aber_nicht_firmenuebergreifend(self):
        db = _frische_db()
        firma, andere_firma, anna, beat, _ = _firma_mit_usern(db)
        eigenes = HcProject(tenant_id=firma.id, erstellt_von=anna.id, name="Anna")
        kollege = HcProject(tenant_id=firma.id, erstellt_von=beat.id, name="Beat")
        fremd = HcProject(tenant_id=andere_firma.id, name="Fremd")
        db.add_all([eigenes, kollege, fremd])
        db.commit()

        sichtbare_ids = {p.id for p in _company_query(db, anna).all()}
        self.assertEqual(sichtbare_ids, {eigenes.id, kollege.id})
        self.assertEqual(_get_company_project(db, anna, kollege.id).id, kollege.id)
        with self.assertRaises(HTTPException) as exc:
            _get_company_project(db, anna, fremd.id)
        self.assertEqual(exc.exception.status_code, 404)

    def test_endgueltig_loeschen_nur_als_firmenadmin(self):
        db = _frische_db()
        firma, _, anna, beat, _ = _firma_mit_usern(db)
        projekt = HcProject(tenant_id=firma.id, erstellt_von=anna.id, name="Gemeinsam")
        db.add(projekt)
        db.commit()

        with self.assertRaises(HTTPException) as exc:
            delete_project_permanent(projekt.id, anna, db)
        self.assertEqual(exc.exception.status_code, 403)
        self.assertIsNotNone(db.get(HcProject, projekt.id))

        beat.firma_role = "admin"
        db.commit()
        delete_project_permanent(projekt.id, beat, db)
        self.assertIsNone(db.get(HcProject, projekt.id))

    def test_firmenadmin_wird_beantragt_und_bestaetigt(self):
        db = _frische_db()
        firma, _, anna, _, _ = _firma_mit_usern(db)
        plattformadmin = User(
            tenant_id=firma.id, email="plattform@example.com", password_hash="x",
            role=Role.admin, firma_role="mitglied", is_verified=True,
        )
        db.add(plattformadmin)
        db.commit()

        antwort = request_firma_admin(anna, db)
        self.assertIsNotNone(antwort.firma_admin_beantragt_at)
        self.assertEqual(antwort.firma_role, "mitglied")

        bestaetigt = update_user(
            anna.id, UserPatch(firma_role="admin"), plattformadmin, db,
        )
        self.assertEqual(bestaetigt.firma_role, "admin")
        self.assertIsNotNone(bestaetigt.firma_admin_bestaetigt_at)
        self.assertEqual(bestaetigt.firma_admin_bestaetigt_von, plattformadmin.id)

    def test_einzelkonto_kann_keinen_firmenadmin_beantragen(self):
        db = _frische_db()
        firma = Firma(name="Solo (Einzelperson)")
        db.add(firma)
        db.flush()
        user = User(
            tenant_id=firma.id, email="solo@example.com", password_hash="x",
            role=Role.user, firma_role="mitglied", is_verified=True,
        )
        db.add(user)
        db.commit()

        with self.assertRaises(HTTPException) as exc:
            request_firma_admin(user, db)
        self.assertEqual(exc.exception.status_code, 409)

    def test_firmeneigene_vorlagen_bleiben_im_mandanten(self):
        db = _frische_db()
        firma, andere_firma, anna, _, _ = _firma_mit_usern(db)
        system = HcGroupTemplate(
            tenant_id=1, name="System", typ=HcGruppeTyp.fbh,
            standard_vl=35, standard_rl=28, is_system=True,
        )
        eigene = HcGroupTemplate(
            tenant_id=firma.id, name="Eigene", typ=HcGruppeTyp.hk,
            standard_vl=50, standard_rl=40, is_system=False,
        )
        fremde = HcGroupTemplate(
            tenant_id=andere_firma.id, name="Fremde", typ=HcGruppeTyp.hk,
            standard_vl=60, standard_rl=45, is_system=False,
        )
        db.add_all([system, eigene, fremde])
        db.commit()

        namen = {vorlage.name for vorlage in list_templates(anna, db)}
        self.assertIn("System", namen)
        self.assertIn("Eigene", namen)
        self.assertNotIn("Fremde", namen)


if __name__ == "__main__":
    unittest.main()
