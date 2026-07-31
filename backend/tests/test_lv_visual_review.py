"""Visuelle PDF-Auswertung: Bildvorrang, Summengates und Korrekturdurchgang."""
import json
from types import SimpleNamespace

from app.lv_import.llm import visual_review


class FakeResponses:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []
        self.responses = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payloads.pop(0)))


def _valid():
    return {
        "project_data": {
            "project_name": "MFH Test", "project_number": "23033",
            "location": "Rorschacherberg", "contractor": "Unternehmer AG",
            "offer_date": "11.07.2023",
            "building_use": "mfh", "project_type": "neubau",
        },
        "features": [
            {
                "key": "borehole_count", "value": 6, "confidence": 0.99,
                "source_page": 15, "evidence": "Total Sonden 6",
                "reason": "sichtbarer ausgefüllter Wert",
            },
            {
                "key": "borehole_length_each_m", "value": 150, "confidence": 0.99,
                "source_page": 15, "evidence": "Länge/Sonde m 150",
                "reason": "sichtbarer ausgefüllter Wert",
            },
            {
                "key": "borehole_total_m", "value": 900, "confidence": 0.99,
                "source_page": 15, "evidence": "6 × 150 m",
                "reason": "berechnet",
            },
        ],
        "costs": [
            {
                "position": "241.10", "bkp_group": "241",
                "title": "Expansion und Sicherheit Primärkreis",
                "amount": 1410, "source_page": 43, "confidence": 0.99,
                "evidence": "241.10 ... 1'410.-",
            },
            {
                "position": "241.11", "bkp_group": "241",
                "title": "Rohrleitungen Primärkreis",
                "amount": 2407, "source_page": 43, "confidence": 0.99,
                "evidence": "241.11 ... 2'407.-",
            },
        ],
        "group_totals": [
            {
                "bkp_group": "241", "title": "Total BKP 241",
                "amount": 3817, "source_page": 43, "confidence": 0.99,
            },
        ],
        "trade_total": 3817,
        "conditions": [],
        "vat_rate": None,
        "stated_subtotal_excl_vat": None,
        "stated_vat_amount": None,
        "stated_total_incl_vat": None,
        "warnings": [],
    }


def test_visuelle_werte_ueberschreiben_falschen_pdf_text():
    fake = FakeResponses([_valid()])
    result = visual_review.review(b"%PDF-test", client=fake, model="test")
    assert result["success"] is True
    assert result["attempts"] == 1
    call = fake.calls[0]
    assert call["text"]["format"]["strict"] is True
    assert call["input"][1]["content"][0]["detail"] == "high"

    features = {
        "borehole_count": {"value": 65},
        "borehole_length_each_m": {"value": 118500},
        "borehole_total_m": {"value": 7702500},
    }
    costs, metrics = visual_review.apply_result(features, result["result"])
    assert features["borehole_count"]["value"] == 6
    assert features["borehole_length_each_m"]["value"] == 150
    assert features["borehole_total_m"]["value"] == 900
    assert metrics["visual_review_costs_applied"] == 2
    assert metrics["project_data"]["project_number"] == "23033"
    assert sum(c["detected_amount"] for c in costs if not c["is_group_total"]) == 3817


def test_widerspruch_startet_einen_korrekturdurchgang():
    invalid = _valid()
    invalid["group_totals"][0]["amount"] = 9999
    fake = FakeResponses([invalid, _valid()])
    result = visual_review.review(b"%PDF-test", client=fake, model="test")
    assert result["success"] is True
    assert result["attempts"] == 2
    correction_prompt = fake.calls[1]["input"][1]["content"][1]["text"]
    assert "BKP 241" in correction_prompt


def test_bleibender_summenfehler_blockiert_freigabe():
    invalid = _valid()
    invalid["trade_total"] = 9999
    result = visual_review.review(
        b"%PDF-test", client=FakeResponses([invalid, invalid]), model="test",
    )
    assert result["success"] is False
    assert result["attempts"] == 2
    assert any("Gewerktotal" in issue for issue in result["issues"])


def test_fokussierte_technikpruefung_sendet_pdf_nur_einmal():
    focused = _valid()
    focused["costs"] = []
    focused["group_totals"] = []
    focused["trade_total"] = None
    fake = FakeResponses([focused])
    result = visual_review.review(
        b"%PDF-test", client=fake, model="test",
        require_costs=False, allow_correction=False,
    )
    assert result["success"] is True
    assert result["attempts"] == 1
    assert len(fake.calls) == 1


def test_erzeugertyp_ist_keine_einzelfeature_mehr():
    result = _valid()
    result["features"].append({
        "key": "generator_type", "value": "Sole/Wasser-Wärmepumpe",
        "confidence": 0.98, "source_page": 8,
        "evidence": "Erdsonden-Wärmepumpe", "reason": "Solekreis sichtbar",
    })
    features = {}
    visual_review.apply_result(features, result)
    assert "generator_type" not in features


def test_erdsonden_widerspruch_wird_erkannt():
    invalid = _valid()
    invalid["features"][2]["value"] = 7702500
    issues = visual_review.validate(invalid)
    assert any("Erdsondenrechnung" in issue for issue in issues)


def test_fehlender_api_key_ist_kein_stiller_erfolg(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("LV_VISUAL_REVIEW_ENABLED", "true")
    result = visual_review.review(b"%PDF-test")
    assert result["called"] is False
    assert result["success"] is False
    assert result["visual_review_required"] is True


def test_globale_limits_werden_im_visual_call_verwendet(monkeypatch):
    monkeypatch.setenv("LV_LLM_MAX_OUTPUT_TOKENS", "6000")
    monkeypatch.setenv("LV_VISUAL_REVIEW_TIMEOUT_SECONDS", "180")
    monkeypatch.setenv("LV_LLM_STORE_RESPONSES", "false")
    fake = FakeResponses([_valid()])
    result = visual_review.review(b"%PDF-test", client=fake, model="test")
    assert result["success"] is True
    assert result["llm_calls"] == 1
    # Ein Wert unterhalb der harten Obergrenze wird übernommen.
    assert fake.calls[0]["max_output_tokens"] == 6000
    assert fake.calls[0]["timeout"] == 180
    assert fake.calls[0]["store"] is False


def test_umgebungswerte_koennen_die_harten_grenzen_nicht_ueberschreiten(monkeypatch):
    """Die Obergrenzen gelten immer — eine Variable darf nur senken."""
    from app.lv_import.llm import budget as b

    monkeypatch.setenv("LV_LLM_MAX_OUTPUT_TOKENS", "999999")
    monkeypatch.setenv("LV_LLM_MAX_CALLS_PER_IMPORT", "99")
    monkeypatch.setenv("LV_LLM_MAX_COST_USD", "500")
    monkeypatch.setenv("LV_VISUAL_REVIEW_TIMEOUT_SECONDS", "9999")
    gedeckelt = b.ImportLlmBudget.from_env()
    assert gedeckelt.max_output_tokens == b.HARD_MAX_OUTPUT_TOKENS == 12000
    assert gedeckelt.max_calls == b.HARD_MAX_CALLS == 5
    assert gedeckelt.max_cost_usd == b.HARD_MAX_COST_USD == 3.0
    assert b.timeout_seconds() == b.HARD_TIMEOUT_SECONDS == 300.0


def test_call_und_kostenlimit_stoppen_weitere_aufrufe(monkeypatch):
    monkeypatch.setenv("LV_LLM_MAX_CALLS_PER_IMPORT", "0")
    fake = FakeResponses([_valid()])
    result = visual_review.review(b"%PDF-test", client=fake, model="test")
    assert result["success"] is False
    assert result["llm_stop_reason"] == "call_limit_reached"
    assert fake.calls == []


def test_llm_global_deaktivierbar(monkeypatch):
    monkeypatch.setenv("LV_LLM_ENABLED", "false")
    fake = FakeResponses([_valid()])
    result = visual_review.review(b"%PDF-test", client=fake, model="test")
    assert result["called"] is False
    assert fake.calls == []


def test_fehlende_technikwerte_waehlen_nur_passende_parserseiten():
    pages = [
        {"page": 3, "text": "Allgemeine Bedingungen und Garantie"},
        {"page": 8, "text": "Wärmepumpe Heizleistung 42 kW"},
        {"page": 11, "text": "6 Erdsonden, Sondenlänge 150 m"},
        {"page": 14, "text": "Umwälzpumpen 3 Stk. und Wärmezähler 2 Stk."},
        {"page": 16, "text": "Rohrleitungen Heizung 325 lfm"},
    ]
    pages_selected = visual_review.select_technical_review_pages(pages, {})
    assert pages_selected == [8, 11, 16]
    assert 3 not in pages_selected


def test_starker_techniktreffer_wird_trotz_parserwert_visuell_geprueft():
    pages = [{"page": 8, "text": "Wärmepumpe Heizleistung 42 kW"}]
    features = {
        "generator_type": {"value": "waermepumpe", "confidence": "high"},
        "generator_count": {"value": 1, "confidence": "high"},
        "generator_power_kw": {"value": 42, "confidence": "high"},
        "boreholes_present": {"value": False, "confidence": "high"},
        "borehole_count": {"value": 0, "confidence": "high"},
        "borehole_length_each_m": {"value": 0, "confidence": "high"},
        "borehole_total_m": {"value": 0, "confidence": "high"},
        "pipe_length_m": {"value": 100, "confidence": "high"},
        "pump_count": {"value": 2, "confidence": "high"},
        "heat_meter_count": {"value": 1, "confidence": "high"},
    }
    # Ein plausibler Textparserwert kann bei Formular-PDFs trotzdem aus einer
    # überlagerten bzw. falschen Tabellenzelle stammen.
    assert visual_review.select_technical_review_pages(pages, features) == [8]


def test_hydraulikschema_hat_im_knappen_seitenbudget_vorrang():
    pages = [
        {"page": 4, "text": "Prinzipschema Heizung Legende Heizung Wärmepumpe Erdsonden Umwälzpumpe"},
        {"page": 17, "text": "Wärmepumpe Heizleistung " * 8},
        {"page": 29, "text": "Umwälzpumpe " * 8},
    ]
    selected = visual_review.select_technical_review_pages(pages, {}, max_pages=2)
    assert selected[0] == 4


def test_pumpen_sind_im_strukturierten_visual_review_nicht_erlaubt():
    enum = (
        visual_review.RESPONSE_SCHEMA["properties"]["features"]["items"]
        ["properties"]["key"]["enum"]
    )
    assert "pump_count" not in enum


def test_konditionsseiten_werden_nach_relevanz_begrenzt():
    pages = [
        {"page": 2, "text": "Allgemeine Bedingungen SIA 118"},
        {"page": 40, "text": "Rabatt 6 % Skonto 2 % MWST 7.7 %"},
        {"page": 41, "text": "Baureinigung 0.5 % Bauwasser 0.3 %"},
        {"page": 42, "text": "Garantie und Haftung"},
    ]
    assert visual_review.select_commercial_review_pages(pages) == [40, 41]


def test_handschriftliche_preiszusammenstellung_wird_fuer_review_gewaehlt():
    pages = [
        {"page": 24, "text": "7 Materialspezifikation"},
        {"page": 25, "text": (
            "Preisszusammenstellung BKP 243\n"
            "243.0 Heizflächen\n243.1 Leitungen\n243.2 Apparate\n"
            "243.3 Regelorgane\n243.4 Speicher\nTotal BKP 243"
        )},
        {"page": 26, "text": "243.0 Heizflächen Stk 3"},
        {"page": 39, "text": "8. Kostenzusammenstellung"},
        {"page": 40, "text": "Brutto Rabatt Skonto MWST Netto"},
    ]
    selected = visual_review.select_cost_review_pages(pages)
    assert selected[0] == 25
    assert 40 in selected
    assert 26 not in selected


def test_fokussierte_kostenkorrektur_loescht_andere_befunde_nicht():
    original = _valid()
    original["conditions"] = [{
        "label": "Rabatt", "kind": "percent", "direction": "deduction",
        "rate_percent": None, "amount": None, "basis_amount": None,
        "status": "requested_not_priced", "order": 1, "source_page": 2,
    }]
    original["heat_emission_systems"] = [{
        "type": "Konvektor", "source_label": "Konvektor", "count": 4,
        "supplied_by": "contractor", "installation_by": "contractor",
        "confidence": 0.95, "source_page": 26, "evidence": "Konvektor Stk 4",
    }]
    corrected = _valid()
    corrected["conditions"] = []
    corrected["heat_emission_systems"] = []
    corrected["project_data"] = {key: None for key in original["project_data"]}

    merged = visual_review._merge_focused_correction(original, corrected)
    assert merged["conditions"] == original["conditions"]
    assert merged["heat_emission_systems"] == original["heat_emission_systems"]
    assert merged["project_data"] == original["project_data"]
