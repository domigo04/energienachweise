"""P1 — ProjectContext: die eine Projektwahrheit zusammensetzen.

Führt je Parameter die vier Quellen aus §6 zu einem effektiven Wert zusammen:

    schema_value    live aus dem Anlagenschema (Quelle B, nie gespeichert)
    project_value   zentrale Grunddaten in HcProjectBaseData (Quelle A)
    external_value  Ergänzung / externe Menge in HcProjectParameter (Quelle C)
    manual_override ausdrückliche Übersteuerung durch den Planer (gewinnt)
        ↓
    effective_value + source + confidence + status

Die PARAMETER-Registry ist der EINZIGE Ort mit Sonderlogik je Parameter
(Herkunft, Typ, Kombinationsregel). Dadurch bleibt der Rest generisch (Regel 1).
Der so entstehende Datensatz ist das COST_INPUT (§24), das die Kostenschätzung
liest, statt Werte erneut abzufragen.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.calculations.schema_mengen import mengen_aus_schema


# ── Vier Zustände eines Parameters (§9) ─────────────────────────────────────
STATUS_BEKANNT = "bekannt"                      # ausdrücklich gesetzt (Projekt/Ergänzung/Override)
STATUS_ERKANNT = "erkannt"                       # automatisch aus dem Schema
STATUS_ERGAENZUNG = "ergaenzung_erforderlich"    # Schema liefert Teil, Gebäude evtl. mehr (§3)
STATUS_UNBEKANNT = "unbekannt"                    # nirgends vorhanden

# Kombinationsregeln
COMBINE_OVERRIDE = "override"                     # Vorrang: override > extern > projekt > schema
COMBINE_SUM = "sum_schema_external"              # Schema + Ergänzung addieren (z. B. Wärmezähler)


@dataclass(frozen=True)
class ParamDef:
    key: str
    label: str
    kategorie: str                  # "grunddaten" | "erzeugung" | "verteilung" | "messung"
    typ: str = "zahl"               # "zahl" | "ganzzahl" | "text"
    einheit: Optional[str] = None
    project_field: Optional[str] = None   # Attribut auf HcProjectBaseData (Quelle A)
    schema_key: Optional[str] = None      # Schlüssel in mengen_aus_schema (Quelle B)
    combine: str = COMBINE_OVERRIDE
    ergaenzbar: bool = False        # kann Gebäude-Ergänzungen haben (§3) → KS-Check fragt nach


# Reihenfolge = Anzeige-Reihenfolge. Kategorien lehnen sich an §19/§23 an.
PARAMETER: list[ParamDef] = [
    # Grunddaten (Quelle A)
    ParamDef("ebf_m2", "EBF", "grunddaten", "zahl", "m²", project_field="ebf_m2"),
    ParamDef("anzahl_nutzungseinheiten", "Nutzungseinheiten", "grunddaten", "ganzzahl",
             project_field="anzahl_nutzungseinheiten"),
    ParamDef("nutzung", "Nutzung", "grunddaten", "text", project_field="gebaeudekategorie"),
    ParamDef("projektart", "Projektart", "grunddaten", "text", project_field="projektart"),
    ParamDef("region", "Region", "grunddaten", "text", project_field="region"),
    ParamDef("zertifizierung", "Zertifizierung", "grunddaten", "text", project_field="zertifizierung"),
    # Wärmeerzeugung (Quelle B + Ergänzung)
    ParamDef("leistung_kw", "Heizleistung", "erzeugung", "zahl", "kW", schema_key="leistung_kw"),
    ParamDef("anzahl_erzeuger", "Wärmeerzeuger", "erzeugung", "ganzzahl", schema_key="anzahl_erzeuger"),
    ParamDef("anzahl_erdsonden", "Erdsonden", "erzeugung", "ganzzahl", schema_key="anzahl_erdsonden"),
    ParamDef("bohrmeter", "Bohrmeter", "erzeugung", "zahl", "m"),                 # nur Ergänzung
    ParamDef("anzahl_speicher", "Speicher", "erzeugung", "ganzzahl", schema_key="anzahl_speicher"),
    ParamDef("speichervolumen_l", "Speichervolumen", "erzeugung", "zahl", "l"),   # nur Ergänzung
    # Wärmeverteilung (Quelle B + Ergänzung)
    ParamDef("anzahl_heizgruppen", "Heizgruppen", "verteilung", "ganzzahl", schema_key="anzahl_heizgruppen"),
    ParamDef("anzahl_verteiler", "Verteiler", "verteilung", "ganzzahl", schema_key="anzahl_verteiler"),
    ParamDef("anzahl_pumpen", "Pumpen", "verteilung", "ganzzahl", schema_key="anzahl_pumpen"),
    ParamDef("anzahl_ventile_2weg", "2-Weg-Ventile", "verteilung", "ganzzahl", schema_key="anzahl_ventile_2weg"),
    ParamDef("anzahl_ventile_3weg", "3-Weg-Ventile", "verteilung", "ganzzahl", schema_key="anzahl_ventile_3weg"),
    ParamDef("rohrmeter", "Rohrmeter", "verteilung", "zahl", "m"),                # nur Ergänzung
    # Wärmemessung (Quelle B + Ergänzung, additiv — der §3-Sonderfall)
    ParamDef("anzahl_waermezaehler", "Wärmezähler", "messung", "ganzzahl",
             schema_key="anzahl_waermezaehler", combine=COMBINE_SUM, ergaenzbar=True),
]

PARAMETER_BY_KEY: dict[str, ParamDef] = {p.key: p for p in PARAMETER}


def coerce(value, typ: str):
    """Text/Rohwert in den Zieltyp der Registry wandeln. None bleibt None."""
    if value is None or value == "":
        return None
    try:
        if typ == "ganzzahl":
            return int(round(float(str(value).replace(",", "."))))
        if typ == "zahl":
            return float(str(value).replace(",", "."))
        return str(value)
    except (TypeError, ValueError):
        return None


def _kombiniere(pd: ParamDef, schema_value, project_value, external_value, manual_override):
    """Effektiven Wert + Quelle aus den vier Kandidaten bestimmen."""
    if pd.combine == COMBINE_SUM:
        if manual_override is not None:
            return manual_override, "manuell"
        teile = [v for v in (schema_value, external_value) if v is not None]
        if not teile:
            return None, None
        if schema_value is not None and external_value is not None:
            return sum(teile), "schema+extern"
        return (schema_value, "schema") if schema_value is not None else (external_value, "extern")
    # COMBINE_OVERRIDE — Vorrang
    for kandidat, quelle in (
        (manual_override, "manuell"),
        (external_value, "extern"),
        (project_value, "projekt"),
        (schema_value, "schema"),
    ):
        if kandidat is not None:
            return kandidat, quelle
    return None, None


def _status(pd: ParamDef, source, external_value, manual_override) -> str:
    if manual_override is not None:
        return STATUS_BEKANNT
    if source is None:
        return STATUS_UNBEKANNT
    if pd.ergaenzbar and external_value is None:
        # Schema hat etwas erkannt, aber Gebäude-Ergänzungen sind noch offen (§3/§7)
        return STATUS_ERGAENZUNG
    if source == "schema":
        return STATUS_ERKANNT
    return STATUS_BEKANNT


def build_context(base_data, graph_json, parameter_rows=None) -> dict:
    """Setzt die eine Projektwahrheit zusammen (§24, „Projekt-Compiler").

    base_data       HcProjectBaseData oder None (Quelle A)
    graph_json      Schema-Graph als str/dict (Quelle B, live)
    parameter_rows  Iterable von HcProjectParameter (Quelle C + Override)

    Rückgabe: dict mit `parameter` (Liste je Parameter mit allen Quellen +
    effective_value + source + status) und einer `zusammenfassung` (§26).
    """
    schema_mengen = mengen_aus_schema(graph_json)
    rows_by_key = {r.param_key: r for r in (parameter_rows or [])}

    parameter = []
    status_zaehler = {STATUS_BEKANNT: 0, STATUS_ERKANNT: 0, STATUS_ERGAENZUNG: 0, STATUS_UNBEKANNT: 0}

    for pd in PARAMETER:
        schema_value = coerce(schema_mengen.get(pd.schema_key), pd.typ) if pd.schema_key else None
        project_value = (
            coerce(getattr(base_data, pd.project_field, None), pd.typ)
            if (pd.project_field and base_data is not None) else None
        )
        row = rows_by_key.get(pd.key)
        external_value = coerce(getattr(row, "external_value", None), pd.typ) if row else None
        manual_override = coerce(getattr(row, "manual_override", None), pd.typ) if row else None

        effective, source = _kombiniere(pd, schema_value, project_value, external_value, manual_override)
        status = _status(pd, source, external_value, manual_override)
        status_zaehler[status] += 1

        parameter.append({
            "key": pd.key,
            "label": pd.label,
            "kategorie": pd.kategorie,
            "einheit": pd.einheit,
            "typ": pd.typ,
            "ergaenzbar": pd.ergaenzbar,
            "schema_value": schema_value,
            "project_value": project_value,
            "external_value": external_value,
            "manual_override": manual_override,
            "effective_value": effective,
            "source": source,
            "status": status,
            "confidence": getattr(row, "confidence", None) if row else None,
            "quelle_notiz": getattr(row, "quelle_notiz", None) if row else None,
            "updated_by_name": getattr(row, "updated_by_name", None) if row else None,
        })

    return {
        "parameter": parameter,
        "zusammenfassung": {
            "anzahl_parameter": len(parameter),
            "bekannt": status_zaehler[STATUS_BEKANNT],
            "erkannt": status_zaehler[STATUS_ERKANNT],
            "ergaenzung_erforderlich": status_zaehler[STATUS_ERGAENZUNG],
            "unbekannt": status_zaehler[STATUS_UNBEKANNT],
        },
    }


def effective_map(context: dict) -> dict:
    """Schlanke {key: effective_value}-Sicht — der Kern des COST_INPUT."""
    return {p["key"]: p["effective_value"] for p in context["parameter"]}


def context_fuer_projekt(db, project, tenant_id: int) -> dict:
    """ProjectContext für ein Projekt aus der DB zusammensetzen.

    Zentral, damit „welches Schema gilt" und „welche Ergänzungen gibt es" nur an
    EINER Stelle beantwortet werden. Ein Projekt kann mehrere Schemas haben; es
    gilt das zuletzt bearbeitete. Kein Schema → leerer Graph (nichts bekannt)."""
    # Lokaler Import: vermeidet einen Modul-Import-Zyklus (models ↔ context) und
    # hält die reine Kombinationslogik oben frei von DB-Abhängigkeiten.
    from app.models.heizungscockpit import HcProjectParameter, HcSchema

    schema = (
        db.query(HcSchema)
        .filter(HcSchema.project_id == project.id, HcSchema.tenant_id == tenant_id)
        .order_by(HcSchema.updated_at.desc(), HcSchema.id.desc())
        .first()
    )
    graph = schema.graph_json if schema else "{}"
    rows = (
        db.query(HcProjectParameter)
        .filter(
            HcProjectParameter.project_id == project.id,
            HcProjectParameter.tenant_id == tenant_id,
        )
        .all()
    )
    return build_context(project.base_data, graph, rows)


# Abbildung ProjectContext → Eingabefelder der Grobkostenschätzung (SchaetzungIn).
# Cost-spezifisch, aber bewusst hier zentral, damit die Kostenschätzung Werte NUR
# aus dem Context bezieht und nirgends neu abfragt (§2, §24).
_VORBELEGUNG_MAP = {
    # SchaetzungIn-Feld : ProjectContext-Parameter
    "ebf_m2": "ebf_m2",
    "leistung_kw": "leistung_kw",
    "nutzung": "nutzung",
    "projektart": "projektart",
    "anzahl_ne": "anzahl_nutzungseinheiten",
    "zertifizierung": "zertifizierung",
    "bohrmeter": "bohrmeter",
    "rohrmeter": "rohrmeter",
}


def vorbelegung_aus_context(context: dict) -> dict:
    """Bekannte Projektwerte in die Feldnamen der Kostenschätzung übersetzen.
    Nur gesetzte Werte werden zurückgegeben — Unbekanntes bleibt offen (§25)."""
    eff = effective_map(context)
    return {feld: eff[key] for feld, key in _VORBELEGUNG_MAP.items() if eff.get(key) is not None}
