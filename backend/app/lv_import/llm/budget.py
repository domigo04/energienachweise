"""Kleines, importlokales Budget für alle LV-LLM-Aufrufe."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() not in {
        "0", "false", "no", "off", "nein",
    }


def enabled() -> bool:
    return _bool("LV_LLM_ENABLED")


@dataclass
class ImportLlmBudget:
    max_calls: int = 3
    max_output_tokens: int = 6000
    max_cost_usd: float = 1.0
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0
    stop_reason: str | None = None

    @classmethod
    def from_env(cls) -> "ImportLlmBudget":
        return cls(
            max_calls=max(0, int(os.getenv("LV_LLM_MAX_CALLS_PER_IMPORT", "3"))),
            max_output_tokens=max(
                1, int(os.getenv("LV_LLM_MAX_OUTPUT_TOKENS", "6000")),
            ),
            max_cost_usd=max(0.0, float(os.getenv("LV_LLM_MAX_COST_USD", "1.00"))),
        )

    def may_call(self, estimated_input_tokens: int = 0) -> bool:
        if not enabled():
            self.stop_reason = "LV_LLM_ENABLED=false"
            return False
        if self.calls >= self.max_calls:
            self.stop_reason = "call_limit_reached"
            return False
        # Konservative Standardpreise, nur für die Budgetbremse. Sie können bei
        # einem Modellwechsel ohne Codeänderung überschrieben werden.
        projected = self.estimated_cost_usd + self._cost(
            estimated_input_tokens, self.max_output_tokens,
        )
        if projected > self.max_cost_usd:
            self.stop_reason = "cost_limit_reached"
            return False
        return True

    def start_call(self) -> None:
        self.calls += 1

    def record(self, response, *, estimated_input_tokens: int = 0) -> None:
        usage = getattr(response, "usage", None)
        input_tokens = (
            getattr(usage, "input_tokens", None)
            or getattr(usage, "prompt_tokens", None)
            or estimated_input_tokens
            or 0
        )
        output_tokens = (
            getattr(usage, "output_tokens", None)
            or getattr(usage, "completion_tokens", None)
            or 0
        )
        self.input_tokens += int(input_tokens)
        self.output_tokens += int(output_tokens)
        self.estimated_cost_usd += self._cost(int(input_tokens), int(output_tokens))
        if self.estimated_cost_usd >= self.max_cost_usd:
            self.stop_reason = "cost_limit_reached"

    @staticmethod
    def _cost(input_tokens: int, output_tokens: int) -> float:
        input_rate = float(os.getenv("LV_LLM_INPUT_USD_PER_MILLION", "2.50"))
        output_rate = float(os.getenv("LV_LLM_OUTPUT_USD_PER_MILLION", "15.00"))
        return (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000

    def status(self) -> dict:
        return {
            "llm_calls": self.calls,
            "llm_max_calls": self.max_calls,
            "llm_input_tokens": self.input_tokens,
            "llm_output_tokens": self.output_tokens,
            "llm_estimated_cost_usd": round(self.estimated_cost_usd, 6),
            "llm_max_cost_usd": self.max_cost_usd,
            "llm_max_output_tokens": self.max_output_tokens,
            "llm_stop_reason": self.stop_reason,
        }
