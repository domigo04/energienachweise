"""PDF-Export der Kostenschätzung (KV-Tool): Deckblatt + Projektzusammenfassung
+ Einordnung + Kostenzusammenstellung (mit Balkendiagramm) + Referenzprojekte.

Gleicher visueller Stil wie der Schema-Export (export/pdf.py). Bewusst OHNE
"Vertrauen"-Spalte in der Tabelle (Dominic-Feedback: reicht als Detail in der
Web-Ansicht, im PDF nur die Auflistung + Einordnung).
"""
import io
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas

PLANER = "SIREGO GmbH · Dominic Goulon · Winterthur"
ROT = (0.86, 0.15, 0.15)
DUNKEL = (0.1, 0.12, 0.2)
GRAU = (0.45, 0.5, 0.55)
HELLGRAU = (0.96, 0.97, 0.98)

_CONF_LABEL = {"hoch": "Hoch", "mittel": "Mittel", "tief": "Tief"}
_WAERMEERZEUGER_LABEL = "Wärmeerzeuger"
_WAERMEABGABE_LABEL = "Wärmeabgabe"


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


def _kopfzeile(c, titel, projekt_name):
    w, h = A4
    c.setPageSize(A4)
    c.setFillColorRGB(*ROT)
    c.rect(0, h - 10, w, 10, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 15)
    c.setFillColorRGB(*DUNKEL)
    c.drawString(50, h - 45, titel)
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(*GRAU)
    c.drawRightString(w - 50, h - 45, projekt_name or "")
    c.setLineWidth(0.75)
    c.setStrokeColorRGB(0.85, 0.87, 0.9)
    c.line(50, h - 58, w - 50, h - 58)
    return h - 90


def _fusszeile(c, w):
    c.setFillColorRGB(*GRAU)
    c.setFont("Helvetica", 7.5)
    c.drawString(50, 30, f"{date.today().strftime('%d.%m.%Y')} · {PLANER} · Grobschätzung, kein Devis/keine Ausschreibung")


def _deckblatt(c, projekt_name, inputs):
    w, h = A4
    c.setPageSize(A4)
    c.setFillColorRGB(*ROT)
    c.rect(0, h - 24, w, 24, stroke=0, fill=1)
    c.setFillColorRGB(*DUNKEL)
    c.setFont("Helvetica", 11)
    c.drawString(50, h - 90, "Heizungscockpit — Kostenschätzung")
    c.setFont("Helvetica-Bold", 28)
    c.drawString(50, h - 132, projekt_name or "Projekt")
    c.setFont("Helvetica", 11)
    y = h - 175
    for label, wert in [("Datum", date.today().strftime("%d.%m.%Y")), ("Planer", PLANER)]:
        c.setFillColorRGB(*GRAU)
        c.drawString(50, y, label)
        c.setFillColorRGB(*DUNKEL)
        c.drawString(150, y, str(wert))
        y -= 20
    c.setFillColorRGB(*GRAU)
    c.setFont("Helvetica", 8)
    c.drawString(50, 40, "Grobschätzung aus ähnlichkeitsgewichteten Referenzprojekten — kein Devis/keine Ausschreibung.")
    c.showPage()


def _projektzusammenfassung_seite(c, projekt_name, inputs):
    w, h = A4
    y = _kopfzeile(c, "Projektzusammenfassung — Schätzungsgrundlagen", projekt_name)

    einfache_felder = [
        ("Projektart", inputs.get("projektart")), ("Gebäudetyp", inputs.get("gebaeudetyp")),
        ("Ausbauumfang", inputs.get("ausbauumfang")), ("Zertifizierung", inputs.get("zertifizierung")),
        ("Anlagenkonfiguration", inputs.get("anlagenkonfiguration")),
    ]
    listen_felder = [
        (_WAERMEERZEUGER_LABEL, ", ".join(inputs.get("waermeerzeuger") or []) or "—"),
        (_WAERMEABGABE_LABEL, ", ".join(inputs.get("waermeabgabe") or []) or "—"),
    ]
    bezugsgroessen = [
        ("EBF", inputs.get("ebf"), "m²"), ("Erzeugerleistung", inputs.get("heizleistung_kw"), "kW"),
        ("Anzahl Einheiten", inputs.get("anzahl_einheiten"), ""), ("Bohrmeter", inputs.get("bohrmeter"), "m"),
    ]

    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*DUNKEL)
    c.drawString(50, y, "Projekt-Merkmale")
    y -= 20
    c.setFont("Helvetica", 9.5)
    for label, wert in einfache_felder + listen_felder:
        if not wert:
            continue
        c.setFillColorRGB(*GRAU)
        c.drawString(50, y, label)
        c.setFillColorRGB(*DUNKEL)
        for i, zeile in enumerate(_wrap(str(wert), 78)):
            c.drawString(220, y - i * 13, zeile)
        y -= 16 * max(1, len(_wrap(str(wert), 78)))

    y -= 12
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*DUNKEL)
    c.drawString(50, y, "Bezugsgrössen")
    y -= 20
    c.setFont("Helvetica", 9.5)
    for label, wert, einheit in bezugsgroessen:
        if wert in (None, ""):
            continue
        c.setFillColorRGB(*GRAU)
        c.drawString(50, y, label)
        c.setFillColorRGB(*DUNKEL)
        c.drawString(220, y, f"{wert} {einheit}".strip())
        y -= 16

    y -= 12
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*DUNKEL)
    c.drawString(50, y, "Baupreisindex berücksichtigt")
    c.setFont("Helvetica", 9.5)
    c.drawString(220, y, "Ja" if inputs.get("baupreisindex_beruecksichtigen") else "Nein")

    _fusszeile(c, w)
    c.showPage()


def _zusammenfassung_seite(c, projekt_name, result, erklaerung_text):
    w, h = A4
    y = _kopfzeile(c, "Zusammenfassung & Einordnung", projekt_name)

    karten = [
        ("Summe (Kontrollzahl)", _chf(result.get("total"))),
        ("Bandbreite tief", _chf(result.get("total_low"))),
        ("Bandbreite hoch", _chf(result.get("total_high"))),
        ("Ähnlichkeit beste Referenz", _CONF_LABEL.get((result.get("aehnlichkeit") or {}).get("stufe"), "—")),
        ("Validierung", _CONF_LABEL.get(result.get("overall_confidence"), "—")),
    ]
    kartenbreite = (w - 100) / len(karten)
    for i, (label, wert) in enumerate(karten):
        x = 50 + i * kartenbreite
        c.setFillColorRGB(*HELLGRAU)
        c.roundRect(x, y - 55, kartenbreite - 8, 55, 4, stroke=0, fill=1)
        c.setFillColorRGB(*GRAU)
        c.setFont("Helvetica", 7.5)
        for j, zeile in enumerate(_wrap(label, 16)):
            c.drawString(x + 8, y - 16 - j * 9, zeile)
        c.setFillColorRGB(*DUNKEL)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x + 8, y - 45, wert)
    y -= 85

    c.setFont("Helvetica-Bold", 11)
    c.setFillColorRGB(*DUNKEL)
    c.drawString(50, y, "Einordnung")
    y -= 18
    c.setFont("Helvetica", 9.5)
    c.setFillColorRGB(0.25, 0.28, 0.32)
    for zeile in _wrap(erklaerung_text, 92):
        c.drawString(50, y, zeile)
        y -= 14

    _fusszeile(c, w)
    c.showPage()


def _kostenzusammenstellung_seiten(c, rows, projekt_name):
    w, h = A4
    spalten_x = [50, 100, 400, 480]
    titel = ["BKP", "Position", "Schätzung", "tief–hoch"]

    def kopf():
        y = _kopfzeile(c, "Kostenzusammenstellung je BKP-Position", projekt_name)
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColorRGB(*GRAU)
        for x, t in zip(spalten_x, titel):
            if t in ("Schätzung",):
                c.drawRightString(x + 70, y, t)
            else:
                c.drawString(x, y, t)
        c.setStrokeColorRGB(0.85, 0.87, 0.9)
        c.line(50, y - 5, w - 50, y - 5)
        return y - 20

    y = kopf()
    total = 0
    for i, r in enumerate(rows):
        bedarf = 16 + (10 if r.get("hinweis") else 0)
        if y - bedarf < 70:
            c.showPage()
            y = kopf()
        if i % 2 == 0:
            c.setFillColorRGB(*HELLGRAU)
            c.rect(50, y - 11, w - 100, 16, stroke=0, fill=1)
        c.setFont("Helvetica", 9)
        c.setFillColorRGB(*DUNKEL)
        c.drawString(spalten_x[0], y, r["bkp_nr"])
        c.drawString(spalten_x[1], y, (r.get("bkp_name") or "")[:44])
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(spalten_x[2] + 70, y, _chf(r["estimate"]))
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(*GRAU)
        c.drawString(spalten_x[3], y, f"{_chf(r['low'])} – {_chf(r['high'])}")
        total += r["estimate"] or 0
        y -= 16
        if r.get("hinweis"):
            c.setFont("Helvetica-Oblique", 7.5)
            c.setFillColorRGB(0.7, 0.45, 0.1)
            for zeile in _wrap(r["hinweis"], 108):
                c.drawString(spalten_x[1], y, zeile)
                y -= 10
            y -= 2

    y -= 6
    c.setLineWidth(0.75)
    c.setStrokeColorRGB(*DUNKEL)
    c.line(50, y, w - 50, y)
    y -= 16
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(*DUNKEL)
    c.drawString(spalten_x[1], y, "Summe (Kontrollzahl)")
    c.drawRightString(spalten_x[2] + 70, y, _chf(total))

    _fusszeile(c, w)
    c.showPage()


def _diagramm_seite(c, rows, projekt_name):
    """Horizontales Balkendiagramm: Schätzung je BKP-Position (tief–hoch als
    dünnerer Hintergrundbalken, Schätzung als kräftiger Balken darüber)."""
    if not rows:
        return
    w, h = A4
    y = _kopfzeile(c, "Diagramm — Schätzung je BKP-Position", projekt_name)

    max_wert = max((r.get("high") or r.get("estimate") or 0) for r in rows) or 1
    balken_x0 = 140
    balken_breite_max = w - 50 - balken_x0
    balken_h = 14
    zeile_h = 24

    c.setFont("Helvetica", 8)
    for r in rows:
        if y - zeile_h < 70:
            c.showPage()
            y = _kopfzeile(c, "Diagramm — Schätzung je BKP-Position (Fortsetzung)", projekt_name)
        label = f"{r['bkp_nr']}"
        c.setFillColorRGB(*DUNKEL)
        c.drawString(50, y - balken_h + 3, label[:14])

        lo_x = balken_x0 + (r.get("low") or 0) / max_wert * balken_breite_max
        hi_x = balken_x0 + (r.get("high") or 0) / max_wert * balken_breite_max
        est_x = balken_x0 + (r.get("estimate") or 0) / max_wert * balken_breite_max
        mitte_y = y - balken_h / 2

        # Hauptbalken 0 → Schätzung
        c.setFillColorRGB(*ROT)
        c.rect(balken_x0, y - balken_h, max(est_x - balken_x0, 1), balken_h, stroke=0, fill=1)

        # Bandbreite tief–hoch als Whisker (Linie + Endstriche) über dem Balken
        c.setStrokeColorRGB(*GRAU)
        c.setLineWidth(1)
        c.line(lo_x, mitte_y, hi_x, mitte_y)
        for x in (lo_x, hi_x):
            c.line(x, mitte_y - 4, x, mitte_y + 4)

        c.setFont("Helvetica", 7.5)
        c.setFillColorRGB(*GRAU)
        c.drawString(max(est_x, hi_x) + 5, y - balken_h + 3, _chf(r.get("estimate")))
        c.setFont("Helvetica", 8)
        y -= zeile_h

    y -= 10
    c.setFont("Helvetica", 7.5)
    c.setFillColorRGB(*GRAU)
    c.drawString(50, y, "Balken = Schätzung (von 0) · Querstrich = Bandbreite tief–hoch")

    _fusszeile(c, w)
    c.showPage()


def _referenzen_seite(c, referenzen, projekt_name):
    if not referenzen:
        return
    w, h = A4
    y = _kopfzeile(c, "Ähnlichste Referenzprojekte", projekt_name)
    c.setFont("Helvetica", 9)
    for i, r in enumerate(referenzen):
        if y < 70:
            c.showPage()
            y = _kopfzeile(c, "Ähnlichste Referenzprojekte (Fortsetzung)", projekt_name)
        if i % 2 == 0:
            c.setFillColorRGB(*HELLGRAU)
            c.rect(50, y - 11, w - 100, 16, stroke=0, fill=1)
        c.setFillColorRGB(*DUNKEL)
        zeile = (f"{r.get('name', '—')} · {r.get('gebaeudetyp', '—')} · {r.get('anlagenkonfiguration', '—')} · "
                 f"Gewicht {r.get('gewicht', '—')}")
        c.drawString(55, y, zeile[:115])
        y -= 16
    _fusszeile(c, w)
    c.showPage()


def erzeuge_kostenschaetzung_pdf(projekt_name: str, inputs: dict, result: dict) -> bytes:
    """Komplettes PDF: Deckblatt + Projektzusammenfassung + Zusammenfassung/
    Einordnung + Kostenzusammenstellung + Diagramm + Referenzen."""
    inputs, result = inputs or {}, result or {}
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{projekt_name} — Kostenschätzung")
    _deckblatt(c, projekt_name, inputs)
    _projektzusammenfassung_seite(c, projekt_name, inputs)
    _zusammenfassung_seite(c, projekt_name, result, _erklaerung(result))
    _kostenzusammenstellung_seiten(c, result.get("rows") or [], projekt_name)
    _diagramm_seite(c, result.get("rows") or [], projekt_name)
    _referenzen_seite(c, result.get("referenzen") or [], projekt_name)
    c.save()
    return buf.getvalue()
