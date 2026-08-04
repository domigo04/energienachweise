"""Druckverlust, Füllinhalt und Pumpenbetriebspunkt des Erdsonden-Solekreises.

Quelle: `Erdsonden.xlsx`, Blatt `Druckverlustberechnung_erdsonde` (Version 1.0 db)
sowie Blatt `glykol_Erdsonden` für die Rohrinhalte und `infoblatt3_Normsonden`
für die Innendurchmesser der Normsonden.

Der Solekreis wird in drei Teilstücke zerlegt, weil sie unterschiedliche
Rohrdurchmesser und damit unterschiedliche Strömungszustände haben:

1. Erdwärmesonde (Bohrtiefe, Sondenrohr)
2. Zuleitung Erdsonde bis Verteiler
3. Zuleitung Verteiler bis Wärmepumpe

Fachliche Vorgabe: In der Erdwärmesonde muss die Strömung mindestens
`turbulent glatt` sein, damit der Wärmeübergang zum Erdreich stimmt. In den
Zuleitungen ist das nicht zwingend.

Alle Stoffwerte, Datenblattangaben und Geometrien sind sichtbare Eingaben. Das
Modul rechnet nur; es ersetzt keine Prüfung durch den Fachplaner.
"""

import math
from typing import Optional

from app.calculations.einzel import _schritt, _z


# Innendurchmesser der Normsonden/PE-Rohre (SDR 11), Blatt `infoblatt3_Normsonden`.
INNENDURCHMESSER_MM = {25: 20.4, 32: 26.2, 40: 32.6, 50: 40.8, 63: 51.4}

# Rohrrauheit PE, Vorgabe der Vorlage.
RAUHEIT_MM_STD = 0.015

# Umrechnung Pa → mWs wie in der Vorlage.
PA_JE_MWS = 0.000102

# Zeta-Wert und Druckverlust der Wärmepumpe: Vorgabewerte der Vorlage.
ZETA_VERTEILER_STD = 12.0

# Stoffwerte Ethylenglykol/Wasser. Die 28-%-Zeile stammt direkt aus der Vorlage,
# die übrigen Zeilen sind Richtwerte bei 0 °C mittlerer Soletemperatur und vom
# Fachplaner gegen das Produktdatenblatt zu prüfen. Alle Werte sind im Bauteil
# überschreibbar.
WAERMETRAEGER = {
    25: {"dichte_kg_m3": 1043.0, "cp_kj_kgk": 3.79, "viskositaet_mm2_s": 3.1,
         "quelle": "Richtwert Ethylenglykol 0 °C"},
    28: {"dichte_kg_m3": 1050.0, "cp_kj_kgk": 3.72, "viskositaet_mm2_s": 4.15,
         "quelle": "Erdsonden.xlsx (ρ, ν)"},
    30: {"dichte_kg_m3": 1052.0, "cp_kj_kgk": 3.68, "viskositaet_mm2_s": 3.8,
         "quelle": "Richtwert Ethylenglykol 0 °C"},
    35: {"dichte_kg_m3": 1062.0, "cp_kj_kgk": 3.57, "viskositaet_mm2_s": 4.6,
         "quelle": "Richtwert Ethylenglykol 0 °C"},
    40: {"dichte_kg_m3": 1071.0, "cp_kj_kgk": 3.46, "viskositaet_mm2_s": 5.6,
         "quelle": "Richtwert Ethylenglykol 0 °C"},
}

# Dichte des Glykolkonzentrats (Antifrogen N) aus Blatt `glykol_Erdsonden`.
KONZENTRAT_DICHTE_KG_L = 1.14


def waermetraeger_vorgabe(konzentration_pct: float) -> dict:
    """Nächstgelegene Stoffwertzeile zur gewünschten Konzentration."""
    key = min(WAERMETRAEGER, key=lambda k: abs(k - float(konzentration_pct)))
    return {"konzentration_pct": key, **WAERMETRAEGER[key]}


def _stroemungsart(reynolds: float, dk: float) -> str:
    """Strömungsart nach der Vorlage — bewusst über die Reynoldszahl.

    Die Vorlage prüft in den Zuleitungsspalten versehentlich `dk` statt `Re` und
    meldet dort immer «Turbulent glatt». Hier wird durchgehend `Re` geprüft, wie
    es die Lambda-Formel der Vorlage ohnehin schon tut.
    """
    if reynolds < 2340:
        return "Laminar"
    if reynolds < 65 * dk:
        return "Turbulent glatt"
    if reynolds > 1300 * dk:
        return "Turbulent rauh"
    return "Übergangsgebiet"


def _lambda(reynolds: float, dk: float) -> Optional[float]:
    """Rohrreibungszahl nach der Vorlage."""
    if reynolds < 2340:
        return 64 / reynolds                                     # Hagen-Poiseuille
    if reynolds < 65 * dk:
        if reynolds < 100_000:
            return 0.3164 / reynolds ** 0.25                     # Blasius
        return 0.0032 + 0.221 / reynolds ** 0.237                # Nikuradse
    if reynolds > 1300 * dk:
        return 1 / (2 * math.log10(3.715 * dk)) ** 2             # Prandtl-Kármán
    return None                                                  # Übergangsgebiet


def _querschnitt_m2(innen_d_mm: float) -> float:
    d = innen_d_mm / 1000
    return math.pi * d * d / 4


def _teilstueck(
    name: str,
    *,
    volumenstrom_m3_s: float,
    innen_d_mm: float,
    laenge_m: float,
    straenge: int,
    dichte_kg_m3: float,
    viskositaet_mm2_s: float,
    rauheit_mm: float,
) -> dict:
    """Ein Rohrabschnitt: Geschwindigkeit, Reynolds, Lambda, Druckverlust.

    `straenge` ist die Zahl der durchströmten Rohrlängen je Meter Trassee:
    Sonde hin und zurück = 2, Zuleitung Vor- und Rücklauf = 2.
    """
    d_m = innen_d_mm / 1000
    flaeche = _querschnitt_m2(innen_d_mm)
    w = volumenstrom_m3_s / flaeche
    ny = viskositaet_mm2_s / 1_000_000
    reynolds = w * d_m / ny
    dk = innen_d_mm / rauheit_mm
    art = _stroemungsart(reynolds, dk)
    lam = _lambda(reynolds, dk)
    p_dyn = dichte_kg_m3 * w * w / 2
    dp_pa = lam * p_dyn / d_m * laenge_m * straenge if lam is not None else None
    return {
        "name": name,
        "innen_d_mm": round(innen_d_mm, 2),
        "laenge_m": round(laenge_m, 2),
        "straenge": straenge,
        "volumenstrom_m3_s": volumenstrom_m3_s,
        "geschwindigkeit_m_s": round(w, 4),
        "reynolds": round(reynolds),
        "dk": round(dk),
        "stroemungsart": art,
        "lambda": round(lam, 5) if lam is not None else None,
        "dynamischer_druck_pa": round(p_dyn, 1),
        "druckverlust_pa": round(dp_pa, 1) if dp_pa is not None else None,
        "druckverlust_mws": round(dp_pa * PA_JE_MWS, 3) if dp_pa is not None else None,
    }


def sole_druckverlust(
    *,
    sonden_anzahl: int,
    sonden_tiefe_m: float,
    sonden_innen_d_mm: float,
    sonden_straenge: int = 4,
    zuleitung_verteiler_m: float = 0.0,
    zuleitung_verteiler_innen_d_mm: Optional[float] = None,
    zuleitung_wp_m: float = 0.0,
    zuleitung_wp_innen_d_mm: Optional[float] = None,
    zusatzinhalt_l: float = 0.0,
    volumenstrom_m3_h: Optional[float] = None,
    quellenleistung_kw: Optional[float] = None,
    sole_dt_k: Optional[float] = None,
    konzentration_pct: float = 30.0,
    dichte_kg_m3: float = 1050.0,
    cp_kj_kgk: float = 3.68,
    viskositaet_mm2_s: float = 4.15,
    rauheit_mm: float = RAUHEIT_MM_STD,
    druckverlust_wp_mws: float = 0.0,
    verteiler_anzahl: float = 1.0,
    zeta_verteiler: float = ZETA_VERTEILER_STD,
) -> dict:
    """Füllinhalt, Druckverlust und Pumpenbetriebspunkt des Solekreises.

    `sonden_straenge` ist die Zahl der Rohrstränge je Sondenmeter:
    Duplex (2 U-Rohre) = 4, Einfach-U = 2.
    """
    anzahl = int(sonden_anzahl)
    if anzahl <= 0:
        raise ValueError("Sondenanzahl muss > 0 sein")
    if sonden_straenge not in (2, 4):
        raise ValueError("Sondenstränge müssen 2 (Einfach-U) oder 4 (Duplex) sein")
    tiefe = float(sonden_tiefe_m)
    if tiefe <= 0:
        raise ValueError("Sondentiefe muss > 0 sein")
    d_sonde = float(sonden_innen_d_mm)
    if d_sonde <= 0:
        raise ValueError("Innendurchmesser der Sonde muss > 0 sein")
    rauheit = float(rauheit_mm)
    if rauheit <= 0:
        raise ValueError("Rohrrauheit muss > 0 sein")
    dichte = float(dichte_kg_m3)
    viskositaet = float(viskositaet_mm2_s)
    cp = float(cp_kj_kgk)
    if dichte <= 0 or viskositaet <= 0 or cp <= 0:
        raise ValueError("Dichte, Zähigkeit und Wärmekapazität müssen > 0 sein")

    l_verteiler = max(0.0, float(zuleitung_verteiler_m or 0))
    l_wp = max(0.0, float(zuleitung_wp_m or 0))
    d_verteiler = float(zuleitung_verteiler_innen_d_mm or 0) or d_sonde
    d_wp = float(zuleitung_wp_innen_d_mm or 0) or d_verteiler

    warnungen = []
    rechenweg = []

    # ── Füllinhalt ──────────────────────────────────────────────────────────
    inhalt_je_m_sonde = _querschnitt_m2(d_sonde) * 1000 * sonden_straenge
    inhalt_sonden = inhalt_je_m_sonde * tiefe * anzahl
    inhalt_verteiler = _querschnitt_m2(d_verteiler) * 1000 * l_verteiler * 2
    inhalt_wp = _querschnitt_m2(d_wp) * 1000 * l_wp * 2
    zusatz = float(zusatzinhalt_l or 0)
    inhalt_total = inhalt_sonden + inhalt_verteiler + inhalt_wp + zusatz

    rechenweg.append(_schritt(
        "V_Sonde", "V = π/4 · d² · Stränge · Tiefe · Anzahl",
        f"π/4 · {_z(d_sonde, 1)}² · {sonden_straenge} · {_z(tiefe, 1)} · {anzahl}",
        f"{inhalt_sonden:.1f} l"))
    if l_verteiler:
        rechenweg.append(_schritt(
            "V_ZulVert", "V = π/4 · d² · L · 2 (Vor- und Rücklauf)",
            f"π/4 · {_z(d_verteiler, 1)}² · {_z(l_verteiler, 1)} · 2",
            f"{inhalt_verteiler:.1f} l"))
    if l_wp:
        rechenweg.append(_schritt(
            "V_ZulWP", "V = π/4 · d² · L · 2 (Vor- und Rücklauf)",
            f"π/4 · {_z(d_wp, 1)}² · {_z(l_wp, 1)} · 2",
            f"{inhalt_wp:.1f} l"))
    rechenweg.append(_schritt(
        "V_total", "V = V_Sonde + V_ZulVert + V_ZulWP + V_WP/Expansion",
        f"{inhalt_sonden:.1f} + {inhalt_verteiler:.1f} + {inhalt_wp:.1f} + {_z(zusatz, 1)}",
        f"{inhalt_total:.1f} l"))

    # ── Wärmeträger ─────────────────────────────────────────────────────────
    # Formel der Vorlage (B25). Sie mischt Volumen und Masse; deshalb wird die
    # rein volumetrische Lesart als Kontrollwert danebengestellt.
    konz = float(konzentration_pct)
    traeger_excel_l = inhalt_total * 1000 / 100 * konz / dichte
    traeger_excel_kg = traeger_excel_l * dichte / 1000
    konzentrat_vol_l = inhalt_total * konz / 100
    konzentrat_kg = konzentrat_vol_l * KONZENTRAT_DICHTE_KG_L
    rechenweg.append(_schritt(
        "V_Glykol", "V = V_total · 1000 / 100 · Konzentration / ρ  (Vorlage)",
        f"{inhalt_total:.1f} · 1000 / 100 · {_z(konz, 1)} / {_z(dichte, 1)}",
        f"{traeger_excel_l:.1f} l"))
    rechenweg.append(_schritt(
        "V_Konz", "V = V_total · Konzentration / 100  (volumetrische Kontrolle)",
        f"{inhalt_total:.1f} · {_z(konz, 1)} / 100",
        f"{konzentrat_vol_l:.1f} l"))
    if konzentrat_vol_l > 0 and abs(traeger_excel_l - konzentrat_vol_l) / konzentrat_vol_l > 0.05:
        warnungen.append(
            f"Vorlagenformel ergibt {traeger_excel_l:.0f} l Konzentrat, die volumetrische "
            f"Kontrolle {konzentrat_vol_l:.0f} l. Bestellmenge fachlich festlegen."
        )

    # ── Volumenstrom ────────────────────────────────────────────────────────
    v_h = float(volumenstrom_m3_h) if volumenstrom_m3_h not in (None, "") else None
    volumenstrom_quelle = "Datenblatt Wärmepumpe"
    if v_h is None:
        q0 = float(quellenleistung_kw) if quellenleistung_kw not in (None, "") else None
        dt = float(sole_dt_k) if sole_dt_k not in (None, "") else None
        if q0 and dt and q0 > 0 and dt > 0:
            v_h = q0 * 3600 / (cp * dt * dichte)
            volumenstrom_quelle = "aus Quellenleistung und Sole-ΔT"
            rechenweg.append(_schritt(
                "V̇", "V̇ = Q0 · 3600 / (c · ΔT · ρ)",
                f"{_z(q0)} · 3600 / ({_z(cp, 3)} · {_z(dt, 1)} · {_z(dichte, 1)})",
                f"{v_h:.3f} m³/h"))
        else:
            volumenstrom_quelle = None
    if v_h is None or v_h <= 0:
        warnungen.append(
            "Solevolumenstrom fehlt: Fördermenge aus dem Wärmepumpen-Datenblatt "
            "eintragen oder Quellenleistung und Sole-ΔT ergänzen."
        )
        return {
            "sonden_anzahl": anzahl, "sonden_tiefe_m": round(tiefe, 1),
            "inhalt_sonden_l": round(inhalt_sonden, 1),
            "inhalt_zuleitung_verteiler_l": round(inhalt_verteiler, 1),
            "inhalt_zuleitung_wp_l": round(inhalt_wp, 1),
            "zusatzinhalt_l": round(zusatz, 1),
            "inhalt_total_l": round(inhalt_total, 1),
            "inhalt_je_m_sonde_l": round(inhalt_je_m_sonde, 4),
            "konzentration_pct": konz,
            "waermetraeger_l": round(traeger_excel_l, 1),
            "waermetraeger_kg": round(traeger_excel_kg, 1),
            "konzentrat_volumetrisch_l": round(konzentrat_vol_l, 1),
            "konzentrat_volumetrisch_kg": round(konzentrat_kg, 1),
            "dichte_kg_m3": dichte, "cp_kj_kgk": cp, "viskositaet_mm2_s": viskositaet,
            "teilstuecke": [], "rechenweg": rechenweg, "warnungen": warnungen,
        }

    v_s = v_h / 3600

    # ── Teilstücke ──────────────────────────────────────────────────────────
    # Jede Sonde hat `Stränge/2` parallele Kreise; der Verteiler teilt den
    # Gesamtstrom auf alle Kreise auf.
    kreise = anzahl * (sonden_straenge // 2)
    teilstuecke = [_teilstueck(
        "Erdwärmesonde", volumenstrom_m3_s=v_s / kreise, innen_d_mm=d_sonde,
        laenge_m=tiefe, straenge=2, dichte_kg_m3=dichte,
        viskositaet_mm2_s=viskositaet, rauheit_mm=rauheit)]
    if l_verteiler:
        teilstuecke.append(_teilstueck(
            "Zuleitung Sonde–Verteiler", volumenstrom_m3_s=v_s / kreise,
            innen_d_mm=d_verteiler, laenge_m=l_verteiler, straenge=2,
            dichte_kg_m3=dichte, viskositaet_mm2_s=viskositaet, rauheit_mm=rauheit))
    if l_wp:
        teilstuecke.append(_teilstueck(
            "Zuleitung Verteiler–WP", volumenstrom_m3_s=v_s,
            innen_d_mm=d_wp, laenge_m=l_wp, straenge=2,
            dichte_kg_m3=dichte, viskositaet_mm2_s=viskositaet, rauheit_mm=rauheit))

    for t in teilstuecke:
        rechenweg.extend([
            _schritt(f"w ({t['name']})", "w = V̇ / (π/4 · d²)",
                     f"{t['volumenstrom_m3_s']:.6f} / (π/4 · {_z(t['innen_d_mm'], 1)}²)",
                     f"{t['geschwindigkeit_m_s']:.3f} m/s"),
            _schritt(f"Re ({t['name']})", "Re = w · d / ν",
                     f"{t['geschwindigkeit_m_s']:.3f} · {_z(t['innen_d_mm'], 1)}/1000 / "
                     f"({_z(viskositaet, 2)}/10⁶)",
                     f"{t['reynolds']:.0f} — {t['stroemungsart']}"),
        ])
        if t["druckverlust_pa"] is not None:
            rechenweg.append(_schritt(
                f"Δp ({t['name']})", "Δp = λ · (ρ · w²/2) / d · L · Stränge",
                f"{t['lambda']:.5f} · {t['dynamischer_druck_pa']:.1f} / "
                f"{_z(t['innen_d_mm'], 1)}/1000 · {_z(t['laenge_m'], 1)} · {t['straenge']}",
                f"{t['druckverlust_pa']:.0f} Pa"))

    sonde = teilstuecke[0]
    if sonde["stroemungsart"] == "Laminar":
        warnungen.append(
            "Erdwärmesonde ist laminar durchströmt. Für den Wärmeübergang ist "
            "mindestens «turbulent glatt» gefordert: Volumenstrom erhöhen, "
            "Sole-ΔT verkleinern oder kleineren Sondendurchmesser wählen."
        )
    elif sonde["stroemungsart"] == "Übergangsgebiet":
        warnungen.append(
            "Erdwärmesonde liegt im Übergangsgebiet; λ ist dort nicht definiert "
            "und der Druckverlust nicht berechenbar."
        )
    for t in teilstuecke[1:]:
        if t["druckverlust_pa"] is None:
            warnungen.append(
                f"{t['name']}: Übergangsgebiet, λ nicht berechenbar. "
                "Durchmesser oder Volumenstrom anpassen."
            )

    # ── Verteiler, Wärmepumpe, Förderhöhe ───────────────────────────────────
    dp_leitungen_pa = sum(t["druckverlust_pa"] or 0 for t in teilstuecke)
    dp_leitungen_mws = dp_leitungen_pa * PA_JE_MWS
    zeta = float(zeta_verteiler)
    n_verteiler = float(verteiler_anzahl or 0)
    dp_verteiler_mws = zeta * sonde["dynamischer_druck_pa"] * PA_JE_MWS * n_verteiler
    dp_wp_mws = float(druckverlust_wp_mws or 0)
    foerderhoehe = dp_leitungen_mws + dp_verteiler_mws + dp_wp_mws

    rechenweg.extend([
        _schritt("Δp_Leitungen", "Δp = Σ Teilstücke · 0.000102",
                 f"{dp_leitungen_pa:.0f} · {PA_JE_MWS}", f"{dp_leitungen_mws:.2f} mWs"),
        _schritt("Δp_Verteiler", "Δp = ζ · (ρ · w²/2) · 0.000102 · Anzahl",
                 f"{_z(zeta, 1)} · {sonde['dynamischer_druck_pa']:.1f} · {PA_JE_MWS} · {_z(n_verteiler, 1)}",
                 f"{dp_verteiler_mws:.2f} mWs"),
        _schritt("H", "H = Δp_Leitungen + Δp_Verteiler + Δp_Wärmepumpe",
                 f"{dp_leitungen_mws:.2f} + {dp_verteiler_mws:.2f} + {_z(dp_wp_mws, 2)}",
                 f"{foerderhoehe:.2f} mWs"),
    ])
    if not dp_wp_mws:
        warnungen.append(
            "Druckverlust der Wärmepumpe fehlt; die Förderhöhe ist ohne den "
            "Verdampferwiderstand zu klein."
        )

    return {
        "sonden_anzahl": anzahl,
        "sonden_tiefe_m": round(tiefe, 1),
        "sonden_straenge": sonden_straenge,
        "kreise": kreise,
        "inhalt_je_m_sonde_l": round(inhalt_je_m_sonde, 4),
        "inhalt_sonden_l": round(inhalt_sonden, 1),
        "inhalt_zuleitung_verteiler_l": round(inhalt_verteiler, 1),
        "inhalt_zuleitung_wp_l": round(inhalt_wp, 1),
        "zusatzinhalt_l": round(zusatz, 1),
        "inhalt_total_l": round(inhalt_total, 1),
        "konzentration_pct": konz,
        "waermetraeger_l": round(traeger_excel_l, 1),
        "waermetraeger_kg": round(traeger_excel_kg, 1),
        "konzentrat_volumetrisch_l": round(konzentrat_vol_l, 1),
        "konzentrat_volumetrisch_kg": round(konzentrat_kg, 1),
        "dichte_kg_m3": dichte,
        "cp_kj_kgk": cp,
        "viskositaet_mm2_s": viskositaet,
        "rauheit_mm": rauheit,
        "volumenstrom_m3_h": round(v_h, 3),
        "volumenstrom_quelle": volumenstrom_quelle,
        "teilstuecke": teilstuecke,
        "druckverlust_leitungen_mws": round(dp_leitungen_mws, 2),
        "druckverlust_verteiler_mws": round(dp_verteiler_mws, 2),
        "druckverlust_wp_mws": round(dp_wp_mws, 2),
        "zeta_verteiler": zeta,
        "verteiler_anzahl": n_verteiler,
        "foerderhoehe_mws": round(foerderhoehe, 2),
        "foerdervolumen_m3_h": round(v_h, 3),
        "sonde_stroemungsart": sonde["stroemungsart"],
        "sonde_turbulent": sonde["stroemungsart"] in ("Turbulent glatt", "Turbulent rauh"),
        "rechenweg": rechenweg,
        "warnungen": warnungen,
    }
