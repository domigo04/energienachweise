"""Provider-neutrale Schnittstelle für die Kosten-Zuordnung (closed world).

Die LV-Pipeline weiss nicht, ob dahinter OpenAI oder Anthropic läuft. Alles
Gemeinsame — Systemprompt, JSON-Schema, Prompt-Aufbau, Antwort-Parsing — steht
hier, damit ein Providerwechsel nichts an der Fachlogik ändert und beide Anbieter
denselben Auftrag bekommen (Voraussetzung für einen faires Benchmark).

Was das Modell bekommt, ist bewusst eng (Datensparsamkeit):

    erlaubt:  Original-Unterpositionsnummer, Originaltitel, BKP-/Abschnittspfad
              und höchstens wenige Kandidaten aus dem passenden BKP-Kontext
    nie:      Beträge, PDF-Inhalte, Projektname, Bauherr, Unternehmer,
              Adressen, Telefonnummern, Personennamen, technische Mengen

Was es zurückgeben darf: einen Schlüssel aus der Liste — oder null.
"""
from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import Optional

# Antwortform (identisch für alle Provider).
RESPONSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "mappings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    # null ist ein ausdrücklich gültiges Ergebnis.
                    "canonical_key": {"type": ["string", "null"]},
                    # Weitere Norm-Positionen, die dieselbe Quellzeile fachlich
                    # abdeckt (Sammelposition). Der Betrag bleibt beim primären
                    # Schlüssel und wird NIE aufgeteilt.
                    "included_norm_lv_keys": {
                        "type": "array", "items": {"type": "string"},
                    },
                    "confidence": {"type": "number"},
                    "reason": {"type": "string", "maxLength": 120},
                },
                "required": ["source_id", "canonical_key", "included_norm_lv_keys",
                             "confidence", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["mappings"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Du ordnest Positionen aus einem Schweizer Unternehmer-\
Leistungsverzeichnis (Heizung) je einer Position eines festen Norm-LV zu.

Regeln:
- Wähle `canonical_key` ausschliesslich aus der vorgegebenen Liste. Erfinde
  niemals einen Schlüssel und niemals eine neue Kategorie.
- Entscheide nach der BEZEICHNUNG, nicht nach der Nummer. Unternehmer
  nummerieren Unterpositionen je Projekt anders.
- Beachte BKP-Gruppe, vollständigen Abschnittspfad und fachlichen Kontext.
- Wähle je Quellposition nur aus deren Kandidatenliste.
- Passt keine Position fachlich, setze `canonical_key` auf null und eine tiefe
  `confidence`. Das ist ausdrücklich erwünscht und besser als ein Rateschluss.
- `confidence` ist deine ehrliche Sicherheit zwischen 0 und 1.
- `reason` ist eine kurze deutsche Begründung (max. 15 Wörter).
- Gib für JEDE übergebene Position genau einen Eintrag zurück.
- Deckt eine Quellzeile mehrere Norm-Positionen ab (z.B. «Speicher /
  Frischwasserstation»), setze die fachlich führende als `canonical_key` und
  die weiteren in `included_norm_lv_keys`. Alle müssen aus der Kandidatenliste
  stammen. Teile den Betrag NICHT auf — er zählt genau einmal.
- `scope_summary` beschreibt, was in der Quellposition alles enthalten ist.
  Er wiegt schwerer als die laufende Nummer.
- Sonst bleibt `included_norm_lv_keys` eine leere Liste."""


def build_user_prompt(positions: list[dict], allowed_positions: list[dict]) -> str:
    """Kompakter Prompt aus offenen Positionen und ihren wenigen Kandidaten.

    `positions`: [{"source_id", "title", "group"(optional)}]
    `allowed_positions`: [{"key", "title"}]
    """
    compact = [{
        "source_id": p["source_id"],
        "title": p["title"],
        "bkp_group": p.get("group"),
        "section_path": p.get("section_path"),
        "parent_bkp": p.get("parent_bkp"),
        "scope_summary": p.get("scope_summary"),
        "candidates": p.get("candidates") or [],
    } for p in positions]
    return json.dumps({"positions": compact}, ensure_ascii=False, separators=(",", ":"))


_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def parse_mappings(text: str) -> list[dict]:
    """Antworttext → Liste der Zuordnungen. Unparsbares ergibt [].

    Structured Output liefert reines JSON; der Regex-Fallback fängt nur den Fall
    ab, dass ein Provider zusätzlich Fliesstext um das JSON legt.
    """
    if not text:
        return []
    try:
        daten = json.loads(text)
    except ValueError:
        m = _JSON_BLOCK.search(text)
        if not m:
            return []
        try:
            daten = json.loads(m.group(0))
        except ValueError:
            return []
    if not isinstance(daten, dict):
        return []
    mappings = daten.get("mappings")
    return [m for m in mappings if isinstance(m, dict)] if isinstance(mappings, list) else []


class CostMappingLLM(ABC):
    """Ein Anbieter, der Positionstitel dem Norm-LV zuordnet.

    Implementierungen dürfen KEINE Fachlogik enthalten: keine Schwellen, keine
    Prüfung gegen das Norm-LV, keine Bestätigungen. Das macht ausschliesslich der
    Resolver, damit es für alle Provider identisch gilt.
    """

    #: Kurzname für Konfiguration und Debug ("openai" | "anthropic")
    name: str = "base"

    def __init__(self, model: Optional[str] = None, client=None, budget=None):
        self.model = model
        self._client = client
        self.budget = budget

    @abstractmethod
    def available(self) -> tuple[bool, str]:
        """(einsatzbereit, Grund). Der Grund ist für Debug/Doku, nie für Nutzer."""

    @abstractmethod
    def resolve(self, positions: list[dict], allowed_positions: list[dict]) -> list[dict]:
        """Rohe Zuordnungen des Modells. Fehler → [] (nie eine Ausnahme).

        Rückgabe: [{"source_id", "canonical_key", "confidence", "reason"}]
        """
