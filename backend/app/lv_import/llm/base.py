"""Provider-neutrale Schnittstelle für die Kosten-Zuordnung (closed world).

Die LV-Pipeline weiss nicht, ob dahinter OpenAI oder Anthropic läuft. Alles
Gemeinsame — Systemprompt, JSON-Schema, Prompt-Aufbau, Antwort-Parsing — steht
hier, damit ein Providerwechsel nichts an der Fachlogik ändert und beide Anbieter
denselben Auftrag bekommen (Voraussetzung für einen faires Benchmark).

Was das Modell bekommt, ist bewusst eng (Datensparsamkeit):

    erlaubt:  Original-Unterpositionsnummer, Originaltitel,
              geschlossene Liste der Norm-LV-Positionen,
              optional die BKP-Hauptgruppe als SCHWACHER Kontext
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
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["source_id", "canonical_key", "confidence", "reason"],
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
  nummerieren Unterpositionen je Projekt anders: „242.1 Wärmeerzeuger
  Sole/Wasser-Wärmepumpe" gehört zur Norm-Position „Wärmepumpe Sole/Wasser",
  auch wenn diese eine andere Nummer trägt.
- Eine Leistung kann in einer anderen Hauptgruppe stehen als im Norm-LV.
  „Isolation Rohrleitungen" unter 247 gehört zur Norm-Rohrisolation unter 248.
  Die mitgelieferte Gruppe ist nur ein schwacher Hinweis, kein Filter.
- Passt keine Position fachlich, setze `canonical_key` auf null und eine tiefe
  `confidence`. Das ist ausdrücklich erwünscht und besser als ein Rateschluss.
- `confidence` ist deine ehrliche Sicherheit zwischen 0 und 1.
- `reason` ist eine kurze deutsche Begründung (max. 15 Wörter).
- Gib für JEDE übergebene Position genau einen Eintrag zurück."""


def build_user_prompt(positions: list[dict], allowed_positions: list[dict]) -> str:
    """Prompt aus offenen Positionen + geschlossener Liste.

    `positions`: [{"source_id", "title", "group"(optional)}]
    `allowed_positions`: [{"key", "title"}]
    """
    liste = "\n".join(f'{p["key"]}\t{p["title"]}' for p in allowed_positions)
    zeilen = []
    for p in positions:
        gruppe = p.get("group")
        zeilen.append(
            f'{p["source_id"]}\t{p["title"]}'
            + (f"\t(Hauptgruppe {gruppe}, nur Hinweis)" if gruppe else "")
        )
    return (
        "Erlaubte Norm-LV-Positionen (geschlossene Liste, Schlüssel<TAB>Bezeichnung):\n"
        f"{liste}\n\n"
        "Zuzuordnende Positionen (Originalnummer<TAB>Bezeichnung):\n"
        + "\n".join(zeilen)
    )


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

    def __init__(self, model: Optional[str] = None, client=None):
        self.model = model
        self._client = client

    @abstractmethod
    def available(self) -> tuple[bool, str]:
        """(einsatzbereit, Grund). Der Grund ist für Debug/Doku, nie für Nutzer."""

    @abstractmethod
    def resolve(self, positions: list[dict], allowed_positions: list[dict]) -> list[dict]:
        """Rohe Zuordnungen des Modells. Fehler → [] (nie eine Ausnahme).

        Rückgabe: [{"source_id", "canonical_key", "confidence", "reason"}]
        """
