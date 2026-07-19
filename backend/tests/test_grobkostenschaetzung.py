"""Grobkostenschätzung (BKP) — Tests. Kern rechnet auf Ebene der BKP-Einzel-
positionen; die entscheidende Regel «fehlende Position = 0» ist eigens getestet
(test_schaetze_position_fehlende_position_zaehlt_null, test_..._summe_bleibt_...)."""
from datetime import date
from types import SimpleNamespace

import pytest

from app.calculations.grobkostenschaetzung import (
    abgabetyp_naehe,
    aehnlichkeits_score,
    alter_in_jahren,
    berechne_grobkostenschaetzung,
    bww_naehe,
    einheiten_naehe,
    finde_referenzen,
    groessennaehe,
    hard_filter,
    nutzungsnaehe,
    perzentil,
    schaetze_position,
    skaliere_auf_baupreisindex,
    wende_korrekturfaktoren_an,
    zeitgewicht,
    zertifizierungs_naehe,
)
from app.data.bkp_positionen import abgabe_klassen_von, filter_positionen


# ── Zeitgewicht ──────────────────────────────────────────────────────────────

def test_zeitgewicht_milde_reduktion():
    """Aktualität nur noch minimal (Dominic 2026-07-19): 1 %/Jahr, nie unter 90 %."""
    assert zeitgewicht(0.0) == pytest.approx(1.0)
    assert zeitgewicht(4.0) == pytest.approx(0.96)   # 4 Jahre → nur 4 % Abzug
    assert zeitgewicht(5.0) == pytest.approx(0.95)
    assert zeitgewicht(20.0) == pytest.approx(0.90)  # Floor: nie unter 90 %


def test_zeitgewicht_negatives_alter_wie_null():
    assert zeitgewicht(-1.0) == pytest.approx(1.0)


def test_alter_in_jahren():
    assert alter_in_jahren(date(2023, 1, 1), heute=date(2026, 1, 1)) == pytest.approx(3.0, abs=0.01)


# ── Ähnlichkeitssuche ────────────────────────────────────────────────────────

def test_groessennaehe():
    assert groessennaehe(1000, 1000) == pytest.approx(1.0)
    assert groessennaehe(50, 100) == pytest.approx(0.5)
    assert groessennaehe(None, 100) == 0.0
    assert groessennaehe(0, 100) == 0.0


def test_nutzungsnaehe():
    assert nutzungsnaehe("MFH", "MFH") == 1.0
    assert nutzungsnaehe("MFH", "EFH") == 0.5  # beides Wohnen
    assert nutzungsnaehe("EFH", "Spital") == 0.0


def test_abgabetyp_naehe():
    assert abgabetyp_naehe("FBH", "FBH") == 1.0
    assert abgabetyp_naehe("FBH", "gemischt") == 0.5
    assert abgabetyp_naehe("FBH", "HK") == 0.2


def test_bww_naehe_weiches_kriterium():
    assert bww_naehe(True, True) == 1.0
    assert bww_naehe(False, False) == 1.0
    assert bww_naehe(True, False) == 0.0
    assert bww_naehe(None, True) == 0.5
    assert bww_naehe(None, None) == 1.0


def test_zertifizierungs_naehe():
    assert zertifizierungs_naehe("Minergie", "Minergie") == 1.0
    assert zertifizierungs_naehe("Minergie", "Minergie-P") == 0.3
    assert zertifizierungs_naehe(None, None) == 1.0   # beide unbekannt = neutral
    assert zertifizierungs_naehe("Minergie", None) == 0.5
    assert zertifizierungs_naehe("", "") == 1.0


def test_einheiten_naehe():
    assert einheiten_naehe(8, 8) == 1.0
    assert einheiten_naehe(8, 10) == pytest.approx(0.8)
    assert einheiten_naehe(None, None) == 1.0         # beide unbekannt = neutral
    assert einheiten_naehe(8, None) == 0.5


def test_anzahl_ne_beeinflusst_score():
    """Dominics Frage: Anzahl Einheiten muss nun wirken (war vorher tot)."""
    kandidat = {"ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "abgabe_dominant": "FBH", "anzahl_ne": 8}
    ziel_gleich = {**kandidat}
    ziel_anders = {**kandidat, "anzahl_ne": 40}
    assert aehnlichkeits_score(kandidat, ziel_gleich) > aehnlichkeits_score(kandidat, ziel_anders)


# ── Wärmeabgabe filtert die Positionen (Dominics Luftheizapparate-Fehler) ─────

def test_abgabe_klassen_von():
    assert abgabe_klassen_von(["FBH"]) == {"flaeche"}
    assert abgabe_klassen_von(["Heizkörper", "Konvektoren"]) == {"koerper"}
    assert abgabe_klassen_von(["FBH", "Lufterhitzer"]) == {"flaeche", "luft"}
    assert abgabe_klassen_von([]) == set()
    assert abgabe_klassen_von(None) == set()


def test_filter_positionen_waermeabgabe_blendet_fremde_aus():
    """FBH-Projekt darf keine Heizkörper- (243.2*) oder Luftheizapparate-Position
    (243.4a) enthalten — genau Dominics gemeldeter Fehler."""
    fbh = {p["bkp_nr"] for p in filter_positionen("sole_wasser", "MFH", {"flaeche"})}
    assert "243.3a" in fbh          # Bodenheizung: passt
    assert "243.4a" not in fbh      # Luftheizapparate: raus
    assert "243.2a" not in fbh      # Heizkörper: raus
    assert "243.1" in fbh           # Rohrleitungen: gelten immer
    # Luft-Projekt umgekehrt
    luft = {p["bkp_nr"] for p in filter_positionen("sole_wasser", "MFH", {"luft"})}
    assert "243.4a" in luft
    assert "243.3a" not in luft
    # unbekannte Abgabe (leer) → nicht filtern, alle Verteil-Positionen da
    alle = {p["bkp_nr"] for p in filter_positionen("sole_wasser", "MFH", set())}
    assert {"243.2a", "243.3a", "243.4a"} <= alle


def test_berechne_fbh_projekt_ohne_luftheizapparate():
    """End-to-end: ein reines FBH-Zielprojekt zeigt keine Luftheizapparate (243.4a),
    auch wenn eine gemischte Referenz solche Kosten hatte — nur die FBH-Kosten kommen."""
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
            "wp_typ": "sole", "hat_erdsonden": True, "waermeabgabe": ["FBH"], "abgabe_dominant": "FBH"}
    referenz = {"name": "R", "ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
                "wp_typ": "sole", "hat_erdsonden": True, "abgabe_klassen": {"flaeche", "luft"},
                "datum_abrechnung": date(2025, 1, 1),
                "positionen": {"243.4a": 50000, "243.3a": 40000}}
    res = berechne_grobkostenschaetzung(ziel, [referenz], [], heute=date(2026, 1, 1))
    alle = {p["bkp_nr"]: p for g in res["gruppen"] for p in g["positionen"]}
    assert "243.4a" not in alle              # Luftheizapparate gar nicht erst dabei
    assert alle["243.3a"]["betrag"] == pytest.approx(40000)  # nur die FBH-Kosten der Referenz


def test_position_nur_referenzen_mit_gewaehlter_abgabe():
    """Dominics Kernregel (essenziell): für ein FBH-Ziel liefert eine reine
    Heizkörper-Referenz KEINE Fussbodenheizungs-Kosten — sie zieht 243.3a nicht
    auf einen Mischwert runter."""
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
            "wp_typ": "sole", "hat_erdsonden": True, "waermeabgabe": ["FBH"]}
    fbh_ref = {"name": "FBH", "ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
               "wp_typ": "sole", "hat_erdsonden": True, "abgabe_klassen": {"flaeche"},
               "datum_abrechnung": date(2025, 1, 1), "positionen": {"243.3a": 40000}}
    hk_ref = {"name": "HK", "ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
              "wp_typ": "sole", "hat_erdsonden": True, "abgabe_klassen": {"koerper"},
              "datum_abrechnung": date(2025, 1, 1), "positionen": {"243.2a": 30000}}
    res = berechne_grobkostenschaetzung(ziel, [fbh_ref, hk_ref], [], heute=date(2026, 1, 1))
    p = next(x for g in res["gruppen"] for x in g["positionen"] if x["bkp_nr"] == "243.3a")
    assert p["betrag"] == pytest.approx(40000)  # nur FBH-Referenz, NICHT auf 20000 verwässert
    assert p["n_referenzen"] == 1               # die HK-Referenz zählt bei 243.3a nicht mit


def test_hard_filter():
    ziel = {"nutzung": "MFH", "wp_typ": "sole", "projektart": "Neubau", "hat_erdsonden": True}
    passt = {"nutzung": "MFH", "wp_typ": "sole", "projektart": "Neubau", "hat_erdsonden": True}
    assert hard_filter(passt, ziel) is True
    assert hard_filter({**passt, "nutzung": "EFH"}, ziel) is False   # Nutzung EXAKT (Dominic 2026-07-19)
    assert hard_filter({**passt, "wp_typ": "luft"}, ziel) is False
    assert hard_filter({**passt, "projektart": "Sanierung"}, ziel) is False
    assert hard_filter({**passt, "hat_erdsonden": False}, ziel) is False


def test_aehnlichkeits_score_perfekter_treffer_ist_1():
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "abgabe_dominant": "FBH"}
    assert aehnlichkeits_score(dict(ziel), ziel) == pytest.approx(1.0)


def test_finde_referenzen_hard_filter_und_zeitgewicht_ranking():
    """Drei Hard-Filter-Treffer. Seit die Aktualität nur noch minimal zählt
    (Dominic 2026-07-19: 1 %/Jahr), gewinnt die perfekt passende Referenz — auch
    wenn sie 6 Jahre alt ist — vor der aktuellen, aber mittelmässig ähnlichen."""
    heute = date(2026, 1, 1)
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
            "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True}
    kandidaten = [
        {"name": "A_perfekt_neu", "ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": heute},
        {"name": "B_perfekt_alt", "ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": date(2020, 1, 1)},
        {"name": "C_falscher_wptyp", "ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH",
         "projektart": "Neubau", "wp_typ": "luft", "abgabe_dominant": "FBH", "hat_erdsonden": True,
         "datum_abrechnung": heute},
        {"name": "E_kleiner_neu", "ebf_m2": 500, "leistung_kw": 10, "nutzung": "MFH",
         "projektart": "Neubau", "wp_typ": "sole", "abgabe_dominant": "HK", "hat_erdsonden": True,
         "datum_abrechnung": heute},
    ]
    ergebnis = finde_referenzen(kandidaten, ziel, top_n=5, heute=heute)
    assert [r["name"] for r in ergebnis] == ["A_perfekt_neu", "B_perfekt_alt", "E_kleiner_neu"]
    assert ergebnis[0]["rang"] == pytest.approx(1.0)              # perfekt + neu
    assert ergebnis[1]["rang"] == pytest.approx(0.94, abs=0.001)  # perfekt, 6 J. alt → nur 6 % Abzug
    # E: 0.30×0.5 (ebf) + 0.26×0.5 (kW) + 0.16 (zert) + 0.16 (NE) + 0.12 (bww) = 0.72, aktuell → ×1.0
    assert ergebnis[2]["rang"] == pytest.approx(0.72, abs=0.001)


def test_finde_referenzen_ohne_datum_neutral_gewichtet():
    heute = date(2026, 1, 1)
    ziel = {"ebf_m2": 1000, "leistung_kw": 20, "nutzung": "MFH", "projektart": "Neubau",
            "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True}
    referenz = {**ziel, "name": "R", "datum_abrechnung": None}
    ergebnis = finde_referenzen([referenz], ziel, heute=heute)
    assert ergebnis[0]["zeitgewicht"] == 1.0


def test_perzentil():
    assert perzentil([100, 200, 300, 400], 0.25) == pytest.approx(175)
    assert perzentil([100, 200, 300, 400], 0.75) == pytest.approx(325)
    assert perzentil([], 0.5) == 0.0


# ── Korrekturfaktoren ────────────────────────────────────────────────────────

def test_korrekturfaktoren_sanierung_und_weiterbetrieb():
    ziel = {"projektart": "Sanierung", "weiterbetrieb_umbau": True, "etappierung": False}
    faktoren = [
        {"name": "Sanierung", "faktor": 1.20, "aktiv": True},
        {"name": "Weiterbetrieb", "faktor": 1.10, "aktiv": True},
        {"name": "Etappierung", "faktor": 1.08, "aktiv": True},
    ]
    ergebnis = wende_korrekturfaktoren_an(100000, ziel, faktoren)
    assert ergebnis["betrag"] == pytest.approx(100000 * 1.20 * 1.10)
    assert ergebnis["angewendet"] == ["Sanierung ×1.2", "Weiterbetrieb ×1.1"]


def test_korrekturfaktoren_inaktiv_ignoriert():
    ziel = {"projektart": "Sanierung", "weiterbetrieb_umbau": False, "etappierung": False}
    ergebnis = wende_korrekturfaktoren_an(100000, ziel, [{"name": "Sanierung", "faktor": 1.20, "aktiv": False}])
    assert ergebnis["betrag"] == 100000
    assert ergebnis["angewendet"] == []


# ── Baupreisindex ────────────────────────────────────────────────────────────

def test_skaliere_auf_baupreisindex_positionen():
    referenz = {"name": "R", "datum_abrechnung": date(2022, 6, 1),
                "positionen": {"243.1": 100000, "242.3": 40000}}
    eintraege = [{"periode": date(2022, 4, 1), "wert": 100.0}, {"periode": date(2026, 4, 1), "wert": 110.0}]
    out = skaliere_auf_baupreisindex([referenz], eintraege, heute=date(2026, 7, 1))
    assert out[0]["index_faktor"] == pytest.approx(1.10)
    assert out[0]["positionen"]["243.1"] == pytest.approx(110000)
    assert out[0]["positionen"]["242.3"] == pytest.approx(44000)


# ── Schätzung je Einzelposition (fehlende Position = 0) ─────────────────────

def _pos(bkp_nr="243.1", bezeichnung="Rohrleitungen"):
    return {"bkp_nr": bkp_nr, "bezeichnung": bezeichnung, "gruppe_nr": bkp_nr.split(".")[0]}


def test_schaetze_position_fehlende_position_zaehlt_null():
    """Position in nur 1 von 5 Referenzen (je 1000 m²): die anderen 4 zählen mit
    0 → Kennwert (50 + 0+0+0+0)/5 = 10 CHF/m², für 1000 m² also 10'000 — NICHT
    50'000 (das war der alte Aufblähungs-Fehler)."""
    segment = [{"ebf_m2": 1000, "rang": 1.0, "positionen": ({"243.1": 50000} if i == 0 else {})}
               for i in range(5)]
    e = schaetze_position(_pos(), segment, {"ebf_m2": 1000})
    assert e["kennwert"] == pytest.approx(10.0)
    assert e["betrag"] == pytest.approx(10000)
    assert e["abdeckung"] == 1
    assert e["n_referenzen"] == 5
    assert e["vertrauen"] == "niedrig"


def test_schaetze_position_volle_abdeckung():
    segment = [{"ebf_m2": 1000, "rang": 1.0, "positionen": {"243.1": 50000}} for _ in range(5)]
    e = schaetze_position(_pos(), segment, {"ebf_m2": 800})
    assert e["kennwert"] == pytest.approx(50.0)
    assert e["betrag"] == pytest.approx(40000)
    assert e["abdeckung"] == 5
    assert e["vertrauen"] == "hoch"


def test_schaetze_position_treiber_fallback_ohne_bohrmeter():
    """241-Position hat Treiber Bohrmeter; kennt das Ziel keine Bohrmeter,
    Rückfall auf kW — lernen UND anwenden auf kW."""
    segment = [{"leistung_kw": 40, "bohrmeter": None, "rang": 1.0, "positionen": {"241.14": 80000}}]
    e = schaetze_position(_pos("241.14", "Erdsonden"), segment, {"leistung_kw": 30})  # kein bohrmeter
    assert e["einheit"] == "CHF/kW"
    assert e["kennwert"] == pytest.approx(2000.0)   # 80000/40
    assert e["betrag"] == pytest.approx(60000)      # 2000 × 30


# ── Orchestrierung (Positionen, Gruppen, Gesamt) ────────────────────────────

def _ref(name, ebf, kw, positionen, datum=date(2025, 1, 1), **extra):
    base = {"name": name, "ebf_m2": ebf, "leistung_kw": kw, "nutzung": "MFH", "projektart": "Neubau",
            "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True, "bohrmeter": kw * 16,
            "hk_anzahl": None, "datum_abrechnung": datum, "positionen": positionen}
    base.update(extra)
    return base


_ZIEL = {"ebf_m2": 800, "leistung_kw": 32, "nutzung": "MFH", "projektart": "Neubau",
         "wp_typ": "sole", "abgabe_dominant": "FBH", "hat_erdsonden": True, "bohrmeter": 512, "hk_anzahl": None}


def test_berechne_liefert_positionen_gruppen_und_total():
    refs = [
        _ref("A", 1000, 40, {"243.1": 50000, "242.3": 90000, "241.14": 64000, "248.2": 8000, "249.2": 12000}),
        _ref("B", 500, 20, {"243.1": 26000, "242.3": 48000, "241.14": 32000, "248.2": 4000, "249.2": 6000},
             datum=date(2024, 6, 1)),
    ]
    r = berechne_grobkostenschaetzung(_ZIEL, refs, faktoren=[], heute=date(2026, 7, 14))
    assert r["referenzen_gefunden"] == 2
    assert r["referenzen_im_segment"] == 2
    # Gruppen kommen in BKP-Reihenfolge, jede mit Positionsliste + Zwischentotal
    gruppen_nr = [g["gruppe_nr"] for g in r["gruppen"]]
    assert gruppen_nr == sorted(gruppen_nr)
    g243 = next(g for g in r["gruppen"] if g["gruppe_nr"] == "243")
    assert any(p["bkp_nr"] == "243.1" for p in g243["positionen"])
    assert g243["betrag"] == pytest.approx(sum(p["betrag"] for p in g243["positionen"]))
    assert r["gesamt_betrag"] == pytest.approx(sum(g["betrag"] for g in r["gruppen"]))
    assert r["gesamt_betrag"] > 0


def test_berechne_summe_bleibt_in_referenz_groessenordnung():
    """Der Kernbeweis gegen den 744'000-Fehler: die Referenz-Totale sind ~239k
    (1000 m²) und ~122k (500 m²); ein 800-m²-Ziel muss klar dazwischen liegen,
    nicht dutzendfach darüber."""
    refs = [
        _ref("A", 1000, 40, {"243.1": 50000, "243.6": 25000, "242.3": 90000, "242.6": 12000,
                             "241.14": 40000, "241.11": 15000, "248.2": 8000, "249.2": 12000}),
        _ref("B", 500, 20, {"243.1": 25000, "243.6": 12000, "242.3": 45000, "242.6": 6000,
                            "241.14": 20000, "241.11": 8000, "248.2": 4000, "249.2": 6000},
             datum=date(2024, 6, 1)),
    ]
    r = berechne_grobkostenschaetzung(_ZIEL, refs, faktoren=[], heute=date(2026, 7, 14))
    assert 122000 < r["gesamt_betrag"] < 250000


def test_berechne_korrekturfaktor_skaliert_total():
    refs = [_ref("A", 1000, 40, {"243.1": 50000, "242.3": 90000})]
    ziel = {**_ZIEL, "projektart": "Sanierung"}  # Sanierung ⇒ hard_filter braucht Sanierungs-Ref
    refs[0]["projektart"] = "Sanierung"
    ohne = berechne_grobkostenschaetzung(ziel, refs, faktoren=[], heute=date(2026, 7, 14))
    mit = berechne_grobkostenschaetzung(ziel, refs, faktoren=[{"name": "Sanierung", "faktor": 1.2, "aktiv": True}],
                                        heute=date(2026, 7, 14))
    assert mit["gesamt_betrag"] == pytest.approx(ohne["gesamt_betrag"] * 1.2)
    assert mit["korrekturfaktoren"] == ["Sanierung ×1.2"]


def test_berechne_ohne_referenzen_ist_null():
    r = berechne_grobkostenschaetzung(_ZIEL, [], faktoren=[], heute=date(2026, 7, 14))
    assert r["referenzen_gefunden"] == 0
    assert r["gesamt_betrag"] == 0.0


# ── Beispieldaten-Generator (weiterhin gruppenweise; Seed verteilt auf Positionen) ──

def test_beispieldaten_generator_deterministisch_und_konsistent():
    from app.data.beispiel_referenzprojekte import BEISPIEL_PREFIX, BEISPIEL_PROJEKTE, _generiere
    assert _generiere() == _generiere()           # fester Seed
    assert 70 <= len(BEISPIEL_PROJEKTE) <= 100
    assert len({p["name"] for p in BEISPIEL_PROJEKTE}) == len(BEISPIEL_PROJEKTE)
    for p in BEISPIEL_PROJEKTE:
        assert p["name"].startswith(BEISPIEL_PREFIX)
        sub = sum(v for g, v in p["bkp"].items() if g != "249")
        assert 0.04 <= p["bkp"]["249"] / sub <= 0.11, p["name"]
        assert 1200 <= p["bkp"]["242"] / p["leistung_kw"] <= 2600, p["name"]


# ── Adapter Auswertung → Positions-Kern (Router) ────────────────────────────

def _mock_ref(zeilen, rabatt=0.0, skonto=0.0, **kw):
    base = dict(id=1, name="Ref", ebf_m2=1000.0, heizleistung_kw=40.0, gebaeudetyp="MFH",
                projektart="Neubau", zertifizierung=None, waermeerzeuger=["Erdsonden-WP"], waermeabgabe=["FBH"],
                anzahl_einheiten=8, bww_bei_heizung=None, datum=date(2025, 1, 1),
                laufmeter_rohre_heizung=None, bohrmeter=600.0, anzahl_heizkoerper=None)
    base.update(kw)
    return SimpleNamespace(
        kostenzeilen=[SimpleNamespace(bkp_nr=nr, betrag_chf=b, gewerk="heizung") for nr, b in zeilen],
        gewerke=[SimpleNamespace(gewerk="heizung", rabatt_pct=rabatt, skonto_pct=skonto)],
        **base,
    )


def test_adapter_liefert_positionen_brutto_und_netto():
    from app.routers.hc_grobkostenschaetzung import _ref_to_calc_dict
    r = _mock_ref([("243.1", 80000.0), ("242.3", 100000.0)], rabatt=10.0, skonto=2.0)
    d = _ref_to_calc_dict(r)
    assert d["positionen_brutto"] == {"243.1": 80000.0, "242.3": 100000.0}
    f = 0.9 * 0.98
    assert d["positionen_netto"]["243.1"] == pytest.approx(80000 * f)
    assert d["wp_typ"] == "sole" and d["hat_erdsonden"] is True
    assert d["abgabe_dominant"] == "FBH"


def test_adapter_wp_typ_und_abgabe_ableitung():
    from app.routers.hc_grobkostenschaetzung import _wp_typ_von, _abgabe_dominant_von, _hat_erdsonden
    assert _wp_typ_von(["Luft/Wasser-WP"]) == "luft"
    assert _wp_typ_von(["Gas"]) is None
    assert _hat_erdsonden(["Erdsonden-WP"]) is True
    assert _hat_erdsonden(["Luft/Wasser-WP"]) is False
    assert _abgabe_dominant_von(["FBH", "Heizkörper"]) == "gemischt"
    assert _abgabe_dominant_von(["TABS"]) == "FBH"
