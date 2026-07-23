"""Explizite Schema-Stände und nachvollziehbares Änderungsprotokoll."""

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.auth import Firma, Role, User
from app.models.heizungscockpit import HcAuditEvent, HcProject, HcSchema, HcSchemaRevision
from app.routers.hc_schema import (
    create_schema_revision,
    list_schema_audit,
    list_schema_revisions,
    restore_schema_revision,
)
from app.schemas.hc_schemas import SchemaRevisionCreate


def _frische_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _umgebung(db):
    firma = Firma(name="Planer AG")
    andere = Firma(name="Andere AG")
    db.add_all([firma, andere])
    db.flush()
    user = User(
        tenant_id=firma.id,
        email="dominic@example.com",
        password_hash="x",
        name="Dominic",
        role=Role.user,
        is_verified=True,
    )
    fremd = User(
        tenant_id=andere.id,
        email="fremd@example.com",
        password_hash="x",
        role=Role.user,
        is_verified=True,
    )
    db.add_all([user, fremd])
    db.flush()
    projekt = HcProject(tenant_id=firma.id, name="Heizzentrale", erstellt_von=user.id)
    db.add(projekt)
    db.flush()
    schema = HcSchema(
        tenant_id=firma.id,
        project_id=projekt.id,
        name="Prinzip",
        graph_json='{"nodes":[],"edges":[]}',
    )
    db.add(schema)
    db.commit()
    return user, fremd, projekt, schema


class SchemaVersionenTest(unittest.TestCase):
    def test_stand_speichert_graph_berechnung_benutzer_und_diff(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        graph = {
            "nodes": [
                {"id": "wp-1", "type": "waermeerzeuger", "position": {"x": 10, "y": 20}, "data": {"label": "WP"}},
                {"id": "sp-1", "type": "speicher", "position": {"x": 200, "y": 20}, "data": {"label": "Speicher"}},
            ],
            "edges": [{"id": "vl-1", "source": "wp-1", "target": "sp-1", "data": {"layer_id": "heizung_vl"}}],
        }
        stand = create_schema_revision(
            schema.id,
            SchemaRevisionCreate(
                bezeichnung="Vorprojekt",
                graph=graph,
                calculation={"darf_nicht": "dem Client vertraut werden"},
            ),
            user,
            db,
        )

        self.assertEqual(stand.version_nr, 1)
        self.assertEqual(stand.created_by_name, "Dominic")
        self.assertEqual(stand.node_count, 2)
        self.assertEqual(stand.edge_count, 1)
        self.assertIn("leitung_results", stand.calculation)
        self.assertNotIn("darf_nicht", stand.calculation)
        self.assertEqual(stand.diff["zusammenfassung"]["bauteile_hinzugefuegt"], 2)
        self.assertEqual(stand.diff["zusammenfassung"]["leitungen_hinzugefuegt"], 1)
        self.assertEqual(db.get(HcSchema, schema.id).graph_json, db.query(HcSchemaRevision).one().graph_json)

        event = db.query(HcAuditEvent).one()
        self.assertEqual(event.action, "schema_stand_gespeichert")
        self.assertEqual(event.actor_id, user.id)

    def test_zweiter_stand_protokolliert_platzierung_loeschung_und_aenderung(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        erster_graph = {
            "nodes": [
                {"id": "wp", "type": "waermeerzeuger", "position": {"x": 0, "y": 0}, "data": {"leistung_kw": 40}},
                {"id": "alt", "type": "ventil", "position": {"x": 50, "y": 0}, "data": {}},
            ],
            "edges": [{"id": "e-alt", "source": "wp", "target": "alt"}],
        }
        create_schema_revision(
            schema.id, SchemaRevisionCreate(graph=erster_graph), user, db,
        )
        zweiter_graph = {
            "nodes": [
                {"id": "wp", "type": "waermeerzeuger", "position": {"x": 20, "y": 0}, "data": {"leistung_kw": 55}},
                {"id": "neu", "type": "pumpe", "position": {"x": 80, "y": 0}, "data": {}},
            ],
            "edges": [{"id": "e-neu", "source": "wp", "target": "neu"}],
        }
        stand = create_schema_revision(
            schema.id, SchemaRevisionCreate(graph=zweiter_graph), user, db,
        )

        summary = stand.diff["zusammenfassung"]
        self.assertEqual(stand.version_nr, 2)
        self.assertEqual(summary["bauteile_hinzugefuegt"], 1)
        self.assertEqual(summary["bauteile_entfernt"], 1)
        self.assertEqual(summary["bauteile_geaendert"], 1)
        self.assertEqual(summary["leitungen_hinzugefuegt"], 1)
        self.assertEqual(summary["leitungen_entfernt"], 1)
        changed = stand.diff["bauteile"]["geaendert"][0]["felder"]
        self.assertIn("position", changed)
        self.assertIn("data.leistung_kw", changed)

    def test_alter_stand_wird_arbeitsstand_ohne_historie_zu_ueberschreiben(self):
        db = _frische_db()
        user, _, _, schema = _umgebung(db)
        v1 = create_schema_revision(
            schema.id,
            SchemaRevisionCreate(graph={"nodes": [{"id": "eins"}], "edges": []}),
            user,
            db,
        )
        create_schema_revision(
            schema.id,
            SchemaRevisionCreate(graph={"nodes": [{"id": "zwei"}], "edges": []}),
            user,
            db,
        )

        restored = restore_schema_revision(schema.id, v1.id, user, db)
        self.assertEqual(restored.graph["nodes"][0]["id"], "eins")
        self.assertEqual(db.query(HcSchemaRevision).count(), 2)
        self.assertEqual(list_schema_revisions(schema.id, 50, user, db)[0].version_nr, 2)
        self.assertEqual(list_schema_audit(schema.id, 100, user, db)[0].action, "schema_stand_wiederhergestellt")

    def test_fremde_firma_sieht_keine_schema_staende(self):
        db = _frische_db()
        user, fremd, _, schema = _umgebung(db)
        create_schema_revision(
            schema.id,
            SchemaRevisionCreate(graph={"nodes": [], "edges": []}),
            user,
            db,
        )

        with self.assertRaises(HTTPException) as exc:
            list_schema_revisions(schema.id, 50, fremd, db)
        self.assertEqual(exc.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
