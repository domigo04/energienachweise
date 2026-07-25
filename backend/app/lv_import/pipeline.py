"""Eine Extraktionspipeline pro Upload (Punkt 29).

Früher hat jeder Extraktor das PDF neu durchsucht. Jetzt läuft der Weg genau
einmal, und alle Zwischenergebnisse werden weiterverwendet:

    PDF
    ↓ extract_pages()            (born-digital Text, pypdf)
    ↓ spatial extraction         (Wortkoordinaten, pdfplumber — optional)
    ↓ page classification        (welche Seite ist was)
    ↓ positions / features / costs

Die Pipeline entscheidet ausserdem die Extraktionsmethode und hält sie fest
(Punkt 28): `spatial_pdf` > `text` > `ocr` > `image`. Fällt eine Stufe aus,
arbeitet die nächste weiter — bestehende einfache PDFs dürfen nie schlechter
werden.
"""
from __future__ import annotations

from functools import cached_property

from app.lv_import import page_classifier as pc
from app.lv_import.pdf_extract import extract_pages, ist_durchsuchbar, ocr_pages
from app.lv_import.spatial import extract_words, words_to_pages

# Extraktionsmethoden (Punkt 28). "image" = gar kein Text gefunden.
SPATIAL, TEXT, OCR, IMAGE, MANUAL = "spatial_pdf", "text", "ocr", "image", "manual"


class LvPipeline:
    """Hält alle Zwischenergebnisse EINES LV-Imports.

    Absichtlich ohne DB-/Web-Bezug: Eingabe sind Bytes, Ausgabe sind Strukturen.
    Alle Stufen sind `cached_property` — jede läuft höchstens einmal.
    """

    def __init__(self, pdf_bytes: bytes):
        self.pdf_bytes = pdf_bytes or b""

    # ── Stufe 1: Text ──────────────────────────────────────────────────────
    @cached_property
    def _digital_pages(self) -> list[dict]:
        return extract_pages(self.pdf_bytes)

    @cached_property
    def word_pages(self) -> list[dict]:
        """Wortkoordinaten (Punkt 3). Leer, wenn pdfplumber fehlt oder Scan."""
        if not ist_durchsuchbar(self._digital_pages):
            return []
        return [sp for sp in extract_words(self.pdf_bytes) if sp.get("words")]

    @cached_property
    def pages(self) -> list[dict]:
        """Die massgeblichen Textseiten.

        Bevorzugt aus den Wortkoordinaten aufgebaut (visuell korrekte
        Zeilenreihenfolge), sonst der flache pypdf-Text, sonst OCR."""
        if self.word_pages:
            raeumlich = words_to_pages(self.word_pages)
            if ist_durchsuchbar(raeumlich):
                return raeumlich
        if ist_durchsuchbar(self._digital_pages):
            return self._digital_pages
        ocr = ocr_pages(self.pdf_bytes)
        if ist_durchsuchbar(ocr):
            return ocr
        return self._digital_pages

    @cached_property
    def extraction_method(self) -> str:
        if self.word_pages and ist_durchsuchbar(words_to_pages(self.word_pages)):
            return SPATIAL
        if ist_durchsuchbar(self._digital_pages):
            return TEXT
        if ist_durchsuchbar(self.pages):
            return OCR
        return IMAGE

    @property
    def is_searchable(self) -> bool:
        return ist_durchsuchbar(self.pages)

    @property
    def page_count(self) -> int:
        return len(self.pages)

    # ── Stufe 2: Klassifikation ────────────────────────────────────────────
    @cached_property
    def classification(self) -> list[dict]:
        return pc.classify_pages(self.pages)

    @cached_property
    def page_types(self) -> dict:
        return pc.summary(self.classification)

    def pages_for(self, *types) -> list[dict]:
        """Textseiten der gewünschten Klassen (Punkt 2)."""
        return pc.pages_of_type(self.pages, self.classification, *types)

    def word_pages_for(self, *types) -> list[dict]:
        """Wortseiten der gewünschten Klassen — für die räumliche Auswertung."""
        erlaubt = {c["page"] for c in self.classification if c["type"] in set(types)}
        return [sp for sp in self.word_pages if sp.get("page") in erlaubt]

    # ── Fachliche Teilmengen (Punkt 2) ─────────────────────────────────────
    # Fallback-Regel überall gleich: gibt es die spezifische Seitenklasse nicht,
    # wird auf das ganze Dokument zurückgefallen. So bleiben einfache PDFs ohne
    # erkennbare Struktur voll funktionsfähig (Punkt 28).

    @property
    def grunddaten_pages(self) -> list[dict]:
        """Grunddaten: Deckblatt + erste Seiten."""
        seiten = self.pages_for(pc.COVER)
        if seiten:
            return seiten
        return self.pages[:3]

    @property
    def technik_pages(self) -> list[dict]:
        """Technische Mengen: primär LV, sekundär Schema/Beschreibung."""
        seiten = self.pages_for(pc.LV)
        if seiten:
            return seiten
        seiten = self.pages_for(pc.LV, pc.SCHEMA, pc.DESCRIPTION)
        return seiten or self.pages

    @property
    def technik_word_pages(self) -> list[dict]:
        seiten = self.word_pages_for(pc.LV)
        if seiten:
            return seiten
        seiten = self.word_pages_for(pc.LV, pc.SCHEMA, pc.DESCRIPTION)
        return seiten or self.word_pages

    @property
    def cost_summary_pages(self) -> list[dict]:
        """Kostenzusammenstellung — die PRIMARY SOURCE für Kosten (Punkt 13)."""
        return self.pages_for(pc.COST_SUMMARY)

    @property
    def cost_summary_word_pages(self) -> list[dict]:
        return self.word_pages_for(pc.COST_SUMMARY)

    @property
    def lv_pages(self) -> list[dict]:
        """LV-Seiten — Fallback für Kosten (Punkt 13, Priorität 2)."""
        return self.pages_for(pc.LV) or self.pages

    def debug_dump(self) -> dict:
        """Nachvollziehbarkeit (Punkt 30): was wurde wie erkannt."""
        return {
            "extraction_method": self.extraction_method,
            "page_count": self.page_count,
            "is_searchable": self.is_searchable,
            "has_word_coordinates": bool(self.word_pages),
            "page_types": self.page_types,
            "classification": self.classification,
        }
