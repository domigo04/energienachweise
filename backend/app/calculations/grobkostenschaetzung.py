"""Grobkostenschätzung (BKP) — Berechnungskern.

Reine Funktionen (Dicts/Listen rein, Dicts/Zahlen raus, kein DB-Zugriff), damit
jede Formel isoliert mit pytest testbar ist. Die Schätzung läuft im Projekt und
rechnet auf den Referenzprojekten der Auswertung; der Router übersetzt die
Auswertungs-Daten (siehe hc_grobkostenschaetzung.py::_ref_to_calc_dict).

Ausgabe auf Ebene der BKP-EINZELPOSITIONEN (Norm-Leistungsverzeichnis, Dominic
2026-07-14) statt Gruppen-Summen. Fehlende Kostenzeilen sind unbekannte Werte und
dürfen den Kennwert deshalb nicht als fiktive 0 Franken nach unten ziehen.

Ablauf:
1. Ähnlichkeitssuche (Hard-Filter + Score + Zeitgewicht).
2. Je Position: gewichteter Kennwert (Betrag ÷ Bezugsgrösse) nur über
   Referenzen mit einer positiven Kostenangabe → × Bezugsgrösse des Zielprojekts.
3. Korrekturfaktoren (Sanierung/Weiterbetrieb/Etappierung) und Baupreisindex.
"""
import math
from datetime import date
from typing import Optional

from app.calculations.kostenschaetzung import index_faktor  # Baupreisindex — gleiche Logik wie im alten System
from app.data.bkp_positionen import BKP_GRUPPEN, abgabe_klassen_von, filter_positionen, treiber_fuer_bkp
from app.data.waermeerzeuger import erzeuger_signatur_von

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

def zeitgewicht(alter_jahre: float, reduktion_pro_jahr: float = 0.01, minimum: float = 0.90) -> float:
    """SEHR milde Aktualitäts-Reduktion (Dominic 2026-07-19): neuere Referenzen
    zählen nur MINIMAL mehr — die Preis-Teuerung korrigiert bereits der
    Baupreisindex, darum darf das Alter nicht ein zweites Mal stark bestrafen.
    1 % Abzug pro Jahr, nie unter 90 %. Beispiel: 4 Jahre alt → 0.96, heute → 1.0.
    (Früher exponentiell mit Halbwertszeit 3 J. — viel zu streng: 4 Jahre → nur 0.40.)"""
    if alter_jahre < 0:
        alter_jahre = 0.0
    return max(minimum, 1.0 - reduktion_pro_jahr * alter_jahre)


def alter_in_jahren(datum_abrechnung: date, heute: Optional[date] = None) -> float:
    heute = heute or date.today()
    return (heute - datum_abrechnung).days / 365.25


# ── Ähnlichkeitssuche ───────────────────────────────────────────────────────

def _erzeuger_filterwert(projekt: dict):
    signatur = projekt.get("erzeuger_signatur")
    if signatur is None and "waermeerzeuger" in projekt:
        signatur = erzeuger_signatur_von(projekt.get("waermeerzeuger"))
    return signatur


def _erzeuger_gleich(kandidat: dict, ziel: dict) -> bool:
    kandidat_signatur = _erzeuger_filterwert(kandidat)
    ziel_signatur = _erzeuger_filterwert(ziel)
    if kandidat_signatur is not None or ziel_signatur is not None:
        return kandidat_signatur == ziel_signatur
    return kandidat.get("wp_typ") == ziel.get("wp_typ")


def hard_filter(kandidat: dict, ziel: dict) -> bool:
    """Muss EXAKT identisch sein, sonst scheidet die Referenz aus (Dominic
    2026-07-19): Nutzung/Gebäudekategorie, Erzeuger-Kombination, Projektart,
    Erdsonden ja/nein. Die Wärmeabgabe ist bewusst NICHT hier — sie steuert
    nur, welche Kosten-Positionen übernommen werden (siehe schaetze_position).
    Die Signatur präzisiert dabei die bestehende WP-Art: Gas, Öl, Fernwärme und
    Hybridanlagen dürfen nicht gemeinsam unter ``wp_typ=None`` landen."""
    return (
        kandidat.get("nutzung") == ziel.get("nutzung")
        and _erzeuger_gleich(kandidat, ziel)
        and kandidat.get("projektart") == ziel.get("projektart")
        and bool(kandidat.get("hat_erdsonden")) == bool(ziel.get("hat_erdsonden"))
    )


def analysiere_referenzfilter(kandidaten: list, ziel: dict) -> dict:
    """Macht den harten Filter erklärbar, ohne seine Regeln zu verändern.

    Die Einzelzahlen sind unabhängig voneinander: So sieht man auch bei null
    Endtreffern, für welches Merkmal grundsätzlich Daten vorhanden wären.
    """
    return {
        "gesamt": len(kandidaten),
        "nutzung": sum(k.get("nutzung") == ziel.get("nutzung") for k in kandidaten),
        "waermeerzeuger": sum(_erzeuger_gleich(k, ziel) for k in kandidaten),
        "projektart": sum(k.get("projektart") == ziel.get("projektart") for k in kandidaten),
        "erdsonden": sum(
            bool(k.get("hat_erdsonden")) == bool(ziel.get("hat_erdsonden")) for k in kandidaten
        ),
        "alle_kriterien": sum(hard_filter(k, ziel) for k in kandidaten),
    }


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


def zertifizierungs_naehe(a, b) -> float:
    """Gebäudestandard (Minergie, Minergie-P …). Gleiche Zertifizierung 1.0,
    beide unbekannt neutral 1.0, eine unbekannt 0.5, sonst 0.3 — ein höherer
    Standard treibt die Kosten, darum zählen Referenzen mit gleichem Standard
    mehr. Weich, kein Hard-Filter."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.5
    return 1.0 if a == b else 0.3


def einheiten_naehe(a, b) -> float:
    """Anzahl Nutzeinheiten. Beide unbekannt → neutral 1.0, eine unbekannt → 0.5,
    sonst Verhältnis min/max (8 vs. 10 → 0.8). Neutral bei Unbekannt, damit ein
    fehlender Wert die Ähnlichkeit nicht künstlich drückt (wie bei BWW)."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.5
    return min(a, b) / max(a, b)


def _ziel_abgabe_klassen(ziel: dict) -> set:
    """Abgabe-Klassen des Zielprojekts — entweder direkt gesetzt oder aus der
    Wärmeabgabe-Mehrfachauswahl abgeleitet."""
    kl = ziel.get("abgabe_klassen")
    if kl is not None:
        return set(kl)
    return set(abgabe_klassen_von(ziel.get("waermeabgabe")))


def abgabe_naehe(ref_klassen, ziel_klassen) -> float:
    """Wärmeabgabe-Ähnlichkeit — Dominic 2026-07-19: neu ein STARKER eigener
    Score-Faktor (nicht mehr nur Positions-Steuerung). Ein sonst identisches
    Projekt mit ANDERER Abgabe soll sichtbar weniger ähnlich sein, nicht nur
    ein paar Prozent. Und ein Mischsystem (Referenz hat die Ziel-Abgabe PLUS
    weitere) ist verzerrt (Fläche geteilt → CHF/m² zu tief) → Malus.

      gleich (exakt dieselbe(n) Abgabe(n))      → 1.0
      Referenz ist Obermenge (Mischsystem)       → 0.6   (hat Ziel-Abgabe + mehr)
      teilweise Überschneidung                   → 0.45
      komplett andere Abgabe                     → 0.25
      Referenz ohne Angabe                       → 0.5   (neutral-tief)
    """
    ref = set(ref_klassen or [])
    ziel = set(ziel_klassen or [])
    if not ziel:
        return 1.0            # Ziel ohne Abgabe (Pflichtfeld, sollte nicht vorkommen) → neutral
    if not ref:
        return 0.5
    if ref == ziel:
        return 1.0
    if ziel <= ref:
        return 0.6           # Mischsystem: Referenz hat die Ziel-Abgabe UND weitere
    if ref & ziel:
        return 0.45
    return 0.25


def aehnlichkeits_score(kandidat: dict, ziel: dict,
                         waermeabgabe_beruecksichtigen: bool = True) -> float:
    """Gewichtete Summe (0..1) der WEICHEN Ähnlichkeits-Merkmale (Summe = 1.0).
    Nutzung/WP-Art/Projektart/Erdsonden sind HART (raus aus dem Score). Die
    Wärmeabgabe steuert weiterhin die Kosten-Positionen UND ist seit 2026-07-19
    zusätzlich ein starker Score-Faktor (0.20) — sonst wirkte ein Projekt mit
    anderem Abgabesystem fast gleich ähnlich (verwirrend, Dominic)."""
    score = (
        0.25 * groessennaehe(kandidat.get("ebf_m2"), ziel.get("ebf_m2"))
        + 0.22 * groessennaehe(kandidat.get("leistung_kw"), ziel.get("leistung_kw"))
        + 0.13 * zertifizierungs_naehe(kandidat.get("zertifizierung"), ziel.get("zertifizierung"))
        + 0.12 * einheiten_naehe(kandidat.get("anzahl_ne"), ziel.get("anzahl_ne"))
        + 0.08 * bww_naehe(kandidat.get("bww_bei_heizung"), ziel.get("bww_bei_heizung"))
    )
    if waermeabgabe_beruecksichtigen:
        return score + 0.20 * abgabe_naehe(
            kandidat.get("abgabe_klassen"), _ziel_abgabe_klassen(ziel)
        )
    # Bei gemeinsamen Positionen und der Wärmeerzeugung ist die Abgabe fachlich
    # irrelevant. Die verbleibenden Gewichte werden wieder auf 1.0 normiert.
    return score / 0.80


def finde_referenzen(kandidaten: list, ziel: dict, top_n: Optional[int] = 5, heute: Optional[date] = None) -> list:
    """Hard-Filter → Score → ×Zeitgewicht = Rang. Absteigend sortiert; top_n=None
    liefert das ganze Segment (alle Hard-Filter-Treffer). Referenz ohne
    Abrechnungsdatum (Altbestand) wird zeitlich neutral gewichtet (1.0) statt
    abzustürzen."""
    ziel_klassen = _ziel_abgabe_klassen(ziel)
    gefiltert = [k for k in kandidaten if hard_filter(k, ziel)]
    angereichert = []
    for k in gefiltert:
        score = aehnlichkeits_score(k, ziel)
        datum = k.get("datum_abrechnung")
        gewicht = zeitgewicht(alter_in_jahren(datum, heute)) if datum else 1.0
        rang = score * gewicht
        ref_klassen = set(k.get("abgabe_klassen") or [])
        # Flags für die UI-Hinweise an der Referenz (Dominic 2026-07-19):
        abgabe_gleich = ref_klassen == ziel_klassen
        abgabe_mischsystem = bool(ziel_klassen) and ziel_klassen <= ref_klassen and ref_klassen != ziel_klassen
        abgabe_abweichend = bool(ziel_klassen) and not (ziel_klassen <= ref_klassen)
        angereichert.append({
            **k, "score": round(score, 4), "zeitgewicht": round(gewicht, 4), "rang": round(rang, 4),
            "abgabe_gleich": abgabe_gleich, "abgabe_mischsystem": abgabe_mischsystem,
            "abgabe_abweichend": abgabe_abweichend,
        })
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


def _status_datenbasis(abdeckung: int) -> str:
    """Transparenz der Datengrundlage — wie zuverlässig ist diese Position?
    (Dominic 2026-07-20)."""
    if abdeckung == 0:
        return "Keine Angaben"
    if abdeckung == 1:
        return "Einzelfall – nicht belastbar"
    if abdeckung <= 3:
        return "Sehr geringe Datengrundlage"
    if abdeckung <= 7:
        return "Begrenzte Datengrundlage"
    return "Gute Datengrundlage"


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
    Bezugsgrösse) über passende Segment-Referenzen mit positiver Kostenangabe
    × Bezugsgrösse des Zielprojekts.

    Wärmeabgabe-Position (243.2*/3*/4*, `pos["abgabe"]` gesetzt): es zählen NUR
    Referenzen, die genau diese Abgabe hatten (Dominic 2026-07-19). Eine reine
    Heizkörper-Referenz verwässert so den Fussbodenheizungs-Kennwert NICHT auf 0.
    Gemeinsame Positionen (`abgabe` None) mitteln wie bisher über das ganze Segment."""
    bkp_nr = pos["bkp_nr"]
    pos_abgabe = pos.get("abgabe")  # None|"flaeche"|"koerper"|"deckenstrahl"|"luft"
    treiber = _effektiver_treiber(bkp_nr, ziel)
    feld = _TREIBER_ZIEL_FELD[treiber]
    ziel_treiber = ziel.get(feld)

    kennwerte, gewichte = [], []
    herkunft = []
    abdeckung = 0  # Referenzen, die diese Position tatsächlich hatten (>0)
    grundsegment = len(segment)
    passende_abgabe = 0  # Referenzen mit passender Abgabe (für diese Position)
    for r in segment:
        if pos_abgabe is not None and pos_abgabe not in (r.get("abgabe_klassen") or set()):
            continue  # Abgabe-Position: nur Referenzen mit genau dieser Wärmeabgabe
        passende_abgabe += 1
        drv = r.get(feld)
        betrag = (r.get("positionen") or {}).get(bkp_nr)
        zeit = r.get("zeitgewicht", 1.0) or 0.0
        positionsgewicht = aehnlichkeits_score(
            r, ziel, waermeabgabe_beruecksichtigen=pos_abgabe is not None
        ) * zeit
        detail = {
            "id": r.get("id"), "name": r.get("name"),
            "datum_abrechnung": r.get("datum_abrechnung"),
            "ebf_m2": r.get("ebf_m2"), "leistung_kw": r.get("leistung_kw"),
            "anzahl_ne": r.get("anzahl_ne"),
            "waermeerzeuger": list(r.get("waermeerzeuger") or []),
            "erzeuger_signatur": r.get("erzeuger_signatur"),
            "abgabe_klassen": sorted(r.get("abgabe_klassen") or []),
            "treiber_wert": drv, "kosten": betrag,
            "kennwert": None, "gewicht": round(positionsgewicht, 4),
            "verwendet": False, "ausschlussgrund": None,
        }
        if not drv or drv <= 0:
            continue  # Referenz ohne diese Bezugsgrösse — nicht normierbar
        if betrag is None or betrag <= 0:
            continue
        kennwerte.append(betrag / drv)
        gewichte.append(positionsgewicht)
        abdeckung += 1
        detail.update({"kennwert": betrag / drv, "verwendet": True})
        herkunft.append(detail)

    basis = {
        "bkp_nr": bkp_nr, "bezeichnung": pos["bezeichnung"], "gruppe_nr": pos["gruppe_nr"],
        "einheit": _TREIBER_EINHEIT[treiber], "kennwert": None, "betrag": None,
        "berechneter_betrag": None, "manueller_betrag": None, "quelle": "keine_angaben",
        "abdeckung": abdeckung, "n_referenzen": len(kennwerte),
        "segment_groesse": len(segment),  # Gesamtzahl passender Referenzen (Nenner für «X von Y»)
        # Transparenz: wie zuverlässig ist diese Position? (Dominic 2026-07-20)
        "grundsegment": grundsegment,
        "passende_abgabe": passende_abgabe,
        "mit_kostenangabe": abdeckung,
        "status_datenbasis": _status_datenbasis(abdeckung),
        "vertrauen": _vertrauen_aus_abdeckung(abdeckung), "ziel_treiber": ziel_treiber,
        "bandbreite": None, "herkunft": herkunft,
    }
    sw = sum(gewichte)
    if not kennwerte or sw <= 0 or not ziel_treiber or ziel_treiber <= 0:
        return basis

    kennwert = sum(k * g for k, g in zip(kennwerte, gewichte)) / sw
    betrag = kennwert * ziel_treiber
    lo = perzentil(kennwerte, 0.25) * ziel_treiber
    hi = perzentil(kennwerte, 0.75) * ziel_treiber
    basis.update({
        "kennwert": kennwert, "betrag": betrag, "berechneter_betrag": betrag,
        "quelle": "referenzen",
        "bandbreite": (min(lo, betrag), max(hi, betrag)),
    })
    return basis


def quercheck_chf_pro_einheit(positionen_der_gruppe: list, segment: list, ziel: dict,
                              faktor: float = 1.0, schwelle: float = 0.35) -> Optional[dict]:
    """Gegencheck der Wärmeverteilung: ergibt die CHF/m²-Schätzung auch pro
    Wohnung (CHF/Einheit) Sinn? (Dominic 2026-07-19). Bei MFH ist die Anzahl
    Wohnungen ein zweiter, unabhängiger Massstab. Weicht die einheiten-basierte
    Summe stark (> Schwelle) von der flächen-basierten ab, stimmt vermutlich
    etwas nicht (Ausreisser in einer Richtung) → Hinweis. Rein informativ, ändert
    die Schätzung NICHT.

    faktor: derselbe Korrekturfaktor-Multiplikator wie auf der m²-Schätzung, damit
    beide Wege vergleichbar sind (kürzt sich in der relativen Abweichung eh weg)."""
    ziel_ne = ziel.get("anzahl_ne")
    if not ziel_ne or ziel_ne <= 0:
        return None  # ohne Anzahl Einheiten kein Quercheck
    # Ein Quercheck mit einer unvollständigen Zielsumme wäre irreführend.
    if any(p.get("betrag") is None for p in positionen_der_gruppe):
        return None
    betrag_flaeche = sum(p["betrag"] for p in positionen_der_gruppe)
    if betrag_flaeche <= 0:
        return None
    nrs = [p["bkp_nr"] for p in positionen_der_gruppe]
    kennwerte, gewichte = [], []
    for r in segment:
        ne = r.get("anzahl_ne")
        if not ne or ne <= 0:
            continue
        werte = [(r.get("positionen") or {}).get(nr) for nr in nrs]
        # Nur vollständige Referenzsummen sind mit der Zielsumme vergleichbar.
        if any(v is None or v <= 0 for v in werte):
            continue
        summe = sum(werte)
        kennwerte.append(summe / ne)
        gewichte.append(r.get("rang", 1.0) or 0.0)
    sw = sum(gewichte)
    if not kennwerte or sw <= 0:
        return None
    chf_pro_einheit = sum(k * g for k, g in zip(kennwerte, gewichte)) / sw
    betrag_einheit = chf_pro_einheit * ziel_ne * faktor
    abweichung = (betrag_einheit - betrag_flaeche) / betrag_flaeche
    return {
        "chf_pro_einheit": round(chf_pro_einheit, 2),
        "betrag_einheit": round(betrag_einheit, 2),
        "betrag_flaeche": round(betrag_flaeche, 2),
        "abweichung": round(abweichung, 4),
        "warnung": abs(abweichung) > schwelle,
        "schwelle": schwelle,
        "n_referenzen": len(kennwerte),
    }


# ── Orchestrierung ───────────────────────────────────────────────────────────

def berechne_grobkostenschaetzung(ziel: dict, referenzen_roh: list, faktoren: list,
                                  bauindex_eintraege: Optional[list] = None,
                                  heute: Optional[date] = None,
                                  manuelle_betraege: Optional[dict] = None) -> dict:
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

    # Wärmeabgabe filtert die Verteil-Positionen: ein reines FBH-Projekt bekommt
    # keine Heizkörper-/Luftheizapparate-Positionen mehr (Dominic 2026-07-19).
    positionen = filter_positionen(
        _WP_KATALOG.get(ziel.get("wp_typ")), ziel.get("nutzung"),
        abgabe_klassen_von(ziel.get("waermeabgabe")),
        ziel.get("waermeerzeuger"),
    )

    gruppen_map = {}
    manuelle_betraege = manuelle_betraege or {}
    for pos in positionen:
        e = schaetze_position(pos, segment, ziel)
        if faktor != 1.0 and e["betrag"]:
            e["betrag"] *= faktor
            e["berechneter_betrag"] = e["betrag"]
            if e["bandbreite"]:
                e["bandbreite"] = (e["bandbreite"][0] * faktor, e["bandbreite"][1] * faktor)
        manuell = manuelle_betraege.get(e["bkp_nr"])
        if manuell is not None and manuell >= 0:
            e["manueller_betrag"] = float(manuell)
            e["betrag"] = float(manuell)
            e["quelle"] = "manuell"
        g = gruppen_map.setdefault(e["gruppe_nr"], {"gruppe_nr": e["gruppe_nr"],
                                                    "name": BKP_GRUPPEN.get(e["gruppe_nr"], ""),
                                                    "positionen": [], "betrag": 0.0})
        g["positionen"].append(e)
        if e["betrag"] is not None:
            g["betrag"] += e["betrag"]

    gruppen = [gruppen_map[nr] for nr in BKP_GRUPPEN_ALLE if nr in gruppen_map]
    gesamt_betrag = sum(g["betrag"] for g in gruppen)
    fehlende_positionen = [
        p["bkp_nr"] for g in gruppen for p in g["positionen"] if p["betrag"] is None
    ]
    positionen_ohne_referenz = [
        p["bkp_nr"] for g in gruppen for p in g["positionen"]
        if p["berechneter_betrag"] is None
    ]

    # CHF/Einheit-Gegencheck auf der Wärmeverteilung (243) — Ausreisser-Erkennung
    # (Dominic 2026-07-19). Rein informativ, ändert die Schätzung nicht.
    for g in gruppen:
        if g["gruppe_nr"] == "243":
            g["quercheck_einheit"] = quercheck_chf_pro_einheit(g["positionen"], segment, ziel, faktor)

    return {
        "gesamt_betrag": gesamt_betrag,
        "ist_unvollstaendig": bool(fehlende_positionen),
        "fehlende_positionen": fehlende_positionen,
        "positionen_ohne_referenz": positionen_ohne_referenz,
        "gruppen": gruppen,
        "korrekturfaktoren": korr["angewendet"],
        "referenzen_gefunden": len(top),
        "referenzen_im_segment": len(segment),
        "baupreisindex_aktiv": baupreisindex_aktiv,
        "referenzen_verwendet": top,
        "referenzfilter": analysiere_referenzfilter(referenzen_roh, ziel),
    }
