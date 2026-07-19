"""Grobkostenschätzung (BKP) — Berechnungskern.

Reine Funktionen (Dicts/Listen rein, Dicts/Zahlen raus, kein DB-Zugriff), damit
jede Formel isoliert mit pytest testbar ist. Die Schätzung läuft im Projekt und
rechnet auf den Referenzprojekten der Auswertung; der Router übersetzt die
Auswertungs-Daten (siehe hc_grobkostenschaetzung.py::_ref_to_calc_dict).

Ausgabe auf Ebene der BKP-EINZELPOSITIONEN (Norm-Leistungsverzeichnis, Dominic
2026-07-14) statt Gruppen-Summen. Kernidee gegen die frühere Überschätzung:
**eine Position, die in einer Referenz fehlt, zählt als 0 Franken** — sie kostete
in jenem Projekt real nichts, ist nicht «unbekannt». Dadurch bekommen selten
vorkommende Positionen einen tiefen Mittelwert statt hochgerechnet zu werden, und
die Summe aller Positionen bleibt in der Grössenordnung der Referenz-Totale.

Ablauf:
1. Ähnlichkeitssuche (Hard-Filter + Score + Zeitgewicht) — unverändert.
2. Je Position: gewichteter Kennwert (Betrag ÷ Bezugsgrösse) über ALLE
   Segment-Referenzen, fehlende Position = 0 → × Bezugsgrösse des Zielprojekts.
3. Korrekturfaktoren (Sanierung/Weiterbetrieb/Etappierung) und Baupreisindex.
"""
import math
from datetime import date
from typing import Optional

from app.calculations.kostenschaetzung import index_faktor  # Baupreisindex — gleiche Logik wie im alten System
from app.data.bkp_positionen import BKP_GRUPPEN, filter_positionen, treiber_fuer_bkp

WOHNNUTZUNGEN = {"MFH", "EFH"}
BKP_GRUPPEN_ALLE = ["241", "242", "243", "247", "248", "249"]

# Die Bezugsgrösse einer Position (aus treiber_fuer_bkp) → Feld im Zielprojekt/
# in der Referenz, plus Anzeige-Einheit des Kennwerts.
_TREIBER_ZIEL_FELD = {"bohrmeter": "bohrmeter", "kw": "leistung_kw", "einheiten": "hk_anzahl", "ebf": "ebf_m2"}
_TREIBER_EINHEIT = {"bohrmeter": "CHF/m", "kw": "CHF/kW", "einheiten": "CHF/Stk", "ebf": "CHF/m² EBF"}
# Rückfall, wenn das Zielprojekt die eigentliche Bezugsgrösse nicht kennt
# (z.B. Bohrmeter/Heizkörper nicht angegeben) — kW und EBF sind Pflichteingaben.
_TREIBER_FALLBACK = {"bohrmeter": "kw", "einheiten": "ebf"}
# Wärmepumpen-Art im Rechenkern ("sole"/"luft"/"wasser") → Schlüssel im Katalog.
_WP_KATALOG = {"sole": "sole_wasser", "luft": "luft_wasser", "wasser": "wasser_wasser"}


# ── Zeitgewicht ──────────────────────────────────────────────────────────────

def zeitgewicht(alter_jahre: float, halbwertszeit_jahre: float = 3.0) -> float:
    """Exponentieller Zerfall: neuere Referenzen zählen mehr. Bei
    Halbwertszeit 3.0 Jahre: 3 Jahre alt → 0.5, heute (0 Jahre) → 1.0."""
    if alter_jahre < 0:
        alter_jahre = 0.0
    lam = math.log(2) / halbwertszeit_jahre
    return math.exp(-lam * alter_jahre)


def alter_in_jahren(datum_abrechnung: date, heute: Optional[date] = None) -> float:
    heute = heute or date.today()
    return (heute - datum_abrechnung).days / 365.25


# ── Ähnlichkeitssuche ───────────────────────────────────────────────────────

def hard_filter(kandidat: dict, ziel: dict) -> bool:
    """Muss identisch sein, sonst scheidet die Referenz aus: Wärmepumpen-Art,
    Projektart, Erdsonden ja/nein."""
    return (
        kandidat.get("wp_typ") == ziel.get("wp_typ")
        and kandidat.get("projektart") == ziel.get("projektart")
        and bool(kandidat.get("hat_erdsonden")) == bool(ziel.get("hat_erdsonden"))
    )


def groessennaehe(a: Optional[float], b: Optional[float]) -> float:
    """Verhältnis min/max, 1.0 bei Gleichheit — log-skalenfreundlich: 50 vs.
    100 ist gleich "nah" wie 100 vs. 200."""
    if not a or not b or a <= 0 or b <= 0:
        return 0.0
    return min(a, b) / max(a, b)


def nutzungsnaehe(a: str, b: str) -> float:
    """Gleiche Nutzung 1.0, beides Wohnen (MFH↔EFH) 0.5, sonst 0.0 —
    ein Spital-Kennwert sagt über ein EFH praktisch nichts aus."""
    if a == b:
        return 1.0
    if a in WOHNNUTZUNGEN and b in WOHNNUTZUNGEN:
        return 0.5
    return 0.0


def abgabetyp_naehe(a: str, b: str) -> float:
    """Gleiche Wärmeabgabe 1.0, wenn eine Seite "gemischt" ist 0.5, sonst 0.2."""
    if a == b:
        return 1.0
    if a == "gemischt" or b == "gemischt":
        return 0.5
    return 0.2


def bww_naehe(a, b) -> float:
    """Brauchwarmwasser-Schnittstelle (in den Heizungs-Kosten enthalten oder
    beim Sanitär?). Bewusst WEICH, kein Hard-Filter: ein sonst sehr ähnliches
    Projekt mit anderer Schnittstelle bleibt brauchbar, rutscht nur leicht nach
    hinten. Unbekannt (None) ist neutral."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.5
    return 1.0 if bool(a) == bool(b) else 0.0


def aehnlichkeits_score(kandidat: dict, ziel: dict) -> float:
    """Gewichtete Summe (0..1) der weichen Ähnlichkeits-Merkmale."""
    return (
        0.30 * groessennaehe(kandidat.get("ebf_m2"), ziel.get("ebf_m2"))
        + 0.25 * groessennaehe(kandidat.get("leistung_kw"), ziel.get("leistung_kw"))
        + 0.20 * nutzungsnaehe(kandidat.get("nutzung"), ziel.get("nutzung"))
        + 0.15 * abgabetyp_naehe(kandidat.get("abgabe_dominant"), ziel.get("abgabe_dominant"))
        + 0.10 * bww_naehe(kandidat.get("bww_bei_heizung"), ziel.get("bww_bei_heizung"))
    )


def finde_referenzen(kandidaten: list, ziel: dict, top_n: Optional[int] = 5, heute: Optional[date] = None) -> list:
    """Hard-Filter → Score → ×Zeitgewicht = Rang. Absteigend sortiert; top_n=None
    liefert das ganze Segment (alle Hard-Filter-Treffer). Referenz ohne
    Abrechnungsdatum (Altbestand) wird zeitlich neutral gewichtet (1.0) statt
    abzustürzen."""
    gefiltert = [k for k in kandidaten if hard_filter(k, ziel)]
    angereichert = []
    for k in gefiltert:
        score = aehnlichkeits_score(k, ziel)
        datum = k.get("datum_abrechnung")
        gewicht = zeitgewicht(alter_in_jahren(datum, heute)) if datum else 1.0
        rang = score * gewicht
        angereichert.append({**k, "score": round(score, 4), "zeitgewicht": round(gewicht, 4), "rang": round(rang, 4)})
    angereichert.sort(key=lambda r: r["rang"], reverse=True)
    return angereichert[:top_n] if top_n else angereichert


def perzentil(werte: list, q: float) -> float:
    """Linear interpoliertes Perzentil (für die Bandbreite P25–P75)."""
    v = sorted(werte)
    if not v:
        return 0.0
    pos = (len(v) - 1) * q
    lo = math.floor(pos)
    rest = pos - lo
    return v[lo] + rest * (v[lo + 1] - v[lo]) if lo + 1 < len(v) else v[lo]


# ── Korrekturfaktoren ────────────────────────────────────────────────────────

def wende_korrekturfaktoren_an(betrag: float, ziel: dict, faktoren: list) -> dict:
    """Multipliziert der Reihe nach alle zutreffenden, aktiven Korrekturfaktoren.
    faktoren: [{"name": "Sanierung", "faktor": 1.2, "aktiv": True}, ...]."""
    zuordnung = {
        "Sanierung": ziel.get("projektart") == "Sanierung",
        "Weiterbetrieb": bool(ziel.get("weiterbetrieb_umbau")),
        "Etappierung": bool(ziel.get("etappierung")),
    }
    ergebnis = betrag
    angewendet = []
    for f in faktoren:
        if not f.get("aktiv", True):
            continue
        if zuordnung.get(f["name"]):
            ergebnis *= f["faktor"]
            angewendet.append(f"{f['name']} ×{f['faktor']}")
    return {"betrag": ergebnis, "angewendet": angewendet}


# ── Baupreisindex ────────────────────────────────────────────────────────────

def skaliere_auf_baupreisindex(referenzen: list, bauindex_eintraege: list, heute: Optional[date] = None) -> list:
    """Skaliert die Positions-Beträge jeder Referenz aufs heutige Preisniveau
    (Index heute ÷ Index zum Abrechnungsdatum) — VOR der Schätzung. Der Faktor
    bleibt je Referenz als `index_faktor` sichtbar (Erklärung)."""
    heute = heute or date.today()
    out = []
    for r in referenzen:
        f = index_faktor(r.get("datum_abrechnung"), heute, bauindex_eintraege)
        out.append({
            **r,
            "index_faktor": round(f, 4),
            "positionen": {nr: v * f for nr, v in (r.get("positionen") or {}).items()},
        })
    return out


# ── Schätzung je Einzelposition ──────────────────────────────────────────────

def _vertrauen_aus_abdeckung(abdeckung: int) -> str:
    """Wie viele der passenden Referenzen hatten diese Position überhaupt?
    Je mehr, desto verlässlicher der Kennwert."""
    if abdeckung >= 4:
        return "hoch"
    if abdeckung >= 2:
        return "mittel"
    if abdeckung == 1:
        return "niedrig"
    return "keine Daten"


def _effektiver_treiber(bkp_nr: str, ziel: dict) -> str:
    """Bezugsgrösse einer Position — oder Rückfall, wenn das Zielprojekt sie
    nicht kennt (z.B. Bohrmeter nicht angegeben)."""
    t = treiber_fuer_bkp(bkp_nr)
    feld = _TREIBER_ZIEL_FELD[t]
    wert = ziel.get(feld)
    if wert and wert > 0:
        return t
    return _TREIBER_FALLBACK.get(t, t)


def schaetze_position(pos: dict, segment: list, ziel: dict) -> dict:
    """Eine BKP-Einzelposition schätzen: gewichteter Kennwert (Betrag ÷
    Bezugsgrösse) über ALLE Segment-Referenzen — Referenz ohne diese Position
    zählt mit 0 — × Bezugsgrösse des Zielprojekts."""
    bkp_nr = pos["bkp_nr"]
    treiber = _effektiver_treiber(bkp_nr, ziel)
    feld = _TREIBER_ZIEL_FELD[treiber]
    ziel_treiber = ziel.get(feld)

    kennwerte, gewichte = [], []
    abdeckung = 0  # Referenzen, die diese Position tatsächlich hatten (>0)
    for r in segment:
        drv = r.get(feld)
        if not drv or drv <= 0:
            continue  # Referenz ohne diese Bezugsgrösse — nicht normierbar
        betrag = (r.get("positionen") or {}).get(bkp_nr) or 0.0
        kennwerte.append(betrag / drv)
        gewichte.append(r.get("rang", 1.0) or 0.0)
        if betrag > 0:
            abdeckung += 1

    basis = {
        "bkp_nr": bkp_nr, "bezeichnung": pos["bezeichnung"], "gruppe_nr": pos["gruppe_nr"],
        "einheit": _TREIBER_EINHEIT[treiber], "kennwert": 0.0, "betrag": 0.0,
        "abdeckung": abdeckung, "n_referenzen": len(kennwerte),
        "vertrauen": _vertrauen_aus_abdeckung(abdeckung), "ziel_treiber": ziel_treiber,
        "bandbreite": None,
    }
    sw = sum(gewichte)
    if not kennwerte or sw <= 0 or not ziel_treiber or ziel_treiber <= 0:
        return basis

    kennwert = sum(k * g for k, g in zip(kennwerte, gewichte)) / sw
    betrag = kennwert * ziel_treiber
    lo = perzentil(kennwerte, 0.25) * ziel_treiber
    hi = perzentil(kennwerte, 0.75) * ziel_treiber
    basis.update({
        "kennwert": kennwert, "betrag": betrag,
        "bandbreite": (min(lo, betrag), max(hi, betrag)),
    })
    return basis


# ── Orchestrierung ───────────────────────────────────────────────────────────

def berechne_grobkostenschaetzung(ziel: dict, referenzen_roh: list, faktoren: list,
                                  bauindex_eintraege: Optional[list] = None,
                                  heute: Optional[date] = None) -> dict:
    """Hauptfunktion: Zielprojekt-Eckdaten (`ziel`), alle Referenzprojekte
    (`referenzen_roh`, je mit `positionen`={bkp_nr: betrag} und
    `datum_abrechnung`) und die aktiven Korrekturfaktoren rein — Schätzung je
    BKP-Einzelposition, gruppiert, mit Gesamttotal raus. Der Router ruft die
    Funktion zweimal (Referenz-Brutto vs. -Netto) für den Brutto/Netto-Umschalter."""
    baupreisindex_aktiv = bool(ziel.get("baupreisindex_beruecksichtigen")) and bool(bauindex_eintraege)
    if baupreisindex_aktiv:
        referenzen_roh = skaliere_auf_baupreisindex(referenzen_roh, bauindex_eintraege, heute)

    segment = finde_referenzen(referenzen_roh, ziel, top_n=None, heute=heute)
    top = segment[:5]

    korr = wende_korrekturfaktoren_an(1.0, ziel, faktoren)
    faktor = korr["betrag"]  # gemeinsamer Multiplikator für alle Positionen

    positionen = filter_positionen(_WP_KATALOG.get(ziel.get("wp_typ")), ziel.get("nutzung"))

    gruppen_map = {}
    for pos in positionen:
        e = schaetze_position(pos, segment, ziel)
        if faktor != 1.0 and e["betrag"]:
            e["betrag"] *= faktor
            if e["bandbreite"]:
                e["bandbreite"] = (e["bandbreite"][0] * faktor, e["bandbreite"][1] * faktor)
        g = gruppen_map.setdefault(e["gruppe_nr"], {"gruppe_nr": e["gruppe_nr"],
                                                    "name": BKP_GRUPPEN.get(e["gruppe_nr"], ""),
                                                    "positionen": [], "betrag": 0.0})
        g["positionen"].append(e)
        g["betrag"] += e["betrag"]

    gruppen = [gruppen_map[nr] for nr in BKP_GRUPPEN_ALLE if nr in gruppen_map]
    gesamt_betrag = sum(g["betrag"] for g in gruppen)

    return {
        "gesamt_betrag": gesamt_betrag,
        "gruppen": gruppen,
        "korrekturfaktoren": korr["angewendet"],
        "referenzen_gefunden": len(top),
        "referenzen_im_segment": len(segment),
        "baupreisindex_aktiv": baupreisindex_aktiv,
        "referenzen_verwendet": top,
    }
