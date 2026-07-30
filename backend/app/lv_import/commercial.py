"""Kommerzielle Konditionskette getrennt von technischen LV-Positionen."""
from __future__ import annotations

from typing import Any

TOLERANCE_CHF = 1.0


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def calculate_chain(
    base_amount: float | None, conditions: list[dict], vat_rate: float | None = None,
) -> dict:
    """Rechnet Abzüge/Zuschläge in Dokumentreihenfolge nach."""
    if base_amount is None:
        return {"subtotal_excl_vat": None, "vat_amount": None, "total_incl_vat": None}
    running = float(base_amount)
    calculated: list[dict] = []
    for index, item in enumerate(conditions or []):
        kind = item.get("kind")
        direction = item.get("direction")
        if kind not in {"percent", "fixed"} or direction not in {"deduction", "surcharge"}:
            continue
        basis = _number(item.get("basis_amount"))
        if basis is None:
            basis = running
        if kind == "percent":
            rate = _number(item.get("rate_percent"))
            if rate is None:
                continue
            amount = round(basis * rate / 100, 2)
        else:
            amount = _number(item.get("amount"))
            if amount is None:
                continue
            amount = round(amount, 2)
        running = round(running + amount * (1 if direction == "surcharge" else -1), 2)
        calculated.append({
            **item, "order": item.get("order", index + 1),
            "basis_amount": round(basis, 2), "calculated_amount": amount,
            "running_total": running,
        })
    vat_amount = round(running * float(vat_rate) / 100, 2) if vat_rate is not None else None
    total = round(running + vat_amount, 2) if vat_amount is not None else None
    return {
        "conditions": calculated,
        "subtotal_excl_vat": running,
        "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "total_incl_vat": total,
    }


def validate(
    base_amount: float | None, conditions: list[dict], vat_rate: float | None,
    stated_subtotal: float | None = None, stated_vat_amount: float | None = None,
    stated_total: float | None = None,
) -> tuple[dict, list[str]]:
    result = calculate_chain(base_amount, conditions, vat_rate)
    issues: list[str] = []
    for label, calculated, stated in (
        ("Summe exkl. MWST", result["subtotal_excl_vat"], stated_subtotal),
        ("MWST-Betrag", result["vat_amount"], stated_vat_amount),
        ("Endsumme inkl. MWST", result["total_incl_vat"], stated_total),
    ):
        if stated is not None and calculated is not None and abs(calculated - stated) > TOLERANCE_CHF:
            issues.append(
                f"{label}: berechnet {calculated:.2f}, ausgewiesen {stated:.2f}."
            )
    return result, issues
