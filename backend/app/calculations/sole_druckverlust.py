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
from app.calculations.sole_rohre import (  # noqa: F401  (Re-Export fürs Frontend)
    KONZENTRAT_DICHTE_KG_L,
    PN_RANG,
    erforderliche_druckstufe,
    rohr,
    waermetraeger,
)

# Rohrrauheit PE, Vorgabe der Vorlage.
RAUHEIT_MM_STD = 0.015

# Physikalische Umrechnung Pa → Meter Flüssigkeitssäule. Die Vorlage verwendet
# den festen Wasserfaktor 0.000102; bei Sole muss die tatsächliche Dichte gelten.
ERDBESCHLEUNIGUNG_M_S2 = 9.81

# Zeta-Wert des Verteilers: Vorgabewert der Vorlage.
ZETA_VERTEILER_STD = 12.0


def _s(
    gruppe: str,
    groesse: str,
    formel: str,
    eingesetzt: str,
    ergebnis: str,
    *,
    formel_latex: Optional[str] = None,
    eingesetzt_latex: Optional[str] = None,
) -> dict:
    """Rechenschritt mit Gruppe, damit Editor und PDF ihn gliedern können."""
    schritt = {"gruppe": gruppe, **_schritt(groesse, formel, eingesetzt, ergebnis)}
    if formel_latex:
        schritt["formel_latex"] = formel_latex
    if eingesetzt_latex:
        schritt["eingesetzt_latex"] = eingesetzt_latex
    return schritt


def _bruch(zaehler: str, nenner: str) -> str:
    """LaTeX-Bruch ohne unlesbare Klammerfolgen in dynamischen f-Strings."""
    return rf"\frac{{{zaehler}}}{{{nenner}}}"


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
        "druckverlust_mws": (
            round(dp_pa / (dichte_kg_m3 * ERDBESCHLEUNIGUNG_M_S2), 3)
            if dp_pa is not None else None
        ),
    }


def sole_druckverlust(
    *,
    sonden_anzahl: int,
    sonden_tiefe_m: float,
    sonden_innen_d_mm: float,
    sonden_straenge: int = 4,
    zuleitung_verteiler_m: float = 0.0,
    zuleitung_verteiler_gesamt_vl_rl_m: Optional[float] = None,
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
    sonden_pn: Optional[str] = None,
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

    # ── Druckstufe nach Sondentiefe (SIA 384/6:2021, informativ) ────────────
    druckstufe = erforderliche_druckstufe(tiefe)
    druckstufe["gewaehlt_pn"] = sonden_pn
    if druckstufe["ausserhalb"]:
        warnungen.append(
            f"Sondentiefe {tiefe:.0f} m liegt ausserhalb der Druckstufentabelle "
            "(bis 360 m). Nenndruckstufe fachlich festlegen."
        )
        druckstufe["ausreichend"] = None
    elif sonden_pn:
        reicht = PN_RANG.get(sonden_pn, 0) >= PN_RANG.get(druckstufe["pn"], 0)
        druckstufe["ausreichend"] = reicht
        if not reicht:
            warnungen.append(
                f"Sondenrohr ist {sonden_pn}; für {tiefe:.0f} m Tiefe verlangt "
                f"SIA 384/6 mindestens {druckstufe['pn']} "
                f"({druckstufe['max_ueberdruck_bar']} bar am Sondenfuss, inkl. "
                "3 bar Betriebsdruck)."
            )
    else:
        druckstufe["ausreichend"] = None

    # ── Füllinhalt ──────────────────────────────────────────────────────────
    inhalt_je_m_sonde = _querschnitt_m2(d_sonde) * 1000 * sonden_straenge
    inhalt_sonden = inhalt_je_m_sonde * tiefe * anzahl
    l_verteiler_gesamt = (
        float(zuleitung_verteiler_gesamt_vl_rl_m)
        if zuleitung_verteiler_gesamt_vl_rl_m not in (None, "")
        else l_verteiler * 2
    )
    if l_verteiler_gesamt < 0:
        raise ValueError("Gesamte Anschlussrohrmeter dürfen nicht negativ sein")
    inhalt_verteiler = _querschnitt_m2(d_verteiler) * 1000 * l_verteiler_gesamt
    inhalt_wp = _querschnitt_m2(d_wp) * 1000 * l_wp * 2
    zusatz = float(zusatzinhalt_l or 0)
    inhalt_total = inhalt_sonden + inhalt_verteiler + inhalt_wp + zusatz
    if l_verteiler and zuleitung_verteiler_gesamt_vl_rl_m in (None, ""):
        warnungen.append(
            "Gesamte Anschlussrohrmeter fehlen; für den Füllinhalt wird vorläufig "
            "nur der kritische Weg mit Vor- und Rücklauf verwendet."
        )

    rechenweg.append(_s(
        "1 Füllinhalt",
        "V_Sonde", "V = π/4 · d² · Stränge · Tiefe · Anzahl",
        f"π/4 · {_z(d_sonde, 1)}² · {sonden_straenge} · {_z(tiefe, 1)} · {anzahl}",
        f"{inhalt_sonden:.1f} l",
        formel_latex=(
            r"V_{\mathrm{Sonden}} = n \cdot N_{\mathrm{Stränge}} \cdot L "
            r"\cdot \frac{\pi}{4} \left(\frac{d_i}{1000}\right)^2 \cdot 1000"
        ),
        eingesetzt_latex=(
            rf"{anzahl} \cdot {sonden_straenge} \cdot {_z(tiefe, 1)} \cdot "
            rf"\frac{{\pi}}{{4}} \left(\frac{{{_z(d_sonde, 1)}}}{{1000}}\right)^2 "
            rf"\cdot 1000"
        )))
    if l_verteiler:
        rechenweg.append(_s(
            "1 Füllinhalt",
            "V_ZulVert", "V = π/4 · d² · L_gesamt(VL+RL)",
            f"π/4 · {_z(d_verteiler, 1)}² · {_z(l_verteiler_gesamt, 1)}",
            f"{inhalt_verteiler:.1f} l",
            formel_latex=(
                r"V_{\mathrm{Zul,Vert}} = \frac{\pi}{4} "
                r"\left(\frac{d_i}{1000}\right)^2 "
                r"\cdot L_{\mathrm{gesamt,VL+RL}} \cdot 1000"
            ),
            eingesetzt_latex=(
                rf"\frac{{\pi}}{{4}} \left(\frac{{{_z(d_verteiler, 1)}}}{{1000}}\right)^2 "
                rf"\cdot {_z(l_verteiler_gesamt, 1)} \cdot 1000"
            )))
    if l_wp:
        rechenweg.append(_s(
            "1 Füllinhalt",
            "V_ZulWP", "V = π/4 · d² · L · 2 (Vor- und Rücklauf)",
            f"π/4 · {_z(d_wp, 1)}² · {_z(l_wp, 1)} · 2",
            f"{inhalt_wp:.1f} l",
            formel_latex=(
                r"V_{\mathrm{Zul,WP}} = \frac{\pi}{4} "
                r"\left(\frac{d_i}{1000}\right)^2 \cdot L \cdot 2 \cdot 1000"
            ),
            eingesetzt_latex=(
                rf"\frac{{\pi}}{{4}} \left(\frac{{{_z(d_wp, 1)}}}{{1000}}\right)^2 "
                rf"\cdot {_z(l_wp, 1)} \cdot 2 \cdot 1000"
            )))
    rechenweg.append(_s(
        "1 Füllinhalt",
        "V_total", "V = V_Sonde + V_ZulVert + V_ZulWP + V_WP/Expansion",
        f"{inhalt_sonden:.1f} + {inhalt_verteiler:.1f} + {inhalt_wp:.1f} + {_z(zusatz, 1)}",
        f"{inhalt_total:.1f} l",
        formel_latex=(
            r"V_{\mathrm{gesamt}} = V_{\mathrm{Sonden}} + V_{\mathrm{Zul,Vert}} + "
            r"V_{\mathrm{Zul,WP}} + V_{\mathrm{Zusatz}}"
        )))

    # ── Wärmeträger ─────────────────────────────────────────────────────────
    # Formel der Vorlage (B25). Sie mischt Volumen und Masse; deshalb wird die
    # rein volumetrische Lesart als Kontrollwert danebengestellt.
    konz = float(konzentration_pct)
    traeger_excel_l = inhalt_total * 1000 / 100 * konz / dichte
    traeger_excel_kg = traeger_excel_l * dichte / 1000
    konzentrat_vol_l = inhalt_total * konz / 100
    konzentrat_kg = konzentrat_vol_l * KONZENTRAT_DICHTE_KG_L
    rechenweg.append(_s(
        "2 Wärmeträger",
        "V_Glykol", "V = V_total · 1000 / 100 · Konzentration / ρ  (Vorlage)",
        f"{inhalt_total:.1f} · 1000 / 100 · {_z(konz, 1)} / {_z(dichte, 1)}",
        f"{traeger_excel_l:.1f} l",
        formel_latex=(
            r"V_{\mathrm{Glykol,Vorlage}} = V_{\mathrm{gesamt}} \cdot "
            r"\frac{1000}{100} \cdot \frac{c}{\rho}"
        ),
        eingesetzt_latex=(
            rf"{inhalt_total:.1f} \cdot \frac{{1000}}{{100}} \cdot "
            rf"\frac{{{_z(konz, 1)}}}{{{_z(dichte, 1)}}}"
        )))
    rechenweg.append(_s(
        "2 Wärmeträger",
        "V_Konz", "V = V_total · Konzentration / 100  (volumetrische Kontrolle)",
        f"{inhalt_total:.1f} · {_z(konz, 1)} / 100",
        f"{konzentrat_vol_l:.1f} l",
        formel_latex=(
            r"V_{\mathrm{Konzentrat}} = V_{\mathrm{gesamt}} \cdot \frac{c}{100}"
        ),
        eingesetzt_latex=(
            rf"{inhalt_total:.1f} \cdot \frac{{{_z(konz, 1)}}}{{100}}"
        )))
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
            rechenweg.append(_s(
                "3 Volumenstrom",
                "V'", "V' = Q0 · 3600 / (c · ΔT · ρ)",
                f"{_z(q0)} · 3600 / ({_z(cp, 3)} · {_z(dt, 1)} · {_z(dichte, 1)})",
                f"{v_h:.3f} m³/h",
                formel_latex=(
                    r"\dot V = \frac{Q_0 \cdot 3600}{c_p \cdot \Delta T \cdot \rho}"
                ),
                eingesetzt_latex=(
                    rf"\frac{{{_z(q0)} \cdot 3600}}{{{_z(cp, 3)} \cdot "
                    rf"{_z(dt, 1)} \cdot {_z(dichte, 1)}}}"
                )))
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
            "zuleitung_verteiler_gesamt_vl_rl_m": round(l_verteiler_gesamt, 1),
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
            "druckstufe": druckstufe,
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

    for nr, t in enumerate(teilstuecke, start=4):
        gruppe = f"{nr} {t['name']}"
        rechenweg.extend([
            _s(gruppe, "V'_Kreis", "V'_Kreis = V' / Anzahl Kreise",
               f"{v_h:g}/3600 / {kreise}" if t["name"] != "Zuleitung Verteiler–WP"
               else f"{v_h:g}/3600",
               f"{t['volumenstrom_m3_s']:.6f} m³/s",
               formel_latex=(
                   r"\dot V_{\mathrm{Kreis}} = \frac{\dot V_{\mathrm{gesamt}}}"
                   r"{N_{\mathrm{Kreise}}}"
                   if t["name"] != "Zuleitung Verteiler–WP"
                   else r"\dot V_{\mathrm{Haupt}} = \dot V_{\mathrm{gesamt}}"
               ),
               eingesetzt_latex=(
                   rf"\frac{{{v_h:g}}}{{3600 \cdot {kreise}}}"
                   if t["name"] != "Zuleitung Verteiler–WP"
                   else rf"\frac{{{v_h:g}}}{{3600}}"
               )),
            _s(gruppe, "w", "w = V'_Kreis / (π/4 · d²)",
               f"{t['volumenstrom_m3_s']:.6f} / (π/4 · ({_z(t['innen_d_mm'], 1)}/1000)²)",
               f"{t['geschwindigkeit_m_s']:.3f} m/s",
               formel_latex=r"w = \frac{\dot V}{\frac{\pi}{4}d_i^2}",
               eingesetzt_latex=_bruch(
                   f"{t['volumenstrom_m3_s']:.6f}",
                   _bruch(r"\pi", "4")
                   + r"\left("
                   + _bruch(_z(t['innen_d_mm'], 1), "1000")
                   + r"\right)^2",
               )),
            _s(gruppe, "Re", "Re = w · d / ν",
               f"{t['geschwindigkeit_m_s']:.3f} · {_z(t['innen_d_mm'], 1)}/1000 / "
               f"({_z(viskositaet, 2)}/10^6)",
               f"{t['reynolds']:.0f}",
               formel_latex=r"Re = \frac{w \cdot d_i}{\nu}",
               eingesetzt_latex=_bruch(
                   rf"{t['geschwindigkeit_m_s']:.3f} \cdot "
                   + _bruch(_z(t['innen_d_mm'], 1), "1000"),
                   _bruch(_z(viskositaet, 2), r"10^6"),
               )),
            _s(gruppe, "Strömungsart",
               "Re < 2340 laminar · Re < 65·dk turbulent glatt · Re > 1300·dk turbulent rauh",
               f"Re {t['reynolds']:.0f} · dk = {_z(t['innen_d_mm'], 1)}/{_z(rauheit, 3)} "
               f"= {t['dk']:.0f} · 65·dk = {65 * t['dk']:.0f}",
               t["stroemungsart"],
               formel_latex=(
                   r"Re < 2340:\ \mathrm{laminar};\quad Re < 65d_k:\ "
                   r"\mathrm{turbulent\ glatt};\quad Re > 1300d_k:\ "
                   r"\mathrm{turbulent\ rau}"
               ),
               eingesetzt_latex=(
                   rf"Re = {t['reynolds']:.0f};\quad d_k = "
                   + _bruch(_z(t['innen_d_mm'], 1), _z(rauheit, 3))
                   + rf" = {t['dk']:.0f};\quad 65d_k = {65 * t['dk']:.0f}"
               )),
        ])
        if t["lambda"] is not None:
            formel = ("λ = 64/Re" if t["stroemungsart"] == "Laminar"
                      else "λ = 0.3164/Re^0.25 (Blasius)" if t["reynolds"] < 100_000
                      and t["stroemungsart"] == "Turbulent glatt"
                      else "λ = 0.0032 + 0.221/Re^0.237 (Nikuradse)"
                      if t["stroemungsart"] == "Turbulent glatt"
                      else "λ = 1/(2·log10(3.715·dk))² (Prandtl-Kármán)")
            latex_formel = (
                r"\lambda = \frac{64}{Re}"
                if t["stroemungsart"] == "Laminar"
                else r"\lambda = \frac{0.3164}{Re^{0.25}}\quad\mathrm{(Blasius)}"
                if t["reynolds"] < 100_000 and t["stroemungsart"] == "Turbulent glatt"
                else r"\lambda = 0.0032 + \frac{0.221}{Re^{0.237}}\quad\mathrm{(Nikuradse)}"
                if t["stroemungsart"] == "Turbulent glatt"
                else r"\lambda = \frac{1}{\left(2\log_{10}(3.715d_k)\right)^2}"
            )
            rechenweg.append(_s(
                gruppe, "λ", formel, f"Re = {t['reynolds']:.0f}",
                f"{t['lambda']:.5f}", formel_latex=latex_formel,
                eingesetzt_latex=rf"Re = {t['reynolds']:.0f}"
            ))
        rechenweg.append(_s(
            gruppe, "p_dyn", "p_dyn = ρ · w² / 2",
            f"{_z(dichte, 1)} · {t['geschwindigkeit_m_s']:.3f}² / 2",
            f"{t['dynamischer_druck_pa']:.1f} Pa",
            formel_latex=r"p_{\mathrm{dyn}} = \frac{\rho w^2}{2}",
            eingesetzt_latex=(
                rf"\frac{{{_z(dichte, 1)} \cdot {t['geschwindigkeit_m_s']:.3f}^2}}{{2}}"
            )))
        if t["druckverlust_pa"] is not None:
            rechenweg.append(_s(
                gruppe, "Δp", "Δp = λ · p_dyn / d · L · Stränge",
                f"{t['lambda']:.5f} · {t['dynamischer_druck_pa']:.1f} / "
                f"({_z(t['innen_d_mm'], 1)}/1000) · {_z(t['laenge_m'], 1)} · {t['straenge']}",
                f"{t['druckverlust_pa']:.0f} Pa = {t['druckverlust_mws']:.2f} mWs",
                formel_latex=(
                    r"\Delta p = \lambda \cdot \frac{p_{\mathrm{dyn}}}{d_i} "
                    r"\cdot L \cdot N_{\mathrm{Stränge}}"
                ),
                eingesetzt_latex=(
                    rf"{t['lambda']:.5f} \cdot "
                    + _bruch(
                        f"{t['dynamischer_druck_pa']:.1f}",
                        _bruch(_z(t['innen_d_mm'], 1), "1000"),
                    )
                    + rf" \cdot {_z(t['laenge_m'], 1)} \cdot {t['straenge']}"
                )))

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
    dp_leitungen_mws = dp_leitungen_pa / (dichte * ERDBESCHLEUNIGUNG_M_S2)
    zeta = float(zeta_verteiler)
    n_verteiler = float(verteiler_anzahl or 0)
    dp_verteiler_mws = (
        zeta * sonde["dynamischer_druck_pa"]
        / (dichte * ERDBESCHLEUNIGUNG_M_S2) * n_verteiler
    )
    dp_wp_mws = float(druckverlust_wp_mws or 0)
    foerderhoehe = dp_leitungen_mws + dp_verteiler_mws + dp_wp_mws

    pumpe = f"{len(teilstuecke) + 4} Pumpenbetriebspunkt"
    rechenweg.extend([
        _s(pumpe, "H_Leitungen", "H = ΣΔp / (ρ · g)",
           f"{dp_leitungen_pa:.0f} / ({_z(dichte, 1)} · {ERDBESCHLEUNIGUNG_M_S2})",
           f"{dp_leitungen_mws:.2f} mWs",
           formel_latex=r"H_{\mathrm{Leitungen}} = \frac{\sum \Delta p}{\rho g}",
           eingesetzt_latex=(
               rf"\frac{{{dp_leitungen_pa:.0f}}}"
               rf"{{{_z(dichte, 1)} \cdot {ERDBESCHLEUNIGUNG_M_S2}}}"
           )),
        _s(pumpe, "H_Verteiler", "H = ζ · p_dyn(Sonde) / (ρ · g) · Anzahl",
           f"{_z(zeta, 1)} · {sonde['dynamischer_druck_pa']:.1f} / "
           f"({_z(dichte, 1)} · {ERDBESCHLEUNIGUNG_M_S2}) · {_z(n_verteiler, 1)}",
           f"{dp_verteiler_mws:.2f} mWs",
           formel_latex=(
               r"H_{\mathrm{Verteiler}} = \zeta \cdot "
               r"\frac{p_{\mathrm{dyn,Sonde}}}{\rho g} \cdot N"
           ),
           eingesetzt_latex=(
               rf"{_z(zeta, 1)} \cdot "
               rf"\frac{{{sonde['dynamischer_druck_pa']:.1f}}}"
               rf"{{{_z(dichte, 1)} \cdot {ERDBESCHLEUNIGUNG_M_S2}}} \cdot "
               rf"{_z(n_verteiler, 1)}"
           )),
        _s(pumpe, "H", "H = Δp_Leitungen + Δp_Verteiler + Δp_Wärmepumpe",
           f"{dp_leitungen_mws:.2f} + {dp_verteiler_mws:.2f} + {_z(dp_wp_mws, 2)}",
           f"{foerderhoehe:.2f} mWs",
           formel_latex=(
               r"H_{\mathrm{Pumpe}} = H_{\mathrm{Leitungen}} + "
               r"H_{\mathrm{Verteiler}} + H_{\mathrm{Wärmepumpe}}"
           )),
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
        "zuleitung_verteiler_gesamt_vl_rl_m": round(l_verteiler_gesamt, 1),
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
        "druckstufe": druckstufe,
        "sonde_stroemungsart": sonde["stroemungsart"],
        "sonde_turbulent": sonde["stroemungsart"] in ("Turbulent glatt", "Turbulent rauh"),
        "rechenweg": rechenweg,
        "warnungen": warnungen,
    }
