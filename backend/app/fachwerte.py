"""Die EINE zentrale Registry kontrollierter Fachwerte (Punkt 5–8, 20).

Vergleichsrelevante Merkmale dürfen keine Freitexte sein. „Minergie-P",
„minergie p" und „MinergieP" wären sonst drei verschiedene Werte und jede
Ähnlichkeitsrechnung wird unbrauchbar.

Darum: pro Merkmal EINE Liste kanonischer Codes mit Label und Synonymen. Diese
Registry gilt für Projektinfo, ProjectContext, Auswertung, LV-Import und
Kostenschätzung — keine fünf Arrays mit leicht anderen Schreibweisen.

Grundsatz: der Code ist stabil und wird gespeichert; das Label ist nur Anzeige
und darf sich ändern. `normalize` bildet Freitext (auch aus Altdaten und aus dem
LV) auf einen Code ab; was nicht sicher zuzuordnen ist, bleibt None.
"""
from __future__ import annotations

import re

# ── Wärmeerzeuger (Punkt 6 — Mehrfachauswahl) ──────────────────────────────
# Codes gleich wie in schema_mengen/synonyms, damit Schema, LV und Referenz
# dieselbe Sprache sprechen. „hybrid" ist bewusst KEIN Erzeuger, sondern ein
# abgeleiteter Systemzustand (siehe `ist_hybrid`).
GENERATOR_TYPES: list[dict] = [
    # „erdsonde" deckt Erdsonde/Erdsonden/Erdsonden-WP/Erdsondenwärmepumpe ab.
    # „thermalia" ist ein Produktname aus dem Referenzangebot (Punkt 6). Achtung:
    # die Baureihe gibt es auch als Luft/Wasser-Variante — der Erzeugertyp ist im
    # Review eine bestätigungspflichtige Auswahl, eine falsche Vorauswahl ist
    # also sichtbar und korrigierbar.
    {"code": "ews_wp", "label": "Sole/Wasser-Wärmepumpe (Erdsonden)",
     "synonyme": ["sole/wasser", "sole-wasser", "erdsonden-wp", "ews-wp", "ews",
                  "erdsonde", "erdsondenwärmepumpe", "thermalia", "sole"]},
    {"code": "lwwp", "label": "Luft/Wasser-Wärmepumpe",
     "synonyme": ["luft/wasser", "luft-wasser", "aussenluft", "luftwärme", "lwwp"]},
    {"code": "wasser_wp", "label": "Wasser/Wasser-Wärmepumpe",
     "synonyme": ["wasser/wasser", "wasser-wasser", "grundwasser"]},
    {"code": "co2_wp", "label": "CO₂-Wärmepumpe", "synonyme": ["co2", "co₂"]},
    {"code": "fernwaerme", "label": "Fernwärme",
     "synonyme": ["fernwärme", "fernwaerme", "nahwärme", "nahwaerme", "fw"]},
    {"code": "gas", "label": "Gas",
     "synonyme": ["gaskessel", "gas-brennwert", "gasheizung", "brennwertkessel", "erdgas"]},
    {"code": "oel", "label": "Öl", "synonyme": ["ölkessel", "oelkessel", "heizöl", "heizoel"]},
    {"code": "holz", "label": "Holz",
     "synonyme": ["pellet", "pellets", "schnitzel", "stückholz", "holzheizung", "holzkessel"]},
    {"code": "elektro", "label": "Elektro",
     "synonyme": ["elektroheizung", "heizstab", "elektrisch", "elektroeinsatz"]},
    {"code": "solarthermie", "label": "Solarthermie",
     "synonyme": ["solarthermie", "sonnenkollektor", "solarkollektor"]},
    {"code": "sonstige", "label": "Sonstige", "synonyme": []},
]

# ── Wärmeabgabe (Punkt 7 — Mehrfachauswahl) ────────────────────────────────
HEAT_DELIVERY_TYPES: list[dict] = [
    {"code": "fbh", "label": "Fussbodenheizung",
     "synonyme": ["fussbodenheizung", "bodenheizung", "fbh", "flächenheizung"]},
    {"code": "heizkoerper", "label": "Heizkörper",
     "synonyme": ["heizkörper", "heizkoerper", "radiator", "radiatoren", "hk"]},
    {"code": "tabs", "label": "TABS (Betonkernaktivierung)",
     "synonyme": ["tabs", "betonkernaktivierung", "thermoaktive"]},
    {"code": "wandheizung", "label": "Wandheizung", "synonyme": ["wandheizung"]},
    {"code": "konvektoren", "label": "Konvektoren",
     "synonyme": ["konvektor", "konvektoren", "unterflurkonvektor"]},
    {"code": "lufterhitzer", "label": "Lufterhitzer",
     "synonyme": ["lufterhitzer", "luftheizregister", "lüftungsregister"]},
    {"code": "deckenstrahlplatten", "label": "Deckenstrahlplatten",
     "synonyme": ["deckenstrahlplatte", "deckenstrahlplatten", "strahlplatte"]},
    {"code": "sonstige", "label": "Sonstige", "synonyme": []},
]

# ── Zertifizierung (Punkt 20 — nie mehr Freitext) ─────────────────────────
CERTIFICATIONS: list[dict] = [
    {"code": "none", "label": "Keine", "synonyme": ["keine", "kein", "-", "ohne"]},
    {"code": "minergie", "label": "Minergie", "synonyme": ["minergie"]},
    {"code": "minergie_p", "label": "Minergie-P", "synonyme": ["minergie-p", "minergie p"]},
    {"code": "minergie_eco", "label": "Minergie-ECO",
     "synonyme": ["minergie-eco", "minergie eco", "minergie-a-eco", "eco"]},
    {"code": "snbs", "label": "SNBS", "synonyme": ["snbs", "standard nachhaltiges bauen"]},
    {"code": "leed", "label": "LEED", "synonyme": ["leed"]},
    {"code": "other", "label": "Sonstige", "synonyme": ["andere", "sonstige"]},
]

# ── Gebäudenutzung ────────────────────────────────────────────────────────
BUILDING_USES: list[dict] = [
    {"code": "mfh", "label": "Mehrfamilienhaus",
     "synonyme": ["mfh", "mehrfamilienhaus", "wohnbau", "wohnen", "überbauung"]},
    {"code": "efh", "label": "Einfamilienhaus", "synonyme": ["efh", "einfamilienhaus"]},
    {"code": "buero", "label": "Büro / Verwaltung",
     "synonyme": ["büro", "buero", "verwaltung", "dienstleistung"]},
    {"code": "schule", "label": "Schule / Bildung",
     "synonyme": ["schule", "schulhaus", "kindergarten", "bildung", "turnhalle"]},
    {"code": "gewerbe", "label": "Gewerbe / Industrie",
     "synonyme": ["gewerbe", "industrie", "werkstatt", "lager", "produktion"]},
    {"code": "verkauf", "label": "Verkauf / Gastronomie",
     "synonyme": ["verkauf", "laden", "restaurant", "gastronomie", "hotel"]},
    {"code": "gesundheit", "label": "Gesundheit / Pflege",
     "synonyme": ["spital", "pflegeheim", "altersheim", "gesundheit", "arztpraxis"]},
    {"code": "sonstige", "label": "Sonstige", "synonyme": []},
]

# ── Projektart ────────────────────────────────────────────────────────────
PROJECT_TYPES: list[dict] = [
    {"code": "neubau", "label": "Neubau", "synonyme": ["neubau", "neu"]},
    {"code": "sanierung", "label": "Sanierung",
     "synonyme": ["sanierung", "erneuerung", "ersatz", "heizungsersatz", "umbau"]},
    {"code": "erweiterung", "label": "Erweiterung / Anbau",
     "synonyme": ["erweiterung", "anbau", "aufstockung"]},
    {"code": "sonstige", "label": "Sonstige", "synonyme": []},
]

# ── Ausbauumfang ──────────────────────────────────────────────────────────
SCOPE_LEVELS: list[dict] = [
    {"code": "vollausbau", "label": "Vollausbau", "synonyme": ["vollausbau", "komplett"]},
    {"code": "grundausbau", "label": "Grundausbau", "synonyme": ["grundausbau", "basis"]},
    {"code": "teilausbau", "label": "Teilausbau", "synonyme": ["teilausbau", "teilweise"]},
]

# Ein Zugriffspunkt für alle Listen — so kann das Frontend sie in EINEM Aufruf
# holen und es gibt garantiert keine abweichende Kopie.
REGISTRY: dict[str, list[dict]] = {
    "generator_types": GENERATOR_TYPES,
    "heat_delivery_types": HEAT_DELIVERY_TYPES,
    "certifications": CERTIFICATIONS,
    "building_uses": BUILDING_USES,
    "project_types": PROJECT_TYPES,
    "scope_levels": SCOPE_LEVELS,
}

# Merkmale, die mehrere Werte gleichzeitig haben dürfen (Punkt 6/7).
MULTI_VALUE = ("generator_types", "heat_delivery_types")


def codes(name: str) -> list[str]:
    return [e["code"] for e in REGISTRY[name]]


def label(name: str, code: str) -> str:
    for e in REGISTRY[name]:
        if e["code"] == code:
            return e["label"]
    return code


def _falte(text: str) -> str:
    low = str(text or "").strip().lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        low = low.replace(a, b)
    return re.sub(r"\s+", " ", low)


def normalize(name: str, wert) -> str | None:
    """Freitext oder Altwert → kanonischer Code. Unklar → None.

    Wird für Altdaten (Freitext-Zertifizierung, „Erdsonden-WP" als Text) und für
    LV-Treffer verwendet. Bewusst konservativ: kein Rateversuch (Punkt 18).
    """
    if wert in (None, ""):
        return None
    eintraege = REGISTRY[name]
    norm = _falte(wert)
    if not norm:
        return None
    for e in eintraege:                      # exakter Code gewinnt immer
        if norm == _falte(e["code"]):
            return e["code"]
    for e in eintraege:                      # dann das Label
        if norm == _falte(e["label"]):
            return e["code"]
    # Dann Synonyme — längste zuerst, damit „minergie-p" vor „minergie" greift.
    kandidaten = sorted(
        ((s, e["code"]) for e in eintraege for s in e["synonyme"]),
        key=lambda x: -len(x[0]))
    for syn, code in kandidaten:
        if _falte(syn) in norm:
            return code
    return None


def normalize_list(name: str, werte) -> list[str]:
    """Mehrere Werte → Liste eindeutiger Codes, Reihenfolge stabil (Punkt 6/7)."""
    if werte in (None, ""):
        return []
    if isinstance(werte, str):
        # Auch „EWS-WP + Gas" bzw. kommagetrennte Altwerte auflösen.
        werte = [t for t in re.split(r"[+,;/]| und ", werte) if t.strip()]
    out: list[str] = []
    for w in werte or []:
        code = normalize(name, w)
        if code and code not in out:
            out.append(code)
    return out


def ist_hybrid(generator_types) -> bool:
    """Hybrid ist kein wählbarer Erzeuger, sondern ein abgeleiteter Zustand
    (Punkt 7): mehr als ein Wärmeerzeuger."""
    return len(generator_types or []) > 1


def as_frontend() -> dict:
    """Registry für das Frontend — genau eine Quelle für alle Auswahllisten."""
    return {
        "listen": {name: [{"code": e["code"], "label": e["label"]} for e in eintraege]
                   for name, eintraege in REGISTRY.items()},
        "multi_value": list(MULTI_VALUE),
    }
