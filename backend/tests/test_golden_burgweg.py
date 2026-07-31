"""Regressionstests: born-digital Unternehmerofferte mit Schlussblatt.

Deckt die Fehler ab, die ein realer Import gezeigt hat:

* Projektstammdaten blieben leer, weil der Kopf ohne «Label:» geschrieben war.
* Die Gebäudenutzung wurde ohne Beleg auf Mehrfamilienhaus gesetzt.
* Die letzte BKP-Gruppe (249) fiel weg, weil ihre Seite als «conditions» galt.
* Konditionen entstanden nur über die KI — ohne sie blieb alles leer.
* Ein Merkmal ohne Fundstelle wurde gespeichert («lha» in «Stahlhalterung»).
* Rohrmeter zählten Dämm- und Flächenheizungslängen mit.

Die Prüfungen hängen an fachlichen Mustern, nicht an einem Dateinamen.
"""
import pytest

from app import fachwerte
from app.lv_import import (
    conditions_extract, commercial, page_classifier, quantities, systems,
)
from app.lv_import.project_extract import extract_project_data

# ── Golden-Werte ───────────────────────────────────────────────────────────
LV_SUMME = 256219.20
BKP_249_TOTAL = 7350.0
GESAMTTOTAL = 236264.05
MWST_SATZ = 8.1
ROHRMETER_EXKL_FBH = 288.0
FBH_ROHRMETER = 5000.0
BKP_HAUPTGRUPPEN = {"241", "242", "243", "247", "248", "249"}

_DECKBLATT = """Dupper Sanitär + Heizung GmbH
Musterweg 4
9000 St. Gallen

Ueberbauung Burgweg
9404 Rorschacherberg

Offerte Nr. 2024.0043
28.02.2024
Heizung
"""

# Schlussseite: letzte BKP-Gruppe UND Konditionen auf derselben Seite.
_SCHLUSSSEITE = """Zusammenstellung Fortsetzung

249   Diverses
249.1 Wartungsunterlagen                          350.00
249.2 Unvorhergesehenes/Anpassungen             5'000.00
249.3 Ausfuehrungsplanung                       2'000.00
Total BKP 249                                   7'350.00

Total Heizung                                 256'219.20
Rabatt                       12 %              30'746.30
Skonto                        2 %               4'509.45
Baureinigung/Beschaedigungen 0.5 %              1'104.82
Bauwasser + elektrische Energie 0.3 %             659.58
Bauwesenversicherung         0.2 %                438.40
Baureklame pauschal                               200.00
MWST                         8.1 %             17'703.40
Gesamttotal                                   236'264.05
"""


# ── 1) Projektstammdaten ───────────────────────────────────────────────────

def test_deckblatt_ohne_labels_wird_gelesen():
    daten = extract_project_data([{"page": 1, "text": _DECKBLATT}])
    assert daten["project_name"]["value"] == "Ueberbauung Burgweg"
    assert daten["project_number"]["value"] == "2024.0043"
    assert daten["offer_date"]["value"] == "28.02.2024"
    assert "Dupper" in daten["contractor"]["value"]


def test_projektort_ist_nicht_die_firmenadresse():
    """Auf dem Deckblatt stehen zwei Adressen — massgebend ist die des Baus."""
    daten = extract_project_data([{"page": 1, "text": _DECKBLATT}])
    assert daten["location"]["value"] == "9404 Rorschacherberg"
    assert "St. Gallen" not in daten["location"]["value"]


def test_jede_erkannte_projektangabe_traegt_einen_beleg():
    daten = extract_project_data([{"page": 1, "text": _DECKBLATT}])
    for feld, eintrag in daten.items():
        assert eintrag.get("source_page") is not None, feld
        assert eintrag.get("source_text"), feld
        assert eintrag.get("confidence"), feld


def test_gebaeudenutzung_bleibt_leer_ohne_beleg():
    """«Überbauung» sagt nichts über die Nutzung — kein stiller MFH-Default."""
    daten = extract_project_data([{"page": 1, "text": _DECKBLATT}])
    assert "building_use" not in daten
    assert fachwerte.normalize("building_uses", "Ueberbauung Burgweg") is None


def test_eindeutige_nutzung_wird_weiterhin_erkannt():
    daten = extract_project_data([{"page": 1, "text": "Projekt: 3-MFH Burgstrasse\n"}])
    assert daten["building_use"]["value"] == "mfh"
    assert daten["units"]["value"] == 3


# ── 2) BKP 249 ─────────────────────────────────────────────────────────────

def test_schlussseite_mit_konditionen_gilt_trotzdem_als_kostenseite():
    """Die Seite trägt Rabatt und MWST — und die letzte BKP-Gruppe."""
    klasse = page_classifier.classify_page(_SCHLUSSSEITE)
    # Egal wie sie eingestuft wird: sie enthält nachweislich Kostenzeilen.
    assert page_classifier.zaehle_kostenzeilen(_SCHLUSSSEITE) >= 3
    assert klasse["type"] in page_classifier.PAGE_TYPES


def test_bkp_249_wird_aus_der_schlussseite_gelesen():
    from app.lv_import.cost_summary import parse_cost_summary

    ergebnis = parse_cost_summary([{"page": 34, "text": _SCHLUSSSEITE}])
    positionen = [p for p in ergebnis["positions"] if p["bkp_group"] == "249"]
    assert len(positionen) == 3
    assert sum(p["amount"] for p in positionen) == pytest.approx(BKP_249_TOTAL)
    assert ergebnis["group_totals"]["249"]["amount"] == pytest.approx(BKP_249_TOTAL)


def test_kein_bkp_bereich_ist_ausgeschlossen():
    """Jede Hauptgruppe des Norm-LV muss zuordenbar bleiben."""
    from app.lv_import import norm_lv

    vorhandene = {k.split(".")[0] for k in norm_lv.NORM_KEYS}
    assert BKP_HAUPTGRUPPEN <= vorhandene


@pytest.mark.parametrize("titel,gruppe", [
    ("Wartungsunterlagen", "249"),
    ("Unvorhergesehenes", "249"),
    ("Ausfuehrungsplanung", "249"),
])
def test_bkp_249_positionen_werden_zugeordnet(titel, gruppe):
    from app.lv_import import norm_lv

    treffer = norm_lv.match_title(titel, gruppe)
    assert treffer["canonical_key"] is not None
    assert treffer["canonical_key"].startswith("249")


# ── 3) Konditionen ─────────────────────────────────────────────────────────

def test_konditionen_werden_ohne_llm_erkannt():
    ergebnis = conditions_extract.parse_conditions([{"page": 34, "text": _SCHLUSSSEITE}])
    labels = [k["label"] for k in ergebnis["conditions"]]
    assert "Rabatt" in labels and "Skonto" in labels
    assert "Bauwesenversicherung" in labels and "Baureklame" in labels
    assert ergebnis["base_amount"] == pytest.approx(LV_SUMME)
    assert ergebnis["vat_rate"] == pytest.approx(MWST_SATZ)
    assert ergebnis["stated_total_incl_vat"] == pytest.approx(GESAMTTOTAL)


def test_konditionskette_ergibt_das_ausgewiesene_gesamttotal():
    ergebnis = conditions_extract.parse_conditions([{"page": 34, "text": _SCHLUSSSEITE}])
    kette, hinweise = commercial.validate(
        ergebnis["base_amount"], ergebnis["conditions"], ergebnis["vat_rate"],
        None, ergebnis["stated_vat_amount"], ergebnis["stated_total_incl_vat"],
    )
    assert hinweise == []
    assert kette["total_incl_vat"] == pytest.approx(GESAMTTOTAL, abs=0.05)


def test_rabatt_prozent_und_betrag_bleiben_erhalten():
    ergebnis = conditions_extract.parse_conditions([{"page": 34, "text": _SCHLUSSSEITE}])
    rabatt = next(k for k in ergebnis["conditions"] if k["label"] == "Rabatt")
    assert rabatt["rate_percent"] == pytest.approx(12)
    assert rabatt["amount"] == pytest.approx(30746.30)
    assert rabatt["source_page"] == 34


def test_erwaehnung_ohne_zahl_ist_keine_kondition():
    """Im Bedingungstext steht «Rabatt» oft nur als Wort."""
    ergebnis = conditions_extract.parse_conditions([{
        "page": 12, "text": "Ein Rabatt wird nach Vereinbarung gewaehrt.\n",
    }])
    assert ergebnis["conditions"] == []


def test_anfrage_bleibt_als_unbezifferte_kondition_erhalten():
    ergebnis = conditions_extract.parse_conditions([{
        "page": 2,
        "text": "Brutto 82'000.-\nRabatt Anfrage\nSkonto Anfrage\n"
                "MWST 8.1 % 6'642.-\nNetto 88'642.-",
    }])
    assert ergebnis["base_amount"] == pytest.approx(82000)
    assert ergebnis["stated_total_incl_vat"] == pytest.approx(88642)
    assert [item["status"] for item in ergebnis["conditions"]] == [
        "requested_not_priced", "requested_not_priced",
    ]


def test_nacktes_total_ist_bemessungsgrundlage():
    ergebnis = conditions_extract.parse_conditions([{
        "page": 34,
        "text": "Total 256'219.20\nRabatt 12 % 30'746.30\nMWST 8.1 % 17'703.40",
    }])
    assert ergebnis["base_amount"] == pytest.approx(LV_SUMME)


# ── 4/5) Technische Merkmale nur mit Beleg ────────────────────────────────

def test_kein_merkmal_ohne_fundstelle():
    ohne_beleg = {"kind": systems.HEAT_EMISSION, "type_code": "luftheizapparat",
                  "confidence": 0.9, "source_page": None, "source_text": None}
    assert systems.hat_beleg(ohne_beleg) is False
    mit_beleg = {**ohne_beleg, "source_page": 4, "source_text": "Luftheizapparat Stk. 2"}
    assert systems.hat_beleg(mit_beleg) is True


def test_stahlhalterung_erzeugt_keine_luftheizapparate():
    """«lha» steckt in «Stahlhalterung» — das war die Ursache des Phantoms."""
    seiten = [{"page": 4, "text": "Stahlhalterung verzinkt, Rohrschelle  Stk. 12"}]
    assert systems.detect(seiten, systems.HEAT_EMISSION) == []
    assert fachwerte.normalize("heat_delivery_types", "Stahlhalterung") is None


def test_konsole_erzeugt_keine_solewaermepumpe():
    """«sole» steckt in «Konsole» — dieselbe Ursache auf der Erzeugerseite."""
    assert fachwerte.normalize("generator_types", "Wandkonsole verzinkt") is None
    seiten = [{"page": 6, "text": "Wandkonsole verzinkt  Stk. 8"}]
    assert systems.detect(seiten, systems.HEAT_GENERATION) == []


def test_echte_solewaermepumpe_wird_weiterhin_erkannt():
    seiten = [{"page": 3, "text": "242.1 Waermepumpe Sole/Wasser gemaess Offerte  Stk. 1"}]
    treffer = systems.detect(seiten, systems.HEAT_GENERATION)
    assert [t["type_code"] for t in treffer] == ["ews_wp"]
    assert treffer[0]["count"] == 1
    assert treffer[0]["source_page"] == 3


def test_fussbodenheizung_wird_erkannt():
    seiten = [{"page": 9, "text": "243.3 Bodenheizung, Verteiler und Rohr"}]
    assert [t["type_code"] for t in systems.detect(seiten, systems.HEAT_EMISSION)] == ["fbh"]


def test_llm_vorschlag_ohne_quellbeleg_wird_verworfen():
    ohne = systems.from_llm(
        [{"type": "Luftheizapparat", "confidence": 0.95, "source_page": None}],
        systems.HEAT_EMISSION,
    )
    assert ohne == []
    mit = systems.from_llm(
        [{"type": "Luftheizapparat", "confidence": 0.95, "source_page": 4,
          "evidence": "243.4a Luftheizapparate Stk. 2"}],
        systems.HEAT_EMISSION,
    )
    assert [e["type_code"] for e in mit] == ["luftheizapparat"]


def test_visuelle_erzeuger_werden_gegen_die_quellseite_geprueft():
    visuell = systems.from_llm([
        {"type": "Luft/Wasser-Wärmepumpe", "source_label": "LWWP",
         "confidence": 0.95, "source_page": 26,
         "evidence": "angeblich Luft/Wasser-Wärmepumpe"},
        {"type": "Fernwärme", "source_label": "Fernwärme Bestand",
         "confidence": 0.95, "source_page": 27, "evidence": "bestehend"},
    ], systems.HEAT_GENERATION)
    pages = [
        {"page": 26, "text": "Luftheizapparate werden bauseits geliefert."},
        {"page": 27, "text": "Umbau im schützenswerten Bestand."},
    ]
    assert systems.filter_visual_generators_by_page_evidence(visuell, pages) == []


def test_echte_luftwasser_wp_besteht_die_quellpruefung():
    visuell = systems.from_llm([
        {"type": "Luft/Wasser-Wärmepumpe", "source_label": "LWWP",
         "confidence": 0.95, "source_page": 8,
         "evidence": "Luft/Wasser-Wärmepumpe"},
    ], systems.HEAT_GENERATION)
    pages = [{"page": 8, "text": "Neue Luft/Wasser-Wärmepumpe 42 kW"}]
    assert systems.generator_codes(
        systems.filter_visual_generators_by_page_evidence(visuell, pages)
    ) == ["lwwp"]


# ── 6) Rohrmeter ───────────────────────────────────────────────────────────

_ROHRZEILEN = [
    {"text": "241.11 Primaerkreis Rohrleitungen", "page": 3},
    {"text": "Stahlrohr geschweisst DN 50", "page": 3},
    {"text": "m 36", "page": 3},
    {"text": "243.1 Waermeverteilung Rohrleitungen", "page": 5},
    {"text": "Stahlrohr geschweisst DN 40", "page": 5},
    {"text": "m 252", "page": 5},
    {"text": "243.3 Bodenheizung", "page": 6},
    {"text": "Bodenheizungsrohr 17x2", "page": 6},
    {"text": "m 5000", "page": 6},
    {"text": "248.2 Isolation Rohrleitungen", "page": 8},
    {"text": "Isolation Rohrleitungen DN 40, Daemmschale", "page": 8},
    {"text": "m 252", "page": 8},
]


def test_rohrmeter_exkl_fbh_und_daemmung():
    ergebnis = quantities.pipe_lengths([dict(z) for z in _ROHRZEILEN])
    assert ergebnis["pipe_length_source_m"]["value"] == pytest.approx(36)
    assert ergebnis["pipe_length_distribution_m"]["value"] == pytest.approx(252)
    assert ergebnis["pipe_length_m"]["value"] == pytest.approx(ROHRMETER_EXKL_FBH)


def test_fbh_rohrmeter_werden_getrennt_gefuehrt():
    ergebnis = quantities.pipe_lengths([dict(z) for z in _ROHRZEILEN])
    assert ergebnis["floor_heating_pipe_m"]["value"] == pytest.approx(FBH_ROHRMETER)


def test_daemmlaenge_wird_ausgewiesen_aber_nicht_addiert():
    ergebnis = quantities.pipe_lengths([dict(z) for z in _ROHRZEILEN])
    total = ergebnis["pipe_length_m"]
    assert total["insulation_length_m"] == pytest.approx(252)
    assert total["value"] == pytest.approx(ROHRMETER_EXKL_FBH)


@pytest.mark.parametrize("text,erwartet", [
    ("Stahlrohr geschweisst DN 40", quantities.PIPE),
    ("C-Stahlrohr pressgefuegt", quantities.PIPE),
    ("Bodenheizungsrohr 17x2", quantities.UFH_PIPE),
    ("Isolation Rohrleitungen DN 40", quantities.INSULATION),
    ("Daemmschale 40 mm", quantities.INSULATION),
    ("Kabelkanal verzinkt", quantities.OTHER),
    ("Absperrklappe DN 50", quantities.OTHER),
])
def test_mengenklassifizierung(text, erwartet):
    assert quantities.classify_length_row(text) == erwartet


# ── 9) API-Grenzen ─────────────────────────────────────────────────────────

def test_railway_grenzen_sind_im_code_erzwungen():
    from app.lv_import.llm import budget

    assert budget.HARD_MAX_CALLS == 5
    assert budget.HARD_MAX_OUTPUT_TOKENS == 12000
    assert budget.HARD_MAX_COST_USD == 3.0
    assert budget.HARD_TIMEOUT_SECONDS == 300.0
