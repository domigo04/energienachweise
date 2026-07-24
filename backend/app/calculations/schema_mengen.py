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
- Bohrmeter (§6): pro Erdsondenfeld anzahl × länge, über alle Felder summiert.
- Speichervolumen (§7): Einzelinhalte aller Speicher/BWW summiert.
- Erzeugerleistung (§5): installierte Leistung aller Wärmeerzeuger — bewusst
  getrennt von der aus den Verbrauchergruppen summierten Verbraucherleistung.
- Erzeugertyp (§4): strukturierter `generator_type` am Erzeuger-Node ist die
  Primärquelle; der frühere Freitext `typ` wird nur schwach normalisiert.

Neue strukturierte Feldnamen werden bevorzugt, die bisherigen (deutsch) bleiben
als Fallback lesbar, damit Bestandsschemas unverändert weiter zählen (§8, DoD).
"""
from __future__ import annotations

import json
from typing import Optional


# Verbrauchergruppen = Heizgruppen im Schema
_VERBRAUCHER = ("gruppe", "heizkreis")

# Erlaubte strukturierte Erzeugertypen (§4). Reihenfolge = keine Bedeutung.
GENERATOR_TYPES = (
    "ews_wp", "lwwp", "wasser_wp", "fernwaerme", "gas",
    "oel", "holz", "co2_wp", "elektro", "hybrid", "sonstige",
)

# Schwache Normalisierung des früheren Freitexts `typ` → strukturierter Typ.
# Nur Fallback: sobald ein Node `generator_type` trägt, gilt ausschliesslich der.
_GENERATOR_TYPE_HINTS = (
    ("ews_wp", ("erdsonde", "ews", "sole", "sole/wasser", "sole-wasser")),
    ("lwwp", ("luft/wasser", "luft-wasser", "lwwp", "luftwärme", "aussenluft")),
    ("wasser_wp", ("wasser/wasser", "wasser-wasser", "grundwasser")),
    ("co2_wp", ("co2", "co₂")),
    ("fernwaerme", ("fernwärme", "fernwaerme", "fw", "nahwärme")),
    ("gas", ("gas", "brennwert")),
    ("oel", ("öl", "oel", "heizöl")),
    ("holz", ("holz", "pellet", "schnitzel", "stückholz")),
    ("elektro", ("elektro", "elektrisch", "heizstab")),
    ("hybrid", ("hybrid",)),
    ("wasser_wp", ("wärmepumpe", "wp")),  # generische WP zuletzt → Sole/Wasser unklar
)


def _num(x) -> Optional[float]:
    """Robuste Zahl-Umwandlung — Graph-Werte sind teils Strings ('20')."""
    if x is None or x == "":
        return None
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _generator_type_von_node(d: dict) -> Optional[str]:
    """Strukturierten Erzeugertyp bestimmen: `generator_type` gewinnt, sonst
    schwache Freitext-Normalisierung. Unbekannt → None (nicht raten, §3)."""
    strukturiert = d.get("generator_type")
    if strukturiert:
        s = str(strukturiert).strip().lower()
        if s in GENERATOR_TYPES:
            return s
    freitext = str(d.get("typ") or "").strip().lower()
    if not freitext:
        return None
    for ziel, hinweise in _GENERATOR_TYPE_HINTS:
        if any(h in freitext for h in hinweise):
            return ziel
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

    bohrmeter_summe = 0.0
    hat_bohrmeter = False
    speichervolumen_summe = 0.0
    hat_speichervolumen = False
    generator_power_summe = 0.0
    hat_generator_power = False
    generator_types: list[str] = []  # alle erkannten Typen, für Merge nach der Schleife

    for n in nodes:
        t = n.get("type")
        d = n.get("data") or {}

        if t == "erzeuger":
            anzahl_erzeuger += 1
            g = _generator_type_von_node(d)
            if g is not None:
                generator_types.append(g)
            p = _num(d.get("generator_power_kw"))
            if p is None:
                p = _num(d.get("leistung_kw"))
            if p is not None:
                generator_power_summe += p
                hat_generator_power = True
        elif t == "erdsonden":
            # §11: die tatsächliche Sondenzahl summieren, NICHT die Felder zählen
            # (4 Sonden dürfen nicht als 1 erscheinen). Ohne Angabe zählt ein Feld
            # als mindestens eine Sonde.
            anzahl = _num(d.get("probe_count")) or _num(d.get("sonden_anzahl"))
            tiefe = _num(d.get("probe_depth_m")) or _num(d.get("sonden_laenge_m"))
            anzahl_erdsonden += int(anzahl) if (anzahl and anzahl > 0) else 1
            if anzahl is not None and tiefe is not None and anzahl > 0 and tiefe > 0:
                bohrmeter_summe += anzahl * tiefe
                hat_bohrmeter = True
        elif t in ("speicher", "bww"):
            anzahl_speicher += 1
            # §7: strukturiertes Volumen bevorzugt, sonst der bisherige Freitext.
            v = _num(d.get("storage_volume_l")) or _num(d.get("speicher_liter")) or _num(d.get("speicher_l"))
            if v is not None and v > 0:
                speichervolumen_summe += v
                hat_speichervolumen = True
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
    # sie unbekannt, nicht 0. `leistung_kw` = Verbraucherleistung (Bestandsname),
    # zusätzlich unter dem sprechenden `consumer_power_kw` geführt (§5).
    if hat_leistung:
        wert = round(leistung_summe, 3)
        mengen["leistung_kw"] = wert
        mengen["consumer_power_kw"] = wert
    # §5: installierte Erzeugerleistung getrennt halten — nicht mit der
    # Verbraucherleistung vermischen.
    if hat_generator_power:
        mengen["generator_power_kw"] = round(generator_power_summe, 3)
    # §6/§7: nur zurückgeben, wenn das Schema die Grösse wirklich kennt (sonst
    # bleibt sie im ProjectContext unbekannt und wird ergänzt, nie geraten).
    if hat_bohrmeter:
        mengen["bohrmeter"] = round(bohrmeter_summe, 3)
    if hat_speichervolumen:
        mengen["speichervolumen_l"] = round(speichervolumen_summe, 3)
    # §11: mehrere Erzeuger zu einem Typ verdichten. Gleicher Typ bleibt erhalten
    # (2× EWS-WP → ews_wp), verschiedene Familien werden hybrid (EWS-WP + Gas).
    generator_type = _merge_generator_types(generator_types)
    if generator_type is not None:
        mengen["generator_type"] = generator_type
    return mengen


def _merge_generator_types(types: list[str]) -> Optional[str]:
    distinct = set(types)
    if not distinct:
        return None
    if len(distinct) == 1:
        return next(iter(distinct))
    return "hybrid"
