"""Kostenschätzung — Tests der ähnlichkeitsgewichteten Kennwert-Logik."""
from datetime import date

import pytest

from app.calculations.kostenschaetzung import (
    aehnlichkeit_stufe,
    berechne_kostenschaetzung,
    bkp_relevant,
    confidence_from,
    effective_n,
    index_faktor,
    ist_monovalent,
    jaccard,
    konfiguration_kompatibilitaet,
    quantile,
    ratio_similarity,
    similarity,
    weighted_mean,
)


def test_ratio_similarity():
    assert ratio_similarity(100, 100) == pytest.approx(1.0)
    assert ratio_similarity(50, 100) == pytest.approx(0.5, abs=0.001)  # exp(-ln2)
    assert ratio_similarity(None, 100) == 0.5
    assert ratio_similarity(0, 100) == 0.5


def test_jaccard():
    assert jaccard(["a", "b"], ["b", "c"]) == pytest.approx(1 / 3)
    assert jaccard([], []) == 1.0
    assert jaccard(["a"], ["b"]) == 0.0
    assert jaccard(["a", "b"], ["a", "b"]) == 1.0


def test_effective_n():
    assert effective_n([1, 1, 1, 1]) == pytest.approx(4.0)
    assert effective_n([2, 2]) == pytest.approx(2.0)
    assert effective_n([]) == 0.0


def test_weighted_mean():
    assert weighted_mean([(10, 1), (20, 1)]) == pytest.approx(15.0)
    assert weighted_mean([(10, 3), (20, 1)]) == pytest.approx(12.5)
    assert weighted_mean([]) == 0.0


def test_quantile():
    assert quantile([1, 2, 3, 4], 0.5) == pytest.approx(2.5)
    assert quantile([1, 2, 3, 4, 5], 0.25) == pytest.approx(2.0)
    assert quantile([], 0.5) == 0.0


def test_confidence_from():
    assert confidence_from(11) == "hoch"
    assert confidence_from(10) == "mittel"
    assert confidence_from(4) == "mittel"
    assert confidence_from(3.9) == "tief"
    assert confidence_from(0) == "tief"


def test_similarity_identisch_hoeher_als_verschieden():
    inp = {"projektart": "Neubau", "gebaeudetyp": "MFH", "waermeerzeuger": ["Erdsonden-WP"],
           "waermeabgabe": ["FBH"], "ebf": 1000, "heizleistung_kw": 40}
    gleich = {**inp, "qualitaet": 1.0}
    anders = {"projektart": "Sanierung", "gebaeudetyp": "EFH", "waermeerzeuger": ["Gas"],
              "waermeabgabe": ["Heizkörper"], "ebf": 200, "heizleistung_kw": 8, "qualitaet": 1.0}
    assert similarity(inp, gleich) > similarity(inp, anders)


def test_similarity_ignoriert_alter_der_referenz():
    """Regressionstest (Dominic-Feedback 2026-07-09): ein zeitlich weit
    zurückliegendes, sonst identisches Referenzprojekt darf NICHT als
    unähnlicher gelten — Alter zählt nur über den Baupreisindex, nicht hier."""
    inp = {"projektart": "Neubau", "gebaeudetyp": "MFH", "waermeerzeuger": ["Erdsonden-WP"],
           "waermeabgabe": ["FBH"], "ebf": 1000, "heizleistung_kw": 40}
    neu = {**inp, "qualitaet": 1.0, "datum": date.today()}
    alt = {**inp, "qualitaet": 1.0, "datum": date(2016, 1, 1)}
    assert similarity(inp, neu) == pytest.approx(similarity(inp, alt))


def test_berechne_gewichteter_kennwert():
    inp = {"projektart": "Neubau", "gebaeudetyp": "MFH", "ausbauumfang": "Vollausbau",
           "zertifizierung": "keine", "waermeerzeuger": ["Erdsonden-WP"], "waermeabgabe": ["FBH"],
           "ebf": 1000, "bohrmeter": 400, "heizleistung_kw": 40, "anzahl_einheiten": 8}
    # zwei identische Referenzen (→ gleiche Gewichte), nur Betrag 242.3 unterschiedlich
    base = {"projektart": "Neubau", "gebaeudetyp": "MFH", "ausbauumfang": "Vollausbau",
            "zertifizierung": "keine", "waermeerzeuger": ["Erdsonden-WP"], "waermeabgabe": ["FBH"],
            "ebf": 1000, "bohrmeter": 400, "heizleistung_kw": 40, "anzahl_einheiten": 8,
            "datum": None, "qualitaet": 1.0}
    ref1 = {**base, "name": "A", "kosten": {"242.3": 80000, "243.1": 50000}}
    ref2 = {**base, "name": "B", "kosten": {"242.3": 100000, "243.1": 50000}}
    res = berechne_kostenschaetzung(inp, [ref1, ref2])

    by_nr = {r["bkp_nr"]: r for r in res["rows"]}
    # 242.3 Treiber kW: Kennwerte 2000 und 2500 → Mittel 2250 → ×40 kW = 90'000
    assert by_nr["242.3"]["kennwert"] == pytest.approx(2250, abs=1)
    assert by_nr["242.3"]["estimate"] == pytest.approx(90000, abs=1)
    # 243.1 Treiber EBF: 50 CHF/m² ×1000 = 50'000
    assert by_nr["243.1"]["estimate"] == pytest.approx(50000, abs=1)
    assert res["total"] == pytest.approx(140000, abs=2)
    assert res["anzahl_referenzen"] == 2
    assert len(res["referenzen"]) == 2


def test_ohne_treiber_wird_uebersprungen():
    # Input ohne Bohrmeter → 241er (Treiber Bohrmeter) fällt raus, 242.4 (kW) bleibt
    inp = {"waermeerzeuger": ["Luft/Wasser-WP"], "waermeabgabe": ["FBH"],
           "ebf": 1000, "heizleistung_kw": 40, "anzahl_einheiten": 8, "bohrmeter": 0}
    ref = {"name": "X", "ebf": 1000, "heizleistung_kw": 40, "bohrmeter": 500, "anzahl_einheiten": 8,
           "datum": None, "qualitaet": 1.0, "waermeerzeuger": ["Luft/Wasser-WP"], "waermeabgabe": ["FBH"],
           "kosten": {"241.14": 60000, "242.4": 80000}}
    res = berechne_kostenschaetzung(inp, [ref])
    nrs = {r["bkp_nr"] for r in res["rows"]}
    assert "241.14" not in nrs
    assert "242.4" in nrs


def test_relevanz_filter():
    # Nur Erdsonden-WP → Sole (242.3/241.14) relevant, Luft/Wasser (242.4) nicht
    assert bkp_relevant("242.3", ["Erdsonden-WP"], ["FBH"]) is True
    assert bkp_relevant("242.4", ["Erdsonden-WP"], ["FBH"]) is False
    assert bkp_relevant("241.14", ["Erdsonden-WP"], ["FBH"]) is True
    assert bkp_relevant("241.14", ["Luft/Wasser-WP"], ["FBH"]) is False
    # Heizkörper-Position nur bei Heizkörper; Bodenheizung nur bei FBH
    assert bkp_relevant("243.2a", ["Erdsonden-WP"], ["FBH"]) is False
    assert bkp_relevant("243.2a", ["Erdsonden-WP"], ["Heizkörper"]) is True
    assert bkp_relevant("243.3a", ["Erdsonden-WP"], ["Heizkörper"]) is False
    # Allgemeine Position immer relevant
    assert bkp_relevant("243.1", ["Erdsonden-WP"], ["FBH"]) is True


def test_berechnung_schliesst_fremde_generation_aus():
    inp = {"waermeerzeuger": ["Erdsonden-WP"], "waermeabgabe": ["FBH"],
           "ebf": 1000, "bohrmeter": 400, "heizleistung_kw": 40, "anzahl_einheiten": 8}
    ref = {"name": "M", "ebf": 1000, "bohrmeter": 400, "heizleistung_kw": 40, "anzahl_einheiten": 8,
           "datum": None, "qualitaet": 1.0, "waermeerzeuger": ["Erdsonden-WP"], "waermeabgabe": ["FBH"],
           "kosten": {"242.3": 80000, "242.4": 90000, "243.1": 50000}}
    res = berechne_kostenschaetzung(inp, [ref])
    nrs = {r["bkp_nr"] for r in res["rows"]}
    assert "242.3" in nrs
    assert "242.4" not in nrs  # fremde WP darf nicht mitzählen


# ── Anlagenkonfiguration (monovalent/bivalent/hybrid/kaskadiert/redundant) ──

def test_ist_monovalent():
    assert ist_monovalent(None) is True
    assert ist_monovalent("monovalent") is True
    assert ist_monovalent("bivalent") is False
    assert ist_monovalent("kaskadiert") is False


def test_konfiguration_kompatibilitaet():
    assert konfiguration_kompatibilitaet("bivalent", "bivalent") == 1.0
    assert konfiguration_kompatibilitaet(None, None) == 1.0  # beide default monovalent
    assert konfiguration_kompatibilitaet("monovalent", "bivalent") == 0.05  # harter Bruch
    assert konfiguration_kompatibilitaet("bivalent", "monovalent") == 0.05  # symmetrisch
    assert konfiguration_kompatibilitaet("bivalent", "kaskadiert") == 0.5  # beide Mehrfach, aber anders


_BASE = {"waermeerzeuger": ["Erdsonden-WP", "Luft/Wasser-WP"], "waermeabgabe": ["FBH"],
         "ebf": 1000, "heizleistung_kw": 40, "bohrmeter": 400, "anzahl_einheiten": 8}


def test_komplexitaet_mit_passender_referenz_kein_zuschlag():
    # Zielprojekt bivalent + eine ECHTE bivalente Referenz vorhanden → normale Rechnung
    inp = {**_BASE, "anlagenkonfiguration": "bivalent"}
    ref = {**_BASE, "name": "B", "anlagenkonfiguration": "bivalent", "datum": None, "qualitaet": 1.0,
           "kosten": {"243.6": 20000}}
    res = berechne_kostenschaetzung(inp, [ref])
    row = next(r for r in res["rows"] if r["bkp_nr"] == "243.6")
    assert row["hinweis"] is None
    # 20'000 CHF / 1000 m² EBF = 20 CHF/m² × 1000 m² = 20'000 (kein Zuschlag)
    assert row["estimate"] == pytest.approx(20000, abs=1)


def test_komplexitaet_ohne_passende_referenz_zuschlag_und_tief():
    # Zielprojekt bivalent, aber NUR monovalente Referenzen vorhanden → Fallback
    inp = {**_BASE, "anlagenkonfiguration": "bivalent"}
    monovalent = {"waermeerzeuger": ["Erdsonden-WP"], "waermeabgabe": ["FBH"], "ebf": 1000,
                  "heizleistung_kw": 40, "bohrmeter": 400, "anzahl_einheiten": 8,
                  "anlagenkonfiguration": "monovalent", "datum": None, "qualitaet": 1.0,
                  "kosten": {"243.6": 20000}}
    ref1, ref2 = {**monovalent, "name": "M1"}, {**monovalent, "name": "M2"}
    res = berechne_kostenschaetzung(inp, [ref1, ref2])
    row = next(r for r in res["rows"] if r["bkp_nr"] == "243.6")
    assert row["confidence"] == "tief"
    assert row["hinweis"] is not None and "bivalent" in row["hinweis"]
    # 20 CHF/m² × 1.20 (bivalent-Zuschlag) × 1000 m² = 24'000
    assert row["estimate"] == pytest.approx(24000, abs=1)
    assert res["overall_confidence"] == "tief"


def test_bauteil_position_unbeeinflusst_von_konfiguration():
    # Bauteil-Position (242.3, reine WP) darf monovalente Referenz normal nutzen,
    # auch wenn das Zielprojekt bivalent ist.
    inp = {**_BASE, "anlagenkonfiguration": "bivalent"}
    ref = {"waermeerzeuger": ["Erdsonden-WP"], "waermeabgabe": ["FBH"], "ebf": 1000,
           "heizleistung_kw": 40, "bohrmeter": 400, "anzahl_einheiten": 8,
           "anlagenkonfiguration": "monovalent", "name": "M", "datum": None, "qualitaet": 1.0,
           "kosten": {"242.3": 80000}}
    res = berechne_kostenschaetzung(inp, [ref])
    row = next(r for r in res["rows"] if r["bkp_nr"] == "242.3")
    assert row["hinweis"] is None
    assert row["estimate"] == pytest.approx(80000, abs=1)  # kein Zuschlag auf Bauteil-Positionen


# ── Baupreisindex ────────────────────────────────────────────────────────────

def test_index_faktor():
    eintraege = [{"periode": date(2020, 10, 1), "wert": 100.0}, {"periode": date(2025, 10, 1), "wert": 110.0}]
    assert index_faktor(date(2020, 10, 1), date(2025, 10, 1), eintraege) == pytest.approx(1.1)
    assert index_faktor(None, date(2025, 10, 1), eintraege) == 1.0
    assert index_faktor(date(2020, 10, 1), date(2025, 10, 1), []) == 1.0
    assert index_faktor(date(2020, 10, 1), date(2020, 10, 1), eintraege) == pytest.approx(1.0)


def test_baupreisindex_skaliert_wenn_aktiv():
    inp = {**_BASE, "baupreisindex_beruecksichtigen": True}
    ref = {**_BASE, "name": "A", "datum": date(2020, 10, 1), "qualitaet": 1.0, "kosten": {"242.3": 80000}}
    eintraege = [{"periode": date(2020, 10, 1), "wert": 100.0}, {"periode": date.today(), "wert": 110.0}]
    res = berechne_kostenschaetzung(inp, [ref], eintraege)
    row = next(r for r in res["rows"] if r["bkp_nr"] == "242.3")
    # 80'000 × 1.1 (Indexfaktor) = 88'000 CHF Basis, Treiber kW ändert nichts an der Skalierung
    assert row["estimate"] == pytest.approx(88000, abs=1)
    assert res["baupreisindex"]["aktiv"] is True


def test_baupreisindex_inaktiv_ohne_flag():
    inp = dict(_BASE)  # kein baupreisindex_beruecksichtigen → False
    ref = {**_BASE, "name": "A", "datum": date(2020, 10, 1), "qualitaet": 1.0, "kosten": {"242.3": 80000}}
    eintraege = [{"periode": date(2020, 10, 1), "wert": 100.0}, {"periode": date.today(), "wert": 110.0}]
    res = berechne_kostenschaetzung(inp, [ref], eintraege)
    row = next(r for r in res["rows"] if r["bkp_nr"] == "242.3")
    assert row["estimate"] == pytest.approx(80000, abs=1)  # unverändert, Häkchen nicht gesetzt
    assert res["baupreisindex"]["aktiv"] is False


# ── Ähnlichkeit vs. Validierung (zwei getrennte Fragen) ─────────────────────

def test_aehnlichkeit_stufe():
    assert aehnlichkeit_stufe(0.71) == "hoch"
    assert aehnlichkeit_stufe(0.65) == "hoch"
    assert aehnlichkeit_stufe(0.5) == "mittel"
    assert aehnlichkeit_stufe(0.4) == "mittel"
    assert aehnlichkeit_stufe(0.1) == "tief"


def test_ein_sehr_aehnlicher_treffer_gibt_hohe_aehnlichkeit_aber_tiefe_validierung():
    # Genau Dominics Fall: 1 Referenz, fast identisch zum Zielprojekt → das
    # Projekt IST ähnlich (hohe Ähnlichkeit), aber es gibt zu wenige
    # unabhängige Referenzen, um das breit zu validieren (tiefe Validierung/
    # Vertrauen) — beides muss GLEICHZEITIG und GETRENNT sichtbar sein.
    inp = {**_BASE, "projektart": "Neubau", "gebaeudetyp": "MFH", "ausbauumfang": "Vollausbau"}
    ref = {**_BASE, "name": "Fast identisch", "projektart": "Neubau", "gebaeudetyp": "MFH",
           "ausbauumfang": "Vollausbau", "datum": None, "qualitaet": 1.0, "kosten": {"242.3": 80000}}
    res = berechne_kostenschaetzung(inp, [ref])
    assert res["aehnlichkeit"]["stufe"] == "hoch"
    assert res["aehnlichkeit"]["gewicht"] >= 0.65
    row = next(r for r in res["rows"] if r["bkp_nr"] == "242.3")
    assert row["confidence"] == "tief"  # nur 1 Referenz → Validierung bleibt tief
    assert res["overall_confidence"] == "tief"
