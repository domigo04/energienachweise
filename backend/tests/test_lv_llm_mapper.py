"""Optionaler LLM-Resolver für uneindeutige Kostenzuordnungen.

Kein Netzzugriff: der Anthropic-Client wird injiziert. Geprüft wird vor allem,
dass das LLM NICHTS erfinden kann — geschlossene Liste, Schwelle, Fallback.
"""
import json
from types import SimpleNamespace

import pytest

from app.lv_import import llm_mapper, norm_lv


class FakeClient:
    """Minimaler Ersatz für anthropic.Anthropic mit fixer Antwort."""

    def __init__(self, zuordnungen, *, stop_reason="end_turn", raise_exc=None,
                 raw=None):
        self.zuordnungen = zuordnungen
        self.stop_reason = stop_reason
        self.raise_exc = raise_exc
        self.raw = raw
        self.calls = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self.raise_exc:
            raise self.raise_exc
        text = self.raw if self.raw is not None else json.dumps(
            {"zuordnungen": self.zuordnungen})
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="text", text=text)],
        )


def _offen(nummer="248.2", titel="Elektroanschluesse", betrag=11757.0):
    return [{"original_position": nummer, "original_title": titel,
             "original_amount": betrag}]


# ── Gültige Zuordnung wird übernommen ──────────────────────────────────────

def test_gueltige_zuordnung_wird_uebernommen():
    client = FakeClient([{"original_position": "248.2", "canonical_key": "243.6",
                          "confidence": 0.96, "reason": "Elektro/Regelung"}])
    res = llm_mapper.resolve(_offen(), client=client)
    assert res["248.2"]["canonical_key"] == "243.6"
    assert res["248.2"]["mapping_method"] == "llm"
    assert res["248.2"]["mapping_confidence"] == 0.96
    assert "Elektro/Regelung" in res["248.2"]["mapping_reason"]


def test_null_zuordnung_bleibt_offen():
    """Das Modell darf ausdrücklich „weiss nicht" sagen (Punkt 18)."""
    client = FakeClient([{"original_position": "248.2", "canonical_key": None,
                          "confidence": 0.38, "reason": "Keine eindeutige Zuordnung"}])
    res = llm_mapper.resolve(_offen(), client=client)
    assert res["248.2"]["canonical_key"] is None
    assert res["248.2"]["mapping_method"] is None


# ── Das LLM darf nichts erfinden ───────────────────────────────────────────

def test_erfundener_schluessel_wird_verworfen():
    """Ein Schlüssel ausserhalb des Norm-LV wird NIE übernommen."""
    client = FakeClient([{"original_position": "248.2",
                          "canonical_key": "999.99_elektro",
                          "confidence": 0.99, "reason": "erfunden"}])
    res = llm_mapper.resolve(_offen(), client=client)
    assert res["248.2"]["canonical_key"] is None


def test_zuordnung_zu_fremder_position_wird_ignoriert():
    """Antworten zu Positionen, die nicht gefragt waren, werden verworfen."""
    client = FakeClient([{"original_position": "999.1", "canonical_key": "243.1",
                          "confidence": 0.99, "reason": "nicht gefragt"}])
    res = llm_mapper.resolve(_offen(), client=client)
    assert res == {}


def test_zu_geringe_sicherheit_wird_nicht_uebernommen():
    client = FakeClient([{"original_position": "248.2", "canonical_key": "243.6",
                          "confidence": 0.5, "reason": "vielleicht"}])
    res = llm_mapper.resolve(_offen(), client=client)
    assert res["248.2"]["canonical_key"] is None
    assert "unsicher" in res["248.2"]["mapping_reason"]


def test_schwelle_ist_dokumentiert():
    assert 0.5 < llm_mapper.MIN_CONFIDENCE <= 1.0


# ── Robustheit: der Import darf nie am LLM scheitern ───────────────────────

def test_netzfehler_bleibt_ohne_wirkung():
    client = FakeClient([], raise_exc=RuntimeError("Netz weg"))
    assert llm_mapper.resolve(_offen(), client=client) == {}


def test_kaputte_antwort_bleibt_ohne_wirkung():
    client = FakeClient([], raw="kein json")
    assert llm_mapper.resolve(_offen(), client=client) == {}


def test_refusal_bleibt_ohne_wirkung():
    client = FakeClient([{"original_position": "248.2", "canonical_key": "243.6",
                          "confidence": 0.9, "reason": "x"}], stop_reason="refusal")
    assert llm_mapper.resolve(_offen(), client=client) == {}


def test_ohne_offene_positionen_kein_aufruf():
    client = FakeClient([])
    assert llm_mapper.resolve([], client=client) == {}
    assert client.calls == []


# ── Aufrufform: ein Aufruf, geschlossene Liste, kleines Budget ─────────────

def test_ein_aufruf_fuer_alle_offenen_positionen():
    """Kosten bleiben im Rappenbereich: gebündelt, nicht pro Position."""
    offen = [
        {"original_position": "248.2", "original_title": "Elektroanschluesse",
         "original_amount": 11757.0},
        {"original_position": "248.3", "original_title": "Inbetriebnahme",
         "original_amount": 9009.0},
    ]
    client = FakeClient([])
    llm_mapper.resolve(offen, client=client)
    assert len(client.calls) == 1


def test_prompt_enthaelt_die_geschlossene_liste_und_keine_pdf_daten():
    client = FakeClient([])
    llm_mapper.resolve(_offen(), client=client)
    kwargs = client.calls[0]
    prompt = kwargs["messages"][0]["content"]
    # Geschlossene Liste ist enthalten …
    assert "242.3" in prompt and "Wärmepumpe Sole/Wasser" in prompt
    # … und die zuzuordnende Position samt Kontext.
    assert "Elektroanschluesse" in prompt
    # Strukturierte Antwort erzwungen, kleines Effort-Budget.
    assert kwargs["output_config"]["format"]["type"] == "json_schema"
    assert kwargs["output_config"]["effort"] == "low"
    assert kwargs["model"] == "claude-opus-5"


def test_system_prompt_verbietet_nummernlogik_und_erfindungen():
    client = FakeClient([])
    llm_mapper.resolve(_offen(), client=client)
    system = client.calls[0]["system"].lower()
    assert "erfinde niemals" in system
    assert "nummer" in system            # Nummer ist nicht verlässlich
    assert "null" in system              # darf „weiss nicht" sagen


# ── apply_to_rows: nur offene Zeilen, Gruppentotale nie ────────────────────

def test_apply_to_rows_ordnet_nur_offene_zeilen_zu():
    rows = [
        {"original_position": "241.11", "original_title": "Rohrleitungen Primärkreis",
         "canonical_key": "241.11", "is_group_total": False},
        {"original_position": "248.2", "original_title": "Elektroanschluesse",
         "canonical_key": None, "is_group_total": False},
        {"original_position": None, "original_title": "Total BKP 248",
         "canonical_key": None, "is_group_total": True},
    ]
    client = FakeClient([{"original_position": "248.2", "canonical_key": "243.6",
                          "confidence": 0.95, "reason": "Regelung/Elektro"}])
    anzahl = llm_mapper.apply_to_rows(rows, client=client)
    assert anzahl == 1
    assert rows[0]["canonical_key"] == "241.11"          # bestehende bleibt
    assert rows[0].get("mapping_method") is None          # unverändert
    assert rows[1]["canonical_key"] == "243.6"
    assert rows[2]["canonical_key"] is None               # Gruppentotal nie
    # Das Gruppentotal wurde dem Modell nicht einmal gezeigt.
    prompt = client.calls[0]["messages"][0]["content"]
    assert "Total BKP 248" not in prompt


def test_apply_to_rows_ohne_offene_zeilen_ruft_nicht_auf():
    rows = [{"original_position": "241.11", "canonical_key": "241.11",
             "original_title": "Rohrleitungen", "is_group_total": False}]
    client = FakeClient([])
    assert llm_mapper.apply_to_rows(rows, client=client) == 0
    assert client.calls == []


# ── Ohne API-Zugang bleibt das System funktionsfähig ───────────────────────

def test_ohne_api_schluessel_kein_resolver(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    assert llm_mapper.verfuegbar() is False
    # Ohne Client UND ohne Zugang passiert schlicht nichts (kein Absturz).
    assert llm_mapper.resolve(_offen()) == {}


def test_norm_liste_ist_geschlossen_und_nicht_leer():
    assert len(norm_lv.NORM_KEYS) >= 40
    assert norm_lv.ist_norm_position("242.3") is True
    assert norm_lv.ist_norm_position("erfunden") is False
    assert norm_lv.ist_norm_position(None) is False
