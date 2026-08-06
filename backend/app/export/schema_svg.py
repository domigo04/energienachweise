"""Schema → SVG (synoptischer CAD-Look) — fürs PDF, kein Screenshot.

Zeichnet den gespeicherten Graphen (Nodes + Edges) als Vektor-SVG:
VL-Balken oben / RL-Balken unten, Verbrauchergruppen als vertikale Stränge
(Pumpe, rotes Rechteck mit gedrehtem Text, STAD, Mischventil, Bypass).

WICHTIG: Die Geometrie-Konstanten müssen mit dem Editor übereinstimmen
(frontend/src/components/hc/nodes/HydraulikNodes.jsx).
"""
import html
import math
import re
from typing import Optional

from app.data.generator_types import generator_type_label
from app.export.bauteil_infos import bauteil_kennwerte

VL_FARBE = "#ef4444"
RL_FARBE = "#3b82f6"
SOLE_VL_FARBE = "#eab308"
SOLE_RL_FARBE = "#16a34a"

# Verteiler-Rahmen (VL-Balken oben, RL-Balken unten, Stränge dazwischen)
VT_S = 170          # Abstand zwischen den Abgängen
VT_X0 = 120         # linke Zone (Summen + Hauptanschlüsse)
VT_BAR = 26         # Balkenhöhe
VT_LUECKE_STD = 560 # Standard-Abstand zwischen den Balken (data.hoehe überschreibt)

# Verbrauchergruppen-Strang. Dominic 2026-08-05: gleiche Abstände wie die
# Lufterhitzergruppe. Die Geometrie war auf 400 px Höhe gezeichnet — _gy streckt
# nur die Abstände, die Symbole behalten ihre eigene Grösse.
GR_W, GR_H, GR_CX = 150, 560, 75


def _gy(v: float) -> float:
    """y-Wert der alten 400-px-Gruppengeometrie auf GR_H strecken."""
    return round(v * GR_H / 400, 1)

# Lufterhitzer-Gruppen-Strang — Geometrie identisch zu
# frontend/src/components/hc/nodes/HydraulikNodes.jsx::LufterhitzerGruppeNode
LH_W, LH_H, LH_CX = 150, 560, 75
LH_REG_W = 136                          # Registerbreite im Strang
LH_REG_X = LH_CX - LH_REG_W * 0.45      # Registerachse liegt auf LH_CX
LH_REG_OBEN = 210
LH_REG_UNTEN = LH_REG_OBEN + LH_REG_W * 152 / 366

# Dynamisches Erdsondenfeld: zwei U-Rohre je Duplexsonde. Die Länge ist eine
# Beschriftung und verändert die Symbolhöhe nicht.
EWS_S, EWS_X0, EWS_H = 58, 52, 286

# Grössen der übrigen Bauteile (aus symbols.jsx)
GROESSEN = {
    # Dominic 2026-08-05: alle Armaturen sind gleich hoch (28) — Absperrklappe,
    # Kugelhahn, Regelventile und STAD. Nur die Pumpe ist groesser, Entleerung
    # und Temperaturfuehler sind kleiner. Die Breiten sind so gewaehlt, dass
    # _sym (skaliert ueber die Breite) genau auf diese Hoehe kommt.
    "heizkreis": (74, 74), "heizkoerper": (160, 64), "luftheizapparat": (80, 56), "pump": (34, 34), "valve2": (35, 28),
    "valve3": (38, 28), "checkvalve": (48, 48), "shutoff": (35, 28),
    "erzeuger": (125, 137), "verbraucher": (68, 50), "speicher": (72, 149),
    "junction": (46, 46), "label": (120, 16),
    "waermezaehler": (48, 48), "expansion": (76, 105), "bww": (72, 149),
    "anschluss": (60, 40), "stad": (14, 28), "temperatur": (26, 19),
    "sicherheitsventil": (80, 67), "pwt": (94, 68), "lufterhitzer": (104, 43),
    "waermezaehler_cad": (32, 42),
    "concrete_area": (180, 120), "interface_line": (180, 40),
}


def _f(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def _kg_h(m3h) -> str:
    """m³/h → kg/h (Wasser, Darstellung wie im CAD: 1 m³/h ≈ 1000 kg/h)."""
    return f"{m3h * 1000:,.0f}".replace(",", "'") if m3h is not None else "—"


def vt_abgaenge(node) -> int:
    d = node.get("data") or {}
    n = _f(d.get("abgaenge"))
    return max(2, min(8, int(n))) if n else 4


def vt_breite(node) -> float:
    return VT_X0 + vt_abgaenge(node) * VT_S


def vt_hoehe(node) -> float:
    """Gesamthöhe: 2 Balken + einstellbare Lücke (data.hoehe, 460–1200)."""
    d = node.get("data") or {}
    luecke = _f(d.get("hoehe"))
    luecke = max(460, min(1200, luecke)) if luecke else VT_LUECKE_STD
    return 2 * VT_BAR + luecke


def vt_stutzen_x(i: int) -> float:
    """x-Position von Abgang i (1-basiert) relativ zum Verteiler."""
    return VT_X0 + 85 + (i - 1) * VT_S


def ews_anzahl(node) -> int:
    d = node.get("data") or {}
    n = _f(d.get("sonden_anzahl"))
    return max(1, min(24, int(n))) if n else 5


def ews_breite(node) -> float:
    return 52 + ews_anzahl(node) * EWS_S


def export_box(node):
    """Im Browser gemessene Bauteilbox (`data.export_box`), falls vorhanden.

    Der Editor misst jedes Bauteil im DOM. Diese Messung ist die Wahrheit —
    hergeleitete Standardmasse gelten nur, wenn keine Messung mitgeschickt wird
    (zum Beispiel beim Export eines gespeicherten Schemas ohne offenen Editor).
    """
    box = (node.get("data") or {}).get("export_box")
    if not isinstance(box, dict):
        return None
    w, h = _f(box.get("width")), _f(box.get("height"))
    return box if w and h and w > 0 and h > 0 else None


def gezogene_groesse(node):
    """Von Hand gezogene Grösse: React Flow 12 schreibt sie an den Knoten.

    Ältere Stände (und der Vorlagen-Import) tragen sie in `style`; beide Wege
    müssen gelten, sonst exportiert eine skalierte Betonfläche in Standardmass.
    """
    style = node.get("style") or {}
    w = _f(node.get("width")) or _f(style.get("width"))
    h = _f(node.get("height")) or _f(style.get("height"))
    return (w, h)


def node_groesse(node):
    if node.get("type") == "junction" and (node.get("data") or {}).get("cad_anchor"):
        return (1, 1)
    if node.get("type") == "verteiler":
        return (vt_breite(node), vt_hoehe(node))
    if node.get("type") == "gruppe":
        return (GR_W, GR_H)
    if node.get("type") == "lufterhitzer_gruppe":
        return (LH_W, LH_H)
    if node.get("type") == "erdsonden":
        return (ews_breite(node), EWS_H)
    box = export_box(node)
    if box:
        return (_f(box["width"]), _f(box["height"]))
    w, h = gezogene_groesse(node)
    fallback = GROESSEN.get(node.get("type"), (60, 60))
    return (w or fallback[0], h or fallback[1])


def export_handle_pos(node, handle: Optional[str]):
    """Im Browser gemessener Anschlusspunkt (`data.export_handles`)."""
    punkte = (node.get("data") or {}).get("export_handles")
    punkt = punkte.get(handle) if isinstance(punkte, dict) and handle else None
    if not isinstance(punkt, dict):
        return None
    x, y = _f(punkt.get("x")), _f(punkt.get("y"))
    return (x, y) if x is not None and y is not None else None


def handle_pos(node, handle: Optional[str]):
    """Absolute Anschluss-Position eines Bauteils.

    Zuerst gilt die Messung aus dem Editor: sie enthält Drehung, Spiegelung und
    die tatsächliche Bauteilgrösse bereits. Nur ohne Messung wird die Position
    aus den Standardmassen hergeleitet und die Transformation nachgerechnet —
    in derselben Reihenfolge wie im Editor (`rotate() scaleX(-1)`: erst
    spiegeln, dann drehen).
    """
    gemessen = export_handle_pos(node, handle)
    if gemessen:
        return gemessen
    px, py = _handle_pos_base(node, handle)
    d = node.get("data") or {}
    rot = int(_f(d.get("rotation")) or 0) % 360
    mirrored = bool(d.get("mirrored"))
    if rot or mirrored:
        x = (node.get("position") or {}).get("x", 0)
        y = (node.get("position") or {}).get("y", 0)
        w, h = node_groesse(node)
        cx, cy = x + w / 2, y + h / 2
        if mirrored:
            px = 2 * cx - px
        for _ in range(rot // 90):
            px, py = cx - (py - cy), cy + (px - cx)  # 90° im Uhrzeigersinn (wie CSS rotate)
    return (px, py)


def _handle_pos_base(node, handle: Optional[str]):
    """Absolute Position eines Anschlusses — gleiche Logik wie im Editor."""
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    w, h = node_groesse(node)
    t = node.get("type")

    if t == "junction" and (node.get("data") or {}).get("cad_anchor"):
        # CAD-Anker speichern bereits den exakten Leitungsfangpunkt. Sie sind
        # keine sichtbaren Bauteile und besitzen keine geometrische Ausdehnung.
        return (x, y)

    if t == "verteiler" and handle:
        vh = vt_hoehe(node)
        if handle == "vl-main":
            return (x, y + VT_BAR / 2)
        if handle == "rl-main":
            return (x, y + vh - VT_BAR / 2)
        m = re.match(r"^(vl|rl)-(\d+)$", handle)
        if m:
            sx = x + vt_stutzen_x(int(m.group(2)))
            return (sx, y + VT_BAR) if m.group(1) == "vl" else (sx, y + vh - VT_BAR)
    if t == "gruppe":
        return (x + GR_CX, y) if handle == "vl" else (x + GR_CX, y + GR_H)
    if t == "lufterhitzer_gruppe":
        return (x + LH_CX, y) if handle == "vl" else (x + LH_CX, y + LH_H)
    if t == "lufterhitzer":
        # Wasseranschlüsse auf der Registerachse (45 % der Symbolbreite) — der
        # Luftpfeil ragt rechts weiter hinaus als links, deshalb nicht 50 %.
        return {"top": (x + w * 0.45, y), "bottom": (x + w * 0.45, y + h)}.get(
            handle, (x + w * 0.45, y + h / 2))
    if t == "waermezaehler_cad":
        # Rohrachse bei 30 % — Rechenwerk und Signalleitungen liegen rechts.
        return {"top": (x + w * 0.30, y), "bottom": (x + w * 0.30, y + h)}.get(
            handle, (x + w * 0.30, y + h / 2))
    if t == "erdsonden":
        return {
            "sole-vl": (x + w, y + 55),
            "sole-rl": (x + w, y + 85),
            "sole-vl-top": (x + w * 0.42, y),
            "sole-rl-top": (x + w * 0.58, y),
            "sole-vl-bottom": (x + w * 0.42, y + h),
            "sole-rl-bottom": (x + w * 0.58, y + h),
        }.get(handle, (x + w, y + h / 2))
    if t == "heizkreis":
        return {"vl": (x, y + 28), "rl": (x + w, y + 28),
                "top": (x + w / 2, y), "bottom": (x + w / 2, y + h)}.get(handle, (x + w / 2, y + h / 2))
    if t in ("heizkoerper", "luftheizapparat"):
        return {"vl": (x, y + h * 0.34), "rl": (x, y + h * 0.66)}.get(
            handle, (x, y + h / 2))
    if t == "erzeuger":
        zone = re.match(r"^wz-(t|b|l|r)-(\d+)$", handle or "")
        if zone:
            seite, prozent = zone.group(1), float(zone.group(2)) / 100
            return {
                "t": (x + w * prozent, y), "b": (x + w * prozent, y + h),
                "l": (x, y + h * prozent), "r": (x + w, y + h * prozent),
            }[seite]
        # VL oben, RL unten (Dominic-Feedback Loop B); zusätzlich die semantischen
        # Anschlüsse: Heizungsseite rechts, Quellenseite (Sole) links.
        return {"vl": (x + w / 2, y), "rl": (x + w / 2, y + h),
                "top": (x + w / 2, y), "bottom": (x + w / 2, y + h),
                "left": (x, y + h / 2), "right": (x + w, y + h / 2),
                "heating_flow": (x + w, y + h * 0.32), "heating_return": (x + w, y + h * 0.68),
                "source_flow": (x, y + h * 0.32), "source_return": (x, y + h * 0.68),
                }.get(handle, (x + w / 2, y + h / 2))
    if t == "junction":
        return {"left": (x, y + 30), "right": (x + w, y + 30), "top": (x + 23, y)}.get(handle, (x + 23, y + 30))
    if t in ("speicher", "bww"):
        # Anschlüsse liegen auf dem gezeichneten Behälterumriss, nicht am Rand
        # der Bauteilfläche (Dominic 2026-08-06). Mantel x = 20…120 von 140,
        # Schultern y = 45 und 245 von 290 — dieselben Zahlen wie im Editor
        # (HydraulikNodes.jsx::SPEICHER_RAHMEN / SPEICHER_PORTS).
        links, rechts, oben, unten = 0.143, 0.857, 0.155, 0.845
        zone = re.match(r"^sz-(t|b|l|r)-(\d+)$", handle or "")
        if zone:
            seite, prozent = zone.group(1), float(zone.group(2)) / 100
            auf_x = x + w * (links + prozent * (rechts - links))
            auf_y = y + h * (oben + prozent * (unten - oben))
            return {
                "t": (auf_x, y + h * oben), "b": (auf_x, y + h * unten),
                "l": (x + w * links, auf_y), "r": (x + w * rechts, auf_y),
            }[seite]
        return {"top-l": (x + w * 0.3, y + h * 0.084), "top-r": (x + w * 0.7, y + h * 0.084),
                "bot-l": (x + w * 0.3, y + h * 0.916), "bot-r": (x + w * 0.7, y + h * 0.916),
                "left": (x + w * links, y + h / 2), "right": (x + w * rechts, y + h / 2),
                # Trinkwasser: die Pfeilspitzen enden am Bauteilrand.
                "warmwasser": (x + w / 2, y),
                "kaltwasser": (x + w / 2, y + h)}.get(handle, (x + w / 2, y + h / 2))
    if t == "anschluss":  # Anschlüsse vorne rechts (nicht beim Buchstaben)
        return {"vl": (x + w, y + h * 0.28), "rl": (x + w, y + h * 0.72)}.get(handle, (x + w, y + h / 2))
    if t == "expansion":
        return {"bottom": (x + w * (121 / 248), y + h)}.get(handle, (x + w * (121 / 248), y + h / 2))
    if t == "valve2":  # Flussachse rechts (Antrieb links)
        return {"top": (x + w * 0.75, y), "bottom": (x + w * 0.75, y + h)}.get(handle, (x + w * 0.75, y + h / 2))
    if t == "valve3":  # Flussachse ~63 %, 3. Tor rechts
        return {"top": (x + w * 0.63, y), "bottom": (x + w * 0.63, y + h),
                "right": (x + w, y + h * 0.51)}.get(handle, (x + w * 0.63, y + h / 2))
    if t == "sicherheitsventil":  # ein Fangpunkt am roten Knoten (x=24/199≈12%, y=102/167≈61%)
        return (x + w * 0.12, y + h * 0.61)
    if t == "pwt":  # Seitenmitten der Raute — auf der Linie, nicht an den Ecken
        return {"left": (x + w * 0.274, y + h * 0.349), "top": (x + w * 0.594, y + h * 0.349),
                "bottom": (x + w * 0.274, y + h * 0.768), "right": (x + w * 0.594, y + h * 0.768),
                }.get(handle, (x + w / 2, y + h / 2))
    if t == "temperatur":
        return {"left": (x, y + h * 0.55), "bottom": (x + w * 0.38, y + h)}.get(handle, (x + w / 2, y + h / 2))
    # pump, stad, checkvalve, shutoff, default
    return {"top": (x + w / 2, y), "bottom": (x + w / 2, y + h),
            "left": (x, y + h / 2), "right": (x + w, y + h / 2)}.get(handle, (x + w / 2, y + h / 2))


KASTEN_ZEILE = 9.5      # Zeilenhöhe im Datenblock
KASTEN_KOPF = 18.0      # Abstand Titelzeile → erste Kennwertzeile
KASTEN_LUFT = 4.5       # Luft vor einem Abschnittstitel
# Eine gemeinsame Grundbreite statt einer Breite je Inhalt (Dominic
# 2026-08-06): Pumpe, Ventil, Verbrauchergruppe und die übrigen gewöhnlichen
# Bauteile landen alle auf demselben Mass und stehen dadurch ruhig
# nebeneinander. Ein Bauteil mit wirklich langen Angaben — der Wärmeerzeuger
# mit «Sole/Wasser-WP (Erdsonden)» — darf breiter werden; enger als die
# Grundbreite wird keiner. Dieselben Grenzen gelten im Editor
# (HydraulikNodes.jsx::DATENBLOCK_MIN_BREITE).
DATENBLOCK_MIN_BREITE = 120.0
DATENBLOCK_MAX_BREITE = 210.0
KASTEN_RAND = 7.0       # Innenabstand links/rechts — wie das Padding im Editor


def kasten_zeilen(abschnitte: list) -> list:
    """Abschnitte zu einer Zeilenfolge (art, name, wert) verflachen.

    art ist 'luft', 'titel' oder 'wert'. Editor und Export bauen daraus
    denselben Block; die Reihenfolge entsteht genau einmal — hier.
    """
    zeilen = []
    for abschnitt in abschnitte or []:
        if abschnitt.get("titel"):
            if zeilen:
                zeilen.append(("luft", "", ""))
            zeilen.append(("titel", abschnitt["titel"], ""))
        for name, wert in abschnitt.get("zeilen") or ():
            zeilen.append(("wert", name, wert))
    return zeilen


def datenkasten_masse(titel: str, abschnitte: list) -> tuple:
    """Breite und Höhe des Datenblocks — Editor und Export nutzen dasselbe.

    Die Breite ist mindestens die Grundbreite; nur ein Bauteil mit wirklich
    langen Angaben wird breiter.
    """
    zeilen = kasten_zeilen(abschnitte)
    namen = max([len(str(n)) + 1 for art, n, _ in zeilen if art == "wert"] + [0])
    werte = max([len(str(w)) for art, _, w in zeilen if art == "wert"] + [0])
    kopfzeilen = [titel] + [n for art, n, _ in zeilen if art == "titel"]
    breite = max([DATENBLOCK_MIN_BREITE, namen * 4.4 + werte * 4.4 + 2 * KASTEN_RAND]
                 + [len(str(k)) * 4.9 + 2 * KASTEN_RAND for k in kopfzeilen])
    hoehe = KASTEN_KOPF + sum(KASTEN_LUFT if art == "luft" else KASTEN_ZEILE
                              for art, _, _ in zeilen)
    return (min(DATENBLOCK_MAX_BREITE, breite), hoehe)


def zeichne_datenkasten(parts: list, mitte_x: float, oben_y: float,
                        titel: str, abschnitte: list) -> None:
    """Bauteilname und Kennwerte als Datenblock unter dem Bauteil.

    Gestalt wie im Editor: Titelzeile mittig, darunter je Kennwert die
    Bezeichnung links und der Wert rechtsbündig am Kastenrand — Bildschirm und
    Plan zeigen denselben Kasten. Eine Verbrauchergruppe bringt mehrere
    Abschnitte mit (Pumpe, Ventil, Wärmezähler); die bekommen je einen eigenen
    Zwischentitel. Kein Rahmen — nur eine weisse Unterlegung, damit der Block
    über Rastern und Unterlagen lesbar bleibt.
    """
    breite, hoehe = datenkasten_masse(titel, abschnitte)
    x = mitte_x - breite / 2
    name_x = x + KASTEN_RAND
    wert_x = x + breite - KASTEN_RAND
    parts.append(
        f'<rect x="{_svg_num(x)}" y="{_svg_num(oben_y)}" width="{_svg_num(breite)}" '
        f'height="{_svg_num(hoehe)}" fill="white" fill-opacity="0.82" stroke="none"/>'
    )
    parts.append(
        f'<text x="{_svg_num(mitte_x)}" y="{_svg_num(oben_y + 8.5)}" font-size="8.5" '
        f'text-anchor="middle" font-weight="700" fill="#0f172a">{_esc(titel)}</text>'
    )
    zeile_y = oben_y + KASTEN_KOPF
    for art, name, wert in kasten_zeilen(abschnitte):
        if art == "luft":
            zeile_y += KASTEN_LUFT
            continue
        if art == "titel":
            parts.append(
                f'<text x="{_svg_num(name_x)}" y="{_svg_num(zeile_y)}" font-size="8" '
                f'font-weight="700" fill="#0f172a">{_esc(name)}</text>'
            )
        else:
            parts.append(
                f'<text x="{_svg_num(name_x)}" y="{_svg_num(zeile_y)}" font-size="8" '
                f'fill="#334155">{_esc(name)}:</text>'
            )
            parts.append(
                f'<text x="{_svg_num(wert_x)}" y="{_svg_num(zeile_y)}" font-size="8" '
                f'text-anchor="end" fill="#0f172a">{_esc(wert)}</text>'
            )
        zeile_y += KASTEN_ZEILE


CAPTION_NAMEN = {
    "erzeuger": "Wärmeerzeuger", "erdsonden": "Erdsondenfeld",
    "speicher": "Speicher", "bww": "BWW-Speicher", "verteiler": "Verteiler",
    "gruppe": "Verbrauchergruppe", "heizkreis": "Heizkreis", "heizkoerper": "Heizkörper",
    "luftheizapparat": "Luftheizapparat", "pump": "Pumpe",
    "valve2": "2-Weg-Ventil", "valve3": "3-Weg-Ventil", "shutoff": "Absperrventil",
    "stad": "STAD", "checkvalve": "Rückschlagventil", "waermezaehler": "Wärmezähler",
    "waermezaehler_cad": "Wärmezähler", "expansion": "Expansionsgefäss",
    "sicherheitsventil": "Sicherheitsventil", "pwt": "Plattentauscher",
    "lufterhitzer": "Lufterhitzer", "lufterhitzer_gruppe": "Lufterhitzer-Gruppe",
}


def caption_titel(node) -> str:
    """Kopfzeile des Datenblocks — dieselbe Liste wie im Editor (mitNr)."""
    d = node.get("data") or {}
    return d.get("label") or CAPTION_NAMEN.get(node.get("type"), node.get("type") or "Bauteil")


def datenblock_anker(node) -> tuple:
    """Mitte-X und Oberkante des Datenblocks — verschoben wie im Editor.

    Der Versatz darf in jede Richtung gehen: zum Ausrichten mehrerer Blöcke auf
    eine gemeinsame Flucht muss ein Block auch nach oben wandern können.
    """
    d = node.get("data") or {}
    w, h = node_groesse(node)
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    return (x + w / 2 + (_f(d.get("caption_offset_x")) or 0),
            y + h + 10 + (_f(d.get("caption_offset_y")) or 0))


def zeichne_datenblock(parts: list, node, results) -> None:
    """Datenblock unter dem Bauteil — für Einzelteile wie für Gruppen gleich."""
    if (node.get("data") or {}).get("nr") is None:
        return
    mitte_x, oben_y = datenblock_anker(node)
    zeichne_datenkasten(parts, mitte_x, oben_y, caption_titel(node),
                        bauteil_kennwerte(node, results))


def _schraffur(x: float, y: float, w: float, h: float, abstand: float) -> list:
    """Kreuzschraffur als echte Linien.

    Ein SVG-`pattern` wäre kürzer, überlebt aber die Wandlung nach PDF nicht —
    die Fläche käme leer heraus. Die Linien werden am Rechteck abgeschnitten.
    """
    linien = []
    schritt = max(2.0, float(abstand))
    d = 0.0
    while d <= w + h:
        # Richtung «\»: (x+d, y) → (x+d+h, y+h)
        t0, t1 = max(0.0, -(d - h)), min(h, w - (d - h))
        if t1 > t0:
            ax, ay = x + (d - h) + t0, y + t0
            linien.append((ax, ay, x + (d - h) + t1, y + t1))
        # Richtung «/»: (x+d, y) → (x+d-h, y+h)
        t0, t1 = max(0.0, d - w), min(h, d)
        if t1 > t0:
            linien.append((x + d - t0, y + t0, x + d - t1, y + t1))
        d += schritt
    return linien


def bauteil_transform(d: dict, cx: float, cy: float) -> str:
    """Drehung und Spiegelung eines Bauteils um seine Mitte.

    Gleiche Reihenfolge wie die CSS-Transformation im Editor
    (`rotate(x) scaleX(-1)`): erst spiegeln, dann drehen.
    """
    rot = int(_f(d.get("rotation")) or 0) % 360
    mirrored = bool(d.get("mirrored"))
    if not rot and not mirrored:
        return ""
    teile = [f"translate({cx:.2f},{cy:.2f})"]
    if rot:
        teile.append(f"rotate({rot})")
    if mirrored:
        teile.append("scale(-1,1)")
    teile.append(f"translate({-cx:.2f},{-cy:.2f})")
    return " ".join(teile)


_TEXT_OHNE_TRANSFORM = re.compile(
    r'<text\b(?![^>]*\btransform=)([^>]*?)\bx="(-?\d+(?:\.\d+)?)"([^>]*)>',
)


def _text_gegen_spiegeln(fragment: str) -> str:
    """Text innerhalb eines gespiegelten Symbols seitenrichtig halten.

    Die Position wird mit dem Symbol gespiegelt, die Glyphe selbst erhält um
    ihre x-Ankerachse eine zweite Spiegelung. Zwei Spiegelungen heben sich für
    die Schrift auf; die Geometrie bleibt unverändert gespiegelt.
    """
    def ersetzen(treffer):
        x = float(treffer.group(2))
        gegen = _svg_num(2 * x)
        return (f'<text transform="translate({gegen},0) scale(-1,1)"'
                f'{treffer.group(1)}x="{treffer.group(2)}"{treffer.group(3)}>')

    return _TEXT_OHNE_TRANSFORM.sub(ersetzen, fragment)


# ── Bauteil-Zeichner (liefern SVG-Fragmente, Koordinaten absolut) ───────────
def _nr_badge(parts, x, y, nr):
    if nr is None:
        return
    parts.append(f'<rect x="{x - 11}" y="{y - 8}" width="22" height="16" rx="8" fill="white" stroke="#dc2626" stroke-width="1.4"/>')
    parts.append(f'<text x="{x}" y="{y + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#dc2626">{_esc(nr)}</text>')


def _absperr(parts, cx, cy, farbe="#1e293b"):
    """Absperrventil / Kugelhahn: weiss gefüllte Dreiecke + Kreis am Treffpunkt
    (Vorlage «Kugelhahn.svg», Dominic-Feedback — nicht mehr schwarz gefüllt)."""
    parts.append(f'<polygon points="{cx - 6.3},{cy - 10.1} {cx + 6.3},{cy - 10.1} {cx},{cy}" fill="white" stroke="{farbe}" stroke-width="1.2"/>')
    parts.append(f'<polygon points="{cx - 6.3},{cy + 10.1} {cx + 6.3},{cy + 10.1} {cx},{cy}" fill="white" stroke="{farbe}" stroke-width="1.2"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="1.9" fill="{farbe}"/>')


def _pumpe(parts, cx, cy, r=15, nach_unten=False):
    """Kreis + Durchmesserlinie + gefülltes Dreieck (Vorlage «pumpe_genau.svg»).
    Ohne Motor-Kasten (Dominic-Feedback: brauchen wir nicht)."""
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="white" stroke="#1e293b" stroke-width="2.2"/>')
    parts.append(f'<line x1="{cx - r}" y1="{cy}" x2="{cx + r}" y2="{cy}" stroke="#1e293b" stroke-width="1.8"/>')
    if nach_unten:  # Dreieck zeigt in Flussrichtung nach unten (zum Verbraucher)
        parts.append(f'<polygon points="{cx - r},{cy} {cx + r},{cy} {cx},{cy + r}" fill="#1e293b"/>')
    else:
        parts.append(f'<polygon points="{cx - r},{cy} {cx + r},{cy} {cx},{cy - r}" fill="#1e293b"/>')


def _thermometer(parts, cx, cy):
    _sym(parts, cx - 8.1, cy - 8.6, 26, "temperatur", SYM_INNER["temperatur"])


def _waermepumpen_symbol(parts, code):
    parts.extend([
        '<g fill="none" stroke="#111827" stroke-width="2.5" stroke-linejoin="round">',
        '<rect x="8" y="8" width="184" height="204" fill="#e5e7eb" stroke-width="3"/>',
        '<rect x="20" y="20" width="60" height="180" fill="#f3f4f6"/><line x1="20" y1="20" x2="80" y2="200"/>',
        '<rect x="120" y="20" width="60" height="180" fill="#f3f4f6"/><line x1="180" y1="20" x2="120" y2="200"/>',
        '<circle cx="100" cy="55" r="26" fill="#e5e7eb"/>',
        '<path d="M80 68 Q91 61 96.5 57.5 M103.5 52.5 Q109 49 120 42 M80 42 Q91 49 96.5 52.5 M103.5 57.5 Q109 61 120 68"/>',
        '<path d="M78 184 L100 195 L78 206 Z" fill="#f9fafb"/><path d="M122 184 L100 195 L122 206 Z" fill="#f9fafb"/></g>',
        '<g font-family="Arial" font-size="16" font-weight="700" fill="#111827">',
        f'<text x="32" y="38">V</text><text x="148" y="38">K</text><text x="100" y="164" text-anchor="middle">{code}</text></g>',
    ])


def _zeichne_erzeuger(parts, node):
    """Typabhängiges Erzeugersymbol, geometrisch identisch zum Editor."""
    d = node.get("data") or {}
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    w, _ = node_groesse(node)
    s = w / 200
    gt = str(d.get("generator_type") or "")
    parts.append(f'<g transform="translate({x},{y}) scale({s:.4f})">')

    if gt == "lwwp":
        bauart = d.get("lwwp_bauart") or "aussenaufstellung"
        if bauart == "split":
            parts.extend([
                '<rect x="8" y="30" width="78" height="142" fill="#e5e7eb" stroke="#111827" stroke-width="3"/>',
                '<rect x="114" y="30" width="78" height="142" fill="#e5e7eb" stroke="#111827" stroke-width="3"/>',
                '<circle cx="47" cy="77" r="23" fill="white" stroke="#111827" stroke-width="2"/>',
                '<path d="M47 55 L53 74 L71 77 L53 82 L47 101 L42 82 L24 77 L42 72 Z" fill="#bae6fd" stroke="#111827" stroke-width="1.4"/>',
                '<path d="M86 101 H114" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="7 5"/>',
                '<text x="47" y="137" text-anchor="middle" font-size="11" font-weight="700">VERFL.</text>',
                '<text x="153" y="90" text-anchor="middle" font-size="11" font-weight="700">VERD.</text>',
                '<text x="153" y="110" text-anchor="middle" font-size="10">INNEN</text>',
                '<text x="100" y="202" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700">L/W-WP SPLIT</text>',
            ])
        else:
            _waermepumpen_symbol(parts, "L/W-WP")
    elif gt == "fernwaerme":
        parts.extend([
            '<rect x="12" y="12" width="176" height="196" rx="4" fill="#f8fafc" stroke="#111827" stroke-width="3"/>',
            '<path d="M100 42 L155 103 L100 164 L45 103 Z" fill="white" stroke="#111827" stroke-width="3"/>',
            '<path d="M100 42 V164" stroke="#111827" stroke-width="2.5"/>',
            '<text x="71" y="99" text-anchor="middle" font-size="18" font-weight="700" fill="#dc2626">+</text>',
            '<text x="129" y="99" text-anchor="middle" font-size="18" font-weight="700" fill="#2563eb">-</text>',
            '<text x="100" y="191" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#111827">FERNWÄRME</text>',
        ])
    elif gt == "holz":
        parts.extend([
            '<rect x="8" y="8" width="184" height="204" fill="white" stroke="#111827" stroke-width="3"/>',
            '<rect x="84" y="164" width="32" height="32" fill="#111827"/>',
        ])
    elif gt in {"gas", "oel"}:
        fuel = {"gas": "GAS", "oel": "ÖL"}[gt]
        parts.extend([
            '<rect x="22" y="14" width="156" height="192" rx="8" fill="#fff7ed" stroke="#111827" stroke-width="3"/>',
            '<rect x="39" y="32" width="122" height="34" rx="3" fill="#f8fafc" stroke="#111827" stroke-width="2"/>',
            f'<text x="100" y="55" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#111827">{fuel}</text>',
            '<path d="M101 177 C67 164 65 134 89 111 C88 130 101 130 107 103 C135 127 143 158 119 177 C114 160 101 151 92 164 C90 170 94 175 101 177Z" fill="#fb923c" stroke="#9a3412" stroke-width="2.5"/>',
        ])
    elif gt == "elektro":
        parts.extend([
            '<rect x="22" y="14" width="156" height="192" rx="8" fill="#fefce8" stroke="#111827" stroke-width="3"/>',
            '<path d="M111 37 L67 118 H99 L87 183 L139 91 H106 Z" fill="#facc15" stroke="#854d0e" stroke-width="3" stroke-linejoin="round"/>',
            '<text x="100" y="196" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#111827">ELEKTRO</text>',
        ])
    elif gt == "hybrid":
        parts.extend([
            '<rect x="10" y="12" width="180" height="196" rx="6" fill="#f8fafc" stroke="#111827" stroke-width="3"/>',
            '<line x1="100" y1="27" x2="100" y2="180" stroke="#64748b" stroke-width="2" stroke-dasharray="7 5"/>',
            '<circle cx="57" cy="87" r="30" fill="#e0f2fe" stroke="#111827" stroke-width="2.5"/>',
            '<path d="M36 99 Q50 88 55 84 M60 80 Q67 74 78 66 M36 66 Q50 77 55 81 M60 85 Q67 91 78 99" fill="none" stroke="#111827" stroke-width="2"/>',
            '<path d="M144 129 C119 116 122 91 139 76 C138 91 149 90 153 67 C176 90 177 117 160 129 C157 113 144 107 137 118 C137 123 139 127 144 129Z" fill="#fb923c" stroke="#9a3412" stroke-width="2.3"/>',
            '<text x="100" y="195" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#111827">HYBRID</text>',
        ])
    elif gt in {"", "ews_wp", "wasser_wp", "co2_wp"}:
        code = {"ews_wp": "S/W-WP", "wasser_wp": "W/W-WP", "co2_wp": "CO₂-WP"}.get(gt, "WP")
        _waermepumpen_symbol(parts, code)
    else:
        label = _esc(generator_type_label(gt) or "ERZEUGER")
        parts.extend([
            '<rect x="15" y="15" width="170" height="190" rx="7" fill="#f8fafc" stroke="#111827" stroke-width="3"/>',
            '<circle cx="100" cy="91" r="41" fill="white" stroke="#64748b" stroke-width="2.5"/>',
            '<text x="100" y="101" text-anchor="middle" font-family="Arial" font-size="27" font-weight="700" fill="#334155">WE</text>',
            f'<text x="100" y="181" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="#64748b">{label}</text>',
        ])
    parts.append("</g>")


# ── SVG-Bauteil-Symbole 1:1 aus Dominics Vorlagen (in Node-Box skaliert) ────
# Innere SVG-Fragmente je Bauteil, gezeichnet im Original-Koordinatensystem
# der Vorlage-SVG. `SYM_VIEWBOX` = (minX, minY, vbBreite) je Typ.
SYM_VIEWBOX = {
    "valve2": (0, 0, 100), "valve3": (0, 0, 100), "shutoff": (0, 0, 100),
    "stad": (0, 0, 60), "temperatur": (10, 6, 90),
    "sicherheitsventil": (0, 0, 199), "pwt": (0, 0, 472),
    "lufterhitzer": (0, 0, 366), "absperrklappe": (0, 0, 44),
    "entleerung": (0, 0, 40), "entleerhahn": (0, 0, 46),
    "waermezaehler_cad": (0, 0, 200),
}


def _sym(parts, x, y, w, typ, inner):
    """Bettet ein Vorlage-SVG (Original-Koordinaten) in die Node-Box ein."""
    minx, miny, vbw = SYM_VIEWBOX[typ]
    s = w / vbw
    parts.append(f'<g transform="translate({x - minx * s:.3f},{y - miny * s:.3f}) scale({s:.4f})">')
    parts.extend(inner)
    parts.append("</g>")


def _sym_wh(parts, x, y, w, h, typ, inner):
    """Bettet kompakte Ventilsymbole mit derselben Breite/Höhe wie React ein."""
    minx, miny, vbw = SYM_VIEWBOX[typ]
    vbh = 100
    sx, sy = w / vbw, h / vbh
    parts.append(f'<g transform="translate({x - minx * sx:.3f},{y - miny * sy:.3f}) scale({sx:.4f},{sy:.4f})">')
    parts.extend(inner)
    parts.append("</g>")


SYM_INNER = {
    "valve2": [
        '<rect x="4" y="38" width="24" height="24" fill="#ffd34d" stroke="#ff9f00" stroke-width="2.4" stroke-linejoin="round"/>',
        '<path d="M9 44 H22 L14 50 L22 56 H9" fill="none" stroke="#ff9f00" stroke-width="2.4" stroke-linejoin="round"/>',
        '<line x1="28" y1="50" x2="34" y2="50" stroke="#ff9f00" stroke-width="2.4" stroke-linecap="round"/>',
        '<polygon points="32,14 68,14 50,50" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<polygon points="32,86 68,86 50,50" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<circle cx="50" cy="50" r="5.5" fill="#1e293b"/>',
    ],
    "valve3": [
        '<rect x="4" y="36" width="26" height="28" fill="#ffd34d" stroke="#ff9f00" stroke-width="2.4" stroke-linejoin="round"/>',
        '<path d="M4 36 L30 64 M30 36 L4 64" stroke="#ff9f00" stroke-width="2"/>',
        '<line x1="30" y1="50" x2="39" y2="50" stroke="#ff9f00" stroke-width="2.4" stroke-linecap="round"/>',
        '<polygon points="36,14 64,14 50,50" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<polygon points="36,86 64,86 50,50" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<polygon points="50,50 95,34 95,66" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<circle cx="50" cy="50" r="6" fill="#1e293b"/>',
    ],
    "shutoff": [
        '<polygon points="32,14 68,14 50,50" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<polygon points="32,86 68,86 50,50" fill="white" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round"/>',
        '<circle cx="50" cy="50" r="5.5" fill="#1e293b"/>',
    ],
    "stad": [
        # Deckt die Leitung ab: Bauteile liegen auf dem Strang, nicht darunter.
        '<polygon points="12,11 50,11 31,58" fill="white"/>',
        '<polygon points="12,105 50,105 31,58" fill="white"/>',
        '<g fill="none" stroke="#1e293b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">',
        '<line x1="12" y1="11" x2="50" y2="11"/><path d="M12 11 L50 105"/><path d="M50 11 L12 105"/>',
        '<line x1="12" y1="105" x2="50" y2="105"/><circle cx="31" cy="91" r="6"/>',
        '<path d="M18 125 L31 112 L44 125"/><line x1="31" y1="112" x2="31" y2="133"/></g>',
    ],
    "temperatur": [
        '<g fill="none" stroke="#1e293b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">',
        '<circle cx="38" cy="36" r="12" fill="white"/><line x1="18" y1="56" x2="56" y2="18"/></g>',
        '<polygon points="56,18 48,20 54,26" fill="#1e293b"/>',
        '<text x="60" y="51" font-family="Arial" font-size="18" fill="#1e293b">T</text>',
    ],
    "sicherheitsventil": [
        '<g fill="none" stroke="#ff0000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">',
        '<line x1="24" y1="102" x2="104" y2="102"/>',
        '<line x1="104" y1="102" x2="104" y2="47"/><line x1="104" y1="47" x2="168" y2="47"/>',
        '<line x1="168" y1="47" x2="168" y2="77"/></g>',
        '<circle cx="24" cy="102" r="8" fill="#ff0000" stroke="#000" stroke-width="2"/>',
        '<path d="M98 14 L111 18 L98 22 L111 26 L98 30 L111 34 L104 39" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
        '<path d="M104 47 L136 31 L136 63 Z" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"/>',
        '<path d="M88 79 L120 79 L104 47 Z" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"/>',
        '<circle cx="104" cy="47" r="9" fill="#000"/>',
        '<g fill="none" stroke="#8b4a12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M143 151 L143 102"/><path d="M143 102 L155 102"/><path d="M155 102 L155 119"/>',
        '<path d="M155 119 L168 119"/><path d="M168 119 L168 102"/><path d="M168 102 L178 88"/>',
        '<path d="M168 102 L159 88"/></g>',
    ],
    "pwt": [
        '<g fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M205 48 L356 191 L205 334 L54 191 Z"/><line x1="205" y1="48" x2="205" y2="334"/>',
        '</g>',
        '<g font-family="Arial" font-size="34" fill="#000">',
        '<text x="164" y="135">+</text><text x="220" y="135">-</text>',
        '<text x="8" y="98">EIN</text><text x="350" y="98">AUS</text>',
        '<text x="6" y="302">AUS</text><text x="352" y="302">EIN</text></g>',
    ],
    # Register mit Kreuz und Pluszeichen; der Luftstrom läuft als roter Pfeil
    # quer hindurch (Kerbe links = Eintritt, Spitze rechts = Austritt).
    "lufterhitzer": [
        '<g fill="white" stroke="#ff0000" stroke-width="3" stroke-linejoin="miter">',
        '<path d="M126 29 L5 29 L49 76 L5 124 L126 124 Z"/>',
        '<path d="M204 29 L316 29 L366 76 L316 124 L204 124 Z"/></g>',
        '<rect x="126" y="2" width="78" height="148" fill="white" stroke="#000" stroke-width="3"/>',
        '<g stroke="#000" stroke-width="2.6">',
        '<line x1="126" y1="2" x2="204" y2="150"/><line x1="126" y1="150" x2="204" y2="2"/>',
        '<line x1="158.5" y1="130" x2="171.5" y2="130" stroke-width="2"/>',
        '<line x1="165" y1="123.5" x2="165" y2="136.5" stroke-width="2"/></g>',
    ],
    "absperrklappe": [
        '<line x1="22" y1="0" x2="22" y2="8" stroke="#1e293b" stroke-width="3"/>',
        '<line x1="22" y1="68" x2="22" y2="76" stroke="#1e293b" stroke-width="3"/>',
        '<rect x="4" y="8" width="36" height="60" fill="white" stroke="#000" stroke-width="3"/>',
        '<line x1="4" y1="68" x2="40" y2="8" stroke="#000" stroke-width="2.6"/>',
        '<circle cx="22" cy="38" r="7" fill="#000"/>',
    ],
    "entleerung": [
        '<g stroke="#000" stroke-width="2.2" stroke-linecap="round">',
        '<line x1="3" y1="5" x2="3" y2="19"/><line x1="3" y1="12" x2="20" y2="12"/>',
        '<line x1="20" y1="3" x2="34" y2="21"/><line x1="20" y1="21" x2="34" y2="3"/></g>',
    ],
    # Volumenmessteil mit halbschwarzer Diagonale, Fuehlerkreis und Rechenwerk;
    # die orangen Strichpunktlinien sind die Signalleitungen.
    "waermezaehler_cad": [
        '<g fill="none" stroke="#f08c2e" stroke-width="3" stroke-dasharray="12 6 3 6" stroke-linecap="round">',
        '<path d="M101 30 H137 V116"/>',
        '<line x1="84" y1="127" x2="120" y2="127"/>',
        '<line x1="154" y1="127" x2="200" y2="127"/></g>',
        '<g stroke="#000" stroke-width="3.5" stroke-linecap="round">',
        '<line x1="36" y1="30" x2="74" y2="30"/>',
        '<line x1="36" y1="58" x2="84" y2="58"/><line x1="36" y1="68" x2="84" y2="68"/>',
        '<line x1="36" y1="188" x2="84" y2="188"/><line x1="36" y1="198" x2="84" y2="198"/></g>',
        '<circle cx="88" cy="30" r="13" fill="white" stroke="#000" stroke-width="3.5"/>',
        '<rect x="36" y="76" width="48" height="104" fill="white" stroke="#000" stroke-width="3.5"/>',
        '<polygon points="36,76 84,76 36,180" fill="#000"/>',
        '<rect x="120" y="116" width="34" height="22" fill="white" stroke="#000" stroke-width="3.5"/>',
    ],
    "entleerhahn": [
        '<g stroke="#000" stroke-width="2.2" stroke-linejoin="round">',
        '<line x1="3" y1="4" x2="3" y2="18"/><line x1="3" y1="11" x2="8" y2="11"/>',
        '<polygon points="8,2 8,20 21,11" fill="white"/>',
        '<polygon points="34,2 34,20 21,11" fill="white"/>',
        '<line x1="34" y1="11" x2="39" y2="11"/>',
        '<path d="M35 2 L41 2 L41 20 L35 20" fill="none"/></g>',
    ],
}


def zeichne_verteiler(parts, node, results):
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    n = vt_abgaenge(node)
    w = vt_breite(node)
    vh = vt_hoehe(node)
    c = (results.get("verteiler_results") or {}).get(node["id"], {})
    fmt = lambda v, d=1: ("—" if v is None else f"{v:.{d}f}")

    # VL-Balken oben / RL-Balken unten
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{VT_BAR}" rx="4" fill="{VL_FARBE}"/>')
    parts.append(f'<rect x="{x}" y="{y + vh - VT_BAR}" width="{w}" height="{VT_BAR}" rx="4" fill="{RL_FARBE}"/>')
    parts.append(f'<text x="{x + 8}" y="{y + 17}" font-size="11" font-weight="700" fill="white" font-family="monospace">'
                 f'VL {fmt(c.get("vl_vt"))} °C · Σ {fmt(c.get("q_total"), 2)} kW · {fmt(c.get("m_prim_total"), 3)} m³/h</text>')
    parts.append(f'<text x="{x + 8}" y="{y + vh - 9}" font-size="11" font-weight="700" fill="white" font-family="monospace">'
                 f'RL {fmt(c.get("rl_misch"))} °C · {fmt(c.get("m_prim_total"), 3)} m³/h</text>')
    if c.get("dp_max_ast") is not None:
        parts.append(f'<text x="{x + w - 8}" y="{y + vh - 9}" text-anchor="end" font-size="10" font-weight="700" fill="white" font-family="monospace">'
                     f'Δp Ast {_esc(c.get("dp_max_ast_nr"))}: {fmt(c.get("dp_max_ast"))} kPa</text>')
    # Stutzen-Nummern
    for i in range(1, n + 1):
        sx = x + vt_stutzen_x(i)
        parts.append(f'<text x="{sx + 6}" y="{y + 17}" font-size="9" font-weight="700" fill="white" font-family="monospace">{i}</text>')
    _nr_badge(parts, x + w - 14, y - 2, (node.get("data") or {}).get("nr"))
    zeichne_datenblock(parts, node, results)


def zeichne_gruppe(parts, node, results):
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    d = node.get("data") or {}
    c = (results.get("gruppe_results") or {}).get(node["id"], {})
    cx = x + GR_CX
    einspritz = bool(c.get("einspritz"))
    # Schaltungsart (PHYSIK §6): einspritz = 2WV, Bypass ÜBER dem Ventil ·
    # beimisch = 3WV, Bypass in den dritten Anschluss · drossel = nur Ventil
    schaltung = str(d.get("schaltung") or "einspritz").lower()
    if schaltung not in ("einspritz", "beimisch", "drossel"):
        schaltung = "einspritz"
    hat_pumpe = schaltung != "drossel" and d.get("hat_pumpe") is not False
    hat_ventil = d.get("hat_ventil") is not False

    # Strangleitung: oben VL (primär), unten RL
    parts.append(f'<line x1="{cx}" y1="{y}" x2="{cx}" y2="{y + _gy(145)}" stroke="{VL_FARBE}" stroke-width="2"/>')
    parts.append(f'<line x1="{cx}" y1="{y + _gy(255)}" x2="{cx}" y2="{y + GR_H}" stroke="{RL_FARBE}" stroke-width="2"/>')
    # Primär-Fluss oben
    if c.get("m_prim") is not None:
        parts.append(f'<text x="{cx + 8}" y="{y + 12}" font-size="9" fill="#1e293b" font-family="monospace">m\': {_kg_h(c.get("m_prim"))} kg/h</text>')
    # Anschluss-Marker für separate Gruppe — koppelt über den Buchstaben (PHYSIK §9)
    if d.get("hat_anschluss"):
        buchstabe = _esc(d.get("anschluss_buchstabe") or "A")
        my = y + _gy(200)  # Mitte des Markers; die Glyphe selbst bleibt gleich gross
        parts.append(f'<line x1="{x + 104}" y1="{my - 8}" x2="{x + 132}" y2="{my - 8}" stroke="{VL_FARBE}" stroke-width="2.2"/>')
        parts.append(f'<polygon points="{x + 132},{my - 12} {x + 139},{my - 8} {x + 132},{my - 4}" fill="{VL_FARBE}"/>')
        parts.append(f'<line x1="{x + 132}" y1="{my + 8}" x2="{x + 104}" y2="{my + 8}" stroke="{RL_FARBE}" stroke-width="2.2"/>')
        parts.append(f'<polygon points="{x + 104},{my + 4} {x + 97},{my + 8} {x + 104},{my + 12}" fill="{RL_FARBE}"/>')
        parts.append(f'<circle cx="{x + 122}" cy="{my}" r="11" fill="white" stroke="#1e293b" stroke-width="1.6"/>')
        parts.append(f'<text x="{x + 122}" y="{my + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">{buchstabe}</text>')
    _absperr(parts, cx, y + _gy(30))
    if hat_pumpe:
        _pumpe(parts, cx, y + _gy(64), nach_unten=True)  # Dreieck zeigt zum roten Rechteck
    _thermometer(parts, cx, y + _gy(98))
    # Wärmezähler (SIA 410): Rechteck mit Diagonale, halb schwarz — plus je ein
    # Fühler im VL und RL, ausserhalb der Bypass-Schleife
    if d.get("hat_wz"):
        wy = y + _gy(110)
        parts.append(f'<rect x="{cx - 8}" y="{wy - 6}" width="16" height="12" fill="white" stroke="#1e293b" stroke-width="1.6"/>')
        parts.append(f'<polygon points="{cx - 8},{wy + 6} {cx + 8},{wy + 6} {cx + 8},{wy - 6}" fill="#1e293b"/>')
        for fy in (y + _gy(16), y + _gy(352)):  # VL-Fühler oben, RL-Fühler unten
            parts.append(f'<line x1="{cx}" y1="{fy}" x2="{cx + 9}" y2="{fy}" stroke="#1e293b" stroke-width="1.4"/>')
            parts.append(f'<circle cx="{cx + 12.5}" cy="{fy}" r="3.5" fill="white" stroke="#1e293b" stroke-width="1.4"/>')
    # Rotes Rechteck mit gedrehtem Text
    parts.append(f'<rect x="{x + 55}" y="{y + _gy(145)}" width="40" height="{_gy(255) - _gy(145)}" fill="white" stroke="{VL_FARBE}" stroke-width="1.8"/>')
    q_anzeige = c.get("q_kw") if c.get("q_kw") is not None else d.get("q_kw")
    zeilen = [
        d.get("label") or "Verbrauchergruppe",
        f'{_esc(q_anzeige if q_anzeige is not None else "—")} kW · VL/RL {_esc(d.get("vl_temp") or "—")}/{_esc(d.get("rl_temp") or "—")} °C',
        f'm\': {_kg_h(c.get("m_sek"))} kg/h',
    ]
    for i, z in enumerate(zeilen):
        parts.append(f'<text transform="translate({x + 63 + i * 12} {y + _gy(202)}) rotate(-90)" text-anchor="middle" '
                     f'font-size="9" font-weight="{700 if i == 0 else 400}" fill="{VL_FARBE}" font-family="monospace">{_esc(z)}</text>')
    # STAD + Thermometer + Mischventil + Absperr
    _absperr(parts, cx, y + _gy(303), "#1e293b")
    parts.append(f'<line x1="{cx + 9}" y1="{y + _gy(303) - 9}" x2="{cx + 20}" y2="{y + _gy(303) - 15}" stroke="#1e293b" stroke-width="1.6"/>')  # STAD-Griff
    _thermometer(parts, cx, y + _gy(320))
    # Ventil unten: 2-Weg (Einspritz/Drossel) oder 3-Weg (Beimisch)
    mv_y = y + _gy(338)
    if hat_ventil:
        if schaltung == "beimisch":
            parts.append(f'<g transform="translate({2 * cx},0) scale(-1,1)">')
            _sym_wh(parts, cx - 19, mv_y - 14, 38, 28, "valve3", SYM_INNER["valve3"])
            parts.append('</g>')
        else:
            _sym_wh(parts, cx - 17.5, mv_y - 14, 35, 28, "valve2", SYM_INNER["valve2"])
        if c.get("ventil"):
            parts.append(f'<text x="{cx + 30}" y="{mv_y + 3.5}" font-size="8" fill="#1e293b" font-family="monospace">kvs {c["ventil"].get("kvs_eff")}</text>')
    _absperr(parts, cx, y + _gy(368))
    # Bypass gehört zur Schaltung (immer sichtbar, ausser bei Drossel):
    # Einspritz → mündet ÜBER dem Ventil in die Strangleitung,
    # Beimisch → mündet direkt in den dritten Anschluss des 3WV.
    if schaltung != "drossel":
        bx = x + 22
        muendung_y = mv_y - 18 if schaltung == "einspritz" else mv_y
        muendung_x = cx if schaltung == "einspritz" else cx - 19
        parts.append(f'<path d="M {cx} {y + _gy(44)} H {bx} V {muendung_y} H {muendung_x}" fill="none" stroke="{RL_FARBE}" stroke-width="1.8" stroke-dasharray="6,4"/>')
        parts.append(f'<circle cx="{cx}" cy="{y + _gy(44)}" r="3.5" fill="{RL_FARBE}"/>')
        if schaltung == "einspritz":
            parts.append(f'<circle cx="{cx}" cy="{muendung_y}" r="3.5" fill="{RL_FARBE}"/>')
        if c.get("m_bypass"):
            parts.append(f'<text x="{bx - 4}" y="{y + _gy(210)}" transform="rotate(-90 {bx - 4} {y + _gy(210)})" text-anchor="middle" '
                         f'font-size="8" fill="{RL_FARBE}" font-family="monospace">Bypass {c.get("m_bypass", 0):.3f} m³/h</text>')
    _nr_badge(parts, x + GR_W - 14, y + _gy(64), d.get("nr"))
    # Eine Gruppe ist kein Einzelbauteil: ihr Block führt Pumpe, Regelventil
    # und Wärmezähler in eigenen Abschnitten (Vorlage Dominic 2026-08-05).
    zeichne_datenblock(parts, node, results)


def zeichne_lufterhitzer_gruppe(parts, node, results):
    """Drossel-, Einspritz- oder Beimischstrang eines Lufterhitzers."""
    d = node.get("data") or {}
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    cx = x + LH_CX
    schaltung = str(d.get("schaltung") or "drossel").lower()
    if schaltung not in ("einspritz", "beimisch", "drossel"):
        schaltung = "drossel"
    res = (results.get("gruppe_results") or {}).get(node.get("id")) or {}
    wz_y = {"einspritz": 460, "beimisch": 445, "drossel": 425}[schaltung]
    bypass_oben = 72 if schaltung == "beimisch" else 76
    bypass_unten = 370 if schaltung == "beimisch" else 365

    # Dünne Signal- und Bypasslinien zuerst: Vordergrundelemente decken sie ab.
    if d.get("hat_wz"):
        parts.append(f'<path d="M {cx + 12} {y + 54} H {x + 116} V {y + wz_y + 21} H {cx + 23}" '
                     'fill="none" stroke="#f08c2e" stroke-width="0.85" '
                     'stroke-dasharray="4 2 1 2" stroke-linecap="round"/>')
    if schaltung != "drossel":
        start_x = cx - 17 if schaltung == "beimisch" else cx
        parts.append(f'<path d="M {start_x} {y + bypass_oben} H {x + 24} V {y + bypass_unten} H {cx}" '
                     f'fill="none" stroke="{RL_FARBE}" stroke-width="1.2" stroke-dasharray="6,4"/>')
        parts.append(f'<circle cx="{start_x}" cy="{y + bypass_oben}" r="2.8" fill="{RL_FARBE}"/>')
        parts.append(f'<circle cx="{cx}" cy="{y + bypass_unten}" r="2.8" fill="{RL_FARBE}"/>')
        if res.get("m_bypass"):
            my = y + (bypass_oben + bypass_unten) / 2
            parts.append(f'<text x="{x + 18}" y="{my}" transform="rotate(-90 {x + 18} {my})" '
                         f'text-anchor="middle" font-size="7.5" fill="{RL_FARBE}" font-family="monospace">'
                         f'Bypass {res["m_bypass"]:.3f} m³/h</text>')

    # Dünne hydraulische Strangleitung.
    parts.append(f'<line x1="{cx}" y1="{y}" x2="{cx}" y2="{y + LH_REG_OBEN}" '
                 f'stroke="#ef4444" stroke-width="1.8"/>')
    parts.append(f'<line x1="{cx}" y1="{y + LH_REG_UNTEN}" x2="{cx}" y2="{y + LH_H}" '
                 f'stroke="#3b82f6" stroke-width="1.8" stroke-dasharray="8,5"/>')

    # Anlagennummer und Kennwerte — rechts oben, wo der Strang frei ist.
    zeilen = [t for t in (
        _esc(d.get("anlage_nr") or "") or None,
        f'{_esc(d.get("q_kw"))} kW' if d.get("q_kw") not in (None, "") else None,
        f'V\' {res["m_sek"]:.3f} m³/h' if res.get("m_sek") is not None else None,
        f'kvs {res["ventil"]["kvs_eff"]}' if (res.get("ventil") or {}).get("kvs_eff") is not None else None,
    ) if t]
    for i, text in enumerate(zeilen):
        parts.append(f'<text x="{x + 98}" y="{y + 12 + i * 12}" font-size="8.5" '
                     f'fill="#1e293b" font-family="monospace">{text}</text>')

    def thermometer(cy):
        _sym(parts, cx - 8.1, y + cy - 8.6, 26, "temperatur", SYM_INNER["temperatur"])

    def entleerung(cy):
        _sym(parts, cx - 1.2, y + cy - 4.8, 16, "entleerung", SYM_INNER["entleerung"])

    def entleerhahn(cy):
        _sym(parts, cx - 1.2, y + cy - 4.5, 19, "entleerhahn", SYM_INNER["entleerhahn"])

    def ventil2(cy):
        parts.append(f'<g transform="translate({2 * cx},0) scale(-1,1)">')
        _sym_wh(parts, cx - 17.5, y + cy - 14, 35, 28, "valve2", SYM_INNER["valve2"])
        parts.append('</g>')

    def ventil3(cy):
        parts.append(f'<g transform="translate({2 * cx},0) scale(-1,1)">')
        _sym_wh(parts, cx - 19, y + cy - 14, 38, 28, "valve3", SYM_INNER["valve3"])
        parts.append('</g>')

    _sym(parts, cx - 8, y + 14, 16, "absperrklappe", SYM_INNER["absperrklappe"])
    if schaltung == "drossel":
        entleerhahn(58)
        ventil2(92)
        thermometer(145)
        _absperr(parts, cx, y + 184)
    elif schaltung == "einspritz":
        _pumpe(parts, cx, y + 112, r=17, nach_unten=True)
        thermometer(157)
        _absperr(parts, cx, y + 184)
    else:
        ventil3(72)
        _pumpe(parts, cx, y + 116, r=17, nach_unten=True)
        thermometer(154)
        _absperr(parts, cx, y + 184)

    _sym(parts, x + LH_REG_X, y + LH_REG_OBEN, LH_REG_W, "lufterhitzer",
         SYM_INNER["lufterhitzer"])

    # Direkt nach dem Register: Absperrung, kleiner MSR-Fühler, Thermometer.
    _absperr(parts, cx, y + 292)
    parts.append(f'<g stroke="#f08c2e" stroke-width="1" stroke-linecap="round" fill="none">'
                 f'<line x1="{cx - 5}" y1="{y + 318}" x2="{cx + 10}" y2="{y + 318}"/>'
                 f'<circle cx="{cx + 14}" cy="{y + 318}" r="4" fill="white"/></g>')
    parts.append(f'<text x="{cx + 14}" y="{y + 320.5}" text-anchor="middle" font-size="6" '
                 f'fill="#f08c2e" font-family="Arial">T</text>')
    thermometer(342)

    if schaltung == "drossel":
        entleerung(380)
    elif schaltung == "einspritz":
        entleerung(bypass_unten)
        _absperr(parts, cx, y + 395)
        ventil2(430)
    else:
        entleerung(bypass_unten)
        _absperr(parts, cx, y + 400)

    if d.get("hat_wz"):
        parts.append(f'<line x1="{cx}" y1="{y + 54}" x2="{cx + 8}" y2="{y + 54}" stroke="#1e293b" stroke-width="1"/>')
        parts.append(f'<circle cx="{cx + 12}" cy="{y + 54}" r="3" fill="white" stroke="#1e293b" stroke-width="1"/>')
        _sym(parts, cx - 9.6, y + wz_y, 32, "waermezaehler_cad", SYM_INNER["waermezaehler_cad"])

    stad_y = 500 if schaltung == "drossel" else 510 if schaltung == "beimisch" else 520
    _sym(parts, cx - 6, y + stad_y, 12, "stad", SYM_INNER["stad"])
    if schaltung == "drossel":
        entleerhahn(540)
    _nr_badge(parts, x + LH_W, y, d.get("nr"))
    zeichne_datenblock(parts, node, results)


def zeichne_erdsonden(parts, node, results):
    """Schlichter Soleverteiler mit zwei U-Rohren je Duplexsonde."""
    d = node.get("data") or {}
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    n = ews_anzahl(node)
    w = ews_breite(node)
    laenge = _f(d.get("sonden_laenge_m"))
    laenge_text = f" à {laenge:g} m" if laenge and laenge > 0 else ""

    parts.append(
        f'<rect x="{x + w / 2 - 82}" y="{y + 2}" width="164" height="24" rx="2" '
        f'fill="white" stroke="{SOLE_VL_FARBE}" stroke-width="1.5"/>'
    )
    parts.append(
        f'<text x="{x + w / 2}" y="{y + 18}" text-anchor="middle" font-size="11" '
        f'fill="#3730a3">{n} Duplex-Erdsonden{laenge_text}</text>'
    )
    parts.append(
        f'<rect x="{x + 8}" y="{y + 34}" width="{w - 16}" height="78" fill="white" '
        'stroke="#1f2937" stroke-width="1.4"/>'
    )
    parts.append(
        f'<rect x="{x + 22}" y="{y + 48}" width="{w - 44}" height="14" fill="white" '
        f'stroke="{SOLE_VL_FARBE}" stroke-width="1.8"/>'
    )
    parts.append(
        f'<rect x="{x + 34}" y="{y + 78}" width="{w - 68}" height="14" fill="white" '
        f'stroke="{SOLE_RL_FARBE}" stroke-width="1.7" stroke-dasharray="7,4"/>'
    )
    c = (results.get("erdsonden_results") or {}).get(node["id"], {})
    if c.get("erforderlich_gesamt_m") is not None:
        farbe = "#dc2626" if c.get("ausreichend") is False else "#15803d"
        suffix = " — zu kurz" if c.get("ausreichend") is False else ""
        parts.append(
            f'<text x="{x + w / 2}" y="{y + 106}" text-anchor="middle" font-size="9" '
            f'font-weight="700" fill="{farbe}">erf. {c["erforderlich_gesamt_m"]:.0f} m{suffix}</text>'
        )

    for index in range(n):
        sx = x + EWS_X0 + index * EWS_S
        parts.append(
            f'<path d="M {sx - 9} {y + 38} l 6 6 m 0 -6 l -6 6 '
            f'M {sx + 9} {y + 68} l 6 6 m 0 -6 l -6 6" fill="none" '
            'stroke="#312e81" stroke-width="1.1" stroke-linecap="round"/>'
        )
        parts.append(
            f'<path d="M {sx - 9} {y + 62} V {y + 118} H {sx - 17} V {y + 258} '
            f'Q {sx - 17} {y + 274} {sx - 11} {y + 274} '
            f'Q {sx - 5} {y + 274} {sx - 5} {y + 258} V {y + 118} H {sx - 9}" '
            f'fill="none" stroke="{SOLE_VL_FARBE}" stroke-width="1.9" stroke-linejoin="round"/>'
        )
        parts.append(
            f'<path d="M {sx + 9} {y + 92} V {y + 122} H {sx + 3} V {y + 258} '
            f'Q {sx + 3} {y + 274} {sx + 9} {y + 274} '
            f'Q {sx + 15} {y + 274} {sx + 15} {y + 258} V {y + 122} H {sx + 9}" '
            f'fill="none" stroke="{SOLE_RL_FARBE}" stroke-width="1.9" '
            'stroke-dasharray="7,4" stroke-linejoin="round"/>'
        )
    _nr_badge(parts, x + w, y, d.get("nr"))


def zeichne_standard(parts, node, results):
    """Vereinfachte Symbole für die übrigen Bauteile."""
    t = node.get("type")
    d = node.get("data") or {}
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    w, h = node_groesse(node)
    cx, cy = x + w / 2, y + h / 2
    label = d.get("label")
    sym_start = len(parts)  # Merker für die optionale Drehung (nur das Symbol)

    if t == "erdsonden":
        zeichne_erdsonden(parts, node, results)
        zeichne_datenblock(parts, node, results)
        return
    if t == "heizkreis":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{w / 2}" fill="#f0fdf4" stroke="#16a34a" stroke-width="2.5"/>')
        v = (results.get("node_flows") or {}).get(node["id"])
        parts.append(f'<text x="{cx}" y="{cy - 2}" text-anchor="middle" font-size="10" font-weight="700" fill="#15803d">{_esc(label or "HK")}</text>')
        if v:
            parts.append(f'<text x="{cx}" y="{cy + 12}" text-anchor="middle" font-size="8" fill="#166534" font-family="monospace">{v:.3f} m³/h</text>')
    elif t == "heizkoerper":
        schema = d.get("darstellung") == "schema"
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" '
                     f'fill="{"white" if schema else "#dcfce7"}" fill-opacity="{1 if schema else 0.7}" '
                     'stroke="#15803d" stroke-width="2"/>')
        if schema:
            for faktor in (0.40, 0.50, 0.60, 0.70, 0.80):
                lx = x + w * faktor
                parts.append(f'<line x1="{lx}" y1="{y + 7}" x2="{lx}" y2="{y + h - 7}" stroke="#15803d" stroke-width="1.4"/>')
            parts.append(f'<line x1="{x}" y1="{y + h * .34}" x2="{x + w * .24}" y2="{y + h * .34}" stroke="{VL_FARBE}" stroke-width="2"/>')
            parts.append(f'<line x1="{x}" y1="{y + h * .66}" x2="{x + w * .24}" y2="{y + h * .66}" stroke="{RL_FARBE}" stroke-width="2"/>')
        else:
            parts.append(f'<text x="{cx}" y="{cy + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#166534">{_esc(label or "Heizkörper")}</text>')
    elif t == "luftheizapparat":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="white" stroke="#111827" stroke-width="2"/>')
        parts.append(f'<path d="M {x + 3} {y + 3} L {x + w - 3} {y + h - 3} M {x + w - 3} {y + 3} L {x + 3} {y + h - 3}" fill="none" stroke="#111827" stroke-width="1.5"/>')
        # Kleine, zurückhaltende Kennzeichnung wie im Editor — der Ventilator
        # bezeichnet das Gerät, ist aber nicht das Hauptsymbol.
        r = min(w, h) * .13
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="white" stroke="#111827" stroke-width="1.7"/>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="2" fill="#111827"/>')
        for winkel in (0, 120, 240):
            parts.append(f'<path d="M {cx} {cy - 3} C {cx - 5} {cy - r + 5} {cx + 2} {cy - r} {cx + 7} {cy - r + 3} Z" fill="#d1fae5" stroke="#15803d" stroke-width="1" transform="rotate({winkel} {cx} {cy})"/>')
    elif t == "pump":
        _pumpe(parts, cx, cy, 17, nach_unten=True)  # gleiche Flussrichtung wie im Editor (Dreieck nach unten)
    elif t in ("valve2", "valve3", "shutoff", "stad", "temperatur", "sicherheitsventil",
               "pwt", "lufterhitzer", "waermezaehler_cad"):
        _sym(parts, x, y, w, t, SYM_INNER[t])
    elif t == "checkvalve":
        _absperr(parts, cx, cy)
    elif t == "erzeuger":
        _zeichne_erzeuger(parts, node)
    elif t == "verbraucher":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="white" stroke="#f97316" stroke-width="2"/>')
        parts.append(f'<text x="{cx}" y="{cy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#f97316">{_esc(label or "")}</text>')
    elif t in ("speicher", "bww"):
        sx, sy = w / 140, h / 290
        parts.append(f'<g transform="translate({x},{y}) scale({sx:.4f},{sy:.4f})">')
        parts.append('<path d="M65 4 L75 14 M75 4 L65 14" fill="none" stroke="#111827" stroke-width="2"/>')
        parts.append('<path d="M20 45 A50 25 0 0 1 120 45 L120 245 A50 25 0 0 1 20 245 Z" fill="#e5e7eb" stroke="#111827" stroke-width="3"/>')
        parts.append('<line x1="20" y1="45" x2="120" y2="45" stroke="#111827" stroke-width="3"/>')
        c = ((results.get("speicher_results") or {}).get(node["id"], {}) if t == "speicher"
             else (results.get("bww_results") or {}).get(node["id"], {}))
        liter = _f(d.get("speicher_liter")) or _f(c.get("speichervolumen_l"))
        liter_text = f"{liter:.0f} L" if liter and liter > 0 else "… L"
        parts.append(f'<text x="70" y="78" text-anchor="middle" font-size="16" font-weight="700">{liter_text}</text>')
        if c.get("speicher_oben_c") is not None:
            parts.append(f'<text x="92" y="119" font-size="12" font-weight="700" fill="#dc2626">{c["speicher_oben_c"]:.1f} °C</text>')
        if c.get("speicher_unten_c") is not None:
            parts.append(f'<text x="92" y="199" font-size="12" font-weight="700" fill="#2563eb">{c["speicher_unten_c"]:.1f} °C</text>')
        if t == "bww":
            parts.append('<text x="70" y="151" text-anchor="middle" font-size="15" font-weight="700">BWW</text>')
            parts.append('<path d="M70 45 V2 M65 9 L70 2 L75 9" fill="none" stroke="#ef4444" stroke-width="3"/>')
            parts.append('<path d="M70 245 V288 M65 281 L70 288 L75 281" fill="none" stroke="#16a34a" stroke-width="3" stroke-dasharray="7 5"/>')
        parts.append("</g>")
        if t == "bww" and (c.get("register_bauart") or d.get("bww_speicherkonfiguration") or "aussen") == "aussen":
            # Aussenliegendes Register: PWT direkt am BWW-Speicher sichtbar,
            # ohne einen zusätzlichen topologischen Knoten vorzutäuschen.
            _sym(parts, x - 47, y + 51, 40, "pwt", SYM_INNER["pwt"])
            parts.append(f'<line x1="{x - 7}" y1="{y + 60}" x2="{x + 10}" y2="{y + 60}" stroke="{VL_FARBE}" stroke-width="2"/>')
            parts.append(f'<line x1="{x - 7}" y1="{y + 80}" x2="{x + 10}" y2="{y + 80}" stroke="{RL_FARBE}" stroke-width="2" stroke-dasharray="6,4"/>')
            parts.append(f'<text x="{x - 38}" y="{y + 94}" font-size="7" font-weight="700" fill="#475569">PWT</text>')
    elif t == "waermezaehler":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="16" fill="white" stroke="#0f766e" stroke-width="2.5"/>')
        parts.append(f'<text x="{cx}" y="{cy + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f766e">WZ</text>')
    elif t == "expansion":
        # Exakte Dominic-Vorlage («ohne Beschriftung, ohne Füsse, unten rund»):
        # Kapsel-Körper mit zwei Bund-Linien + mittigem Höcker. Anschluss unten.
        scale = w / 248
        parts.append(f'<g transform="translate({x},{y}) scale({scale})">')
        parts.append('<g fill="none" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">')
        parts.append('<path fill="#d9d9d9" d="M54 33 C54 15 84 1 121 1 C158 1 188 15 188 33 L188 297 '
                     'C188 315 158 329 121 329 C84 329 54 315 54 297 Z"/>')
        parts.append('<line x1="54" y1="33" x2="188" y2="33"/>')
        parts.append('<path d="M54 166 H102 C103 155 109 148 121 148 C133 148 139 155 140 166 H188"/>')
        parts.append('<line x1="115" y1="158" x2="127" y2="158"/>')
        parts.append('<line x1="54" y1="300" x2="188" y2="300"/>')
        parts.append('</g>')
        # Kurzer runder Anschlussstutzen genau am Handle — keine dekorative
        # blaue Leitung mehr, die wie eine gezeichnete Leitung aussah.
        parts.append('<line x1="121" y1="329" x2="121" y2="341" stroke="#1e293b" stroke-width="7" stroke-linecap="round"/>')
        parts.append('</g>')
    elif t == "anschluss":
        # Anschluss-Marker (PHYSIK §9): roter Pfeil VL raus, blauer Pfeil RL rein,
        # gemeinsamer Buchstabe — ersetzt eine lang gezeichnete Leitung
        buchstabe = _esc(d.get("buchstabe") or "?")
        parts.append(f'<circle cx="{x + 12}" cy="{y + 20}" r="11" fill="white" stroke="#1e293b" stroke-width="1.6"/>')
        parts.append(f'<text x="{x + 12}" y="{y + 24}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">{buchstabe}</text>')
        parts.append(f'<line x1="{x + 26}" y1="{y + 11}" x2="{x + 52}" y2="{y + 11}" stroke="{VL_FARBE}" stroke-width="2.5"/>')
        parts.append(f'<polygon points="{x + 52},{y + 7} {x + 59},{y + 11} {x + 52},{y + 15}" fill="{VL_FARBE}"/>')
        parts.append(f'<line x1="{x + 52}" y1="{y + 29}" x2="{x + 26}" y2="{y + 29}" stroke="{RL_FARBE}" stroke-width="2.5"/>')
        parts.append(f'<polygon points="{x + 26},{y + 25} {x + 19},{y + 29} {x + 26},{y + 33}" fill="{RL_FARBE}"/>')
        return
    elif t == "junction":
        # Leitungsknoten sind reine Fangpunkte und im Editor unsichtbar; alte
        # Knoten werden beim Laden zu `cad_anchor` migriert. Ein T-Symbol im PDF
        # hätte auf dem Bildschirm keine Entsprechung.
        return
    elif t == "label":
        parts.append(f'<text x="{x}" y="{y + 11}" font-size="10" fill="#64748b">{_esc(label)}</text>')
        return
    elif t == "concrete_area":
        scale = max(3, min(60, _f(d.get("hatch_scale")) or 8))
        parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            'fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>'
        )
        for x1, y1, x2, y2 in _schraffur(x, y, w, h, scale):
            parts.append(
                f'<line x1="{_svg_num(x1)}" y1="{_svg_num(y1)}" '
                f'x2="{_svg_num(x2)}" y2="{_svg_num(y2)}" '
                'stroke="#94a3b8" stroke-width="0.6" opacity="0.55"/>'
            )
        return
    elif t == "interface_line":
        dash = ' stroke-dasharray="8,5"' if d.get("dashed") else ""
        line_y = y + h / 2
        if label:
            parts.append(
                f'<text x="{cx}" y="{line_y - 7}" text-anchor="middle" font-size="10" '
                f'font-weight="700" letter-spacing="0.8" fill="#0f172a">{_esc(label).upper()}</text>'
            )
        parts.append(
            f'<line x1="{x}" y1="{line_y}" x2="{x + w}" y2="{line_y}" '
            f'stroke="#0f172a" stroke-width="2"{dash}/>'
        )
        return
    # Drehung und Spiegelung wie im Editor: nur das Symbol wird transformiert,
    # Nummer und Beschriftung bleiben aufrecht und seitenrichtig.
    if d.get("mirrored"):
        for index in range(sym_start, len(parts)):
            parts[index] = _text_gegen_spiegeln(parts[index])
    transform = bauteil_transform(d, cx, cy)
    if transform:
        parts.insert(sym_start, f'<g transform="{transform}">')
        parts.append("</g>")
    # Nummer und Beschriftung drehen NICHT mit: sie sollen bei jeder
    # Bauteillage an derselben Stelle und lesbar bleiben (Dominic 2026-08-05).
    # Der Editor rendert sie aus demselben Grund ausserhalb der Drehung.
    _nr_badge(parts, x + w, y, d.get("nr"))
    zeichne_datenblock(parts, node, results)


def _svg_num(value):
    """Kompakte, stabile Zahlendarstellung für SVG-Pfade."""
    return f"{float(value):.6f}".rstrip("0").rstrip(".") or "0"


def _gerundeter_polylinien_pfad(punkte, radius=8):
    """Technische Polylinie mit einheitlichen quadratischen Eckbögen.

    Der Radius wird bei kurzen Segmenten automatisch reduziert. Damit liefert
    der PDF-Export dieselbe Geometrie wie FlowEdge.jsx im Editor.
    """
    if not punkte:
        return ""
    if len(punkte) == 1:
        return f"M {_svg_num(punkte[0][0])} {_svg_num(punkte[0][1])}"
    r = max(0.0, float(radius or 0))
    pfad = f"M {_svg_num(punkte[0][0])} {_svg_num(punkte[0][1])}"
    for index in range(1, len(punkte) - 1):
        vorher = punkte[index - 1]
        ecke = punkte[index]
        danach = punkte[index + 1]
        in_dx, in_dy = ecke[0] - vorher[0], ecke[1] - vorher[1]
        out_dx, out_dy = danach[0] - ecke[0], danach[1] - ecke[1]
        in_laenge = math.hypot(in_dx, in_dy)
        out_laenge = math.hypot(out_dx, out_dy)
        richtung = ((in_dx * out_dx + in_dy * out_dy) / (in_laenge * out_laenge)) if in_laenge and out_laenge else 1
        # FlowEdge rundet nur echte annähernd rechtwinklige Ecken. Flache oder
        # 45°-Knicke bleiben auch im PDF exakt gerade/scharf.
        if not r or not in_laenge or not out_laenge or abs(richtung) > 0.25:
            pfad += f" L {_svg_num(ecke[0])} {_svg_num(ecke[1])}"
            continue
        schnitt = min(r, in_laenge / 2, out_laenge / 2)
        davor = (ecke[0] - in_dx / in_laenge * schnitt, ecke[1] - in_dy / in_laenge * schnitt)
        danach_punkt = (ecke[0] + out_dx / out_laenge * schnitt, ecke[1] + out_dy / out_laenge * schnitt)
        pfad += (
            f" L {_svg_num(davor[0])} {_svg_num(davor[1])}"
            f" Q {_svg_num(ecke[0])} {_svg_num(ecke[1])}"
            f" {_svg_num(danach_punkt[0])} {_svg_num(danach_punkt[1])}"
        )
    ende = punkte[-1]
    return f"{pfad} L {_svg_num(ende[0])} {_svg_num(ende[1])}"


def zeichne_edge(parts, edge, nodes_by_id, results):
    quelle = nodes_by_id.get(edge.get("source"))
    ziel = nodes_by_id.get(edge.get("target"))
    if not quelle or not ziel:
        return
    x1, y1 = handle_pos(quelle, edge.get("sourceHandle"))
    x2, y2 = handle_pos(ziel, edge.get("targetHandle"))
    stroke = edge.get("stroke") or (edge.get("style") or {}).get("stroke") or "#1e293b"
    layer_id = str((edge.get("data") or {}).get("layer_id") or "")
    ist_rl = stroke == RL_FARBE or layer_id.endswith("_rl") or layer_id == "trinkkaltwasser"
    dash = ' stroke-dasharray="10,7"' if ist_rl else ""
    # CAD-Leitung wie FlowEdge.jsx: echte Polylinie; klassische React-Flow-
    # Kanten ohne cad_polyline behalten ihre automatische Winkelroute.
    dx, dy = x2 - x1, y2 - y1
    edge_data = edge.get("data") or {}
    gespeicherter_radius = _f(edge_data.get("corner_radius"))
    r = max(0, gespeicherter_radius if gespeicherter_radius is not None else 8)
    stuetzpunkte = edge_data.get("points") or []
    # Beim PDF-Export liefert der Editor die bereits mit den tatsächlich
    # vermessenen React-Flow-Handles berechnete vollständige Route. Diese hat
    # Vorrang vor jeder Backend-Näherung der Symbolgeometrie.
    export_route = edge_data.get("export_route") or []
    gueltige_export_route = [
        (_f(p.get("x")), _f(p.get("y")))
        for p in export_route if isinstance(p, dict)
    ]
    gueltige_export_route = [p for p in gueltige_export_route if None not in p]
    ist_cad_polyline = bool(edge_data.get("cad_polyline")) or bool(stuetzpunkte) or len(gueltige_export_route) >= 2
    if ist_cad_polyline:
        if len(gueltige_export_route) >= 2:
            punkte = gueltige_export_route
        else:
            gueltige_stuetzpunkte = [(_f(p.get("x")), _f(p.get("y"))) for p in stuetzpunkte]
            punkte = [(x1, y1)] + [p for p in gueltige_stuetzpunkte if None not in p] + [(x2, y2)]
        pfad = _gerundeter_polylinien_pfad(punkte, r)
        # Label ungefähr in der geometrischen Mitte der Polylinie.
        laengen = [((punkte[i - 1], punkte[i]), ((punkte[i][0] - punkte[i - 1][0]) ** 2 + (punkte[i][1] - punkte[i - 1][1]) ** 2) ** 0.5) for i in range(1, len(punkte))]
        halb = sum(laenge for _, laenge in laengen) / 2
        lx, ly = punkte[0]
        for ((ax, ay), (bx, by)), laenge in laengen:
            if halb <= laenge:
                anteil = halb / laenge if laenge else 0
                lx, ly = ax + (bx - ax) * anteil, ay + (by - ay) * anteil
                break
            halb -= laenge
        lx += 6
    elif abs(dx) < 0.5 or abs(dy) < 0.5:      # fluchtet → gerade
        pfad = f"M {x1} {y1} L {x2} {y2}"
    elif abs(dy) >= abs(dx):                 # V-H-V mit runden Ecken
        my = (y1 + y2) / 2
        rr = min(r, abs(my - y1), abs(y2 - my), abs(dx) / 2)
        s1 = 1 if my > y1 else -1
        s2 = 1 if x2 > x1 else -1
        s3 = 1 if y2 > my else -1
        pfad = (f"M {x1} {y1} L {x1} {my - s1 * rr} Q {x1} {my} {x1 + s2 * rr} {my} "
                f"L {x2 - s2 * rr} {my} Q {x2} {my} {x2} {my + s3 * rr} L {x2} {y2}")
    else:                                    # H-V-H mit runden Ecken
        mx = (x1 + x2) / 2
        rr = min(r, abs(mx - x1), abs(x2 - mx), abs(dy) / 2)
        s1 = 1 if mx > x1 else -1
        s2 = 1 if y2 > y1 else -1
        s3 = 1 if x2 > mx else -1
        pfad = (f"M {x1} {y1} L {mx - s1 * rr} {y1} Q {mx} {y1} {mx} {y1 + s2 * rr} "
                f"L {mx} {y2 - s2 * rr} Q {mx} {y2} {mx + s3 * rr} {y2} L {x2} {y2}")
    if not ist_cad_polyline:
        lx, ly = (x1 + x2) / 2 + 6, (y1 + y2) / 2
    sw = 4.5
    parts.append(f'<path d="{pfad}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{dash}/>')
    fluss = (results.get("edge_flows") or {}).get(edge.get("id"))
    # Beschriftung wie im Editor: eine ausgeblendete Beschriftung wird auch im
    # PDF nicht gezeichnet, ein Versatz wird übernommen (Editor und Export
    # zeigen denselben Plan).
    if edge_data.get("label_hidden") is True:
        return
    versatz = edge_data.get("label_offset") or {}
    versatz_x = _f(versatz.get("x")) or 0
    versatz_y = _f(versatz.get("y")) or 0
    if fluss and (versatz_x or versatz_y):
        # Hinweisstrich wie im Editor — sonst gehört die versetzte Zahl im Plan
        # zu keiner erkennbaren Leitung.
        parts.append(
            f'<line x1="{_svg_num(lx)}" y1="{_svg_num(ly)}" '
            f'x2="{_svg_num(lx + versatz_x)}" y2="{_svg_num(ly + versatz_y)}" '
            f'stroke="{stroke}" stroke-width="1" stroke-dasharray="4,3" opacity="0.55"/>'
        )
    lx += versatz_x
    ly += versatz_y
    if fluss:
        # Neues Label-Format (Dominic 2026-07-06): DN gross oben, Massenstrom m' in
        # kg/h darunter. Pa/m steht weiter im Klick-Panel (LeitungPanel), nicht am Strich.
        lg = (results.get("leitung_results") or {}).get(edge.get("id"))
        dn = str(lg["dn"]).split(" ")[0] if lg else None  # nur der DN-Token, z.B. «DN32»
        if dn:
            parts.append(f'<text x="{lx}" y="{ly}" font-size="12" font-weight="800" fill="#1e293b" font-family="monospace">{dn}</text>')
            parts.append(f'<text x="{lx}" y="{ly + 10}" font-size="8" font-weight="600" fill="#475569" font-family="monospace">m\' {_kg_h(fluss)} kg/h</text>')
        else:
            parts.append(f'<text x="{lx}" y="{ly}" font-size="9" font-weight="600" fill="#1e293b" font-family="monospace">m\' {_kg_h(fluss)} kg/h</text>')


def erzeuge_svg(nodes: list, edges: list, results: dict) -> str:
    """Der komplette Graph als eigenständiges SVG-Dokument."""
    if not nodes:
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><text x="20" y="100" font-size="14" fill="#94a3b8">Leeres Schema</text></svg>'

    nodes_by_id = {n["id"]: n for n in nodes}
    xs, ys = [], []
    for n in nodes:
        w, h = node_groesse(n)
        px = (n.get("position") or {}).get("x", 0)
        py = (n.get("position") or {}).get("y", 0)
        # Ein quer gedrehtes Bauteil braucht in der anderen Achse mehr Platz;
        # sonst schneidet der Ausschnitt es an.
        if int(_f((n.get("data") or {}).get("rotation")) or 0) % 180 == 90:
            mx, my = px + w / 2, py + h / 2
            xs += [mx - h / 2, mx + h / 2]
            ys += [my - w / 2, my + w / 2]
        else:
            xs += [px, px + w]
            ys += [py, py + h]
        if (n.get("data") or {}).get("nr") is not None:
            # Der Datenblock wird gemessen, nicht geschätzt: eine Gruppe bringt
            # mehrere Abschnitte mit und würde sonst unten abgeschnitten.
            cap_x, cap_y = datenblock_anker(n)
            cap_b, cap_h = datenkasten_masse(caption_titel(n), bauteil_kennwerte(n, results))
            xs += [cap_x - cap_b / 2 - 2, cap_x + cap_b / 2 + 2]
            ys += [cap_y, cap_y + cap_h]
    for edge in edges:
        edge_data = edge.get("data") or {}
        route_for_bounds = edge_data.get("export_route") or edge_data.get("points") or []
        for point in route_for_bounds:
            xs.append(_f(point.get("x")))
            ys.append(_f(point.get("y")))
    rand = 50
    x0, y0 = min(xs) - rand, min(ys) - rand
    breite, hoehe = max(xs) - min(xs) + 2 * rand, max(ys) - min(ys) + 2 * rand

    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {breite} {hoehe}" '
             f'font-family="Helvetica, Arial, sans-serif">',
             f'<rect x="{x0}" y="{y0}" width="{breite}" height="{hoehe}" fill="white"/>']
    # Leitungen zuerst (liegen unter den Bauteilen)
    for e in edges:
        zeichne_edge(parts, e, nodes_by_id, results)
    for n in nodes:
        if n.get("type") == "verteiler":
            zeichne_verteiler(parts, n, results)
        elif n.get("type") == "gruppe":
            zeichne_gruppe(parts, n, results)
        elif n.get("type") == "lufterhitzer_gruppe":
            zeichne_lufterhitzer_gruppe(parts, n, results)
        else:
            zeichne_standard(parts, n, results)
    parts.append("</svg>")
    return "\n".join(parts)
