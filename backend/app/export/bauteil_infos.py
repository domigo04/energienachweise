"""Kennwerte fürs Datenkästchen am Bauteil — eine Quelle für Editor und Export.

Am Bauteil steht nicht nur sein Name, sondern das, was ein Planer im Schema
ablesen will: bei einem Ventil Fabrikat, Typ, DN, kvs, Δp und die Autorität,
bei einer Pumpe Fördermenge und Förderhöhe.

Die Werte kommen ausschliesslich aus den Eingaben und den Backend-Resultaten;
hier wird nichts gerechnet und nichts geraten. Editor und PDF holen dieselbe
Liste an derselben Stelle, damit im Plan nichts anderes steht als am Bildschirm.
"""

from typing import Optional

from app.data.generator_types import generator_type_label


def _f(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _z(wert, nachkomma: int = 2, einheit: str = "") -> Optional[str]:
    """Zahl kompakt; None bleibt None, damit die Zeile ganz entfällt."""
    zahl = _f(wert)
    if zahl is None:
        return None
    text = f"{zahl:.{nachkomma}f}"
    if "." in text:                     # sonst würde aus DN 40 eine 4
        text = text.rstrip("0").rstrip(".")
    text = text or "0"
    return f"{text} {einheit}".strip()


def _text(wert) -> Optional[str]:
    text = str(wert).strip() if wert not in (None, "") else ""
    return text or None


def _paar(bereiche: list) -> list:
    """Nur Zeilen mit Wert behalten — ein leeres Kästchen hilft niemandem."""
    return [(name, wert) for name, wert in bereiche if wert not in (None, "")]


def bauteil_kennwerte(node: dict, results: dict) -> list:
    """Kennwerte eines Bauteils als [(Bezeichnung, Wert)] fürs Kästchen."""
    d = node.get("data") or {}
    t = node.get("type")
    node_id = node.get("id")
    fluss = (results.get("node_flows") or {}).get(node_id)
    stamm = [
        ("Fabrikat", _text(d.get("fabrikat"))),
        ("Typ", _text(d.get("typ"))),
        ("DN", _z(d.get("dn"), 0)),
    ]

    if t in ("valve2", "valve3"):
        ve = (results.get("ventil_results") or {}).get(node_id) or {}
        return _paar(stamm + [
            ("V'", _z(fluss, 3, "m³/h")),
            ("kvs", _z(ve.get("kvs_eff"), 2)),
            ("Δp", _z(ve.get("dp_v_eff_kpa"), 1, "kPa")),
            ("Pv", _z(ve.get("pv"), 0, "%")),
        ])

    if t == "pump":
        p = (results.get("pumpen_results") or {}).get(node_id) or {}
        if p.get("ist_solepumpe"):
            return _paar(stamm + [
                ("Einbau", "Solekreis"),
                ("V'", _z(p.get("v"), 3, "m³/h")),
                ("H", _z(p.get("foerderhoehe_mws"), 2, "mWs")),
            ])
        return _paar(stamm + [
            ("V'", _z(p.get("v") if p.get("v") is not None else fluss, 3, "m³/h")),
            ("H", _z(p.get("foerderhoehe_kpa"), 1, "kPa")),
            ("H", _z(p.get("mws"), 2, "mWS")),
        ])

    if t in ("waermezaehler", "waermezaehler_cad"):
        return _paar(stamm + [("V'", _z(fluss, 3, "m³/h"))])

    if t in ("shutoff", "checkvalve", "stad", "sicherheitsventil", "temperatur", "pwt"):
        return _paar(stamm + [("V'", _z(fluss, 3, "m³/h"))])

    if t == "erzeuger":
        er = (results.get("heatpump_results") or {}).get(node_id) or {}
        return _paar([
            ("Fabrikat", _text(d.get("fabrikat"))),
            ("Art", _text(generator_type_label(d.get("generator_type")))),
            ("Typ", _text(d.get("typ"))),
            ("Q", _z(d.get("leistung_kw"), 1, "kW")),
            ("VL/RL", (f"{_z(d.get('vl_temp'), 0)}/{_z(d.get('rl_temp'), 0)} °C"
                       if _f(d.get("vl_temp")) is not None and _f(d.get("rl_temp")) is not None
                       else None)),
            ("COP", _z(d.get("cop"), 2)),
            ("V'", _z(er.get("heating_flow_m3h"), 3, "m³/h")),
            ("Q0", _z(er.get("q_source_kw"), 1, "kW")),
        ])

    if t in ("speicher", "bww"):
        c = ((results.get("speicher_results") or {}) if t == "speicher"
             else (results.get("bww_results") or {})).get(node_id) or {}
        volumen = _f(d.get("speicher_liter")) or _f(c.get("speichervolumen_l"))
        return _paar(stamm + [
            ("Inhalt", _z(volumen, 0, "L")),
            ("Vorschlag", _z(c.get("speichervolumen_l"), 0, "L")),
            ("Q", _z(c.get("anschlussleistung_kw") or c.get("leistung_kw"), 1, "kW")),
        ])

    if t == "erdsonden":
        c = (results.get("erdsonden_results") or {}).get(node_id) or {}
        anzahl = int(_f(d.get("sonden_anzahl")) or c.get("sonden_anzahl") or 0) or None
        laenge = _f(d.get("sonden_laenge_m"))
        return _paar([
            ("Sonden", f"{anzahl} × {_z(laenge, 0, 'm')}" if anzahl and laenge else None),
            ("Bohrmeter", _z(c.get("ist_gesamt_m"), 0, "m")),
            ("erforderlich", _z(c.get("erforderlich_gesamt_m"), 0, "m")),
            ("Soleinhalt", _z(c.get("gesamtinhalt_l"), 0, "L")),
        ])

    if t == "expansion":
        ex = (results.get("expansion_results") or {}).get(node_id) or {}
        if "fehler" in ex:
            return _paar([("Hinweis", _text(ex.get("fehler")))])
        return _paar(stamm + [
            ("VN", _z(ex.get("vorschlag_l"), 0, "L")),
            ("p0", _z(ex.get("p0_bar"), 2, "bar")),
            ("pfin", _z(ex.get("pfin_bar"), 2, "bar")),
        ])

    if t == "anschluss":
        return _paar([("Buchstabe", _text(d.get("buchstabe")))])

    return _paar(stamm + [("V'", _z(fluss, 3, "m³/h"))])


def node_infos(nodes: list, results: dict) -> dict:
    """Kennwerte für alle Bauteile — Antwortfeld für den Editor."""
    infos = {}
    for node in nodes or []:
        if not node.get("id"):
            continue
        werte = bauteil_kennwerte(node, results)
        if werte:
            infos[node["id"]] = [{"name": name, "wert": wert} for name, wert in werte]
    return infos
