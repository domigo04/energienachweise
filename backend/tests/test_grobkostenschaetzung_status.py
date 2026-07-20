"""Status-/Snapshot-Verhalten der gespeicherten Grobkostenschätzung."""
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.heizungscockpit import HcProject
from app.models.kv import Kostenschaetzung
from app.routers.hc_grobkostenschaetzung import (
    SchaetzungStatusPatch,
    _dokumentiere_manuelle_werte,
    _mit_referenzdetails,
    _trenne_referenzdetails,
    update_schaetzung_status,
)


class _Query:
    def __init__(self, wert):
        self.wert = wert

    def filter(self, *args):
        return self

    def first(self):
        return self.wert


class _Db:
    def __init__(self, ks=None, project=None):
        self.ks = ks
        self.project = project
        self.commits = 0

    def query(self, model):
        return _Query(self.project if model is HcProject else self.ks)

    def commit(self):
        self.commits += 1

    def add(self, obj):
        self.added = obj


def _ks(unvollstaendig=False):
    result = {
        "brutto": {"ist_unvollstaendig": unvollstaendig},
        "netto": {"ist_unvollstaendig": unvollstaendig},
    }
    return SimpleNamespace(
        result_json=json.dumps(result),
        inputs_json=json.dumps({
            "_workflow": {"status": "entwurf", "version_nr": 0},
            "_referenzdetails": {},
        }),
    )


def test_vollstaendige_schaetzung_wird_geprueft_freigegeben_und_entsperrt():
    ks = _ks()
    db = _Db(ks=ks)
    user = SimpleNamespace(id=7, tenant_id=1)

    result = update_schaetzung_status(3, SchaetzungStatusPatch(status="fachlich_geprueft"), user, db)
    assert result["status"] == "fachlich_geprueft"

    result = update_schaetzung_status(3, SchaetzungStatusPatch(status="freigegeben"), user, db)
    assert result["status"] == "freigegeben"
    assert result["freigegeben_at"] is not None
    workflow = json.loads(ks.inputs_json)["_workflow"]
    assert workflow["freigegeben_von"] == 7
    assert workflow["version_nr"] == 1
    assert db.added.version_nr == 1

    result = update_schaetzung_status(3, SchaetzungStatusPatch(status="entwurf"), user, db)
    assert result == {"status": "entwurf", "freigegeben_at": None, "version_nr": 1}
    assert json.loads(ks.inputs_json)["_workflow"]["freigegeben_von"] is None


def test_unvollstaendige_schaetzung_kann_nicht_geprueft_werden():
    db = _Db(ks=_ks(unvollstaendig=True))
    with pytest.raises(HTTPException) as exc:
        update_schaetzung_status(
            3, SchaetzungStatusPatch(status="fachlich_geprueft"),
            SimpleNamespace(id=7, tenant_id=1), db,
        )
    assert exc.value.status_code == 409
    assert "Unvollständige" in exc.value.detail


def test_freigabe_ohne_fachliche_pruefung_wird_abgelehnt():
    db = _Db(ks=_ks())
    with pytest.raises(HTTPException) as exc:
        update_schaetzung_status(
            3, SchaetzungStatusPatch(status="freigegeben"),
            SimpleNamespace(id=7, tenant_id=1), db,
        )
    assert exc.value.status_code == 409
    assert "fachlich geprüft" in exc.value.detail


def test_referenzdetails_werden_vom_lade_resultat_getrennt_und_reproduziert():
    result = {
        "brutto": {"gruppen": [{"positionen": [{"bkp_nr": "242.3", "herkunft": [{"id": 4}]}]}]},
        "netto": {"gruppen": [{"positionen": [{"bkp_nr": "242.3", "herkunft": [{"id": 5}]}]}]},
    }
    kompakt, details = _trenne_referenzdetails(result)
    assert "herkunft" not in kompakt["brutto"]["gruppen"][0]["positionen"][0]
    assert details["brutto"]["242.3"] == [{"id": 4}]
    reproduziert = _mit_referenzdetails(kompakt, details)
    assert reproduziert["netto"]["gruppen"][0]["positionen"][0]["herkunft"] == [{"id": 5}]


def test_manueller_wert_erhaelt_serverseitigen_audit_trail():
    inputs = {
        "manuelle_betraege": {"netto": {"243.3a": 42000}},
        "manuelle_notizen": {"netto": {"243.3a": {
            "begruendung": " Richtofferte Unternehmer ", "quelle": "Offerte 18.07.2026",
            "bearbeiter": "Manipuliert", "geaendert_at": "Alt",
        }}},
    }
    _dokumentiere_manuelle_werte(inputs, {}, SimpleNamespace(name="Dominic", email="d@example.ch"))
    notiz = inputs["manuelle_notizen"]["netto"]["243.3a"]
    assert notiz["begruendung"] == "Richtofferte Unternehmer"
    assert notiz["bearbeiter"] == "Dominic"
    assert notiz["geaendert_at"] != "Alt"
