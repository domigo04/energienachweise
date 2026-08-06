"""Kennwerte fürs Datenkästchen am Bauteil — eine Quelle für Editor und Export.

Am Bauteil steht nicht nur sein Name, sondern das, was ein Planer im Schema
ablesen will: bei einem Ventil Fabrikat, Typ, DN, kvs, Δp und die Autorität,
bei einer Pumpe Fördermenge und Förderhöhe.

Ein Einzelbauteil liefert einen Abschnitt ohne Titel — den Namen trägt schon
die Kopfzeile des Blocks. Eine Verbrauchergruppe ist kein Einzelteil: in ihrem
Strang stecken Pumpe, Regelventil und Wärmezähler, und die liest der Planer
getrennt ab. Sie bekommt deshalb je eingebautem Gerät einen eigenen Abschnitt.

Die Werte kommen ausschliesslich aus den Eingaben und den Backend-Resultaten;
hier wird nichts gerechnet und nichts geraten. Editor und PDF holen dieselben
Abschnitte an derselben Stelle, damit im Plan nichts anderes steht als am
Bildschirm.
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


def _kg_h(m3_h) -> Optional[str]:
    """Massenstrom in kg/h mit Tausender-Hochkomma (Schweizer Schreibweise)."""
    zahl = _f(m3_h)
    if zahl is None:
        return None
    return f"{round(zahl * 1000):,}".replace(",", "'") + " kg/h"


def _text(wert) -> Optional[str]:
    text = str(wert).strip() if wert not in (None, "") else ""
    return text or None


FEHLT = "-"     # noch nicht erfasst — die Zeile bleibt trotzdem stehen


def _paar(bereiche: list) -> list:
    """Alle Zeilen behalten; was fehlt, bekommt einen Strich.

    Eine weggelassene Zeile sieht aus wie eine Angabe, die es nicht gibt. Ein
    Strich zeigt dagegen, dass die Angabe zum Bauteil gehört und noch fehlt —
    der Block wird damit zur Liste dessen, was noch zu erfassen ist
    (Dominic 2026-08-06).
    """
    return [(name, wert if wert not in (None, "") else FEHLT) for name, wert in bereiche]


def _abschnitt(titel: Optional[str], zeilen: list) -> Optional[dict]:
    """Ein Abschnitt des Datenblocks — ohne jede Zeile gibt es ihn nicht."""
    gefiltert = _paar(zeilen)
    return {"titel": titel, "zeilen": gefiltert} if gefiltert else None


def _geraet(titel: str, d: dict, praefix: str, zeilen: list) -> Optional[dict]:
    """Abschnitt eines eingebauten Geräts: Fabrikat, Typ, DN plus eigene Zeilen.

    Fabrikat/Typ/DN gehören zum Gerät, nicht zur Gruppe — sie werden deshalb
    mit eigenem Präfix gespeichert (`pumpe_fabrikat`, `ventil_dn`, …).
    """
    return _abschnitt(titel, [
        ("Fabrikat", _text(d.get(f"{praefix}_fabrikat"))),
        ("Typ", _text(d.get(f"{praefix}_typ"))),
        ("DN", _z(d.get(f"{praefix}_dn"), 0)),
    ] + zeilen)


def _temperaturen(vl, rl) -> Optional[str]:
    """VL/RL als ein Wert — im Schema stehen sie immer zusammen."""
    if _f(vl) is None or _f(rl) is None:
        return None
    return f"{_z(vl, 0)}/{_z(rl, 0)} °C"


def _gruppe(d: dict, gr: dict) -> list:
    """Verbrauchergruppe: Gruppenwerte, dann je eingebautem Gerät ein Abschnitt.

    Die Schaltungsart steht bewusst NICHT im Block (Dominic 2026-08-06): ob
    eine Gruppe drosselt, einspritzt oder beimischt, zeigt das Schema selbst.
    Im Block stehen die Angaben, die man am Bauteil ablesen muss — Leistung,
    Durchfluss, Wärmezähler und die Typenschilder der eingebauten Geräte.
    """
    vl = gr.get("vl") if gr.get("vl") is not None else d.get("vl_temp")
    rl = gr.get("rl") if gr.get("rl") is not None else d.get("rl_temp")
    schaltung = str(gr.get("schaltung") or d.get("schaltung") or "einspritz").lower()
    abschnitte = [_abschnitt(None, [
        ("Temperaturen", _temperaturen(vl, rl)),
        ("Leistung", _z(gr.get("q_kw") if gr.get("q_kw") is not None else d.get("q_kw"), 1, "kW")),
        ("Massenstrom", _kg_h(gr.get("m_sek"))),
    ])]

    pumpe = gr.get("pumpe") or {}
    if pumpe:
        abschnitte.append(_geraet("Umwälzpumpe", d, "pumpe", [
            ("V'", _z(pumpe.get("v"), 3, "m³/h")),
            ("Δp", _z(pumpe.get("dp_kpa"), 1, "kPa")),
            ("H", _z(pumpe.get("mws"), 2, "mWS")),
        ]))

    ventil = gr.get("ventil") or {}
    if ventil or d.get("hat_ventil") is not False:
        abschnitte.append(_geraet(
            "Dreiweg-Ventil" if schaltung == "beimisch" else "Zweiweg-Ventil", d, "ventil", [
                ("V'", _z(ventil.get("v"), 3, "m³/h")),
                ("kvs", _z(ventil.get("kvs_eff"), 2)),
                ("Δp", _z(ventil.get("dp_v_eff_kpa"), 1, "kPa")),
                ("Pv", _z(ventil.get("pv"), 0, "%")),
            ]))

    if d.get("hat_wz"):
        abschnitte.append(_geraet("Wärmezähler", d, "wz", [
            ("V'", _z(gr.get("m_sek"), 3, "m³/h")),
        ]))
    return [a for a in abschnitte if a]


def _einzelbauteil(t: str, d: dict, node_id: str, results: dict) -> list:
    """Kennwerte eines Einzelbauteils als [(Bezeichnung, Wert)]."""
    fluss = (results.get("node_flows") or {}).get(node_id)
    stamm = [
        ("Fabrikat", _text(d.get("fabrikat"))),
        ("Typ", _text(d.get("typ"))),
        ("DN", _z(d.get("dn"), 0)),
    ]

    if t in ("valve2", "valve3"):
        ve = (results.get("ventil_results") or {}).get(node_id) or {}
        return stamm + [
            ("V'", _z(fluss, 3, "m³/h")),
            ("kvs", _z(ve.get("kvs_eff"), 2)),
            ("Δp", _z(ve.get("dp_v_eff_kpa"), 1, "kPa")),
            ("Pv", _z(ve.get("pv"), 0, "%")),
        ]

    if t == "pump":
        p = (results.get("pumpen_results") or {}).get(node_id) or {}
        if p.get("ist_solepumpe"):
            return stamm + [
                ("Einbau", "Solekreis"),
                ("V'", _z(p.get("v"), 3, "m³/h")),
                ("Δp", _z(p.get("foerderhoehe_kpa"), 1, "kPa")),
                ("H", _z(p.get("foerderhoehe_mws"), 2, "mWS")),
            ]
        return stamm + [
            ("V'", _z(p.get("v") if p.get("v") is not None else fluss, 3, "m³/h")),
            ("Δp", _z(p.get("foerderhoehe_kpa"), 1, "kPa")),
            ("H", _z(p.get("mws"), 2, "mWS")),
        ]

    if t == "erzeuger":
        er = (results.get("heatpump_results") or {}).get(node_id) or {}
        return [
            ("Fabrikat", _text(d.get("fabrikat"))),
            ("Art", _text(generator_type_label(d.get("generator_type")))),
            ("Typ", _text(d.get("typ"))),
            ("Q", _z(d.get("leistung_kw"), 1, "kW")),
            ("Temperaturen", _temperaturen(d.get("vl_temp"), d.get("rl_temp"))),
            ("COP", _z(d.get("cop"), 2)),
            ("V'", _z(er.get("heating_flow_m3h"), 3, "m³/h")),
            ("Q0", _z(er.get("q_source_kw"), 1, "kW")),
        ]

    if t in ("speicher", "bww"):
        c = ((results.get("speicher_results") or {}) if t == "speicher"
             else (results.get("bww_results") or {})).get(node_id) or {}
        volumen = _f(d.get("speicher_liter")) or _f(c.get("speichervolumen_l"))
        return stamm + [
            ("Inhalt", _z(volumen, 0, "L")),
            ("Vorschlag", _z(c.get("speichervolumen_l"), 0, "L")),
            ("Q", _z(c.get("anschlussleistung_kw") or c.get("leistung_kw"), 1, "kW")),
        ]

    if t == "erdsonden":
        c = (results.get("erdsonden_results") or {}).get(node_id) or {}
        anzahl = int(_f(d.get("sonden_anzahl")) or c.get("sonden_anzahl") or 0) or None
        laenge = _f(d.get("sonden_laenge_m"))
        return [
            ("Sonden", f"{anzahl} × {_z(laenge, 0, 'm')}" if anzahl and laenge else None),
            ("Bohrmeter", _z(c.get("ist_gesamt_m"), 0, "m")),
            ("erforderlich", _z(c.get("erforderlich_gesamt_m"), 0, "m")),
            ("Soleinhalt", _z(c.get("gesamtinhalt_l"), 0, "L")),
        ]

    if t == "expansion":
        ex = (results.get("expansion_results") or {}).get(node_id) or {}
        if "fehler" in ex:
            return [("Hinweis", _text(ex.get("fehler")))]
        return stamm + [
            ("VN", _z(ex.get("vorschlag_l"), 0, "L")),
            ("p0", _z(ex.get("p0_bar"), 2, "bar")),
            ("pfin", _z(ex.get("pfin_bar"), 2, "bar")),
        ]

    if t == "anschluss":
        return [("Buchstabe", _text(d.get("buchstabe")))]

    # Wärmezähler, Absperr- und Regulierarmaturen, alles Übrige: Typenschild
    # plus der Durchfluss der Leitung, in der das Bauteil sitzt.
    return stamm + [("V'", _z(fluss, 3, "m³/h"))]


def bauteil_kennwerte(node: dict, results: dict) -> list:
    """Kennwerte eines Bauteils als Abschnitte fürs Kästchen.

    Rückgabe: `[{"titel": str | None, "zeilen": [(Bezeichnung, Wert), …]}]`.
    """
    d = node.get("data") or {}
    t = node.get("type")
    if t in ("gruppe", "lufterhitzer_gruppe"):
        return _gruppe(d, (results.get("gruppe_results") or {}).get(node.get("id")) or {})
    abschnitt = _abschnitt(None, _einzelbauteil(t, d, node.get("id"), results))
    return [abschnitt] if abschnitt else []


def node_infos(nodes: list, results: dict) -> dict:
    """Kennwerte für alle Bauteile — Antwortfeld für den Editor."""
    infos = {}
    for node in nodes or []:
        if not node.get("id"):
            continue
        abschnitte = bauteil_kennwerte(node, results)
        if abschnitte:
            infos[node["id"]] = [
                {"titel": a["titel"],
                 "zeilen": [{"name": name, "wert": wert} for name, wert in a["zeilen"]]}
                for a in abschnitte
            ]
    return infos
