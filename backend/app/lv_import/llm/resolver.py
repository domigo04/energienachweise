"""Der Resolver: Konfiguration, Absicherung, Anwendung — providerunabhängig.

Alle Fachregeln stehen hier, nicht in den Providern. Damit gelten sie für
OpenAI und Anthropic identisch (Voraussetzung für einen aussagekräftigen
Benchmark) und ein Providerwechsel kann sie nicht aufweichen.

Absicherungen:

1. Geschlossene Welt — jede Antwort wird gegen `norm_lv.NORM_KEYS` geprüft.
   Unbekannter Schlüssel → verworfen, canonical_key = None.
2. Nur gefragte Positionen — Antworten zu fremden source_ids werden ignoriert.
3. Confidence konservativ — unter `MIN_CONFIDENCE` wird nichts übernommen. Die
   Modell-Confidence ist ein Review-Hinweis, kein Beweis.
4. `mapping_confirmed` setzt der Resolver NIE. Das kann nur der Mensch.
5. Jeder Fehler (Timeout, 429, 500, kaputtes JSON, Refusal, fehlendes SDK,
   fehlender Key, abgeschaltet) endet in „keine Zuordnung" — der LV-Import
   bleibt erfolgreich.
"""
from __future__ import annotations

import os
from typing import Optional

from app.lv_import import norm_lv
from app.lv_import.llm.base import CostMappingLLM
from app.lv_import.llm.anthropic_provider import AnthropicCostMapper
from app.lv_import.llm.openai_provider import OpenAICostMapper

# Ab dieser Sicherheit wird ein Vorschlag überhaupt übernommen (Punkt 10).
MIN_CONFIDENCE = 0.75
# Ab hier gilt der Vorschlag im Review als „hoch".
HIGH_CONFIDENCE = 0.90
# Gebündelt statt einzeln — hält die Kosten klein.
MAX_POSITIONS = 60

PROVIDERS: dict[str, type[CostMappingLLM]] = {
    "anthropic": AnthropicCostMapper,
    "openai": OpenAICostMapper,
}
DEFAULT_PROVIDER = "anthropic"


def enabled() -> bool:
    return (os.getenv("COST_MAPPING_LLM_ENABLED", "true").strip().lower()
            not in ("0", "false", "no", "off", "nein"))


def provider_name() -> str:
    return (os.getenv("COST_MAPPING_LLM_PROVIDER") or DEFAULT_PROVIDER).strip().lower()


def get_provider(name: Optional[str] = None, *, model=None, client=None) -> Optional[CostMappingLLM]:
    """Provider aus der Konfiguration. Unbekannter Name → None."""
    klasse = PROVIDERS.get((name or provider_name()))
    return klasse(model=model, client=client) if klasse else None


def status() -> dict:
    """Zustand für Debug/Admin — nie Schlüssel, nur Konfiguration."""
    name = provider_name()
    p = get_provider(name)
    ok, grund = p.available() if p else (False, f"Unbekannter Provider '{name}'")
    aktiv = enabled()
    return {
        "llm_enabled": aktiv,
        "llm_provider": name,
        "llm_model": getattr(p, "model", None),
        "llm_available": bool(aktiv and ok),
        "llm_reason": grund if aktiv else "COST_MAPPING_LLM_ENABLED=false",
    }


def available() -> bool:
    return status()["llm_available"]


def _allowed_positions() -> list[dict]:
    return [{"key": p["key"], "title": p["bezeichnung"]} for p in norm_lv.NORM_POSITIONS]


def _confidence_label(conf: float) -> str:
    if conf >= HIGH_CONFIDENCE:
        return "hoher KI-Vorschlag"
    if conf >= MIN_CONFIDENCE:
        return "KI-Vorschlag, prüfen"
    return "KI unsicher"


def resolve(positions: list[dict], *, provider: Optional[CostMappingLLM] = None) -> dict:
    """Offene Positionen zuordnen lassen.

    Args:
        positions: [{"source_id", "title", "group"(optional)}] — ohne Beträge.
        provider: injizierbar für Tests/Benchmark; sonst aus der Umgebung.

    Returns:
        {source_id: {canonical_key, mapping_method, mapping_confidence,
                     mapping_reason}} — mapping_confirmed wird NIE gesetzt.
    """
    positions = [p for p in (positions or []) if p.get("source_id") and p.get("title")]
    positions = positions[:MAX_POSITIONS]
    if not positions:
        return {}
    if provider is None:
        if not enabled():
            return {}
        provider = get_provider()
        if provider is None or not provider.available()[0]:
            return {}

    rohdaten = provider.resolve(positions, _allowed_positions()) or []

    gefragte = {p["source_id"] for p in positions}
    out: dict[str, dict] = {}
    for eintrag in rohdaten:
        sid = str(eintrag.get("source_id") or "")
        if sid not in gefragte:
            continue                                  # nichts Fremdes übernehmen
        try:
            conf = float(eintrag.get("confidence"))
        except (TypeError, ValueError):
            continue
        conf = max(0.0, min(1.0, conf))
        grund = str(eintrag.get("reason") or "").strip()[:180]
        key = eintrag.get("canonical_key")

        if not norm_lv.ist_norm_position(key):
            # Entweder bewusst null (gewünscht) oder ein erfundener Schlüssel.
            hinweis = ("keine passende Norm-Position" if key in (None, "")
                       else f"unbekannter Schlüssel '{key}' verworfen")
            out[sid] = _offen(conf, f"KI: {hinweis}. {grund}".strip())
            continue
        if conf < MIN_CONFIDENCE:
            out[sid] = _offen(conf, f"KI unsicher ({conf:.2f}): {grund}")
            continue
        out[sid] = {
            "canonical_key": key,
            "mapping_method": norm_lv.LLM,
            "mapping_confidence": conf,
            "mapping_reason": f"{_confidence_label(conf)} ({conf:.2f}): {grund}"[:200],
        }
    return out


def _offen(conf: float, grund: str) -> dict:
    return {"canonical_key": None, "mapping_method": None,
            "mapping_confidence": conf, "mapping_reason": grund[:200]}


def positions_from_rows(rows) -> list[dict]:
    """Offene Kostenzeilen → Prompt-Positionen. Ohne Beträge, ohne Projektdaten.

    Offen heisst: keine Gruppentotalzeile, noch keine bestätigte Entscheidung des
    Nutzers und noch keine Zuordnung.
    """
    return [
        {"source_id": r.get("original_position") or str(r.get("bkp_nr") or ""),
         "title": r.get("original_title") or "",
         "group": str(r.get("bkp_nr") or "") or None}
        for r in (rows or [])
        if not r.get("is_group_total")
        and not r.get("canonical_key")
        and not r.get("mapping_confirmed")
        and (r.get("original_title") or "")
    ]


def apply_to_rows(rows: list[dict], *, provider: Optional[CostMappingLLM] = None) -> dict:
    """Offene Zeilen zuordnen und `rows` in place ergänzen.

    Bereits bestätigte Nutzerentscheidungen werden nie überschrieben.
    Returns: {"sent": int, "mapped": int}
    """
    offene = [r for r in (rows or [])
              if not r.get("is_group_total") and not r.get("canonical_key")
              and not r.get("mapping_confirmed") and (r.get("original_title") or "")]
    if not offene:
        return {"sent": 0, "mapped": 0}
    ergebnis = resolve(positions_from_rows(offene), provider=provider)
    if not ergebnis:
        return {"sent": len(offene), "mapped": 0}
    zugeordnet = 0
    for r in offene:
        sid = r.get("original_position") or str(r.get("bkp_nr") or "")
        treffer = ergebnis.get(sid)
        if not treffer:
            continue
        r.update(treffer)
        if treffer.get("canonical_key"):
            zugeordnet += 1
    return {"sent": len(offene), "mapped": zugeordnet}
