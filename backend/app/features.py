"""Kanonische Feature-Sprache — der EINE Ort, an dem beliebige Projektquellen in
denselben normalisierten Merkmalssatz überführt werden (B12, Punkt 3).

    ProjectContext  → canonical features   (aktuelle Projekte)
    RefProjekt      → canonical features   (historische Referenzprojekte)
    LV-Import       → canonical features   (RefProjektFeature, schon kanonisch)

So vergleicht die BKP-Ähnlichkeit (Punkt 4) neue und alte Projekte auf exakt
derselben Basis. Das Schlüssel-Mapping lebt ausschliesslich in
`lv_import.feature_keys` — hier wird es nur angewendet, nicht dupliziert.
"""
from __future__ import annotations

from typing import Optional

from app.lv_import.feature_keys import (
    FEATURE_KEYS,
    FEATURE_TO_CONTEXT,
    REFPROJEKT_COLUMN_TO_FEATURE,
)
from app.lv_import.synonyms import GENERATOR_TYPE_TERMS


def _generator_type_aus_label(label) -> Optional[str]:
    """Legacy-Wärmeerzeuger-Freitext (RefProjekt.waermeerzeuger) → generator_type."""
    if not label:
        return None
    low = str(label).lower()
    for code, hints in GENERATOR_TYPE_TERMS:
        if any(h in low for h in hints):
            return code
    return None


def canonical_from_context(context: dict) -> dict:
    """Kanonische Merkmale aus einem ProjectContext (nur gesetzte Werte)."""
    from app.project_context import effective_map

    eff = effective_map(context)
    out: dict[str, object] = {}
    for feature_key, ctx_key in FEATURE_TO_CONTEXT.items():
        val = eff.get(ctx_key)
        if val is not None:
            out[feature_key] = val
    return out


def canonical_from_refprojekt(ref) -> dict:
    """Kanonische Merkmale eines Referenzprojekts. Bevorzugt die generische
    Feature-Struktur (neue Importe); ergänzt sie um die Legacy-Spalten und den
    aus `waermeerzeuger` abgeleiteten Erzeugertyp (alte Referenzen)."""
    out: dict[str, object] = {}

    # 1) Generische Feature-Struktur (vollständiger Fingerprint neuer Importe).
    for f in (getattr(ref, "features", None) or []):
        if f.value not in (None, ""):
            out[f.key] = f.value

    # 2) Legacy-Spalten ergänzen, wo noch kein Wert vorhanden ist.
    for column, feature_key in REFPROJEKT_COLUMN_TO_FEATURE.items():
        if feature_key in out:
            continue
        val = getattr(ref, column, None)
        if val is not None:
            out[feature_key] = val

    # 3) Erzeugertyp aus dem Freitext ableiten (Legacy), falls noch offen.
    if "generator_type" not in out:
        for label in (getattr(ref, "waermeerzeuger", None) or []):
            code = _generator_type_aus_label(label)
            if code:
                out["generator_type"] = code
                break

    return out


def leerer_feature_satz() -> dict:
    """Alle kanonischen Schlüssel mit None — als Referenzraster (fehlende Werte
    bleiben None, werden in der Ähnlichkeit NICHT als 0 bestraft)."""
    return {key: None for key in FEATURE_KEYS}
