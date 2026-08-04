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
    assert result["sondeninhalt_l"] == pytest.approx(1869.1)
    assert result["glykolbedarf_kg"] == pytest.approx(596.6)
    assert len(result["rechenweg"]) == 3
    assert all(schritt.get("formel_latex") for schritt in result["rechenweg"])
    assert r"\frac{Q_0 \cdot 1000}{q_E}" in result["rechenweg"][0]["formel_latex"]


def test_schema_nutzt_automatische_wp_quellenleistung_fuer_erdsonden():
    nodes = [
        {"id": "wp", "type": "erzeuger", "data": {
            "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
            "vl_temp": 35, "rl_temp": 30, "sole_vl": 3, "sole_rl": 0,
        }},
        {"id": "ews", "type": "erdsonden", "data": {
            "sonden_anzahl": 4, "sonden_laenge_m": 190,
            "entzugsleistung_w_m": 45,
        }},
    ]

    result = berechne_schema(nodes, [])
    ews = result["erdsonden_results"]["ews"]

    assert ews["quellenleistung_kw"] == pytest.approx(30)
    assert ews["leistungsquelle"] == "Wärmepumpe"
    assert ews["erforderlich_gesamt_m"] == pytest.approx(733.3, abs=0.1)
    assert ews["ausreichend"] is True
    assert [s["groesse"] for s in ews["rechenweg"][:2]] == ["P_el", "Q0"]
    assert ews["rechenweg"][0]["formel_latex"] == (
        r"P_{\mathrm{el}} = \frac{Q_{\mathrm{Heizung}}}{COP}"
    )


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
        }},
    }

    abschnitte = {a["titel"]: a for a in berechnungs_abschnitte(nodes, results)}

    assert ("Auslegungsvorschlag", 727, "l") in abschnitte["Speicher"]["resultate"]
    assert ("Erforderliche Gesamtbohrmeter", 733.3, "m") in abschnitte["Erdsondenfeld"]["resultate"]
    assert any(zeile[0] == "Bohrmeter-Formel" for zeile in abschnitte["Erdsondenfeld"]["resultate"])
