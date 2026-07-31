"""Kommerzielle Konditionen deterministisch aus dem Schlussblatt lesen.

Bisher entstanden Konditionen ausschliesslich aus der visuellen KI-Prüfung.
Ohne API-Schlüssel, bei abgeschaltetem LLM oder nach einem Timeout blieb die
Konditionsliste deshalb leer und die Bruttosumme stand auf 0 — obwohl Rabatt,
Skonto und MWST sauber im Text stehen. Das war kein Erkennungs-, sondern ein
Architekturproblem: für einen rein textlichen Vorgang gab es keinen Parser.

Dieser Parser liest die übliche Schweizer Schlussrechnung:

    Total Heizung                        256'219.20
    Rabatt              12 %              30'746.30
    Skonto               2 %               4'509.45
    Baureinigung       0.5 %               1'104.82
    Baureklame pauschal                      200.00
    MWST               8.1 %              17'703.40
    Gesamttotal                          236'264.05

Die Rechenkette selbst bleibt in `commercial` — hier wird nur gelesen.
"""
from __future__ import annotations

import re

from app.lv_import.normalization import parse_number

# Betrag am Zeilenende, Schweizer Schreibweise.
_BETRAG = re.compile(
    r"(\d{1,3}(?:[’'\s]\d{3})+(?:[.,](?:\d{2}|-))?|\d+[.,](?:\d{2}|-)|\d{4,})\s*$")
# Prozentsatz irgendwo in der Zeile: «12 %», «0.5%», «8,1 %».
_PROZENT = re.compile(r"(\d{1,2}(?:[.,]\d{1,2})?)\s*%")

# Zeilen, die die Bemessungsgrundlage nennen.
_BASIS = ("total heizung", "totalheizung", "lv-summe", "lv summe", "nettosumme",
          "zwischentotal", "total netto", "summe lv", "total lv", "bruttosumme",
          "total arbeitsgattung", "total gewerk")
# Die Endsumme — danach folgt keine weitere Kondition mehr.
_ENDE = ("gesamttotal", "endtotal", "total inkl", "rechnungsbetrag",
         "total brutto inkl", "endsumme")
_MWST = ("mwst", "mehrwertsteuer", "vat", "tva")

# Konditionsarten. Reihenfolge zählt: «Baureinigung» vor dem allgemeinen
# «Reinigung», sonst greift der unspezifische Treffer.
_ARTEN: tuple[tuple[str, tuple[str, ...], str], ...] = (
    ("Rabatt", ("rabatt",), "deduction"),
    ("Skonto", ("skonto",), "deduction"),
    ("Baureinigung/Beschädigungen",
     ("baureinigung", "beschaedigung", "beschädigung", "reinigung"), "deduction"),
    ("Bauwasser und elektrische Energie",
     ("bauwasser", "baustrom", "elektrische energie", "wasser und energie"), "deduction"),
    ("Bauwesenversicherung",
     ("bauwesenversicherung", "bauversicherung", "versicherung"), "deduction"),
    ("Baureklame", ("baureklame", "reklametafel", "bautafel"), "deduction"),
    ("Zuschlag", ("zuschlag", "teuerung"), "surcharge"),
)


def _falte(text: str) -> str:
    low = (text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        low = low.replace(a, b)
    return re.sub(r"\s+", " ", low).strip()


def _betrag(zeile: str) -> float | None:
    treffer = _BETRAG.search(zeile)
    return parse_number(treffer.group(1)) if treffer else None


def _art(gefaltet: str) -> tuple[str, str] | None:
    for label, begriffe, richtung in _ARTEN:
        if any(begriff in gefaltet for begriff in begriffe):
            return label, richtung
    return None


def parse_conditions(pages) -> dict:
    """Schlussblatt → Basissumme, Konditionen, MWST und ausgewiesene Endsumme.

    Returns:
        {"base_amount", "conditions", "vat_rate", "stated_vat_amount",
         "stated_total_incl_vat", "source_page"}
    """
    base_amount: float | None = None
    vat_rate: float | None = None
    stated_vat: float | None = None
    stated_total: float | None = None
    quelle: int | None = None
    conditions: list[dict] = []
    gesehen: set[str] = set()

    for seite in pages or []:
        nummer = seite.get("page")
        for roh in str(seite.get("text") or "").splitlines():
            zeile = roh.strip()
            if not zeile:
                continue
            gefaltet = _falte(zeile)
            betrag = _betrag(zeile)
            prozent_treffer = _PROZENT.search(zeile)
            prozent = parse_number(prozent_treffer.group(1)) if prozent_treffer else None

            # Endsumme: danach kommt nichts mehr, aber die Zeile selbst zählt.
            if any(begriff in gefaltet for begriff in _ENDE):
                if betrag is not None:
                    stated_total = betrag
                    quelle = quelle or nummer
                continue

            if any(begriff in gefaltet for begriff in _MWST):
                if prozent is not None:
                    vat_rate = prozent
                if betrag is not None:
                    stated_vat = betrag
                quelle = quelle or nummer
                continue

            # Bemessungsgrundlage — die zuletzt genannte gilt.
            if any(begriff in gefaltet for begriff in _BASIS) and betrag is not None:
                base_amount = betrag
                quelle = quelle or nummer
                continue

            art = _art(gefaltet)
            if not art:
                continue
            label, richtung = art
            # Ohne Prozentsatz UND ohne Betrag ist es nur eine Erwähnung im
            # Bedingungstext, keine Kondition.
            if prozent is None and betrag is None:
                continue
            if label in gesehen:
                continue
            gesehen.add(label)
            conditions.append({
                "label": label,
                "kind": "percent" if prozent is not None else "fixed",
                "direction": richtung,
                "rate_percent": prozent,
                "amount": betrag,
                "basis_amount": None,
                "order": len(conditions) + 1,
                "source_page": nummer,
                "source_text": zeile[:200],
            })

    return {
        "base_amount": base_amount,
        "conditions": conditions,
        "vat_rate": vat_rate,
        "stated_vat_amount": stated_vat,
        "stated_total_incl_vat": stated_total,
        "source_page": quelle,
    }


def has_conditions(result: dict) -> bool:
    return bool((result or {}).get("conditions")) or (result or {}).get("vat_rate") is not None
