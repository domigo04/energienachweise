"""Diagramme für den PDF-Export — dieselben Reihen wie im Editor.

Gezeichnet wird direkt als Vektor auf den ReportLab-Canvas: keine zusätzliche
Bibliothek, kein Rasterbild, in jeder Zoomstufe scharf. Die Funktionen rechnen
nicht; sie stellen ausschliesslich bereits berechnete Reihen dar, damit
Berechnung, Editor und Export denselben Stand zeigen.
"""

import math

# Gleiche Farbrolle wie im Editor, damit Bildschirm und PDF zusammenpassen.
FARBEN = {
    "blau": (0.23, 0.51, 0.96),
    "tuerkis": (0.01, 0.43, 0.63),
    "rot": (0.86, 0.15, 0.15),
    "gruen": (0.08, 0.50, 0.18),
    "violett": (0.49, 0.27, 0.93),
    "gelb": (0.63, 0.39, 0.04),
    "oliv": (0.52, 0.66, 0.20),
    "grau": (0.58, 0.62, 0.68),
}

ACHSE = (0.55, 0.60, 0.66)
RASTER = (0.89, 0.91, 0.94)
TEXT = (0.29, 0.34, 0.41)
TITEL = (0.10, 0.12, 0.20)

RAND_LINKS = 34
RAND_UNTEN = 26
RAND_OBEN = 24
RAND_RECHTS = 7


def _zahl(wert: float) -> str:
    """Achsen- und Wertbeschriftung ohne unnötige Nullen."""
    if wert is None:
        return "—"
    if abs(wert) >= 100:
        return f"{wert:,.0f}".replace(",", "'")
    text = f"{wert:.{2 if abs(wert) >= 1 else 3}f}".rstrip("0").rstrip(".")
    return text or "0"


def _obergrenze(maximum: float) -> float:
    """Achsenende auf einen glatten Wert aufrunden."""
    if maximum <= 0:
        return 1.0
    stufe = 10 ** math.floor(math.log10(maximum))
    for faktor in (1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8):
        if maximum <= stufe * faktor:
            return stufe * faktor
    return stufe * 10


def _rahmen(c, x, y, breite, hoehe, titel):
    c.setStrokeColorRGB(*RASTER)
    c.setLineWidth(0.6)
    c.setFillColorRGB(1, 1, 1)
    c.rect(x, y, breite, hoehe, stroke=1, fill=0)
    c.setFillColorRGB(*TITEL)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x + 6, y + hoehe - 10, titel)


def _y_achse(c, px, py, pb, ph, hoechstwert, einheit):
    """Waagrechte Rasterlinien mit Beschriftung; gibt den Achsenendwert."""
    ende = _obergrenze(hoechstwert)
    c.setFont("Helvetica", 5.5)
    for i in range(5):
        wert = ende * i / 4
        ly = py + ph * i / 4
        c.setStrokeColorRGB(*(ACHSE if i == 0 else RASTER))
        c.setLineWidth(0.5)
        c.line(px, ly, px + pb, ly)
        c.setFillColorRGB(*TEXT)
        c.drawRightString(px - 3, ly - 1.8, _zahl(wert))
    if einheit:
        c.setFillColorRGB(*TEXT)
        c.drawRightString(px - 3, py + ph + 5, f"[{einheit}]")
    return ende


def _legende(c, x, y, eintraege):
    c.setFont("Helvetica", 5.5)
    for label, farbe in eintraege:
        c.setFillColorRGB(*farbe)
        c.rect(x, y, 6, 4, stroke=0, fill=1)
        c.setFillColorRGB(*TEXT)
        c.drawString(x + 8, y, label)
        x += 12 + c.stringWidth(label, "Helvetica", 5.5)


def saeulendiagramm(c, x, y, breite, hoehe, *, titel, punkte, x_schluessel,
                    saeule=None, linien=(), einheit="", x_titel="",
                    x_schritt=3) -> float:
    """Säulen mit überlagerten Linien — Stundenprofil und Summenlinie.

    `saeule` und `linien` sind Tripel (Schlüssel, Beschriftung, Farbe) auf den
    Punkten. Alle Reihen teilen sich eine Achse, wie im Editor.
    """
    if not punkte:
        return 0.0
    _rahmen(c, x, y, breite, hoehe, titel)
    px, py = x + RAND_LINKS, y + RAND_UNTEN
    pb, ph = breite - RAND_LINKS - RAND_RECHTS, hoehe - RAND_UNTEN - RAND_OBEN
    reihen = ([saeule] if saeule else []) + list(linien)
    werte = [p.get(schluessel) or 0 for schluessel, _, _ in reihen for p in punkte]
    ende = _y_achse(c, px, py, pb, ph, max(werte or [0]), einheit)
    schritt = pb / len(punkte)

    if saeule:
        schluessel, _, farbe = saeule
        c.setFillColorRGB(*farbe)
        for i, punkt in enumerate(punkte):
            wert = punkt.get(schluessel) or 0
            if wert > 0:
                c.rect(px + schritt * (i + 0.19), py, schritt * 0.62,
                       ph * wert / ende, stroke=0, fill=1)

    for schluessel, _, farbe in linien:
        c.setStrokeColorRGB(*farbe)
        c.setLineWidth(1.2)
        pfad = c.beginPath()
        for i, punkt in enumerate(punkte):
            wert = punkt.get(schluessel) or 0
            punkt_x, punkt_y = px + schritt * (i + 0.5), py + ph * wert / ende
            pfad.moveTo(punkt_x, punkt_y) if i == 0 else pfad.lineTo(punkt_x, punkt_y)
        c.drawPath(pfad)

    c.setFont("Helvetica", 5.5)
    c.setFillColorRGB(*TEXT)
    for i, punkt in enumerate(punkte):
        if i % x_schritt == 0:
            c.drawCentredString(px + schritt * (i + 0.5), py - 7,
                                str(punkt.get(x_schluessel, i)))
    if x_titel:
        c.drawRightString(px + pb, py - 15, x_titel)
    _legende(c, px, y + 5, [(label, farbe) for _, label, farbe in reihen])
    return hoehe


def balkendiagramm(c, x, y, breite, hoehe, *, titel, eintraege, einheit="") -> float:
    """Waagrechte Balken für den Vergleich weniger Werte.

    `eintraege` sind Tripel (Beschriftung, Wert, Farbe). Fehlende Werte werden
    als «—» ausgewiesen, nicht als Null gezeichnet.
    """
    eintraege = [e for e in eintraege if e]
    if not eintraege:
        return 0.0
    _rahmen(c, x, y, breite, hoehe, titel)
    beschriftung = 96
    px = x + beschriftung
    pb = breite - beschriftung - 42
    ende = _obergrenze(max([abs(w) for _, w, _ in eintraege if w is not None] or [0]))
    zeile = (hoehe - RAND_OBEN - 6) / len(eintraege)
    balken = min(9.0, zeile * 0.62)
    for i, (label, wert, farbe) in enumerate(eintraege):
        mitte = y + hoehe - RAND_OBEN - zeile * (i + 0.5)
        c.setFont("Helvetica", 6)
        c.setFillColorRGB(*TEXT)
        c.drawString(x + 6, mitte - 2, label[:34])
        c.setFillColorRGB(*farbe)
        if wert:
            c.rect(px, mitte - balken / 2, max(0.6, pb * abs(wert) / ende), balken,
                   stroke=0, fill=1)
        c.setFillColorRGB(*TITEL)
        c.setFont("Helvetica-Bold", 6)
        c.drawRightString(x + breite - 6, mitte - 2,
                          f"{_zahl(wert)} {einheit}".strip() if wert is not None else "—")
    c.setStrokeColorRGB(*ACHSE)
    c.setLineWidth(0.5)
    c.line(px, y + 6, px, y + hoehe - RAND_OBEN)
    c.setFont("Helvetica", 5.5)
    c.setFillColorRGB(*TEXT)
    c.drawString(px, y + 1, "0")
    c.drawRightString(px + pb, y + 1, f"{_zahl(ende)} {einheit}".strip())
    return hoehe
