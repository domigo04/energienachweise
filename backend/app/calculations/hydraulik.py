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

from app.calculations.ventil import berechne_kvs

VL_FARBE = "#ef4444"
RL_FARBE = "#3b82f6"
VERBRAUCHER_TYPEN = ("gruppe", "heizkreis")
BLOCK_TYPEN = ("verteiler", "erzeuger")  # Ast-Suche stoppt hier (PHYSIK §2)


def _zahl(x) -> Optional[float]:
    """Robust zu float parsen — Editor-Daten sind oft Strings."""
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


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


# ── Pumpe + Ventil IM Strang (Auslegung wie Einzelbauteile) ─────────────────
def _strang_ausruestung(d: dict, res: dict) -> None:
    """Ergänzt gruppe_results um Pumpen- und Ventil-Auslegung im Strang.

    Die Pumpe läuft im Sekundärkreis (V' = m_sek), das Einspritz-/Regelventil
    sitzt primärseitig (V' = m_prim). Rechnet NUR zusätzlich — die bestehenden
    Flüsse/Temperaturen (PHYSIK §4) werden nicht verändert.
    """
    hat_pumpe = d.get("hat_pumpe") is not False
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
    return e.get("stroke") or (e.get("style") or {}).get("stroke")


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


def berechne_schema(nodes: List[dict], edges: List[dict]) -> dict:
    """Kompletter Graph: Flüsse je Leitung/Knoten + Verteiler-/Gruppen-Resultate.

    1. Sekundär-Fluss je Verbraucher (§1).
    2. Verteiler-zentriert nach §4 (VL=max, ṁ_prim je Ast, RL mengengewichtet,
       Δp = ungünstigster Ast). Jede Ast-Leitung trägt den Fluss IHRES Kreises (§2).
    3. Freie Topologie (ohne Verteiler): Rückwärts-Propagierung, jede Kante
       nur einmal zählen (§2 — Doppelzählungs-Bug-Historie).
    """
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

    leer = {"edge_flows": {}, "node_flows": {}, "verteiler_results": {}, "gruppe_results": {}}
    if not sek:
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
        for ast in ast_daten:
            ast_m = ast_q = 0.0
            ast_dps = []
            for cid in ast["verbraucher"]:
                d = data(node_by_id[cid])
                q, vl, rl = _zahl(d.get("q_kw")), _zahl(d.get("vl_temp")), _zahl(d.get("rl_temp"))
                dp = _zahl(d.get("dp_kpa"))
                if dp:
                    ast_dps.append(dp)
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

        rl_misch = rl_zaehler / m_prim_total if m_prim_total > 0 else None

        # Hauptanschlüsse links: Summe (§4)
        main = branches.get("main", {"vl": [], "rl": []})
        for e in main["vl"] + main["rl"]:
            edge_flows[e["id"]] = round(m_prim_total, 4)
            calc_edges.add(e["id"])

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

    return {
        "edge_flows": edge_flows,
        "node_flows": node_flows,
        "verteiler_results": verteiler_results,
        "gruppe_results": gruppe_results,
    }
