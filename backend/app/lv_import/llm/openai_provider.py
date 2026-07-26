"""OpenAI-Provider für die Norm-LV-Zuordnung.

Nutzt Structured Outputs der Chat-Completions-API
(`response_format={"type": "json_schema", ...}` mit `strict: true`), damit kein
Fliesstext geparst werden muss.

ACHTUNG — bewusst KEIN Default-Modell:

Die OpenAI-Modelldokumentation war beim Implementieren nicht erreichbar, und eine
Modell-ID aus dem Gedächtnis zu setzen wäre geraten — genau das soll hier nicht
passieren. Darum ist `COST_MAPPING_LLM_MODEL` für diesen Provider Pflicht. Fehlt
sie, meldet sich der Provider als nicht einsatzbereit (mit Grund) und der
LV-Import läuft ohne KI-Vorschläge normal weiter.
"""
from __future__ import annotations

import os
from typing import Optional

from app.lv_import.llm.base import (
    CostMappingLLM, RESPONSE_SCHEMA, SYSTEM_PROMPT, build_user_prompt, parse_mappings,
)


class OpenAICostMapper(CostMappingLLM):
    name = "openai"

    def __init__(self, model: Optional[str] = None, client=None):
        super().__init__(model or os.getenv("COST_MAPPING_LLM_MODEL"), client)

    def available(self) -> tuple[bool, str]:
        if not self.model:
            return False, ("COST_MAPPING_LLM_MODEL muss für OpenAI gesetzt werden "
                           "(kein geratener Default)")
        if self._client is not None:
            return True, "Client injiziert"
        if not os.getenv("OPENAI_API_KEY"):
            return False, "OPENAI_API_KEY fehlt"
        try:
            import openai  # noqa: F401
        except ImportError:
            return False, "Paket 'openai' nicht installiert"
        return True, "bereit"

    def _get_client(self):
        if self._client is None:
            import openai
            self._client = openai.OpenAI()
        return self._client

    def resolve(self, positions, allowed_positions) -> list[dict]:
        if not self.model:
            return []
        try:
            antwort = self._get_client().chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",
                     "content": build_user_prompt(positions, allowed_positions)},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "norm_lv_mappings",
                        "strict": True,
                        "schema": RESPONSE_SCHEMA,
                    },
                },
            )
        except Exception:
            return []                      # Netz, Kontingent, Konfiguration
        try:
            wahl = antwort.choices[0]
        except (AttributeError, IndexError, TypeError):
            return []
        # Verweigerung ist ein gültiger Ausgang.
        if getattr(getattr(wahl, "message", None), "refusal", None):
            return []
        text = getattr(getattr(wahl, "message", None), "content", "") or ""
        return parse_mappings(text)
