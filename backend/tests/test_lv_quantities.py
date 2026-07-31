"""Technische Mengen robust erkennen (Punkt 5, 9, 10, 11, 27).

Fixtures sind sanitisierte Strukturmuster eines echten Unternehmerangebots
(Punkt 26) — keine echten Namen, Adressen oder Offertdaten.
"""
from pathlib import Path

from app.lv_import import quantities as q
from app.lv_import.feature_extract import extract_features
from app.lv_import.synonyms import (
    TECHNICAL_BUFFER, BWW_STORAGE, COMBINED_STORAGE,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _fixture_pages(name: str) -> list[dict]:
    """Fixture-Datei → eine Textseite (Kommentarzeilen entfernt)."""
    raw = (FIXTURES / name).read_text(encoding="utf-8")
    text = "\n".join(z for z in raw.splitlines() if not z.startswith("#"))
    return [{"page": 22, "text": text}]


def _rows(text: str, page: int = 17):
    return q.build_rows([{"page": page, "text": text}])


# ── Punkt 5 — Erdsonden über alle Muster ───────────────────────────────────

def test_erdsonden_muster_a_inline():
    """„5 Erdsonden à 180 m" → 5 / 180 / 900."""
    res = q.boreholes(_rows("241.14 Erdsonden\n5 Erdsonden à 180 m"))
    assert res["borehole_count"]["value"] == 5
    assert res["borehole_length_each_m"]["value"] == 180
    assert res["borehole_total_m"]["value"] == 900


def test_erdsonden_muster_b_tabellarisch_aus_fixture():
    """Punkt 27 — 6 Sonden × 150 m → 900 Bohrmeter, aus echter Tabellenstruktur."""
    rows = q.build_rows(_fixture_pages("lv_erdsonden_table_sanitized.txt"))
    res = q.boreholes(rows)
    assert res["borehole_count"]["value"] == 6
    assert res["borehole_length_each_m"]["value"] == 150
    assert res["borehole_total_m"]["value"] == 900


def test_erdsonden_muster_c_label_doppelpunkt():
    text = "Anzahl Sonden: 5\nSondenlänge: 180 m"
    res = q.boreholes(_rows(text))
    assert res["borehole_count"]["value"] == 5
    assert res["borehole_length_each_m"]["value"] == 180
    assert res["borehole_total_m"]["value"] == 900


def test_bohrmeter_tragen_den_rechenweg():
    """Punkt 5 — abgeleiteter Wert muss erklärt sein („berechnet aus 6 × 150 m")."""
    rows = q.build_rows(_fixture_pages("lv_erdsonden_table_sanitized.txt"))
    total = q.boreholes(rows)["borehole_total_m"]
    assert total["derived_from"] == "6 × 150 m"
    assert "berechnet aus 6 × 150 m" in total["source_text"]


def test_bohrdurchmesser_wird_nicht_als_sondenanzahl_gelesen():
    """Punkt 5 — nur Zahlen mit direktem semantischem Bezug zählen.
    „Bohrdurchmesser mm 152" darf weder Anzahl noch Länge werden."""
    rows = q.build_rows(_fixture_pages("lv_erdsonden_table_sanitized.txt"))
    res = q.boreholes(rows)
    assert res["borehole_count"]["value"] == 6        # nicht 152
    assert res["borehole_length_each_m"]["value"] == 150


def test_erdsonden_ohne_laenge_kein_geratener_bohrmeter():
    res = q.boreholes(_rows("2 Erdsonden für Sole"))
    assert res["borehole_count"]["value"] == 2
    assert "borehole_total_m" not in res              # nichts erfunden


# ── Punkt 10 — Bauteilmengen nur mit Stück-Einheit ─────────────────────────

def test_pumpe_mit_stk_einheit_wird_gezaehlt():
    res = q.component_counts(_rows("Umwälzpumpe Heizkreis\nStk. 2"))
    assert res["pump"]["value"] == 2


def test_pumpenleistung_wird_nicht_zur_stueckzahl():
    """Punkt 10 — „Pumpe / Leistung 570 W" darf NIE 570 Pumpen ergeben."""
    res = q.component_counts(_rows("Umwälzpumpe\nLeistung 570 W"))
    assert res["pump"]["value"] is None
    assert res["pump"]["confidence"] == "low"


def test_ventile_stad_und_waermezaehler():
    text = ("2-Weg-Ventil DN20 Stk. 6\n"
            "3-Weg-Mischventil DN25 Stk. 2\n"
            "Strangregulierventil STAD DN15 Stk. 8\n"
            "Wärmezähler qp 2.5 Stk. 13")
    res = q.component_counts(_rows(text))
    assert res["valve_2way"]["value"] == 6
    assert res["valve_3way"]["value"] == 2
    assert res["balancing_valve"]["value"] == 8
    assert res["heat_meter"]["value"] == 13


def test_heizkoerper_werden_gezaehlt():
    res = q.component_counts(_rows("Flachheizkörper Typ 22 Stk. 14"))
    assert res["radiator"]["value"] == 14


def test_fussbodenheizungsverteiler_werden_gezaehlt():
    res = q.component_counts(_rows("Bodenheizungsverteiler Edelstahl\nStk. 3"))
    assert res["floor_heating_manifold"]["value"] == 3
    assert res["floor_heating_manifold"]["confidence"] == "high"


def test_umschaltkugelhahn_zaehlt_als_3weg():
    res = q.component_counts(_rows("Umschaltkugelhahn DN32 Stk. 1"))
    assert res["valve_3way"]["value"] == 1


# ── Punkt 11 — Rohrmeter ───────────────────────────────────────────────────

def test_rohrmeter_243_1_ergibt_genau_252():
    """Punkt 27 — 12+18+42+78+60+42 = 252 m für BKP 243.1."""
    rows = q.build_rows(_fixture_pages("lv_pipe_table_sanitized.txt"))
    assert q.pipe_length_for_section(rows, "243.1") == 252


def test_flaechenheizung_landet_nicht_in_verteilrohrmetern():
    """Punkt 11/27 — Bodenheizungsrohre & Heizkreisschlaufen sind ausgeschlossen."""
    rows = q.build_rows(_fixture_pages("lv_pipe_table_sanitized.txt"))
    res = q.pipe_lengths(rows)
    assert res["pipe_length_m"]["value"] == 252            # nicht 252+1450+820+300
    assert q.pipe_length_for_section(rows, "243.2") == 0


def test_rohrmeter_quelle_und_verteilung_getrennt():
    """Punkt 11 — Primärkreis zählt als Quelle, Verteilung separat, Summe total."""
    text = ("241.11 Rohrleitungen Primärkreis\n"
            "Geschweisste Gasrohre DN 32 m 40\n"
            "243.1 Rohrleitungen\n"
            "Stahlrohre DN 25 m 60\n")
    res = q.pipe_lengths(_rows(text))
    assert res["pipe_length_source_m"]["value"] == 40
    assert res["pipe_length_distribution_m"]["value"] == 60
    assert res["pipe_length_m"]["value"] == 100
    assert "Quelle 40 m" in res["pipe_length_m"]["source_text"]


def test_bkp_241_11_detailpositionen_zaehlen_auch_ohne_rohr_im_titel():
    """Fabrikats-/Detailtitel unter 241.11 bleiben Primärkreis-Rohrmeter."""
    text = ("241.11 Rohrleitungen Primärkreis WP zu Erdsondensammler\n"
            "241.110 Geberit COOL-FIT Versorgung Vorlauf\n"
            "m 32\n"
            "241.111 Geberit COOL-FIT Versorgung Rücklauf\n"
            "m 28\n"
            "243.2 Flächenheizung\n"
            "Bodenheizungsrohre m 900")
    res = q.pipe_lengths(_rows(text))
    assert res["pipe_length_source_m"]["value"] == 60
    assert res["pipe_length_m"]["value"] == 60
    assert res["pipe_length_m"]["per_section"] == {"241.110": 32, "241.111": 28}


def test_hagmann_rohrmeter_ignorieren_standardlaengen_und_metrische_gewinde():
    """Regression: 241.11 = 36 m, 243.1 = 252 m, zusammen genau 288 m."""
    text = (
        "241.11 Rohrleitungen Primärkreis WP zu Erdsondensammler\n"
        "Geschweisste Gasrohre, Herstellungslängen von 6 m\n"
        "Schichtdicke 80 μm\n"
        "3/4 Zoll DN 20 m 12\n"
        "Geschweisste Siederohre\n"
        "76.1 x 2.6 mm DN 65 m 24\n"
        "Rohrschellen Gewinde M 10 Stk. 12\n"
        "241.12 Apparate / Armaturen Primärkreis\n"
        "Schilderhalter 120 mm Stk. 6\n"
        "241.11 Total Apparate / Armaturen Primärkreis\n"
        "Befestigung M 8 Stk. 6\n"
        "243.1 Rohrleitungen\n"
        "Gasrohre in Herstellungslängen von 6 m\n"
        "DN 15 m 12\nDN 20 m 18\nDN 25 m 42\n"
        "DN 32 m 78\nDN 40 m 60\nDN 50 m 42"
    )
    res = q.pipe_lengths(_rows(text))
    assert res["pipe_length_source_m"]["value"] == 36
    assert res["pipe_length_distribution_m"]["value"] == 252
    assert res["pipe_length_m"]["value"] == 288


def test_materialcodes_ueberschreiben_bkp_abschnitt_nicht():
    """211.xxx sind Katalogcodes innerhalb 241/243, keine neuen Abschnitte."""
    text = (
        "241.1 Rohrleitungen Primär\n"
        "211.313 Debrunner Stahlrohr DN20 12.00 m 26.90 322.80\n"
        "211.314 Debrunner Stahlrohr DN25 24.00 m 40.00 960.00\n"
        "243.1 Rohrleitungen Verteilung\n"
        "211.315 Debrunner Stahlrohr DN15 252.00 m 20.00 5'040.00\n"
        "243.2 Flächenheizung\n"
        "213.100 Verbundrohr 16 mm 5000.00 m 1.75 8'750.00"
    )
    res = q.pipe_lengths(_rows(text))
    assert res["pipe_length_source_m"]["value"] == 36
    assert res["pipe_length_distribution_m"]["value"] == 252
    assert res["pipe_length_m"]["value"] == 288


def test_daemmschichtdicke_in_folgezeile_ist_keine_rohrmenge():
    text = (
        "241.11 Rohrleitungen Primärkreis\n"
        "Inkl. Grundplatte, Nippel, Dübel und Schrauben.\n"
        "Dämmschichtdicke: M = 19 - 26 mm\n"
        "Geschweisste Gasrohre DN20 m 12"
    )
    res = q.pipe_lengths(_rows(text))
    assert res["pipe_length_source_m"]["value"] == 12


def test_waermemessung_pauschale_belegt_vorhanden_aber_keine_anzahl():
    features = extract_features([{
        "page": 23,
        "text": "243.4 Wärmemessung\nNeo Vac Offerte Wärmemessung pauschal 1 St",
    }])
    assert features["heat_metering_present"]["value"] is True
    assert features.get("heat_meter_count", {}).get("value") is None


def test_quadratmeter_sind_keine_rohrmeter():
    """m² darf nicht als Laufmeter gelesen werden."""
    res = q.pipe_lengths(_rows("243.2 Flächenheizung\nBodenheizung Fläche m2 450"))
    assert "pipe_length_m" not in res


# ── Punkt 9 — Speicher klassifizieren ──────────────────────────────────────

def test_speicher_klassifikation():
    assert q.classify_storage("Pufferspeicher 1000 l") == TECHNICAL_BUFFER
    assert q.classify_storage("Technischer Speicher EnerVal") == TECHNICAL_BUFFER
    assert q.classify_storage("Wassererwärmer 500 l") == BWW_STORAGE
    assert q.classify_storage("BWW-Speicher 300 l") == BWW_STORAGE
    assert q.classify_storage("Kombispeicher 800 l") == COMBINED_STORAGE


def test_bww_speicher_ist_kein_heizungs_kostentreiber():
    """Punkt 9 — ein Wassererwärmer darf nicht als Pufferspeicher zählen."""
    text = "Pufferspeicher 1000 Liter Stk. 1\nWassererwärmer 500 Liter Stk. 1"
    res = q.storages(_rows(text))
    assert res["buffer_count"]["value"] == 1              # nur der Puffer
    assert res["storage_volume_l"]["value"] == 1000       # nicht 1500


def test_kombispeicher_wird_zur_pruefung_markiert():
    res = q.storages(_rows("Kombispeicher 800 Liter Stk. 1"))
    assert res["buffer_count"]["confidence"] == "medium"


# ── Punkt 12 — kompakte Fundstellen ────────────────────────────────────────

def test_fundstelle_bleibt_kompakt():
    """Punkt 12 — kein ganzer Seitenblock, sondern wenige relevante Zeilen."""
    lange_seite = "\n".join([f"Zeile {i} Blindtext ohne Bezug" for i in range(60)]
                            + ["Umwälzpumpe Heizkreis Stk. 2"]
                            + [f"Nachzeile {i}" for i in range(60)])
    res = q.component_counts(_rows(lange_seite))
    fund = res["pump"]
    assert len(fund["source_text"]) <= 200
    assert len(fund["source_excerpt"]) <= 400
    assert fund["source_excerpt"].count("\n") <= 4       # maximal 5 Zeilen


# ── Punkt 28 — keine Verschlechterung bestehender Imports ──────────────────

def test_bestehende_einfache_lvs_funktionieren_weiter():
    """Alte Formate ohne Einheitenspalte müssen weiter erkannt werden
    (Fallback auf die bisherige Heuristik)."""
    f = extract_features([{"page": 1, "text": "Pos. 241.123\nHocheffizienz-Umwälzpumpe\nMenge 3 Stk."}])
    assert f["pump_count"]["value"] == 3
    f2 = extract_features([{"page": 1, "text": "Pufferspeicher 1'500 Liter"}])
    assert f2["storage_volume_l"]["value"] == 1500
    f3 = extract_features([{"page": 1, "text": "4 Erdsonden à 180 m"}])
    assert f3["borehole_total_m"]["value"] == 720


def test_extract_features_nutzt_wortkoordinaten_wenn_vorhanden():
    """Punkt 3/10 — mit Koordinaten entscheidet die Einheitenspalte."""
    def w(text, x0, top):
        return {"text": text, "x0": x0, "x1": x0 + len(text) * 5.0,
                "top": top, "bottom": top + 9}
    word_pages = [{"page": 5, "words": [
        w("Umwälzpumpe Heizkreis", 60, 100), w("Stk.", 300, 100), w("2", 340, 100),
        w("Leistung", 60, 120), w("570", 300, 120), w("W", 340, 120),
    ]}]
    pages = [{"page": 5, "text": "Umwälzpumpe Heizkreis Stk. 2\nLeistung 570 W"}]
    f = extract_features(pages, word_pages)
    assert f["pump_count"]["value"] == 2


# ── Erzeugerleistung im Positionskontext ───────────────────────────────────

def test_erzeugerleistung_einige_zeilen_unter_der_position():
    """Punkt 31 — die Leistung steht oft erst nach Fabrikat/Typ."""
    text = ("242.1 Waermeerzeuger Sole/Wasser-Waermepumpe\n"
            "Fabrikat Muster\nTyp XY-35\nLeistung 35.3 kW")
    res = q.generator_power(_rows(text))
    assert res["generator_power_kw"]["value"] == 35.3


def test_kwh_ist_keine_leistung():
    """kWh (Arbeit) darf nie als Leistung gelesen werden."""
    res = q.generator_power(_rows("Waermepumpe\nJahresertrag 12000 kWh"))
    assert res == {}


def test_leistung_endet_an_der_naechsten_position():
    """Die Leistung eines anderen Geräts wird nicht übernommen."""
    text = ("242.1 Waermeerzeuger Sole/Wasser\n"
            "243.3 Apparate\nUmwaelzpumpe Stk. 1\nLeistung 570 W\n")
    res = q.generator_power(_rows(text))
    assert res == {}
