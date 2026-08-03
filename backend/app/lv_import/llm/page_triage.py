"""Adaptiver Grobscan eines vollständigen LV vor der visuellen Detailprüfung.

Die Triage erhält für jede Seite nur einen kompakten Text-/Qualitätsindex. Sie
entscheidet damit kostengünstig, welche Seiten anschliessend als hochauflösendes
PDF an den Visual-Review gehen. Parser-Pflichtseiten werden nie entfernt: Die
KI erweitert und priorisiert die Auswahl, sie ist kein stilles Ausschlussgate.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from app.lv_import.llm.budget import ImportLlmBudget

DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_REASONING = "low"
HARD_MAX_DETAIL_PAGES = 60
DEFAULT_MAX_DETAIL_PAGES = 24

SYSTEM_PROMPT = """Du sichtest den Seitenindex eines vollständigen Schweizer
Heizungs-LV. Wähle alle Seiten, die eine hochauflösende visuelle Detailprüfung
brauchen. Priorisiere schlecht extrahierten oder widersprüchlichen Text,
Projektkopf, technische Kennwerte, Kosten-/BKP-Zusammenstellungen,
handschriftliche Korrekturen, Rabatt/Skonto/Abzüge/Zuschläge, MWST und
Schlussbeträge. Eine Seite darf auch bei wenig oder leerem Text ausgewählt
werden, wenn die Qualitätsmerkmale auf einen Scan oder OCR-Fehler hindeuten.
Erfinde keinen Seiteninhalt. Begründe jede Auswahl knapp."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "document_quality": {
            "type": "string", "enum": ["high", "medium", "low"],
        },
        "issues": {"type": "array", "items": {"type": "string"}},
        "pages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "page": {"type": "integer", "minimum": 1},
                    "categories": {
                        "type": "array",
                        "items": {"type": "string", "enum": [
                            "project", "technical", "cost", "commercial",
                            "handwritten", "poor_quality", "conflict",
                        ]},
                    },
                    "uncertainty": {
                        "type": "string", "enum": ["low", "medium", "high"],
                    },
                    "reason": {"type": "string", "maxLength": 180},
                },
                "required": ["page", "categories", "uncertainty", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["document_quality", "issues", "pages"],
    "additionalProperties": False,
}

_INTERESTING_TERMS = (
    "projekt", "objekt", "offerte", "angebot", "wärmepumpe", "waermepumpe",
    "heizleistung", "erdsonde", "fussbodenheizung", "fußbodenheizung",
    "kostenzusammenstellung", "preiszusammenstellung", "total bkp", "summe bkp",
    "rabatt", "skonto", "abzug", "zuschlag", "mehrwertsteuer", "mwst",
    "nettosumme", "endsumme",
)


def max_detail_pages() -> int:
    """Konfigurierbares Qualitätsbudget, mit Schutz vor ganzen Dokumentkopien."""
    try:
        configured = int(os.getenv(
            "LV_VISUAL_REVIEW_MAX_PAGES", str(DEFAULT_MAX_DETAIL_PAGES),
        ))
    except ValueError:
        configured = DEFAULT_MAX_DETAIL_PAGES
    return min(HARD_MAX_DETAIL_PAGES, max(1, configured))


def _quality(page: dict, classification: dict, extraction_method: str) -> dict:
    text = str(page.get("text") or "")
    compact = re.sub(r"\s+", " ", text).strip()
    chars = len(compact)
    readable = sum(char.isalnum() for char in compact)
    ratio = round(readable / chars, 3) if chars else 0.0
    hints: list[str] = []
    if not compact:
        hints.append("kein Text erkannt")
    elif chars < 120:
        hints.append("sehr wenig Text")
    if ratio < 0.55:
        hints.append("viele Sonder-/OCR-Zeichen")
    if "�" in compact:
        hints.append("ungültige Zeichen")
    if classification.get("confidence") == "low":
        hints.append("Seitenklasse unsicher")
    if extraction_method in {"ocr", "image"}:
        hints.append(f"Extraktion: {extraction_method}")
    return {
        "characters": chars,
        "alnum_ratio": ratio,
        "hints": hints,
        "excerpt": (
            compact[:900]
            + (f" … {compact[-300:]}" if len(compact) > 1300 else "")
        ),
    }


def build_page_index(
    pages: list[dict], classification: list[dict], extraction_method: str,
) -> list[dict]:
    by_page = {int(c["page"]): c for c in classification or [] if c.get("page")}
    index: list[dict] = []
    for page in pages or []:
        number = page.get("page")
        if not number:
            continue
        cls = by_page.get(int(number), {
            "type": "unknown", "confidence": "low", "signals": [],
        })
        quality = _quality(page, cls, extraction_method)
        index.append({
            "page": int(number),
            "classification": cls.get("type"),
            "classification_confidence": cls.get("confidence"),
            "signals": list(cls.get("signals") or [])[:6],
            **quality,
        })
    return index


def deterministic_candidates(page_index: list[dict]) -> list[dict]:
    """Transparenter Fallback und Sicherheitsnetz für fehlende KI-Antworten."""
    candidates: list[dict] = []
    for page in page_index or []:
        score = 0
        reasons = list(page.get("hints") or [])
        kind = page.get("classification")
        if kind == "cost_summary":
            score += 80; reasons.append("Kostenzusammenstellung")
        elif kind == "conditions":
            score += 65; reasons.append("Konditionsseite")
        elif kind == "cover":
            score += 35; reasons.append("Projektkopf")
        elif kind == "unknown":
            score += 30; reasons.append("Seiteninhalt unklar")
        if page.get("classification_confidence") == "low":
            score += 25
        if page.get("characters", 0) < 120:
            score += 35
        elif page.get("characters", 0) < 400:
            score += 15
        low = str(page.get("excerpt") or "").casefold()
        hits = sum(low.count(term) for term in _INTERESTING_TERMS)
        if hits:
            score += min(60, hits * 8)
            reasons.append(f"{hits} fachliche Hinweise")
        if score:
            candidates.append({
                "page": page["page"], "score": score,
                "reason": ", ".join(dict.fromkeys(reasons))[:180],
                "source": "deterministic",
            })
    return sorted(candidates, key=lambda item: (-item["score"], item["page"]))


def _parse_response(response: Any) -> dict:
    text = getattr(response, "output_text", None) or ""
    if not text:
        for output in getattr(response, "output", None) or []:
            for content in getattr(output, "content", None) or []:
                text = getattr(content, "text", None) or text
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def triage(
    pages: list[dict], classification: list[dict], extraction_method: str,
    *, client=None, model: str | None = None,
    budget: ImportLlmBudget | None = None,
) -> dict:
    """Sichtet den kompakten Index aller Seiten; jeder Fehler ist ein Fallback."""
    page_index = build_page_index(pages, classification, extraction_method)
    deterministic = deterministic_candidates(page_index)
    allowed = {item["page"] for item in page_index}
    budget = budget or ImportLlmBudget.from_env()
    model = model or os.getenv("LV_PAGE_TRIAGE_MODEL", DEFAULT_MODEL)
    prompt = json.dumps({
        "detail_page_budget": max_detail_pages(),
        "page_count": len(page_index),
        "pages": page_index,
    }, ensure_ascii=False, separators=(",", ":"))
    estimated_input = max(400, len(prompt) // 4)
    fallback = {
        "called": False,
        "document_quality": "low" if extraction_method == "image" else "medium",
        "issues": ["KI-Grobscan nicht verfügbar; deterministische Auswahl verwendet."],
        "pages": deterministic,
        "selected_pages": [item["page"] for item in deterministic],
        "page_index": page_index,
    }
    if not budget.may_call(estimated_input):
        return {**fallback, **budget.status()}
    try:
        if client is None:
            import openai
            client = openai.OpenAI()
        reasoning = os.getenv("LV_PAGE_TRIAGE_REASONING", DEFAULT_REASONING)
        budget.start_call(model=model, reasoning=reasoning)
        response = client.responses.create(
            model=model,
            timeout=min(120.0, float(os.getenv("LV_VISUAL_REVIEW_TIMEOUT_SECONDS", "180"))),
            store=False,
            reasoning={"effort": reasoning},
            max_output_tokens=min(8000, budget.max_output_tokens),
            input=[
                {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
                {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
            ],
            text={"format": {
                "type": "json_schema", "name": "lv_page_triage",
                "strict": True, "schema": RESPONSE_SCHEMA,
            }},
        )
        budget.record(response, estimated_input_tokens=estimated_input)
        parsed = _parse_response(response)
        selected: list[dict] = []
        seen: set[int] = set()
        for item in parsed.get("pages") or []:
            number = item.get("page")
            if number not in allowed or number in seen:
                continue
            seen.add(number)
            selected.append({
                "page": number,
                "categories": item.get("categories") or [],
                "uncertainty": item.get("uncertainty") or "medium",
                "reason": str(item.get("reason") or "KI-Auswahl")[:180],
                "source": "ai",
            })
        if not selected:
            return {**fallback, **budget.status()}
        return {
            "called": True,
            "document_quality": parsed.get("document_quality") or "medium",
            "issues": [str(issue)[:240] for issue in (parsed.get("issues") or [])[:20]],
            "pages": selected,
            "selected_pages": [item["page"] for item in selected],
            "page_index": page_index,
            **budget.status(),
        }
    except Exception as exc:
        fallback["issues"] = [
            f"KI-Grobscan fehlgeschlagen ({type(exc).__name__}); deterministische Auswahl verwendet.",
        ]
        return {**fallback, **budget.status()}


def select_detail_pages(
    triage_result: dict, required_pages: list[int], *, limit: int | None = None,
) -> tuple[list[int], list[dict]]:
    """Verbindet Pflichtseiten und KI-Prioritäten innerhalb des Qualitätsbudgets."""
    limit = limit or max_detail_pages()
    reasons_by_page = {
        int(item["page"]): item for item in (triage_result.get("pages") or [])
        if item.get("page")
    }
    ordered: list[int] = []
    selection: list[dict] = []
    for number in list(required_pages or []) + list(triage_result.get("selected_pages") or []):
        try:
            number = int(number)
        except (TypeError, ValueError):
            continue
        if number < 1 or number in ordered:
            continue
        ordered.append(number)
        item = reasons_by_page.get(number)
        selection.append(item or {
            "page": number, "source": "required",
            "reason": "Parser-/Summenprüfung verlangt diese Seite.",
        })
        if len(ordered) >= limit:
            break
    return ordered, selection
