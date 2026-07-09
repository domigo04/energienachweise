"""Kostenschätzung — harte Fix-Kriterien-Filter + ähnlichkeitsgewichtete
Kennwerte aus den verbleibenden Referenzprojekten (Dominic-Vorgabe 2026-07-09).

**Harte Fix-Kriterien (kein Vergleich von Birnen mit Äpfeln):** Projektart,
Gebäudetyp, Zertifizierung, Wärmeerzeuger (exakt gleiches Set) und — ausser
für die Erzeugungs-Positionen (241/242) — Ausbauumfang müssen zwischen
Eingabe und Referenz EXAKT übereinstimmen, sonst zählt die Referenz für diese
BKP-Position gar nicht erst (siehe harte_kriterien_erfuellt). Erst innerhalb
der so gefilterten Kandidaten wird nach Ähnlichkeit (Anlagenkonfiguration,
Wärmeabgabe, Bezugsgrössen-Verhältnis) gewichtet.

**System-spezifische Positionen (Wärmeabgabe, z.B. FBH vs. Heizkörper):**
Zusätzlich muss die Referenz dasselbe Abgabesystem haben. Gibt es unter den
fix-gefilterten Referenzen keine mit passendem System, wird auf JEDES
ausgewertete Projekt mit passendem System ausgewichen (unabhängig von den
Fix-Kriterien) — mit Hinweis. Gibt es gar keins, wird die Position ganz
weggelassen (keine Schätzung mit falscher Grundlage).

Anlagenkonfiguration (monovalent/bivalent/hybrid/kaskadiert/redundant) bleibt
ein separater starker Ähnlichkeits-Faktor. Für die Komplexitäts-Positionen
(KOMPLEXITAETS_BKP: Regelung, Armaturen, Schaltschrank, Koordination) darf ein
monovalentes Referenzprojekt NICHT wie ein Volltreffer zählen — siehe
Fallback+Zuschlag-Logik in berechne_kostenschaetzung().
"""
import math
from datetime import date
from typing import Optional

from app.data.bkp_positionen import BKP_POSITIONEN, KOMPLEXITAETS_BKP, TREIBER_LABEL, treiber_fuer_bkp

_BKP_NAME = {p["bkp_nr"]: p["bezeichnung"] for p in BKP_POSITIONEN}
_BKP_WP = {p["bkp_nr"]: p["wp_typen"] for p in BKP_POSITIONEN}
_DRIVER_FIELD = {"ebf": "ebf", "kw": "heizleistung_kw", "einheiten": "anzahl_einheiten", "bohrmeter": "bohrmeter"}

# Wärmeerzeuger-Label → WP-Typ im BKP-Katalog
_ERZEUGER_WP = {"Erdsonden-WP": "sole_wasser", "Luft/Wasser-WP": "luft_wasser", "Wasser/Wasser-WP": "wasser_wasser"}

# Grobe, nicht empirisch hergeleitete Komplexitätszuschläge — nur für den Fall,
# dass keine echten Referenzen mit passender Anlagenkonfiguration vorhanden
# sind. Überschreibbar/verbesserbar, sobald echte bivalente/hybride Referenzen
# einfliessen (dann greift die normale Kennwert-Rechnung statt des Zuschlags).
_KONFIG_ZUSCHLAG = {"bivalent": 0.20, "hybrid": 0.25, "kaskadiert": 0.10, "redundant": 0.08}
_KONFIG_ZUSCHLAG_DEFAULT = 0.15


def bkp_relevant(bkp_nr: str, waermeerzeuger, waermeabgabe) -> bool:
    """Gehört diese BKP-Position zu den gewählten Systemen? Verhindert z.B., dass
    die Luft/Wasser-WP (242.4) in einer Erdsonden-Schätzung mitzählt."""
    abg = set(waermeabgabe or [])
    gruppe = bkp_nr.split(".")[0]
    if gruppe in ("241", "242"):
        wp = _BKP_WP.get(bkp_nr)
        if wp is None:
            return True  # gilt für alle (Expansion, Montage)
        gewaehlt = {_ERZEUGER_WP[e] for e in (waermeerzeuger or []) if e in _ERZEUGER_WP}
        return bool(gewaehlt & set(wp))
    if bkp_nr.startswith("243.2"):  # Heizkörper
        return "Heizkörper" in abg
    if bkp_nr == "243.3a":  # Flächenheizung Boden
        return bool(abg & {"FBH", "Wandheizung"})
    if bkp_nr == "243.3b":  # Deckenstrahlplatten
        return "Deckenstrahlplatten" in abg
    if bkp_nr.startswith("243.4"):  # Luftheizapparate
        return "Lufterhitzer" in abg
    return True


# BKP-Gruppen, in denen ein Referenzprojekt mit Ausbauumfang "nur Erzeugung"
# trotzdem zählen darf, auch wenn das Zielprojekt einen anderen Ausbauumfang
# hat — es hat ja ohnehin nur Erzeugungs-Kosten erfasst (Dominic: "dann kann
# man die Kosten von der Erzeugung mit einnehmen, die anderen BKPs von einem
# anderen Projekt").
_AUSBAUUMFANG_AUSNAHME_GRUPPEN = ("241", "242")

# BKP-Präfixe, deren Zuordnung von der Wärmeabgabe abhängt (siehe bkp_relevant) —
# dort muss die Referenz zusätzlich zu den Fix-Kriterien dasselbe Abgabesystem
# haben, sonst zählt sie für GENAU DIESE Position nicht.
_ABGABE_SPEZIFISCHE_PRAEFIXE = ("243.2", "243.3", "243.4")

_HARTE_KRITERIEN_FELDER = ("projektart", "gebaeudetyp", "zertifizierung")


def ist_abgabe_spezifisch(bkp_nr: str) -> bool:
    return bkp_nr.startswith(_ABGABE_SPEZIFISCHE_PRAEFIXE)


def harte_kriterien_erfuellt(inp: dict, ref: dict, ausbauumfang_pflicht: bool = True) -> bool:
    """Fix-Kriterien: Projektart, Gebäudetyp, Zertifizierung, Wärmeerzeuger
    (exakt gleiches Set) müssen übereinstimmen; Ausbauumfang nur, wenn
    `ausbauumfang_pflicht` (für BKP-Gruppen 241/242 ausgenommen)."""
    for feld in _HARTE_KRITERIEN_FELDER:
        if inp.get(feld) != ref.get(feld):
            return False
    if ausbauumfang_pflicht and inp.get("ausbauumfang") != ref.get("ausbauumfang"):
        return False
    if set(inp.get("waermeerzeuger") or []) != set(ref.get("waermeerzeuger") or []):
        return False
    return True


def ist_monovalent(konfig: Optional[str]) -> bool:
    """Fehlt die Anlagenkonfiguration (Altdaten vor diesem Feature), gilt sie
    als monovalent — der häufigste Fall, bricht keine bestehenden Referenzen."""
    return (konfig or "monovalent") == "monovalent"


def konfiguration_kompatibilitaet(a: Optional[str], b: Optional[str]) -> float:
    """Anlagenkonfiguration als sehr starker Ähnlichkeits-Faktor: exakte
    Übereinstimmung zählt voll (1.0), monovalent gegen eine Mehrfach-Erzeuger-
    Anlage (bivalent/hybrid/kaskadiert/redundant) fast nichts (0.05 — harter
    Bruch), zwei unterschiedliche Mehrfach-Konfigurationen liegen dazwischen
    (0.5 — sich ähnlicher als monovalent, aber kein Volltreffer)."""
    a, b = a or "monovalent", b or "monovalent"
    if a == b:
        return 1.0
    if ist_monovalent(a) != ist_monovalent(b):
        return 0.05
    return 0.5


def ratio_similarity(a: Optional[float], b: Optional[float]) -> float:
    """Ähnlichkeit zweier Grössen über ihr Verhältnis: 1.0 gleich, →0 je weiter
    auseinander. Fehlt ein Wert → neutral 0.5."""
    if not a or not b or a <= 0 or b <= 0:
        return 0.5
    return math.exp(-abs(math.log(a / b)))


def jaccard(a, b) -> float:
    """Mengen-Überlappung |∩| / |∪| (für mehrere Erzeuger/Abgaben). Beide leer → 1.0."""
    sa, sb = set(a or []), set(b or [])
    if not sa and not sb:
        return 1.0
    union = sa | sb
    return (len(sa & sb) / len(union)) if union else 1.0


def index_faktor(ref_datum: Optional[date], ziel_datum: Optional[date], eintraege) -> float:
    """Baupreisindex-Verhältnis Ziel-/Referenzperiode (jeweils die nächstliegende
    hinterlegte Periode). Ohne Einträge oder Datum keine Anpassung (1.0)."""
    if not eintraege or not ref_datum or not ziel_datum:
        return 1.0

    def naechster_wert(datum):
        return min(eintraege, key=lambda e: abs((e["periode"] - datum).days))["wert"]

    ref_wert = naechster_wert(ref_datum)
    ziel_wert = naechster_wert(ziel_datum)
    return (ziel_wert / ref_wert) if ref_wert else 1.0


def _index_angepasste_refs(refs: list, eintraege, aktiv: bool) -> list:
    """Skaliert die Kosten jeder Referenz auf heutiges Preisniveau, wenn das
    Baupreisindex-Häkchen gesetzt ist und Indexwerte vorhanden sind."""
    if not aktiv or not eintraege:
        return refs
    heute = date.today()
    out = []
    for r in refs:
        faktor = index_faktor(r.get("datum"), heute, eintraege)
        kosten = {nr: betrag * faktor for nr, betrag in (r.get("kosten") or {}).items()}
        out.append({**r, "kosten": kosten})
    return out


def similarity(inp: dict, ref: dict) -> float:
    """Weicher Ähnlichkeitsfaktor 0..1 × Qualitäts-Gewicht — NUR zur Gewichtung
    INNERHALB bereits hart gefilterter Referenzen (harte_kriterien_erfuellt).

    Die 5 Fix-Kriterien (Projektart/Gebäudetyp/Zertifizierung/Ausbauumfang/
    Wärmeerzeuger) sind bewusst NICHT mehr Teil dieser Gewichtung — sie sind
    Pflicht (alles oder nichts), nicht graduell (Dominic-Vorgabe 2026-07-09:
    keine Vermischung von Projekten mit unterschiedlichen Fix-Kriterien).

    Bewusst OHNE Alters-Gewichtung: das Ausschreibungsdatum wirkt sich einzig
    über den separaten Baupreisindex auf die KOSTEN aus (siehe
    _index_angepasste_refs), nicht auf die Ähnlichkeit."""
    score = 0.0
    score += 0.35 * konfiguration_kompatibilitaet(inp.get("anlagenkonfiguration"), ref.get("anlagenkonfiguration"))
    score += 0.25 * jaccard(inp.get("waermeabgabe"), ref.get("waermeabgabe"))
    score += 0.15 * ratio_similarity(inp.get("ebf"), ref.get("ebf"))
    score += 0.15 * ratio_similarity(inp.get("heizleistung_kw"), ref.get("heizleistung_kw"))
    score += 0.06 * ratio_similarity(inp.get("anzahl_einheiten"), ref.get("anzahl_einheiten"))
    score += 0.04 * ratio_similarity(inp.get("bohrmeter"), ref.get("bohrmeter"))
    score = min(score, 1.0)
    q = ref.get("qualitaet")
    q = 1.0 if q is None else q
    return score * q


def effective_n(weights) -> float:
    """Effektive Anzahl Referenzen: (Σw)² / Σw². Viele gleich starke → hoch."""
    s = sum(weights)
    sq = sum(w * w for w in weights)
    return (s * s / sq) if sq else 0.0


def weighted_mean(pairs) -> float:
    """pairs: Liste (wert, gewicht)."""
    sw = sum(w for _, w in pairs)
    return (sum(v * w for v, w in pairs) / sw) if sw else 0.0


def quantile(values, q: float) -> float:
    """Linear interpoliertes Quantil."""
    v = sorted(values)
    if not v:
        return 0.0
    pos = (len(v) - 1) * q
    lo = math.floor(pos)
    rest = pos - lo
    return v[lo] + rest * (v[lo + 1] - v[lo]) if lo + 1 < len(v) else v[lo]


def confidence_from(neff: float) -> str:
    """Validierung nach Anzahl effektiv ähnlicher Referenzen (Dominic-Vorgabe
    2026-07-09): 0–3 → tief, 4–10 → mittel, über 10 → hoch."""
    if neff > 10:
        return "hoch"
    if neff >= 4:
        return "mittel"
    return "tief"


_BAND = {"hoch": 0.12, "mittel": 0.22, "tief": 0.35}
_CONF_SCORE = {"hoch": 3, "mittel": 2, "tief": 1}


def aehnlichkeit_stufe(gewicht: float) -> str:
    """Ähnlichkeit ist eine ANDERE Frage als Vertrauen/Validierung: sie fragt
    nur «wie gut passt die BESTE Referenz?», unabhängig davon, wie viele
    Referenzen insgesamt vorhanden sind. Ein einzelner Volltreffer kann darum
    hohe Ähnlichkeit UND gleichzeitig tiefe Validierung haben (siehe
    confidence_from — die bewertet die Menge/Übereinstimmung, nicht die Güte
    des besten Treffers)."""
    if gewicht >= 0.65:
        return "hoch"
    if gewicht >= 0.4:
        return "mittel"
    return "tief"


def _driver_value(obj: dict, driver: str) -> float:
    return obj.get(_DRIVER_FIELD[driver]) or 0.0


def berechne_kostenschaetzung(inp: dict, referenzen: list, bauindex_eintraege: list = None) -> dict:
    """Hauptfunktion. inp: Eingaben; referenzen: Ref-Dicts mit 'kosten' (bkp_nr →
    betrag). Gibt Total + Bandbreite + Vertrauen + Zeilen + Diagrammdaten +
    ähnlichste Referenzen zurück.

    bauindex_eintraege ist optional (Liste von {"periode": date, "wert": float});
    nur aktiv, wenn inp["baupreisindex_beruecksichtigen"] wahr ist.

    Ablauf je BKP-Position: 1) harte Fix-Kriterien filtern die Kandidaten
    (mit Ausbauumfang-Ausnahme für Erzeugungs-Positionen), 2) bei System-
    spezifischen Positionen (Wärmeabgabe) zusätzlich exakt passendes System
    verlangen, sonst Fallback auf JEDE Referenz mit passendem System
    (Hinweis) oder Position weglassen, 3) innerhalb der Kandidaten nach
    similarity() gewichten."""
    verwende_bauindex = bool(inp.get("baupreisindex_beruecksichtigen"))
    referenzen = _index_angepasste_refs(referenzen, bauindex_eintraege, verwende_bauindex)

    # Global (ausbauumfang_pflicht=True) für die "ähnlichste Referenz"-Übersicht —
    # dieselben Fix-Kriterien wie für eine normale (nicht Erzeugungs-)Position.
    refs_streng = sorted(
        ({**r, "_w": max(similarity(inp, r), 0.02)} for r in referenzen if harte_kriterien_erfuellt(inp, r)),
        key=lambda r: r["_w"], reverse=True,
    )
    refs_ohne_ausbau = [{**r, "_w": max(similarity(inp, r), 0.02)} for r in referenzen
                        if harte_kriterien_erfuellt(inp, r, ausbauumfang_pflicht=False)]
    refs_alle = [{**r, "_w": max(similarity(inp, r), 0.02)} for r in referenzen]

    bkp_nrs = sorted({nr for r in referenzen for nr in (r.get("kosten") or {})})
    ziel_konfig = inp.get("anlagenkonfiguration")
    ziel_ist_monovalent = ist_monovalent(ziel_konfig)

    rows, boxplot, conf_scores = [], [], []
    total = low_total = high_total = 0.0

    for nr in bkp_nrs:
        if not bkp_relevant(nr, inp.get("waermeerzeuger"), inp.get("waermeabgabe")):
            continue  # gehört nicht zu den gewählten Systemen
        driver = treiber_fuer_bkp(nr)
        dv_in = _driver_value(inp, driver)
        if dv_in <= 0:
            continue  # ohne passende Bezugsgrösse (z.B. kein Bohrmeter) nicht schätzbar

        gruppe = nr.split(".")[0]
        basis = refs_ohne_ausbau if gruppe in _AUSBAUUMFANG_AUSNAHME_GRUPPEN else refs_streng
        kandidaten = [r for r in basis if bkp_relevant(nr, r.get("waermeerzeuger"), r.get("waermeabgabe"))]

        fallback_hinweis = None
        if not kandidaten and ist_abgabe_spezifisch(nr):
            # Kein fix-kriterien-konformes Projekt mit passendem Abgabesystem —
            # auf JEDES ausgewertete Projekt mit passendem System ausweichen.
            kandidaten = [r for r in refs_alle if bkp_relevant(nr, r.get("waermeerzeuger"), r.get("waermeabgabe"))]
            if kandidaten:
                fallback_hinweis = (
                    f"Kein Referenzprojekt mit identischen Fix-Kriterien (Projektart/Gebäudetyp/"
                    f"Ausbauumfang/Zertifizierung/Wärmeerzeuger) UND passendem Abgabesystem vorhanden — "
                    f"Basis aus {len(kandidaten)} anderen Projekten mit demselben Abgabesystem, "
                    f"aber abweichenden Fix-Kriterien."
                )
        if not kandidaten:
            continue  # weder fix-konform noch System-Fallback möglich → Position weglassen

        # Komplexitäts-Positionen (Regelung/Armaturen/Schaltschrank/Koordination):
        # bei einem nicht-monovalenten Zielprojekt zuerst nur mit ebenfalls nicht-
        # monovalenten Referenzen rechnen. Bauteil-Positionen bleiben unverändert
        # (monovalente Referenzen dürfen für Teilbausteine verwendet werden).
        ist_komplexitaet = nr in KOMPLEXITAETS_BKP and not ziel_ist_monovalent
        zuschlag_noetig = False
        if ist_komplexitaet:
            kompatibel = [r for r in kandidaten if not ist_monovalent(r.get("anlagenkonfiguration"))]
            if kompatibel:
                kandidaten = kompatibel
            else:
                zuschlag_noetig = True  # keine passende Referenz → Fallback mit Zuschlag

        pairs = []
        for r in kandidaten:
            betrag = (r.get("kosten") or {}).get(nr)
            dv_ref = _driver_value(r, driver)
            if betrag and betrag > 0 and dv_ref > 0:
                pairs.append((betrag / dv_ref, r["_w"]))
        if not pairs:
            continue

        kennwerte = [v for v, _ in pairs]
        weights = [w for _, w in pairs]
        mean = weighted_mean(pairs)  # roh — bleibt Basis für den Boxplot
        neff = effective_n(weights)
        lo, hi = min(kennwerte), max(kennwerte)

        hinweis = fallback_hinweis
        kennwert_geschaetzt = mean
        if zuschlag_noetig:
            zuschlag = _KONFIG_ZUSCHLAG.get(ziel_konfig, _KONFIG_ZUSCHLAG_DEFAULT)
            kennwert_geschaetzt = mean * (1 + zuschlag)
            conf = "tief"
            hinweis = (
                f"Kein Referenzprojekt mit Konfiguration «{ziel_konfig}» vorhanden — "
                f"Basis aus {len(pairs)} anderen Referenzen + {round(zuschlag * 100)}% "
                f"Komplexitätszuschlag geschätzt."
            )
        else:
            conf = confidence_from(neff)

        band = _BAND[conf]
        estimate = kennwert_geschaetzt * dv_in

        total += estimate
        low_total += estimate * (1 - band)
        high_total += estimate * (1 + band)
        conf_scores.append(_CONF_SCORE[conf])

        rows.append({
            "bkp_nr": nr, "bkp_name": _BKP_NAME.get(nr, ""), "treiber": driver,
            "einheit": TREIBER_LABEL[driver], "kennwert": round(kennwert_geschaetzt, 2),
            "estimate": round(estimate), "low": round(estimate * (1 - band)),
            "high": round(estimate * (1 + band)), "n_eff": round(neff, 2), "confidence": conf,
            "hinweis": hinweis,
        })
        boxplot.append({
            "bkp_nr": nr, "einheit": TREIBER_LABEL[driver], "min": round(lo, 2),
            "q1": round(quantile(kennwerte, 0.25), 2), "median": round(quantile(kennwerte, 0.5), 2),
            "q3": round(quantile(kennwerte, 0.75), 2), "max": round(hi, 2), "mean": round(mean, 2),
        })

    avg = sum(conf_scores) / len(conf_scores) if conf_scores else 0
    overall = "hoch" if avg >= 2.5 else "mittel" if avg >= 1.7 else "tief"

    referenzen_out = [{
        "id": r.get("id"), "name": r.get("name"), "projektart": r.get("projektart"), "gebaeudetyp": r.get("gebaeudetyp"),
        "anlagenkonfiguration": r.get("anlagenkonfiguration") or "monovalent",
        "waermeerzeuger": r.get("waermeerzeuger") or [], "waermeabgabe": r.get("waermeabgabe") or [],
        "ebf": r.get("ebf"), "heizleistung_kw": r.get("heizleistung_kw"), "gewicht": round(r["_w"], 3),
    } for r in refs_streng[:8]]

    # Ähnlichkeit ≠ Vertrauen: wie gut passt die BESTE (fix-kriterien-konforme)
    # Referenz, unabhängig von der Anzahl. Details stehen in referenzen_out[0].
    top_gewicht = refs_streng[0]["_w"] if refs_streng else 0.0
    aehnlichkeit = {"stufe": aehnlichkeit_stufe(top_gewicht), "gewicht": round(top_gewicht, 3)}

    if verwende_bauindex:
        baupreisindex = {
            "aktiv": True,
            "hinweis": None if bauindex_eintraege else
            "Baupreisindex gewünscht, aber noch keine Indexwerte hinterlegt — ohne Anpassung gerechnet.",
        }
    else:
        baupreisindex = {"aktiv": False, "hinweis": None}

    return {
        "total": round(total), "total_low": round(low_total), "total_high": round(high_total),
        "overall_confidence": overall, "aehnlichkeit": aehnlichkeit, "rows": rows, "boxplot": boxplot,
        "referenzen": referenzen_out, "anzahl_referenzen": len(referenzen),
        "baupreisindex": baupreisindex,
    }
