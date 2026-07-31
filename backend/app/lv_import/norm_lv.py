"""Zuordnung Unternehmer-Position → Norm-LV-Position (Punkt 17/18).

Das Norm-LV existiert bereits: `app.data.bkp_positionen.BKP_POSITIONEN`. Es ist
die EINE geschlossene Liste. Hier wird nichts Neues erfunden — es wird nur
zugeordnet.

Warum über den Titel und nicht über die Nummer: Planer nummerieren
Unterpositionen je Projekt anders. Im Referenzangebot heisst der Erzeuger
`242.1 Wärmeerzeuger Sole/Wasser-Wärmepumpe`, im Norm-LV ist `242.1` aber der
Gasheizkessel — die Wärmepumpe Sole/Wasser ist `242.3`. Wer nach Nummer
zuordnet, vertauscht Positionen. Auch die Gruppe taugt nur als schwacher
Hinweis: `Isolation Rohrleitungen` steht im Angebot unter 247, im Norm-LV unter
248.2.

Reihenfolge (Punkt 18): exakter Titel → Regel → (optional) LLM → manuell.
Was nicht eindeutig ist, bleibt `None` und wird im Review geprüft. Es wird nie
geraten und nie ein Schlüssel ausserhalb der Liste erzeugt.
"""
from __future__ import annotations

import re
from typing import Optional

from app.data.bkp_positionen import BKP_POSITIONEN, BKP_GRUPPEN

# Zuordnungsart (Punkt: mapping_method) — so bleibt später messbar, wie gut die
# automatische Zuordnung wirklich ist.
EXACT, RULE, LLM, MANUAL = "exact", "rule", "llm", "manual"

# ── Die geschlossene Liste ─────────────────────────────────────────────────
NORM_POSITIONS: list[dict] = [
    {"key": p["bkp_nr"], "bezeichnung": p["bezeichnung"],
     "gruppe": p["bkp_nr"].split(".")[0]}
    for p in BKP_POSITIONEN
]
NORM_KEYS: frozenset[str] = frozenset(p["key"] for p in NORM_POSITIONS)
NORM_BY_KEY: dict[str, dict] = {p["key"]: p for p in NORM_POSITIONS}


def ist_norm_position(key) -> bool:
    """Gehört der Schlüssel zur geschlossenen Liste? (Schutz gegen Erfindungen.)"""
    return bool(key) and key in NORM_KEYS


def norm_label(key: str) -> str:
    p = NORM_BY_KEY.get(key)
    return f"{key} {p['bezeichnung']}" if p else key


def as_frontend() -> dict:
    """Norm-LV für die manuelle Auswahl im Review."""
    return {
        "gruppen": BKP_GRUPPEN,
        "positionen": [
            {"key": p["key"], "gruppe": p["gruppe"], "bezeichnung": p["bezeichnung"],
             "gruppe_name": BKP_GRUPPEN.get(p["gruppe"], "")}
            for p in NORM_POSITIONS
        ],
    }


def candidates(
    title: str, bkp_group: str | None, section_path: str | None = None,
    limit: int = 6,
) -> list[dict]:
    """Wenige Ziele für einen unsicheren Fall, bevorzugt aus demselben BKP."""
    context_tokens = set(falte(f"{section_path or ''} {title}").split())
    ranked = []
    for position in NORM_POSITIONS:
        target_tokens = set(falte(position["bezeichnung"]).split())
        overlap = len(context_tokens & target_tokens)
        same_group = position["gruppe"] == str(bkp_group or "")
        score = (10 if same_group else 0) + overlap
        ranked.append((score, same_group, position["key"], position))
    ranked.sort(key=lambda item: (-item[0], -int(item[1]), item[2]))
    selected = [item[3] for item in ranked[:max(1, min(limit, 8))]]
    return [
        {"key": p["key"], "title": p["bezeichnung"], "group": p["gruppe"]}
        for p in selected
    ]


# ── Normalisierung ─────────────────────────────────────────────────────────

def falte(text: str) -> str:
    """Titel vergleichbar machen: klein, Umlaute gefaltet, Trennzeichen zu Space."""
    low = str(text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"),
                 ("é", "e"), ("è", "e"), ("à", "a")):
        low = low.replace(a, b)
    low = re.sub(r"[/\-–_,.:;()]+", " ", low)
    return re.sub(r"\s+", " ", low).strip()


_EXACT_INDEX = {falte(p["bezeichnung"]): p["key"] for p in NORM_POSITIONS}

# ── Deterministische Regeln ────────────────────────────────────────────────
# Eine Regel trifft, wenn ALLE `terms` im gefalteten Titel vorkommen, KEIN
# `nicht` vorkommt, und — falls `kontext` gesetzt ist — mindestens einer der
# Kontextbegriffe. Die BKP-Gruppe ist nur ein schwacher Bonus, nie ein Filter.
#
# `quelle` = Primärkreis/Erdsondensammler (BKP 241), `erzeugung` = BKP 242,
# `verteilung` = BKP 243.
_QUELLE = ("primaerkreis", "erdsondensammler", "sondensammler", "ews", "sole",
           "quellenkreis", "erdsonde", "erdsonden")
_ERZEUGUNG = ("waermeerzeugung", "erzeugung", "waermeerzeuger", "waermepumpe", "kessel")
_VERTEILUNG = ("verteilung", "heizungsverteilung", "pww", "heizgruppe", "heizkreis")

_RULES: list[dict] = [
    # ── Wärmequelle / Primärkreis (241) ──
    {"key": "241.10", "terms": ["expansion"], "kontext": _QUELLE},
    {"key": "241.11", "terms": ["rohrleitungen"], "kontext": _QUELLE,
     "nicht": ["isolation", "daemmung"]},
    {"key": "241.12", "terms": ["apparate"], "kontext": _QUELLE,
     "nicht": ["isolation", "daemmung"]},
    {"key": "241.13", "terms": ["montage"], "kontext": _QUELLE},
    {"key": "241.14", "terms": ["erdsonden"], "kontext": ("bohr", "zubehoer", "sonden"),
     "nicht": ["sammler", "rohrleitungen", "expansion", "apparate", "isolation",
               "montage"]},
    # ── Wärmeerzeugung (242) ──
    {"key": "242.3", "terms": ["sole"], "kontext": ("waermepumpe", "wp", "waermeerzeuger")},
    {"key": "242.4", "terms": ["luft"], "kontext": ("waermepumpe", "wp", "waermeerzeuger")},
    {"key": "242.5", "terms": ["wasser wasser"], "kontext": ("waermepumpe", "wp")},
    {"key": "242.1", "terms": ["gas"], "kontext": ("kessel", "heizkessel", "brennwert")},
    {"key": "242.2", "terms": ["oel"], "kontext": ("kessel", "heizkessel")},
    {"key": "242.6", "terms": ["expansion"], "kontext": _ERZEUGUNG},
    {"key": "242.7", "terms": ["montage"], "kontext": _ERZEUGUNG},
    # ── Wärmeverteilung (243) ──
    {"key": "243.1", "terms": ["rohrleitungen"], "kontext": _VERTEILUNG,
     "nicht": ["isolation", "daemmung", "primaerkreis", "ews"]},
    {"key": "243.2a", "terms": ["heizkoerper"], "kontext": ("zwei rohr", "2 rohr"),
     "nicht": ["bad", "stern"]},
    {"key": "243.2b", "terms": ["heizkoerper", "stern"]},
    {"key": "243.2c", "terms": ["badheizkoerper"]},
    {"key": "243.3a", "terms": ["flaechenheizung"], "nicht": ["decken", "strahlplatte"]},
    {"key": "243.3a", "terms": ["bodenheizung"], "nicht": ["isolation"]},
    {"key": "243.3b", "terms": ["deckenstrahlplatten"]},
    {"key": "243.4a", "terms": ["luftheizapparate"]},
    {"key": "243.4b", "terms": ["torluftschleier"]},
    {"key": "243.5", "terms": ["apparate"], "kontext": _VERTEILUNG,
     "nicht": ["isolation", "daemmung", "primaerkreis", "ews"]},
    {"key": "243.6", "terms": ["regelung"], "nicht": ["schrank"]},
    {"key": "243.7", "terms": ["waermemessung"]},
    {"key": "243.7", "terms": ["waermezaehler"]},
    {"key": "243.8", "terms": ["schaltschrank"]},
    {"key": "243.9", "terms": ["montage"], "kontext": _VERTEILUNG},
    {"key": "243.10", "terms": ["frischwasserstation"]},
    {"key": "243.10", "terms": ["frischwassermodul"]},
    {"key": "243.11", "terms": ["brauchwarmwasser"]},
    {"key": "243.11", "terms": ["warmwasserbereitung"]},
    {"key": "243.11", "terms": ["wassererwaermer"]},
    # ── Spezialanlagen (247) ──
    {"key": "247.5", "terms": ["mobile heizzentrale"]},
    {"key": "247.6", "terms": ["kaminanlage"]},
    # ── Dämmungen (248) — Achtung: im Angebot oft unter 247 geführt ──
    {"key": "248.1", "terms": ["bodenisolation"]},
    {"key": "248.2", "terms": ["isolation", "rohrleitungen"]},
    {"key": "248.2", "terms": ["rohrisolation"]},
    {"key": "248.3", "terms": ["isolation", "apparate"]},
    {"key": "248.3", "terms": ["armaturen isolation"]},
    # ── Diverses (249) ──
    {"key": "249.1", "terms": ["wartungsunterlagen"]},
    {"key": "249.2", "terms": ["anpassungen"]},
    {"key": "249.2", "terms": ["unvorhergesehenes"]},
    {"key": "249.3", "terms": ["demontage"]},
    {"key": "249.4", "terms": ["geruest"]},
    {"key": "249.5", "terms": ["ausfuehrungsplanung"]},
    {"key": "249.6", "terms": ["integraler test"]},
    {"key": "249.7", "terms": ["betriebsoptimierung"]},
    {"key": "249.8", "terms": ["avor"]},
    {"key": "249.8", "terms": ["montageorganisation"]},
]

# Sicherung: keine Regel darf auf einen Schlüssel zeigen, den das Norm-LV nicht
# kennt (fällt sonst erst im Betrieb auf).
_UNBEKANNT = sorted({r["key"] for r in _RULES} - NORM_KEYS)
assert not _UNBEKANNT, f"Regel zeigt auf unbekannte Norm-Position: {_UNBEKANNT}"


def _kontext_erfuellt(regel: dict, norm: str, bkp_group: Optional[str]) -> bool:
    """Erfüllt die Position den fachlichen Kontext einer Regel?

    Der Kontext steht meist im Titel («Montage Wärmeverteilung»). Er kann aber
    auch allein aus der Quellhierarchie kommen: «243.5 Transport, Montage» nennt
    die Verteilung nicht im Titel — die Haupt-BKP 243 IST der Kontext. Ohne das
    bliebe eine korrekt einsortierte Position ohne Zuordnung, nur weil der
    Unternehmer knapp formuliert hat.
    """
    kontext = regel.get("kontext")
    if not kontext:
        return False
    if any(begriff in norm for begriff in kontext):
        return True
    haupt = str(bkp_group or "").split(".")[0]
    return bool(haupt) and regel["key"].split(".")[0] == haupt


def match_title(title: str, bkp_group: Optional[str] = None) -> dict:
    """Titel → Norm-LV-Position, deterministisch.

    Returns:
        {"canonical_key", "mapping_method", "mapping_confidence", "mapping_reason"}
        canonical_key ist None, wenn keine eindeutige Zuordnung möglich ist.
    """
    norm = falte(title)
    if not norm:
        return _keine("Kein Titel vorhanden")

    # 1) Exakter Norm-Titel.
    key = _EXACT_INDEX.get(norm)
    if key:
        return {"canonical_key": key, "mapping_method": EXACT,
                "mapping_confidence": 1.0,
                "mapping_reason": "Titel entspricht exakt der Norm-LV-Position"}

    # 2) Regeln — beste Trefferstärke gewinnt, Gleichstand bleibt offen.
    treffer: list[tuple[float, str, str]] = []
    for regel in _RULES:
        if not all(t in norm for t in regel["terms"]):
            continue
        if any(t in norm for t in regel.get("nicht") or ()):
            continue
        kontext = regel.get("kontext")
        kontext_ok = _kontext_erfuellt(regel, norm, bkp_group)
        if kontext and not kontext_ok:
            continue
        score = len(regel["terms"]) + (1.0 if kontext_ok else 0.0)
        # Passende BKP-Gruppe ist nur ein schwacher Bonus (Nummern weichen ab).
        if bkp_group and regel["key"].startswith(bkp_group):
            score += 0.25
        begruendung = ", ".join(regel["terms"]) + (
            f" (+Kontext)" if kontext_ok else "")
        treffer.append((score, regel["key"], begruendung))

    if not treffer:
        return _keine("Kein Regeltreffer im Norm-LV")

    treffer.sort(key=lambda x: -x[0])
    beste = treffer[0]
    # Mehrere gleich starke Treffer auf VERSCHIEDENE Positionen → uneindeutig.
    gleichstand = {k for s, k, _ in treffer if s == beste[0]}
    if len(gleichstand) > 1:
        return _keine(f"Mehrdeutig: {' / '.join(sorted(gleichstand))}")

    confidence = 0.9 if beste[0] >= 2 else 0.75
    return {"canonical_key": beste[1], "mapping_method": RULE,
            "mapping_confidence": confidence,
            "mapping_reason": f"Regel: {beste[2]}"}


def _keine(grund: str) -> dict:
    return {"canonical_key": None, "mapping_method": None,
            "mapping_confidence": None, "mapping_reason": grund}


# ── Sammelpositionen ───────────────────────────────────────────────────────
# Eine Quellposition deckt oft mehrere Norm-LV-Positionen ab: «Speicher /
# Frischwasserstation» ist eine Zeile mit einem Betrag, im Norm-LV aber zwei
# Themen. Der Betrag darf dabei NIE aufgeteilt werden — er zählt einmal beim
# primären Schlüssel, die übrigen sind nur als enthalten vermerkt.
NOT_SPLIT = "not_split"
SINGLE = "single"

# Trennzeichen, die im Titel zwei Leistungen verbinden.
_VERBINDER = (" / ", " + ", " und ", " sowie ", ", ")


def ist_sammelposition(title: str) -> bool:
    """Nennt der Titel mehrere Leistungen in einer Zeile?"""
    text = f" {str(title or '').strip()} "
    return any(verbinder in text for verbinder in _VERBINDER)


def covered_keys(title: str, bkp_group: str | None = None) -> list[str]:
    """Alle Norm-LV-Positionen, die der Titel fachlich berührt.

    Anders als `match_title` sucht das keine EINE richtige Antwort, sondern den
    abgedeckten Umfang. Grundlage für `included_norm_keys`.
    """
    norm = falte(title)
    if not norm:
        return []
    treffer: list[tuple[float, str]] = []
    for regel in _RULES:
        if not all(t in norm for t in regel["terms"]):
            continue
        if any(t in norm for t in regel.get("nicht") or ()):
            continue
        kontext = regel.get("kontext")
        kontext_ok = _kontext_erfuellt(regel, norm, bkp_group)
        if kontext and not kontext_ok:
            continue
        score = len(regel["terms"]) + (1.0 if kontext_ok else 0.0)
        if bkp_group and regel["key"].startswith(str(bkp_group)):
            score += 0.25
        treffer.append((score, regel["key"]))
    # Exakter Norm-Titel zählt immer dazu.
    exakt = _EXACT_INDEX.get(norm)
    if exakt:
        treffer.append((99.0, exakt))
    treffer.sort(key=lambda item: -item[0])
    gesehen: list[str] = []
    for _, key in treffer:
        if key not in gesehen:
            gesehen.append(key)
    return gesehen


def pruefe_schluessel(keys) -> list[str]:
    """Nur Schlüssel der geschlossenen Liste, ohne Dubletten, in Reihenfolge."""
    out: list[str] = []
    for key in keys or []:
        if ist_norm_position(key) and key not in out:
            out.append(key)
    return out
