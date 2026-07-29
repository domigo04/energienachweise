"""Wärmepumpe — Heiz-(Erzeuger-)kreis und Quellen-(Sole-)kreis.

Reine Rechnung ohne Graph-Wissen; die Topologie liegt in `hydraulik.py`.
Berechnet wird ausschliesslich hier im Backend (goldene Regel), das Frontend
zeigt nur die Resultate an.

Grundlagen (PHYSIK.md):
- §1  `V' = Q / (c·ρ · ΔT)` mit `ΔT = VL − RL`; für Wasser `c·ρ = 1.163`.
- §13 Ein Layer mit Suffix `_vl` ist fachlich Vorlauf, `_rl` Rücklauf — das gilt
      ausdrücklich auch für Sole. Darum ist auch solesseitig `ΔT = VL − RL`:
      Sole-VL ist die (wärmere) Sole ZUR Wärmepumpe, Sole-RL die (kältere) Sole
      zurück zur Quelle. Ein negatives ΔT ist damit ein Eingabefehler und wird
      gemeldet statt stillschweigend umgedreht.

Energiebilanz der Wärmepumpe:
    Q_heat  = abgegebene Heizleistung
    P_el    = elektrische Leistungsaufnahme
    Q_source = Q_heat − P_el          (quellenseitig entzogene Leistung)
Mit COP statt P_el: `P_el = Q_heat / COP` → `Q_source = Q_heat · (1 − 1/COP)`.
Ohne COP UND ohne P_el ist die Quellenleistung NICHT berechenbar. Sie wird dann
bewusst nicht gesetzt (nie Q_source = Q_heat) — Physik vor Bequemlichkeit.
"""
from typing import Optional

from app.data.generator_types import HEAT_PUMP_TYPES

# c·ρ Wasser in kWh/(m³·K) — PHYSIK §1.
CE_WASSER = 1.163

# Erzeugertypen mit Quellenseite. Andere Erzeuger (Gas, Öl, Holz …) haben keine
# und werden deshalb auch nicht nach COP oder Solewerten gefragt.
WP_TYPEN = tuple(sorted(HEAT_PUMP_TYPES))


def _zahl(x) -> Optional[float]:
    """Robust zu float parsen — Editor-Daten sind oft Strings."""
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def ist_waermepumpe(d: dict) -> bool:
    """Wärmepumpe laut Erzeugertyp — oder erkennbar an WP-eigenen Angaben."""
    if str(d.get("generator_type") or "") in WP_TYPEN:
        return True
    return any(_zahl(d.get(k)) is not None for k in ("cop", "p_el_kw", "sole_vl", "sole_rl"))


def elektrische_leistung(q_heat: Optional[float], cop: Optional[float],
                         p_el: Optional[float]) -> tuple:
    """(P_el, Quelle) — die explizite Eingabe hat Vorrang vor dem COP.

    Damit entstehen keine zwei konkurrierenden Wahrheiten: ist P_el eingetragen,
    gilt P_el; sonst wird es aus Q_heat und COP hergeleitet.
    """
    if p_el is not None and p_el > 0:
        return p_el, "eingabe"
    if cop and cop > 0 and q_heat:
        return q_heat / cop, "cop"
    return None, None


def volumenstrom(q_kw: Optional[float], dt: Optional[float], ce: float = CE_WASSER) -> Optional[float]:
    """PHYSIK §1 — `V' = Q / (c·ρ · ΔT)`. Ohne gültiges ΔT gibt es keinen Wert."""
    if not q_kw or q_kw <= 0 or dt is None or dt <= 0 or ce <= 0:
        return None
    return q_kw / (ce * dt)


def _rund(x: Optional[float], n: int) -> Optional[float]:
    return round(x, n) if x is not None else None


def berechne_waermepumpe(d: dict, hat_quellenseite: bool = False) -> dict:
    """Kennwerte einer Wärmepumpe aus ihren Eigenschaften.

    `hat_quellenseite` sagt, ob überhaupt eine Quellenseite erwartet wird — ein
    Gaskessel soll nicht nach dem COP gefragt werden.
    """
    q_heat = _zahl(d.get("leistung_kw"))
    vl = _zahl(d.get("vl_temp"))
    rl = _zahl(d.get("rl_temp"))
    cop = _zahl(d.get("cop"))
    p_el_eingabe = _zahl(d.get("p_el_kw"))
    sole_vl = _zahl(d.get("sole_vl"))
    sole_rl = _zahl(d.get("sole_rl"))
    # Optionale Stoffwertangabe der Sole (c·ρ in kWh/(m³·K)). Es gibt im Projekt
    # bewusst KEINE erfundene Glykol-Stoffwerttabelle: entweder der Planer trägt
    # den Wert seines Gemisches ein, oder es wird sichtbar mit Wasser gerechnet.
    sole_ce_eingabe = _zahl(d.get("sole_ce"))

    warnungen = []

    # ── Heizseite ──
    dt_heiz = vl - rl if vl is not None and rl is not None else None
    if dt_heiz is not None and dt_heiz <= 0:
        warnungen.append(f"Heizungs-Vorlauf {vl} °C ist nicht höher als der Rücklauf {rl} °C")
    if q_heat and q_heat > 0 and dt_heiz is None:
        warnungen.append("Heizkreis nicht berechenbar: Vorlauf- oder Rücklauftemperatur der Wärmepumpe fehlt")
    v_heiz = volumenstrom(q_heat, dt_heiz)

    # ── Quellenseite ──
    if cop is not None and cop <= 1:
        warnungen.append(f"COP {cop} ist nicht grösser als 1 — Wärmepumpe liefert damit keine Nutzenergie")
    p_el, p_el_quelle = elektrische_leistung(q_heat, cop, p_el_eingabe)
    q_source = None
    if q_heat is not None and p_el is not None:
        q_source = q_heat - p_el
        if q_source <= 0:
            warnungen.append(
                f"Quellenleistung {round(q_source, 2)} kW ist nicht positiv — "
                f"elektrische Leistung {round(p_el, 2)} kW ist zu hoch für {q_heat} kW Heizleistung"
            )
            q_source = None
    elif hat_quellenseite and q_heat:
        warnungen.append(
            "Quellenleistung nicht berechenbar: COP oder elektrische Leistungsaufnahme "
            "der Wärmepumpe fehlt."
        )

    dt_sole = sole_vl - sole_rl if sole_vl is not None and sole_rl is not None else None
    if dt_sole is not None and dt_sole <= 0:
        warnungen.append(
            f"Sole-ΔT {round(dt_sole, 2)} K ist nicht positiv — Sole-VL ({sole_vl} °C) ist die "
            f"wärmere Sole zur Wärmepumpe, Sole-RL ({sole_rl} °C) die kältere zurück zur Quelle"
        )
    if hat_quellenseite and q_source and dt_sole is None:
        warnungen.append("Solevolumenstrom nicht berechenbar: Sole-Vorlauf oder Sole-Rücklauf fehlt")

    ce = sole_ce_eingabe if sole_ce_eingabe and sole_ce_eingabe > 0 else CE_WASSER
    ce_quelle = "eingabe" if ce != CE_WASSER else "wasser"
    v_sole = volumenstrom(q_source, dt_sole, ce)
    if v_sole is not None and ce_quelle == "wasser":
        warnungen.append(
            f"Solevolumenstrom mit der Wasserkonstante {CE_WASSER} kWh/(m³·K) gerechnet — für das "
            f"Glykolgemisch liegt keine Stoffwertlogik vor. c·ρ der Sole bei der Wärmepumpe "
            f"eintragen, sobald bekannt."
        )

    return {
        "q_heat_kw": _rund(q_heat, 2),
        "p_el_kw": _rund(p_el, 2),
        "p_el_quelle": p_el_quelle,
        "cop": _rund(cop, 2),
        "q_source_kw": _rund(q_source, 2),

        "heating_vl": vl,
        "heating_rl": rl,
        "heating_dt": _rund(dt_heiz, 2),
        "heating_flow_m3h": _rund(v_heiz, 4),

        "source_vl": sole_vl,
        "source_rl": sole_rl,
        "source_dt": _rund(dt_sole, 2),
        "source_flow_m3h": _rund(v_sole, 4),
        "source_ce": ce if v_sole is not None else None,
        "source_ce_quelle": ce_quelle if v_sole is not None else None,

        "ist_waermepumpe": ist_waermepumpe(d),
        "hat_hydraulischen_quellenkreis": hat_quellenseite,
        "warnings": warnungen,
    }
