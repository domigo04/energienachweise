"""Golden-Test: eingescannte, handschriftlich ergänzte Unternehmerofferte.

Der Fall ist ein Umbau in einem schützenswerten Bestandsgebäude mit Schwerpunkt
BKP 243 Wärmeverteilung. Das Dokument ist ein Scan mit handschriftlichen Preisen
und Mengenänderungen, leeren Preisfeldern und einer Summenabweichung.

Was hier geprüft wird, ist die Kette NACH der Texterkennung: Kostenpositionen,
Quell-BKP gegen Norm-LV, Konditionen, Anlagensysteme, Handschriftkorrekturen,
Rohrmeter und die Summenprüfung. Die visuelle Auswertung wird mit einem
festen Antwortdatensatz gefüttert — so ist der Test deterministisch und läuft
ohne API-Schlüssel.

Projekt- und Firmennamen sind bewusst neutral gehalten (Arbeitsregel 10: keine
echten Projekt- oder Benutzerdaten in Tests).
"""
import pytest

from app.lv_import import commercial, norm_lv, quantities, systems
from app.lv_import.llm import visual_review

# ── Erwartete Kostenpositionen (Quellstruktur des Dokuments) ───────────────
QUELLPOSITIONEN = [
    ("243.0", "Heizflächen", 5230),
    ("243.1", "Leitungen", 3620),
    ("243.2", "Apparate und Armaturen", 4060),
    ("243.3", "Regel- und Sicherheitsorgane", 1830),
    ("243.4", "Speicher / Frischwasserstation", 21030),   # handschriftlich, unsicher
    ("243.5", "Transport und Montage", 18900),
    ("243.6", "Dämmungen", 27310),
    ("243.7", "Elektro- und Pneumatiktafeln", 0),
]
DEKLARIERTES_TOTAL = 82000
MWST_SATZ = 8.1
MWST_BETRAG = 6642
ENDSUMME = 88642


def _visual_result(betrag_243_4: float = 21030) -> dict:
    """Antwortdatensatz der visuellen Prüfung, wie ihn das Modell liefern soll."""
    return {
        "project_data": {
            "project_name": "Sporthalle Musterareal", "project_number": "2502",
            "location": "Musterstadt", "contractor": "Musterbau AG",
            "offer_date": "14.12.2025",
        },
        "features": [],
        "costs": [
            {
                "position": nr, "bkp_group": "243", "title": titel,
                "amount": betrag_243_4 if nr == "243.4" else betrag,
                "scope_summary": (
                    "Transport, Montage, Inbetriebsetzung, Druckproben, Füllwasser, "
                    "Revisionsunterlagen und integrale Tests"
                ) if nr == "243.5" else (
                    "Technischer Speicher und Frischwasserstation inkl. Anbindung"
                ) if nr == "243.4" else titel,
                "source_page": 7 if nr == "243.4" else 5,
                "confidence": 0.7 if nr == "243.4" else 0.95,
                "evidence": f"{nr} {titel}",
            }
            for nr, titel, betrag in QUELLPOSITIONEN
        ],
        "group_totals": [{
            "bkp_group": "243", "title": "Total BKP 243",
            "amount": DEKLARIERTES_TOTAL, "source_page": 9, "confidence": 0.95,
        }],
        "trade_total": DEKLARIERTES_TOTAL,
        "conditions": [
            {"label": "Rabatt", "kind": "percent", "direction": "deduction",
             "rate_percent": None, "amount": None, "basis_amount": None,
             "status": "requested_not_priced", "order": 1, "source_page": 9},
            {"label": "Skonto", "kind": "percent", "direction": "deduction",
             "rate_percent": None, "amount": None, "basis_amount": None,
             "status": "requested_not_priced", "order": 2, "source_page": 9},
            {"label": "Sponsoring pauschal", "kind": "fixed", "direction": "deduction",
             "rate_percent": None, "amount": None, "basis_amount": None,
             "status": "requested_not_priced", "order": 3, "source_page": 9},
        ],
        "heat_emission_systems": [
            {"type": "Flachröhrenradiator", "source_label": "Flachröhrenradiator",
             "count": 3, "supplied_by": "contractor", "installation_by": "contractor",
             "confidence": 0.95, "source_page": 4, "evidence": "243.0 Heizflächen"},
            {"type": "Konvektor", "source_label": "Konvektor", "count": 4,
             "supplied_by": "contractor", "installation_by": "contractor",
             "confidence": 0.93, "source_page": 4, "evidence": "243.0 Heizflächen"},
            {"type": "Luftheizapparat", "source_label": "Luftheizapparat", "count": 4,
             "supplied_by": "others", "installation_by": "contractor",
             "confidence": 0.9, "source_page": 4, "evidence": "bauseits geliefert"},
        ],
        "heat_generation_systems": [],
        "handwritten_corrections": [
            {"field": "storage_count", "printed_value": "1", "corrected_value": "2",
             "selected_source": "corrected", "struck_through": True,
             "confidence": 0.91, "source_page": 7, "evidence": "1 durchgestrichen, 2"},
            {"field": "storage_volume_each_l", "printed_value": "1500",
             "corrected_value": "800", "selected_source": "corrected",
             "struck_through": True, "confidence": 0.91, "source_page": 7,
             "evidence": "1500 durchgestrichen, 800"},
        ],
        "vat_rate": MWST_SATZ,
        "stated_subtotal_excl_vat": DEKLARIERTES_TOTAL,
        "stated_vat_amount": MWST_BETRAG,
        "stated_total_incl_vat": ENDSUMME,
        "warnings": [],
    }


# ── Kosten ─────────────────────────────────────────────────────────────────

def test_sieben_bepreiste_positionen_und_eine_ohne_betrag():
    rows, _ = visual_review.apply_result({}, _visual_result())
    positionen = [r for r in rows if not r["is_group_total"]]
    assert len(positionen) == 8
    bepreist = [r for r in positionen if r["detected_amount"] > 0]
    assert len(bepreist) == 7
    ohne_betrag = [r for r in positionen if r["detected_amount"] == 0]
    assert [r["original_position"] for r in ohne_betrag] == ["243.7"]


def test_deklariertes_total_und_summenabweichung_von_20_franken():
    """Das Dokument deklariert 82'000; die lesbaren Positionen ergeben 81'980."""
    result = _visual_result(betrag_243_4=21030)
    summe = sum(c["amount"] for c in result["costs"])
    assert summe == 81980
    assert DEKLARIERTES_TOTAL - summe == 20

    meldungen = visual_review.validate(result)
    assert any("243" in m and "stimmen nicht" in m for m in meldungen), meldungen


def test_ohne_abweichung_keine_meldung():
    """Wird 243.4 als 21'050 gelesen, geht die Summe auf."""
    result = _visual_result(betrag_243_4=21050)
    assert sum(c["amount"] for c in result["costs"]) == DEKLARIERTES_TOTAL
    assert visual_review.validate(result) == []


def test_konflikt_prueft_gezielt_nur_die_strittige_seite():
    """Der zweite Durchgang darf nicht das ganze Dokument nochmals senden."""
    result = _visual_result(betrag_243_4=21030)
    meldungen = visual_review.validate(result)
    seiten = visual_review.conflict_pages(result, meldungen)
    # Nur die Seiten der BKP-243-Positionen — nicht alle 40 Seiten.
    assert 7 in seiten
    assert len(seiten) <= 3


def test_mwst_und_endsumme():
    kette = commercial.calculate_chain(
        DEKLARIERTES_TOTAL, _visual_result()["conditions"], vat_rate=MWST_SATZ,
    )
    assert kette["subtotal_excl_vat"] == DEKLARIERTES_TOTAL
    assert kette["vat_amount"] == MWST_BETRAG
    assert kette["total_incl_vat"] == ENDSUMME


# ── Konditionen ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("label", ["Rabatt", "Skonto", "Sponsoring pauschal"])
def test_anfrage_ist_kein_abzug(label):
    kette = commercial.calculate_chain(
        DEKLARIERTES_TOTAL, _visual_result()["conditions"], vat_rate=MWST_SATZ,
    )
    eintrag = next(k for k in kette["conditions"] if k["label"] == label)
    assert eintrag["status"] == commercial.REQUESTED_NOT_PRICED
    assert eintrag["calculated_amount"] is None
    # Die Position bleibt sichtbar, verändert die Summe aber nicht.
    assert kette["subtotal_excl_vat"] == DEKLARIERTES_TOTAL


def test_leeres_rabattfeld_ohne_hinweis_bleibt_offen():
    """Auch ein ganz leeres Feld ist kein bestätigter Nullabzug."""
    kette = commercial.calculate_chain(50000, [
        {"label": "Rabatt", "kind": "percent", "direction": "deduction",
         "rate_percent": None, "amount": None},
    ], vat_rate=None)
    assert kette["conditions"][0]["status"] == commercial.REQUESTED_NOT_PRICED
    assert kette["subtotal_excl_vat"] == 50000


# ── Wärmeabgabe ────────────────────────────────────────────────────────────

def test_alle_drei_abgabesysteme_erkannt():
    _, angewendet = visual_review.apply_result({}, _visual_result())
    codes = systems.delivery_codes(angewendet["systems"])
    assert codes == ["konvektoren", "luftheizapparat", "roehrenradiator"]


def test_bauseitige_lieferung_und_eigene_montage_unterschieden():
    _, angewendet = visual_review.apply_result({}, _visual_result())
    lha = next(s for s in angewendet["systems"] if s["type_code"] == "luftheizapparat")
    assert lha["supplied_by"] == "others"
    assert lha["installation_by"] == "contractor"
    assert lha["scope_status"] == "installed_by_contractor"
    # Vom Unternehmer geliefert UND montiert bleibt davon unberührt.
    radiator = next(s for s in angewendet["systems"] if s["type_code"] == "roehrenradiator")
    assert radiator["supplied_by"] == "contractor"
    assert radiator["count"] == 3


def test_kein_preis_wird_auf_abgabesysteme_verteilt():
    """Nur die Gruppenposition ist bepreist — die Systeme tragen keinen Betrag."""
    _, angewendet = visual_review.apply_result({}, _visual_result())
    assert all("amount" not in s and "detected_amount" not in s
               for s in angewendet["systems"])


def test_flachroehrenradiator_ist_nicht_der_sammelbegriff_heizkoerper():
    from app import fachwerte
    assert fachwerte.normalize("heat_delivery_types", "Flachröhrenradiator") == "roehrenradiator"
    assert fachwerte.normalize("heat_delivery_types", "Heizkörper") == "heizkoerper"


# ── Wärmeerzeugung ─────────────────────────────────────────────────────────

def test_keine_waermeerzeugung_im_scope_erfindet_keine():
    _, angewendet = visual_review.apply_result({}, _visual_result())
    assert systems.generator_codes(angewendet["systems"]) == []


def test_waermeerzeugung_wird_erkannt_wenn_vorhanden():
    result = _visual_result()
    result["heat_generation_systems"] = [{
        "type": "Sole/Wasser-Wärmepumpe", "source_label": "Sole/Wasser-WP",
        "count": 1, "capacity_kw": 42.5, "manufacturer": "Muster",
        "model": "XY-40", "existing_or_new": "new", "supplied_by": "contractor",
        "confidence": 0.92, "source_page": 3, "evidence": "242.3",
    }]
    _, angewendet = visual_review.apply_result({}, result)
    wp = next(s for s in angewendet["systems"] if s["kind"] == systems.HEAT_GENERATION)
    assert wp["type_code"] == "ews_wp"
    assert wp["capacity_kw"] == 42.5
    assert wp["existing_or_new"] == "new"


def test_fehlende_heizleistung_bleibt_leer():
    result = _visual_result()
    result["heat_generation_systems"] = [{
        "type": "Fernwärme", "source_label": "Fernwärmeanschluss", "count": 1,
        "capacity_kw": None, "manufacturer": None, "model": None,
        "existing_or_new": "existing", "supplied_by": "others",
        "confidence": 0.8, "source_page": 3, "evidence": "bestehend",
    }]
    _, angewendet = visual_review.apply_result({}, result)
    fw = next(s for s in angewendet["systems"] if s["type_code"] == "fernwaerme")
    assert fw["capacity_kw"] is None
    assert fw["existing_or_new"] == "existing"


# ── Handschriftliche Änderungen ────────────────────────────────────────────

def test_handschrift_ersetzt_gedruckten_wert_und_haelt_beide_fest():
    features: dict = {}
    visual_review.apply_corrections(features, _visual_result())
    speicher = features["storage_count"]
    assert speicher["value"] == "2"
    assert speicher["printed_value"] == "1"
    assert speicher["selected_source"] == "corrected"
    assert speicher["requires_review"] is False

    volumen = features["storage_volume_each_l"]
    assert volumen["value"] == "800"
    assert volumen["printed_value"] == "1500"


def test_durchgestrichener_wert_gilt_nie():
    result = _visual_result()
    # Auch wenn das Modell fälschlich den gedruckten Wert wählt: er ist
    # durchgestrichen und darf nicht gelten.
    result["handwritten_corrections"][0]["selected_source"] = "printed"
    features: dict = {}
    visual_review.apply_corrections(features, result)
    assert features["storage_count"]["value"] == "2"


def test_unsichere_handschrift_erzeugt_pruefall_statt_entscheidung():
    result = _visual_result()
    result["handwritten_corrections"][0]["confidence"] = 0.4
    features: dict = {}
    offen = visual_review.apply_corrections(features, result)
    assert [e["field"] for e in offen] == ["storage_count"]
    assert features["storage_count"]["requires_review"] is True


# ── Rohrmeter ──────────────────────────────────────────────────────────────

_ROHRZEILEN = [
    {"text": "243.1 Leitungen", "page": 5},
    {"text": "Stahlrohr geschweisst DN 40", "page": 5},
    {"text": "m 42", "page": 5},
    {"text": "Stahlrohr geschweisst DN 32", "page": 5},
    {"text": "m 60", "page": 5},
    {"text": "Stahlrohr geschweisst DN 25", "page": 5},
    {"text": "m 78", "page": 5},
    {"text": "Stahlrohr geschweisst DN 20", "page": 5},
    {"text": "m 66", "page": 5},
    {"text": "Stahlrohr geschweisst DN 15", "page": 5},
    {"text": "m 60", "page": 5},
]


def test_rohrmeter_total_306():
    ergebnis = quantities.pipe_lengths([dict(z) for z in _ROHRZEILEN])
    assert ergebnis["pipe_length_m"]["value"] == pytest.approx(306)


def test_daemmpositionen_zaehlen_die_rohrmeter_nicht_doppelt():
    """Die Dämmung misst DIESELBEN Rohre nochmals in Laufmetern."""
    mit_daemmung = [dict(z) for z in _ROHRZEILEN] + [
        {"text": "243.6 Dämmungen", "page": 8},
        {"text": "Isolation Rohrleitungen DN 40, Dämmschale", "page": 8},
        {"text": "m 42", "page": 8},
        {"text": "Isolation Rohrleitungen DN 32, Dämmschale", "page": 8},
        {"text": "m 60", "page": 8},
    ]
    ergebnis = quantities.pipe_lengths(mit_daemmung)
    assert ergebnis["pipe_length_m"]["value"] == pytest.approx(306)


def test_fbh_rohre_bleiben_ausserhalb_der_verteilrohrmeter():
    mit_fbh = [dict(z) for z in _ROHRZEILEN] + [
        {"text": "Bodenheizungsrohr 17x2", "page": 6},
        {"text": "m 900", "page": 6},
    ]
    assert quantities.pipe_lengths(mit_fbh)["pipe_length_m"]["value"] == pytest.approx(306)


# ── Norm-LV ────────────────────────────────────────────────────────────────

def test_quellnummer_darf_von_zielnummer_abweichen():
    """«243.5 Transport und Montage» ist im Norm-LV die Montageposition 243.9."""
    treffer = norm_lv.match_title("Transport, Montage", "243")
    assert treffer["canonical_key"] == "243.9"
    assert treffer["canonical_key"] != "243.5"


def test_sammelposition_deckt_mehrere_normpositionen_ohne_betragsteilung():
    rows, _ = visual_review.apply_result({}, _visual_result())
    speicher = next(r for r in rows if r["original_position"] == "243.4")
    assert speicher["amount_allocation"] in (norm_lv.NOT_SPLIT, norm_lv.SINGLE)
    # Der Betrag zählt genau einmal, egal wie viele Themen enthalten sind.
    assert speicher["detected_amount"] == 21030
    assert "detected_amount_split" not in speicher


def test_quellhierarchie_wird_getrennt_gespeichert():
    rows, _ = visual_review.apply_result({}, _visual_result())
    montage = next(r for r in rows if r["original_position"] == "243.5")
    assert montage["source_parent_bkp"] == "243"
    assert "Inbetriebsetzung" in montage["source_scope_summary"]
    assert montage["original_title"] == "Transport und Montage"


def test_kein_erfundener_normschluessel():
    from app.lv_import.llm import resolver

    class Erfinder:
        def resolve(self, positions, allowed):
            return [{"source_id": p["source_id"], "canonical_key": "999.99",
                     "included_norm_lv_keys": ["888.88"], "confidence": 0.99,
                     "reason": "erfunden"} for p in positions]

    ergebnis = resolver.resolve(
        [{"source_id": "243.4", "title": "Speicher / Frischwasserstation", "group": "243"}],
        provider=Erfinder(),
    )
    assert ergebnis["243.4"]["canonical_key"] is None
    assert ergebnis["243.4"]["requires_review"] is True


def test_enthaltene_schluessel_muessen_aus_der_liste_stammen():
    from app.lv_import.llm import resolver

    echte = norm_lv.candidates("Speicher", "243")
    primaer, zweiter = echte[0]["key"], echte[1]["key"]

    class Provider:
        def resolve(self, positions, allowed):
            return [{"source_id": positions[0]["source_id"], "canonical_key": primaer,
                     "included_norm_lv_keys": [zweiter, "999.99"],
                     "confidence": 0.95, "reason": "Sammelposition"}]

    ergebnis = resolver.resolve(
        [{"source_id": "243.4", "title": "Speicher / Frischwasserstation", "group": "243"}],
        provider=Provider(),
    )
    treffer = ergebnis["243.4"]
    assert treffer["canonical_key"] == primaer
    assert "999.99" not in (treffer["included_norm_keys"] or "")
    assert treffer["amount_allocation"] == norm_lv.NOT_SPLIT


# ── Fehlerverhalten ────────────────────────────────────────────────────────

def test_llm_timeout_verliert_das_parserresultat_nicht():
    from app.lv_import.llm import resolver

    class Timeout:
        def resolve(self, positions, allowed):
            raise TimeoutError("Zeitüberschreitung")

    rows = [{"bkp_nr": "243", "original_position": "243.4",
             "original_title": "Speicher / Frischwasserstation",
             "detected_amount": 21030}]
    with pytest.raises(TimeoutError):
        resolver.apply_to_rows(rows, provider=Timeout())
    # Die Zeile selbst bleibt unversehrt — der Parserwert geht nicht verloren.
    assert rows[0]["detected_amount"] == 21030


def test_visuelle_pruefung_ohne_schluessel_bleibt_folgenlos():
    ergebnis = visual_review.review(b"%PDF-1.4", page_numbers=[1])
    assert ergebnis["called"] is False
    assert ergebnis["result"] == {}


def test_keine_erfundenen_preise_bei_leerer_antwort():
    rows, angewendet = visual_review.apply_result({}, {})
    assert rows == []
    assert angewendet["systems"] == []
    assert angewendet["handwritten_open"] == []


# ── Datenbank: das Ergebnis muss vollständig gespeichert werden ────────────

def _frische_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database import Base
    # Die Fremdschlüssel von lv_imports zeigen auf hc_projects — das Modell muss
    # geladen sein, bevor create_all die Tabellen anlegt.
    from app.models import heizungscockpit  # noqa: F401
    from app.models import lv_import  # noqa: F401

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_importergebnis_wird_vollstaendig_gespeichert_und_ausgegeben():
    """Kosten, Konditionen, Systeme und Handschrift überstehen den Roundtrip."""
    from app.models.lv_import import (
        LvImport, LvImportCost, LvImportCondition, LvImportFeature, LvImportSystem,
    )
    from app.routers.hc_lv_import import _cost_out, _condition_out, _feature_out, _system_out

    db = _frische_db()
    imp = LvImport(filename="offerte.pdf", file_hash="x", page_count=40,
                   projekt_nummer="2502", gebaeudetyp="sporthalle",
                   projektart="sanierung")
    db.add(imp)
    db.commit()

    result = _visual_result()
    features: dict = {}
    rows, angewendet = visual_review.apply_result(features, result)
    visual_review.apply_corrections(features, result)

    for row in rows:
        db.add(LvImportCost(
            lv_import_id=imp.id, bkp_nr=row["bkp_nr"],
            original_position=row.get("original_position"),
            original_title=row.get("original_title"),
            source_parent_bkp=row.get("source_parent_bkp"),
            source_scope_summary=row.get("source_scope_summary"),
            included_norm_keys=row.get("included_norm_keys"),
            amount_allocation=row.get("amount_allocation"),
            requires_review=bool(row.get("requires_review", False)),
            canonical_key=row.get("canonical_key"),
            detected_amount=row.get("detected_amount"),
            is_group_total=bool(row.get("is_group_total", False)),
        ))
    for eintrag in angewendet["systems"]:
        db.add(LvImportSystem(lv_import_id=imp.id, **eintrag))
    for key, f in features.items():
        db.add(LvImportFeature(
            lv_import_id=imp.id, key=key, value=str(f.get("value")),
            printed_value=f.get("printed_value"), corrected_value=f.get("corrected_value"),
            selected_source=f.get("selected_source"),
            requires_review=bool(f.get("requires_review", False)),
        ))
    for k in commercial.calculate_chain(
        DEKLARIERTES_TOTAL, result["conditions"], MWST_SATZ,
    )["conditions"]:
        db.add(LvImportCondition(
            lv_import_id=imp.id, original_label=k["label"], kind=k["kind"],
            direction=k["direction"], rate_percent=k.get("rate_percent"),
            amount=k.get("amount"), calculated_amount=k.get("calculated_amount"),
            status=k.get("status", "priced"), order_index=k.get("order", 0),
        ))
    db.commit()
    db.refresh(imp)

    kosten = [_cost_out(c) for c in imp.costs if not c.is_group_total]
    assert len(kosten) == 8
    montage = next(c for c in kosten if c["original_position"] == "243.5")
    assert montage["source_parent_bkp"] == "243"
    assert montage["canonical_key"] == "243.9"          # Quellnummer ≠ Zielnummer
    assert "Inbetriebsetzung" in montage["source_scope_summary"]

    systeme = [_system_out(s) for s in imp.systems]
    assert {s["type_code"] for s in systeme} == {
        "roehrenradiator", "konvektoren", "luftheizapparat",
    }
    lha = next(s for s in systeme if s["type_code"] == "luftheizapparat")
    assert lha["label"] == "Luftheizapparate"
    assert lha["installation_by"] == "contractor"

    merkmale = {f["key"]: f for f in (_feature_out(f) for f in imp.features)}
    assert merkmale["storage_count"]["printed_value"] == "1"
    assert merkmale["storage_count"]["corrected_value"] == "2"
    assert merkmale["storage_count"]["selected_source"] == "corrected"

    konditionen = [_condition_out(c) for c in imp.conditions]
    assert all(k["status"] == "requested_not_priced" for k in konditionen)
    assert all(k["calculated_amount"] is None for k in konditionen)
    db.close()


def test_bkp_totale_und_technische_summe():
    """Gruppentotal, technische Summe exkl. MWST und Endsumme inkl. MWST."""
    rows, _ = visual_review.apply_result({}, _visual_result(betrag_243_4=21050))
    gruppentotal = next(r for r in rows if r["is_group_total"])
    assert gruppentotal["bkp_nr"] == "243"
    assert gruppentotal["detected_amount"] == DEKLARIERTES_TOTAL

    positionen = sum(r["detected_amount"] for r in rows if not r["is_group_total"])
    assert positionen == DEKLARIERTES_TOTAL

    kette = commercial.calculate_chain(positionen, [], vat_rate=MWST_SATZ)
    assert kette["subtotal_excl_vat"] == DEKLARIERTES_TOTAL
    assert kette["total_incl_vat"] == ENDSUMME
