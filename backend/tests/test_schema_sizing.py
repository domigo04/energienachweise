import pytest

from app.calculations.hydraulik import berechne_schema
from app.calculations.schema_sizing import erdsondenfeld, technischer_speicher
from app.export.pdf import berechnungs_abschnitte


def test_technischer_speicher_entspricht_excel_referenzfall():
    result = technischer_speicher(29.88, 33, 25, ueberdeckung_k=2, ueberbrueckung_min=15)

    assert result["speichervolumen_l"] == 650
    assert result["speicher_oben_c"] == 35
    assert result["speicher_unten_c"] == 25
    assert result["ueberbrueckung_min"] == 15
    assert result["rechenweg"]


def test_erdsondenfeld_rechnet_duplexvolumen_und_bohrmeter():
    result = erdsondenfeld(
        quellenleistung_kw=36,
        sonden_anzahl=4,
        sonden_laenge_m=220,
        spezifische_entzugsleistung_w_m=45,
        sicherheitsfaktor=1.10,
        sonden_aussendurchmesser_mm=32,
        glykol_konzentration_pct=28,
    )

    assert result["erforderlich_gesamt_m"] == pytest.approx(880)
    assert result["erforderlich_pro_sonde_m"] == pytest.approx(220)
    assert result["ist_gesamt_m"] == pytest.approx(880)
    assert result["ausreichend"] is True
    assert result["sondeninhalt_l"] == pytest.approx(1897.7)
    assert result["glykolbedarf_kg"] == pytest.approx(605.8)
    assert {s["groesse"] for s in result["rechenweg"]} >= {
        "Lerf", "Vsonde", "Vgesamt", "mGlykol"
    }


def test_erdsonden_pumpenauslegung_zeigt_kritischen_weg_und_zwischenwerte():
    result = erdsondenfeld(
        quellenleistung_kw=36,
        sonden_anzahl=4,
        sonden_laenge_m=220,
        spezifische_entzugsleistung_w_m=45,
        sicherheitsfaktor=1.10,
        sonden_aussendurchmesser_mm=32,
        glykol_konzentration_pct=28,
        sole_volumenstrom_m3h=6.2,
        sonden_innendurchmesser_mm=26.2,
        anschlussleitung_kritisch_m=30,
        anschlussleitung_gesamt_vl_rl_m=60,
        anschluss_innendurchmesser_mm=40.6,
        hauptleitung_m=12,
        hauptleitung_innendurchmesser_mm=40.6,
        sole_dichte_kg_m3=1050,
        sole_viskositaet_mm2_s=4.15,
        rohrrauheit_mm=0.015,
        wp_druckverlust_mws=1.3,
        verteiler_zeta=12,
        zusaetzlicher_inhalt_l=5,
    )

    assert result["gesamtinhalt_l"] == pytest.approx(2011.5)
    assert result["foerderhoehe_gesamt_mws"] == pytest.approx(9.153)
    assert result["foerderhoehe_gesamt_kpa"] == pytest.approx(94.28)
    assert [a["name"] for a in result["druckverlust_abschnitte"]] == [
        "Erdsonde", "Anschlussleitung", "Hauptleitung"
    ]
    assert result["druckverlust_abschnitte"][0]["reynolds"] == pytest.approx(2521)
    assert result["druckverlust_abschnitte"][1]["stroemungsart"] == "laminar"
    schritte = {s["groesse"]: s for s in result["rechenweg"]}
    assert schritte["V̇ je U-Kreis"]["eingesetzt"] == "0.00172222 / 4 / 2"
    assert "ρ · g" in schritte["H Rohre"]["formel"]
    assert "Hrohre + Hverteiler + HWP" in schritte["H Pumpe"]["formel"]


def test_schema_nutzt_automatische_wp_quellenleistung_fuer_erdsonden():
    nodes = [
        {"id": "wp", "type": "erzeuger", "data": {
            "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
            "vl_temp": 35, "rl_temp": 30, "sole_vl": 3, "sole_rl": 0,
        }},
        {"id": "ews", "type": "erdsonden", "data": {
            "sonden_anzahl": 4, "sonden_laenge_m": 190,
            "entzugsleistung_w_m": 45, "anschlussleitung_kritisch_m": 30,
        }},
    ]

    result = berechne_schema(nodes, [])
    ews = result["erdsonden_results"]["ews"]

    assert ews["quellenleistung_kw"] == pytest.approx(30)
    assert ews["leistungsquelle"] == "Wärmepumpe"
    assert ews["erforderlich_gesamt_m"] == pytest.approx(733.3, abs=0.1)
    assert ews["ausreichend"] is True
    assert ews["sole_volumenstrom_m3h"] is not None
    assert ews["volumenstromquelle"] == "Wärmepumpe"
    assert ews["foerderhoehe_gesamt_mws"] is not None


def test_ews_expansion_uebernimmt_automatisch_den_soleinhalt():
    nodes = [
        {"id": "wp", "type": "erzeuger", "data": {
            "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
            "vl_temp": 35, "rl_temp": 30, "sole_vl": 3, "sole_rl": 0,
        }},
        {"id": "ews", "type": "erdsonden", "data": {
            "sonden_anzahl": 4, "sonden_laenge_m": 190,
            "entzugsleistung_w_m": 45,
        }},
        {"id": "exp", "type": "expansion", "data": {
            "medium": "ews", "hoehe_m": 10, "psv_bar": 3,
        }},
    ]

    result = berechne_schema(nodes, [])

    assert result["expansion_results"]["exp"]["vsys_l"] == pytest.approx(
        result["erdsonden_results"]["ews"]["gesamtinhalt_l"]
    )
    assert result["expansion_results"]["exp"]["vsys_quelle"] == "Erdsondenfeld"


def test_schema_leitet_speicherleistung_und_temperaturen_aus_gruppen_ab():
    nodes = [
        {"id": "sp", "type": "speicher", "data": {}},
        {"id": "g1", "type": "gruppe", "data": {"q_kw": 10, "vl_temp": 35, "rl_temp": 28}},
        {"id": "g2", "type": "gruppe", "data": {"q_kw": 20, "vl_temp": 45, "rl_temp": 35}},
    ]

    result = berechne_schema(nodes, [])
    speicher = result["speicher_results"]["sp"]

    assert speicher["leistung_kw"] == 30
    assert speicher["leistungsquelle"] == "Verbrauchergruppen"
    assert speicher["speicher_oben_c"] == 47
    assert speicher["speicher_unten_c"] == 28
    assert speicher["speichervolumen_l"] > 0


def test_pdf_uebernimmt_speicher_und_erdsonden_rechenwerte():
    nodes = [
        {"id": "sp", "type": "speicher", "data": {"speicher_liter": 800}},
        {"id": "ews", "type": "erdsonden", "data": {
            "sonden_anzahl": 4, "sonden_laenge_m": 190, "entzugsleistung_w_m": 45,
        }},
    ]
    results = {
        "speicher_results": {"sp": {
            "leistung_kw": 30, "leistungsquelle": "Erzeuger", "vorlauf_max_c": 35,
            "ueberdeckung_k": 2, "speicher_oben_c": 37, "speicher_unten_c": 28,
            "ueberbrueckung_min": 15, "speichervolumen_l": 727,
        }},
        "erdsonden_results": {"ews": {
            "quellenleistung_kw": 30, "leistungsquelle": "Wärmepumpe",
            "sicherheitsfaktor": 1.1, "sonden_aussendurchmesser_mm": 32,
            "glykol_konzentration_pct": 30, "ist_gesamt_m": 760,
            "erforderlich_gesamt_m": 733.3, "erforderlich_pro_sonde_m": 183.3,
            "sondeninhalt_l": 1614.2, "gesamtinhalt_l": 1614.2, "glykolbedarf_kg": 552.1,
            "sole_volumenstrom_m3h": 6.2, "volumenstromquelle": "Wärmepumpe",
            "foerderhoehe_gesamt_mws": 9.15, "foerderhoehe_gesamt_kpa": 94.2,
            "rechenweg": [{"groesse": "H Pumpe", "formel": "Hpumpe = Hrohre + Hverteiler + HWP",
                            "eingesetzt": "7.75 + 0.10 + 1.30", "ergebnis": "9.15 mWS"}],
        }},
    }

    abschnitte = {a["titel"]: a for a in berechnungs_abschnitte(nodes, results)}

    assert ("Auslegungsvorschlag", 727, "l") in abschnitte["Speicher"]["resultate"]
    assert ("Erforderliche Gesamtbohrmeter", 733.3, "m") in abschnitte["Erdsondenfeld"]["resultate"]
    assert any(zeile[0] == "Bohrmeter-Formel" for zeile in abschnitte["Erdsondenfeld"]["resultate"])
    assert any(zeile[0].startswith("H Pumpe:") for zeile in abschnitte["Erdsondenfeld"]["resultate"])
