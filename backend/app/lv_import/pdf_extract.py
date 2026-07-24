"""B3 — Textextraktion aus born-digital PDF (pypdf). Seitenzuordnung bleibt
erhalten (Herkunftsanzeige B9). OCR ist ein späterer Fallback und hier bewusst
NICHT enthalten; Bild-PDFs liefern dann leere Seiten (Status bleibt sauber).

Getrennte Schicht: kein DB-, kein Web-Bezug — nur Bytes → Seiten.
"""
from __future__ import annotations


def extract_pages(pdf_bytes: bytes) -> list[dict]:
    """PDF-Bytes → [{"page": 1, "text": "..."}, ...]. Fehler/leere PDFs → []."""
    if not pdf_bytes:
        return []
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover
        return []
    import io
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception:
        return []
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append({"page": i, "text": text})
    return pages


def ist_durchsuchbar(pages) -> bool:
    """Heuristik: enthält mindestens eine Seite echten Text (born-digital)?
    Sonst ist es vermutlich ein Bild-PDF und braucht später OCR."""
    return any((p.get("text") or "").strip() for p in (pages or []))
