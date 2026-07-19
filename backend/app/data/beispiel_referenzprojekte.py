"""Beispiel-Referenzprojekte für die Grobkostenschätzung — deterministischer
Generator für ~80 realistische Schweizer Wärmepumpen-Projekte (Dominic
2026-07-13: «ca. 70–100 Referenzprojekte zum Testen»).

Deterministisch heisst: random.Random(42) mit festem Seed — jeder Aufruf
erzeugt exakt dieselben Projekte (kein Zufall zur Laufzeit, reproduzierbar,
idempotent ladbar). Die Kennwerte folgen pro Segment realistischen Basiswerten
mit Grössendegression und ±6 % Streuung:
- 241 Erdsonden ≈ 92–108 CHF/Bohrmeter, Bohrmeter ≈ 15.5–17.5 m/kW
- 242 Wärmeerzeugung ≈ 2400 CHF/kW bei 10 kW, fallend mit Grösse (Degression)
- 243 Verteilung: Neubau ≈ 100 CHF/m² · Sanierung ≈ 52 · WE-Ersatz ≈ 18
- 248 Dämmungen ≈ 11 CHF/m², 247 Spezialanlagen teils vorhanden, teils nicht
- 249 Diverses = 5–9.5 % vom Zwischentotal
Der pytest `test_beispieldaten_konsistenz` erzwingt diese Regeln dauerhaft.

Alle Namen beginnen mit BEISPIEL_PREFIX → sauber wieder löschbar.
"""
import random
from datetime import date, timedelta

BEISPIEL_PREFIX = "Beispiel — "

# (Anzahl, Nutzung, Projektart, WP-Typ, Erdsonden, Abgabe, EBF von, EBF bis)
_SEGMENTE = [
    (14, "MFH", "Neubau", "sole", True, "FBH", 400, 2600),
    (10, "MFH", "Neubau", "luft", False, "FBH", 350, 1600),
    (8, "MFH", "Sanierung", "luft", False, "HK", 500, 2000),
    (8, "MFH", "Ersatz_WE", "luft", False, "HK", 500, 2200),
    (8, "EFH", "Neubau", "sole", True, "FBH", 140, 260),
    (6, "EFH", "Ersatz_WE", "luft", False, "HK", 130, 240),
    (6, "Büro", "Neubau", "sole", True, "gemischt", 800, 4000),
    (4, "Schule", "Neubau", "sole", True, "FBH", 1500, 5000),
    (3, "Spital", "Sanierung", "sole", True, "gemischt", 3000, 9000),
    (5, "Gewerbe", "Neubau", "luft", False, "gemischt", 600, 3000),
    (3, "Industrie", "Ersatz_WE", "luft", False, "Luft", 1000, 4000),
    (2, "Restaurant", "Sanierung", "luft", False, "HK", 250, 600),
    (2, "Hotel", "Sanierung", "sole", True, "gemischt", 1200, 3500),
    (1, "Werkstatt", "Ersatz_WE", "luft", False, "Luft", 300, 800),
    (1, "Schwimmhalle", "Neubau", "sole", True, "gemischt", 800, 2000),
]

_STRASSEN = [
    "Rebweg", "Sonnenhalde", "Lindenstrasse", "Bachwiesenweg", "Zelgliweg", "Weinbergstrasse",
    "Rosenaustrasse", "Feldblumenweg", "Buchenweg", "Steinackerstrasse", "Bergstrasse", "Im Loo",
    "Im Grund", "Alte Landstrasse", "Industriestrasse", "Hauptstrasse", "Schulhausstrasse",
    "Mühleweg", "Dorfstrasse", "Wiesentalstrasse", "Eichenweg", "Am Giessen", "Rütiweg",
    "Talackerstrasse", "Neuwiesenweg", "Kirchgasse", "Zürcherstrasse", "Bahnhofstrasse",
    "Gewerbering", "Panoramaweg",
]
_ORTE = [
    "Winterthur", "Elgg", "Effretikon", "Frauenfeld", "Zürich", "Wil", "Seuzach", "Andelfingen",
    "Kloten", "Uster", "Turbenthal", "Pfungen", "Dübendorf", "Wetzikon", "Bülach", "Schaffhausen",
]

# Wärmeleistungs-Dichte W/m² (Neubau gut gedämmt, Bestand höher)
_W_M2 = {"Neubau": (28, 42), "Sanierung": (45, 65), "Ersatz_WE": (45, 65)}
# 243-Verteilung: Basis CHF/m² (bei 300 m²) und log-Steigung (Degression)
_K243 = {"Neubau": (100.0, -0.06), "Sanierung": (52.0, -0.04), "Ersatz_WE": (18.0, -0.08)}
# Rohrmeter je m² EBF
_ROHR_M2 = {"Neubau": (0.28, 0.33), "Sanierung": (0.07, 0.11), "Ersatz_WE": (0.02, 0.05)}


def _runde(x, auf):
    return round(x / auf) * auf


def _projekt(rng, adresse, nutzung, projektart, wp_typ, erdsonden, abgabe, ebf_von, ebf_bis):
    noise = lambda: rng.uniform(0.94, 1.06)

    # log-gleichverteilte Grösse (kleine Projekte häufiger, wie real)
    import math
    ebf = _runde(math.exp(rng.uniform(math.log(ebf_von), math.log(ebf_bis))), 5)
    w_m2 = rng.uniform(*_W_M2[projektart])
    kw = max(6.0, round(ebf * w_m2 / 1000))
    if nutzung == "EFH":
        ne = 1
    elif nutzung == "MFH":
        ne = max(2, round(ebf / 110))
    else:
        ne = max(1, round(ebf / 400))
    datum = date(2020, 3, 1) + timedelta(days=rng.randint(0, (date(2026, 6, 1) - date(2020, 3, 1)).days))

    bkp = {}
    bohrmeter = None
    if erdsonden:
        bohrmeter = round(kw * rng.uniform(15.5, 17.5))
        bkp["241"] = _runde(bohrmeter * rng.uniform(92, 108), 100)
    # 242: 2400 CHF/kW bei 10 kW, Degression Exponent -0.18 (grösser = günstiger
    # pro kW), eingeklemmt auf 1250–2550 (Kleinstanlagen sonst über dem Band)
    kennwert_242 = min(2550.0, max(1250.0, 2400 * (kw / 10) ** -0.18 * noise()))
    bkp["242"] = _runde(kw * kennwert_242, 100)
    basis_243, steigung_243 = _K243[projektart]
    bkp["243"] = _runde(ebf * basis_243 * (ebf / 300) ** steigung_243 * noise(), 100)
    if rng.random() < 0.6:
        bkp["247"] = _runde(ebf * rng.uniform(4, 7), 100)
    bkp["248"] = _runde(ebf * rng.uniform(9.5, 12.5), 100)
    zwischentotal = sum(bkp.values())
    bkp["249"] = _runde(zwischentotal * rng.uniform(0.055, 0.09), 100)

    rohrmeter = round(ebf * rng.uniform(*_ROHR_M2[projektart]))
    hk_anzahl = round(ebf / rng.uniform(13, 17)) if abgabe == "HK" else None
    ist_bestand = projektart in ("Sanierung", "Ersatz_WE")
    # BWW-Schnittstelle: bei Wohn-Neubauten meistens Teil der Heizung,
    # bei Bestand/Nichtwohnen seltener (weiches Ähnlichkeits-Kriterium).
    ist_wohnen = nutzung in ("MFH", "EFH")
    bww_quote = 0.6 if (ist_wohnen and projektart == "Neubau") else (0.35 if ist_wohnen else 0.2)

    return {
        "name": f"{BEISPIEL_PREFIX}{nutzung} {adresse}",
        "nutzung": nutzung, "projektart": projektart, "wp_typ": wp_typ,
        "abgabe_dominant": abgabe, "hat_erdsonden": erdsonden, "anzahl_ne": ne,
        "ebf_m2": ebf, "leistung_kw": kw, "datum_abrechnung": datum,
        "bohrmeter": bohrmeter, "rohrmeter": rohrmeter, "hk_anzahl": hk_anzahl,
        "verteiler_abgaenge": min(8, 2 + round(kw / 12)),
        "weiterbetrieb_umbau": ist_bestand and rng.random() < 0.35,
        "etappierung": ist_bestand and rng.random() < 0.2,
        "bww_bei_heizung": rng.random() < bww_quote,
        # Rabatt/Skonto des Unternehmers (macht Brutto≠Netto sichtbar) —
        # die bkp-Beträge sind die Brutto-Summe des Leistungsverzeichnisses.
        "rabatt_pct": round(rng.uniform(3, 12), 1),
        "skonto_pct": 2.0,
        "bkp": bkp,
    }


def _generiere():
    rng = random.Random(42)
    adressen = [f"{s} {rng.randint(1, 48)}, {o}" for s in _STRASSEN for o in _ORTE]
    rng.shuffle(adressen)
    projekte = []
    for anzahl, nutzung, projektart, wp, sonden, abgabe, von, bis in _SEGMENTE:
        for _ in range(anzahl):
            projekte.append(_projekt(rng, adressen.pop(), nutzung, projektart, wp, sonden, abgabe, von, bis))
    return projekte


BEISPIEL_PROJEKTE = _generiere()
