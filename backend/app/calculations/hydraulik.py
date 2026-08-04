"""Hydraulik-Kern — Topologie-Berechnung des Anlagenschemas.

Der React-Flow-Graph (nodes + edges) wird HIER gerechnet, nicht im Frontend
(Goldene Regel: Berechnungslogik nur im Backend). Regeln: PHYSIK.md §1–§4.

Konventionen aus dem Editor:
- Leitungsfarbe: '#ef4444' = Vorlauf (VL), '#3b82f6' = Rücklauf (RL), sonst neutral.
- Verteiler-Handles: 'vl-main' / 'rl-main' links (zum Erzeuger, dort summiert),
  'vl-1'…'vl-N' und 'rl-1'…'rl-N' je Abgang.
- Verbraucher: node.type 'gruppe' (Verbrauchergruppe — Einspritz im Block)
  oder 'heizkreis' (einfacher Kreis), mit data: q_kw, vl_temp, rl_temp, dp_kpa.
"""
import re
from typing import List, Optional

from app.calculations.expansion import berechne_expansion
from app.calculations.leitungsdimension import automatische_dimension
from app.calculations.schema_sizing import erdsondenfeld, technischer_speicher
from app.calculations.ventil import berechne_kvs
from app.calculations.waermepumpe import berechne_waermepumpe
from app.data.generator_types import SOURCE_CIRCUIT_TYPES

VL_FARBE = "#ef4444"
RL_FARBE = "#3b82f6"
VERBRAUCHER_TYPEN = ("gruppe", "heizkreis")
BLOCK_TYPEN = ("verteiler", "erzeuger")  # Ast-Suche stoppt hier (PHYSIK §2)
# Hydraulische Trennstellen: ein Speicher entkoppelt Erzeuger- und
# Verbraucherkreis (PHYSIK §4/§6 — beide Seiten dürfen unterschiedliche
# Volumenströme führen). Deshalb endet jede Kreis-Traversierung hier.
SPEICHER_TYPEN = ("speicher", "bww")
# Kreisgrenzen der Wärmepumpen-Traversierung: die Leitung BIS zur Grenze gehört
# noch zum Kreis, alles dahinter ist ein anderer Kreis.
WP_KREIS_GRENZEN = (BLOCK_TYPEN + SPEICHER_TYPEN + VERBRAUCHER_TYPEN
                    + ("valve3",)
                    + ("erdsonden", "pwt", "verbraucher"))


def _zahl(x) -> Optional[float]:
    """Robust zu float parsen — Editor-Daten sind oft Strings."""
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _bauteil_auslegungen(nodes, verteiler_results, heatpump_results):
    """Automatische Eingaben aus dem Schema in Speicher/Erdsonden überführen."""
    speicher_results, erdsonden_results = {}, {}
    verbraucher = [n for n in nodes if n.get("type") in VERBRAUCHER_TYPEN]
    erzeuger_werte = [
        _zahl((n.get("data") or {}).get("leistung_kw"))
        for n in nodes if n.get("type") == "erzeuger"
        and _zahl((n.get("data") or {}).get("leistung_kw")) is not None
    ]
    # Bivalente/mehrere Erzeuger brauchen Betriebszustände. Bis diese explizit
    # modelliert sind, werden Leistungen nicht still addiert.
    erzeuger_leistung = erzeuger_werte[0] if len(erzeuger_werte) == 1 else None
    verbraucher_leistung = sum(
        _zahl((n.get("data") or {}).get("q_kw")) or 0 for n in verbraucher
    )
    gruppen_vl = [
        _zahl((n.get("data") or {}).get("vl_temp")) for n in verbraucher
        if _zahl((n.get("data") or {}).get("vl_temp")) is not None
    ]
    gruppen_rl = [
        _zahl((n.get("data") or {}).get("rl_temp")) for n in verbraucher
        if _zahl((n.get("data") or {}).get("rl_temp")) is not None
    ]
    verteiler_mit_rl = [v for v in verteiler_results.values() if v.get("rl_misch") is not None]
    auto_rl = (
        max(verteiler_mit_rl, key=lambda v: v.get("q_total") or 0).get("rl_misch")
        if verteiler_mit_rl else (min(gruppen_rl) if gruppen_rl else None)
    )

    for n in nodes:
        typ = n.get("type")
        d = n.get("data") or {}
        if typ == "speicher":
            leistung = _zahl(d.get("auslegung_leistung_kw"))
            leistungsquelle = "manuell"
            if leistung is None:
                leistung = erzeuger_leistung or verbraucher_leistung or None
                leistungsquelle = "Erzeuger" if erzeuger_leistung else "Verbrauchergruppen"
            vl = _zahl(d.get("auslegung_vorlauf_c"))
            if vl is None and gruppen_vl:
                vl = max(gruppen_vl)
            rl = _zahl(d.get("auslegung_ruecklauf_c"))
            if rl is None:
                rl = auto_rl
            if leistung is None or vl is None or rl is None:
                speicher_results[n["id"]] = {
                    "warnings": ["Für die automatische Auslegung fehlen Leistung oder Gruppen-Temperaturen."],
                }
                continue
            try:
                r = technischer_speicher(
                    leistung, vl, rl,
                    ueberbrueckung_min=_zahl(d.get("ueberbrueckung_min")) or 15,
                    ueberdeckung_k=(
                        _zahl(d.get("speicher_ueberdeckung_k"))
                        if _zahl(d.get("speicher_ueberdeckung_k")) is not None else 2
                    ),
                )
                r["leistungsquelle"] = leistungsquelle
                r["gewaehlt_l"] = _zahl(d.get("speicher_liter"))
                r["warnings"] = []
                if len(erzeuger_werte) > 1 and _zahl(d.get("auslegung_leistung_kw")) is None:
                    r["warnings"].append(
                        "Mehrere Erzeuger erkannt; Auslegung nutzt bis zur Betriebszustandslogik die Verbraucherleistung."
                    )
                speicher_results[n["id"]] = r
            except ValueError as exc:
                speicher_results[n["id"]] = {"warnings": [str(exc)]}

        elif typ == "erdsonden":
            q0 = _zahl(d.get("quellenleistung_kw"))
            leistungsquelle = "manuell"
            mehrere_wp = False
            if q0 is None:
                wp_quellen = [
                    _zahl(r.get("q_source_kw")) for r in heatpump_results.values()
                    if _zahl(r.get("q_source_kw")) is not None
                ]
                q0 = wp_quellen[0] if len(wp_quellen) == 1 else None
                mehrere_wp = len(wp_quellen) > 1
                leistungsquelle = "Wärmepumpe"
            sole_flow = _zahl(d.get("sole_volumenstrom_m3h"))
            volumenstromquelle = "manuell"
            mehrere_wp_flow = False
            if sole_flow is None:
                wp_flows = [
                    _zahl(r.get("source_flow_m3h")) for r in heatpump_results.values()
                    if _zahl(r.get("source_flow_m3h")) is not None
                ]
                sole_flow = wp_flows[0] if len(wp_flows) == 1 else None
                mehrere_wp_flow = len(wp_flows) > 1
                volumenstromquelle = "Wärmepumpe"
            try:
                r = erdsondenfeld(
                    quellenleistung_kw=q0,
                    sonden_anzahl=int(_zahl(d.get("sonden_anzahl")) or 5),
                    sonden_laenge_m=_zahl(d.get("sonden_laenge_m")),
                    spezifische_entzugsleistung_w_m=_zahl(d.get("entzugsleistung_w_m")),
                    sicherheitsfaktor=_zahl(d.get("sonden_sicherheitsfaktor")) or 1.10,
                    sonden_aussendurchmesser_mm=int(_zahl(d.get("sonden_rohr_mm")) or 32),
                    glykol_konzentration_pct=(
                        _zahl(d.get("glykol_pct"))
                        if _zahl(d.get("glykol_pct")) is not None else 30
                    ),
                    zusaetzlicher_inhalt_l=_zahl(d.get("sole_zusatzinhalt_l")) or 0,
                    sole_volumenstrom_m3h=sole_flow,
                    sonden_innendurchmesser_mm=_zahl(d.get("sonden_innendurchmesser_mm")),
                    anschlussleitung_kritisch_m=_zahl(d.get("anschlussleitung_kritisch_m")) or 0,
                    anschlussleitung_gesamt_vl_rl_m=_zahl(d.get("anschlussleitung_gesamt_vl_rl_m")) or 0,
                    anschluss_innendurchmesser_mm=_zahl(d.get("anschluss_innendurchmesser_mm")) or 40.6,
                    hauptleitung_m=_zahl(d.get("hauptleitung_m")) or 0,
                    hauptleitung_innendurchmesser_mm=_zahl(d.get("hauptleitung_innendurchmesser_mm")) or 40.6,
                    sole_dichte_kg_m3=_zahl(d.get("sole_dichte_kg_m3")) or 1050,
                    sole_viskositaet_mm2_s=_zahl(d.get("sole_viskositaet_mm2_s")) or 4.15,
                    rohrrauheit_mm=_zahl(d.get("rohrrauheit_mm")) or 0.015,
                    wp_druckverlust_mws=_zahl(d.get("wp_druckverlust_mws")) or 0,
                    verteiler_zeta=_zahl(d.get("verteiler_zeta")) or 0,
                )
                r["leistungsquelle"] = leistungsquelle
                r["volumenstromquelle"] = volumenstromquelle
                r["warnings"] = []
                if r.get("ausreichend") is False:
                    r["warnings"].append(
                        f"Gewähltes Feld ist {abs(r['reserve_m']):.0f} m kürzer als der Rechenwert."
                    )
                if q0 is None:
                    r["warnings"].append("Quellenleistung fehlt; Wärmepumpe mit COP oder elektrische Leistung ergänzen.")
                if mehrere_wp:
                    r["warnings"].append("Mehrere Wärmepumpen erkannt; Quellenleistung am Erdsondenfeld manuell festlegen.")
                if sole_flow is None:
                    r["warnings"].append("Solevolumenstrom fehlt; keine Pumpenauslegung möglich.")
                if mehrere_wp_flow:
                    r["warnings"].append("Mehrere Wärmepumpen erkannt; Solevolumenstrom am Erdsondenfeld manuell festlegen.")
                if _zahl(d.get("entzugsleistung_w_m")) is None:
                    r["warnings"].append("Spezifische Entzugsleistung fehlt; keine Bohrmeterempfehlung möglich.")
                erdsonden_results[n["id"]] = r
            except ValueError as exc:
                erdsonden_results[n["id"]] = {"warnings": [str(exc)]}
    return speicher_results, erdsonden_results


# ── Druckverlust (Pflichtenheft §5 / PHYSIK §5) ─────────────────────────────
def dp_reihe(dps: List[float]) -> float:
    """In Reihe: Druckverluste addieren."""
    return round(sum(d for d in dps if d), 3)


def dp_parallel(dps: List[float]) -> float:
    """Parallel: NICHT summieren — ungünstigster Ast (höchstes Δp) ist massgebend."""
    werte = [d for d in dps if d]
    return round(max(werte), 3) if werte else 0.0


# ── Verteiler mit Einspritzgruppen (PHYSIK §4) ──────────────────────────────
def berechne_verteiler_gruppen(gruppen: List[dict]) -> dict:
    """Reine §4-Rechnung für n parallele Verbrauchergruppen an einem Verteiler.

    gruppen: [{"name"?, "q_kw", "vl", "rl", "dp_kpa"?}]
    - VL_Verteiler = max(VL aller Gruppen)
    - ṁ_prim,i = Q_i / (1.163 · (VL_Verteiler − RL_i))
    - RL_misch = Σ(ṁ_prim,i · RL_i) / Σ ṁ_prim,i   (mengengewichtet, primärseitig)
    - Δp massgebend = ungünstigster Ast (max)
    """
    g_ok = [
        g for g in gruppen
        if (_zahl(g.get("q_kw")) or 0) > 0
        and _zahl(g.get("vl")) is not None
        and _zahl(g.get("rl")) is not None
    ]
    if not g_ok:
        return {"vl_vt": None, "rl_misch": None, "q_total": 0.0,
                "m_prim_total": 0.0, "dp_max_ast": None, "gruppen": [], "warnings": []}

    vl_vt = max(float(g["vl"]) for g in g_ok)
    out, warnings = [], []
    m_total = rl_zaehler = q_total = 0.0

    for g in g_ok:
        q, vl, rl = float(g["q_kw"]), float(g["vl"]), float(g["rl"])
        dt_sek = vl - rl
        m_sek = q / (1.163 * dt_sek) if dt_sek > 0 else None
        nenner = 1.163 * (vl_vt - rl)
        if nenner <= 0:
            warnings.append(f"{g.get('name', 'Gruppe')}: RL {rl} °C ≥ Verteiler-VL {vl_vt} °C — physikalisch nicht möglich")
            continue
        m_prim = q / nenner
        m_total += m_prim
        rl_zaehler += m_prim * rl
        q_total += q
        out.append({
            "name": g.get("name"),
            "q_kw": q, "vl": vl, "rl": rl,
            "m_sek": round(m_sek, 4) if m_sek else None,
            "m_prim": round(m_prim, 4),
            "m_bypass": round(max(0.0, (m_sek or m_prim) - m_prim), 4),
            "einspritz": vl < vl_vt,
        })

    rl_misch = rl_zaehler / m_total if m_total > 0 else None
    dp_max = dp_parallel([_zahl(g.get("dp_kpa")) for g in g_ok])
    return {
        "vl_vt": vl_vt,
        "rl_misch": round(rl_misch, 2) if rl_misch is not None else None,
        "q_total": round(q_total, 2),
        "m_prim_total": round(m_total, 4),
        "dp_max_ast": dp_max or None,
        "gruppen": out,
        "warnings": warnings,
    }


# ── Schaltungsart der Verbrauchergruppe (PHYSIK §6) ─────────────────────────
def schaltungsart(d: dict) -> str:
    """einspritz (Standard) | beimisch | drossel."""
    s = str(d.get("schaltung") or "einspritz").lower()
    return s if s in ("einspritz", "beimisch", "drossel") else "einspritz"


# ── Pumpe + Ventil IM Strang (Auslegung wie Einzelbauteile) ─────────────────
def _strang_ausruestung(d: dict, res: dict) -> None:
    """Ergänzt gruppe_results um Pumpen- und Ventil-Auslegung im Strang.

    Die Pumpe läuft im Sekundärkreis (V' = m_sek), das Einspritz-/Regelventil
    sitzt primärseitig (V' = m_prim). Rechnet NUR zusätzlich — die bestehenden
    Flüsse/Temperaturen (PHYSIK §4) werden nicht verändert.
    Drosselschaltung: NIE eine Gruppenpumpe (PHYSIK §6).
    """
    schaltung = schaltungsart(d)
    res["schaltung"] = schaltung
    hat_pumpe = schaltung != "drossel" and d.get("hat_pumpe") is not False
    hat_ventil = d.get("hat_ventil") is not False
    res["hat_pumpe"] = hat_pumpe
    res["hat_ventil"] = hat_ventil
    res["pumpe"] = None
    res["ventil"] = None

    if hat_pumpe:
        rohr = _zahl(d.get("pumpe_rohr_m")) or 0
        pam = _zahl(d.get("pumpe_pam")) or 70
        app = _zahl(d.get("pumpe_apparate_kpa")) or 0
        dp = rohr * pam / 1000 + app  # approximativ, wie Einzel-Pumpe
        res["pumpe"] = {
            "v": res.get("m_sek"),
            "dp_kpa": round(dp, 2) if dp > 0 else None,
            "mws": round(dp / 10, 2) if dp > 0 else None,
        }

    if hat_ventil:
        dp_var = _zahl(d.get("ventil_dp_var"))
        v = res.get("m_prim")
        if dp_var and dp_var > 0 and v:
            kv = berechne_kvs(v, dp_var, _zahl(d.get("ventil_kvs_eff")))
            if "fehler" not in kv:
                res["ventil"] = {
                    "v": v,
                    "kvs_theor": kv["kvs_theor"],
                    "kvs_vorschlag": kv["kvs_vorschlag"],
                    "kvs_eff": kv["kvs_eff"],
                    "dp_v_eff_kpa": kv["dp_v_eff_kpa"],
                    "pv": kv["ventilautoritaet_pct"],
                    "warnings": kv["warnings"],
                }


# ── Schema-Graph komplett rechnen ───────────────────────────────────────────
def _stroke(e: dict) -> Optional[str]:
    layer_id = str((e.get("data") or {}).get("layer_id") or "")
    if layer_id.endswith("_vl"):
        return VL_FARBE
    if layer_id.endswith("_rl"):
        return RL_FARBE
    return e.get("stroke") or (e.get("style") or {}).get("stroke")


# ── Semantische Anschlüsse der Wärmepumpe ───────────────────────────────────
# Eine Wärmepumpe hat vier fachlich unterscheidbare Anschlüsse. Die Bedeutung
# hängt am ANSCHLUSS, nicht an der Strichfarbe. Die alten, generischen Handle-IDs
# bleiben gültig (kein Bestandsschema verliert seine Anschlüsse); sie werden auf
# dieselbe Semantik abgebildet.
WP_PORT_ROLLEN = {
    # neu, ausdrücklich semantisch
    "heating_flow": "heating_flow",
    "heating_return": "heating_return",
    "source_flow": "source_flow",
    "source_return": "source_return",
    # Bestand: 'vl' oben / 'rl' unten waren immer die Heizungsseite
    "vl": "heating_flow",
    "rl": "heating_return",
    # Bestand am Erdsondenfeld — dieselben IDs gelten auch an der WP
    "sole-vl": "source_flow",
    "sole-rl": "source_return",
}


def _system_von_edge(e) -> Optional[str]:
    """'source' (Sole) | 'heating' | None (neutral, gehört zu keinem System).

    Nur der Medien-Layer der Leitung (PHYSIK §13), NICHT die Strichfarbe: die
    Farbe unterscheidet VL/RL innerhalb eines Systems, nicht das System selbst.
    """
    layer_id = str((e.get("data") or {}).get("layer_id") or "")
    if layer_id.startswith("sole"):
        return "source"
    if layer_id == "bww" or layer_id.startswith("trink"):
        return None
    if layer_id:
        return "heating"
    return None


def _wp_port_system(e, wp_id) -> tuple:
    """('heating'|'source'|None, 'port'|'layer'|None) für eine Leitung an der WP.

    Zuerst der semantische Anschluss — er ist die Wahrheit. Nur wenn ein
    Bestandsschema an einem generischen Anschluss (Anschlusszone, left/right)
    hängt, entscheidet ersatzweise der Medien-Layer; das wird im Resultat als
    `*_port_quelle: 'layer'` sichtbar gemacht, damit es nicht wie eine gesicherte
    Zuordnung aussieht.
    """
    handle = e.get("sourceHandle") if e["source"] == wp_id else e.get("targetHandle")
    rolle = WP_PORT_ROLLEN.get(str(handle or ""))
    if rolle:
        return ("source" if rolle.startswith("source") else "heating"), "port"
    system = _system_von_edge(e)
    if system:
        return system, "layer"
    return None, None


def _wp_kreis(wp_id: str, system: str, edges: List[dict], node_by_id: dict) -> tuple:
    """Leitungen EINES Kreises ab der Wärmepumpe bis zur Kreisgrenze.

    Rückgabe: (edge_ids, quellen der Portzuordnung, erreichte Grenz-Typen).
    Die Grenzleitung selbst gehört noch zum Kreis — was hinter Speicher,
    Verteiler oder Erdsondenfeld liegt, gehört zu einem anderen Kreis (§6).
    """
    treffer, quellen, grenzen = set(), set(), set()
    besucht = {wp_id}
    queue = []
    for e in edges:
        if str(e.get("id", "")).startswith("virt_"):
            continue
        if e["source"] != wp_id and e["target"] != wp_id:
            continue
        sys_e, quelle = _wp_port_system(e, wp_id)
        if sys_e != system:
            continue
        treffer.add(e["id"])
        quellen.add(quelle)
        other = e["target"] if e["source"] == wp_id else e["source"]
        if other not in besucht:
            besucht.add(other)
            queue.append(other)

    while queue:
        cur = queue.pop(0)
        typ = node_by_id.get(cur, {}).get("type")
        if typ in WP_KREIS_GRENZEN:
            grenzen.add(typ)
            continue
        for e in edges:
            if str(e.get("id", "")).startswith("virt_"):
                continue
            if e["source"] != cur and e["target"] != cur:
                continue
            sys_e = _system_von_edge(e)
            if sys_e is not None and sys_e != system:
                continue
            treffer.add(e["id"])
            other = e["target"] if e["source"] == cur else e["source"]
            if other not in besucht:
                besucht.add(other)
                queue.append(other)
    return treffer, quellen, grenzen


def _waermepumpen_kreise(nodes, edges, edge_flows, node_flows, calc_edges) -> dict:
    """Erzeuger- und Quellenkreis jeder Wärmepumpe rechnen und propagieren.

    Läuft NACH den Verteiler-/Verbraucherkreisen und VOR der freien Topologie:
    so überschreibt kein Kreis die Leitungen eines anderen (§2 — jede Leitung
    genau einmal). Bereits belegte Leitungen bleiben unangetastet.
    """
    node_by_id = {n["id"]: n for n in nodes}
    results = {}
    for wp in [n for n in nodes if n.get("type") == "erzeuger"]:
        wid = wp["id"]
        d = wp.get("data") or {}
        heiz_edges, heiz_quellen, heiz_grenzen = _wp_kreis(wid, "heating", edges, node_by_id)
        sole_edges, sole_quellen, _ = _wp_kreis(wid, "source", edges, node_by_id)
        # Luft/Wasser-WP: Umweltleistung ja, aber kein hydraulischer
        # Quellenkreis. Eine Sole-/Wasser-Seite wird nur für die dafür
        # vorgesehenen Typen oder für eine tatsächlich gezeichnete
        # Quellenleitung erwartet.
        hat_hydraulischen_quellenkreis = (
            str(d.get("generator_type") or "") in SOURCE_CIRCUIT_TYPES
            or bool(sole_edges)
        )
        res = berechne_waermepumpe(
            d,
            hat_quellenseite=hat_hydraulischen_quellenkreis,
        )
        res["heating_port_quelle"] = "port" if "port" in heiz_quellen else ("layer" if heiz_quellen else None)
        res["source_port_quelle"] = "port" if "port" in sole_quellen else ("layer" if sole_quellen else None)

        def belegen(edge_ids, fluss):
            for eid in edge_ids:
                if eid in calc_edges:
                    continue  # gehört bereits einem anderen Kreis
                edge_flows[eid] = fluss
                calc_edges.add(eid)

        v_heiz = res.get("heating_flow_m3h")
        if v_heiz:
            if heiz_edges:
                belegen(heiz_edges, v_heiz)
                node_flows[wid] = v_heiz
                if not (set(heiz_grenzen) & set(SPEICHER_TYPEN + ("verteiler",))):
                    res["warnings"].append(
                        "Heizkreis der Wärmepumpe endet an keinem Speicher und keinem Verteiler — "
                        "die Zuordnung des Erzeugerkreises ist nicht eindeutig"
                    )
            else:
                res["warnings"].append(
                    "Heizkreis nicht zuordenbar: an der Wärmepumpe ist keine Heizleitung angeschlossen"
                )

        v_sole = res.get("source_flow_m3h")
        if v_sole:
            if sole_edges:
                belegen(sole_edges, v_sole)
            else:
                res["warnings"].append(
                    "Quellenkreis nicht zuordenbar: an der Wärmepumpe ist keine Soleleitung angeschlossen"
                )
        elif sole_edges and res.get("q_source_kw") is None and res.get("ist_waermepumpe"):
            res["warnings"].append(
                "Quellenkreis gezeichnet, aber ohne Volumenstrom — die Soleleitungen bleiben undimensioniert"
            )

        results[wid] = res
    return results


def _parse_handle(h):
    """'vl-1' → ('vl', '1'), 'rl-main' → ('rl', 'main')."""
    if not h:
        return None, None
    t = "vl" if h.startswith("vl") else "rl" if h.startswith("rl") else None
    if not t:
        return None, None
    if "main" in h:
        return t, "main"
    m = re.search(r"(\d+)", h)
    return t, (m.group(1) if m else None)


# ── Anschluss-Marker (PHYSIK §9) ─────────────────────────────────────────────
# Ersetzt eine lang quer durchs Schema gezeichnete Leitung: zwei Anschluss-
# Marker mit demselben Buchstaben werden virtuell verbunden — Fluss und
# Temperatur werden durchgereicht, als wäre eine echte Leitung gezeichnet.
def _anschluss_gruppen(nodes: List[dict]) -> dict:
    """Marker je Buchstabe — Anschluss-Bauteile UND Verbrauchergruppen, die
    «Anschluss für separate Gruppe» aktiviert haben (data.hat_anschluss)."""
    gruppen: dict = {}
    for n in nodes:
        d = n.get("data") or {}
        if n.get("type") == "anschluss":
            buchstabe = d.get("buchstabe")
        elif n.get("type") == "gruppe" and d.get("hat_anschluss"):
            buchstabe = d.get("anschluss_buchstabe") or "A"  # UI-Default 'A' auch ohne Tippen
        else:
            buchstabe = None
        if buchstabe:
            gruppen.setdefault(str(buchstabe).upper(), []).append(n["id"])
    return gruppen


def _mit_virtuellen_anschluss_kanten(nodes: List[dict], edges: List[dict]) -> List[dict]:
    """Fügt für je zwei Anschluss-Marker mit gleichem Buchstaben zwei virtuelle
    Kanten hinzu (eine VL-, eine RL-farbige) — alle bestehenden Traversierungen
    (Verteiler-Äste, Hauptstrang, freie Topologie) funktionieren dadurch
    unverändert weiter, ohne dass echte Leitungen gezeichnet werden müssen.

    Nur zwischen zwei echten Anschluss-Bauteilen. Ist ein Ende eine
    Verbrauchergruppe («Anschluss für separate Gruppe»), wird der Fluss separat
    und explizit übertragen (_uebertrage_gruppen_anschluss), damit die
    Verteiler-Traversierung nicht über den Marker hinaus in fremde Kreise läuft."""
    typ = {n["id"]: n.get("type") for n in nodes}
    ergaenzt = list(edges)
    for buchstabe, ids in _anschluss_gruppen(nodes).items():
        for a, b in zip(ids, ids[1:]):
            if typ.get(a) == "anschluss" and typ.get(b) == "anschluss":
                ergaenzt.append({"id": f"virt_vl_{a}_{b}", "source": a, "target": b, "stroke": VL_FARBE})
                ergaenzt.append({"id": f"virt_rl_{a}_{b}", "source": a, "target": b, "stroke": RL_FARBE})
    return ergaenzt


def _uebertrage_gruppen_anschluss(nodes, gruppe_results, edges, node_flows, edge_flows):
    """«Anschluss für separate Gruppe» (serielle Untergruppe): eine Verbraucher-
    gruppe reicht Fluss + Leistung + VL/RL an den gleichnamigen Anschluss-Marker
    weiter. Die Leitung, die von dort z.B. auf einen Lufterhitzer gezeichnet wird,
    bekommt so den richtigen Durchfluss (→ Dimensionierung) und die Kennwerte.
    Gibt anschluss_results {marker_id: {m, q_kw, vl, rl, quelle}} zurück."""
    quelle = {}  # Buchstabe → Kennwerte einer Gruppe mit aktiviertem Anschluss
    for n in nodes:
        d = n.get("data") or {}
        if n.get("type") == "gruppe" and d.get("hat_anschluss"):
            b = str(d.get("anschluss_buchstabe") or "A").upper()  # UI-Default 'A'
            m = (gruppe_results.get(n["id"]) or {}).get("m_sek")
            if b and m:
                quelle[b] = {"m": round(m, 4), "q_kw": _zahl(d.get("q_kw")),
                             "vl": _zahl(d.get("vl_temp")), "rl": _zahl(d.get("rl_temp")),
                             "quelle": d.get("label") or "Gruppe"}
    anschluss_results = {}
    if not quelle:
        return anschluss_results
    for n in nodes:
        if n.get("type") != "anschluss":
            continue
        b = str((n.get("data") or {}).get("buchstabe") or "").upper()
        q = quelle.get(b)
        if not q:
            continue
        node_flows[n["id"]] = q["m"]
        anschluss_results[n["id"]] = dict(q)
        for e in edges:
            if str(e.get("id", "")).startswith("virt_"):
                continue
            if (e["source"] == n["id"] or e["target"] == n["id"]) and not edge_flows.get(e["id"]):
                edge_flows[e["id"]] = q["m"]
    return anschluss_results


def _anschluss_warnungen(nodes: List[dict]) -> List[str]:
    warnungen = []
    for buchstabe, ids in _anschluss_gruppen(nodes).items():
        if len(ids) == 1:
            warnungen.append(f"Anschluss {buchstabe}: kein Gegenstück gefunden — Leitung bleibt offen")
        elif len(ids) > 2:
            warnungen.append(f"Anschluss {buchstabe}: {len(ids)} Marker gefunden — nur je 2 werden verbunden")
    return warnungen


# ── Warnungen-Report (Dominic-Feedback): alle Warnungen an einem Ort ────────
# Sammelt Verteiler-, Anschluss-, Ventil- und Expansionsgefäss-Warnungen zu
# einer flachen Liste, damit der Editor EIN Report-Fenster zeigen kann statt
# dass Warnungen nur verstreut in einzelnen Bauteil-Panels auftauchen.
def _sammle_warnungen(nodes, verteiler_results, anschluss_warnungen, ventil_results, expansion_results):
    node_by_id = {n["id"]: n for n in nodes}

    def label_von(nid, fallback):
        return (node_by_id.get(nid, {}).get("data") or {}).get("label") or fallback

    alle = list(anschluss_warnungen)
    for vr in verteiler_results.values():
        alle += vr.get("warnings", [])
    for nid, v in ventil_results.items():
        label = label_von(nid, "Ventil")
        for w in v.get("warnings", []):
            alle.append(f"{label}: {w}")
    for nid, ex in expansion_results.items():
        if ex.get("fehler"):
            alle.append(f"{label_von(nid, 'Expansionsgefäss')}: {ex['fehler']}")
    return alle


def _wp_warnungen(nodes, heatpump_results) -> List[str]:
    """WP-Warnungen mit dem Bauteilnamen davor — wie die übrigen Warnungen."""
    node_by_id = {n["id"]: n for n in nodes}
    alle = []
    for nid, res in heatpump_results.items():
        label = (node_by_id.get(nid, {}).get("data") or {}).get("label") or "Wärmepumpe"
        alle += [f"{label}: {w}" for w in res.get("warnings", [])]
    return alle


def _leitungsdimensionen(edges, edge_flows) -> dict:
    """Automatische Leitungsdimensionierung je Leitung (PHYSIK §10)."""
    leitung_results = {}
    for e in edges:
        if str(e.get("id", "")).startswith("virt_"):
            continue  # virtuelle Anschluss-Kanten sind keine echten Leitungen
        fluss = edge_flows.get(e["id"])
        dims = automatische_dimension(fluss) if fluss else None
        if dims:
            laenge = _zahl((e.get("data") or {}).get("laenge_m"))
            dp_kpa = round(dims["pam"] * laenge / 1000, 2) if laenge else None
            leitung_results[e["id"]] = {**dims, "v": fluss, "laenge_m": laenge, "dp_kpa": dp_kpa}
    return leitung_results


def _expansion_auto(nodes):
    """Automatik fürs Expansionsgefäss: höchste Verbraucher-VL (→ t_mittel) und
    die Leistung aus dem Schema (Erzeuger-Nennleistung, sonst Summe Verbraucher-Q)."""
    vls, q_sum, erz = [], 0.0, None
    for n in nodes:
        d = n.get("data") or {}
        t = n.get("type")
        if t in VERBRAUCHER_TYPEN:
            vl = _zahl(d.get("vl_temp"))
            if vl is not None:
                vls.append(vl)
            q = _zahl(d.get("q_kw"))
            if q:
                q_sum += q
        elif t == "erzeuger":
            le = _zahl(d.get("leistung_kw"))
            if le:
                erz = le
    auto_vl = max(vls) if vls else None
    auto_leistung = erz if erz else (round(q_sum, 2) if q_sum > 0 else None)
    return auto_vl, auto_leistung


def _pwt_primaer_gruppe(pid, edges, node_by_id, strict):
    """Speisende Verbrauchergruppe eines PWT über VL/neutrale Kanten suchen.
    strict=True: nur über die Primärseite (Anschlüsse left/bottom); sonst überall
    (Fallback, falls der Anwender die Gruppe an einen anderen Anschluss gehängt hat)."""
    besucht, queue = {pid}, [pid]
    while queue:
        cur = queue.pop(0)
        for e in edges:
            if _stroke(e) == RL_FARBE or str(e.get("id", "")).startswith("virt_"):
                continue
            if strict and cur == pid:
                h = e.get("sourceHandle") if e["source"] == pid else e.get("targetHandle") if e["target"] == pid else None
                if h not in ("left", "bottom"):
                    continue
            other = e["target"] if e["source"] == cur else e["source"] if e["target"] == cur else None
            if other and other not in besucht:
                besucht.add(other)
                if node_by_id.get(other, {}).get("type") in VERBRAUCHER_TYPEN:
                    return node_by_id[other]
                queue.append(other)
    return None


def _pwt_transfer(nodes, edges, gruppe_results, node_flows, edge_flows):
    """Plattentauscher (Systemtrennung, Gegenstrom): Primärseite (links) kommt von
    einer Verbrauchergruppe — Leistung + VL/RL werden übernommen. Sekundärseite
    (rechts) mit selbst gewählten Temperaturen; Q bleibt gleich →
    m_sek = Q / (1.163 · ΔT_sek). Warnung, wenn Sekundär-VL > Primär-VL.
    Gibt pwt_results {id: {q_kw, vl_prim, rl_prim, vl_sek, rl_sek, m_prim, m_sek, dt_sek, warnung}}."""
    results = {}
    node_by_id = {n["id"]: n for n in nodes}
    for pwt in [n for n in nodes if n.get("type") == "pwt"]:
        d = pwt.get("data") or {}
        pid = pwt["id"]
        # Primär-Gruppe: über VL/neutrale Kanten zur nächsten Verbrauchergruppe
        gruppe = (_pwt_primaer_gruppe(pid, edges, node_by_id, True)
                  or _pwt_primaer_gruppe(pid, edges, node_by_id, False))
        vl_sek, rl_sek = _zahl(d.get("vl_sek")), _zahl(d.get("rl_sek"))
        res = {"vl_sek": vl_sek, "rl_sek": rl_sek}
        if gruppe:
            gd = gruppe.get("data") or {}
            q = _zahl(gd.get("q_kw"))
            vl_prim, rl_prim = _zahl(gd.get("vl_temp")), _zahl(gd.get("rl_temp"))
            res.update({"quelle": gd.get("label") or "Gruppe", "q_kw": q, "vl_prim": vl_prim,
                        "rl_prim": rl_prim, "m_prim": (gruppe_results.get(gruppe["id"]) or {}).get("m_sek")})
            if vl_sek is not None and vl_prim is not None and vl_sek > vl_prim:
                res["warnung"] = (f"Sekundär-Vorlauf {vl_sek} °C höher als Primär-Vorlauf "
                                  f"{vl_prim} °C — über den Plattentauscher nicht möglich")
            if q and vl_sek is not None and rl_sek is not None and vl_sek - rl_sek > 0:
                m_sek = q / (1.163 * (vl_sek - rl_sek))
                res.update({"dt_sek": round(vl_sek - rl_sek, 1), "m_sek": round(m_sek, 4)})
                node_flows[pid] = round(m_sek, 4)
                for e in edges:  # Sekundär-Leitungen (rechte Anschlüsse) tragen m_sek
                    h = e.get("sourceHandle") if e["source"] == pid else e.get("targetHandle") if e["target"] == pid else None
                    if h in ("top", "right"):
                        edge_flows[e["id"]] = round(m_sek, 4)
        results[pid] = res
    return results


def berechne_schema(nodes: List[dict], edges: List[dict]) -> dict:
    """Kompletter Graph: Flüsse je Leitung/Knoten + Verteiler-/Gruppen-Resultate.

    1. Sekundär-Fluss je Verbraucher (§1).
    2. Verteiler-zentriert nach §4 (VL=max, ṁ_prim je Ast, RL mengengewichtet,
       Δp = ungünstigster Ast). Jede Ast-Leitung trägt den Fluss IHRES Kreises (§2).
    3. Freie Topologie (ohne Verteiler): Rückwärts-Propagierung, jede Kante
       nur einmal zählen (§2 — Doppelzählungs-Bug-Historie).
    """
    edges = _mit_virtuellen_anschluss_kanten(nodes, edges)
    anschluss_warnungen = _anschluss_warnungen(nodes)
    node_by_id = {n["id"]: n for n in nodes}

    def data(n):
        return n.get("data") or {}

    # ── 1. Sekundär-Fluss je Verbraucher ──
    sek = {}
    for n in nodes:
        if n.get("type") in VERBRAUCHER_TYPEN:
            d = data(n)
            q = _zahl(d.get("q_kw"))
            vl = _zahl(d.get("vl_temp"))
            rl = _zahl(d.get("rl_temp"))
            if q and q > 0 and vl is not None and rl is not None and vl - rl > 0:
                sek[n["id"]] = q / (1.163 * (vl - rl))

    leer = {"edge_flows": {}, "node_flows": {}, "verteiler_results": {}, "gruppe_results": {},
            "ventil_results": {}, "pumpen_results": {}, "expansion_results": {},
            "leitung_results": {}, "anschluss_results": {}, "pwt_results": {}, "heatpump_results": {},
            "speicher_results": {}, "erdsonden_results": {},
            "anschluss_warnings": anschluss_warnungen, "warnungen": []}
    if not sek:
        # Ohne Verbraucher gibt es keine Verbraucherkreise — Wärmepumpenkreise
        # und Expansionsgefässe rechnen trotzdem: ein Schema aus WP, Puffer und
        # Erdsonden ist hydraulisch vollständig bestimmt.
        leer["heatpump_results"] = _waermepumpen_kreise(
            nodes, edges, leer["edge_flows"], leer["node_flows"], set())
        leer["speicher_results"], leer["erdsonden_results"] = _bauteil_auslegungen(
            nodes, {}, leer["heatpump_results"])
        ews_inhalte = [
            r.get("gesamtinhalt_l") for r in leer["erdsonden_results"].values()
            if r.get("gesamtinhalt_l") is not None
        ]
        auto_ews_inhalt = ews_inhalte[0] if len(ews_inhalte) == 1 else None
        for n in nodes:
            if n.get("type") == "expansion":
                r = berechne_expansion(
                    n.get("data") or {}, *_expansion_auto(nodes), auto_ews_inhalt
                )
                if r is not None:
                    leer["expansion_results"][n["id"]] = r
        for n in nodes:  # Knoten ohne eigenen Wert: grösster Fluss ihrer Leitungen
            nid = n["id"]
            if nid in leer["node_flows"]:
                continue
            werte = [leer["edge_flows"].get(e["id"], 0.0) for e in edges
                     if e["source"] == nid or e["target"] == nid]
            leer["node_flows"][nid] = round(max(werte), 4) if werte else 0.0
        leer["leitung_results"] = _leitungsdimensionen(edges, leer["edge_flows"])
        leer["warnungen"] = (_sammle_warnungen(nodes, {}, anschluss_warnungen, {}, leer["expansion_results"])
                             + _wp_warnungen(nodes, leer["heatpump_results"])
                             + [w for r in leer["speicher_results"].values() for w in r.get("warnings", [])]
                             + [w for r in leer["erdsonden_results"].values() for w in r.get("warnings", [])])
        return leer

    edge_flows, node_flows = {}, {}
    verteiler_results, gruppe_results = {}, {}
    calc_edges = set()

    # Default: Kreis ohne Verteiler → primär = sekundär, keine Einspritzung
    for nid, m in sek.items():
        d = data(node_by_id[nid])
        vl, rl = _zahl(d.get("vl_temp")), _zahl(d.get("rl_temp"))
        gruppe_results[nid] = {
            "m_sek": round(m, 4), "m_prim": round(m, 4), "m_bypass": 0.0,
            "einspritz": False,
            "dt_sek": round(vl - rl, 2), "dt_prim": round(vl - rl, 2),
        }

    block_ids = {n["id"] for n in nodes if n.get("type") in BLOCK_TYPEN}

    def bfs_verbraucher(start_id: str, rl_only: bool) -> List[str]:
        """Verbraucher ab start_id suchen. VL-Suche läuft über VL/neutrale
        Kanten, RL-Suche nur über RL-Kanten. Stoppt an Verteiler/Erzeuger,
        damit sie nicht zu einer fremden Gruppe überläuft (§2)."""
        besucht = {start_id} | block_ids
        queue = [start_id]
        gefunden = []
        if node_by_id.get(start_id, {}).get("type") in VERBRAUCHER_TYPEN:
            gefunden.append(start_id)
        while queue:
            cur = queue.pop(0)
            for e in edges:
                if (_stroke(e) == RL_FARBE) != rl_only:
                    continue
                other = e["target"] if e["source"] == cur else e["source"] if e["target"] == cur else None
                if other and other not in besucht:
                    besucht.add(other)
                    if node_by_id.get(other, {}).get("type") in VERBRAUCHER_TYPEN:
                        gefunden.append(other)
                    queue.append(other)
        return gefunden

    # ── 2. Verteiler-zentriert (§4) ──
    for vn in [n for n in nodes if n.get("type") == "verteiler"]:
        vid = vn["id"]
        vn_edges = [e for e in edges if e["source"] == vid or e["target"] == vid]

        branches = {}
        for e in vn_edges:
            h = e.get("sourceHandle") if e["source"] == vid else e.get("targetHandle")
            typ, num = _parse_handle(h)
            if not typ or not num:
                continue
            branches.setdefault(num, {"vl": [], "rl": []})[typ].append(e)

        # Je Ast die Verbraucher finden (VL-Seite bevorzugt, RL als Fallback)
        ast_daten = []
        for num, br in branches.items():
            if num == "main":
                continue
            verbraucher = []
            if br["vl"]:
                e0 = br["vl"][0]
                ext = e0["target"] if e0["source"] == vid else e0["source"]
                verbraucher = bfs_verbraucher(ext, rl_only=False)
            elif br["rl"]:
                e0 = br["rl"][0]
                ext = e0["target"] if e0["source"] == vid else e0["source"]
                verbraucher = bfs_verbraucher(ext, rl_only=True)
            ast_daten.append({"num": num, "vl": br["vl"], "rl": br["rl"], "verbraucher": verbraucher})

        # §4 Schritt 1: VL_Verteiler = max(VL aller Gruppen)
        vl_vt = None
        for ast in ast_daten:
            for cid in ast["verbraucher"]:
                vl = _zahl(data(node_by_id[cid]).get("vl_temp"))
                if vl is not None:
                    vl_vt = vl if vl_vt is None else max(vl_vt, vl)

        # §4 Schritt 2: Primär-Fluss je Ast, RL_misch mengengewichtet, Δp max
        m_prim_total = rl_zaehler = q_total = 0.0
        warnungen = []
        dp_aeste = []
        schaltungen = set()  # PHYSIK §6: Mischregeln prüfen
        for ast in ast_daten:
            ast_m = ast_q = 0.0
            ast_dps = []
            for cid in ast["verbraucher"]:
                d = data(node_by_id[cid])
                q, vl, rl = _zahl(d.get("q_kw")), _zahl(d.get("vl_temp")), _zahl(d.get("rl_temp"))
                dp = _zahl(d.get("dp_kpa"))
                if dp:
                    ast_dps.append(dp)
                if node_by_id[cid].get("type") == "gruppe":
                    s = schaltungsart(d)
                    schaltungen.add(s)
                    # Drossel kann nicht mischen: Gruppen-VL muss = Verteiler-VL sein.
                    # Eine andere (heissere) Gruppe am selben Verteiler zwingt den
                    # Verteiler-VL nach oben — die Drossel bekommt dann zu heisses
                    # Wasser und kann es nicht selbst herunterregeln (Dominic-Feedback).
                    if s == "drossel" and vl is not None and vl_vt is not None and vl < vl_vt:
                        label = d.get("label") or "Verbrauchergruppe"
                        warnungen.append(
                            f"{label} (Drossel): kommt mit VL {vl_vt} °C an, braucht aber nur {vl} °C — "
                            f"Drossel kann nicht mischen. Einspritz- oder Beimischschaltung nötig, "
                            f"um die VL-Temperatur auf {vl} °C herunterzuregeln."
                        )
                if q is None or rl is None or vl_vt is None:
                    continue
                nenner = 1.163 * (vl_vt - rl)
                if nenner > 0:
                    m_prim = q / nenner
                    ast_m += m_prim
                    ast_q += q
                    rl_zaehler += m_prim * rl
                    m_sek = sek.get(cid, 0.0)
                    gruppe_results[cid] = {
                        "m_sek": round(m_sek, 4),
                        "m_prim": round(m_prim, 4),
                        "m_bypass": round(max(0.0, m_sek - m_prim), 4),
                        "einspritz": bool(vl is not None and vl < vl_vt and m_sek > m_prim + 1e-12),
                        "dt_sek": round(vl - rl, 2) if vl is not None else None,
                        "dt_prim": round(vl_vt - rl, 2),
                    }
                else:
                    label = data(node_by_id[cid]).get("label") or "Verbrauchergruppe"
                    warnungen.append(f"{label}: RL {rl} °C ≥ Verteiler-VL {vl_vt} °C — physikalisch nicht möglich")

            if ast_dps:
                dp_aeste.append({"num": ast["num"], "dp_kpa": dp_reihe(ast_dps)})

            # Ast-Leitungen (VL + RL) tragen den Primär-Fluss IHRES Kreises (§2)
            for e in ast["vl"] + ast["rl"]:
                edge_flows[e["id"]] = round(ast_m, 4)
                calc_edges.add(e["id"])
            m_prim_total += ast_m
            q_total += ast_q

        # PHYSIK §6: Beimischung (drucklos) NIE mit Einspritz/Drossel
        # (druckbehaftet, Hauptpumpe) am selben Verteiler kombinieren
        if "beimisch" in schaltungen and (schaltungen & {"einspritz", "drossel"}):
            warnungen.append("Beimischung (drucklos) darf nicht mit Einspritz-/Drosselschaltungen (druckbehaftet) am selben Verteiler kombiniert werden")

        rl_misch = rl_zaehler / m_prim_total if m_prim_total > 0 else None

        # Hauptanschlüsse links: Summe (§4)
        main = branches.get("main", {"vl": [], "rl": []})
        for e in main["vl"] + main["rl"]:
            edge_flows[e["id"]] = round(m_prim_total, 4)
            calc_edges.add(e["id"])

        # Haupt-Strang weiterreichen: Bauteile ZWISCHEN Verteiler und Erzeuger
        # (Hauptpumpe, Ventil, Wärmezähler …) tragen den Gesamt-Primärfluss.
        # Jede Leitung nur einmal (§2); stoppt an Erzeuger/Verteiler/Verbrauchern.
        def trunk_propagieren(start_id, rl_seite):
            besucht = {start_id, vid}
            queue = [start_id]
            while queue:
                cur = queue.pop(0)
                # Stopp an Erzeuger/Verteiler, Verbrauchern UND am Speicher: hinter
                # dem Speicher liegt der Erzeugerkreis mit eigenem Volumenstrom (§6).
                if (node_by_id.get(cur, {}).get("type") in BLOCK_TYPEN + SPEICHER_TYPEN
                        or cur in sek):
                    continue
                for e in edges:
                    if (_stroke(e) == RL_FARBE) != rl_seite:
                        continue
                    other = e["target"] if e["source"] == cur else e["source"] if e["target"] == cur else None
                    if other and other not in besucht:
                        if e["id"] not in calc_edges:
                            edge_flows[e["id"]] = round(m_prim_total, 4)
                            calc_edges.add(e["id"])
                        besucht.add(other)
                        queue.append(other)

        if m_prim_total > 0:
            for e in main["vl"]:
                trunk_propagieren(e["target"] if e["source"] == vid else e["source"], rl_seite=False)
            for e in main["rl"]:
                trunk_propagieren(e["target"] if e["source"] == vid else e["source"], rl_seite=True)

        dp_max = max(dp_aeste, key=lambda a: a["dp_kpa"]) if dp_aeste else None
        node_flows[vid] = round(m_prim_total, 4)
        verteiler_results[vid] = {
            "vl_vt": vl_vt,
            "rl_misch": round(rl_misch, 2) if rl_misch is not None else None,
            "q_total": round(q_total, 2),
            "m_prim_total": round(m_prim_total, 4),
            "dp_max_ast": dp_max["dp_kpa"] if dp_max else None,
            "dp_max_ast_nr": dp_max["num"] if dp_max else None,
            "warnings": warnungen,
        }

    # ── 2b. Wärmepumpen-Kreise (Erzeuger- und Quellenkreis) ──
    # Reihenfolge bewusst zwischen Verteiler und freier Topologie: die
    # Verbraucherkreise stehen bereits fest, die freie Rückwärts-Propagierung
    # darf die WP-Leitungen danach nicht mehr überschreiben (§2/§6).
    heatpump_results = _waermepumpen_kreise(nodes, edges, edge_flows, node_flows, calc_edges)
    speicher_results, erdsonden_results = _bauteil_auslegungen(
        nodes, verteiler_results, heatpump_results)
    ews_inhalte = [
        r.get("gesamtinhalt_l") for r in erdsonden_results.values()
        if r.get("gesamtinhalt_l") is not None
    ]
    auto_ews_inhalt = ews_inhalte[0] if len(ews_inhalte) == 1 else None

    # ── 3. Freie Topologie: Rückwärts-Propagierung VL/neutral ──
    rev_adj = {n["id"]: [] for n in nodes}
    for e in edges:
        if e["id"] in calc_edges:
            continue
        s = _stroke(e)
        if s == RL_FARBE:
            continue
        if s == VL_FARBE:
            rev_adj.setdefault(e["target"], []).append((e["source"], e["id"]))
        else:
            rev_adj.setdefault(e["source"], []).append((e["target"], e["id"]))
            rev_adj.setdefault(e["target"], []).append((e["source"], e["id"]))

    for cid, fluss in sek.items():
        besucht = {cid}
        queue = [cid]
        while queue:
            cur = queue.pop(0)
            for to, eid in rev_adj.get(cur, []):
                # Fluss nur beim Entdecken eines NEUEN Knotens gutschreiben —
                # sonst zählt dieselbe Kante doppelt (§2, Bug-Historie).
                if to not in besucht:
                    if eid not in calc_edges:
                        edge_flows[eid] = round(edge_flows.get(eid, 0.0) + fluss, 4)
                    besucht.add(to)
                    queue.append(to)

    # ── 4. RL-Kanten ohne Wert (gleiche Einmal-Zähl-Regel) ──
    rl_adj = {n["id"]: [] for n in nodes}
    for e in edges:
        if _stroke(e) != RL_FARBE or e["id"] in calc_edges:
            continue
        rl_adj.setdefault(e["source"], []).append((e["target"], e["id"]))
        rl_adj.setdefault(e["target"], []).append((e["source"], e["id"]))

    for cid, fluss in sek.items():
        besucht = {cid}
        queue = [cid]
        while queue:
            cur = queue.pop(0)
            for to, eid in rl_adj.get(cur, []):
                if to not in besucht:
                    if eid not in calc_edges:
                        edge_flows[eid] = round(edge_flows.get(eid, 0.0) + fluss, 4)
                    besucht.add(to)
                    queue.append(to)

    # Anschluss «für separate Gruppe»: Fluss der Gruppe an ihren Marker geben,
    # bevor die Knoten-Flüsse verdichtet werden.
    anschluss_results = _uebertrage_gruppen_anschluss(nodes, gruppe_results, edges, node_flows, edge_flows)
    pwt_results = _pwt_transfer(nodes, edges, gruppe_results, node_flows, edge_flows)

    # ── 5. Knoten-Flüsse ──
    for n in nodes:
        nid = n["id"]
        if nid in node_flows:
            continue
        if nid in sek:
            node_flows[nid] = round(sek[nid], 4)
        else:
            werte = [edge_flows.get(e["id"], 0.0) for e in edges if e["source"] == nid or e["target"] == nid]
            node_flows[nid] = round(max(werte), 4) if werte else 0.0

    # Pumpe/Ventil im Strang auslegen (nur zusätzlich, ändert keine Flüsse)
    for n in nodes:
        if n.get("type") == "gruppe" and n["id"] in gruppe_results:
            _strang_ausruestung(data(n), gruppe_results[n["id"]])

    # ── 6. Einzelbauteile auslegen (Loop C) ──
    ventil_results, pumpen_results, expansion_results = {}, {}, {}
    for n in nodes:
        t = n.get("type")
        d = data(n)
        if t in ("valve2", "valve3"):
            # Ventil: kvs + Ventilautorität aus dem Leitungs-Durchfluss (PHYSIK §3)
            v = node_flows.get(n["id"]) or 0
            dp_var = _zahl(d.get("dp_var"))
            if v > 0 and dp_var and dp_var > 0:
                kv = berechne_kvs(v, dp_var, _zahl(d.get("kvs_eff")))
                if "fehler" not in kv:
                    ventil_results[n["id"]] = {
                        "v": round(v, 4),
                        "kvs_theor": kv["kvs_theor"],
                        "kvs_vorschlag": kv["kvs_vorschlag"],
                        "kvs_eff": kv["kvs_eff"],
                        "dp_v_eff_kpa": kv["dp_v_eff_kpa"],
                        "pv": kv["ventilautoritaet_pct"],
                        "warnings": kv["warnings"],
                    }
        elif t == "pump":
            # Hauptpumpe: Förderhöhe = Δp gemeinsamer Teil + Δp ungünstigster Ast
            # des Verteilers, den sie speist (Pflichtenheft §5 / PHYSIK §5).
            rohr = _zahl(d.get("rohr_m")) or 0
            pam = _zahl(d.get("pam")) or 70
            app = _zahl(d.get("apparate_kpa")) or 0
            dp_gemeinsam = rohr * pam / 1000 + app
            # Verteiler über VL-/neutrale Leitungen suchen (nicht durch Gruppen)
            vt_id = None
            besucht = {n["id"]}
            queue = [n["id"]]
            while queue and vt_id is None:
                cur = queue.pop(0)
                for e in edges:
                    if _stroke(e) == RL_FARBE:
                        continue
                    other = e["target"] if e["source"] == cur else e["source"] if e["target"] == cur else None
                    if other and other not in besucht:
                        besucht.add(other)
                        typ_o = node_by_id.get(other, {}).get("type")
                        if typ_o == "verteiler":
                            vt_id = other
                            break
                        if typ_o not in VERBRAUCHER_TYPEN:
                            queue.append(other)
            dp_ast = (verteiler_results.get(vt_id, {}) or {}).get("dp_max_ast") or 0
            gesamt = dp_gemeinsam + dp_ast
            pumpen_results[n["id"]] = {
                "v": node_flows.get(n["id"]),
                "dp_gemeinsam_kpa": round(dp_gemeinsam, 2) if dp_gemeinsam > 0 else None,
                "dp_ast_kpa": round(dp_ast, 2) if dp_ast else None,
                "verteiler_id": vt_id,
                "foerderhoehe_kpa": round(gesamt, 2) if gesamt > 0 else None,
                "mws": round(gesamt / 10, 2) if gesamt > 0 else None,
            }
        elif t == "expansion":
            r = berechne_expansion(d, *_expansion_auto(nodes), auto_ews_inhalt)
            if r is not None:
                expansion_results[n["id"]] = r
        # Wärmezähler braucht keine eigene Rechnung: er übernimmt den
        # Durchfluss seiner Leitung (node_flows) — PHYSIK §7 Bauteil-Klassen.

    # ── 7. Automatische Leitungsdimensionierung (PHYSIK §10, Dominics Tabelle) ──
    # Sie liest ausschliesslich edge_flows — die WP-Kreise sind dort bereits
    # eingetragen und werden damit automatisch mitdimensioniert.
    leitung_results = _leitungsdimensionen(edges, edge_flows)
    return {
        "edge_flows": edge_flows,
        "node_flows": node_flows,
        "verteiler_results": verteiler_results,
        "gruppe_results": gruppe_results,
        "ventil_results": ventil_results,
        "pumpen_results": pumpen_results,
        "expansion_results": expansion_results,
        "leitung_results": leitung_results,
        "anschluss_results": anschluss_results,
        "pwt_results": pwt_results,
        "heatpump_results": heatpump_results,
        "speicher_results": speicher_results,
        "erdsonden_results": erdsonden_results,
        "anschluss_warnings": anschluss_warnungen,
        "warnungen": _sammle_warnungen(nodes, verteiler_results, anschluss_warnungen, ventil_results, expansion_results)
                     + _wp_warnungen(nodes, heatpump_results)
                     + [f"Plattentauscher: {p['warnung']}" for p in pwt_results.values() if p.get("warnung")]
                     + [w for r in speicher_results.values() for w in r.get("warnings", [])]
                     + [w for r in erdsonden_results.values() for w in r.get("warnings", [])],
    }
