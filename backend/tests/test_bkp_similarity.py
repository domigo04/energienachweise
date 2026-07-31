"""Punkt 4 — BKP-spezifische Ähnlichkeit: gruppenspezifische Gewichte + faire
Behandlung fehlender Werte."""
from app.bkp_similarity import feature_similarity, bkp_similarity, ranking, BKP_WEIGHTS


def test_feature_similarity_verhaeltnis_und_kategorial():
    assert feature_similarity("generator_power_kw", 80, 80) == 1.0
    assert feature_similarity("generator_power_kw", 40, 80) == 0.5
    assert feature_similarity("generator_type", "ews_wp", "ews_wp") == 1.0
    assert feature_similarity("generator_type", "ews_wp", "gas") == 0.0
    # fehlender Wert → None (ausgeschlossen)
    assert feature_similarity("pump_count", None, 4) is None
    assert feature_similarity("pump_count", 4, "") is None


def test_erzeugung_gewichtet_erzeugermerkmale():
    ziel = {"generator_type": "ews_wp", "generator_power_kw": 82, "borehole_total_m": 720}
    ref = {"generator_type": "ews_wp", "generator_power_kw": 82, "borehole_total_m": 720}
    res = bkp_similarity(ziel, ref, "erzeugung")
    assert res["score"] == 1.0
    assert res["datenbasis"] in ("gut", "mittel")
    # nur verfügbare Merkmale gingen ein
    verfuegbar = [t for t in res["treiber"] if t["verfuegbar"]]
    assert {t["key"] for t in verfuegbar} == {"generator_type", "generator_power_kw", "borehole_total_m"}


def test_fehlende_werte_bestrafen_nicht():
    """Ein fehlendes Merkmal senkt den Score NICHT — es wird aus dem Nenner
    ausgeschlossen (nur vorhandene Merkmale zählen)."""
    ziel = {"pump_count": 4, "valve_2way_count": 6}          # ebf/rohrmeter fehlen
    ref = {"pump_count": 4, "valve_2way_count": 6}
    res = bkp_similarity(ziel, ref, "verteilung")
    assert res["score"] == 1.0     # trotz fehlender EBF/Rohrmeter volle Ähnlichkeit
    nicht_verfuegbar = [t["key"] for t in res["treiber"] if not t["verfuegbar"]]
    assert "ebf_m2" in nicht_verfuegbar and "pipe_length_m" in nicht_verfuegbar


def test_keine_gemeinsamen_merkmale_kein_score():
    ziel = {"heat_meter_count": 13}
    ref = {"generator_power_kw": 82}    # nichts gemeinsam in der Gruppe messung
    res = bkp_similarity(ziel, ref, "messung")
    assert res["score"] is None
    assert res["datenbasis"] == "keine"


def test_gruppen_gewichten_unterschiedlich():
    # Dieselben zwei Profile, aber die Gruppen betonen andere Merkmale.
    assert set(BKP_WEIGHTS["erzeugung"]) != set(BKP_WEIGHTS["verteilung"])
    assert "heat_meter_count" not in BKP_WEIGHTS["messung"]
    assert "pump_count" not in BKP_WEIGHTS["verteilung"]
    assert "generator_type" in BKP_WEIGHTS["erzeugung"]


def test_ranking_sortiert_und_haengt_fehlende_hinten_an():
    ziel = {"generator_power_kw": 80, "generator_type": "ews_wp"}
    referenzen = [
        (1, "A nah", {"generator_power_kw": 82, "generator_type": "ews_wp"}),
        (2, "B fern", {"generator_power_kw": 40, "generator_type": "gas"}),
        (3, "C ohne", {"pump_count": 5}),   # keine gemeinsamen Erzeugungsmerkmale
    ]
    rang = ranking(ziel, referenzen, "erzeugung")
    assert rang[0]["ref_id"] == 1
    assert rang[-1]["ref_id"] == 3         # score None ganz hinten
    assert rang[0]["score"] > rang[1]["score"]
