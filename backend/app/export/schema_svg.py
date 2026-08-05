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

VL_FARBE = "#ef4444"
RL_FARBE = "#3b82f6"
SOLE_VL_FARBE = "#eab308"
SOLE_RL_FARBE = "#16a34a"

# Verteiler-Rahmen (VL-Balken oben, RL-Balken unten, Stränge dazwischen)
VT_S = 170          # Abstand zwischen den Abgängen
VT_X0 = 120         # linke Zone (Summen + Hauptanschlüsse)
VT_BAR = 26         # Balkenhöhe
VT_LUECKE_STD = 560 # Standard-Abstand zwischen den Balken (data.hoehe überschreibt)

# Verbrauchergruppen-Strang
GR_W, GR_H, GR_CX = 150, 400, 75

# Lufterhitzer-Gruppen-Strang — Geometrie identisch zu
# frontend/src/components/hc/nodes/HydraulikNodes.jsx::LufterhitzerGruppeNode
LH_W, LH_H, LH_CX = 150, 560, 75
LH_REG_W = 136                          # Registerbreite im Strang
LH_REG_X = LH_CX - LH_REG_W * 0.45      # Registerachse liegt auf LH_CX
LH_REG_OBEN = 280
LH_REG_UNTEN = LH_REG_OBEN + LH_REG_W * 152 / 366

# Dynamisches Erdsondenfeld: zwei U-Rohre je Duplexsonde. Die Länge ist eine
# Beschriftung und verändert die Symbolhöhe nicht.
EWS_S, EWS_X0, EWS_H = 58, 52, 286

# Grössen der übrigen Bauteile (aus symbols.jsx)
GROESSEN = {
    "heizkreis": (74, 74), "pump": (48, 48), "valve2": (44, 40),
    "valve3": (52, 40), "checkvalve": (48, 48), "shutoff": (19, 41),
    "erzeuger": (125, 137), "verbraucher": (68, 50), "speicher": (72, 149),
    "junction": (46, 46), "label": (120, 16),
    "waermezaehler": (48, 48), "expansion": (76, 105), "bww": (72, 149),
    "anschluss": (60, 40), "stad": (18, 41), "temperatur": (52, 38),
    "sicherheitsventil": (80, 67), "pwt": (94, 68), "lufterhitzer": (104, 43),
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
    if node.get("type") in ("concrete_area", "interface_line"):
        style = node.get("style") or {}
        w = _f(style.get("width"))
        h = _f(style.get("height"))
        fallback = GROESSEN[node.get("type")]
        return (w or fallback[0], h or fallback[1])
    return GROESSEN.get(node.get("type"), (60, 60))


def handle_pos(node, handle: Optional[str]):
    """Anschluss-Position inkl. optionaler Drehung (data.rotation) um die Bauteil-Mitte."""
    px, py = _handle_pos_base(node, handle)
    rot = int(_f((node.get("data") or {}).get("rotation")) or 0) % 360
    if rot:
        x = (node.get("position") or {}).get("x", 0)
        y = (node.get("position") or {}).get("y", 0)
        w, h = node_groesse(node)
        cx, cy = x + w / 2, y + h / 2
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
        zone = re.match(r"^sz-(t|b|l|r)-(\d+)$", handle or "")
        if zone:
            seite, prozent = zone.group(1), float(zone.group(2)) / 100
            return {
                "t": (x + w * prozent, y), "b": (x + w * prozent, y + h),
                "l": (x, y + h * prozent), "r": (x + w, y + h * prozent),
            }[seite]
        return {"top-l": (x + w * 0.3, y), "top-r": (x + w * 0.7, y),
                "bot-l": (x + w * 0.3, y + h), "bot-r": (x + w * 0.7, y + h),
                "left": (x, y + h / 2), "right": (x + w, y + h / 2),
                "warmwasser": (x + w / 2, y), "kaltwasser": (x + w / 2, y + h)}.get(handle, (x + w / 2, y + h / 2))
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
    if t == "pwt":  # Mitte der 4 Rauten-Seiten (eng am Rand), nicht an den Ecken
        return {"left": (x + w * 0.274, y + h * 0.349), "top": (x + w * 0.594, y + h * 0.349),
                "bottom": (x + w * 0.274, y + h * 0.768), "right": (x + w * 0.594, y + h * 0.768)}.get(handle, (x + w / 2, y + h / 2))
    if t == "temperatur":
        return {"left": (x, y + h * 0.55), "bottom": (x + w * 0.38, y + h)}.get(handle, (x + w / 2, y + h / 2))
    # pump, stad, checkvalve, shutoff, default
    return {"top": (x + w / 2, y), "bottom": (x + w / 2, y + h),
            "left": (x, y + h / 2), "right": (x + w, y + h / 2)}.get(handle, (x + w / 2, y + h / 2))


# ── Bauteil-Zeichner (liefern SVG-Fragmente, Koordinaten absolut) ───────────
def _nr_badge(parts, x, y, nr):
    if nr is None:
        return
    parts.append(f'<rect x="{x - 11}" y="{y - 8}" width="22" height="16" rx="8" fill="white" stroke="#dc2626" stroke-width="1.4"/>')
    parts.append(f'<text x="{x}" y="{y + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#dc2626">{_esc(nr)}</text>')


def _absperr(parts, cx, cy, farbe="#1e293b"):
    """Absperrventil / Kugelhahn: weiss gefüllte Dreiecke + Kreis am Treffpunkt
    (Vorlage «Kugelhahn.svg», Dominic-Feedback — nicht mehr schwarz gefüllt)."""
    parts.append(f'<polygon points="{cx - 9},{cy - 9} {cx + 9},{cy - 9} {cx},{cy}" fill="white" stroke="{farbe}" stroke-width="1.6"/>')
    parts.append(f'<polygon points="{cx - 9},{cy + 9} {cx + 9},{cy + 9} {cx},{cy}" fill="white" stroke="{farbe}" stroke-width="1.6"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{farbe}"/>')


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
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="white" stroke="#1e293b" stroke-width="1.4"/>')
    parts.append(f'<text x="{cx}" y="{cy + 3}" text-anchor="middle" font-size="7" font-weight="700" fill="#1e293b">T</text>')


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
    "valve2": (8, 6, 128), "valve3": (8, 6, 152), "shutoff": (78, 10, 52),
    "stad": (0, 0, 60), "temperatur": (10, 6, 90),
    "sicherheitsventil": (0, 0, 199), "pwt": (0, 0, 472),
    "lufterhitzer": (0, 0, 366), "absperrklappe": (0, 0, 44),
    "entleerung": (0, 0, 40), "entleerhahn": (0, 0, 46),
}


def _sym(parts, x, y, w, typ, inner):
    """Bettet ein Vorlage-SVG (Original-Koordinaten) in die Node-Box ein."""
    minx, miny, vbw = SYM_VIEWBOX[typ]
    s = w / vbw
    parts.append(f'<g transform="translate({x - minx * s:.3f},{y - miny * s:.3f}) scale({s:.4f})">')
    parts.extend(inner)
    parts.append("</g>")


_VENTIL_BASIS = [
    '<line x1="65" y1="65" x2="90" y2="65" stroke="#ff9f00" stroke-width="4" stroke-linecap="round"/>',
    '<polygon points="79,14 130,14 104,65" fill="white" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>',
    '<polygon points="79,116 130,116 104,65" fill="white" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>',
    '<circle cx="104" cy="65" r="12" fill="#000"/>',
]
SYM_INNER = {
    "valve2": [
        '<rect x="15" y="40" width="50" height="50" fill="#ffd34d" stroke="#ff9f00" stroke-width="3" stroke-linejoin="round"/>',
        '<path d="M29 54 H50 L37 65 L50 76 H29" fill="none" stroke="#ff9f00" stroke-width="3" stroke-linejoin="round"/>',
    ] + _VENTIL_BASIS,
    "valve3": [
        '<rect x="15" y="40" width="50" height="50" fill="#ffd34d" stroke="#ff9f00" stroke-width="3" stroke-linejoin="round"/>',
        '<path d="M15 40 L65 90" stroke="#ff9f00" stroke-width="3"/>',
        '<path d="M65 40 L15 90" stroke="#ff9f00" stroke-width="3"/>',
        '<path d="M29 54 H50 L37 65 L50 76 H29" fill="none" stroke="#ff9f00" stroke-width="3" stroke-linejoin="round"/>',
    ] + _VENTIL_BASIS + [
        '<polygon points="116,65 156,41 156,89" fill="white" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>',
    ],
    "shutoff": [
        '<polygon points="79,14 130,14 104,65" fill="white" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>',
        '<polygon points="79,116 130,116 104,65" fill="white" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/>',
        '<circle cx="104" cy="65" r="13" fill="#000"/>',
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
        '<g fill="none" stroke="#ff0000" stroke-width="3" stroke-linejoin="miter">',
        '<path d="M126 29 L5 29 L49 76 L5 124 L126 124"/>',
        '<path d="M204 29 L316 29 L366 76 L316 124 L204 124"/></g>',
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
        '<g stroke="#000" stroke-width="2.6" stroke-linecap="round">',
        '<line x1="3" y1="5" x2="3" y2="19"/><line x1="3" y1="12" x2="20" y2="12"/>',
        '<line x1="20" y1="3" x2="34" y2="21"/><line x1="20" y1="21" x2="34" y2="3"/></g>',
    ],
    "entleerhahn": [
        '<g stroke="#000" stroke-width="2.6" stroke-linejoin="round">',
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
    parts.append(f'<line x1="{cx}" y1="{y}" x2="{cx}" y2="{y + 120}" stroke="{VL_FARBE}" stroke-width="2.5"/>')
    parts.append(f'<line x1="{cx}" y1="{y + 285}" x2="{cx}" y2="{y + GR_H}" stroke="{RL_FARBE}" stroke-width="2.5"/>')
    # Primär-Fluss oben
    if c.get("m_prim") is not None:
        parts.append(f'<text x="{cx + 8}" y="{y + 12}" font-size="9" fill="#1e293b" font-family="monospace">m\': {_kg_h(c.get("m_prim"))} kg/h</text>')
    # Anschluss-Marker für separate Gruppe — koppelt über den Buchstaben (PHYSIK §9)
    if d.get("hat_anschluss"):
        buchstabe = _esc(d.get("anschluss_buchstabe") or "A")
        parts.append(f'<line x1="{x + 104}" y1="{y + 192}" x2="{x + 132}" y2="{y + 192}" stroke="{VL_FARBE}" stroke-width="2.2"/>')
        parts.append(f'<polygon points="{x + 132},{y + 188} {x + 139},{y + 192} {x + 132},{y + 196}" fill="{VL_FARBE}"/>')
        parts.append(f'<line x1="{x + 132}" y1="{y + 208}" x2="{x + 104}" y2="{y + 208}" stroke="{RL_FARBE}" stroke-width="2.2"/>')
        parts.append(f'<polygon points="{x + 104},{y + 204} {x + 97},{y + 208} {x + 104},{y + 212}" fill="{RL_FARBE}"/>')
        parts.append(f'<circle cx="{x + 122}" cy="{y + 200}" r="11" fill="white" stroke="#1e293b" stroke-width="1.6"/>')
        parts.append(f'<text x="{x + 122}" y="{y + 204}" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">{buchstabe}</text>')
    _absperr(parts, cx, y + 30)
    if hat_pumpe:
        _pumpe(parts, cx, y + 64, nach_unten=True)  # Dreieck zeigt zum roten Rechteck
    _thermometer(parts, cx, y + 98)
    # Wärmezähler (SIA 410): Rechteck mit Diagonale, halb schwarz — plus je ein
    # Fühler im VL und RL, ausserhalb der Bypass-Schleife
    if d.get("hat_wz"):
        parts.append(f'<rect x="{cx - 8}" y="{y + 104}" width="16" height="12" fill="white" stroke="#1e293b" stroke-width="1.6"/>')
        parts.append(f'<polygon points="{cx - 8},{y + 116} {cx + 8},{y + 116} {cx + 8},{y + 104}" fill="#1e293b"/>')
        for fy in (y + 16, y + 352):  # VL-Fühler oben, RL-Fühler unten
            parts.append(f'<line x1="{cx}" y1="{fy}" x2="{cx + 9}" y2="{fy}" stroke="#1e293b" stroke-width="1.4"/>')
            parts.append(f'<circle cx="{cx + 12.5}" cy="{fy}" r="3.5" fill="white" stroke="#1e293b" stroke-width="1.4"/>')
    # Rotes Rechteck mit gedrehtem Text
    parts.append(f'<rect x="{x + 52}" y="{y + 120}" width="46" height="165" fill="white" stroke="{VL_FARBE}" stroke-width="2"/>')
    zeilen = [
        d.get("label") or "Verbrauchergruppe",
        f'{_esc(d.get("q_kw") or "—")} kW · VL/RL {_esc(d.get("vl_temp") or "—")}/{_esc(d.get("rl_temp") or "—")} °C',
        f'm\': {_kg_h(c.get("m_sek"))} kg/h',
    ]
    for i, z in enumerate(zeilen):
        parts.append(f'<text transform="translate({x + 63 + i * 12} {y + 202}) rotate(-90)" text-anchor="middle" '
                     f'font-size="9" font-weight="{700 if i == 0 else 400}" fill="{VL_FARBE}" font-family="monospace">{_esc(z)}</text>')
    # STAD + Thermometer + Mischventil + Absperr
    _absperr(parts, cx, y + 303, "#1e293b")
    parts.append(f'<line x1="{cx + 9}" y1="{y + 294}" x2="{cx + 20}" y2="{y + 288}" stroke="#1e293b" stroke-width="1.6"/>')  # STAD-Griff
    _thermometer(parts, cx + 24, y + 320)
    # Ventil unten: 2-Weg (Einspritz/Drossel) oder 3-Weg (Beimisch)
    mv_y = y + 338
    if hat_ventil:
        parts.append(f'<polygon points="{cx - 9},{mv_y - 8} {cx + 9},{mv_y - 8} {cx},{mv_y}" fill="#1e293b"/>')
        parts.append(f'<polygon points="{cx - 9},{mv_y + 8} {cx + 9},{mv_y + 8} {cx},{mv_y}" fill="#1e293b"/>')
        if schaltung == "beimisch":  # drittes Tor links — dort mündet der Bypass
            parts.append(f'<polygon points="{cx - 18},{mv_y - 8} {cx - 18},{mv_y + 8} {cx},{mv_y}" fill="#1e293b"/>')
        m_farbe = "#f97316" if einspritz else "#94a3b8"
        parts.append(f'<rect x="{cx + 12}" y="{mv_y - 7}" width="14" height="14" rx="2" fill="{m_farbe}"/>')
        parts.append(f'<text x="{cx + 19}" y="{mv_y + 3.5}" text-anchor="middle" font-size="8" font-weight="700" fill="white">M</text>')
        if c.get("ventil"):
            parts.append(f'<text x="{cx + 30}" y="{mv_y + 3.5}" font-size="8" fill="#1e293b" font-family="monospace">kvs {c["ventil"].get("kvs_eff")}</text>')
    _absperr(parts, cx, y + 368)
    # Bypass gehört zur Schaltung (immer sichtbar, ausser bei Drossel):
    # Einspritz → mündet ÜBER dem Ventil in die Strangleitung,
    # Beimisch → mündet direkt in den dritten Anschluss des 3WV.
    if schaltung != "drossel":
        bx = x + 22
        muendung_y = mv_y - 18 if schaltung == "einspritz" else mv_y
        muendung_x = cx if schaltung == "einspritz" else cx - 18
        parts.append(f'<path d="M {cx} {y + 44} H {bx} V {muendung_y} H {muendung_x}" fill="none" stroke="{RL_FARBE}" stroke-width="1.8" stroke-dasharray="6,4"/>')
        parts.append(f'<circle cx="{cx}" cy="{y + 44}" r="3.5" fill="{RL_FARBE}"/>')
        if schaltung == "einspritz":
            parts.append(f'<circle cx="{cx}" cy="{muendung_y}" r="3.5" fill="{RL_FARBE}"/>')
        if c.get("m_bypass"):
            parts.append(f'<text x="{bx - 4}" y="{y + 210}" transform="rotate(-90 {bx - 4} {y + 210})" text-anchor="middle" '
                         f'font-size="8" fill="{RL_FARBE}" font-family="monospace">Bypass {c.get("m_bypass", 0):.3f} m³/h</text>')
    _nr_badge(parts, x + GR_W - 14, y + 64, d.get("nr"))


def zeichne_lufterhitzer_gruppe(parts, node, results):
    """Senkrechter CAD-Strang des Lufterhitzers.

    Absperrklappe → Entleerhahn → 2-Weg-Regelventil → Fühler → Entleerung →
    Register → Temperaturanzeige → Entleerung → Fühler → Entleerhahn → STAD.
    Im Rücklauf steht bewusst keine Absperrklappe: dort übernimmt das STAD die
    Absperrung (Dominic 2026-08-05). Geometrie muss mit
    frontend/src/components/hc/nodes/HydraulikNodes.jsx übereinstimmen!
    """
    d = node.get("data") or {}
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    cx = x + LH_CX

    # Strangleitung zuerst — die Bauteile decken sie danach ab.
    parts.append(f'<line x1="{cx}" y1="{y}" x2="{cx}" y2="{y + LH_REG_OBEN}" '
                 f'stroke="#ef4444" stroke-width="2.5"/>')
    parts.append(f'<line x1="{cx}" y1="{y + LH_REG_UNTEN}" x2="{cx}" y2="{y + LH_H}" '
                 f'stroke="#3b82f6" stroke-width="2.5" stroke-dasharray="9,6"/>')

    _sym(parts, cx - 8, y + 20, 16, "absperrklappe", SYM_INNER["absperrklappe"])
    for cy in (88, 478):
        _sym(parts, cx - 1, y + cy - 5.5, 23, "entleerhahn", SYM_INNER["entleerhahn"])

    # Antrieb rechts wie in der Vorlage → um die Flussachse gespiegelt. Die
    # Achse der Ventil-Vorlage liegt bei x=104 im eigenen Koordinatensystem.
    minx, _, vbw = SYM_VIEWBOX["valve2"]
    achse = (104 - minx) / vbw * 34
    parts.append(f'<g transform="translate({2 * cx},0) scale(-1,1)">')
    _sym(parts, cx - achse, y + 128, 34, "valve2", SYM_INNER["valve2"])
    parts.append("</g>")

    for cy in (196, 432):
        _sym(parts, cx - 8, y + cy - 9, 26, "temperatur", SYM_INNER["temperatur"])
    for cy in (244, 388):
        _sym(parts, cx - 1, y + cy - 6, 20, "entleerung", SYM_INNER["entleerung"])

    _sym(parts, x + LH_REG_X, y + LH_REG_OBEN, LH_REG_W, "lufterhitzer",
         SYM_INNER["lufterhitzer"])

    # Temperaturanzeige MSR: oranger Kreis mit T am Registeraustritt.
    parts.append(f'<g stroke="#f08c2e" stroke-width="2" stroke-linecap="round" fill="none">'
                 f'<line x1="{cx - 10}" y1="{y + 362}" x2="{cx + 25}" y2="{y + 362}"/>'
                 f'<circle cx="{cx + 34}" cy="{y + 362}" r="9" fill="white"/></g>')
    parts.append(f'<text x="{cx + 34}" y="{y + 366}" text-anchor="middle" font-size="11" '
                 f'fill="#f08c2e" font-family="Arial">T</text>')

    _sym(parts, cx - 6, y + 508, 12, "stad", SYM_INNER["stad"])
    _nr_badge(parts, x + LH_W, y, d.get("nr"))


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
        return
    if t == "heizkreis":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{w / 2}" fill="#f0fdf4" stroke="#16a34a" stroke-width="2.5"/>')
        v = (results.get("node_flows") or {}).get(node["id"])
        parts.append(f'<text x="{cx}" y="{cy - 2}" text-anchor="middle" font-size="10" font-weight="700" fill="#15803d">{_esc(label or "HK")}</text>')
        if v:
            parts.append(f'<text x="{cx}" y="{cy + 12}" text-anchor="middle" font-size="8" fill="#166534" font-family="monospace">{v:.3f} m³/h</text>')
    elif t == "pump":
        _pumpe(parts, cx, cy, 17, nach_unten=True)  # gleiche Flussrichtung wie im Editor (Dreieck nach unten)
    elif t in ("valve2", "valve3", "shutoff", "stad", "temperatur", "sicherheitsventil",
               "pwt", "lufterhitzer"):
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
        c = (results.get("speicher_results") or {}).get(node["id"], {}) if t == "speicher" else {}
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
        if d.get("cad_anchor"):
            return
        parts.append(f'<line x1="{x}" y1="{y + 30}" x2="{x + 46}" y2="{y + 30}" stroke="#1e293b" stroke-width="6" stroke-linecap="round"/>')
        parts.append(f'<line x1="{x + 23}" y1="{y + 30}" x2="{x + 23}" y2="{y + 4}" stroke="#1e293b" stroke-width="6" stroke-linecap="round"/>')
    elif t == "label":
        parts.append(f'<text x="{x}" y="{y + 11}" font-size="10" fill="#64748b">{_esc(label)}</text>')
        return
    elif t == "concrete_area":
        scale = max(3, min(60, _f(d.get("hatch_scale")) or 8))
        pattern_id = "hatch-" + re.sub(r"[^a-zA-Z0-9_-]", "-", str(node.get("id") or "area"))
        parts.append(
            f'<defs><pattern id="{pattern_id}" width="{scale}" height="{scale}" '
            'patternUnits="userSpaceOnUse">'
            f'<path d="M0 0 L{scale} {scale} M{scale} 0 L0 {scale}" '
            'stroke="#94a3b8" stroke-width="0.6" opacity="0.55"/>'
            '</pattern></defs>'
        )
        parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="url(#{pattern_id})" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>'
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
    # Drehung um 90° (data.rotation): nur das Symbol dreht — Nr-Badge bleibt aufrecht.
    rot = int(_f(d.get("rotation")) or 0) % 360
    if rot:
        parts.insert(sym_start, f'<g transform="rotate({rot} {cx:.2f} {cy:.2f})">')
        parts.append("</g>")
    _nr_badge(parts, x + w, y, d.get("nr"))
    if d.get("nr") is not None:
        caption = label or {
            "erzeuger": "Wärmeerzeuger", "erdsonden": "Erdsondenfeld",
            "speicher": "Speicher", "bww": "BWW-Speicher", "verteiler": "Verteiler",
            "gruppe": "Verbrauchergruppe", "heizkreis": "Heizkreis", "pump": "Pumpe",
            "valve2": "2-Weg-Ventil", "valve3": "3-Weg-Ventil", "shutoff": "Absperrventil",
            "stad": "STAD", "checkvalve": "Rückschlagventil", "waermezaehler": "Wärmezähler",
            "expansion": "Expansionsgefäss", "sicherheitsventil": "Sicherheitsventil",
            "pwt": "Plattentauscher",
        }.get(t, t)
        offset_x = _f(d.get("caption_offset_x")) or 0
        offset_y = max(0, _f(d.get("caption_offset_y")) or 0)
        cap_x, cap_y = cx + offset_x, y + h + 10 + offset_y
        cap_w = max(54, min(160, len(str(caption)) * 5.7 + 14))
        parts.append(
            f'<rect x="{cap_x - cap_w / 2}" y="{cap_y}" width="{cap_w}" height="18" '
            'rx="2" fill="white" stroke="#94a3b8" stroke-width="0.8"/>'
        )
        parts.append(
            f'<text x="{cap_x}" y="{cap_y + 12}" text-anchor="middle" font-size="9" '
            f'fill="#334155">{_esc(caption)}</text>'
        )


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
        xs += [px, px + w]
        ys += [py, py + h]
        if (n.get("data") or {}).get("nr") is not None:
            d = n.get("data") or {}
            cap_x = px + w / 2 + (_f(d.get("caption_offset_x")) or 0)
            cap_y = py + h + 10 + max(0, _f(d.get("caption_offset_y")) or 0)
            xs += [cap_x - 85, cap_x + 85]
            ys += [cap_y, cap_y + 18]
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
