"""Technische Mengen zuverlässig erkennen (Punkt 5, 9, 10, 11).

Die alte Regel „Begriff gefunden → nächste zwei Zeilen nach einer Zahl
durchsuchen" ist auf echten LVs gefährlich: aus

    Pumpe
    Leistung 570 W

wurden 570 Pumpen. Deshalb gilt hier durchgehend:

1. Eine Menge zählt nur mit passender Mengeneinheit (Stk./Stück/Anzahl bzw. m).
2. Sie muss im selben Tabellen-/Positionskontext stehen — nicht irgendwo daneben.
3. Der Abschnitt (BKP-Position) entscheidet mit: Flächenheizungsrohre sind keine
   Verteilrohrmeter.
4. Was nicht sicher lesbar ist, bleibt None. Nichts wird geraten (B6).

Arbeitet bevorzugt auf Wortkoordinaten (räumliche Tabellenzeilen, Punkt 3/4) und
fällt sonst auf Textzeilen zurück — bestehende einfache PDFs bleiben nutzbar.
"""
from __future__ import annotations

import re
from typing import Optional

from app.lv_import.normalization import parse_number, parse_int
from app.lv_import.spatial import group_words_to_rows, parse_table_row, row_text, row_bbox
from app.lv_import.synonyms import (
    FEATURE_TERMS, PIPE_INCLUDE_TERMS, PIPE_EXCLUDE_TERMS,
    PIPE_EXCLUDE_SECTION_TERMS, PIPE_SOURCE_TERMS, STORAGE_TERMS,
    TECHNICAL_BUFFER, BWW_STORAGE, COMBINED_STORAGE, UNKNOWN_STORAGE,
)

HIGH, MEDIUM, LOW = "high", "medium", "low"

# Stückzahl-Einheiten (Punkt 10): NUR diese dürfen eine Bauteilmenge ergeben.
_STK_EINHEITEN = ("stk", "stück", "stueck", "st", "anzahl", "stg")

# Zwei Schreibrichtungen, aber KEINE Alternation in einem Muster: im LV steht
# zuerst die Einheitenspalte und dann das Ausmass ("Stk. 6", "m 12"). Ein
# einziges Regex mit Alternation würde den linkesten Treffer nehmen und damit
# aus "…DN 32 m 12" die Nennweite 32 und aus "Typ 22 Stk. 14" die Typnummer 22
# lesen. Darum: Einheit-dann-Zahl hat immer Vorrang.
_STK_NACH_EINHEIT = re.compile(
    r"\b(?:stk\.?|stück|stueck|st\.|anzahl)\s*[:.]?\s*(\d+(?:[.,]\d+)?)\b", re.IGNORECASE)
_STK_VOR_EINHEIT = re.compile(
    r"\b(\d+(?:[.,]\d+)?)\s*(?:stk\.?|stück|stueck|st\.)\b", re.IGNORECASE)
_M_NACH_EINHEIT = re.compile(
    r"\b(?:lfm|laufmeter|m)\b\s*[:.]?\s*(\d+(?:[.,]\d+)?)\b", re.IGNORECASE)
_M_VOR_EINHEIT = re.compile(
    r"\b(\d+(?:[.,]\d+)?)\s*(?:lfm|laufmeter|m)\b", re.IGNORECASE)

# Zahlen, die technische Bezeichner sind und nie eine Menge: Nennweite,
# Durchmesser, Typ-/Grössenangaben.
_BEZEICHNER_DAVOR = re.compile(r"(?:dn|nw|ø|d|typ|nr\.?|gr\.?|pn)\s*$", re.IGNORECASE)


def _zahl_mit_einheit(text: str, nach_re, vor_re) -> Optional[float]:
    """Menge aus einer Zeile — Einheit-dann-Zahl zuerst (LV-Spaltenordnung).

    Erst wenn diese Form fehlt, wird Zahl-dann-Einheit akzeptiert, und dann nur,
    wenn davor kein technischer Bezeichner (DN/Typ/Ø) steht.
    """
    text = text or ""
    m = nach_re.search(text)
    if m:
        return parse_number(m.group(1))
    for m in vor_re.finditer(text):
        if _BEZEICHNER_DAVOR.search(text[:m.start(1)]):
            continue
        return parse_number(m.group(1))
    return None
# Abschnitts-/Positionskopf: "243.1 Rohrleitungen", "241.14 Erdsonden ..."
_ABSCHNITT = re.compile(r"^\s*(?:pos\.?\s*|bkp\s*)?(2\d{2}(?:\.\d+)*)\s+(\S.*)$", re.IGNORECASE)
_HAT_WORT = re.compile(r"[A-Za-zÄÖÜäöüéèà]{3,}")


# ── Einheitliche Zeilenquelle ──────────────────────────────────────────────

def build_rows(pages, word_pages=None) -> list[dict]:
    """Eine gemeinsame Zeilenliste für alle Mengen-Extraktoren.

    Aus Wortkoordinaten entstehen echte Tabellenzeilen (Beschreibung/Einheit/
    Ausmass/EP/Total); ohne Koordinaten wird die Textzeile geparst. Beide Wege
    liefern dieselbe Struktur, damit die Fachlogik nur EINMAL existiert.
    """
    rows: list[dict] = []
    if word_pages:
        for sp in word_pages:
            seite = sp.get("page")
            for row in group_words_to_rows(sp.get("words") or []):
                parsed = parse_table_row(row)
                parsed.update({"text": row_text(row), "source_page": seite,
                               "bbox": row_bbox(row), "spatial": True})
                rows.append(parsed)
        if rows:
            return rows
    for p in pages or []:
        seite = p.get("page")
        for line in (p.get("text") or "").splitlines():
            line = line.strip()
            if not line:
                continue
            rows.append({"text": line, "source_page": seite, "spatial": False,
                         "beschreibung": line, "einheit": None, "ausmass": None,
                         "ep": None, "total": None, "bbox": None})
    return rows


def _menge_stk(row) -> Optional[float]:
    """Stückzahl einer Zeile — nur mit echter Stück-Einheit (Punkt 10)."""
    if row.get("spatial") and row.get("einheit"):
        if row["einheit"].rstrip(".") in _STK_EINHEITEN and row.get("ausmass") is not None:
            return row["ausmass"]
        return None          # räumlich erkannte Einheit passt nicht → nicht zählen
    return _zahl_mit_einheit(row.get("text"), _STK_NACH_EINHEIT, _STK_VOR_EINHEIT)


def _menge_meter(row) -> Optional[float]:
    """Laufmeter einer Zeile — nur mit Einheit m/lfm (nicht m², nicht kW)."""
    if row.get("spatial") and row.get("einheit"):
        if row["einheit"] in ("m", "lfm") and row.get("ausmass") is not None:
            return row["ausmass"]
        return None
    return _zahl_mit_einheit(row.get("text"), _M_NACH_EINHEIT, _M_VOR_EINHEIT)


# Alle Bauteilbegriffe, die eine eigene Menge haben — zur Abgrenzung beim
# Blick in die Folgezeile (die Menge der NÄCHSTEN Position darf nicht
# „gestohlen" werden).
_ALLE_BAUTEIL_TERMS = tuple(
    t for f in ("pump", "valve_2way", "valve_3way", "balancing_valve", "radiator",
                "heat_meter", "floor_heating_manifold", "buffer", "borehole", "heat_generator")
    for t in FEATURE_TERMS[f]
) + PIPE_INCLUDE_TERMS


def _menge_im_kontext(rows, index, menge_fn, max_folge=2):
    """Menge der Position: eigene Zeile, sonst die unmittelbar folgenden Zeilen.

    Der Blick nach unten ist bewusst erlaubt — echte LVs schreiben
    `Umwälzpumpe …` und darunter `Stk. 2`. Er ist dreifach abgesichert:

    1. Es zählt nur eine echte Mengeneinheit (darum bleibt `Leistung 570 W`
       wirkungslos).
    2. Die Suche endet an der nächsten LV-Position.
    3. Die Suche endet an jeder Zeile, die selbst ein Bauteil/Rohr benennt —
       denn die hat ihre eigene Menge. Sonst würde ein Abschnittstitel wie
       `243.1 Rohrleitungen` die Menge der ersten Detailzeile mitzählen und
       jede Position doppelt erfassen.
    """
    menge = menge_fn(rows[index])
    if menge is not None:
        return menge, index
    seite = rows[index].get("source_page")
    for j in range(index + 1, min(index + 1 + max_folge, len(rows))):
        r = rows[j]
        if r.get("source_page") != seite:
            break
        text = r.get("text") or ""
        if _ABSCHNITT.match(text):
            break                                    # neue LV-Position
        low = text.lower()
        if any(t in low for t in _ALLE_BAUTEIL_TERMS):
            break                                    # eigene Position mit eigener Menge
        menge = menge_fn(r)
        if menge is not None:
            return menge, j
    return None, None


def _abschnitte_zuordnen(rows) -> None:
    """Jeder Zeile ihren aktuellen Abschnitt (BKP-Position + Titel) mitgeben.

    Damit kann die Fachlogik den Kontext berücksichtigen (Punkt 11): unter
    „243.2 Flächenheizung" sind Rohrmeter keine Verteilrohrmeter.
    """
    nr = titel = None
    for row in rows:
        m = _ABSCHNITT.match(row.get("text") or "")
        if m and _HAT_WORT.search(m.group(2)):
            nr, titel = m.group(1), m.group(2).strip()
        row["section_nr"] = nr
        row["section_title"] = titel


def _excerpt(rows, index, vor=0, nach=2) -> str:
    """Kompakte Fundstelle: 2–5 relevante Zeilen statt einer ganzen Seite
    (Punkt 12)."""
    start = max(0, index - vor)
    ende = min(len(rows), index + nach + 1)
    seite = rows[index].get("source_page")
    teile = [rows[i]["text"] for i in range(start, ende)
             if rows[i].get("source_page") == seite]
    return "\n".join(teile[:5])[:400]


def _fund(row, rows, index) -> dict:
    return {"source_page": row.get("source_page"), "source_text": row["text"][:200],
            "source_excerpt": _excerpt(rows, index), "source_bbox": row.get("bbox")}


# ── Punkt 10 — Bauteilmengen nur mit Stück-Einheit ─────────────────────────

def component_counts(rows) -> dict:
    """Stückzahlen je Bauteilfamilie aus klaren LV-Zeilen.

    Zählt nur Zeilen, die einen Bauteilbegriff UND eine Stück-Menge enthalten.
    `Pumpe / Leistung 570 W` liefert damit nichts."""
    familien = ("pump", "valve_2way", "valve_3way", "balancing_valve",
                "radiator", "heat_meter", "floor_heating_manifold")
    result: dict[str, dict] = {}
    for family in familien:
        terms = FEATURE_TERMS[family]
        summe = 0.0
        treffer = 0        # Zeilen mit Begriff
        mit_menge = 0      # davon mit verwertbarer Stückzahl
        fund = None
        for i, row in enumerate(rows):
            low = (row.get("text") or "").lower()
            if not any(t in low for t in terms):
                continue
            treffer += 1
            menge, _quell_index = _menge_im_kontext(rows, i, _menge_stk)
            if menge is None:
                continue
            summe += menge
            mit_menge += 1
            if fund is None:
                # Herkunft zeigt die BAUTEILZEILE (sie benennt die Position);
                # die Mengenzeile steht im Auszug direkt darunter (Punkt 12).
                fund = _fund(row, rows, i)
        if treffer == 0:
            continue
        if mit_menge == 0:
            # Erwähnt, aber keine verlässliche Stückzahl → nicht raten (B6).
            i, row = next((j, r) for j, r in enumerate(rows)
                          if any(t in (r.get("text") or "").lower() for t in terms))
            result[family] = {"value": None, "confidence": LOW, **_fund(row, rows, i)}
            continue
        result[family] = {"value": int(round(summe)),
                          "confidence": HIGH if mit_menge == treffer else MEDIUM,
                          "positionen": mit_menge, **fund}
    return result


# ── Erzeugerleistung ───────────────────────────────────────────────────────
# kW, aber nicht kWh (Arbeit) — und nie eine blosse Zahl ohne Einheit.
_KW = re.compile(r"(\d+(?:[.,]\d+)?)\s*kw\b(?!h)", re.IGNORECASE)


def _leistung_kw(row) -> Optional[float]:
    m = _KW.search(row.get("text") or "")
    return parse_number(m.group(1)) if m else None


def generator_power(rows) -> dict:
    """Erzeugerleistung in kW (Punkt 31 „Leistung korrekt").

    Die Leistung steht im LV oft einige Zeilen unter der Erzeugerposition
    (Fabrikat, Typ, dann Leistung). Gesucht wird darum im Positionskontext —
    begrenzt durch die nächste Position bzw. das nächste Bauteil, damit nie die
    Leistung eines anderen Geräts übernommen wird.
    """
    terms = FEATURE_TERMS["heat_generator"]
    summe = 0.0
    treffer = 0
    fund = None
    for i, row in enumerate(rows):
        low = (row.get("text") or "").lower()
        if not any(t in low for t in terms):
            continue
        kw, _idx = _menge_im_kontext(rows, i, _leistung_kw, max_folge=4)
        if kw is None:
            continue
        summe += kw
        treffer += 1
        if fund is None:
            fund = _fund(row, rows, i)
    if not treffer:
        return {}
    return {"generator_power_kw": {
        "value": round(summe, 1), "confidence": HIGH if treffer == 1 else MEDIUM,
        "positionen": treffer, **fund}}


# ── Punkt 5 — Erdsonden über mehrere Muster ────────────────────────────────

# Muster A: "5 Erdsonden à 180 m"
_MUSTER_A = re.compile(
    r"(\d+)\s*(?:erdsonden?|duplexsonden?|erdwärmesonden?|erdwaermesonden?|sonden?)"
    r"\s*(?:à|a|je|zu|x|×)\s*(\d[\d’'.,\s]*)\s*m\b",
    re.IGNORECASE,
)
# Labels mit klarem semantischem Bezug (Punkt 5: NICHT irgendeine Zahl).
_LABEL_ANZAHL = ("total sonden", "anzahl sonden", "anzahl erdsonden",
                 "total erdsonden", "anzahl der sonden", "sondenanzahl")
_LABEL_LAENGE = ("länge/sonde", "laenge/sonde", "länge pro sonde", "sondenlänge",
                 "sondenlaenge", "länge je sonde", "bohrtiefe", "sondentiefe",
                 "länge sonde")
_SONDE_BEGRIFF = ("erdsonde", "erdsonden", "erdwärmesonde", "erdwaermesonde",
                  "duplexsonde", "duplexsonden", "sonde", "sonden")


def _label_wert(rows, labels, *, einheit_meter: bool):
    """Wert zu einem Label — bevorzugt aus der Zeile selbst (räumlich: rechts
    vom Label). Nur Labels mit direktem fachlichem Bezug werden übergeben."""
    for i, row in enumerate(rows):
        low = (row.get("text") or "").lower()
        if not any(l in low for l in labels):
            continue
        wert = _menge_meter(row) if einheit_meter else None
        if wert is None:
            # Ohne/mit anderer Einheit: die Ausmass-Spalte bzw. die erste Zahl
            # rechts vom Label. Für Stückzahlen ist keine Einheit verlangt
            # („Total Sonden   6").
            if row.get("spatial") and row.get("ausmass") is not None:
                # Eine als Meter erkannte Tabellenzeile darf nie zur
                # Sondenanzahl werden (überlagerte Formulare erzeugten sonst
                # aus «Total Sonden m 6» fälschlich 65 Sonden).
                if not einheit_meter and row.get("einheit") not in (None, "stk"):
                    continue
                wert = row["ausmass"]
            else:
                wert = _erste_zahl_nach_label(low, labels)
        if wert is not None and (not einheit_meter or 10 <= wert <= 1000):
            return wert, _fund(row, rows, i)
    return None, None


def _erste_zahl_nach_label(low: str, labels) -> Optional[float]:
    """Erste Zahl RECHTS des Labels im Text (Fallback ohne Koordinaten)."""
    for l in labels:
        pos = low.find(l)
        if pos < 0:
            continue
        rest = low[pos + len(l):]
        m = re.search(r"(\d[\d’'.,\s]*)", rest)
        if m:
            return parse_number(m.group(1))
    return None


def boreholes(rows) -> dict:
    """Erdsonden: Anzahl, Länge je Sonde und Bohrmeter (Punkt 5).

    Muster A  „5 Erdsonden à 180 m"          → 5 / 180 / 900
    Muster B  „Länge/Sonde m 150" + „Total Sonden 6" → 6 / 150 / 900
    Muster C  „Anzahl Sonden: 5" + „Sondenlänge: 180 m" → 5 / 180 / 900

    Bohrmeter werden immer aus count × length_each berechnet, wenn beide Werte
    vorliegen — mit Rechenweg in der Herkunft.
    """
    # Muster A hat Vorrang: count und Länge stehen zusammen in einer Zeile.
    for i, row in enumerate(rows):
        m = _MUSTER_A.search(row.get("text") or "")
        if not m:
            continue
        count = parse_int(m.group(1))
        each = parse_number(m.group(2))
        if count and each:
            fund = _fund(row, rows, i)
            return _borehole_result(count, each, fund, fund, HIGH)

    # Muster B/C: Labels getrennt (tabellarisch oder „Label: Wert").
    count, count_fund = _label_wert(rows, _LABEL_ANZAHL, einheit_meter=False)
    each, each_fund = _label_wert(rows, _LABEL_LAENGE, einheit_meter=True)

    if count is None:
        # Letzter Versuch: „6 Erdsonden" ohne Längenangabe (nur mit Bezug!).
        for i, row in enumerate(rows):
            low = (row.get("text") or "").lower()
            if not any(b in low for b in _SONDE_BEGRIFF):
                continue
            m = re.search(r"(\d+)\s*(?:erdsonden?|erdwärmesonden?|duplexsonden?|sonden)\b", low)
            if m:
                count = parse_int(m.group(1))
                count_fund = _fund(row, rows, i)
                break
            menge = _menge_stk(row)
            if menge is not None:
                count = int(round(menge))
                count_fund = _fund(row, rows, i)
                break

    if count is None and each is None:
        return {}
    conf = HIGH if (count is not None and each is not None) else MEDIUM
    return _borehole_result(count, each, count_fund, each_fund, conf)


def _borehole_result(count, each, count_fund, each_fund, conf) -> dict:
    out: dict[str, dict] = {}
    if count is not None:
        out["borehole_count"] = {"value": int(round(count)), "confidence": conf,
                                 **(count_fund or {})}
    if each is not None:
        out["borehole_length_each_m"] = {"value": round(float(each), 1),
                                         "confidence": conf, **(each_fund or {})}
    if count is not None and each is not None:
        total = round(float(count) * float(each), 1)
        basis = each_fund or count_fund or {}
        out["borehole_total_m"] = {
            "value": total, "confidence": conf,
            "derived_from": f"{int(round(count))} × {_kurz(each)} m",
            "source_page": basis.get("source_page"),
            "source_text": f"berechnet aus {int(round(count))} × {_kurz(each)} m",
            "source_excerpt": basis.get("source_excerpt"),
            "source_bbox": basis.get("source_bbox"),
        }
    return out


def _kurz(zahl) -> str:
    f = float(zahl)
    return str(int(f)) if f == int(f) else str(f)


# ── Punkt 9 — Speicher klassifizieren ─────────────────────────────────────

_LITER = re.compile(r"(\d[\d’'.,\s]*)\s*(?:liter|lit\.?|l)\b", re.IGNORECASE)


def classify_storage(text: str) -> str:
    """Speicherart aus dem Positionstext (Punkt 9).

    Reihenfolge: Kombispeicher vor Puffer (ein Kombispeicher enthält oft das
    Wort Speicher), BWW vor „unknown"."""
    low = (text or "").lower()
    for art in (COMBINED_STORAGE, BWW_STORAGE, TECHNICAL_BUFFER):
        if any(t in low for t in STORAGE_TERMS[art]):
            return art
    if "speicher" in low:
        return UNKNOWN_STORAGE
    return UNKNOWN_STORAGE


def storages(rows) -> dict:
    """Pufferspeicher-Anzahl und -Volumen (Punkt 9).

    Nur technisch relevante Heizungsspeicher werden zum Kostentreiber. Ein
    Wassererwärmer/BWW-Speicher zählt nicht mit; ein Kombispeicher wird
    mitgezählt, aber mit tieferer Sicherheit zur Prüfung markiert.
    """
    count = 0.0
    volumen = 0.0
    fund = None
    arten: dict[str, int] = {}
    unsicher = False
    for i, row in enumerate(rows):
        low = (row.get("text") or "").lower()
        if "speicher" not in low and not any(
                t in low for t in STORAGE_TERMS[TECHNICAL_BUFFER] + STORAGE_TERMS[BWW_STORAGE]):
            continue
        art = classify_storage(low)
        arten[art] = arten.get(art, 0) + 1
        if art == BWW_STORAGE:
            continue                      # kein Heizungs-Kostentreiber
        if art in (COMBINED_STORAGE, UNKNOWN_STORAGE):
            unsicher = True               # Nutzer prüfen lassen
        menge = _menge_stk(row)
        if menge is not None:
            count += menge
        liter = _LITER.search(row.get("text") or "")
        if liter:
            v = parse_number(liter.group(1))
            if v:
                volumen += v
        if fund is None and (menge is not None or liter):
            fund = _fund(row, rows, i)
    out: dict[str, dict] = {}
    if not fund:
        return out
    conf = MEDIUM if unsicher else HIGH
    if count:
        out["buffer_count"] = {"value": int(round(count)), "confidence": conf,
                               "storage_types": arten, **fund}
    if volumen:
        out["storage_volume_l"] = {"value": round(volumen, 1), "confidence": conf,
                                   "storage_types": arten, **fund}
    return out


# ── Punkt 11 — Rohrmeter sauber bestimmen ─────────────────────────────────

def pipe_lengths(rows) -> dict:
    """Rohrmeter je Seite (Quelle/Verteilung) und total (Punkt 11).

    Summiert ALLE Rohrpositionen mit Einheit m — nicht eine einzelne Regex-
    Zeile. Flächenheizungsrohre werden ausgeschlossen, sowohl über den
    Positionstext als auch über den Abschnittstitel.
    """
    _abschnitte_zuordnen(rows)
    quelle_summe = verteil_summe = 0.0
    quelle_n = verteil_n = 0
    quelle_fund = verteil_fund = None
    je_abschnitt: dict[str, float] = {}
    ausgeschlossen: list[str] = []
    verbrauchte_mengen_zeilen: set[int] = set()

    for i, row in enumerate(rows):
        if i in verbrauchte_mengen_zeilen:
            continue
        text = row.get("text") or ""
        low = text.lower()
        section_low = (row.get("section_title") or "").lower()
        section_nr = row.get("section_nr") or ""
        # BKP 241.11 ist fachlich vollständig «Rohrleitungen Primärkreis».
        # Echte LVs nummerieren die einzelnen Fabrikate darunter weiter
        # (z.B. 241.110/241.111), wobei im Detailtitel das Wort «Rohr» fehlen
        # kann. Eine klar ausgewiesene Menge in m gehört trotzdem zur
        # Primärkreis-Rohrsumme. Ohne diese Kontextregel gingen genau diese
        # Positionen verloren.
        ist_primaerkreis_abschnitt = section_nr.startswith("241.11")
        if not ist_primaerkreis_abschnitt and \
           not any(t in low for t in PIPE_INCLUDE_TERMS) and \
           not any(t in section_low for t in PIPE_INCLUDE_TERMS):
            continue
        if any(t in low for t in (
            "herstellungslänge", "herstellungslaenge", "lieferlänge",
            "lieferlaenge", "stangenlänge", "stangenlaenge",
        )):
            continue
        meter, mengen_idx = _menge_im_kontext(rows, i, _menge_meter)
        if meter is None:
            continue
        if mengen_idx is not None and mengen_idx != i:
            # Beschreibung und darunterliegende Mengenzelle bilden eine
            # Position. Die Mengenzelle darf beim nächsten Schleifendurchlauf
            # nicht ein zweites Mal summiert werden.
            verbrauchte_mengen_zeilen.add(mengen_idx)
        # Ausschluss über Positionstext ODER Abschnittstitel (Punkt 11).
        if any(t in low for t in PIPE_EXCLUDE_TERMS) or \
           any(t in section_low for t in PIPE_EXCLUDE_SECTION_TERMS):
            ausgeschlossen.append(text[:80])
            continue
        ist_quelle = any(t in low for t in PIPE_SOURCE_TERMS) or \
            any(t in section_low for t in PIPE_SOURCE_TERMS) or \
            (row.get("section_nr") or "").startswith("241")
        if ist_quelle:
            quelle_summe += meter
            quelle_n += 1
            if quelle_fund is None:
                quelle_fund = _fund(row, rows, i)
        else:
            verteil_summe += meter
            verteil_n += 1
            if verteil_fund is None:
                verteil_fund = _fund(row, rows, i)
        nr = section_nr
        if nr:
            je_abschnitt[nr] = round(je_abschnitt.get(nr, 0.0) + meter, 1)

    out: dict[str, dict] = {}
    if quelle_n:
        out["pipe_length_source_m"] = {
            "value": round(quelle_summe, 1), "positionen": quelle_n,
            "confidence": HIGH if quelle_n >= 2 else MEDIUM, **quelle_fund}
    if verteil_n:
        out["pipe_length_distribution_m"] = {
            "value": round(verteil_summe, 1), "positionen": verteil_n,
            "confidence": HIGH if verteil_n >= 2 else MEDIUM, **verteil_fund}
    if quelle_n or verteil_n:
        total = round(quelle_summe + verteil_summe, 1)
        basis = verteil_fund or quelle_fund
        teile = []
        if quelle_n:
            teile.append(f"Quelle {_kurz(round(quelle_summe, 1))} m")
        if verteil_n:
            teile.append(f"Verteilung {_kurz(round(verteil_summe, 1))} m")
        out["pipe_length_m"] = {
            "value": total, "confidence": HIGH if (quelle_n + verteil_n) >= 2 else MEDIUM,
            "derived_from": " + ".join(teile),
            "positionen": quelle_n + verteil_n,
            "source_page": basis.get("source_page"),
            "source_text": f"Summe aus {quelle_n + verteil_n} Rohrpositionen ({' + '.join(teile)})",
            "source_excerpt": basis.get("source_excerpt"),
            "source_bbox": basis.get("source_bbox"),
            "per_section": je_abschnitt,
            "excluded": ausgeschlossen[:5],
        }
    return out


def pipe_length_for_section(rows, section_nr: str) -> float:
    """Rohrmeter genau eines Abschnitts — für den Golden-Test (243.1 = 252 m)."""
    _abschnitte_zuordnen(rows)
    summe = 0.0
    for i, row in enumerate(rows):
        if (row.get("section_nr") or "") != section_nr:
            continue
        low = (row.get("text") or "").lower()
        if not any(t in low for t in PIPE_INCLUDE_TERMS):
            continue
        if any(t in low for t in PIPE_EXCLUDE_TERMS):
            continue
        section_low = (row.get("section_title") or "").lower()
        if any(t in section_low for t in PIPE_EXCLUDE_SECTION_TERMS):
            continue
        meter, _idx = _menge_im_kontext(rows, i, _menge_meter)
        if meter is not None:
            summe += meter
    return round(summe, 1)
