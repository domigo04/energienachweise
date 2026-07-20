from datetime import datetime

from app.data.projektfreigaben import kostenschaetzung_freigabe, leere_kostenschaetzung_freigabe


def test_freigegebene_kostenschaetzung_wird_als_snapshot_ausgewiesen():
    item = kostenschaetzung_freigabe(
        '{"ebf_m2": 1700, "_workflow": {'
        '"status": "freigegeben", "variante": "netto", "version_nr": 3, '
        '"freigegeben_at": "2026-07-20T10:30:00"}}',
        datetime(2026, 7, 20, 10, 31),
    )

    assert item["freigegeben"] is True
    assert item["status_label"] == "Freigegeben"
    assert item["variante"] == "netto"
    assert item["version_nr"] == 3
    assert item["updated_at"] == "2026-07-20T10:31:00"


def test_leere_kostenschaetzung_ist_nicht_begonnen():
    item = leere_kostenschaetzung_freigabe()

    assert item["status"] == "nicht_begonnen"
    assert item["freigegeben"] is False
    assert item["variante"] is None


def test_defektes_workflow_json_bleibt_fuer_projektseite_robust():
    item = kostenschaetzung_freigabe("kein json")

    assert item["status"] == "entwurf"
    assert item["freigegeben"] is False
