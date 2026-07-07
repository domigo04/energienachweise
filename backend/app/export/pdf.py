"""PDF-Export (Auftrag F4): Deckblatt + Schema (SVG→PDF, A3 quer) + Legende
+ Berechnungen pro Bauteil (Eingaben + Resultat + Einheit, A4 hoch).

3 Optionen: inhalt = "schema" | "berechnungen" | "beides".
"""
import io
from datetime import date

from reportlab.graphics import renderPDF
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.pdfgen import canvas as pdfcanvas
from svglib.svglib import svg2rlg

from app.export.schema_svg import erzeuge_svg

PLANER = "SIREGO GmbH · Dominic Goulon · Winterthur"

TITEL = {
    "gruppe": "Verbrauchergruppe", "heizkreis": "Heizkreis", "pump": "Pumpe",
    "valve2": "2-Wege Regelventil", "valve3": "3-Wege Mischventil",
    "erzeuger": "Wärmeerzeuger", "verteiler": "Verteiler", "speicher": "Speicher",
    "checkvalve": "Rückschlagventil", "shutoff": "Kugelhahn / Absperrventil",
    "junction": "T-Stück", "verbraucher": "Verbraucher",
    "waermezaehler": "Wärmezähler", "expansion": "Expansionsgefäss",
    "bww": "Brauchwarmwasser-Speicher", "anschluss": "Anschluss-Marker",
    "stad": "STAD-Strangregulierventil", "temperatur": "Temperaturfühler",
    "sicherheitsventil": "Sicherheitsventil", "pwt": "Plattentauscher (PWT)",
}
INHALT_TEXT = {"schema": "Nur Schema", "berechnungen": "Nur Berechnungen", "beides": "Schema + Berechnungen"}


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _fmt(v, d=3):
    return "—" if v is None else f"{v:.{d}f}"


def _sortiert(nodes):
    """Nummerierte Bauteile zuerst (nach Nr), Rest hinten."""
    def key(n):
        nr = _f((n.get("data") or {}).get("nr"))
        return (0, nr) if nr is not None else (1, 9999)
    return sorted([n for n in nodes if n.get("type") not in ("junction", "label")], key=key)


# ── Legende (Nr · Bauteil · Bezeichnung · Kennwerte) ────────────────────────
def legende_zeilen(nodes: list, results: dict) -> list:
    zeilen = []
    gr = results.get("gruppe_results") or {}
    vr = results.get("verteiler_results") or {}
    nf = results.get("node_flows") or {}
    for n in _sortiert(nodes):
        d = n.get("data") or {}
        t = n.get("type")
        werte = ""
        if t == "gruppe":
            c = gr.get(n["id"], {})
            sn = {"einspritz": "Einspritz", "beimisch": "Beimisch", "drossel": "Drossel"}.get(c.get("schaltung"), "Einspritz")
            werte = (f"{sn} · {d.get('q_kw', '—')} kW · {d.get('vl_temp', '—')}/{d.get('rl_temp', '—')} °C · "
                     f"sek {_fmt(c.get('m_sek'))} / prim {_fmt(c.get('m_prim'))} m³/h")
            if c.get("einspritz"):
                werte += f" · mischt (Bypass {_fmt(c.get('m_bypass'))})"
            if _f(d.get("dp_kpa")):
                werte += f" · Δp {d.get('dp_kpa')} kPa"
            bez = d.get("label") or "Gruppe"
            if c.get("pumpe") and c["pumpe"].get("dp_kpa") is not None:
                werte += f" · {bez} Pumpe {c['pumpe']['dp_kpa']:.1f} kPa"
            if c.get("ventil"):
                werte += f" · {bez} Ventil kvs {c['ventil'].get('kvs_eff')} (Pv {_fmt(c['ventil'].get('pv'), 1)} %)"
            if d.get("hat_wz"):
                werte += " · WZ"
        elif t == "heizkreis":
            werte = f"{d.get('q_kw', '—')} kW · {d.get('vl_temp', '—')}/{d.get('rl_temp', '—')} °C · V' {_fmt(nf.get(n['id']))} m³/h"
        elif t == "verteiler":
            c = vr.get(n["id"], {})
            werte = (f"VL {_fmt(c.get('vl_vt'), 1)} / RL {_fmt(c.get('rl_misch'), 1)} °C · "
                     f"Σ {_fmt(c.get('q_total'), 2)} kW · {_fmt(c.get('m_prim_total'))} m³/h")
            if c.get("dp_max_ast") is not None:
                werte += f" · Δp Ast {c.get('dp_max_ast_nr')}: {c.get('dp_max_ast')} kPa"
        elif t == "pump":
            p = (results.get("pumpen_results") or {}).get(n["id"], {})
            werte = f"V' {_fmt(p.get('v') if p else nf.get(n['id']))} m³/h"
            if p.get("foerderhoehe_kpa") is not None:
                werte += f" · Förderhöhe {p['foerderhoehe_kpa']:.1f} kPa"
                if p.get("dp_ast_kpa"):
                    werte += f" (gemeinsam {p.get('dp_gemeinsam_kpa') or 0} + Ast {p['dp_ast_kpa']})"
        elif t in ("valve2", "valve3"):
            ve = (results.get("ventil_results") or {}).get(n["id"])
            werte = f"V' {_fmt(nf.get(n['id']))} m³/h"
            if ve:
                werte += f" · kvs {ve.get('kvs_eff')} · Pv {_fmt(ve.get('pv'), 1)} %"
        elif t == "waermezaehler":
            werte = " · ".join(x for x in [d.get("typ"), f"V' {_fmt(nf.get(n['id']))} m³/h (aus Leitung)"] if x)
        elif t == "expansion":
            ex = (results.get("expansion_results") or {}).get(n["id"])
            if ex and "fehler" not in ex:
                werte = f"VN {ex['vn_l']} l → {ex['vorschlag_l']} l · p0 {ex['p0_bar']} / pfin {ex['pfin_bar']} bar"
            elif ex:
                werte = f"⚠ {ex['fehler']}"
        elif t == "erzeuger":
            werte = " · ".join(x for x in [d.get("typ"), f"{d.get('leistung_kw')} kW" if d.get("leistung_kw") else None] if x) or "—"
        elif t == "anschluss":
            werte = f"Buchstabe {d.get('buchstabe') or '?'}"
        zeilen.append({"nr": d.get("nr"), "bauteil": TITEL.get(t, t), "bezeichnung": d.get("label") or "", "werte": werte or "—"})
    return zeilen


# ── Berechnungen pro Bauteil (Eingaben + Resultate mit Einheit) ─────────────
def berechnungs_abschnitte(nodes: list, results: dict) -> list:
    abschnitte = []
    gr = results.get("gruppe_results") or {}
    vr = results.get("verteiler_results") or {}
    nf = results.get("node_flows") or {}
    for n in _sortiert(nodes):
        d = n.get("data") or {}
        t = n.get("type")
        eingaben, resultate = [], []
        if t == "gruppe":
            c = gr.get(n["id"], {})
            schaltung = {"einspritz": "Einspritzschaltung (2WV)", "beimisch": "Beimischschaltung (3WV)",
                         "drossel": "Drosselschaltung (ohne Pumpe)"}.get(c.get("schaltung"), "Einspritzschaltung (2WV)")
            eingaben = [("Schaltung", schaltung, ""),
                        ("Leistung Q", d.get("q_kw"), "kW"), ("Vorlauf VL", d.get("vl_temp"), "°C"),
                        ("Rücklauf RL", d.get("rl_temp"), "°C"), ("Druckverlust Ast", d.get("dp_kpa"), "kPa"),
                        ("Wärmezähler (mit VL-/RL-Fühler)", "ja" if d.get("hat_wz") else "nein", "")]
            resultate = [("V' sekundär (Gruppenseite)", _fmt(c.get("m_sek")), "m³/h"),
                         ("V' primär (Verteilerseite)", _fmt(c.get("m_prim")), "m³/h"),
                         ("ΔT sekundär", _fmt(c.get("dt_sek"), 1), "K"),
                         ("ΔT primär", _fmt(c.get("dt_prim"), 1), "K"),
                         ("Einspritzung", "ja" if c.get("einspritz") else "nein", ""),
                         ("Bypass-Fluss", _fmt(c.get("m_bypass")), "m³/h")]
            pu = c.get("pumpe")
            if pu and pu.get("dp_kpa") is not None:
                eingaben += [("Pumpe: Rohrlänge VL+RL", d.get("pumpe_rohr_m"), "m"),
                             ("Pumpe: Druckgefälle", d.get("pumpe_pam") or 70, "Pa/m"),
                             ("Pumpe: Apparate", d.get("pumpe_apparate_kpa") or 0, "kPa")]
                resultate += [("Pumpe: V' (sekundär)", _fmt(pu.get("v")), "m³/h"),
                              ("Pumpe: Förderhöhe", _fmt(pu.get("dp_kpa"), 1), "kPa"),
                              ("Pumpe: Förderhöhe", _fmt(pu.get("mws"), 2), "mWS")]
            ve = c.get("ventil")
            if ve:
                eingaben += [("Ventil: Δpvar", d.get("ventil_dp_var"), "kPa")]
                resultate += [("Ventil: V' (primär)", _fmt(ve.get("v")), "m³/h"),
                              ("Ventil: kvs theoretisch", _fmt(ve.get("kvs_theor")), ""),
                              ("Ventil: kvs gewählt", ve.get("kvs_eff"), ""),
                              ("Ventil: Δp Ventil", _fmt(ve.get("dp_v_eff_kpa"), 2), "kPa"),
                              ("Ventil: Autorität Pv", _fmt(ve.get("pv"), 1), "%")]
        elif t == "heizkreis":
            eingaben = [("Leistung Q", d.get("q_kw"), "kW"), ("Vorlauf VL", d.get("vl_temp"), "°C"),
                        ("Rücklauf RL", d.get("rl_temp"), "°C")]
            resultate = [("Volumenstrom V'", _fmt(nf.get(n["id"])), "m³/h")]
        elif t == "verteiler":
            c = vr.get(n["id"], {})
            eingaben = [("Anzahl Abgänge", d.get("abgaenge") or 4, "")]
            resultate = [("VL Verteiler (max. Gruppen-VL)", _fmt(c.get("vl_vt"), 1), "°C"),
                         ("RL Misch (mengengewichtet)", _fmt(c.get("rl_misch"), 1), "°C"),
                         ("Σ Leistung", _fmt(c.get("q_total"), 2), "kW"),
                         ("Σ V' primär", _fmt(c.get("m_prim_total")), "m³/h"),
                         ("Δp ungünstigster Ast" + (f" (Ast {c.get('dp_max_ast_nr')})" if c.get("dp_max_ast_nr") else ""),
                          _fmt(c.get("dp_max_ast"), 1), "kPa")]
        elif t in ("valve2", "valve3"):
            ve = (results.get("ventil_results") or {}).get(n["id"])
            eingaben = [("Durchfluss V' (aus Schema)", _fmt(nf.get(n["id"])), "m³/h"), ("Δpvar", d.get("dp_var"), "kPa"),
                        ("kvs gewählt", d.get("kvs_eff"), "")]
            if ve:
                resultate = [("kvs theoretisch", _fmt(ve.get("kvs_theor")), "m³/h·bar^0.5"),
                             ("kvs Vorschlag (Norm-Reihe)", ve.get("kvs_vorschlag"), ""),
                             ("Δp Ventil", _fmt(ve.get("dp_v_eff_kpa"), 2), "kPa"),
                             ("Ventilautorität Pv", _fmt(ve.get("pv"), 1), "%")]
        elif t == "pump":
            p = (results.get("pumpen_results") or {}).get(n["id"], {})
            eingaben = [("Förder-V' (aus Schema)", _fmt(p.get("v")), "m³/h"), ("Rohrlänge VL+RL", d.get("rohr_m"), "m"),
                        ("Druckgefälle", _f(d.get("pam")) or 70, "Pa/m"), ("Apparate", _f(d.get("apparate_kpa")) or 0, "kPa")]
            if p.get("foerderhoehe_kpa") is not None:
                resultate = [("Δp gemeinsamer Teil", _fmt(p.get("dp_gemeinsam_kpa"), 2), "kPa"),
                             ("Δp ungünstigster Ast (Verteiler)", _fmt(p.get("dp_ast_kpa"), 2), "kPa"),
                             ("Förderhöhe gesamt", _fmt(p.get("foerderhoehe_kpa"), 1), "kPa"),
                             ("Förderhöhe gesamt", _fmt(p.get("mws"), 2), "mWS")]
        elif t == "waermezaehler":
            eingaben = [("Typ", d.get("typ") or "—", ""), ("Fabrikat", d.get("fabrikat") or "—", "")]
            resultate = [("Durchfluss (aus Leitung übernommen)", _fmt(nf.get(n["id"])), "m³/h")]
        elif t == "expansion":
            ex = (results.get("expansion_results") or {}).get(n["id"])
            medium = {"heizungswasser": "Heizungswasser", "frostschutz30": "Frostschutz 30 %",
                      "frostschutz40": "Frostschutz 40 %", "ews": "Erdsonden (EWS)"}.get(d.get("medium") or "heizungswasser")
            exv = ex if (ex and "fehler" not in ex) else {}
            eingaben = [("Anlageinhalt Vsys (aus Rohrtabelle)", exv.get("vsys_l", d.get("anlageinhalt_l")), "l"),
                        ("Speicherinhalt Vsto", d.get("speicher_l") or 0, "l"),
                        ("Medium", medium, ""), ("Mitteltemperatur (auto: höchste VL)", exv.get("t_mittel", d.get("t_mittel")), "°C"),
                        ("Erzeugerleistung (auto)", exv.get("leistung_kw", d.get("leistung_kw")), "kW"),
                        ("Statische Höhe", d.get("hoehe_m"), "m"), ("SV-Ansprechdruck pSV", d.get("psv_bar"), "bar")]
            if ex and "fehler" not in ex:
                resultate = [("Ausdehnung e", ex["e"], ""), ("Faktor X (Wasserreserve)", ex["x"], ""),
                             ("Vex,tot", ex["vex_tot_l"], "l"), ("Vordruck p0", ex["p0_bar"], "bar"),
                             ("Enddruck pfin (pSV/1.15)", ex["pfin_bar"], "bar"), ("Nennvolumen VN,min", ex["vn_l"], "l"),
                             ("Vorschlag Norm-Grösse", ex["vorschlag_l"], "l")]
            elif ex:
                resultate = [("Fehler", ex["fehler"], "")]
        elif t == "erzeuger":
            eingaben = [("Typ", d.get("typ") or "—", ""), ("Nennleistung", d.get("leistung_kw"), "kW"),
                        ("VL / RL", f"{d.get('vl_temp', '—')} / {d.get('rl_temp', '—')}", "°C")]
        else:
            continue
        abschnitte.append({"nr": d.get("nr"), "titel": TITEL.get(t, t), "bezeichnung": d.get("label") or "",
                           "eingaben": eingaben, "resultate": resultate})
    return abschnitte


# ── PDF zusammenbauen ───────────────────────────────────────────────────────
def _deckblatt(c, projekt_name, schema_name, inhalt):
    w, h = A4
    c.setPageSize(A4)
    c.setFillColorRGB(0.86, 0.15, 0.15)
    c.rect(0, h - 24, w, 24, stroke=0, fill=1)
    c.setFillColorRGB(0.1, 0.12, 0.2)
    c.setFont("Helvetica", 11)
    c.drawString(50, h - 90, "Heizungscockpit — Anlagendokumentation")
    c.setFont("Helvetica-Bold", 26)
    c.drawString(50, h - 130, projekt_name or "Projekt")
    c.setFont("Helvetica", 14)
    c.drawString(50, h - 155, schema_name or "Schema")
    c.setFont("Helvetica", 11)
    y = h - 210
    for label, wert in [("Datum", date.today().strftime("%d.%m.%Y")),
                        ("Planer", PLANER),
                        ("Inhalt", INHALT_TEXT.get(inhalt, inhalt))]:
        c.setFillColorRGB(0.45, 0.5, 0.55)
        c.drawString(50, y, label)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.drawString(130, y, str(wert))
        y -= 20
    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.setFont("Helvetica", 8)
    c.drawString(50, 40, "Erstellt mit Heizungscockpit · Berechnungen nach PHYSIK.md (V' = Q / (1.163 · ΔT), Einspritzung §4, Δp §5)")
    c.showPage()


def _schema_seite(c, svg_string, projekt_name, schema_name):
    seite = landscape(A3)
    c.setPageSize(seite)
    zeichnung = svg2rlg(io.StringIO(svg_string))
    rand = 30
    nutz_b, nutz_h = seite[0] - 2 * rand, seite[1] - 2 * rand - 20
    skala = min(nutz_b / zeichnung.width, nutz_h / zeichnung.height, 1.5)
    zeichnung.scale(skala, skala)
    zeichnung.width *= skala
    zeichnung.height *= skala
    renderPDF.draw(zeichnung, c, rand + (nutz_b - zeichnung.width) / 2,
                   rand + 20 + (nutz_h - zeichnung.height) / 2)
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.drawString(rand, 18, f"{projekt_name} · {schema_name} · {date.today().strftime('%d.%m.%Y')} · {PLANER}")
    c.showPage()


def _legende_seiten(c, zeilen, projekt_name, warnungen=None):
    if not zeilen:
        return
    seite = landscape(A3)
    spalten = [(40, "Nr"), (80, "Bauteil"), (240, "Bezeichnung"), (420, "Kennwerte")]

    def kopf(y):
        c.setPageSize(seite)
        c.setFont("Helvetica-Bold", 14)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.drawString(40, seite[1] - 50, f"Legende — {projekt_name}")
        c.setFont("Helvetica-Bold", 9)
        for x, t in spalten:
            c.drawString(x, y, t)
        c.setLineWidth(0.5)
        c.line(40, y - 4, seite[0] - 40, y - 4)
        return y - 18

    y = kopf(seite[1] - 80)
    c.setFont("Helvetica", 9)
    for z in zeilen:
        if y < 50:
            c.showPage()
            y = kopf(seite[1] - 80)
            c.setFont("Helvetica", 9)
        c.drawString(40, y, str(z["nr"] if z["nr"] is not None else "—"))
        c.drawString(80, y, z["bauteil"][:28])
        c.drawString(240, y, z["bezeichnung"][:32])
        c.drawString(420, y, z["werte"][:110])
        y -= 15
    if warnungen:
        y -= 8
        c.setFillColorRGB(0.73, 0.11, 0.11)
        c.setFont("Helvetica-Bold", 9)
        for w in warnungen:
            if y < 50:
                c.showPage()
                y = kopf(seite[1] - 80)
                c.setFillColorRGB(0.73, 0.11, 0.11)
                c.setFont("Helvetica-Bold", 9)
            c.drawString(40, y, f"⚠ {w}")
            y -= 15
    c.showPage()


def _berechnungs_seiten(c, abschnitte, projekt_name):
    w, h = A4
    def kopf():
        c.setPageSize(A4)
        c.setFont("Helvetica-Bold", 14)
        c.setFillColorRGB(0.1, 0.12, 0.2)
        c.drawString(50, h - 50, f"Berechnungen — {projekt_name}")
        return h - 80

    y = kopf()
    for a in abschnitte:
        bedarf = 30 + 14 * (len(a["eingaben"]) + len(a["resultate"]) + 2)
        if y - bedarf < 50:
            c.showPage()
            y = kopf()
        nr = f"Nr. {a['nr']} — " if a["nr"] is not None else ""
        c.setFont("Helvetica-Bold", 11)
        c.setFillColorRGB(0.86, 0.15, 0.15)
        c.drawString(50, y, f"{nr}{a['titel']}{' — ' + a['bezeichnung'] if a['bezeichnung'] else ''}")
        y -= 16
        c.setFillColorRGB(0.1, 0.12, 0.2)
        for gruppe, rows in [("Eingaben", a["eingaben"]), ("Resultate", a["resultate"])]:
            if not rows:
                continue
            c.setFont("Helvetica-Bold", 9)
            c.setFillColorRGB(0.45, 0.5, 0.55)
            c.drawString(60, y, gruppe)
            y -= 13
            c.setFont("Helvetica", 9)
            c.setFillColorRGB(0.1, 0.12, 0.2)
            for name, wert, einheit in rows:
                c.drawString(70, y, str(name))
                c.drawRightString(430, y, "—" if wert in (None, "") else str(wert))
                c.drawString(440, y, einheit)
                y -= 13
            y -= 4
        y -= 10
    c.showPage()


def erzeuge_pdf(projekt_name: str, schema_name: str, inhalt: str,
                nodes: list, edges: list, results: dict) -> bytes:
    """Komplettes PDF gemäss gewähltem Inhalt (Deckblatt immer dabei)."""
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{projekt_name} — {schema_name}")
    _deckblatt(c, projekt_name, schema_name, inhalt)
    if inhalt in ("schema", "beides"):
        svg = erzeuge_svg(nodes, edges, results)
        _schema_seite(c, svg, projekt_name, schema_name)
        _legende_seiten(c, legende_zeilen(nodes, results), projekt_name, results.get("anschluss_warnings"))
    if inhalt in ("berechnungen", "beides"):
        _berechnungs_seiten(c, berechnungs_abschnitte(nodes, results), projekt_name)
    c.save()
    return buf.getvalue()
