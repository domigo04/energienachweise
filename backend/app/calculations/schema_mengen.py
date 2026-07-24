"""Schritt 2 — technische Mengen LIVE aus dem Anlagenschema ableiten (Quelle B).

One Source of Truth (§2, §33): Diese Werte werden NIE gespeichert. Sie werden bei
jedem Lesen frisch aus dem React-Flow-Graphen (`HcSchema.graph_json`) gezählt.
Würde man sie in eine Tabelle kopieren, entstünde genau die zweite Wahrheit, die
das Projekt vermeiden will — bei der nächsten Schemaänderung wäre die Kopie falsch.

Das Schema kennt bewusst NICHT alles (§3): Bohrmeter, Speichervolumen oder der
konkrete Erzeugertyp stehen nicht im Bauteil-Datensatz. Solche Grössen liefert
diese Funktion gar nicht zurück — sie bleiben im ProjectContext «unbekannt» oder
werden ergänzt, statt hier geraten zu werden.

Zählregeln (verankert in den echten Graph-Daten und der Hydraulik-Semantik):

- Pumpe in der Gruppe: `schaltung != 'drossel'` und `hat_pumpe is not False`
  (identisch zu hydraulik.py::_strang_ausruestung, PHYSIK §6).
- Ventiltyp der Gruppe: Einspritz/Beimisch → 3-Weg, Drossel → 2-Weg.
- Wärmezähler in der Gruppe: nur bei ausdrücklichem `hat_wz is True`
  (kein stiller Default — nicht jede Gruppe wird gemessen, §3).
"""
from __future__ import annotations

import json
from typing import Optional


# Verbrauchergruppen = Heizgruppen im Schema
_VERBRAUCHER = ("gruppe", "heizkreis")


def _num(x) -> Optional[float]:
    """Robuste Zahl-Umwandlung — Graph-Werte sind teils Strings ('20')."""
    if x is None or x == "":
        return None
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _schaltung(d: dict) -> str:
    s = str(d.get("schaltung") or "einspritz").lower()
    return s if s in ("einspritz", "beimisch", "drossel") else "einspritz"


def _hat_pumpe(d: dict) -> bool:
    return _schaltung(d) != "drossel" and d.get("hat_pumpe") is not False


def _hat_ventil(d: dict) -> bool:
    return d.get("hat_ventil") is not False


def mengen_aus_schema(graph_json) -> dict:
    """Zählt die kostenrelevanten Mengen im Schema-Graphen.

    Rückgabe enthält NUR Grössen, die das Schema wirklich kennt. Fehlt ein
    Graph oder gibt es keine Bauteile, wird ein leeres Dict zurückgegeben
    (nichts bekannt) — der Aufrufer entscheidet, was das für den Status heisst.
    """
    if isinstance(graph_json, str):
        try:
            graph = json.loads(graph_json or "{}")
        except (TypeError, ValueError):
            graph = {}
    else:
        graph = graph_json or {}

    nodes = graph.get("nodes") or []
    if not nodes:
        return {}

    anzahl_erzeuger = 0
    anzahl_erdsonden = 0
    anzahl_speicher = 0
    anzahl_verteiler = 0
    anzahl_heizgruppen = 0
    anzahl_pumpen = 0
    anzahl_ventile_2weg = 0
    anzahl_ventile_3weg = 0
    anzahl_waermezaehler = 0
    leistung_summe = 0.0
    hat_leistung = False

    for n in nodes:
        t = n.get("type")
        d = n.get("data") or {}

        if t == "erzeuger":
            anzahl_erzeuger += 1
        elif t == "erdsonden":
            anzahl_erdsonden += 1
        elif t in ("speicher", "bww"):
            anzahl_speicher += 1
        elif t == "verteiler":
            anzahl_verteiler += 1
        elif t == "pump":
            anzahl_pumpen += 1
        elif t == "valve2":
            anzahl_ventile_2weg += 1
        elif t == "valve3":
            anzahl_ventile_3weg += 1
        elif t == "waermezaehler":
            anzahl_waermezaehler += 1

        if t in _VERBRAUCHER:
            anzahl_heizgruppen += 1
            q = _num(d.get("q_kw"))
            if q is not None:
                leistung_summe += q
                hat_leistung = True

        # In der Gruppe integrierte Armaturen (CAD-Strang)
        if t == "gruppe":
            if _hat_pumpe(d):
                anzahl_pumpen += 1
            if _hat_ventil(d):
                if _schaltung(d) == "drossel":
                    anzahl_ventile_2weg += 1
                else:
                    anzahl_ventile_3weg += 1
            if d.get("hat_wz") is True:
                anzahl_waermezaehler += 1

    mengen = {
        "anzahl_erzeuger": anzahl_erzeuger,
        "anzahl_erdsonden": anzahl_erdsonden,
        "anzahl_speicher": anzahl_speicher,
        "anzahl_verteiler": anzahl_verteiler,
        "anzahl_heizgruppen": anzahl_heizgruppen,
        "anzahl_pumpen": anzahl_pumpen,
        "anzahl_ventile_2weg": anzahl_ventile_2weg,
        "anzahl_ventile_3weg": anzahl_ventile_3weg,
        "anzahl_waermezaehler": anzahl_waermezaehler,
    }
    # Leistung nur, wenn mindestens eine Gruppe eine Leistung trägt — sonst ist
    # sie unbekannt, nicht 0.
    if hat_leistung:
        mengen["leistung_kw"] = round(leistung_summe, 3)
    return mengen
