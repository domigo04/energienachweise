"""Zahlen- und Einheiten-Normalisierung für den LV-Import (born-digital PDF).

Schweizer Schreibweisen: 1'500 · 1’500 · 1 500 · 82,5 · 82.5. Konservativ: was
nicht sicher als Zahl lesbar ist, gibt None zurück (nicht raten, B6).
"""
from __future__ import annotations

import re
from typing import Optional

# Tausendertrennung (Apostroph/Leerzeichen) entfernen, Dezimalkomma → Punkt.
_THOUSAND = re.compile(r"(?<=\d)[’' \s](?=\d{3}\b)")


def parse_number(raw) -> Optional[float]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = _THOUSAND.sub("", s)
    s = s.replace("’", "").replace("'", "").replace(" ", "").replace(" ", "")
    # Dezimalkomma → Punkt (nur wenn genau ein Komma und kein Punkt)
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def parse_int(raw) -> Optional[int]:
    n = parse_number(raw)
    if n is None:
        return None
    return int(round(n))
