"""OpenAI-Provider für die Norm-LV-Zuordnung.

Nutzt Structured Outputs der Chat-Completions-API
(`response_format={"type": "json_schema", ...}` mit `strict: true`), damit kein
Fliesstext geparst werden muss.

Der verifizierte Standard für Structured Outputs ist `gpt-5.6`; er kann über
`COST_MAPPING_LLM_MODEL` bzw. `LV_REVIEW_LLM_MODEL` überschrieben werden.
"""
from __future__ import annotations

import os
from typing import Optional

from app.lv_import.llm.base import (
    CostMappingLLM, RESPONSE_SCHEMA, SYSTEM_PROMPT, build_user_prompt, parse_mappings,
)

DEFAULT_MODEL = "gpt-5.6"


class OpenAICostMapper(CostMappingLLM):
    name = "openai"

    def __init__(self, model: Optional[str] = None, client=None):
        super().__init__(
            model or os.getenv("COST_MAPPING_LLM_MODEL")
            or os.getenv("LV_REVIEW_LLM_MODEL") or DEFAULT_MODEL,
            client,
        )

    def available(self) -> tuple[bool, str]:
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
