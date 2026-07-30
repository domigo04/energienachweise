"""Provider-neutrale KI-Zuordnung (Punkte 2, 6, 8–10, 19–21, 32).

Keine echten API-Aufrufe: beide Provider werden mit einem Fake-Client bedient.
Geprüft wird vor allem, dass das Modell NICHTS erfinden kann und dass jeder
Ausfall den LV-Import unberührt lässt.
"""
import json
from types import SimpleNamespace

import pytest

from app.lv_import import norm_lv
from app.lv_import.llm import base, resolver
from app.lv_import.llm.anthropic_provider import AnthropicCostMapper
from app.lv_import.llm.openai_provider import OpenAICostMapper


# ── Fake-Clients: gleiche Antwort, zwei Wire-Formate ───────────────────────

class FakeAnthropic:
    def __init__(self, payload=None, *, raw=None, exc=None, stop_reason="end_turn"):
        self.payload, self.raw, self.exc, self.stop_reason = payload, raw, exc, stop_reason
        self.calls = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(kw)
        if self.exc:
            raise self.exc
        text = self.raw if self.raw is not None else json.dumps({"mappings": self.payload or []})
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=text)])


class FakeOpenAI:
    def __init__(self, payload=None, *, raw=None, exc=None, refusal=None):
        self.payload, self.raw, self.exc, self.refusal = payload, raw, exc, refusal
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        self.calls.append(kw)
        if self.exc:
            raise self.exc
        text = self.raw if self.raw is not None else json.dumps({"mappings": self.payload or []})
        msg = SimpleNamespace(content=text, refusal=self.refusal)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


def _pos(source_id="243.x", title="Regelung Verteilung", group="243"):
    return [{"source_id": source_id, "title": title, "group": group}]


def _map(source_id="243.x", key="243.6", conf=0.96, reason="Regelung Verteilung"):
    return [{"source_id": source_id, "canonical_key": key,
             "confidence": conf, "reason": reason}]


def _anthropic(payload=None, **kw):
    return AnthropicCostMapper(model="test-model", client=FakeAnthropic(payload, **kw))


def _openai(payload=None, **kw):
    return OpenAICostMapper(model="test-model", client=FakeOpenAI(payload, **kw))


ALLE_PROVIDER = pytest.mark.parametrize("mach_provider", [_anthropic, _openai],
                                        ids=["anthropic", "openai"])


# ── Beide Provider verhalten sich identisch ────────────────────────────────

@ALLE_PROVIDER
def test_gueltige_zuordnung_wird_uebernommen(mach_provider):
    res = resolver.resolve(_pos(), provider=mach_provider(_map()))
    assert res["243.x"]["canonical_key"] == "243.6"
    assert res["243.x"]["mapping_method"] == "llm"
    assert res["243.x"]["mapping_confidence"] == 0.96
    assert "0.96" in res["243.x"]["mapping_reason"]


@ALLE_PROVIDER
def test_null_ist_ein_gueltiges_ergebnis(mach_provider):
    res = resolver.resolve(_pos(), provider=mach_provider(
        _map(key=None, conf=0.38, reason="keine passende Position")))
    assert res["243.x"]["canonical_key"] is None
    assert res["243.x"]["mapping_method"] is None


@ALLE_PROVIDER
def test_erfundener_schluessel_wird_verworfen(mach_provider):
    """Closed world: ein Schlüssel ausserhalb des Norm-LV wird nie übernommen."""
    res = resolver.resolve(_pos(), provider=mach_provider(
        _map(key="999.99_elektro", conf=0.99)))
    assert res["243.x"]["canonical_key"] is None
    assert "unbekannter Schlüssel" in res["243.x"]["mapping_reason"]


@ALLE_PROVIDER
def test_zu_geringe_confidence_wird_nicht_uebernommen(mach_provider):
    res = resolver.resolve(_pos(), provider=mach_provider(_map(conf=0.5)))
    assert res["243.x"]["canonical_key"] is None
    assert "unsicher" in res["243.x"]["mapping_reason"]


@ALLE_PROVIDER
def test_fremde_position_wird_ignoriert(mach_provider):
    res = resolver.resolve(_pos(), provider=mach_provider(_map(source_id="999.1")))
    assert res == {}


@ALLE_PROVIDER
def test_hohe_confidence_setzt_nie_mapping_confirmed(mach_provider):
    """Punkt 10 — selbst 0.99 bestätigt nichts. Das kann nur der Mensch."""
    res = resolver.resolve(_pos(), provider=mach_provider(_map(conf=0.99)))
    assert "mapping_confirmed" not in res["243.x"]


# ── Punkt 20 — jeder Ausfall bleibt harmlos ───────────────────────────────

@ALLE_PROVIDER
@pytest.mark.parametrize("fehler", [
    TimeoutError("timeout"), RuntimeError("429 rate limit"),
    RuntimeError("500 provider error"), ConnectionError("netz weg"),
], ids=["timeout", "429", "500", "verbindung"])
def test_api_fehler_bleiben_ohne_wirkung(mach_provider, fehler):
    assert resolver.resolve(_pos(), provider=mach_provider(exc=fehler)) == {}


@ALLE_PROVIDER
def test_kaputtes_json_bleibt_ohne_wirkung(mach_provider):
    assert resolver.resolve(_pos(), provider=mach_provider(raw="kein json")) == {}


def test_anthropic_refusal_bleibt_ohne_wirkung():
    p = AnthropicCostMapper(model="m", client=FakeAnthropic(_map(), stop_reason="refusal"))
    assert resolver.resolve(_pos(), provider=p) == {}


def test_openai_refusal_bleibt_ohne_wirkung():
    p = OpenAICostMapper(model="m", client=FakeOpenAI(_map(), refusal="abgelehnt"))
    assert resolver.resolve(_pos(), provider=p) == {}


def test_json_mit_umgebendem_fliesstext_wird_trotzdem_gelesen():
    payload = json.dumps({"mappings": _map()})
    p = _anthropic(raw=f"Hier das Ergebnis:\n{payload}\nEnde.")
    assert resolver.resolve(_pos(), provider=p)["243.x"]["canonical_key"] == "243.6"


# ── Konfiguration ─────────────────────────────────────────────────────────

def test_abgeschaltet_ruft_nichts_auf(monkeypatch):
    monkeypatch.setenv("COST_MAPPING_LLM_ENABLED", "false")
    assert resolver.enabled() is False
    assert resolver.resolve(_pos()) == {}
    assert resolver.status()["llm_available"] is False


def test_fehlender_api_key_meldet_grund(monkeypatch):
    monkeypatch.setenv("COST_MAPPING_LLM_ENABLED", "true")
    monkeypatch.setenv("COST_MAPPING_LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    st = resolver.status()
    assert st["llm_available"] is False
    assert "ANTHROPIC_API_KEY" in st["llm_reason"]
    assert resolver.resolve(_pos()) == {}


def test_openai_hat_verifizierten_structured_output_default(monkeypatch):
    monkeypatch.delenv("COST_MAPPING_LLM_MODEL", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    provider = OpenAICostMapper()
    assert provider.model == "gpt-5.6"


def test_modell_kommt_aus_der_umgebung(monkeypatch):
    monkeypatch.setenv("COST_MAPPING_LLM_MODEL", "irgendein-modell")
    assert AnthropicCostMapper().model == "irgendein-modell"
    assert OpenAICostMapper().model == "irgendein-modell"


def test_provider_wird_aus_vorhandenem_api_key_gewaehlt(monkeypatch):
    monkeypatch.delenv("COST_MAPPING_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert resolver.provider_name() == "openai"


def test_unbekannter_provider_ist_kein_absturz(monkeypatch):
    monkeypatch.setenv("COST_MAPPING_LLM_PROVIDER", "gibtsnicht")
    assert resolver.get_provider() is None
    st = resolver.status()
    assert st["llm_available"] is False and "Unbekannter Provider" in st["llm_reason"]
    assert resolver.resolve(_pos()) == {}


def test_status_gibt_keine_schluessel_aus(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-geheim-123")
    st = json.dumps(resolver.status())
    assert "sk-geheim" not in st


def test_beide_provider_registriert():
    assert set(resolver.PROVIDERS) == {"openai", "anthropic"}


# ── Punkt 6/21 — was gesendet wird (und was nicht) ────────────────────────

@ALLE_PROVIDER
def test_prompt_enthaelt_keine_betraege_und_keine_projektdaten(mach_provider):
    p = mach_provider()
    positionen = [{"source_id": "243.x", "title": "Regelung Verteilung", "group": "243"}]
    resolver.resolve(positionen, provider=p)
    prompt = json.dumps(p._client.calls[0], ensure_ascii=False)
    for verboten in ("11757", "11'757", "Hagmann", "Burgstrasse", "Rorschacherberg",
                     "Bauherr", "265664"):
        assert verboten not in prompt, f"{verboten} darf nicht ans LLM gehen"
    # Erlaubt und nötig: Titel, Nummer, geschlossene Liste, Gruppe als Hinweis.
    assert "Regelung Verteilung" in prompt
    assert "243.6" in prompt and "Regelung" in prompt
    assert "Wärmepumpe Sole/Wasser" not in prompt
    user_content = (
        p._client.calls[0]["messages"][0]["content"]
        if p.name == "anthropic"
        else p._client.calls[0]["messages"][1]["content"]
    )
    sent = json.loads(user_content)["positions"][0]
    assert len(sent["candidates"]) <= 6
    assert {candidate["group"] for candidate in sent["candidates"]} == {"243"}


@ALLE_PROVIDER
def test_ein_aufruf_fuer_alle_offenen_positionen(mach_provider):
    p = mach_provider()
    resolver.resolve([{"source_id": f"24{i}.1", "title": f"Position {i}"}
                      for i in range(8)], provider=p)
    assert len(p._client.calls) == 1


@ALLE_PROVIDER
def test_structured_output_wird_verlangt(mach_provider):
    p = mach_provider()
    resolver.resolve(_pos(), provider=p)
    kw = p._client.calls[0]
    if p.name == "anthropic":
        assert kw["output_config"]["format"]["type"] == "json_schema"
    else:
        assert kw["response_format"]["type"] == "json_schema"
        assert kw["response_format"]["json_schema"]["strict"] is True


def test_systemprompt_verbietet_nummernlogik_und_erfindungen():
    # Umbrüche normalisieren — der Prompt ist umgebrochen, der Inhalt zählt.
    sp = " ".join(base.SYSTEM_PROMPT.lower().split())
    assert "erfinde niemals" in sp
    assert "bezeichnung, nicht nach der nummer" in sp
    assert "kandidatenliste" in sp
    assert "null" in sp               # darf „weiss nicht" sagen


def test_schema_erlaubt_null_als_key():
    typen = base.RESPONSE_SCHEMA["properties"]["mappings"]["items"]["properties"]
    assert typen["canonical_key"]["type"] == ["string", "null"]


# ── apply_to_rows: bestätigte Entscheidungen sind tabu ────────────────────

def test_apply_to_rows_respektiert_bestaetigte_entscheidungen():
    rows = [
        # bereits zugeordnet → unangetastet
        {"original_position": "241.11", "original_title": "Rohrleitungen Primärkreis",
         "canonical_key": "241.11", "mapping_confirmed": True, "is_group_total": False},
        # bewusst ausgeschlossen (bestätigt, ohne Zuordnung) → unangetastet
        {"original_position": "249.3", "original_title": "Regiearbeiten",
         "canonical_key": None, "mapping_confirmed": True, "is_group_total": False},
        # offen → darf zugeordnet werden
        {"original_position": "243.x", "bkp_nr": "243", "original_title": "Regelung Verteilung",
         "canonical_key": None, "mapping_confirmed": False, "is_group_total": False},
        # Gruppentotal → nie
        {"original_position": None, "bkp_nr": "248", "original_title": "Total BKP 248",
         "canonical_key": None, "mapping_confirmed": False, "is_group_total": True},
    ]
    p = _anthropic(_map())
    stat = resolver.apply_to_rows(rows, provider=p)
    assert stat == {"sent": 1, "mapped": 1}
    assert rows[0]["canonical_key"] == "241.11" and rows[0].get("mapping_method") is None
    assert rows[1]["canonical_key"] is None and rows[1]["mapping_confirmed"] is True
    assert rows[2]["canonical_key"] == "243.6"
    assert rows[3]["canonical_key"] is None
    prompt = json.dumps(p._client.calls[0], ensure_ascii=False)
    assert "Regiearbeiten" not in prompt and "Total BKP 248" not in prompt


def test_apply_to_rows_ohne_offene_zeilen_ruft_nicht_auf():
    p = _anthropic()
    rows = [{"original_position": "241.11", "original_title": "x",
             "canonical_key": "241.11", "mapping_confirmed": True, "is_group_total": False}]
    assert resolver.apply_to_rows(rows, provider=p) == {"sent": 0, "mapped": 0}
    assert p._client.calls == []


def test_geschlossene_liste_ist_das_norm_lv():
    liste = resolver._allowed_positions()
    assert {p["key"] for p in liste} == set(norm_lv.NORM_KEYS)
    assert len(liste) >= 40
