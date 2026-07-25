"""Underlay (Hintergrund-Plan zum Nachzeichnen, § Editor #5).

Firmenweit gespeichert, getrennt vom autospeichernden Graphen. Diese Tests
sichern das Kernverhalten ab: setzen, laden, nur die Lage ändern (ohne das
Bild erneut zu senden), löschen, Grössen-/Format-Grenzen und Mandantentrennung.
Kein echtes Bild — nur eine winzige gültige Data-URL (§10).
"""

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import Firma, Role, User
from app.models.heizungscockpit import HcAuditEvent, HcProject, HcSchema
from app.routers.hc_schema import (
    delete_schema_underlay,
    get_schema_underlay,
    patch_schema_underlay,
    set_schema_underlay,
)
from app.schemas.hc_schemas import UnderlayIn, UnderlayTransformIn

_MINI_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA="


def _frische_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _umgebung(db):
    firma = Firma(name="Planer AG")
    andere = Firma(name="Andere AG")
    db.add_all([firma, andere])
    db.flush()
    user = User(tenant_id=firma.id, email="dominic@example.com", password_hash="x",
                name="Dominic", role=Role.user, is_verified=True)
    fremd = User(tenant_id=andere.id, email="fremd@example.com", password_hash="x",
                 role=Role.user, is_verified=True)
    db.add_all([user, fremd])
    db.flush()
    projekt = HcProject(tenant_id=firma.id, name="Heizzentrale", erstellt_von=user.id)
    db.add(projekt)
    db.flush()
    schema = HcSchema(tenant_id=firma.id, project_id=projekt.id, name="Prinzip",
                      graph_json='{"nodes":[],"edges":[]}')
    db.add(schema)
    db.commit()
    return user, fremd, projekt, schema


def _underlay_in(**over):
    basis = dict(mime="image/png", data=_MINI_PNG, name="Grundriss.pdf",
                 w=1600, h=1000, x=10, y=20, scale=1.0, opacity=0.6, locked=False)
    basis.update(over)
    return UnderlayIn(**basis)


class UnderlayTest(unittest.TestCase):
    def test_setzen_und_laden(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        self.assertIsNone(get_schema_underlay(schema.id, user, db))
        out = set_schema_underlay(schema.id, _underlay_in(), user, db)
        self.assertEqual(out["mime"], "image/png")
        self.assertEqual(out["w"], 1600)
        self.assertEqual(out["name"], "Grundriss.pdf")
        geladen = get_schema_underlay(schema.id, user, db)
        self.assertEqual(geladen["data"], _MINI_PNG)
        # Audit protokolliert (§9).
        self.assertTrue(db.query(HcAuditEvent).filter_by(action="underlay_gesetzt").count())

    def test_patch_aendert_nur_lage_ohne_bild(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        set_schema_underlay(schema.id, _underlay_in(), user, db)
        out = patch_schema_underlay(
            schema.id, UnderlayTransformIn(x=99, opacity=0.3, locked=True), user, db)
        self.assertEqual(out["x"], 99)
        self.assertEqual(out["opacity"], 0.3)
        self.assertTrue(out["locked"])
        self.assertEqual(out["y"], 20)          # unverändert
        self.assertEqual(out["data"], _MINI_PNG)  # Bild bleibt erhalten

    def test_opacity_und_scale_werden_geklemmt(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        out = set_schema_underlay(schema.id, _underlay_in(opacity=5, scale=0), user, db)
        self.assertLessEqual(out["opacity"], 1.0)
        self.assertGreater(out["scale"], 0)

    def test_loeschen(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        set_schema_underlay(schema.id, _underlay_in(), user, db)
        delete_schema_underlay(schema.id, user, db)
        self.assertIsNone(get_schema_underlay(schema.id, user, db))
        self.assertTrue(db.query(HcAuditEvent).filter_by(action="underlay_entfernt").count())

    def test_patch_ohne_underlay_ist_404(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        with self.assertRaises(HTTPException) as ctx:
            patch_schema_underlay(schema.id, UnderlayTransformIn(x=5), user, db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_falscher_mimetyp_abgelehnt(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        with self.assertRaises(HTTPException) as ctx:
            set_schema_underlay(schema.id, _underlay_in(mime="application/pdf"), user, db)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_zu_grosses_bild_abgelehnt(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        riesig = "data:image/png;base64," + "A" * 12_000_001
        with self.assertRaises(HTTPException) as ctx:
            set_schema_underlay(schema.id, _underlay_in(data=riesig), user, db)
        self.assertEqual(ctx.exception.status_code, 413)

    def test_fremder_mandant_sieht_schema_nicht(self):
        db = _frische_db()
        user, fremd, _, schema = _umgebung(db)
        set_schema_underlay(schema.id, _underlay_in(), user, db)
        with self.assertRaises(HTTPException) as ctx:
            get_schema_underlay(schema.id, fremd, db)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
