"""Projektgrunddaten aus Deckblatt/Kopfseiten (Punkt 19).

Nur was zuverlässig im Dokument steht, wird vorgeschlagen. EBF, Zertifizierung,
Projektart und Nutzungseinheiten werden ausdrücklich NICHT geraten — sie sind
vergleichsrelevant und müssen aus dem Dokument belegbar sein oder vom Nutzer
kommen (Punkt 19/20).

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
    "project_number": ("projekt-nr", "projekt nr", "projektnummer", "auftrags-nr",
                       "auftragsnummer", "kommission", "objekt-nr"),
    "offer_date": ("datum", "offertdatum", "angebotsdatum"),
}
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

    # Gebäudenutzung als Vorschlag (Punkt 19) — aus dem Projekttext.
    basis = " ".join(
        (result.get(f, {}).get("value") or "") for f in ("project_name", "location"))
    if not basis.strip():
        basis = " ".join((p.get("text") or "") for p in (pages or [])[:1])
    nutzung = _nutzung_vorschlag(basis)
    if nutzung:
        quelle = result.get("project_name") or {}
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
    return result


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
