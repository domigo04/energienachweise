"""Seitenklassifikation + räumliche Extraktion (Punkt 1, 3, 4, 27, 29).

Die Fixtures sind sanitisierte Strukturmuster eines echten Unternehmerangebots
(Punkt 26) — keine echten Namen, Adressen oder Offertdaten.
"""
from pathlib import Path

from app.lv_import import page_classifier as pc
from app.lv_import.spatial import (
    group_words_to_rows, parse_table_row, find_value_right_of_label, words_to_pages,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _fixture_seiten(name: str) -> list[tuple[str, str]]:
    """Fixture → [(erwartete_klasse, seitentext), ...]."""
    raw = (FIXTURES / name).read_text(encoding="utf-8")
    bloecke, klasse, puffer = [], None, []
    for zeile in raw.splitlines():
        if zeile.startswith("=== ") and zeile.rstrip().endswith(" ==="):
            if klasse:
                bloecke.append((klasse, "\n".join(puffer)))
            klasse, puffer = zeile.strip().strip("= ").strip(), []
        elif klasse is not None:
            puffer.append(zeile)
        # Kommentarkopf vor dem ersten Block wird ignoriert.
    if klasse:
        bloecke.append((klasse, "\n".join(puffer)))
    return bloecke


# ── Punkt 1/27 — jede Seite bekommt die richtige Dokumentart ────────────────

def test_seitenklassifikation_aus_echtem_lv_muster():
    """Deckblatt → cover, LV-Seite → lv, KOSTENZUSAMMENSTELLUNG → cost_summary,
    Schema → schema (Punkt 27)."""
    for erwartet, text in _fixture_seiten("lv_seiten_sanitized.txt"):
        res = pc.classify_page(text)
        assert res["type"] == erwartet, (
            f"Seite als {res['type']} statt {erwartet} erkannt; "
            f"Signale: {res['signals']}"
        )


def test_kostenzusammenstellung_braucht_titel_und_bkp_zeilen():
    """Der Titel allein (z.B. im Inhaltsverzeichnis) macht keine cost_summary."""
    nur_titel = "Inhaltsverzeichnis\nKostenzusammenstellung ....... Seite 43"
    assert pc.classify_page(nur_titel)["type"] != pc.COST_SUMMARY


def test_preisszusammenstellung_wird_wie_kostenzusammenstellung_erkannt():
    text = (
        "Preisszusammenstellung BKP 243\n"
        "243.0 Heizflächen 5'230.00\n"
        "243.1 Leitungen 3'620.00\n"
        "243.2 Apparate und Armaturen 4'060.00\n"
    )
    assert pc.classify_page(text)["type"] == pc.COST_SUMMARY


def test_schemaseite_wird_nie_als_lv_gelesen():
    """Legendenseiten enthalten „Pos." — dürfen aber kein LV sein."""
    text = "Prinzipschema Heizung\nLegende Heizung\nPos. 1 Waermepumpe\nPos. 2 Speicher"
    assert pc.classify_page(text)["type"] == pc.SCHEMA


def test_leere_seite_ist_unknown():
    assert pc.classify_page("")["type"] == pc.UNKNOWN
    assert pc.classify_page("   \n  ")["type"] == pc.UNKNOWN


def test_pages_of_type_filtert_und_summary_zaehlt():
    """Punkt 2 — Extraktoren bekommen nur ihre Seiten."""
    pages = [{"page": 1, "text": t} for t in
             ["Ausschreibung und Angebot\nBauherr: X\nProjekt: Y", "Prinzipschema Heizung"]]
    pages[1]["page"] = 2
    klass = pc.classify_pages(pages)
    assert [c["type"] for c in klass] == [pc.COVER, pc.SCHEMA]
    nur_cover = pc.pages_of_type(pages, klass, pc.COVER)
    assert [p["page"] for p in nur_cover] == [1]
    assert pc.summary(klass) == {pc.COVER: 1, pc.SCHEMA: 1}


def test_klassifikation_behaelt_seitenbezug():
    """Punkt 1 — die Klassifikation muss nachvollziehbar an der Seite hängen."""
    pages = [{"page": 7, "text": "Prinzipschema Heizung"}]
    klass = pc.classify_pages(pages)
    assert klass[0]["page"] == 7
    assert klass[0]["signals"]


# ── Punkt 3/4 — räumliche Extraktion und Tabellenzeilen ────────────────────

def _wort(text, x0, top, breite=None):
    """Hilfswort mit Koordinaten; Breite grob aus der Textlänge."""
    b = breite if breite is not None else max(6.0, len(text) * 5.0)
    return {"text": text, "x0": float(x0), "x1": float(x0 + b),
            "top": float(top), "bottom": float(top + 9)}


def test_woerter_werden_zu_visuellen_zeilen_gruppiert():
    """Gleiche Höhe → eine Zeile, links nach rechts sortiert."""
    words = [_wort("150", 300, 100), _wort("Länge/Sonde", 60, 100.5),
             _wort("m", 250, 100), _wort("Total", 60, 130)]
    zeilen = group_words_to_rows(words)
    assert len(zeilen) == 2
    assert [w["text"] for w in zeilen[0]] == ["Länge/Sonde", "m", "150"]


def test_tabellenzeile_beschreibung_einheit_ausmass():
    """Punkt 4 — `Länge/Sonde  m  150` wird als Zeile verstanden."""
    row = [_wort("Länge/Sonde", 60, 100), _wort("m", 250, 100), _wort("150", 300, 100)]
    parsed = parse_table_row(row)
    assert parsed["beschreibung"] == "Länge/Sonde"
    assert parsed["einheit"] == "m"
    assert parsed["ausmass"] == 150


def test_tabellenzeile_mit_ep_und_total():
    row = [_wort("Geschweisste Gasrohre DN 32", 60, 100), _wort("m", 250, 100),
           _wort("12", 300, 100), _wort("18.50", 360, 100), _wort("222.00", 430, 100)]
    parsed = parse_table_row(row)
    assert parsed["einheit"] == "m"
    assert parsed["ausmass"] == 12
    assert parsed["ep"] == 18.5
    assert parsed["total"] == 222.0


def test_tabellenzeile_menge_vor_einheit_verwechselt_ep_nicht_mit_ausmass():
    """Dupper-Layout: Beschreibung | Menge | ME | Preis | Total."""
    row = [_wort("Verbundrohr 16 mm", 60, 100), _wort("5000.00", 250, 100),
           _wort("m", 310, 100), _wort("1.75", 360, 100), _wort("8'750.00", 430, 100)]
    parsed = parse_table_row(row)
    assert parsed["ausmass"] == 5000
    assert parsed["ep"] == 1.75
    assert parsed["total"] == 8750


def test_metrisches_gewinde_m10_ist_keine_meter_einheit():
    row = [_wort('1/2“:', 60, 100), _wort("M", 160, 100), _wort("10", 190, 100),
           _wort("Stk.", 300, 100), _wort("4", 350, 100)]
    parsed = parse_table_row(row)
    assert parsed["einheit"] == "stk"
    assert parsed["ausmass"] == 4


def test_code_text_menge_me_preis_total_ist_lv_kopf():
    text = "Code Text Menge ME Preis Total\n243.1 Rohrleitungen\n12.00 m 26.90 322.80"
    assert pc.classify_page(text)["type"] == pc.LV


def test_wert_rechts_vom_label_gewinnt():
    """Punkt 4 — der Wert rechts vom Label zählt, nicht eine Zahl darüber."""
    word_pages = [{"page": 15, "words": [
        _wort("999", 300, 70),                 # Störwert ÜBER dem Label
        _wort("Länge/Sonde", 60, 100), _wort("m", 250, 100), _wort("150", 300, 100),
        _wort("888", 300, 130),                # Störwert UNTER dem Label
    ]}]
    treffer = find_value_right_of_label(word_pages, "Länge/Sonde", einheit="m")
    assert treffer["value"] == 150
    assert treffer["source_page"] == 15
    assert "Länge/Sonde" in treffer["source_text"]
    assert treffer["bbox"]


def test_wert_links_vom_label_wird_ignoriert():
    """Eine Zahl LINKS des Labels ist nicht der gesuchte Ausmass-Wert."""
    word_pages = [{"page": 3, "words": [
        _wort("42", 20, 100), _wort("Total Sonden", 60, 100),
    ]}]
    assert find_value_right_of_label(word_pages, "Total Sonden") is None


def test_falsche_einheit_verhindert_treffer():
    word_pages = [{"page": 3, "words": [
        _wort("Länge/Sonde", 60, 100), _wort("kg", 250, 100), _wort("150", 300, 100),
    ]}]
    assert find_value_right_of_label(word_pages, "Länge/Sonde", einheit="m") is None


def test_words_to_pages_stellt_lesbare_reihenfolge_her():
    """Punkt 3 — aus Koordinaten entsteht visuell korrekter Text."""
    word_pages = [{"page": 2, "words": [
        _wort("150", 300, 100), _wort("Länge/Sonde", 60, 100),
        _wort("Total", 60, 130), _wort("Sonden", 110, 130), _wort("6", 300, 130),
    ]}]
    pages = words_to_pages(word_pages)
    assert pages[0]["page"] == 2
    assert pages[0]["text"].splitlines()[0] == "Länge/Sonde 150"
    assert pages[0]["text"].splitlines()[1] == "Total Sonden 6"
