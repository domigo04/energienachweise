"""Optionaler LLM-Resolver für uneindeutige Kostenzuordnungen.

Bewusst extrem eng geschnitten. Das LLM darf ausschliesslich eine Sache tun:
einen bereits deterministisch extrahierten Positionstitel einer Position aus dem
bestehenden Norm-LV zuordnen.

Es liest KEIN PDF, erkennt KEINE Preise, zählt KEINE Mengen und erfindet KEINE
Werte. Beträge, Mengen und Originalnummern stammen immer aus dem
deterministischen Parser und werden dem Modell nur als Kontext gezeigt.

Absicherungen:

1. Geschlossene Liste — die Antwort wird gegen `norm_lv.NORM_KEYS` geprüft. Ein
   Schlüssel, den das Norm-LV nicht kennt, wird verworfen (canonical_key=None).
2. Schwelle — unter `MIN_CONFIDENCE` gilt die Zuordnung als unklar und der
   Nutzer entscheidet.
3. Ohne API-Zugang passiert nichts. Der Importer bleibt vollständig
   funktionsfähig; die betroffenen Positionen bleiben einfach „zu prüfen".
4. Der Nutzer bestätigt am Ende jede Zuordnung — nichts fliesst ungeprüft in die
   Referenzkosten.

Ein Aufruf pro Import (alle offenen Positionen gebündelt), nicht einer pro
Position — das hält die Kosten im Rappenbereich.
"""
from __future__ import annotations

import json
import os
from typing import Optional

from app.lv_import import norm_lv

# Unterhalb dieser Sicherheit wird die Zuordnung nicht übernommen.
MIN_CONFIDENCE = 0.75
# Klein halten: nur wirklich offene Positionen gehen ans Modell.
MAX_POSITIONS = 40

MODEL = "claude-opus-5"

_SYSTEM = """Du ordnest Positionen aus einem Schweizer Unternehmer-Leistungs\
verzeichnis (Heizung) einer festen Norm-LV-Position zu.

Regeln:
- Wähle ausschliesslich einen `canonical_key` aus der vorgegebenen Liste.
- Erfinde niemals einen Schlüssel und niemals einen Betrag oder eine Menge.
- Die Originalnummer des Unternehmers ist NICHT verlässlich: Planer nummerieren
  Unterpositionen je Projekt anders. Entscheide nach der Bezeichnung, nicht nach
  der Nummer.
- Ist die Zuordnung nicht eindeutig, setze `canonical_key` auf null und eine
  tiefe `confidence`. Das ist ausdrücklich erwünscht und besser als ein Rateschluss.
- `reason` ist eine kurze deutsche Begründung (max. 15 Wörter)."""

_SCHEMA = {
    "type": "object",
    "properties": {
        "zuordnungen": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "original_position": {"type": "string"},
                    "canonical_key": {"type": ["string", "null"]},
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["original_position", "canonical_key", "confidence", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["zuordnungen"],
    "additionalProperties": False,
}


def verfuegbar() -> bool:
    """Ist der LLM-Resolver einsatzbereit? Ohne SDK oder Schlüssel: nein."""
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _norm_liste() -> str:
    return "\n".join(f"{p['key']}\t{p['bezeichnung']}" for p in norm_lv.NORM_POSITIONS)


def _prompt(offene: list[dict]) -> str:
    zeilen = "\n".join(
        f"{p.get('original_position') or '?'}\t{p.get('original_title') or ''}"
        f"\t{p.get('original_amount') if p.get('original_amount') is not None else ''}"
        for p in offene
    )
    return (
        "Norm-LV (geschlossene Liste, Schlüssel<TAB>Bezeichnung):\n"
        f"{_norm_liste()}\n\n"
        "Zuzuordnende Positionen aus dem Unternehmer-LV "
        "(Originalnummer<TAB>Bezeichnung<TAB>Betrag CHF):\n"
        f"{zeilen}\n\n"
        "Gib für JEDE Position genau einen Eintrag zurück."
    )


def resolve(offene: list[dict], *, client=None) -> dict:
    """Uneindeutige Positionen zuordnen lassen.

    Args:
        offene: Positionen ohne `canonical_key` (aus dem Parser).
        client: optionaler Anthropic-Client (für Tests injizierbar).

    Returns:
        {original_position: {canonical_key, mapping_method, mapping_confidence,
                             mapping_reason}} — nur für übernommene Zuordnungen.
        Leeres Dict, wenn nichts zu tun ist oder kein Zugang besteht.
    """
    offene = [p for p in (offene or []) if p.get("original_title")][:MAX_POSITIONS]
    if not offene:
        return {}
    if client is None:
        if not verfuegbar():
            return {}
        import anthropic
        client = anthropic.Anthropic()

    try:
        antwort = client.messages.create(
            model=MODEL,
            max_tokens=4000,
            system=_SYSTEM,
            output_config={
                "effort": "low",                       # kleine Klassifikation
                "format": {"type": "json_schema", "schema": _SCHEMA},
            },
            messages=[{"role": "user", "content": _prompt(offene)}],
        )
    except Exception:
        # Netz, Kontingent, Konfiguration — der Import darf daran nie scheitern.
        return {}

    if getattr(antwort, "stop_reason", None) == "refusal":
        return {}
    text = next((b.text for b in (antwort.content or []) if getattr(b, "type", None) == "text"), "")
    try:
        daten = json.loads(text or "{}")
    except ValueError:
        return {}

    erlaubte_nummern = {p.get("original_position") for p in offene}
    out: dict[str, dict] = {}
    for eintrag in daten.get("zuordnungen") or []:
        nummer = str(eintrag.get("original_position") or "")
        if nummer not in erlaubte_nummern:
            continue                                   # nichts Fremdes übernehmen
        key = eintrag.get("canonical_key")
        conf = eintrag.get("confidence")
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            continue
        grund = str(eintrag.get("reason") or "")[:200]
        # Schutz 1: nur Schlüssel aus der geschlossenen Liste.
        if not norm_lv.ist_norm_position(key):
            out[nummer] = {
                "canonical_key": None, "mapping_method": None,
                "mapping_confidence": conf,
                "mapping_reason": f"LLM ohne eindeutige Zuordnung: {grund}"[:200],
            }
            continue
        # Schutz 2: Schwelle.
        if conf < MIN_CONFIDENCE:
            out[nummer] = {
                "canonical_key": None, "mapping_method": None,
                "mapping_confidence": conf,
                "mapping_reason": f"LLM unsicher ({conf:.2f}): {grund}"[:200],
            }
            continue
        out[nummer] = {
            "canonical_key": key, "mapping_method": norm_lv.LLM,
            "mapping_confidence": conf,
            "mapping_reason": f"LLM: {grund}"[:200],
        }
    return out


def apply_to_rows(rows: list[dict], *, client=None) -> int:
    """Offene Zeilen (ohne canonical_key) nachträglich zuordnen.

    Verändert `rows` in place und liefert die Anzahl übernommener Zuordnungen.
    Gruppentotale werden nie zugeordnet — sie sind Kontrollzeilen.
    """
    offene = [r for r in rows
              if not r.get("is_group_total") and not r.get("canonical_key")]
    if not offene:
        return 0
    ergebnis = resolve(offene, client=client)
    if not ergebnis:
        return 0
    uebernommen = 0
    for r in offene:
        treffer = ergebnis.get(r.get("original_position"))
        if not treffer:
            continue
        r.update(treffer)
        if treffer.get("canonical_key"):
            uebernommen += 1
    return uebernommen
