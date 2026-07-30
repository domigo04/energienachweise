"""Seitenklassifikation (Punkt 1).

Ein echtes Unternehmerangebot mischt Deckblatt, Bedingungen, technische
Beschreibung, Schemata, das eigentliche LV und die Kostenzusammenstellung in
EINEM PDF. Wer alles zusammen durchsucht, liest zwangsläufig Ausschreibungs-
werte, Legendentexte und Positionstotale durcheinander.

Darum wird jede Seite VOR der Extraktion einer Dokumentart zugeordnet. Danach
lässt man jeden Extraktor nur noch auf die Seiten los, die fachlich dazugehören
(Punkt 2).

Bewusst regelbasiert und deterministisch — kein ML, keine Wahrscheinlichkeiten,
die niemand nachvollziehen kann. Die Klassifikation bleibt im Debug-Dump
sichtbar (Punkt 30).
"""
from __future__ import annotations

import re

# Klassen (Punkt 1).
COVER = "cover"
CONDITIONS = "conditions"
DESCRIPTION = "description"
SCHEMA = "schema"
LV = "lv"
COST_SUMMARY = "cost_summary"
UNKNOWN = "unknown"

PAGE_TYPES = (COVER, CONDITIONS, DESCRIPTION, SCHEMA, LV, COST_SUMMARY, UNKNOWN)

HIGH, MEDIUM, LOW = "high", "medium", "low"

# ── Signale je Klasse ───────────────────────────────────────────────────────
# Kostenzusammenstellung: Titel + mehrere BKP-Zeilen mit Betrag.
_COST_TITEL = re.compile(
    r"kosten\s*[-–]?\s*zusammenstellung|kostenzusammenstellung"
    r"|zusammenstellung\s+der\s+kosten|^\s*zusammenstellung\s*$",
    re.IGNORECASE | re.MULTILINE,
)
# LV-Tabellenkopf: die typischen Spaltentitel einer Ausschreibung.
_LV_KOPF = (
    ("pos.", "pos ", "position"),
    ("bezeichnung der arbeit", "bezeichnung", "leistungsbeschrieb"),
    ("ausmass", "ausmaß", "menge", "einheit"),
    ("einheitspreis", "ep ", "einheits-preis"),
    ("total", "totalpreis", "betrag"),
)
_SCHEMA_BEGRIFFE = (
    "prinzipschema", "strangschema", "legende heizung", "schemaplan",
    "hydraulikschema", "anlageschema", "legende:", "prinzipschema heizung",
)
_COVER_BEGRIFFE = (
    "ausschreibung und angebot", "ausschreibung / angebot", "offerte",
    "bauherr:", "bauherrschaft", "eingabesumme", "projekt:", "objekt:",
    "angebot für", "devis", "unternehmer:",
)
_CONDITIONS_BEGRIFFE = (
    "allgemeine bedingungen", "besondere bedingungen", "vorbemerkungen",
    "vertragsbedingungen", "sia 118", "allgemeine bestimmungen",
    "zahlungsbedingungen", "garantie", "haftung", "rabatt", "skonto",
    "baureinigung", "bauwasser", "bauwesenversicherung", "baureklame",
    "mehrwertsteuer", "mwst", "netto inkl",
)
_DESCRIPTION_BEGRIFFE = (
    "technische beschreibung", "anlagebeschrieb", "anlagenbeschreibung",
    "funktionsbeschrieb", "systembeschreibung", "grundlagen",
)

# BKP-Zeile mit Betrag: "241.10 Expansion und Sicherheit ... 1'410.00"
_BKP_ZEILE_MIT_BETRAG = re.compile(
    r"^\s*(?:bkp\s*)?(2\d{2}(?:\.\d+)?)\D.*?"
    r"(\d{1,3}(?:[’'\s]\d{3})+(?:[.,](?:\d{2}|-))?"
    r"|\d+[.,](?:\d{2}|-))\s*$",
    re.IGNORECASE,
)
# Reine BKP-Gruppenzeile ohne Betrag ("241 Energielagerung") zählt schwächer mit.
_BKP_ZEILE = re.compile(r"^\s*(?:bkp\s*)?(2\d{2}(?:\.\d+)?)\b", re.IGNORECASE)
# Mengenzeile eines LV: "Stk. 2", "m 150", "m2 45"
_MENGENZEILE = re.compile(
    r"\b(stk\.?|stück|stueck|m|m2|m²|m3|m³|lfm|kg|h|pausch\.?|psch\.?)\s*"
    r"\d[\d’'.,\s]*|\b\d[\d’'.,\s]*\s*(stk\.?|stück|m2|m²|m3|m³|lfm|kg)\b",
    re.IGNORECASE,
)


def _zeilen(text: str) -> list[str]:
    return [z.strip() for z in (text or "").splitlines() if z.strip()]


def _treffer(low: str, begriffe) -> bool:
    return any(b in low for b in begriffe)


def _lv_kopf_score(low: str) -> int:
    """Wie viele der typischen LV-Spaltentitel kommen vor?"""
    return sum(1 for gruppe in _LV_KOPF if any(v in low for v in gruppe))


def classify_page(text: str) -> dict:
    """Eine Seite klassifizieren → {"type", "confidence", "signals"}.

    Reihenfolge der Prüfungen ist bewusst: die Kostenzusammenstellung ist der
    wertvollste Fund (Punkt 13) und wird zuerst geprüft, danach die klar
    erkennbaren Sonderseiten, dann das LV, zuletzt die schwachen Fälle.
    """
    zeilen = _zeilen(text)
    low = "\n".join(zeilen).lower()
    if not low:
        return {"type": UNKNOWN, "confidence": LOW, "signals": ["leer"]}

    signals: list[str] = []
    bkp_mit_betrag = sum(1 for z in zeilen if _BKP_ZEILE_MIT_BETRAG.match(z))
    bkp_zeilen = sum(1 for z in zeilen if _BKP_ZEILE.match(z))
    hat_cost_titel = bool(_COST_TITEL.search(low))
    kopf_score = _lv_kopf_score(low)

    # 1) Kostenzusammenstellung: Titel UND mehrere BKP-Zeilen (Punkt 1).
    #    Der Titel allein genügt nicht (er steht auch im Inhaltsverzeichnis).
    if hat_cost_titel and bkp_mit_betrag >= 2:
        signals += ["kosten-titel", f"{bkp_mit_betrag} BKP-Zeilen mit Betrag"]
        return {"type": COST_SUMMARY, "confidence": HIGH, "signals": signals}
    if hat_cost_titel and bkp_zeilen >= 3:
        signals += ["kosten-titel", f"{bkp_zeilen} BKP-Zeilen"]
        return {"type": COST_SUMMARY, "confidence": MEDIUM, "signals": signals}
    # Fortsetzungsseite einer Zusammenstellung: viele BKP-Betrag-Zeilen, aber
    # kein LV-Tabellenkopf und keine Mengenspalte.
    if bkp_mit_betrag >= 5 and kopf_score <= 1 and not _MENGENZEILE.search(low):
        signals += [f"{bkp_mit_betrag} BKP-Zeilen mit Betrag", "kein LV-Kopf"]
        return {"type": COST_SUMMARY, "confidence": MEDIUM, "signals": signals}

    # 2) Schema-/Legendenseiten — dürfen nie als LV gelesen werden.
    if _treffer(low, _SCHEMA_BEGRIFFE):
        signals.append("schema-begriff")
        return {"type": SCHEMA, "confidence": HIGH, "signals": signals}

    # 3) LV-Seite: Tabellenkopf oder (BKP-Position + Mengenzeile).
    if kopf_score >= 3:
        signals.append(f"LV-Kopf ({kopf_score}/5 Spalten)")
        return {"type": LV, "confidence": HIGH, "signals": signals}
    if kopf_score >= 2 and _MENGENZEILE.search(low):
        signals += [f"LV-Kopf ({kopf_score}/5)", "Mengenzeile"]
        return {"type": LV, "confidence": MEDIUM, "signals": signals}

    # 4) Deckblatt — vor „conditions", weil ein Deckblatt oft auch Rechtstexte
    #    anreisst. Mindestens zwei Deckblattsignale verlangen.
    cover_treffer = sum(1 for b in _COVER_BEGRIFFE if b in low)
    if cover_treffer >= 2:
        signals.append(f"{cover_treffer} Deckblatt-Begriffe")
        return {"type": COVER, "confidence": HIGH if cover_treffer >= 3 else MEDIUM,
                "signals": signals}

    if _treffer(low, _CONDITIONS_BEGRIFFE):
        signals.append("bedingungen-begriff")
        return {"type": CONDITIONS, "confidence": MEDIUM, "signals": signals}
    if _treffer(low, _DESCRIPTION_BEGRIFFE):
        signals.append("beschreibung-begriff")
        return {"type": DESCRIPTION, "confidence": MEDIUM, "signals": signals}

    # 5) Schwacher LV-Verdacht: BKP-Positionen + Mengen, aber ohne Kopfzeile
    #    (Folgeseiten eines LV tragen den Kopf oft nicht erneut).
    if bkp_zeilen >= 1 and _MENGENZEILE.search(low):
        signals += [f"{bkp_zeilen} BKP-Positionen", "Mengenzeile", "kein Kopf"]
        return {"type": LV, "confidence": LOW, "signals": signals}
    if cover_treffer == 1:
        signals.append("ein Deckblatt-Begriff")
        return {"type": COVER, "confidence": LOW, "signals": signals}

    return {"type": UNKNOWN, "confidence": LOW, "signals": ["kein Signal"]}


def classify_pages(pages) -> list[dict]:
    """Alle Seiten klassifizieren → [{"page", "type", "confidence", "signals"}].

    Bleibt an der Seitennummer verankert, damit jede Herkunftsangabe später
    nachvollziehbar bleibt (Punkt 1: im Review/Debug nachvollziehbar)."""
    out = []
    for p in pages or []:
        res = classify_page(p.get("text") or "")
        out.append({"page": p.get("page"), "type": res["type"],
                    "confidence": res["confidence"], "signals": res["signals"]})
    # Eine Kostenzusammenstellung läuft häufig ohne wiederholten Titel auf der
    # nächsten Seite weiter. Falls die erste Seite sicher erkannt wurde, wird
    # eine direkt folgende Seite mit mehreren BKP-/Totalzeilen als Fortsetzung
    # übernommen. So geht die letzte Seite mit Gewerktotal nicht verloren.
    for index in range(1, len(out)):
        if out[index - 1]["type"] != COST_SUMMARY:
            continue
        if out[index]["type"] not in (UNKNOWN, COVER):
            continue
        text = (pages[index].get("text") or "") if index < len(pages or []) else ""
        lines = _zeilen(text)
        bkp_lines = sum(1 for line in lines if _BKP_ZEILE.match(line))
        total_lines = sum(
            1 for line in lines
            if re.match(r"^\s*(?:total|summe)\s+(?:bkp\s*)?\d+", line, re.IGNORECASE)
        )
        if bkp_lines >= 2 and total_lines >= 1:
            out[index] = {
                "page": out[index]["page"],
                "type": COST_SUMMARY,
                "confidence": MEDIUM,
                "signals": ["Fortsetzung Kostenzusammenstellung",
                            f"{bkp_lines} BKP-Zeilen", f"{total_lines} Totalzeilen"],
            }
    return out


def pages_of_type(pages, classification, *types) -> list[dict]:
    """Nur die Seiten der gewünschten Klassen zurückgeben (Punkt 2).

    Damit arbeitet jeder Extraktor auf seiner fachlich richtigen Teilmenge,
    statt auf dem ganzen PDF."""
    gewuenscht = set(types)
    erlaubt = {c["page"] for c in (classification or []) if c["type"] in gewuenscht}
    return [p for p in (pages or []) if p.get("page") in erlaubt]


def summary(classification) -> dict:
    """Seitenzahl je Klasse — für die Import-Zusammenfassung (Punkt 25)."""
    out: dict[str, int] = {}
    for c in classification or []:
        out[c["type"]] = out.get(c["type"], 0) + 1
    return out
