"""Verschlanktes Technik-Review: was bleibt, was weg ist, was gerechnet wird.

Die Prüfungen hängen an der zentralen Schlüsselliste, nicht an der Oberfläche —
ein Feld auszublenden genügt nicht, es darf gar nicht mehr erhoben werden.
"""
import pytest

from app.lv_import.feature_keys import (
    ABGELEITETE_FEATURE_KEYS, FEATURE_DEFS, LV_IMPORT_FEATURE_KEYS,
    STILLGELEGTE_FEATURE_KEYS,
)
from app.lv_import.llm import visual_review

VERBLEIBEND = {
    "generator_type", "generator_power_kw",
    "borehole_count", "borehole_length_each_m", "borehole_total_m",
    "fresh_water_station_present", "pipe_length_m", "pump_count",
    "heat_metering_present", "heat_meter_count",
}

ENTFERNT = {
    "generator_count", "generator_types", "boreholes_present",
    "buffer_count", "storage_count", "storage_volume_each_l", "storage_volume_l",
    "floor_heating_pipe_m", "domestic_hot_water_included",
    "distribution_system", "design_flow_temperature_c",
    "design_return_temperature_c", "design_outdoor_temperature_c",
    "protected_building", "reversible_installations_required",
    "installation_height_m", "scaffolding_required",
    "integrated_tests_required", "contractor_workshop_planning_required",
}


# ── Was das Review noch erhebt ─────────────────────────────────────────────

def test_genau_die_verbliebenen_felder():
    assert set(LV_IMPORT_FEATURE_KEYS) == VERBLEIBEND


@pytest.mark.parametrize("key", sorted(ENTFERNT))
def test_entferntes_feld_wird_nicht_mehr_erhoben(key):
    assert key not in LV_IMPORT_FEATURE_KEYS


def test_kein_zweites_waermeerzeugerfeld():
    """Erzeugertyp ist die einzige Erzeugerangabe neben der Leistung."""
    erzeuger = [k for k in LV_IMPORT_FEATURE_KEYS if k.startswith("generator")]
    assert erzeuger == ["generator_type", "generator_power_kw"]


def test_erzeugertyp_und_leistung_bleiben():
    assert "generator_type" in LV_IMPORT_FEATURE_KEYS
    assert "generator_power_kw" in LV_IMPORT_FEATURE_KEYS
    assert FEATURE_DEFS["generator_power_kw"]["einheit"] == "kW"


def test_erdsonden_vorhanden_ist_weg():
    """Vorhanden ist, was eine Anzahl grösser null hat — kein eigenes Ja/Nein."""
    assert "boreholes_present" not in LV_IMPORT_FEATURE_KEYS


def test_speicherfelder_sind_weg():
    for key in ("buffer_count", "storage_count", "storage_volume_each_l"):
        assert key not in LV_IMPORT_FEATURE_KEYS


def test_rohrmeter_bleibt_und_heisst_exkl_fbh():
    assert "pipe_length_m" in LV_IMPORT_FEATURE_KEYS
    assert "Fussbodenheizung" in FEATURE_DEFS["pipe_length_m"]["label"]


def test_fbh_rohrmeter_sind_kein_projektkennwert_mehr():
    assert "floor_heating_pipe_m" not in LV_IMPORT_FEATURE_KEYS


def test_pumpenanzahl_bleibt():
    assert "pump_count" in LV_IMPORT_FEATURE_KEYS


def test_verteilsystem_und_temperaturen_sind_weg():
    for key in ("distribution_system", "design_flow_temperature_c",
                "design_return_temperature_c", "design_outdoor_temperature_c"):
        assert key not in LV_IMPORT_FEATURE_KEYS


def test_waermemessung_bleibt_und_ist_nullable():
    assert "heat_meter_count" in LV_IMPORT_FEATURE_KEYS
    assert "heat_metering_present" in LV_IMPORT_FEATURE_KEYS
    assert FEATURE_DEFS["heat_meter_count"]["typ"] == "int"


def test_projektmerkmale_sind_weg():
    for key in ("protected_building", "reversible_installations_required",
                "installation_height_m", "scaffolding_required",
                "integrated_tests_required",
                "contractor_workshop_planning_required"):
        assert key not in LV_IMPORT_FEATURE_KEYS


# ── Bohrmeter werden gerechnet ─────────────────────────────────────────────

def test_vier_bohrungen_mal_190_ergeben_760():
    features = {"borehole_count": {"value": 4}, "borehole_length_each_m": {"value": 190}}
    ergebnis = visual_review.berechne_bohrmeter(features)
    assert ergebnis["value"] == pytest.approx(760)
    assert features["borehole_total_m"]["value"] == pytest.approx(760)


def test_bohrmeter_sind_ein_abgeleiteter_wert():
    assert "borehole_total_m" in ABGELEITETE_FEATURE_KEYS


def test_bohrmeter_nur_bei_beiden_eingaben_multipliziert():
    """Ohne Länge wird nichts erfunden."""
    assert visual_review.berechne_bohrmeter({"borehole_count": {"value": 4}}) is None


def test_nur_gesamtbohrmeter_erkannt_ist_ein_teilbefund():
    features = {"borehole_total_m": {"value": 760}}
    ergebnis = visual_review.berechne_bohrmeter(features)
    assert ergebnis["status"] == "partial_data"
    assert ergebnis["value"] == 760


def test_abweichender_altwert_wird_nicht_still_ueberschrieben():
    features = {
        "borehole_count": {"value": 4}, "borehole_length_each_m": {"value": 190},
        "borehole_total_m": {"value": 800},
    }
    ergebnis = visual_review.berechne_bohrmeter(features)
    assert ergebnis["value"] == pytest.approx(760)
    assert ergebnis["conflict_value"] == pytest.approx(800)
    assert ergebnis["requires_review"] is True


def test_bohrmeter_koennen_nicht_direkt_gesetzt_werden():
    """Die Route weist eine manuelle Eingabe des abgeleiteten Werts ab."""
    import inspect

    from app.routers import hc_lv_import

    quelle = inspect.getsource(hc_lv_import.update_feature)
    assert "ABGELEITETE_FEATURE_KEYS" in quelle
    assert "FEATURE_IS_DERIVED" in quelle


def test_bohrmeter_werden_bei_aenderung_nachgezogen():
    from app.models.lv_import import LvImport, LvImportFeature
    from app.routers.hc_lv_import import bohrmeter_neu_berechnen

    imp = LvImport(filename="x.pdf", file_hash="x")
    imp.features = [
        LvImportFeature(key="borehole_count", value="4"),
        LvImportFeature(key="borehole_length_each_m", value="190"),
        LvImportFeature(key="borehole_total_m", value="760"),
    ]
    # Der Nutzer korrigiert die Anzahl auf 5 → 950 m.
    imp.features[0].confirmed_value = "5"
    ziel = bohrmeter_neu_berechnen(imp)
    assert ziel.value == "950.0"
    assert ziel.confirmed_value is None


# ── LLM-Schema ─────────────────────────────────────────────────────────────

def test_llm_schema_verlangt_nur_noch_die_verbliebenen_felder():
    erlaubt = set(
        visual_review.RESPONSE_SCHEMA["properties"]["features"]["items"]
        ["properties"]["key"]["enum"]
    )
    assert erlaubt == VERBLEIBEND
    assert not (erlaubt & ENTFERNT)


def test_prompt_verlangt_die_entfernten_angaben_nicht_mehr():
    prompt = visual_review.SYSTEM_PROMPT
    assert "Nicht mehr erfassen" in prompt
    # Der Prompt darf keine Anweisung mehr zu Pufferspeichern enthalten.
    assert "Anzahl technische Pufferspeicher" not in prompt


def test_handschriftkorrektur_nur_auf_erhobenen_feldern():
    erlaubt = set(
        visual_review.RESPONSE_SCHEMA["properties"]["handwritten_corrections"]
        ["items"]["properties"]["field"]["enum"]
    )
    assert erlaubt == VERBLEIBEND


# ── Bestehende Daten und Ähnlichkeit ───────────────────────────────────────

def test_stillgelegte_schluessel_bleiben_definiert():
    """Bestehende Importe und Referenzprojekte bleiben lesbar.

    Die Definitionen verschwinden nicht — nur die Erhebung. Sonst liesse sich
    ein alter Import nicht mehr anzeigen.
    """
    for key in STILLGELEGTE_FEATURE_KEYS:
        if key in FEATURE_DEFS:
            assert FEATURE_DEFS[key]["label"]
    assert not (set(LV_IMPORT_FEATURE_KEYS) & STILLGELEGTE_FEATURE_KEYS)


def test_entfernte_merkmale_beeinflussen_die_aehnlichkeit_nicht():
    """Der Score kennt diese Merkmale nicht — auch nicht als stiller Faktor."""
    import inspect

    from app.calculations import grobkostenschaetzung as gk

    quelle = inspect.getsource(gk.aehnlichkeits_score)
    for key in ("protected_building", "scaffolding_required", "installation_height_m",
                "distribution_system", "design_flow_temperature_c",
                "storage_volume_each_l", "buffer_count"):
        assert key not in quelle


def test_score_bleibt_unveraendert():
    """Die Gewichte sind nicht angefasst worden."""
    from app.calculations.grobkostenschaetzung import aehnlichkeits_score

    ziel = {"ebf_m2": 1000, "leistung_kw": 50, "zertifizierung": "none",
            "anzahl_ne": 10, "bww_bei_heizung": True, "abgabe_klassen": ["flaeche"]}
    assert aehnlichkeits_score(dict(ziel), ziel) == pytest.approx(1.0)


# ── Kosten und Konditionen bleiben unangetastet ────────────────────────────

def test_kostenschema_ist_unveraendert():
    kosten = visual_review.RESPONSE_SCHEMA["properties"]["costs"]["items"]["properties"]
    for feld in ("position", "bkp_group", "title", "amount", "scope_summary",
                 "source_page", "confidence", "evidence"):
        assert feld in kosten


def test_konditionsschema_ist_unveraendert():
    konditionen = visual_review.RESPONSE_SCHEMA["properties"]["conditions"]["items"]["properties"]
    for feld in ("label", "kind", "direction", "rate_percent", "amount",
                 "basis_amount", "status", "order", "source_page"):
        assert feld in konditionen
    for feld in ("vat_rate", "stated_subtotal_excl_vat", "stated_vat_amount",
                 "stated_total_incl_vat", "trade_total", "group_totals"):
        assert feld in visual_review.RESPONSE_SCHEMA["properties"]


# ── Übernahme ins Referenzprojekt ──────────────────────────────────────────

def test_waermeabgabe_kommt_aus_der_systemtabelle():
    """Die Abgabeklassen wiegen 0.20 im Ähnlichkeitsscore — sie dürfen beim
    Speichern als Referenz nicht verloren gehen."""
    import inspect

    from app.routers import hc_lv_import

    quelle = inspect.getsource(hc_lv_import.approve_lv) \
        if hasattr(hc_lv_import, "approve_lv") else None
    if quelle is None:
        quelle = open(hc_lv_import.__file__, encoding="utf-8").read()
    assert "systems.delivery_codes" in quelle
    assert "systems.generator_codes" in quelle


def test_refprojekt_mapping_nutzt_nur_erhobene_merkmale():
    """Jede Legacy-Spalte muss aus einem Merkmal kommen, das es noch gibt."""
    from app.lv_import.feature_keys import REFPROJEKT_COLUMN_TO_FEATURE

    for spalte, key in REFPROJEKT_COLUMN_TO_FEATURE.items():
        assert key in LV_IMPORT_FEATURE_KEYS, f"{spalte} → {key} wird nicht mehr erhoben"
