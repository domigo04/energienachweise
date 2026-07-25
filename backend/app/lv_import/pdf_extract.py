"""B3 / P0 #1 — Textextraktion aus PDF. Seitenzuordnung bleibt erhalten
(Herkunftsanzeige B9).

`extract_best` erkennt automatisch, ob eine Textebene vorhanden ist: gibt es
born-digital Text, wird dieser genommen ("digital"); sonst greift der deutsche
OCR-Fallback ("ocr"). Findet auch OCR nichts oder fehlen die OCR-Abhängigkeiten,
bleibt es ein Bild-PDF ("image") und die Werte werden manuell erfasst — der
Import stürzt nie ab.

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


def ocr_verfuegbar() -> dict:
    """Diagnose der OCR-Kette im laufenden Deployment (P0 #1). Best-effort, wirft
    nie — meldet nur, was vorhanden ist. Erlaubt es, nach einem Railway-Build in
    einem Klick zu prüfen, ob gescannte LVs per deutscher OCR gelesen werden
    können, ohne erst eine Scan-PDF hochladen zu müssen."""
    from shutil import which
    info = {
        "pytesseract": False, "pdf2image": False, "tesseract_binary": False,
        "poppler": False, "languages": [], "deutsch": False, "ready": False,
    }
    try:
        import pytesseract
        info["pytesseract"] = True
        try:
            info["tesseract_binary"] = bool(pytesseract.get_tesseract_version())
            langs = [str(l) for l in pytesseract.get_languages(config="")]
            info["languages"] = langs
            info["deutsch"] = "deu" in langs
        except Exception:
            pass
    except Exception:
        pass
    try:
        import pdf2image  # noqa: F401
        info["pdf2image"] = True
        info["poppler"] = which("pdftoppm") is not None
    except Exception:
        pass
    info["ready"] = (info["pytesseract"] and info["pdf2image"]
                     and info["tesseract_binary"] and info["deutsch"] and info["poppler"])
    return info


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
