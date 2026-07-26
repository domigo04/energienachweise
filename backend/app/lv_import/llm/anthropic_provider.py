"""Anthropic-Provider für die Norm-LV-Zuordnung.

Nutzt die strukturierte Ausgabe der Messages-API (`output_config.format` mit
JSON-Schema), damit kein Fliesstext geparst werden muss.
"""
from __future__ import annotations

import os
from typing import Optional

from app.lv_import.llm.base import (
    CostMappingLLM, RESPONSE_SCHEMA, SYSTEM_PROMPT, build_user_prompt, parse_mappings,
)

# Modell aus der Umgebung; dieser Default ist eine gültige, aktuelle Modell-ID.
# Jederzeit über COST_MAPPING_LLM_MODEL überschreibbar.
DEFAULT_MODEL = "claude-opus-5"


class AnthropicCostMapper(CostMappingLLM):
    name = "anthropic"

    def __init__(self, model: Optional[str] = None, client=None):
        super().__init__(model or os.getenv("COST_MAPPING_LLM_MODEL") or DEFAULT_MODEL, client)

    def available(self) -> tuple[bool, str]:
        if self._client is not None:
            return True, "Client injiziert"
        if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
            return False, "ANTHROPIC_API_KEY fehlt"
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False, "Paket 'anthropic' nicht installiert"
        return True, "bereit"

    def _get_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic()
        return self._client

    def resolve(self, positions, allowed_positions) -> list[dict]:
        try:
            antwort = self._get_client().messages.create(
                model=self.model,
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                output_config={
                    # Kleine Klassifikation — kein tiefes Nachdenken nötig.
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA},
                },
                messages=[{"role": "user",
                           "content": build_user_prompt(positions, allowed_positions)}],
            )
        except Exception:
            return []                      # Netz, Kontingent, Konfiguration
        # Eine Ablehnung ist ein gültiger Ausgang, kein Fehler.
        if getattr(antwort, "stop_reason", None) == "refusal":
            return []
        text = next((b.text for b in (antwort.content or [])
                     if getattr(b, "type", None) == "text"), "")
        return parse_mappings(text)
