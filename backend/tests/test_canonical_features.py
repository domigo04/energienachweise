"""Punkt 3 — eine gemeinsame Feature-Sprache. ProjectContext UND (historische)
Referenzprojekte liefern denselben kanonischen Merkmalssatz über EIN Mapping."""
from types import SimpleNamespace

from app.features import (
    canonical_from_context, canonical_from_refprojekt, leerer_feature_satz,
)
from app.project_context import build_context
from app.lv_import.feature_keys import FEATURE_KEYS, FEATURE_TO_CONTEXT


def _n(nid, typ, data=None):
    return {"id": nid, "type": typ, "data": data or {}}


def test_context_liefert_kanonische_features():
    graph = {"nodes": [
        _n("e1", "erzeuger", {"generator_type": "ews_wp", "leistung_kw": "82"}),
        _n("es1", "erdsonden", {"sonden_anzahl": 4, "sonden_laenge_m": 180}),
        _n("sp1", "speicher", {"speicher_liter": 1500}),
        _n("g1", "gruppe", {"q_kw": "40"}),
        _n("p1", "pump"), _n("v2a", "valve2"), _n("wz1", "waermezaehler"),
    ]}
    ctx = build_context(base_data=None, graph_json=graph, parameter_rows=[])
    feats = canonical_from_context(ctx)
    assert feats["generator_type"] == "ews_wp"
    assert feats["generator_power_kw"] == 82.0
    assert feats["borehole_count"] == 4
    assert feats["borehole_total_m"] == 720.0
    assert feats["storage_volume_l"] == 1500.0
    assert feats["pump_count"] >= 1
    assert feats["heat_meter_count"] >= 1
    # Alle Schlüssel gehören zur kanonischen Sprache.
    assert set(feats).issubset(set(FEATURE_KEYS))


def test_refprojekt_generische_features_bevorzugt():
    ref = SimpleNamespace(
        features=[SimpleNamespace(key="pump_count", value="5"),
                  SimpleNamespace(key="generator_power_kw", value="90")],
        heizleistung_kw=82.0, bohrmeter=720.0, anzahl_waermemessungen=13,
        laufmeter_rohre_heizung=620.0, waermeerzeuger=[],
    )
    feats = canonical_from_refprojekt(ref)
    assert feats["pump_count"] == "5"            # generische Struktur gewinnt
    assert feats["generator_power_kw"] == "90"   # generisch, nicht Legacy 82
    assert feats["borehole_total_m"] == 720.0    # Legacy-Spalte ergänzt
    assert feats["heat_meter_count"] == 13
    assert feats["pipe_length_m"] == 620.0


def test_refprojekt_legacy_ohne_features():
    """Altes Referenzprojekt ohne generische Struktur: Legacy-Spalten +
    Erzeugertyp aus dem Freitext."""
    ref = SimpleNamespace(
        features=[], heizleistung_kw=70.0, bohrmeter=None,
        anzahl_waermemessungen=None, laufmeter_rohre_heizung=None,
        waermeerzeuger=["Sole/Wasser-Wärmepumpe"],
    )
    feats = canonical_from_refprojekt(ref)
    assert feats["generator_power_kw"] == 70.0
    assert feats["generator_type"] == "ews_wp"
    assert "pump_count" not in feats             # historisch unbekannt → fehlt (nicht 0)


def test_ein_zentrales_mapping_ist_konsistent():
    # Jeder kanonische Schlüssel des Mappings ist ein bekannter Feature-Schlüssel.
    for feature_key in FEATURE_TO_CONTEXT:
        assert feature_key in FEATURE_KEYS
    assert set(leerer_feature_satz()) == set(FEATURE_KEYS)
