"""PDF-Export einer Einzelberechnung: Eingaben, Rechenweg, Resultat.

Gleicher visueller Stil wie die übrigen Exporte (export/pdf.py). Die Zahlen
kommen aus dem Rechenkern in `calculations/einzel.py` und werden hier nur noch
gesetzt — Bildschirm und PDF können damit nicht auseinanderlaufen.
"""
import io
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas

PLANER = "SIREGO GmbH · Dominic Goulon · Winterthur"
BLAU = (0.031, 0.498, 0.898)   # #087fe5, die Aktionsfarbe der Marke
DUNKEL = (0.031, 0.184, 0.286)  # #082f49, das Marine der Überschriften
GRAU = (0.45, 0.5, 0.55)
HELLGRAU = (0.96, 0.97, 0.98)

RAND = 20 * 2.834645  # 20 mm
BREITE, HOEHE = A4


def _kopf(c, titel: str, untertitel: str) -> float:
    c.setFillColorRGB(*DUNKEL)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(RAND, HOEHE - RAND - 6, titel)
    y = HOEHE - RAND - 24
    if untertitel:
        c.setFillColorRGB(*GRAU)
        c.setFont("Helvetica", 9.5)
        c.drawString(RAND, y, untertitel)
        y -= 14
    c.setStrokeColorRGB(*BLAU)
    c.setLineWidth(1.4)
    c.line(RAND, y, BREITE - RAND, y)
    return y - 26


def _fuss(c):
    c.setFillColorRGB(*GRAU)
    c.setFont("Helvetica", 7.5)
    c.drawString(RAND, RAND - 6, PLANER)
    c.drawRightString(BREITE - RAND, RAND - 6, date.today().strftime("%d.%m.%Y"))


def _abschnitt(c, y: float, text: str) -> float:
    c.setFillColorRGB(*GRAU)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(RAND, y, text.upper())
    return y - 14


def _zeile(c, y: float, spalten: list[tuple[str, float, str]], *, fett=False, hintergrund=False) -> float:
    """Eine Tabellenzeile. Spalten sind (Text, x-Position, Ausrichtung l|r)."""
    if hintergrund:
        c.setFillColorRGB(*HELLGRAU)
        c.rect(RAND, y - 5, BREITE - 2 * RAND, 16, stroke=0, fill=1)
    c.setFillColorRGB(*(DUNKEL if fett else (0.2, 0.24, 0.3)))
    c.setFont("Helvetica-Bold" if fett else "Helvetica", 9)
    for text, x, aus in spalten:
        if aus == "r":
            c.drawRightString(x, y, text)
        else:
            c.drawString(x, y, text)
    return y - 16


def _umbruch(c, y: float, titel: str, untertitel: str, mindestens: float = 90) -> float:
    """Neue Seite anfangen, bevor eine Tabelle unten aus dem Blatt läuft."""
    if y > RAND + mindestens:
        return y
    _fuss(c)
    c.showPage()
    return _kopf(c, titel, untertitel)


def einzelberechnung_pdf(
    titel: str,
    grundlage: str,
    eingaben: list[dict],
    rechenweg: list[dict],
    ergebnisse: list[dict],
    hinweise: list[str] | None = None,
) -> bytes:
    """Baut das PDF.

    eingaben/ergebnisse: [{"label": …, "wert": …, "einheit": …}]
    rechenweg:           [{"groesse": …, "formel": …, "eingesetzt": …, "ergebnis": …}]
    """
    puffer = io.BytesIO()
    c = pdfcanvas.Canvas(puffer, pagesize=A4)
    c.setTitle(f"{titel} – Einzelberechnung")
    untertitel = f"Einzelberechnung · Grundlage: {grundlage}" if grundlage else "Einzelberechnung"
    y = _kopf(c, titel, untertitel)

    rechts = BREITE - RAND

    y = _abschnitt(c, y, "Eingaben")
    for eintrag in eingaben:
        y = _umbruch(c, y, titel, untertitel)
        einheit = eintrag.get("einheit") or ""
        wert = f"{eintrag['wert']} {einheit}".strip()
        y = _zeile(c, y, [(str(eintrag["label"]), RAND + 4, "l"), (wert, rechts - 4, "r")])
    y -= 12

    if rechenweg:
        y = _abschnitt(c, y, "Rechenweg")
        for schritt in rechenweg:
            y = _umbruch(c, y, titel, untertitel, 110)
            c.setFillColorRGB(*DUNKEL)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(RAND + 4, y, f"{schritt.get('groesse', '')}  {schritt.get('formel', '')}")
            y -= 13
            c.setFillColorRGB(*GRAU)
            c.setFont("Helvetica", 8.5)
            c.drawString(RAND + 14, y, f"= {schritt.get('eingesetzt', '')}")
            c.setFillColorRGB(*BLAU)
            c.setFont("Helvetica-Bold", 9)
            c.drawRightString(rechts - 4, y, f"= {schritt.get('ergebnis', '')}")
            y -= 20
        y -= 4

    y = _umbruch(c, y, titel, untertitel)
    y = _abschnitt(c, y, "Resultat")
    for index, eintrag in enumerate(ergebnisse):
        y = _umbruch(c, y, titel, untertitel)
        einheit = eintrag.get("einheit") or ""
        wert = f"{eintrag['wert']} {einheit}".strip()
        y = _zeile(c, y, [(str(eintrag["label"]), RAND + 4, "l"), (wert, rechts - 4, "r")],
                   fett=True, hintergrund=index == 0)

    if hinweise:
        y -= 14
        y = _umbruch(c, y, titel, untertitel)
        y = _abschnitt(c, y, "Hinweise")
        c.setFillColorRGB(*GRAU)
        c.setFont("Helvetica", 8.5)
        for hinweis in hinweise:
            y = _umbruch(c, y, titel, untertitel)
            c.setFillColorRGB(*GRAU)
            c.setFont("Helvetica", 8.5)
            c.drawString(RAND + 4, y, str(hinweis)[:150])
            y -= 13

    _fuss(c)
    c.showPage()
    c.save()
    return puffer.getvalue()
