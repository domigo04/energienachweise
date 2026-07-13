"""Grobkostenschätzung (BKP) — ein Test pro Formel, mit konkreten Zahlen
(CLAUDE.md-Regel). Deckt die 7 Bausteine aus calculations/grobkostenschaetzung.py ab."""
from datetime import date

import pytest

from app.calculations.grobkostenschaetzung import (
    abgabetyp_naehe,
    aehnlichkeits_score,
    alter_in_jahren,
    finde_referenzen,
    groessennaehe,
    hard_filter,
    kategorienaehe,
    kennwerte_je_referenz,
    kreuzcheck,
    lerne_faktor,
    perzentil,
    potenzfit,
    potenzfunktion_schaetzung,
    weg_a_bkp_249,
    weg_a_hochrechnung,
    weg_b_hochrechnung,
    wende_korrekturfaktoren_an,
    zeitgewicht,
)


# ── 1) Zeitgewicht ───────────────────────────────────────────────────────────

def test_zeitgewicht_halbwertszeit_3_jahre():
    assert zeitgewicht(0.0) == pytest.approx(1.0)
    assert zeitgewicht(3.0) == pytest.approx(0.5)
    assert zeitgewicht(6.0) == pytest.approx(0.25)


def test_zeitgewicht_negatives_alter_wie_null():
    assert zeitgewicht(-1.0) == pytest.approx(1.0)


def test_alter_in_jahren():
    assert alter_in_jahren(date(2023, 1, 1), heute=date(2026, 1, 1)) == pytest.approx(3.0, abs=0.01)


# ── 2) Ähnlichkeitssuche ─────────────────────────────────────────────────────

def test_groessennaehe():
    assert groessennaehe(1000, 1000) == pytest.approx(1.0)
    assert groessennaehe(50, 100) == pytest.approx(0.5)
    assert groessennaehe(None, 100) == 0.0
    assert groessennaehe(0, 100) == 0.0


def test_kategorienaehe():
    assert kategorienaehe("MFH_2_5", "MFH_2_5") == 1.0
    assert kategorienaehe("MFH_2_5", "MFH_6_10") == 0.5
    assert kategorienaehe("EFH", "Industrie") == 0.0


def test_abgabetyp_naehe():
    assert abgabetyp_naehe("FBH", "FBH") == 1.0
    assert abgabetyp_naehe("FBH", "gemischt") == 0.5
    assert abgabetyp_naehe("FBH", "HK") == 0.2


def test_hard_filter():
    ziel = {"wp_typ": "sole", "projektart": "Neubau", "hat_erdsonden": True}
    assert hard_filter({"wp_typ": "sole", "projektart": "Neubau", "hat_erdsonden": True}, ziel) is True
    assert hard_filter({"wp_typ": "luft", "projektart": "Neubau", "hat_erdsonden": True}, ziel) is False
    assert hard_filter({"wp_typ": "sole", "projektart": "Sanierung", "hat_erdsonden": True}, ziel) is False
    assert hard_filter({"wp_typ": "sole", "projektart": "Neubau", "hat_erdsonden": False}, ziel) is False


def test_aehnlichkeits_score_perfekter_treffer_ist_1():
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5", "abgabe_dominant": "FBH"}
    assert aehnlichkeits_score(dict(ziel), ziel) == pytest.approx(1.0)


def test_finde_referenzen_hard_filter_und_zeitgewicht_ranking():
    """6 Kandidaten: 3 fallen durch den Hard-Filter, von den restlichen 3
    überholt eine mittelmässig ähnliche, aber AKTUELLE Referenz eine perfekt
    passende, aber 6 Jahre alte — genau der Zeitgewicht-Effekt aus dem Auftrag."""
    heute = date(2026, 1, 1)
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5", "projektart": "Neubau",
            "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True}
    kandidaten = [
        {"name": "A_perfekt_neu", "ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": heute},
        {"name": "B_perfekt_alt", "ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": date(2020, 1, 1)},
        {"name": "C_falscher_wptyp", "ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5",
         "projektart": "Neubau", "wp_typ": "luft", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": heute},
        {"name": "D_falsche_projektart", "ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5",
         "projektart": "Sanierung", "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": heute},
        {"name": "E_kleiner_neu", "ebf_m2": 500, "leistung_kw": 10, "gebaeudekategorie": "Gewerbe",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "HK", "hat_erdsonden": True,
         "datum_abrechnung": heute},
        {"name": "F_keine_erdsonden", "ebf_m2": 1000, "leistung_kw": 20, "gebaeudekategorie": "MFH_2_5",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": False,
         "datum_abrechnung": heute},
    ]
    ergebnis = finde_referenzen(kandidaten, ziel, top_n=5, heute=heute)
    assert [r["name"] for r in ergebnis] == ["A_perfekt_neu", "E_kleiner_neu", "B_perfekt_alt"]
    assert ergebnis[0]["rang"] == pytest.approx(1.0)
    assert ergebnis[1]["rang"] == pytest.approx(0.34, abs=0.001)
    assert ergebnis[2]["rang"] == pytest.approx(0.25, abs=0.005)


def test_perzentil():
    werte = [100, 200, 300, 400]
    assert perzentil(werte, 0.25) == pytest.approx(175)
    assert perzentil(werte, 0.75) == pytest.approx(325)
    assert perzentil([], 0.5) == 0.0


# ── 3) Hochrechnung Weg A — Kennwert ────────────────────────────────────────

def test_weg_a_hochrechnung_gewichteter_kennwert():
    referenzen = [
        {"ebf_m2": 1000, "bkp_betraege": {"243": 100000}, "rang": 1.0, "name": "R1", "datum_abrechnung": date(2025, 1, 1)},
        {"ebf_m2": 500, "bkp_betraege": {"243": 60000}, "rang": 0.5, "name": "R2", "datum_abrechnung": date(2025, 1, 1)},
    ]
    ergebnis = weg_a_hochrechnung(referenzen, "243", {"ebf_m2": 800})
    assert ergebnis["kennwert"] == pytest.approx(106.667, abs=0.01)
    assert ergebnis["betrag"] == pytest.approx(85333.3, abs=1)
    assert ergebnis["n"] == 2
    assert ergebnis["einheit"] == "CHF/m² EBF"


def test_weg_a_hochrechnung_none_ohne_daten():
    assert weg_a_hochrechnung([], "243", {"ebf_m2": 800}) is None
    referenzen = [{"ebf_m2": 1000, "bkp_betraege": {}, "rang": 1.0}]
    assert weg_a_hochrechnung(referenzen, "243", {"ebf_m2": 800}) is None


def test_weg_a_hochrechnung_249_wirft_fehler():
    with pytest.raises(ValueError):
        weg_a_hochrechnung([], "249", {})


def test_weg_a_bkp_249_prozent_anteil():
    referenzen = [{"bkp_betraege": {"241": 50000, "243": 30000, "249": 8000}, "rang": 1.0, "name": "R1"}]
    ergebnis = weg_a_bkp_249(referenzen, zwischentotal=100000)
    assert ergebnis["kennwert"] == pytest.approx(0.10)
    assert ergebnis["betrag"] == pytest.approx(10000)


def test_kennwerte_je_referenz_ignoriert_fehlende_betraege():
    referenzen = [
        {"ebf_m2": 1000, "bkp_betraege": {"243": 100000}, "rang": 1.0, "name": "R1"},
        {"ebf_m2": 1000, "bkp_betraege": {}, "rang": 1.0, "name": "R2"},
    ]
    paare = kennwerte_je_referenz(referenzen, "243")
    assert len(paare) == 1
    assert paare[0]["name"] == "R1"


# ── 4) Faktor-Brücke Weg B ───────────────────────────────────────────────────

def test_weg_b_faktor_bruecke_rohrfaktor():
    referenzen = [
        {"rohrmeter": 300, "ebf_m2": 1000, "bkp_betraege": {"243": 90000}, "rang": 1.0},
        {"rohrmeter": 150, "ebf_m2": 500, "bkp_betraege": {"243": 48000}, "rang": 0.5},
    ]
    ergebnis = weg_b_hochrechnung(referenzen, "rohr_faktor", {"ebf_m2": 800})
    assert ergebnis["faktor"] == pytest.approx(0.3)
    assert ergebnis["menge_geschaetzt"] == pytest.approx(240)
    assert ergebnis["einheitspreis"] == pytest.approx(306.667, abs=0.01)
    assert ergebnis["betrag"] == pytest.approx(73600, abs=1)
    assert ergebnis["bkp"] == "243"


def test_lerne_faktor_none_ohne_stufe2_daten():
    referenzen = [{"ebf_m2": 1000, "bkp_betraege": {"243": 90000}, "rang": 1.0}]  # kein rohrmeter
    assert lerne_faktor(referenzen, "rohr_faktor") is None


def test_weg_b_hochrechnung_none_ohne_zielgroesse():
    referenzen = [{"rohrmeter": 300, "ebf_m2": 1000, "bkp_betraege": {"243": 90000}, "rang": 1.0}]
    assert weg_b_hochrechnung(referenzen, "rohr_faktor", {"ebf_m2": None}) is None


# ── 5) Kreuzcheck ────────────────────────────────────────────────────────────

def test_kreuzcheck_beide_wege_nah_beieinander_hohes_vertrauen():
    r = kreuzcheck(betrag_a=100000, betrag_b=105000, n_referenzen=3)
    assert r["vertrauen"] == "hoch"
    assert r["abweichung_prozent"] == pytest.approx(5.0)
    assert r["hinweis"] is None


def test_kreuzcheck_beide_wege_weit_auseinander_niedriges_vertrauen():
    r = kreuzcheck(betrag_a=100000, betrag_b=140000, n_referenzen=3)
    assert r["vertrauen"] == "niedrig"
    assert r["hinweis"] is not None


def test_kreuzcheck_nur_weg_a_vertrauen_nach_anzahl_referenzen():
    assert kreuzcheck(100000, None, n_referenzen=5)["vertrauen"] == "hoch"
    assert kreuzcheck(100000, None, n_referenzen=2)["vertrauen"] == "mittel"
    assert kreuzcheck(100000, None, n_referenzen=1)["vertrauen"] == "niedrig"


# ── 6) Potenzfunktion (nur n≥8, R²>0.7) ─────────────────────────────────────

def test_potenzfit_erkennt_bekannte_potenzfunktion():
    a_wahr, b_wahr = 1000.0, 0.8
    x_werte = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    y_werte = [a_wahr * x ** b_wahr for x in x_werte]
    fit = potenzfit(x_werte, y_werte, [1.0] * 10)
    assert fit["a"] == pytest.approx(a_wahr, rel=0.05)
    assert fit["b"] == pytest.approx(b_wahr, rel=0.05)
    assert fit["r2"] > 0.99


def test_potenzfunktion_schaetzung_nur_ab_n8_und_gutem_fit():
    a_wahr, b_wahr = 1000.0, 0.8
    referenzen = [
        {"leistung_kw": x, "bkp_betraege": {"241": a_wahr * x ** b_wahr}, "rang": 1.0}
        for x in [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    ]
    ergebnis = potenzfunktion_schaetzung(referenzen, "241", "leistung_kw", ziel_x=45)
    assert ergebnis is not None
    assert ergebnis["betrag"] == pytest.approx(a_wahr * 45 ** b_wahr, rel=0.05)
    assert ergebnis["r2"] > 0.7


def test_potenzfunktion_schaetzung_none_wenn_weniger_als_8_referenzen():
    referenzen = [
        {"leistung_kw": x, "bkp_betraege": {"241": 1000 * x ** 0.8}, "rang": 1.0}
        for x in [10, 20, 30]
    ]
    assert potenzfunktion_schaetzung(referenzen, "241", "leistung_kw", ziel_x=20) is None


def test_potenzfunktion_schaetzung_none_bei_schlechtem_fit():
    """8 Referenzen (genug für die n-Schwelle), aber Betrag hat keinen
    erkennbaren Zusammenhang mit der Leistung → R² zu tief, kein Fit."""
    referenzen = [
        {"leistung_kw": 10, "bkp_betraege": {"241": 150000}, "rang": 1.0},
        {"leistung_kw": 20, "bkp_betraege": {"241": 30000}, "rang": 1.0},
        {"leistung_kw": 30, "bkp_betraege": {"241": 180000}, "rang": 1.0},
        {"leistung_kw": 40, "bkp_betraege": {"241": 40000}, "rang": 1.0},
        {"leistung_kw": 50, "bkp_betraege": {"241": 160000}, "rang": 1.0},
        {"leistung_kw": 60, "bkp_betraege": {"241": 35000}, "rang": 1.0},
        {"leistung_kw": 70, "bkp_betraege": {"241": 170000}, "rang": 1.0},
        {"leistung_kw": 80, "bkp_betraege": {"241": 45000}, "rang": 1.0},
    ]
    assert potenzfunktion_schaetzung(referenzen, "241", "leistung_kw", ziel_x=45) is None


# ── 7) Korrekturfaktoren ─────────────────────────────────────────────────────

def test_korrekturfaktoren_sanierung_und_weiterbetrieb_multiplizieren():
    ziel = {"projektart": "Sanierung", "weiterbetrieb_umbau": True, "etappierung": False}
    faktoren = [
        {"name": "Sanierung", "faktor": 1.20, "aktiv": True},
        {"name": "Weiterbetrieb", "faktor": 1.10, "aktiv": True},
        {"name": "Etappierung", "faktor": 1.08, "aktiv": True},
    ]
    ergebnis = wende_korrekturfaktoren_an(100000, ziel, faktoren)
    assert ergebnis["betrag"] == pytest.approx(100000 * 1.20 * 1.10)
    assert ergebnis["angewendet"] == ["Sanierung ×1.2", "Weiterbetrieb ×1.1"]


def test_korrekturfaktoren_inaktiv_wird_ignoriert():
    ziel = {"projektart": "Sanierung", "weiterbetrieb_umbau": False, "etappierung": False}
    faktoren = [{"name": "Sanierung", "faktor": 1.20, "aktiv": False}]
    ergebnis = wende_korrekturfaktoren_an(100000, ziel, faktoren)
    assert ergebnis["betrag"] == 100000
    assert ergebnis["angewendet"] == []
