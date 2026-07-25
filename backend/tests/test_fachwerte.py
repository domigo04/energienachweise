"""Zentrale Registry kontrollierter Fachwerte + Projektgrunddaten
(Punkt 5, 6, 7, 8, 19, 20, 27)."""
import pytest

from app import fachwerte
from app.lv_import.project_extract import extract_project_data


# ── Punkt 5/20 — eine Registry, stabile Codes ──────────────────────────────

def test_alle_listen_vorhanden():
    for name in ("generator_types", "heat_delivery_types", "certifications",
                 "building_uses", "project_types", "scope_levels"):
        assert fachwerte.REGISTRY[name], f"{name} fehlt"


def test_codes_sind_eindeutig_und_stabil():
    for name, eintraege in fachwerte.REGISTRY.items():
        codes = [e["code"] for e in eintraege]
        assert len(codes) == len(set(codes)), f"doppelte Codes in {name}"
        for e in eintraege:
            assert e["code"] == e["code"].lower()
            assert " " not in e["code"]
            assert e["label"]


def test_zertifizierung_ist_kein_freitext_mehr():
    """Punkt 8/20 — die Zertifizierungsoptionen aus der Vorgabe existieren."""
    assert set(fachwerte.codes("certifications")) >= {
        "none", "minergie", "minergie_p", "minergie_eco", "snbs", "leed", "other"}
    assert fachwerte.label("certifications", "minergie_p") == "Minergie-P"


def test_waermeabgabe_codes_wie_vorgegeben():
    """Punkt 8 — kanonische Werte der Wärmeabgabe."""
    assert set(fachwerte.codes("heat_delivery_types")) >= {
        "fbh", "heizkoerper", "tabs", "wandheizung", "konvektoren",
        "lufterhitzer", "deckenstrahlplatten", "sonstige"}


# ── Normalisierung von Altdaten und LV-Freitext ────────────────────────────

@pytest.mark.parametrize("text,erwartet", [
    ("Minergie-P", "minergie_p"), ("minergie p", "minergie_p"),
    ("Minergie", "minergie"), ("Minergie-ECO", "minergie_eco"),
    ("keine", "none"), ("SNBS", "snbs"), ("LEED", "leed"),
])
def test_zertifizierung_normalisieren(text, erwartet):
    """Längeres Synonym gewinnt: „minergie p" darf nicht auf „minergie" fallen."""
    assert fachwerte.normalize("certifications", text) == erwartet


@pytest.mark.parametrize("text,erwartet", [
    ("Sole/Wasser-Wärmepumpe", "ews_wp"), ("Sole Wasser WP", "ews_wp"),
    ("Erdsonden-Wärmepumpe", "ews_wp"), ("EWS-WP", "ews_wp"),
    ("Luft/Wasser-Wärmepumpe", "lwwp"), ("Fernwärme", "fernwaerme"),
    ("Gaskessel", "gas"), ("Pelletheizung", "holz"),
])
def test_erzeugertyp_normalisieren(text, erwartet):
    """Punkt 6 — Synonyme werden erkannt, gespeichert wird immer der Code."""
    assert fachwerte.normalize("generator_types", text) == erwartet


def test_unbekannter_wert_bleibt_none():
    """Punkt 18-Geist: nichts erfinden."""
    assert fachwerte.normalize("certifications", "Wilder Fantasiestandard") is None
    assert fachwerte.normalize("generator_types", "") is None
    assert fachwerte.normalize("generator_types", None) is None


# ── Punkt 6/7 — Mehrfachauswahl ───────────────────────────────────────────

def test_mehrere_waermeerzeuger():
    """„EWS-WP + Gas" und „Fernwärme + WP" müssen abbildbar sein."""
    assert fachwerte.normalize_list("generator_types", "EWS-WP + Gas") == ["ews_wp", "gas"]
    assert fachwerte.normalize_list("generator_types", ["Fernwärme", "Sole/Wasser-WP"]) == \
        ["fernwaerme", "ews_wp"]


def test_mehrere_waermeabgaben():
    """Punkt 7 — „FBH + Heizkörper"."""
    assert fachwerte.normalize_list("heat_delivery_types", "FBH + Heizkörper") == \
        ["fbh", "heizkoerper"]


def test_normalize_list_entfernt_duplikate():
    assert fachwerte.normalize_list("generator_types", "Gas, Gaskessel") == ["gas"]


def test_hybrid_ist_abgeleitet_kein_erzeuger():
    """Punkt 7 — Hybrid ist kein wählbarer Erzeuger, sondern len(...) > 1."""
    assert "hybrid" not in fachwerte.codes("generator_types")
    assert fachwerte.ist_hybrid(["ews_wp", "gas"]) is True
    assert fachwerte.ist_hybrid(["ews_wp"]) is False
    assert fachwerte.ist_hybrid([]) is False


def test_multi_value_merkmale_deklariert():
    assert "generator_types" in fachwerte.MULTI_VALUE
    assert "heat_delivery_types" in fachwerte.MULTI_VALUE


def test_frontend_registry_liefert_codes_und_labels():
    """Punkt 5 — das Frontend bekommt dieselbe Registry, keine eigene Kopie."""
    fe = fachwerte.as_frontend()
    assert set(fe["listen"]) == set(fachwerte.REGISTRY)
    assert {"code", "label"} == set(fe["listen"]["certifications"][0])
    assert fe["multi_value"] == list(fachwerte.MULTI_VALUE)


# ── Punkt 19 — Projektgrunddaten aus dem Deckblatt ────────────────────────

def _deckblatt(text: str, page: int = 1):
    return [{"page": page, "text": text}]


DECKBLATT = (
    "Ausschreibung und Angebot\n"
    "Heizungsanlage\n"
    "Projekt: 3-MFH Musterstrasse / Ueberbauung Musterweg\n"
    "Ort: Musterberg\n"
    "Bauherr: Muster Immobilien AG\n"
    "Unternehmer: Muster Heizungsbau AG\n"
    "Datum: 12.03.2024\n"
)


def test_deckblattdaten_werden_erkannt():
    """Punkt 19 — Projekt, Ort, Unternehmer, Datum aus den Kopfseiten."""
    res = extract_project_data(_deckblatt(DECKBLATT, page=1))
    assert "3-MFH Musterstrasse" in res["project_name"]["value"]
    assert res["location"]["value"] == "Musterberg"
    assert res["contractor"]["value"] == "Muster Heizungsbau AG"
    assert res["offer_date"]["value"] == "12.03.2024"
    assert res["project_name"]["source_page"] == 1


def test_gebaeudenutzung_aus_3_mfh_vorgeschlagen():
    """Punkt 19 — „3-MFH" ist ein eindeutiger Hinweis auf MFH."""
    res = extract_project_data(_deckblatt(DECKBLATT))
    assert res["building_use"]["value"] == "mfh"
    assert res["building_use"]["confidence"] == "high"
    assert res["units"]["value"] == 3


def test_efh_wird_unterschieden():
    res = extract_project_data(_deckblatt("Projekt: 1-EFH Beispielweg\n"))
    assert res["building_use"]["value"] == "efh"


def test_ebf_zertifizierung_projektart_werden_nicht_geraten():
    """Punkt 19 — diese Werte dürfen NIE erfunden werden."""
    res = extract_project_data(_deckblatt(DECKBLATT))
    for verboten in ("ebf_m2", "certification", "project_type"):
        assert verboten not in res


def test_leeres_deckblatt_liefert_nichts():
    assert extract_project_data([]) == {}
    assert extract_project_data(_deckblatt("   ")) == {}
