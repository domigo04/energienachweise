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
    Sonst ist es vermutlich ein Bild-PDF und braucht OCR."""
    return any((p.get("text") or "").strip() for p in (pages or []))


def ocr_pages(pdf_bytes: bytes) -> list[dict]:
    """OCR-Fallback für Bild-PDF. Best-effort: braucht pdf2image + pytesseract +
    das Tesseract-Binary. Fehlt eine Abhängigkeit, wird [] geliefert (kein
    Absturz) — der Import bleibt dann ein Bild-PDF und wird manuell erfasst."""
    if not pdf_bytes:
        return []
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
    except ImportError:  # pragma: no cover — OCR-Deps optional
        return []
    try:
        images = convert_from_bytes(pdf_bytes)
    except Exception:  # pragma: no cover
        return []
    pages = []
    for i, img in enumerate(images, start=1):
        try:
            text = pytesseract.image_to_string(img, lang="deu")
        except Exception:  # pragma: no cover
            text = ""
        pages.append({"page": i, "text": text})
    return pages


def extract_best(pdf_bytes: bytes):
    """Beste verfügbare Extraktion: zuerst born-digital, sonst OCR-Fallback.
    Rückgabe: (pages, is_searchable, method) mit method ∈ {digital, ocr, image}."""
    pages = extract_pages(pdf_bytes)
    if ist_durchsuchbar(pages):
        return pages, True, "digital"
    ocr = ocr_pages(pdf_bytes)
    if ist_durchsuchbar(ocr):
        return ocr, True, "ocr"
    return pages, False, "image"
