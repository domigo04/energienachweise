"""Kommerzielle Konditionskette getrennt von technischen LV-Positionen."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

TOLERANCE_CHF = 1.0


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _label(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    return re.sub(r"[^a-z0-9]+", " ", "".join(
        char for char in normalized if not unicodedata.combining(char)
    ).casefold()).strip()


def calculate_chain(
    base_amount: float | None, conditions: list[dict], vat_rate: float | None = None,
) -> dict:
    """Rechnet Abzüge/Zuschläge in Dokumentreihenfolge nach."""
    if base_amount is None:
        return {"subtotal_excl_vat": None, "vat_amount": None, "total_incl_vat": None}
    running = float(base_amount)
    calculated: list[dict] = []
    ancillary_basis: float | None = None
    for index, item in enumerate(conditions or []):
        kind = item.get("kind")
        direction = item.get("direction")
        if kind not in {"percent", "fixed"} or direction not in {"deduction", "surcharge"}:
            continue
        label = _label(item.get("label"))
        primary_discount = "rabatt" in label or "skonto" in label
        basis = _number(item.get("basis_amount"))
        if kind == "percent":
            rate = _number(item.get("rate_percent"))
            if rate is None:
                continue
            stated_amount = _number(item.get("amount"))
            if basis is None and stated_amount is not None and rate:
                # Ein auf dem Angebot sichtbarer Abzugsbetrag verrät die
                # tatsächliche Basis zuverlässiger als eine vermutete Kette.
                basis = abs(stated_amount) * 100 / abs(rate)
            if basis is None:
                if primary_discount:
                    basis = running
                else:
                    # Baureinigung, Bauwasser, Versicherung usw. werden in
                    # Schweizer Angeboten häufig alle von derselben Summe nach
                    # Rabatt/Skonto gerechnet, nicht nacheinander voneinander.
                    ancillary_basis = ancillary_basis or running
                    basis = ancillary_basis
            amount = round(abs(basis) * abs(rate) / 100, 2)
        else:
            basis = basis if basis is not None else running
            amount = _number(item.get("amount"))
            if amount is None:
                continue
            amount = round(abs(amount), 2)
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
