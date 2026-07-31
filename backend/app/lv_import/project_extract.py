"""Projektgrunddaten aus Deckblatt/Kopfseiten (Punkt 19).

Nur was zuverlässig im Dokument steht, wird vorgeschlagen. EBF und
Zertifizierung werden ausdrücklich NICHT geraten. Projektart, Gebäudenutzung
und Nutzungseinheiten werden nur aus einer eindeutigen Projektbezeichnung
abgeleitet und bleiben im Review bearbeitbar.

Der Gebäudenutzungs-Vorschlag ist eine Ausnahme: „3-MFH" ist ein eindeutiger
Hinweis. Er wird als Vorschlag mit Confidence geliefert, nie als gesetzte
Wahrheit — der Nutzer bestätigt im Review.
"""
from __future__ import annotations

import re

from app import fachwerte
from app.lv_import.normalization import parse_int

HIGH, MEDIUM, LOW = "high", "medium", "low"

# "Label: Wert" — die übliche Deckblattform.
_FELDER = {
    "project_name": ("projekt", "objekt", "bauvorhaben", "projektbezeichnung"),
    "location": ("ort", "standort", "adresse", "bauort"),
    "contractor": ("unternehmer", "unternehmung", "firma", "anbieter", "offerent"),
    "client": ("bauherr", "bauherrschaft", "auftraggeber"),
    # Eine Offerte trägt ihre Nummer fast immer als «Offert-Nr.» oder
    # «Angebots-Nr.» — beides fehlte, weshalb die Nummer nie erkannt wurde.
    "project_number": ("projekt-nr", "projekt nr", "projektnummer", "auftrags-nr",
                       "auftragsnummer", "kommission", "objekt-nr",
                       "offert-nr", "offert nr", "offertnr", "offertnummer",
                       "offerte nr", "angebots-nr", "angebotsnummer",
                       "unsere referenz", "referenz-nr"),
    "offer_date": ("datum", "offertdatum", "angebotsdatum", "offerte vom"),
}

# ── Deckblatt ohne Beschriftungen ──────────────────────────────────────────
# Viele Offerten schreiben den Kopf ohne «Projekt:»-Etiketten, einfach
# untereinander. Ohne diese Muster blieb jedes Feld leer.
_PLZ_ORT = re.compile(r"\b(\d{4})\s+([A-ZÄÖÜ][\wÄÖÜäöüß.\-]*(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß.\-]*)*)\s*$")
# Rechtsform am Ende → das ist die Firma, nicht der Projektname.
_FIRMA = re.compile(
    r"\b(?:gmbh|ag|sa|sagl|ohg|kg|kollektivgesellschaft|einzelfirma)\b\.?\s*$",
    re.IGNORECASE)
# Bezeichnungen, die ein Bauvorhaben benennen.
_PROJEKTWORT = re.compile(
    r"\b(ueberbauung|überbauung|neubau|umbau|sanierung|erweiterung|anbau|"
    r"wohnhaus|wohnbau|mfh|efh|siedlung|areal|halle|schulhaus|liegenschaft)\b",
    re.IGNORECASE)
# «Offerte Nr. 2024.0043» / «Nr. 2024-0043»
_NUMMER_FREI = re.compile(
    r"\b(?:offerte?|angebot|auftrag)\s*(?:nr\.?|nummer)?\s*[:.]?\s*"
    r"(\d{2,4}[.\-/]\d{2,6})\b", re.IGNORECASE)
# Datum: 12.03.2024 / 12.3.24 / 2024-03-12
_DATUM = re.compile(r"\b(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})\b")
# "3-MFH", "3 MFH", "5-Familienhaus"
_NUTZUNG_ANZAHL = re.compile(
    r"\b(\d{1,3})\s*[-–\s]?\s*(mfh|efh|familienhaus|fh)\b", re.IGNORECASE)


def _wert_nach_label(zeile: str, labels) -> str | None:
    """`Projekt: 3-MFH Burgstrasse` → `3-MFH Burgstrasse`."""
    low = zeile.lower()
    for label in labels:
        m = re.search(rf"\b{re.escape(label)}\b\s*[:\-]\s*(\S.*)$", low)
        if not m:
            continue
        start = m.start(1)
        wert = zeile[start:].strip(" .;\t")
        # Ein zweites „Label:" auf derselben Zeile abschneiden.
        wert = re.split(r"\s{3,}\S+\s*:", wert)[0].strip()
        if wert and len(wert) <= 160:
            return wert
    return None


def extract_project_data(pages) -> dict:
    """Deckblatt-/Kopfseiten → Grunddaten-Vorschläge.

    Returns:
        {feld: {"value", "confidence", "source_page", "source_text"}}
        Nur belegbare Felder sind enthalten.
    """
    result: dict[str, dict] = {}
    for p in pages or []:
        seite = p.get("page")
        for zeile in (p.get("text") or "").splitlines():
            zeile = zeile.strip()
            if not zeile:
                continue
            for feld, labels in _FELDER.items():
                if feld in result:
                    continue
                wert = _wert_nach_label(zeile, labels)
                if not wert:
                    continue
                if feld == "offer_date":
                    m = _DATUM.search(wert)
                    if not m:
                        continue
                    wert = m.group(1)
                result[feld] = {"value": wert, "confidence": HIGH,
                                "source_page": seite, "source_text": zeile[:200]}

    # Zweiter Durchgang: Deckblätter ohne Beschriftungen.
    _ohne_labels(pages, result)

    # Gebäudenutzung und Projektart als Vorschlag — AUSSCHLIESSLICH aus der
    # Projektbezeichnung. Früher fiel die Ableitung auf den gesamten Text der
    # ersten Seite zurück; irgendein «Wohnen», «Büro» oder «Lager» im Kleinge-
    # druckten setzte dann eine Nutzung, die nirgends behauptet wurde. Ohne
    # Projektbezeichnung bleibt die Nutzung leer.
    quelle = result.get("project_name") or {}
    basis = quelle.get("value") or ""
    nutzung = _nutzung_vorschlag(basis)
    if nutzung:
        result["building_use"] = {
            **nutzung,
            "source_page": quelle.get("source_page"),
            "source_text": quelle.get("source_text"),
        }
        # Nutzungseinheiten NUR wenn ausdrücklich als Anzahl genannt („3-MFH").
        m = _NUTZUNG_ANZAHL.search(basis)
        if m:
            anzahl = parse_int(m.group(1))
            if anzahl and 1 <= anzahl <= 500:
                result["units"] = {
                    "value": anzahl, "confidence": MEDIUM,
                    "source_page": quelle.get("source_page"),
                    "source_text": quelle.get("source_text"),
                    "derived_from": f"„{m.group(0)}" + "“",
                }
    projektart = fachwerte.normalize("project_types", basis)
    if projektart and projektart != "sonstige":
        result["project_type"] = {
            "value": projektart, "confidence": MEDIUM,
            "source_page": quelle.get("source_page"),
            "source_text": quelle.get("source_text"),
        }
    return result


def _ohne_labels(pages, result: dict) -> None:
    """Kopfangaben eines Deckblatts ohne «Label:»-Form.

    Nur die erste Seite, und nur eindeutige Muster: PLZ + Ort, eine Zeile mit
    Rechtsform als Unternehmer, eine Zeile mit einem Bauvorhaben-Wort als
    Projektname, eine Offertnummer. Alles andere bleibt leer — geraten wird
    nichts.
    """
    erste = (pages or [])[:1]
    for p in erste:
        seite = p.get("page")
        zeilen = [z.strip() for z in (p.get("text") or "").splitlines() if z.strip()]
        orte: list[tuple[int, str, str]] = []       # (Zeilenindex, Ort, Zeile)
        projekt_index: int | None = None
        for index, zeile in enumerate(zeilen):
            if len(zeile) > 120:
                continue
            m = _PLZ_ORT.search(zeile)
            if m:
                orte.append((index, f"{m.group(1)} {m.group(2)}".strip(), zeile))
            if projekt_index is None and _PROJEKTWORT.search(zeile) \
                    and not _FIRMA.search(zeile):
                projekt_index = index
            if len(zeile) > 120:
                continue
            if "contractor" not in result and _FIRMA.search(zeile):
                result["contractor"] = {
                    "value": zeile, "confidence": MEDIUM, "source_page": seite,
                    "source_text": zeile[:200],
                }
            if "project_name" not in result and _PROJEKTWORT.search(zeile) \
                    and not _FIRMA.search(zeile):
                result["project_name"] = {
                    "value": zeile, "confidence": MEDIUM, "source_page": seite,
                    "source_text": zeile[:200],
                }
            if "project_number" not in result:
                m = _NUMMER_FREI.search(zeile)
                if m:
                    result["project_number"] = {
                        "value": m.group(1), "confidence": HIGH,
                        "source_page": seite, "source_text": zeile[:200],
                    }
            if "offer_date" not in result:
                m = _DATUM.search(zeile)
                # Ein nacktes Datum gilt nur, wenn die Zeile sonst kaum Text
                # trägt — sonst wäre jedes Datum im Fliesstext das Offertdatum.
                if m and len(re.sub(r"[\d.\-/\s]", "", zeile)) <= 12:
                    result["offer_date"] = {
                        "value": m.group(1), "confidence": MEDIUM,
                        "source_page": seite, "source_text": zeile[:200],
                    }
        # Auf einem Deckblatt stehen ZWEI Adressen: die des Unternehmers oben
        # und die des Bauvorhabens beim Projekt. Massgebend ist der Ort NACH
        # der Projektbezeichnung — sonst landet die Firmenadresse im Projekt.
        if "location" not in result and orte:
            nach_projekt = [o for o in orte
                            if projekt_index is not None and o[0] > projekt_index]
            index, ort, zeile = (nach_projekt or orte)[0]
            result["location"] = {
                "value": ort,
                "confidence": HIGH if nach_projekt else MEDIUM,
                "source_page": seite, "source_text": zeile[:200],
            }


def _nutzung_vorschlag(text: str) -> dict | None:
    """Gebäudenutzung aus dem Projekttext ableiten (Vorschlag, nicht Wahrheit)."""
    if not (text or "").strip():
        return None
    m = _NUTZUNG_ANZAHL.search(text)
    if m:
        kuerzel = m.group(2).lower()
        if kuerzel == "efh":
            return {"value": "efh", "confidence": HIGH}
        # „3-MFH" / „5-Familienhaus" → Mehrfamilienhaus
        return {"value": "mfh", "confidence": HIGH}
    code = fachwerte.normalize("building_uses", text)
    if code and code != "sonstige":
        return {"value": code, "confidence": MEDIUM}
    return None
