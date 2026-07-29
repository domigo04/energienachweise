"""Parser-first-KI-Prüfung: Structured Output, Closed World und Vorrang des Parsers."""
import json
from types import SimpleNamespace

from app.lv_import.cost_extract import cost_rows_from_positions
from app.lv_import.llm import document_review
from app.lv_import.review_packet import build_review_packet


class FakeOpenAI:
    def __init__(self, payload):
        self.calls = []
        self.payload = payload
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content=json.dumps(self.payload), refusal=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def _positions():
    return [
        {
            "pos_nr": "243.101", "bkp_nr": "243",
            "beschreibung": "Hocheffizienz-Umwälzpumpen",
            "menge": 4, "einheit": "stk", "betrag": 7200.0,
            "source_page": 8, "source_text": "243.101 Hocheffizienz-Umwälzpumpen",
        },
        {
            "pos_nr": "243.220", "bkp_nr": "243",
            "beschreibung": "Heizungsrohr komplett",
            "menge": 620, "einheit": "m", "betrag": None,
            "source_page": 11, "source_text": "243.220 Heizungsrohr komplett",
        },
    ]


def test_review_packet_enthaelt_normalisierte_positionen_statt_pdf():
    packet = build_review_packet({}, [], _positions())
    assert packet["packet"]["positions"][0] == {
        "id": "243.101", "title": "Hocheffizienz-Umwälzpumpen",
        "quantity": 4, "unit": "stk", "amount": 7200.0, "page": 8,
    }
    assert packet["estimated_tokens"] < 500


def test_structured_output_erganzt_nur_fehlende_belegte_werte():
    payload = {
        "features": [
            {
                "key": "pump_count", "value": 4, "confidence": 0.98,
                "source_ids": ["243.101"], "reason": "Menge 4 Stk",
            },
            {
                "key": "pipe_length_m", "value": 620, "confidence": 0.96,
                "source_ids": ["243.220"], "reason": "620 m Rohr",
            },
        ],
        "costs": [
            {"source_id": "243.220", "amount": 31000, "confidence": 0.91, "reason": "Positionstotal"},
        ],
        "warnings": ["Preis von Position 243.220 prüfen."],
    }
    fake = FakeOpenAI(payload)
    review = document_review.review(
        build_review_packet({}, [], _positions())["packet"],
        provider="openai", model="test-model", client=fake,
    )
    assert review["called"] is True
    call = fake.calls[0]
    assert call["response_format"]["type"] == "json_schema"
    assert call["response_format"]["json_schema"]["strict"] is True

    # Sicherer Parserwert gewinnt; nur pipe_length_m wird ergänzt.
    features = {"pump_count": {"value": 3, "confidence": "high"}}
    costs = cost_rows_from_positions(_positions())
    applied = document_review.apply_result(features, costs, _positions(), review["result"])
    assert features["pump_count"]["value"] == 3
    assert features["pipe_length_m"]["value"] == 620
    assert features["pipe_length_m"]["source_page"] == 11
    assert applied["llm_review_features_applied"] == 1
    assert applied["llm_review_costs_applied"] == 1
    assert next(row for row in costs if row["original_position"] == "243.220")["detected_amount"] == 31000


def test_unbelegte_oder_unsichere_vorschlaege_werden_verworfen():
    features = {}
    costs = cost_rows_from_positions(_positions())
    result = {
        "features": [
            {"key": "pump_count", "value": 99, "confidence": 0.99,
             "source_ids": ["existiert-nicht"], "reason": "erfunden"},
            {"key": "pipe_length_m", "value": 999, "confidence": 0.4,
             "source_ids": ["243.220"], "reason": "unsicher"},
        ],
        "costs": [],
        "warnings": [],
    }
    applied = document_review.apply_result(features, costs, _positions(), result)
    assert features == {}
    assert applied["llm_review_features_applied"] == 0

