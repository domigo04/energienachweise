"""Räumliche PDF-Extraktion und Tabellenverständnis (Punkt 3 + 4).

Warum das nötig ist: in einem echten LV stehen Werte visuell sauber in
Tabellenzellen, aber die flache Textextraktion liefert sie teilweise in falscher
Reihenfolge — Ausschreibungswerte und Unternehmerwerte landen durcheinander.
Genau daran scheitert z.B. die Erdsonden-Erkennung.

Deshalb werden für born-digital PDFs zusätzlich Wortkoordinaten erfasst
(x0/x1/top/bottom je Wort) und Tabellenzeilen räumlich rekonstruiert:

    Beschreibung | Einheit | Ausmass | EP | Total

`find_value_right_of_label` priorisiert bewusst den Wert RECHTS vom Label —
nicht irgendeine Zahl darüber oder darunter (Punkt 4).

Getrennte Schicht: kein DB-, kein Web-Bezug. `pypdf` bleibt für den einfachen
Text zuständig (Punkt 3: nicht entfernen); pdfplumber ist ein optionaler
Zusatz. Fehlt es, arbeitet der Importer wie bisher weiter.
"""
from __future__ import annotations

import re
from typing import Optional

from app.lv_import.normalization import parse_number

# Zwei Wörter gehören zur selben Tabellenzeile, wenn ihre vertikale Mitte
# weniger als diese Toleranz auseinanderliegt (in PDF-Punkten). Bewusst klein:
# lieber zwei Zeilen als eine falsch verschmolzene.
ZEILEN_TOLERANZ = 3.0


def extract_words(pdf_bytes: bytes) -> list[dict]:
    """PDF-Bytes → [{"page": 1, "words": [{text,x0,x1,top,bottom}, ...]}, ...].

    Best-effort: fehlt pdfplumber oder ist das PDF ein Scan, kommt [] zurück und
    der Importer bleibt beim Textparser (Punkt 28: kein Rückschritt)."""
    if not pdf_bytes:
        return []
    try:
        import pdfplumber
    except ImportError:  # pragma: no cover — optionale Abhängigkeit
        return []
    import io
    seiten = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                try:
                    words = page.extract_words() or []
                except Exception:  # pragma: no cover
                    words = []
                seiten.append({"page": i, "words": [
                    {"text": w.get("text", ""), "x0": float(w.get("x0", 0)),
                     "x1": float(w.get("x1", 0)), "top": float(w.get("top", 0)),
                     "bottom": float(w.get("bottom", 0))}
                    for w in words
                ]})
    except Exception:  # pragma: no cover — defektes PDF darf nie den Import sprengen
        return []
    return seiten


def words_to_pages(word_pages) -> list[dict]:
    """Wortseiten → klassische Textseiten, aber zeilenweise korrekt sortiert.

    Nutzt die Koordinaten, um Zeilen in visueller Reihenfolge (oben→unten,
    links→rechts) zu erzeugen. Das allein behebt schon einen Teil der
    Reihenfolge-Probleme des flachen Extrakts."""
    out = []
    for sp in word_pages or []:
        zeilen = group_words_to_rows(sp.get("words") or [])
        text = "\n".join(" ".join(w["text"] for w in z) for z in zeilen)
        out.append({"page": sp.get("page"), "text": text})
    return out


def group_words_to_rows(words) -> list[list[dict]]:
    """Wörter zu visuellen Zeilen gruppieren (nach `top`, dann nach `x0`)."""
    if not words:
        return []
    sortiert = sorted(words, key=lambda w: (round(w["top"], 1), w["x0"]))
    zeilen: list[list[dict]] = []
    aktuell: list[dict] = [sortiert[0]]
    for w in sortiert[1:]:
        mitte_aktuell = sum((x["top"] + x["bottom"]) / 2 for x in aktuell) / len(aktuell)
        mitte_w = (w["top"] + w["bottom"]) / 2
        if abs(mitte_w - mitte_aktuell) <= ZEILEN_TOLERANZ:
            aktuell.append(w)
        else:
            zeilen.append(sorted(aktuell, key=lambda x: x["x0"]))
            aktuell = [w]
    zeilen.append(sorted(aktuell, key=lambda x: x["x0"]))
    return zeilen


def row_text(row) -> str:
    return " ".join(w["text"] for w in row)


def row_bbox(row) -> list[float]:
    return [min(w["x0"] for w in row), min(w["top"] for w in row),
            max(w["x1"] for w in row), max(w["bottom"] for w in row)]


# Einheiten, die in einer LV-Ausmass-Spalte stehen dürfen.
_EINHEITEN = ("stk", "stk.", "stück", "stueck", "st.", "m", "m2", "m²", "m3", "m³",
              "lfm", "kg", "l", "liter", "h", "psch", "psch.", "pausch", "pausch.",
              "min", "kw", "w")
_ZAHL = re.compile(r"^-?\d[\d’'.,\s]*$")


def _ist_zahl(text: str) -> bool:
    return bool(_ZAHL.match((text or "").strip())) and parse_number(text) is not None


def parse_table_row(row) -> dict:
    """Eine Tabellenzeile grob als LV-Zeile deuten (Punkt 4):

        Beschreibung | Einheit | Ausmass | EP | Total

    Konservativ: erkannt wird nur, was klar erkennbar ist. Was fehlt, bleibt
    None — nichts wird geraten (Grundsatz B6).

    Beispiel `Länge/Sonde   m   150` → einheit "m", ausmass 150.
    """
    if not row:
        return {"beschreibung": "", "einheit": None, "ausmass": None,
                "ep": None, "total": None, "zahlen": []}

    einheit_idx = None
    einheit = None
    hat_stueck_einheit = any(
        (w.get("text") or "").strip().lower().rstrip(".")
        in ("stk", "stück", "stueck", "st")
        for w in row
    )
    for i, w in enumerate(row):
        roh = (w["text"] or "").strip()
        t = roh.lower().rstrip(".")
        # «M 10 Stk. 4» ist ein metrisches Gewinde, keine Meter-Einheit.
        if roh == "M" and hat_stueck_einheit:
            continue
        if t in [e.rstrip(".") for e in _EINHEITEN]:
            einheit_idx = i
            einheit = t
            break

    # Alle Zahlen mit ihrer Position (für EP/Total-Zuordnung von rechts).
    zahlen = [(i, parse_number(w["text"]), w) for i, w in enumerate(row)
              if _ist_zahl(w["text"])]
    zahlen = [(i, v, w) for i, v, w in zahlen if v is not None]

    ausmass = None
    links = []
    if einheit_idx is not None:
        # Beide Schweizer LV-Spaltenfolgen kommen vor:
        #   Einheit | Ausmass | EP | Total   ("m 12 26.90 322.80")
        #   Ausmass | Einheit | EP | Total   ("12 m 26.90 322.80")
        # Stehen mindestens zwei Geldspalten rechts der Einheit, ist die direkt
        # links stehende Zahl das Ausmass. Andernfalls gilt der übliche Wert
        # rechts der Einheit. Damit wird nie der Einheitspreis als Rohrmenge
        # gelesen.
        rechts = [(i, v, w) for i, v, w in zahlen if i > einheit_idx]
        links = [(i, v, w) for i, v, w in zahlen if i < einheit_idx]
        if links and len(rechts) >= 2:
            ausmass = links[-1][1]
        elif rechts:
            ausmass = rechts[0][1]
        elif links:
            ausmass = links[-1][1]

    # Beschreibung = Wörter links der Einheit bzw. der ersten Zahl.
    grenze = einheit_idx if einheit_idx is not None else (zahlen[0][0] if zahlen else len(row))
    beschreibung = " ".join(w["text"] for w in row[:grenze]).strip()

    # EP/Total: die letzten zwei Zahlen der Zeile, wenn es mehr als das Ausmass
    # gibt. Total ist die rechteste Zahl.
    ep = total = None
    nach_einheit = [(i, v, w) for i, v, w in zahlen
                    if einheit_idx is None or i > einheit_idx]
    if links and einheit_idx is not None and len(nach_einheit) >= 2:
        ep, total = nach_einheit[-2][1], nach_einheit[-1][1]
    elif len(nach_einheit) >= 3:
        ep, total = nach_einheit[-2][1], nach_einheit[-1][1]
    elif len(nach_einheit) == 2:
        total = nach_einheit[-1][1]

    return {"beschreibung": beschreibung, "einheit": einheit, "ausmass": ausmass,
            "ep": ep, "total": total, "zahlen": [v for _, v, _ in zahlen]}


def find_value_right_of_label(word_pages, label, *, einheit=None,
                              max_zeilen_abstand=0) -> Optional[dict]:
    """Den Wert RECHTS von einem Label suchen (Punkt 4).

    Genau das ist der Kern gegen die Erdsonden-Fehlerkennung: in
    `Länge/Sonde   m   150` gehört die 150 zum Label — nicht eine Zahl, die
    zufällig darüber oder darunter steht.

    Args:
        word_pages: Seiten mit Wortkoordinaten (`extract_words`).
        label: gesuchter Labeltext (Teilstring, case-insensitive).
        einheit: falls gesetzt, muss diese Einheit in der Zeile vorkommen.
        max_zeilen_abstand: 0 = nur dieselbe Zeile. >0 erlaubt als NOTFALL die
            folgenden Zeilen (bewusst standardmässig aus).

    Returns:
        {"value", "source_page", "source_text", "bbox"} oder None.
    """
    label_low = (label or "").lower()
    if not label_low:
        return None
    for sp in word_pages or []:
        seite = sp.get("page")
        zeilen = group_words_to_rows(sp.get("words") or [])
        for zi, row in enumerate(zeilen):
            text_low = row_text(row).lower()
            if label_low not in text_low:
                continue
            # Position des Labelendes bestimmen: das letzte Wort, das noch zum
            # Label gehört. Danach zählt nur, was RECHTS davon steht.
            label_ende_x = _label_ende_x(row, label_low)
            treffer = _zahl_rechts(row, label_ende_x, einheit)
            if treffer is not None:
                return {"value": treffer[0], "source_page": seite,
                        "source_text": row_text(row), "bbox": row_bbox(row)}
            # Optionaler Notfall: dieselbe Spalte, nächste Zeile(n).
            for extra in range(1, max_zeilen_abstand + 1):
                if zi + extra >= len(zeilen):
                    break
                folge = zeilen[zi + extra]
                treffer = _zahl_rechts(folge, label_ende_x, einheit)
                if treffer is not None:
                    return {"value": treffer[0], "source_page": seite,
                            "source_text": f"{row_text(row)} / {row_text(folge)}",
                            "bbox": row_bbox(folge)}
    return None


def _label_ende_x(row, label_low: str) -> float:
    """x1 des letzten Wortes, das noch Teil des Labels ist."""
    laufend = ""
    for w in row:
        laufend = (laufend + " " + w["text"]).strip()
        if label_low in laufend.lower():
            return w["x1"]
    return row[0]["x1"] if row else 0.0


def _zahl_rechts(row, x_grenze: float, einheit):
    """Erste Zahl rechts von `x_grenze`; optional muss die Einheit passen."""
    if einheit:
        einheit_low = einheit.lower().rstrip(".")
        hat_einheit = any((w["text"] or "").strip().lower().rstrip(".") == einheit_low
                          for w in row)
        if not hat_einheit:
            return None
    for w in row:
        if w["x0"] < x_grenze:
            continue
        if _ist_zahl(w["text"]):
            v = parse_number(w["text"])
            if v is not None:
                return v, w
    return None


def find_labeled_rows(word_pages, begriffe) -> list[dict]:
    """Alle Tabellenzeilen, deren Text einen der Begriffe enthält — als
    geparste LV-Zeilen samt Herkunft. Grundlage für Bauteilmengen (Punkt 10)
    und Rohrmeter (Punkt 11)."""
    begriffe_low = [b.lower() for b in begriffe or []]
    out = []
    for sp in word_pages or []:
        seite = sp.get("page")
        for row in group_words_to_rows(sp.get("words") or []):
            text = row_text(row)
            low = text.lower()
            if not any(b in low for b in begriffe_low):
                continue
            parsed = parse_table_row(row)
            parsed.update({"source_page": seite, "source_text": text,
                           "bbox": row_bbox(row)})
            out.append(parsed)
    return out
