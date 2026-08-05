"""PDF-Export (Auftrag F4): Deckblatt + Schema (SVG→PDF, A3 quer) + Legende
+ Berechnungen pro Bauteil (Eingaben + Resultat + Einheit, A4 hoch).

3 Optionen: inhalt = "schema" | "berechnungen" | "beides".
"""
import base64
import io
from datetime import date

from reportlab.graphics import renderPDF
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.lib.utils import ImageReader
from svglib.svglib import svg2rlg

from app.export.schema_svg import erzeuge_svg
from app.data.generator_types import (
    HEAT_PUMP_TYPES,
    SOURCE_CIRCUIT_TYPES,
    generator_type_label,
)

PLANER = "SIREGO GmbH · Dominic Goulon · Winterthur"

TITEL = {
    "gruppe": "Verbrauchergruppe", "heizkreis": "Heizkreis", "pump": "Pumpe",
    "valve2": "2-Wege Regelventil", "valve3": "3-Wege Mischventil",
    "erzeuger": "Wärmeerzeuger", "verteiler": "Verteiler", "speicher": "Speicher",
    "erdsonden": "Erdsondenfeld",
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
    ergebnisse_erzeuger = results.get("heatpump_results") or {}
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
            if p.get("ist_solepumpe"):
                werte = "Solepumpe · " + werte
                if p.get("foerderhoehe_mws") is not None:
                    werte += (f" · Förderhöhe {p['foerderhoehe_mws']:.2f} mWs "
                              f"({p['foerderhoehe_kpa']:.1f} kPa) aus dem Erdsondenfeld")
            elif p.get("foerderhoehe_kpa") is not None:
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
                werte = f"! {ex['fehler']}"
        elif t == "erzeuger":
            er = ergebnisse_erzeuger.get(n["id"], {})
            werte = " · ".join(x for x in [
                d.get("typ") or generator_type_label(d.get("generator_type")),
                f"{d.get('leistung_kw')} kW" if d.get("leistung_kw") else None,
                f"Heizung {_fmt(er.get('heating_flow_m3h'))} m³/h" if er.get("heating_flow_m3h") is not None else None,
                f"Quelle {_fmt(er.get('q_source_kw'), 1)} kW" if er.get("q_source_kw") is not None else None,
                f"Sole {_fmt(er.get('source_flow_m3h'))} m³/h" if er.get("source_flow_m3h") is not None else None,
            ] if x) or "—"
        elif t == "bww":
            b = bww_results.get(n["id"]) or {}
            eingaben = [("Gewählter Speicherinhalt", d.get("speicher_liter"), "l")]
            if b.get("anschlussleistung_kw") is not None:
                for wohnung in b.get("wohnungen") or []:
                    eingaben.append((
                        wohnung.get("name") or "Wohnung",
                        wohnung.get("flaeche_m2"),
                        f"m² → {wohnung.get('personen')} P",
                    ))
                eingaben += [
                    ("Personen", b.get("personen"), "P"),
                    ("Gebäudeart", b.get("bezugseinheit"), ""),
                    ("Bezugseinheit Durchschnitt", b.get("bezugseinheit_durchschnitt_l_p_d"), "l/(d·P)"),
                    ("Bezugseinheit Spitze", b.get("bezugseinheit_spitze_l_p_d"), "l/(d·P)"),
                    ("Warmhaltesystem", b.get("warmhaltesystem"), ""),
                    ("Ladezyklen pro Tag", b.get("ladezyklen_pro_tag"), ""),
                    ("Zeit eines Ladezyklus", b.get("ladezeit_h"), "h"),
                    ("Temperaturerhöhung ΔΘ", b.get("temperaturerhoehung_k"), "K"),
                    ("Wirkungsgrad Wärmeübertragung", b.get("wirkungsgrad"), ""),
                ]
                resultate = [
                    ("Nutzwarmwasserbedarf", b.get("nutzwarmwasserbedarf_l_d"), "l/d"),
                    ("Steuervolumen", b.get("steuervolumen_l"), "l"),
                    ("Spitzendeckungsvolumen", b.get("spitzendeckungsvolumen_l"), "l"),
                    ("Bereitschaftsvolumen", b.get("bereitschaftsvolumen_l"), "l"),
                    ("Anschlussleistung", b.get("anschlussleistung_kw"), "kW"),
                    ("Wärmepumpenleistung verfügbar", b.get("waermepumpenleistung_kw"), "kW"),
                    ("Leistungsreserve", b.get("leistungsreserve_kw"), "kW"),
                    ("Norm", "SIA 385/2", ""),
                ]
                rechenweg = b.get("rechenweg") or []
                hinweise = b.get("warnungen") or []
        elif t == "erdsonden":
            anzahl = max(1, min(24, int(_f(d.get("sonden_anzahl")) or 5)))
            laenge = _f(d.get("sonden_laenge_m"))
            werte = f"{anzahl} Duplex-Erdsonden"
            if laenge and laenge > 0:
                werte += f" à {laenge:g} m · {anzahl * laenge:g} m total"
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
    ergebnisse_erzeuger = results.get("heatpump_results") or {}
    speicher_results = results.get("speicher_results") or {}
    bww_results = results.get("bww_results") or {}
    erdsonden_results = results.get("erdsonden_results") or {}
    for n in _sortiert(nodes):
        d = n.get("data") or {}
        t = n.get("type")
        eingaben, resultate, rechenweg, hinweise = [], [], [], []
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
            if p.get("ist_solepumpe"):
                eingaben = [("Einbauort", "Quellenkreis (Sole)", ""),
                            ("Förder-V' (aus Wärmepumpe)", _fmt(p.get("v")), "m³/h")]
                resultate = [
                    ("Δp Leitungen (Erdsondenfeld)", _fmt(p.get("dp_leitungen_mws"), 2), "mWs"),
                    ("Δp Verteiler", _fmt(p.get("dp_verteiler_mws"), 2), "mWs"),
                    ("Δp Wärmepumpe (Verdampfer)", _fmt(p.get("dp_wp_mws"), 2), "mWs"),
                    ("Förderhöhe gesamt", _fmt(p.get("foerderhoehe_mws"), 2), "mWs"),
                    ("Förderhöhe gesamt", _fmt(p.get("foerderhoehe_kpa"), 1), "kPa"),
                    ("Betriebspunkt für die Fabrikatswahl",
                     f"{_fmt(p.get('v'), 2)} m³/h bei {_fmt(p.get('foerderhoehe_mws'), 2)} mWs", ""),
                ]
                hinweise = p.get("warnings") or []
                abschnitte.append({"nr": d.get("nr"), "titel": TITEL.get(t, t),
                                   "bezeichnung": d.get("label") or "",
                                   "eingaben": eingaben, "resultate": resultate,
                                   "rechenweg": rechenweg, "hinweise": hinweise})
                continue
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
            er = ergebnisse_erzeuger.get(n["id"], {})
            generator_type = d.get("generator_type")
            typ_text = str(d.get("typ") or "").lower()
            ist_waermepumpe = (
                generator_type in HEAT_PUMP_TYPES
                or er.get("ist_waermepumpe") is True
                or "wärmepumpe" in typ_text
                or "waermepumpe" in typ_text
                or not generator_type
            )
            hat_quellenkreis = (
                generator_type in SOURCE_CIRCUIT_TYPES
                or er.get("source_flow_m3h") is not None
                or (not generator_type and (d.get("sole_vl") or d.get("sole_rl")))
            )
            eingaben = [("Erzeugerart", generator_type_label(d.get("generator_type")) or "—", ""),
                        ("Fabrikat / Typ", d.get("typ") or "—", ""),
                        ("Nennleistung", d.get("leistung_kw"), "kW"),
                        ("VL / RL Heizung", f"{d.get('vl_temp', '—')} / {d.get('rl_temp', '—')}", "°C")]
            if ist_waermepumpe:
                eingaben.extend([
                    ("COP", d.get("cop"), ""),
                    ("Elektrische Leistung", d.get("p_el_kw"), "kW"),
                ])
            if hat_quellenkreis:
                quelle = "Quelle" if generator_type == "wasser_wp" else "Sole"
                eingaben.extend([
                    (f"VL / RL {quelle}",
                     f"{d.get('sole_vl', '—')} / {d.get('sole_rl', '—')}", "°C"),
                    (f"Stoffwert {quelle} cρ",
                     er.get("source_ce"), "kWh/(m³·K)"),
                ])
            if generator_type == "lwwp":
                bauart = {
                    "aussenaufstellung": "Monoblock – Aussenaufstellung",
                    "innenaufstellung": "Monoblock – Innenaufstellung",
                    "split": "Splitgerät",
                }.get(d.get("lwwp_bauart"), d.get("lwwp_bauart") or "Aussenaufstellung")
                eingaben.extend([
                    ("Bauart", bauart, ""),
                    ("Aussenluft / Fortluft",
                    f"{d.get('aussenluft_temp', '—')} / {d.get('fortluft_temp', '—')}", "°C"),
                ])
            resultate = [
                ("ΔT Heizung", _fmt(er.get("heating_dt"), 2), "K"),
                ("V' Erzeugerkreis", _fmt(er.get("heating_flow_m3h")), "m³/h"),
            ]
            if ist_waermepumpe:
                resultate.extend([
                    ("Elektrische Leistung", _fmt(er.get("p_el_kw"), 2), "kW"),
                    ("Quellenleistung", _fmt(er.get("q_source_kw"), 2), "kW"),
                ])
            if hat_quellenkreis:
                quelle = "Quellenkreis" if generator_type == "wasser_wp" else "Solekreis"
                resultate.extend([
                    (f"ΔT {quelle}", _fmt(er.get("source_dt"), 2), "K"),
                    (f"V' {quelle}", _fmt(er.get("source_flow_m3h")), "m³/h"),
                ])
            bf = er.get("betriebsfaelle")
            if bf:
                # Umschaltventil: die Fälle stehen nebeneinander, nie addiert.
                resultate.append(("— Betriebsfälle (Umschaltventil) —", "", ""))
                for fall in bf.get("faelle") or []:
                    marke = " ◄ massgebend" if fall["key"] == bf.get("massgebend") else ""
                    resultate.extend([
                        (f"{fall['titel']}{marke}: Heizleistung", fall.get("q_heiz_kw"), "kW"),
                        (f"{fall['titel']}: VL/RL",
                         f"{fall.get('vl_c')}/{fall.get('rl_c')}" if fall.get("vl_c") is not None else None, "°C"),
                        (f"{fall['titel']}: COP", fall.get("cop"), ""),
                        (f"{fall['titel']}: Quellenleistung", fall.get("q_source_kw"), "kW"),
                        (f"{fall['titel']}: V' Sole", _fmt(fall.get("solevolumenstrom_m3h")), "m³/h"),
                    ])
                hinweise = bf.get("warnungen") or []
        elif t == "speicher":
            c = speicher_results.get(n["id"], {})
            eingaben = [
                ("Gewählter Speicherinhalt", d.get("speicher_liter"), "l"),
                ("Auslegungsleistung", c.get("leistung_kw"), "kW"),
                ("Leistungsquelle", c.get("leistungsquelle"), ""),
                ("Maximale Verbraucher-VL", c.get("vorlauf_max_c"), "°C"),
                ("Überdeckung", c.get("ueberdeckung_k"), "K"),
                ("Speicher-Rücklauf", c.get("speicher_unten_c"), "°C"),
                ("Überbrückungszeit", c.get("ueberbrueckung_min"), "min"),
            ]
            resultate = [
                ("Speichertemperatur oben", _fmt(c.get("speicher_oben_c"), 1), "°C"),
                ("Speichertemperatur unten", _fmt(c.get("speicher_unten_c"), 1), "°C"),
                ("Auslegungsvorschlag", c.get("speichervolumen_l"), "l"),
                ("Formel", "V = Q · t · 60 / (c · ΔT · ρ) · 1000", ""),
            ]
        elif t == "erdsonden":
            c = erdsonden_results.get(n["id"], {})
            # Anzahl aus dem Rechenkern, damit PDF und Berechnung nicht
            # auseinanderlaufen (die Auswahl im Editor ist auf 24 begrenzt).
            anzahl = c.get("sonden_anzahl") or max(1, min(24, int(_f(d.get("sonden_anzahl")) or 5)))
            laenge = _f(d.get("sonden_laenge_m"))
            eingaben = [("Ausführung", "Duplex (2 U-Rohre)", ""),
                        ("Anzahl Erdsonden", anzahl, ""),
                        ("Sondenlänge", laenge, "m"),
                        ("Quellenleistung", c.get("quellenleistung_kw"), "kW"),
                        ("Leistungsquelle", c.get("leistungsquelle"), ""),
                        ("Spezifische Entzugsleistung", d.get("entzugsleistung_w_m"), "W/m"),
                        ("Sicherheitsfaktor", c.get("sicherheitsfaktor"), ""),
                        ("Sondenrohr", c.get("sonden_aussendurchmesser_mm"), "mm"),
                        ("Glykolkonzentration", c.get("glykol_konzentration_pct"), "%")]
            resultate = [("Gewählte Gesamtbohrmeter", c.get("ist_gesamt_m"), "m"),
                          ("Erforderliche Gesamtbohrmeter", c.get("erforderlich_gesamt_m"), "m"),
                          ("Erforderliche Länge je Sonde", c.get("erforderlich_pro_sonde_m"), "m"),
                          ("Sondeninhalt", c.get("sondeninhalt_l"), "l"),
                          ("Soleinhalt gesamt", c.get("gesamtinhalt_l"), "l"),
                          ("Glykolbedarf", c.get("glykolbedarf_kg"), "kg"),
                          ("Bohrmeter-Formel", "Lerf = Q0 · 1000 / qE · SF", "")]
            dv = c.get("druckverlust") or {}
            if dv:
                rohre = dv.get("rohre") or {}
                traeger = dv.get("waermetraeger") or {}
                stufe = dv.get("druckstufe") or {}
                def _rohr(schluessel):
                    r = rohre.get(schluessel) or {}
                    return (f"{r.get('bezeichnung')} (innen {r.get('innen_mm')} mm, {r.get('pn')})"
                            if r else None)
                eingaben += [
                    ("— Solekreis —", "", ""),
                    ("Rohr Erdwärmesonde", _rohr("sonde"), ""),
                    ("Rohr Zuleitung Sonde–Verteiler", _rohr("zuleitung_verteiler"), ""),
                    ("Kritischer Weg Sonde–Verteiler (einfach)", d.get("sole_zuleitung_verteiler_m"), "m"),
                    ("Alle Anschlussrohre Sonde–Verteiler (VL+RL)",
                     dv.get("zuleitung_verteiler_gesamt_vl_rl_m"), "m"),
                    ("Rohr Zuleitung Verteiler–WP", _rohr("zuleitung_wp"), ""),
                    ("Länge Zuleitung Verteiler–WP", d.get("sole_zuleitung_wp_m"), "m"),
                    ("Inhalt WP und Expansion", dv.get("zusatzinhalt_l"), "l"),
                    ("Solevolumenstrom", dv.get("volumenstrom_m3_h"), "m³/h"),
                    ("Herkunft Volumenstrom", dv.get("volumenstrom_quelle"), ""),
                    ("Wärmeträger", (f"{traeger.get('produkt')} {traeger.get('konzentration_pct')} %"
                                     if traeger else None), ""),
                    ("Frostschutz bis", traeger.get("frostschutz_c"), "°C"),
                    ("Dichte Wärmeträger", dv.get("dichte_kg_m3"), "kg/m³"),
                    ("Spez. Wärmekapazität", dv.get("cp_kj_kgk"), "kJ/kgK"),
                    ("Kinematische Zähigkeit", dv.get("viskositaet_mm2_s"), "mm²/s"),
                    ("Rohrrauheit", dv.get("rauheit_mm"), "mm"),
                    ("Druckverlust Wärmepumpe", dv.get("druckverlust_wp_mws"), "mWs"),
                    ("Zeta-Wert Verteiler", dv.get("zeta_verteiler"), ""),
                ]
                if stufe:
                    eingaben += [
                        ("Nenndruckstufe gewählt", stufe.get("gewaehlt_pn"), ""),
                        ("Nenndruckstufe erforderlich",
                         f"{stufe.get('pn')} ({stufe.get('bereich')})" if stufe.get("pn") else None,
                         "SIA 384/6:2021"),
                    ]
                resultate += [("— Solekreis —", "", "")]
                for ts in dv.get("teilstuecke") or []:
                    resultate += [
                        (f"{ts['name']}: w", _fmt(ts.get("geschwindigkeit_m_s"), 3), "m/s"),
                        (f"{ts['name']}: Re", ts.get("reynolds"), f"— {ts.get('stroemungsart')}"),
                        (f"{ts['name']}: Δp", _fmt(ts.get("druckverlust_mws"), 2), "mWs"),
                    ]
                resultate += [
                    ("Füllinhalt total", dv.get("inhalt_total_l"), "l"),
                    ("Wärmeträger (Vorlagenformel)", dv.get("waermetraeger_l"), "l"),
                    ("Konzentrat volumetrisch", dv.get("konzentrat_volumetrisch_l"), "l"),
                    ("Druckverlust Leitungen", dv.get("druckverlust_leitungen_mws"), "mWs"),
                    ("Druckverlust Verteiler", dv.get("druckverlust_verteiler_mws"), "mWs"),
                    ("Förderhöhe Solepumpe", dv.get("foerderhoehe_mws"), "mWs"),
                    ("Fördervolumen Solepumpe", dv.get("foerdervolumen_m3_h"), "m³/h"),
                ]
                rechenweg = dv.get("rechenweg") or []
                hinweise = dv.get("warnungen") or []
        else:
            continue
        abschnitte.append({"nr": d.get("nr"), "titel": TITEL.get(t, t), "bezeichnung": d.get("label") or "",
                           "eingaben": eingaben, "resultate": resultate,
                           "rechenweg": rechenweg, "hinweise": hinweise})
    return abschnitte


# ── PDF zusammenbauen ───────────────────────────────────────────────────────
def _deckblatt(c, projekt_name, schema_name, inhalt, plankopf=None):
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
    plankopf = plankopf or {}
    for label, wert in [("Projektnummer", plankopf.get("projektnummer") or "—"),
                        ("Bauherr", plankopf.get("bauherr") or "—"),
                        ("Standort", plankopf.get("standort") or "—"),
                        ("Datum", date.today().strftime("%d.%m.%Y")),
                        ("Planer", plankopf.get("planer") or PLANER),
                        ("Revision", plankopf.get("revision") or "0"),
                        ("Status", plankopf.get("status") or "Entwurf"),
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


def _logo(c, data_url, x, y, breite, hoehe):
    if not data_url or "," not in data_url:
        return
    try:
        header, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded, validate=True)
        if "image/svg+xml" in header:
            drawing = svg2rlg(io.BytesIO(raw))
            if not drawing or not drawing.width or not drawing.height:
                return
            scale = min(breite / drawing.width, hoehe / drawing.height)
            drawing.scale(scale, scale)
            renderPDF.draw(drawing, c, x, y)
            return
        image = ImageReader(io.BytesIO(raw))
        c.drawImage(image, x, y, width=breite, height=hoehe,
                    preserveAspectRatio=True, anchor="c", mask="auto")
    except Exception:
        return


def _plankopf(c, seite, projekt_name, schema_name, plankopf=None):
    daten = plankopf or {}
    x, y, breite, hoehe = seite[0] - 600, 18, 570, 104
    spalte_projekt, spalte_detail = 250, 405
    c.setStrokeColorRGB(0.2, 0.24, 0.3)
    c.setLineWidth(0.7)
    c.rect(x, y, breite, hoehe, stroke=1, fill=0)
    c.line(x + spalte_projekt, y, x + spalte_projekt, y + hoehe)
    c.line(x + spalte_detail, y, x + spalte_detail, y + hoehe)
    c.line(x, y + 28, x + spalte_detail, y + 28)
    c.line(x, y + 54, x + spalte_projekt, y + 54)
    c.setFillColorRGB(0.1, 0.12, 0.2)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 8, y + 86, projekt_name or "Projekt")
    c.setFont("Helvetica", 7)
    c.drawString(x + 8, y + 69, f"Projekt-Nr.: {daten.get('projektnummer') or '—'}")
    c.drawString(x + 8, y + 57, f"Bauherr: {daten.get('bauherr') or '—'}")
    c.drawString(x + 8, y + 40, f"Adresse: {daten.get('standort') or '—'}")
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 8, y + 12, daten.get("planbezeichnung") or schema_name or "Anlagenschema")
    c.setFont("Helvetica", 7)
    _logo(c, daten.get("logo_data_url"), x + 258, y + 59, 139, 38)
    c.drawString(x + 258, y + 48, f"Plan-Nr. {daten.get('dokumentnummer') or '—'}")
    c.drawString(x + 258, y + 37, f"Revision {daten.get('revision') or '0'} · {daten.get('status') or 'Entwurf'}")
    c.drawString(x + 258, y + 12, f"{daten.get('planformat') or 'A3 quer'} · Schema ohne Massstab · {date.today().strftime('%d.%m.%Y')}")

    # Systemlegende direkt im Plankopf: gleiche Farben und Stricharten wie
    # Editor und SVG-Plot.
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 413, y + 91, "SYSTEMLEGENDE")
    legend = [
        ("Heizung VL", (0.94, 0.27, 0.27), None),
        ("Heizung RL", (0.23, 0.51, 0.96), [5, 3]),
        ("Sole VL", (0.92, 0.70, 0.03), None),
        ("Sole RL", (0.09, 0.64, 0.29), [5, 3]),
        ("Kälte VL/RL", (0.02, 0.71, 0.83), None),
        ("Trinkwarmwasser", (0.94, 0.27, 0.27), None),
        ("Trinkkaltwasser", (0.09, 0.64, 0.29), [5, 3]),
    ]
    c.setFont("Helvetica", 6.5)
    for index, (label, color, dash) in enumerate(legend):
        ly = y + 75 - index * 11
        c.setStrokeColorRGB(*color)
        c.setLineWidth(2)
        c.setDash(dash or [])
        c.line(x + 413, ly, x + 448, ly)
        c.setDash([])
        c.setFillColorRGB(0.18, 0.23, 0.31)
        c.drawString(x + 454, ly - 2.5, label)


def _schema_seite(c, svg_string, projekt_name, schema_name, plankopf=None):
    seite = landscape(A3)
    c.setPageSize(seite)
    rand = 30
    plankopf_hoehe = 122
    nutz_b, nutz_h = seite[0] - 2 * rand, seite[1] - 2 * rand - plankopf_hoehe
    # Ausschliesslich serverseitiger Vektorpfad: unabhängig von Browserzoom,
    # Auswahlzustand, Raster und sichtbarem Canvas-Ausschnitt.
    zeichnung = svg2rlg(io.StringIO(svg_string))
    skala = min(nutz_b / zeichnung.width, nutz_h / zeichnung.height, 1.5)
    zeichnung.scale(skala, skala)
    zeichnung.width *= skala
    zeichnung.height *= skala
    renderPDF.draw(zeichnung, c, rand + (nutz_b - zeichnung.width) / 2,
                   rand + plankopf_hoehe + (nutz_h - zeichnung.height) / 2)
    _plankopf(c, seite, projekt_name, schema_name, plankopf)
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
            c.drawString(40, y, f"! {w}")
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
                if y < 60:
                    c.showPage()
                    y = kopf()
                    c.setFont("Helvetica", 9)
                    c.setFillColorRGB(0.1, 0.12, 0.2)
                c.drawString(70, y, str(name))
                c.drawRightString(430, y, "—" if wert in (None, "") else str(wert))
                c.drawString(440, y, einheit)
                y -= 13
            y -= 4

        # Rechenweg: Formel, eingesetzte Werte und Ergebnis je Schritt. Ohne ihn
        # ist die Zahl im Export nur eine Behauptung.
        schritte = a.get("rechenweg") or []
        if schritte:
            c.setFont("Helvetica-Bold", 9)
            c.setFillColorRGB(0.45, 0.5, 0.55)
            c.drawString(60, y, "Rechenweg")
            y -= 13
            gruppe_aktiv = None
            for s in schritte:
                if y < 70:
                    c.showPage()
                    y = kopf()
                    gruppe_aktiv = None
                if s.get("gruppe") and s["gruppe"] != gruppe_aktiv:
                    gruppe_aktiv = s["gruppe"]
                    c.setFont("Helvetica-Bold", 8.5)
                    c.setFillColorRGB(0.86, 0.15, 0.15)
                    c.drawString(64, y, gruppe_aktiv)
                    y -= 12
                c.setFont("Helvetica-Bold", 8)
                c.setFillColorRGB(0.1, 0.12, 0.2)
                c.drawString(70, y, f"{s.get('groesse')}: {s.get('formel')}")
                y -= 10
                c.setFont("Helvetica", 8)
                c.setFillColorRGB(0.35, 0.4, 0.45)
                c.drawString(78, y, f"= {s.get('eingesetzt')}  →  {s.get('ergebnis')}")
                y -= 12
            y -= 4

        for hinweis in a.get("hinweise") or []:
            if y < 60:
                c.showPage()
                y = kopf()
            c.setFont("Helvetica-Oblique", 8)
            c.setFillColorRGB(0.57, 0.25, 0.05)
            for zeile in _umbruch(hinweis, 105):
                c.drawString(70, y, zeile)
                y -= 11
            y -= 2
        c.setFillColorRGB(0.1, 0.12, 0.2)
        y -= 10
    c.showPage()


def _umbruch(text: str, breite: int) -> list:
    """Text auf feste Zeichenbreite umbrechen (Helvetica 8 pt, ~105 Zeichen)."""
    zeilen, aktuell = [], ""
    for wort in str(text).split():
        kandidat = f"{aktuell} {wort}".strip()
        if len(kandidat) > breite and aktuell:
            zeilen.append(aktuell)
            aktuell = wort
        else:
            aktuell = kandidat
    if aktuell:
        zeilen.append(aktuell)
    return zeilen


def erzeuge_pdf(projekt_name: str, schema_name: str, inhalt: str,
                nodes: list, edges: list, results: dict,
                plankopf: dict | None = None) -> bytes:
    """Komplettes PDF gemäss gewähltem Inhalt (Deckblatt immer dabei)."""
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{projekt_name} — {schema_name}")
    _deckblatt(c, projekt_name, schema_name, inhalt, plankopf)
    if inhalt in ("schema", "beides"):
        svg = erzeuge_svg(nodes, edges, results)
        _schema_seite(c, svg, projekt_name, schema_name, plankopf)
        _legende_seiten(c, legende_zeilen(nodes, results), projekt_name, results.get("warnungen"))
    if inhalt in ("berechnungen", "beides"):
        _berechnungs_seiten(c, berechnungs_abschnitte(nodes, results), projekt_name)
    c.save()
    return buf.getvalue()
