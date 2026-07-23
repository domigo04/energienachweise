"""Firmen- und Plattformverwaltung inklusive datiertem Audit-Trail."""

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import Firma, Role, User
from app.models.heizungscockpit import HcAuditEvent, HcProject
from app.routers.hc_auth import AdminFirmaPatch, admin_overview, update_firma
from app.routers.hc_company_admin import (
    FirmenMemberPatch,
    ProjektVerantwortlicherPatch,
    firma_overview,
    update_member,
    update_project_responsible,
)
from app.routers.hc_projects import get_project_audit


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _setup(db):
    firma = Firma(name="Planer AG")
    fremde_firma = Firma(name="Fremde AG")
    db.add_all([firma, fremde_firma])
    db.flush()
    admin = User(
        tenant_id=firma.id,
        email="admin@planer.ch",
        password_hash="x",
        name="Anna Admin",
        role=Role.user,
        firma_role="admin",
        is_verified=True,
        is_active=True,
    )
    member = User(
        tenant_id=firma.id,
        email="beat@planer.ch",
        password_hash="x",
        name="Beat",
        role=Role.user,
        firma_role="mitglied",
        is_verified=True,
        is_active=True,
    )
    pending = User(
        tenant_id=firma.id,
        email="neu@planer.ch",
        password_hash="x",
        name="Neu",
        role=Role.user,
        firma_role="mitglied",
        is_verified=False,
        is_active=True,
    )
    foreign = User(
        tenant_id=fremde_firma.id,
        email="fremd@example.com",
        password_hash="x",
        role=Role.user,
        firma_role="admin",
        is_verified=True,
        is_active=True,
    )
    db.add_all([admin, member, pending, foreign])
    db.flush()
    project = HcProject(
        tenant_id=firma.id,
        name="Werkhof",
        erstellt_von=member.id,
        verantwortlicher_id=member.id,
    )
    foreign_project = HcProject(tenant_id=fremde_firma.id, name="Fremd")
    db.add_all([project, foreign_project])
    db.commit()
    return firma, fremde_firma, admin, member, pending, foreign, project, foreign_project


class FirmenverwaltungTest(unittest.TestCase):
    def test_overview_ist_mandantengetrennt_und_schlank(self):
        db = _db()
        _, _, admin, member, pending, foreign, project, foreign_project = _setup(db)

        result = firma_overview(admin, db)

        self.assertEqual({item["id"] for item in result["mitglieder"]}, {admin.id, member.id, pending.id})
        self.assertNotIn(foreign.id, {item["id"] for item in result["mitglieder"]})
        self.assertEqual([item["id"] for item in result["projekte"]], [project.id])
        self.assertNotIn(foreign_project.id, [item["id"] for item in result["projekte"]])
        self.assertEqual(result["kennzahlen"]["offene_registrierungen"], 1)

    def test_mitglied_freigeben_und_zweiten_admin_ernennen_wird_protokolliert(self):
        db = _db()
        _, _, admin, member, pending, *_ = _setup(db)

        approved = update_member(
            pending.id,
            FirmenMemberPatch(is_verified=True),
            admin,
            db,
        )
        promoted = update_member(
            member.id,
            FirmenMemberPatch(firma_role="admin"),
            admin,
            db,
        )

        self.assertTrue(approved["is_verified"])
        self.assertEqual(promoted["firma_role"], "admin")
        events = db.query(HcAuditEvent).order_by(HcAuditEvent.id).all()
        self.assertEqual([event.action for event in events], [
            "firmenmitglied_aktualisiert",
            "firmenmitglied_aktualisiert",
        ])
        self.assertTrue(all(event.created_at is not None for event in events))
        self.assertTrue(all(event.actor_name == "Anna Admin" for event in events))

    def test_letzter_aktiver_firmenadmin_bleibt_erhalten(self):
        db = _db()
        _, _, admin, *_ = _setup(db)

        with self.assertRaises(HTTPException) as error:
            update_member(
                admin.id,
                FirmenMemberPatch(firma_role="mitglied"),
                admin,
                db,
            )

        self.assertEqual(error.exception.status_code, 409)

    def test_verantwortung_nur_an_aktive_person_der_eigenen_firma(self):
        db = _db()
        _, _, admin, member, _, foreign, project, _ = _setup(db)

        updated = update_project_responsible(
            project.id,
            ProjektVerantwortlicherPatch(verantwortlicher_id=admin.id),
            admin,
            db,
        )
        self.assertEqual(updated["verantwortlicher_id"], admin.id)
        self.assertEqual(updated["verantwortlicher_name"], "Anna Admin")

        with self.assertRaises(HTTPException) as error:
            update_project_responsible(
                project.id,
                ProjektVerantwortlicherPatch(verantwortlicher_id=foreign.id),
                admin,
                db,
            )
        self.assertEqual(error.exception.status_code, 400)

        event = db.query(HcAuditEvent).filter(
            HcAuditEvent.action == "projektverantwortung_geaendert",
        ).one()
        self.assertEqual(event.project_id, project.id)
        self.assertIsNotNone(event.created_at)
        protocol = get_project_audit(project.id, 100, member, db)
        self.assertEqual(protocol[0]["action"], "projektverantwortung_geaendert")
        self.assertEqual(protocol[0]["actor_name"], "Anna Admin")
        self.assertIsNotNone(protocol[0]["created_at"])

    def test_plattformadmin_sieht_firmenzahlen_und_kann_firma_sperren(self):
        db = _db()
        firma, _, _, _, _, _, _, _ = _setup(db)
        platform = User(
            tenant_id=firma.id,
            email="platform@example.com",
            password_hash="x",
            role=Role.admin,
            is_verified=True,
            is_active=True,
        )
        db.add(platform)
        db.commit()

        overview = admin_overview(platform, db)
        self.assertEqual(overview["kennzahlen"]["firmen"], 2)
        self.assertEqual(overview["kennzahlen"]["projekte"], 2)

        updated = update_firma(
            firma.id,
            AdminFirmaPatch(is_active=False),
            platform,
            db,
        )
        self.assertFalse(updated["is_active"])
        event = db.query(HcAuditEvent).filter(HcAuditEvent.action == "firma_aktualisiert").one()
        self.assertEqual(event.tenant_id, firma.id)
        self.assertIsNotNone(event.created_at)


if __name__ == "__main__":
    unittest.main()
