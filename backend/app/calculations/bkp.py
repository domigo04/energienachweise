"""BKP-Kostenschätzung — Zeitgewichtung (Auftrag v3.0, Kap. 4.5).

Neuere Devis zählen mehr: exponentieller Zerfall mit Halbwertszeit ~3 Jahre.
Devi von heute → 1.0 · vor 3 Jahren → 0.5 · vor 6 Jahren → 0.25.
"""
import math
from datetime import date


def berechne_gewicht(datum_submission: date, halbwertszeit_jahre: float = 3.0) -> float:
    """Exponentieller Zerfall: Gewicht = e^(−λ · Alter_in_Jahren), λ = ln2 / Halbwertszeit."""
    alter_jahre = (date.today() - datum_submission).days / 365.25
    lam = math.log(2) / halbwertszeit_jahre
    return math.exp(-lam * alter_jahre)
