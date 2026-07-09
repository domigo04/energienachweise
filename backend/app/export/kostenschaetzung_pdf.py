"""PDF-Export der Kostenschätzung (KV-Tool): Deckblatt + Zusammenfassung +
Erklärungstext + Tabelle je BKP-Position + ähnlichste Referenzprojekte.

Gleicher visueller Stil wie der Schema-Export (export/pdf.py).
"""
import io
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas

PLANER = "SIREGO GmbH · Dominic Goulon · Winterthur"

_CONF_LABEL = {"hoch": "Hoch", "mittel": "Mittel", "tief": "Tief"}


def _chf(n):
    if n is None:
        return "—"
    return f"{round(n):,}".replace(",", "'") + " CHF"


def _erklaerung(result: dict) -> str:
    """Kurztext analog zur Frontend-Erklärung (KostenschaetzungPage.jsx) —
    fürs PDF bewusst einfacher gehalten, da hier kein Vergleich mit einer
    einzelnen Referenz im Detail nötig ist wie in der Live-Ansicht."""
    n = result.get("anzahl_referenzen") or 0
    total = _chf(result.get("total"))
    aehn = (result.get("aehnlichkeit") or {}).get("stufe")
    overall = result.get("overall_confidence")
    satz = f"Ähnlichkeit der besten Referenz: {_CONF_LABEL.get(aehn, '—')}. "
    if overall == "hoch":
        satz += f"Validierung hoch: {n} Referenzen bestätigen das mit ähnlichen Zahlen — die {total} sind als Richtwert gut brauchbar."
    elif overall == "mittel":
        satz += f"Validierung mittel: {n} Referenzen passen einigermassen — {total} als Hausnummer nehmen und grösste Positionen prüfen."
    else:
        satz += f"Validierung tief: erst {n} vergleichbare Referenz(en) — Bandbreite mit Vorsicht verwenden."
    zuschlag_bkp = [r["bkp_nr"] for r in (result.get("rows") or []) if r.get("hinweis")]
    if zuschlag_bkp:
        satz += f" Für {', '.join(zuschlag_bkp)} gibt es noch keine passenden Referenzen — dort wurde ein Komplexitätszuschlag geschätzt (siehe Hinweise unten)."
    return satz


def _deckblatt(c, projekt_name, inputs):
    w, h = A4
    c.setPageSize(A4)
    c.setFillColorRGB(0.86, 0.15, 0.15)
    c.rect(0, h - 24, w, 24, stroke=0, fill=1)
    c.setFillColorRGB(0.1, 0.12, 0.2)
    c.setFont("Helvetica", 11)
    c.drawString(50, h - 90, "Heizungscockpit — Kostenschätzung")
    c.setFont("Helvetica-Bold", 26)
    c.drawString(50, h - 130, projekt_name or "Projekt")
    c.setFont("Helvetica", 11)
    y = h - 175
    merkmale = [
        ("Projektart", inputs.get("projektart")), ("Gebäudetyp", inputs.get("gebaeudetyp")),
        ("Ausbauumfang", inputs.get("ausbauumfang")), ("Anlagenkonfiguration", inputs.get("anlagenkonfiguration")),
        ("Datum", date.today().strftime("%d.%m.%Y")), ("Planer", PLANER),
    ]
    for label, wert in merkmale:
        if not wert:
            continue
        c.setFillColorRGB(0.45, 0.5, 0.55)
        c.drawString(50, y, label)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.drawString(180, y, str(wert))
        y -= 20
    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.setFont("Helvetica", 8)
    c.drawString(50, 40, "Grobschätzung aus ähnlichkeitsgewichteten Referenzprojekten — kein Devis/keine Ausschreibung.")
    c.showPage()


def _zusammenfassung_seite(c, result, erklaerung_text):
    w, h = A4
    c.setPageSize(A4)
    y = h - 60
    c.setFont("Helvetica-Bold", 16)
    c.setFillColorRGB(0.1, 0.12, 0.2)
    c.drawString(50, y, "Zusammenfassung")
    y -= 35

    karten = [
        ("Summe (Kontrollzahl)", _chf(result.get("total"))),
        ("Bandbreite tief", _chf(result.get("total_low"))),
        ("Bandbreite hoch", _chf(result.get("total_high"))),
        ("Ähnlichkeit beste Referenz", _CONF_LABEL.get((result.get("aehnlichkeit") or {}).get("stufe"), "—")),
        ("Validierung (Anzahl Referenzen)", _CONF_LABEL.get(result.get("overall_confidence"), "—")),
    ]
    c.setFont("Helvetica", 10)
    for label, wert in karten:
        c.setFillColorRGB(0.45, 0.5, 0.55)
        c.drawString(50, y, label)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(260, y, str(wert))
        c.setFont("Helvetica", 10)
        y -= 18

    y -= 15
    c.setFont("Helvetica-Bold", 11)
    c.setFillColorRGB(0.1, 0.12, 0.2)
    c.drawString(50, y, "Einordnung")
    y -= 18
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.25, 0.28, 0.32)
    for zeile in _wrap(erklaerung_text, 95):
        c.drawString(50, y, zeile)
        y -= 13

    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.setFont("Helvetica", 8)
    c.drawString(50, 30, f"{date.today().strftime('%d.%m.%Y')} · {PLANER}")
    c.showPage()


def _wrap(text, breite):
    woerter = (text or "").split()
    zeilen, aktuelle = [], ""
    for wort in woerter:
        probe = (aktuelle + " " + wort).strip()
        if len(probe) > breite:
            zeilen.append(aktuelle)
            aktuelle = wort
        else:
            aktuelle = probe
    if aktuelle:
        zeilen.append(aktuelle)
    return zeilen or [""]


def _bkp_tabelle_seiten(c, rows, projekt_name):
    w, h = A4
    spalten = [(50, "BKP"), (100, "Position"), (330, "Kennwert"), (410, "Schätzung"), (490, "Vertrauen")]

    def kopf():
        c.setPageSize(A4)
        c.setFont("Helvetica-Bold", 14)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.drawString(50, h - 50, f"Schätzung je BKP-Position — {projekt_name}")
        c.setFont("Helvetica-Bold", 9)
        yy = h - 80
        for x, t in spalten:
            c.drawString(x, yy, t)
        c.setLineWidth(0.5)
        c.line(50, yy - 4, w - 50, yy - 4)
        return yy - 18

    y = kopf()
    c.setFont("Helvetica", 9)
    for r in rows:
        if y < 60:
            c.showPage()
            y = kopf()
            c.setFont("Helvetica", 9)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.drawString(50, y, r["bkp_nr"])
        c.drawString(100, y, (r.get("bkp_name") or "")[:38])
        c.drawString(330, y, f"{r['kennwert']} {r.get('einheit', '')}")
        c.drawString(410, y, _chf(r["estimate"]))
        c.drawString(490, y, _CONF_LABEL.get(r.get("confidence"), "—"))
        y -= 14
        if r.get("hinweis"):
            c.setFont("Helvetica-Oblique", 7.5)
            c.setFillColorRGB(0.7, 0.45, 0.1)
            for zeile in _wrap(r["hinweis"], 110):
                c.drawString(60, y, zeile)
                y -= 10
            c.setFont("Helvetica", 9)
            y -= 2
    c.showPage()


def _referenzen_seite(c, referenzen, projekt_name):
    if not referenzen:
        return
    w, h = A4
    c.setPageSize(A4)
    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0.1, 0.12, 0.2)
    c.drawString(50, h - 50, f"Ähnlichste Referenzprojekte — {projekt_name}")
    y = h - 80
    c.setFont("Helvetica", 9)
    for r in referenzen:
        if y < 60:
            c.showPage()
            c.setPageSize(A4)
            y = h - 50
            c.setFont("Helvetica", 9)
        zeile = (f"{r.get('name', '—')} · {r.get('gebaeudetyp', '—')} · {r.get('anlagenkonfiguration', '—')} · "
                 f"Gewicht {r.get('gewicht', '—')}")
        c.drawString(50, y, zeile[:110])
        y -= 14
    c.showPage()


def erzeuge_kostenschaetzung_pdf(projekt_name: str, inputs: dict, result: dict) -> bytes:
    """Komplettes PDF: Deckblatt + Zusammenfassung/Erklärung + BKP-Tabelle + Referenzen."""
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{projekt_name} — Kostenschätzung")
    _deckblatt(c, projekt_name, inputs or {})
    _zusammenfassung_seite(c, result or {}, _erklaerung(result or {}))
    _bkp_tabelle_seiten(c, (result or {}).get("rows") or [], projekt_name)
    _referenzen_seite(c, (result or {}).get("referenzen") or [], projekt_name)
    c.save()
    return buf.getvalue()
