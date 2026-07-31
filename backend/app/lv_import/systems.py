"""Anlagensysteme aus dem LV: Wärmeabgabe und Wärmeerzeugung.

Ein LV nennt selten nur ein Abgabesystem. In der Sporthalle stehen Flachröhren-
radiatoren, Konvektoren und Luftheizapparate nebeneinander — und die Luftheiz-
apparate werden bauseits geliefert, aber vom Heizungsunternehmer montiert. Genau
dieser Unterschied entscheidet über den Preis, deshalb reicht ein einzelnes Feld
`waermeabgabe` nicht.

Geschlossene Welt: Typcodes kommen ausschliesslich aus `app.fachwerte`. Was sich
nicht zuordnen lässt, wird verworfen statt erfunden.
"""
from __future__ import annotations

import re

from app import fachwerte

HEAT_EMISSION = "heat_emission"
HEAT_GENERATION = "heat_generation"

CONTRACTOR, OTHERS = "contractor", "others"

# Wortlaute, die eine Fremdlieferung anzeigen. Steht zusätzlich «Montage» in
# derselben Zeile, montiert der Heizungsunternehmer trotzdem.
_FREMDLIEFERUNG = (
    "bauseits", "bauseitig", "durch bauherr", "durch auftraggeber", "fremdlieferung",
    "wird geliefert", "liefert der bauherr", "beigestellt", "durch andere",
)
_MONTAGE_DURCH_UNS = ("montage", "montieren", "versetzen", "anschliessen", "anschließen")
_BESTAND = ("bestehend", "bestehende", "vorhanden", "vorhandene", "altanlage")
_HEIZKOERPER_ZUBEHOER = (
    "entleerhahn", "entlüfter", "entluefter", "thermostatventil",
    "thermostatkopf", "verschraubung", "aufhängung", "aufhaengung",
    "halterung", "anschlussarmatur", "ventileinsatz",
)

# Menge einer Position: «Stk. 4», «4 Stk», «Anzahl 4». Bewusst eng gehalten —
# eine Typennummer wie «Typ 22» darf nie als Menge durchgehen.
_MENGE = re.compile(
    r"(?:(?:stk|stück|stueck|anzahl)\.?\s*[:=]?\s*(\d{1,3})"
    r"|(\d{1,3})\s*(?:stk|stück|stueck)\b)",
    re.IGNORECASE,
)


def _menge(text: str) -> int | None:
    treffer = _MENGE.search(text or "")
    if not treffer:
        return None
    wert = treffer.group(1) or treffer.group(2)
    try:
        zahl = int(wert)
    except (TypeError, ValueError):
        return None
    return zahl if 0 < zahl <= 999 else None


def _lieferung(text: str) -> tuple[str, str | None, str | None]:
    """(supplied_by, installation_by, scope_status) aus dem Positionstext."""
    low = (text or "").lower()
    fremd = any(wort in low for wort in _FREMDLIEFERUNG)
    if not fremd:
        return CONTRACTOR, CONTRACTOR, "included"
    if any(wort in low for wort in _MONTAGE_DURCH_UNS):
        # Fremd geliefert, aber von uns montiert: die Montage ist im Preis.
        return OTHERS, CONTRACTOR, "installed_by_contractor"
    return OTHERS, None, "by_others"


def _zeilen(pages) -> list[dict]:
    """Textseiten → Zeilen mit Seitenzahl. Arbeitet auch auf LV-Positionen."""
    zeilen: list[dict] = []
    for seite in pages or []:
        if isinstance(seite, dict) and "text" in seite and "page" in seite:
            nummer = seite.get("page")
            for roh in str(seite.get("text") or "").splitlines():
                if roh.strip():
                    zeilen.append({"text": roh.strip(), "page": nummer})
    return zeilen


def hat_beleg(eintrag: dict) -> bool:
    """Ein Merkmal ohne Fundstelle ist eine Behauptung, kein Befund.

    Verlangt werden Seitenzahl, ein Textbeleg (oder eine Bounding-Box) und eine
    Sicherheit. Fehlt eines davon, darf der Wert nicht gespeichert werden.
    """
    if eintrag.get("source_page") is None:
        return False
    if not (eintrag.get("source_text") or eintrag.get("source_bbox")):
        return False
    return eintrag.get("confidence") is not None


def detect(pages, kind: str = HEAT_EMISSION) -> list[dict]:
    """Systeme aus born-digital Text erkennen.

    Bei Scans liefert das wenig — dort ist die visuelle Prüfung die Quelle.
    Beides landet über `merge` in derselben Struktur.
    """
    registry = "heat_delivery_types" if kind == HEAT_EMISSION else "generator_types"
    gefunden: dict[str, dict] = {}
    for zeile in _zeilen(pages):
        text = zeile["text"]
        code = fachwerte.normalize(registry, text)
        if not code or code == "sonstige":
            continue
        if (
            kind == HEAT_EMISSION and code == "heizkoerper"
            and any(term in text.lower() for term in _HEIZKOERPER_ZUBEHOER)
        ):
            # Zubehör zu einem Heizkörper ist kein zusätzliches Abgabesystem.
            continue
        # Ohne Seitenzahl gäbe es keinen nachprüfbaren Beleg — die Zeile wird
        # dann verworfen statt als Merkmal gespeichert.
        if zeile.get("page") is None:
            continue
        supplied_by, installation_by, scope = _lieferung(text)
        eintrag = {
            "kind": kind,
            "type_code": code,
            "source_label": text[:120],
            "count": _menge(text),
            "supplied_by": supplied_by,
            "installation_by": installation_by,
            "scope_status": scope,
            "existing_or_new": "existing" if any(w in text.lower() for w in _BESTAND) else "new",
            "confidence": 0.8,
            "source_page": zeile.get("page"),
            "source_text": text[:200],
        }
        vorhanden = gefunden.get(code)
        # Mehrere Zeilen zum selben System: die mit der Menge gewinnt, sonst die
        # erste. Mengen werden NICHT summiert — im LV steht dieselbe Position oft
        # mehrfach (Beschrieb, Menge, Preis).
        if vorhanden is None or (eintrag["count"] and not vorhanden.get("count")):
            gefunden[code] = eintrag
    # Ein konkreter Radiatortyp ist fachlich präziser als der zusätzlich
    # vorkommende Sammelbegriff «Heizkörper» und darf nicht doppelt erscheinen.
    if kind == HEAT_EMISSION and "heizkoerper" in gefunden and any(
        code in gefunden for code in ("roehrenradiator", "plattenradiator")
    ):
        gefunden.pop("heizkoerper", None)
    return [e for e in gefunden.values() if hat_beleg(e)]


def from_llm(items, kind: str) -> list[dict]:
    """Systeme aus der visuellen Prüfung — gegen die Registry abgesichert."""
    registry = "heat_delivery_types" if kind == HEAT_EMISSION else "generator_types"
    out: list[dict] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        code = fachwerte.normalize(registry, item.get("type") or item.get("source_label") or "")
        if not code:
            continue
        supplied_by = item.get("supplied_by")
        supplied_by = supplied_by if supplied_by in (CONTRACTOR, OTHERS) else None
        installation_by = item.get("installation_by")
        installation_by = installation_by if installation_by in (CONTRACTOR, OTHERS) else None
        scope = fachwerte.normalize("scope_status", item.get("scope_status") or "")
        if supplied_by == OTHERS and installation_by == CONTRACTOR:
            scope = "installed_by_contractor"
        elif supplied_by == OTHERS and not installation_by:
            scope = scope or "by_others"
        out.append({
            "kind": kind,
            "type_code": code,
            "source_label": str(item.get("source_label") or "")[:120] or None,
            "count": _ganzzahl(item.get("count")),
            "capacity_kw": _zahl(item.get("capacity_kw")),
            "manufacturer": _text(item.get("manufacturer")),
            "model": _text(item.get("model")),
            "supplied_by": supplied_by,
            "installation_by": installation_by,
            "scope_status": scope or "included",
            "existing_or_new": item.get("existing_or_new")
            if item.get("existing_or_new") in ("existing", "new") else None,
            "confidence": _zahl(item.get("confidence")),
            "source_page": _ganzzahl(item.get("source_page")),
            "source_text": str(item.get("evidence") or "")[:200] or None,
        })
    # Auch die visuelle Prüfung muss belegen: ohne Seitenzahl, Beleg und
    # Sicherheit wird der Vorschlag verworfen statt gespeichert.
    return [e for e in out if hat_beleg(e)]


def merge(deterministisch: list[dict], visuell: list[dict]) -> list[dict]:
    """Visuell Belegtes gewinnt — es hat die Seite wirklich gesehen."""
    zusammen: dict[tuple[str, str], dict] = {}
    for eintrag in list(deterministisch or []) + list(visuell or []):
        schluessel = (eintrag["kind"], eintrag["type_code"])
        vorhanden = zusammen.get(schluessel)
        if vorhanden is None:
            zusammen[schluessel] = eintrag
            continue
        # Felder einzeln übernehmen: die visuelle Prüfung kennt oft Fabrikat und
        # Menge, der Parser dafür die genaue Fundstelle.
        zusammen[schluessel] = {
            **vorhanden,
            **{k: v for k, v in eintrag.items() if v not in (None, "")},
        }
    return list(zusammen.values())


_GENERATOR_EVIDENCE = {
    "ews_wp": ("sole/wasser", "sole-wasser", "erdsonde", "erdwaermesonde", "erdwärmesonde"),
    "lwwp": ("luft/wasser", "luft-wasser", "aussenluft", "außenluft", "lwwp"),
    "wasser_wp": ("wasser/wasser", "wasser-wasser", "grundwasser"),
    "co2_wp": ("co2", "co₂"),
    "fernwaerme": ("fernwaerme", "fernwärme", "nahwaerme", "nahwärme"),
    "gas": ("gaskessel", "gasheizung", "gas-brennwert", "erdgas"),
    "oel": ("oelkessel", "ölkessel", "heizoel", "heizöl"),
    "holz": ("pellet", "schnitzel", "stueckholz", "stückholz", "holzkessel"),
    "elektro": ("elektroheizung", "heizstab", "elektroeinsatz"),
    "solarthermie": ("solarthermie", "sonnenkollektor", "solarkollektor"),
}


def filter_visual_generators_by_page_evidence(
    entries: list[dict], pages: list[dict], *, text_available: bool = True,
) -> list[dict]:
    """Verwirft visuell behauptete Erzeuger ohne passenden OCR-Seitenbeleg.

    Luftheizapparate sind keine Luft/Wasser-Wärmepumpe und «bestehend» allein
    ist kein Fernwärmenachweis. Bei komplett fehlendem Text bleibt die visuelle
    Quelle erhalten, weil dann keine unabhängige Gegenprüfung möglich ist.
    """
    if not text_available:
        return list(entries or [])
    page_text = {
        int(page["page"]): _fold_text(page.get("text") or "")
        for page in pages or [] if page.get("page")
    }
    out: list[dict] = []
    for entry in entries or []:
        if entry.get("kind") != HEAT_GENERATION:
            out.append(entry)
            continue
        aliases = _GENERATOR_EVIDENCE.get(entry.get("type_code"), ())
        text = page_text.get(entry.get("source_page"), "")
        if aliases and any(_fold_text(alias) in text for alias in aliases):
            out.append(entry)
    return out


def _fold_text(value: str) -> str:
    low = str(value or "").lower()
    for left, right in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        low = low.replace(left, right)
    return re.sub(r"\s+", " ", low)


def delivery_codes(systeme: list[dict]) -> list[str]:
    """Codes der Wärmeabgabe — füllt das bestehende Merkmal `heat_delivery_types`."""
    return sorted({s["type_code"] for s in systeme or [] if s.get("kind") == HEAT_EMISSION})


def generator_codes(systeme: list[dict]) -> list[str]:
    return sorted({s["type_code"] for s in systeme or [] if s.get("kind") == HEAT_GENERATION})


def _zahl(wert):
    try:
        return float(wert) if wert is not None else None
    except (TypeError, ValueError):
        return None


def _ganzzahl(wert):
    zahl = _zahl(wert)
    return int(zahl) if zahl is not None else None


def _text(wert):
    text = str(wert or "").strip()
    return text[:120] or None
