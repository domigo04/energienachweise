"""Adaptiver Dokument-Grobscan vor dem hochauflösenden LV-Review."""
import json
from types import SimpleNamespace

from app.lv_import.llm import page_triage
from app.lv_import.llm.budget import ImportLlmBudget


class FakeResponses:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []
        self.responses = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload), usage=None)


def _pages():
    return [
        {"page": 1, "text": "Projekt MFH Test Offerte Unternehmer AG"},
        {"page": 2, "text": "Allgemeine Bedingungen SIA 118"},
        {"page": 3, "text": "� �"},
        {"page": 4, "text": "Kostenzusammenstellung Total BKP 241 125000.00"},
        {"page": 5, "text": "Rabatt 6 % Skonto 2 % MWST 8.1 % Endsumme"},
    ]


def _classification():
    return [
        {"page": 1, "type": "cover", "confidence": "high", "signals": []},
        {"page": 2, "type": "conditions", "confidence": "medium", "signals": []},
        {"page": 3, "type": "unknown", "confidence": "low", "signals": []},
        {"page": 4, "type": "cost_summary", "confidence": "high", "signals": []},
        {"page": 5, "type": "conditions", "confidence": "medium", "signals": []},
    ]


def test_grobscan_erhaelt_index_von_allen_seiten(monkeypatch):
    monkeypatch.setenv("LV_LLM_ENABLED", "true")
    fake = FakeResponses({
        "document_quality": "medium",
        "issues": ["Seite 3 ist schlecht lesbar"],
        "pages": [
            {"page": 3, "categories": ["poor_quality"],
             "uncertainty": "high", "reason": "Fast kein lesbarer Text"},
            {"page": 5, "categories": ["commercial"],
             "uncertainty": "medium", "reason": "Schlusskonditionen"},
        ],
    })
    result = page_triage.triage(
        _pages(), _classification(), "ocr", client=fake, model="test",
        budget=ImportLlmBudget(),
    )

    assert result["called"] is True
    assert result["selected_pages"] == [3, 5]
    assert len(result["page_index"]) == 5
    prompt = fake.calls[0]["input"][1]["content"][0]["text"]
    packet = json.loads(prompt)
    assert [page["page"] for page in packet["pages"]] == [1, 2, 3, 4, 5]
    assert "sehr wenig Text" in packet["pages"][2]["hints"]


def test_parserpflichtseiten_bleiben_trotz_ki_auswahl_erhalten():
    triage = {
        "selected_pages": [3, 5, 8],
        "pages": [
            {"page": 3, "source": "ai", "reason": "OCR unsicher"},
            {"page": 5, "source": "ai", "reason": "Konditionen"},
            {"page": 8, "source": "ai", "reason": "Technik"},
        ],
    }
    selected, reasons = page_triage.select_detail_pages(
        triage, required_pages=[4, 5], limit=4,
    )
    assert selected == [4, 5, 3, 8]
    assert reasons[0]["source"] == "required"
    assert reasons[1]["source"] == "ai"


def test_fallback_priorisiert_schlechte_und_kommerzielle_seiten(monkeypatch):
    monkeypatch.setenv("LV_LLM_ENABLED", "true")
    budget = ImportLlmBudget(max_calls=0)
    result = page_triage.triage(
        _pages(), _classification(), "ocr", budget=budget,
    )
    assert result["called"] is False
    assert 3 in result["selected_pages"]
    assert 4 in result["selected_pages"]
    assert 5 in result["selected_pages"]


def test_detailseiten_budget_ist_konfigurierbar_aber_begrenzt(monkeypatch):
    monkeypatch.setenv("LV_VISUAL_REVIEW_MAX_PAGES", "35")
    assert page_triage.max_detail_pages() == 35
    monkeypatch.setenv("LV_VISUAL_REVIEW_MAX_PAGES", "999")
    assert page_triage.max_detail_pages() == page_triage.HARD_MAX_DETAIL_PAGES
