"""Schema → SVG (synoptischer CAD-Look) — fürs PDF, kein Screenshot.

Zeichnet den gespeicherten Graphen (Nodes + Edges) als Vektor-SVG:
VL-Balken oben / RL-Balken unten, Verbrauchergruppen als vertikale Stränge
(Pumpe, rotes Rechteck mit gedrehtem Text, STAD, Mischventil, Bypass).

WICHTIG: Die Geometrie-Konstanten müssen mit dem Editor übereinstimmen
(frontend/src/components/hc/nodes/HydraulikNodes.jsx).
"""
import html
import re
from typing import Optional

VL_FARBE = "#ef4444"
RL_FARBE = "#3b82f6"

# Verteiler-Rahmen (VL-Balken oben, RL-Balken unten, Stränge dazwischen)
VT_S = 170          # Abstand zwischen den Abgängen
VT_X0 = 120         # linke Zone (Summen + Hauptanschlüsse)
VT_BAR = 26         # Balkenhöhe
VT_LUECKE_STD = 560 # Standard-Abstand zwischen den Balken (data.hoehe überschreibt)

# Verbrauchergruppen-Strang
GR_W, GR_H, GR_CX = 150, 400, 75

# Grössen der übrigen Bauteile (aus symbols.jsx)
GROESSEN = {
    "heizkreis": (74, 74), "pump": (48, 48), "valve2": (68, 66),
    "valve3": (70, 88), "checkvalve": (48, 48), "shutoff": (48, 48),
    "erzeuger": (68, 50), "verbraucher": (68, 50), "speicher": (60, 104),
    "junction": (46, 46), "label": (120, 16),
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


def node_groesse(node):
    if node.get("type") == "verteiler":
        return (vt_breite(node), vt_hoehe(node))
    if node.get("type") == "gruppe":
        return (GR_W, GR_H)
    return GROESSEN.get(node.get("type"), (60, 60))


def handle_pos(node, handle: Optional[str]):
    """Absolute Position eines Anschlusses — gleiche Logik wie im Editor."""
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    w, h = node_groesse(node)
    t = node.get("type")

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
    if t == "heizkreis":
        return {"vl": (x, y + 28), "rl": (x + w, y + 28),
                "top": (x + w / 2, y), "bottom": (x + w / 2, y + h)}.get(handle, (x + w / 2, y + h / 2))
    if t == "erzeuger":
        return {"vl": (x + w, y + h * 0.25), "rl": (x + w, y + h * 0.75),
                "top": (x + w / 2, y), "bottom": (x + w / 2, y + h),
                "left": (x, y + h / 2), "right": (x + w, y + h / 2)}.get(handle, (x + w / 2, y + h / 2))
    if t == "junction":
        return {"left": (x, y + 30), "right": (x + w, y + 30), "top": (x + 23, y)}.get(handle, (x + 23, y + 30))
    if t == "speicher":
        return {"top-l": (x + w * 0.3, y), "top-r": (x + w * 0.7, y),
                "bot-l": (x + w * 0.3, y + h), "bot-r": (x + w * 0.7, y + h),
                "left": (x, y + h / 2), "right": (x + w, y + h / 2)}.get(handle, (x + w / 2, y + h / 2))
    # pump, valve2, valve3, checkvalve, shutoff, default
    return {"top": (x + w / 2, y), "bottom": (x + w / 2, y + h),
            "left": (x, y + h / 2), "right": (x + w, y + h / 2)}.get(handle, (x + w / 2, y + h / 2))


# ── Bauteil-Zeichner (liefern SVG-Fragmente, Koordinaten absolut) ───────────
def _nr_badge(parts, x, y, nr):
    if nr is None:
        return
    parts.append(f'<rect x="{x - 11}" y="{y - 8}" width="22" height="16" rx="8" fill="white" stroke="#dc2626" stroke-width="1.4"/>')
    parts.append(f'<text x="{x}" y="{y + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#dc2626">{_esc(nr)}</text>')


def _absperr(parts, cx, cy, farbe="#1e293b"):
    """Absperrventil (zwei gefüllte Dreiecke)."""
    parts.append(f'<polygon points="{cx - 9},{cy - 9} {cx + 9},{cy - 9} {cx},{cy}" fill="{farbe}"/>')
    parts.append(f'<polygon points="{cx - 9},{cy + 9} {cx + 9},{cy + 9} {cx},{cy}" fill="{farbe}"/>')


def _pumpe(parts, cx, cy, r=15, nach_unten=False):
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="white" stroke="#1e293b" stroke-width="2.2"/>')
    if nach_unten:  # Dreieck zeigt in Flussrichtung nach unten (zum Verbraucher)
        parts.append(f'<polygon points="{cx - r * 0.55},{cy - r * 0.5} {cx + r * 0.55},{cy - r * 0.5} {cx},{cy + r * 0.65}" fill="#1e293b"/>')
    else:
        parts.append(f'<polygon points="{cx - r * 0.55},{cy + r * 0.5} {cx + r * 0.55},{cy + r * 0.5} {cx},{cy - r * 0.65}" fill="#1e293b"/>')


def _thermometer(parts, cx, cy):
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="white" stroke="#1e293b" stroke-width="1.4"/>')
    parts.append(f'<text x="{cx}" y="{cy + 3}" text-anchor="middle" font-size="7" font-weight="700" fill="#1e293b">T</text>')


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
    hat_pumpe = d.get("hat_pumpe") is not False
    hat_ventil = d.get("hat_ventil") is not False

    # Strangleitung: oben VL (primär), unten RL
    parts.append(f'<line x1="{cx}" y1="{y}" x2="{cx}" y2="{y + 120}" stroke="{VL_FARBE}" stroke-width="2.5"/>')
    parts.append(f'<line x1="{cx}" y1="{y + 285}" x2="{cx}" y2="{y + GR_H}" stroke="{RL_FARBE}" stroke-width="2.5"/>')
    # Primär-Fluss oben
    if c.get("m_prim") is not None:
        parts.append(f'<text x="{cx + 8}" y="{y + 12}" font-size="9" fill="#1e293b" font-family="monospace">m\': {_kg_h(c.get("m_prim"))} kg/h</text>')
    _absperr(parts, cx, y + 30)
    if hat_pumpe:
        _pumpe(parts, cx, y + 64, nach_unten=True)  # Dreieck zeigt zum roten Rechteck
    _thermometer(parts, cx, y + 98)
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
    # 3-Weg-Mischventil (nur wenn Ventil vorhanden)
    mv_y = y + 338
    if hat_ventil:
        parts.append(f'<polygon points="{cx - 9},{mv_y - 8} {cx + 9},{mv_y - 8} {cx},{mv_y}" fill="#1e293b"/>')
        parts.append(f'<polygon points="{cx - 9},{mv_y + 8} {cx + 9},{mv_y + 8} {cx},{mv_y}" fill="#1e293b"/>')
        m_farbe = "#f97316" if einspritz else "#94a3b8"
        parts.append(f'<rect x="{cx + 12}" y="{mv_y - 7}" width="14" height="14" rx="2" fill="{m_farbe}"/>')
        parts.append(f'<text x="{cx + 19}" y="{mv_y + 3.5}" text-anchor="middle" font-size="8" font-weight="700" fill="white">M</text>')
        if c.get("ventil"):
            parts.append(f'<text x="{cx + 30}" y="{mv_y + 3.5}" font-size="8" fill="#1e293b" font-family="monospace">kvs {c["ventil"].get("kvs_eff")}</text>')
    _absperr(parts, cx, y + 368)
    # Bypass (nur bei aktiver Einspritzung): gestrichelte blaue Schleife links
    if einspritz:
        bx = x + 22
        parts.append(f'<path d="M {cx} {y + 44} H {bx} V {mv_y} H {cx - 9}" fill="none" stroke="{RL_FARBE}" stroke-width="1.8" stroke-dasharray="6,4"/>')
        parts.append(f'<circle cx="{cx}" cy="{y + 44}" r="3.5" fill="{RL_FARBE}"/>')
        parts.append(f'<circle cx="{cx}" cy="{mv_y}" r="3.5" fill="{RL_FARBE}"/>')
        parts.append(f'<text x="{bx - 4}" y="{y + 210}" transform="rotate(-90 {bx - 4} {y + 210})" text-anchor="middle" '
                     f'font-size="8" fill="{RL_FARBE}" font-family="monospace">Bypass {c.get("m_bypass", 0):.3f} m³/h</text>')
    _nr_badge(parts, x + GR_W - 14, y + 64, d.get("nr"))


def zeichne_standard(parts, node, results):
    """Vereinfachte Symbole für die übrigen Bauteile."""
    t = node.get("type")
    d = node.get("data") or {}
    x = (node.get("position") or {}).get("x", 0)
    y = (node.get("position") or {}).get("y", 0)
    w, h = node_groesse(node)
    cx, cy = x + w / 2, y + h / 2
    label = d.get("label")

    if t == "heizkreis":
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{w / 2}" fill="#f0fdf4" stroke="#16a34a" stroke-width="2.5"/>')
        v = (results.get("node_flows") or {}).get(node["id"])
        parts.append(f'<text x="{cx}" y="{cy - 2}" text-anchor="middle" font-size="10" font-weight="700" fill="#15803d">{_esc(label or "HK")}</text>')
        if v:
            parts.append(f'<text x="{cx}" y="{cy + 12}" text-anchor="middle" font-size="8" fill="#166534" font-family="monospace">{v:.3f} m³/h</text>')
    elif t == "pump":
        _pumpe(parts, cx, cy, 17)
    elif t in ("valve2", "valve3"):
        farbe = "#1d4ed8" if t == "valve2" else "#1e293b"
        parts.append(f'<polygon points="{cx - 12},{cy - 12} {cx + 12},{cy - 12} {cx},{cy}" fill="none" stroke="{farbe}" stroke-width="2.2"/>')
        parts.append(f'<polygon points="{cx - 12},{cy + 12} {cx + 12},{cy + 12} {cx},{cy}" fill="none" stroke="{farbe}" stroke-width="2.2"/>')
        parts.append(f'<rect x="{cx + 14}" y="{cy - 7}" width="14" height="14" rx="2" fill="white" stroke="{farbe}" stroke-width="1.6"/>')
        parts.append(f'<text x="{cx + 21}" y="{cy + 3.5}" text-anchor="middle" font-size="8" font-weight="700" fill="{farbe}">M</text>')
    elif t in ("checkvalve", "shutoff"):
        _absperr(parts, cx, cy)
    elif t in ("erzeuger", "verbraucher"):
        farbe = "#1e293b" if t == "erzeuger" else "#f97316"
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="white" stroke="{farbe}" stroke-width="2"/>')
        parts.append(f'<text x="{cx}" y="{cy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="{farbe}">{_esc(label or ("WE" if t == "erzeuger" else ""))}</text>')
    elif t == "speicher":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#fef2f2" stroke="#dc2626" stroke-width="2.5"/>')
        parts.append(f'<text x="{cx}" y="{cy + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#dc2626">SP</text>')
    elif t == "junction":
        parts.append(f'<line x1="{x}" y1="{y + 30}" x2="{x + 46}" y2="{y + 30}" stroke="#1e293b" stroke-width="6" stroke-linecap="round"/>')
        parts.append(f'<line x1="{x + 23}" y1="{y + 30}" x2="{x + 23}" y2="{y + 4}" stroke="#1e293b" stroke-width="6" stroke-linecap="round"/>')
    elif t == "label":
        parts.append(f'<text x="{x}" y="{y + 11}" font-size="10" fill="#64748b">{_esc(label)}</text>')
        return
    if label and t not in ("heizkreis", "erzeuger", "verbraucher", "label"):
        parts.append(f'<text x="{cx}" y="{y + h + 12}" text-anchor="middle" font-size="9" fill="#475569">{_esc(label)}</text>')
    _nr_badge(parts, x + w, y, d.get("nr"))


def zeichne_edge(parts, edge, nodes_by_id, results):
    quelle = nodes_by_id.get(edge.get("source"))
    ziel = nodes_by_id.get(edge.get("target"))
    if not quelle or not ziel:
        return
    x1, y1 = handle_pos(quelle, edge.get("sourceHandle"))
    x2, y2 = handle_pos(ziel, edge.get("targetHandle"))
    stroke = edge.get("stroke") or (edge.get("style") or {}).get("stroke") or "#1e293b"
    dash = ' stroke-dasharray="8,5"' if stroke == RL_FARBE else ""

    if abs(x1 - x2) < 4:  # senkrechte Leitung
        pfad = f"M {x1} {y1} L {x2} {y2}"
        lx, ly = x1 + 6, (y1 + y2) / 2
    else:  # L-Führung über die Mitte
        ym = (y1 + y2) / 2
        pfad = f"M {x1} {y1} V {ym} H {x2} V {y2}"
        lx, ly = (x1 + x2) / 2, ym - 5
    parts.append(f'<path d="{pfad}" fill="none" stroke="{stroke}" stroke-width="2.5"{dash}/>')
    fluss = (results.get("edge_flows") or {}).get(edge.get("id"))
    if fluss:
        parts.append(f'<text x="{lx}" y="{ly}" font-size="9" font-weight="600" fill="#1e293b" font-family="monospace">{fluss:.3f} m³/h</text>')


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
        else:
            zeichne_standard(parts, n, results)
    parts.append("</svg>")
    return "\n".join(parts)
