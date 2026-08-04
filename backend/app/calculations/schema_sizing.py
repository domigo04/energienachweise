"""Auslegungen für Bauteile im Hydraulikschema.

Die Funktionen sind bewusst unabhängig vom Graphen. Der Graph bestimmt die
automatischen Eingaben; hier leben nur Formeln, Einheiten und Rechenweg.
"""

import math
from typing import Optional

from app.calculations.einzel import speichervolumen_wp


SONDEN_INNENDURCHMESSER_MM = {25: 20.4, 32: 26.2, 40: 32.6}
ERDBESCHLEUNIGUNG_M_S2 = 9.81


def _rohrinhalt_l(laenge_m: float, innendurchmesser_mm: float) -> float:
    """Rohrinhalt für die bereits als Summe VL+RL angegebene Länge."""
    d_m = innendurchmesser_mm / 1000
    return math.pi * d_m**2 / 4 * laenge_m * 1000


def _reibungsbeiwert(reynolds: float, d_mm: float, rauheit_mm: float) -> tuple[float, str]:
    """Darcy-Reibungsbeiwert nach der Fallunterscheidung der Excel-Vorlage."""
    if reynolds <= 0:
        raise ValueError("Reynolds-Zahl muss > 0 sein")
    if reynolds < 2340:
        return 64 / reynolds, "laminar"

    d_k = d_mm / rauheit_mm
    if reynolds < 65 * d_k:
        if reynolds < 100000:
            return 0.3164 / reynolds**0.25, "turbulent glatt (Blasius)"
        return 0.0032 + 0.221 / reynolds**0.237, "turbulent glatt"
    if reynolds > 1300 * d_k:
        return 1 / (2 * math.log10(3.715 * d_k))**2, "turbulent rau"
    # Die Excel-Vorlage lässt dieses Übergangsgebiet offen. Damit die
    # Pumpenauslegung nicht vollständig abbricht, wird es transparent mit der
    # Haaland-Näherung geschlossen.
    rel_rauheit = rauheit_mm / d_mm
    haaland = 1 / (-1.8 * math.log10((rel_rauheit / 3.7) ** 1.11 + 6.9 / reynolds)) ** 2
    return haaland, "Übergangsgebiet (Haaland)"


def _druckverlust_abschnitt(
    *, name: str, volumenstrom_m3_s: float, laenge_vl_rl_m: float,
    innendurchmesser_mm: float, dichte_kg_m3: float,
    viskositaet_mm2_s: float, rauheit_mm: float,
) -> tuple[dict, list[dict]]:
    """Darcy-Weisbach für einen vollständigen VL-/RL-Abschnitt."""
    d_m = innendurchmesser_mm / 1000
    querschnitt = math.pi * d_m**2 / 4
    geschwindigkeit = volumenstrom_m3_s / querschnitt
    reynolds = geschwindigkeit * d_m / (viskositaet_mm2_s / 1_000_000)
    lambda_wert, stroemungsart = _reibungsbeiwert(
        reynolds, innendurchmesser_mm, rauheit_mm
    )
    dynamischer_druck = dichte_kg_m3 * geschwindigkeit**2 / 2
    druckverlust = lambda_wert * dynamischer_druck / d_m * laenge_vl_rl_m
    if stroemungsart == "laminar":
        lambda_formel = "λ = 64 / Re"
    elif stroemungsart == "turbulent glatt (Blasius)":
        lambda_formel = "λ = 0.3164 / Re^0.25"
    elif stroemungsart == "turbulent glatt":
        lambda_formel = "λ = 0.0032 + 0.221 / Re^0.237"
    elif stroemungsart == "turbulent rau":
        lambda_formel = "λ = 1 / (2 · log10(3.715 · d/k))²"
    else:
        lambda_formel = "λ = 1 / [-1.8 · log10(((k/d)/3.7)^1.11 + 6.9/Re)]²"
    result = {
        "name": name,
        "volumenstrom_m3_s": volumenstrom_m3_s,
        "laenge_vl_rl_m": laenge_vl_rl_m,
        "innendurchmesser_mm": innendurchmesser_mm,
        "geschwindigkeit_m_s": geschwindigkeit,
        "reynolds": reynolds,
        "stroemungsart": stroemungsart,
        "lambda": lambda_wert,
        "dynamischer_druck_pa": dynamischer_druck,
        "druckverlust_pa": druckverlust,
    }
    kurz = {"Erdsonde": "EWS", "Anschlussleitung": "Anschluss", "Hauptleitung": "Haupt"}[name]
    schritte = [
        {
            "groesse": f"V̇ {kurz}",
            "formel": "V̇ = V̇gesamt / parallele Kreise" if name != "Hauptleitung" else "V̇ = V̇gesamt",
            "eingesetzt": f"{volumenstrom_m3_s:.8f}",
            "ergebnis": f"{volumenstrom_m3_s:.8f} m³/s",
        },
        {
            "groesse": f"w {kurz}",
            "formel": "w = V̇ / (π · dᵢ² / 4)",
            "eingesetzt": f"{volumenstrom_m3_s:.8f} / (π · {d_m:g}² / 4)",
            "ergebnis": f"{geschwindigkeit:.4f} m/s",
        },
        {
            "groesse": f"Re {kurz}",
            "formel": "Re = w · dᵢ / ν",
            "eingesetzt": f"{geschwindigkeit:.4f} · {d_m:g} / {viskositaet_mm2_s / 1_000_000:g}",
            "ergebnis": f"{reynolds:.0f} ({stroemungsart})",
        },
        {
            "groesse": f"λ {kurz}",
            "formel": lambda_formel,
            "eingesetzt": f"Re = {reynolds:.0f}; d/k = {innendurchmesser_mm / rauheit_mm:.0f}",
            "ergebnis": f"{lambda_wert:.5f}",
        },
        {
            "groesse": f"Δp {kurz}",
            "formel": "Δp = λ · (ρ · w² / 2) / dᵢ · L(VL+RL)",
            "eingesetzt": (
                f"{lambda_wert:.5f} · ({dichte_kg_m3:g} · {geschwindigkeit:.4f}² / 2) "
                f"/ {d_m:g} · {laenge_vl_rl_m:g}"
            ),
            "ergebnis": f"{druckverlust:.0f} Pa",
        },
    ]
    return result, schritte


def technischer_speicher(
    leistung_kw: float,
    vorlauf_max_c: float,
    ruecklauf_c: float,
    *,
    ueberbrueckung_min: float = 15.0,
    ueberdeckung_k: float = 2.0,
    dichte_kg_m3: float = 988.0,
    waermekapazitaet_kj_kgk: float = 4.187,
) -> dict:
    """Technischen Speicher aus Leistung, Zeit und nutzbarem ΔT auslegen."""
    leistung = float(leistung_kw)
    vorlauf = float(vorlauf_max_c)
    ruecklauf = float(ruecklauf_c)
    ueberdeckung = float(ueberdeckung_k)
    oben = vorlauf + ueberdeckung
    delta_t = oben - ruecklauf
    if delta_t <= 0:
        raise ValueError("Speicher-Vorlauf muss grösser als Speicher-Rücklauf sein")
    result = speichervolumen_wp(
        leistung,
        ueberbrueckung_min,
        delta_t,
        dichte_kg_m3=dichte_kg_m3,
        waermekapazitaet_kj_kgk=waermekapazitaet_kj_kgk,
    )
    return {
        **result,
        "leistung_kw": round(leistung, 2),
        "vorlauf_max_c": round(vorlauf, 1),
        "speicher_oben_c": round(oben, 1),
        "speicher_unten_c": round(ruecklauf, 1),
        "ueberdeckung_k": round(ueberdeckung, 1),
        "ueberbrueckung_min": round(float(ueberbrueckung_min), 1),
    }


def erdsondenfeld(
    *,
    quellenleistung_kw: Optional[float],
    sonden_anzahl: int,
    sonden_laenge_m: Optional[float],
    spezifische_entzugsleistung_w_m: Optional[float],
    sicherheitsfaktor: float = 1.10,
    sonden_aussendurchmesser_mm: int = 32,
    glykol_konzentration_pct: float = 30.0,
    glykol_dichte_kg_l: float = 1.14,
    zusaetzlicher_inhalt_l: float = 0.0,
    sole_volumenstrom_m3h: Optional[float] = None,
    sonden_innendurchmesser_mm: Optional[float] = None,
    anschlussleitung_kritisch_m: float = 0.0,
    anschlussleitung_gesamt_vl_rl_m: float = 0.0,
    anschluss_innendurchmesser_mm: float = 40.6,
    hauptleitung_m: float = 0.0,
    hauptleitung_innendurchmesser_mm: float = 40.6,
    sole_dichte_kg_m3: float = 1050.0,
    sole_viskositaet_mm2_s: float = 4.15,
    rohrrauheit_mm: float = 0.015,
    wp_druckverlust_mws: float = 0.0,
    verteiler_zeta: float = 0.0,
) -> dict:
    """Duplex-Erdsondenfeld: Bohrmeter, Inhalt und Solepumpen-Betriebspunkt.

    Die standortabhängige Entzugsleistung bleibt eine sichtbare Eingabe. Eine
    pauschale EED-/Bohrtiefenempfehlung wird nicht aus den ortsgebundenen
    Tabellen der Vorlage abgeleitet. Die kritische Anschlusslänge ist die
    einfache Strecke zum entferntesten Bohrpunkt; für den Druckverlust wird
    VL+RL gerechnet. Der Anlageninhalt verwendet dagegen die separat erfassten
    gesamten Rohrmeter aller Anschlussleitungen.
    """
    anzahl = int(sonden_anzahl)
    if anzahl <= 0:
        raise ValueError("Sondenanzahl muss > 0 sein")
    if sonden_aussendurchmesser_mm not in SONDEN_INNENDURCHMESSER_MM:
        raise ValueError("Sondenrohr muss 25, 32 oder 40 mm sein")
    faktor = float(sicherheitsfaktor)
    if faktor < 1:
        raise ValueError("Sicherheitsfaktor muss ≥ 1 sein")
    laenge = float(sonden_laenge_m) if sonden_laenge_m not in (None, "") else None
    q0 = float(quellenleistung_kw) if quellenleistung_kw not in (None, "") else None
    spezifisch = (
        float(spezifische_entzugsleistung_w_m)
        if spezifische_entzugsleistung_w_m not in (None, "") else None
    )
    if laenge is not None and laenge <= 0:
        raise ValueError("Sondenlänge muss > 0 sein")
    if q0 is not None and q0 <= 0:
        raise ValueError("Quellenleistung muss > 0 sein")
    if spezifisch is not None and spezifisch <= 0:
        raise ValueError("Spezifische Entzugsleistung muss > 0 sein")

    positive_felder = {
        "Solevolumenstrom": sole_volumenstrom_m3h,
        "Sonden-Innendurchmesser": sonden_innendurchmesser_mm,
        "Anschluss-Innendurchmesser": anschluss_innendurchmesser_mm,
        "Hauptleitungs-Innendurchmesser": hauptleitung_innendurchmesser_mm,
        "Sole-Dichte": sole_dichte_kg_m3,
        "Sole-Viskosität": sole_viskositaet_mm2_s,
        "Rohrrauheit": rohrrauheit_mm,
    }
    for label, wert in positive_felder.items():
        if wert is not None and float(wert) <= 0:
            raise ValueError(f"{label} muss > 0 sein")
    for label, wert in {
        "Kritische Anschlusslänge": anschlussleitung_kritisch_m,
        "Gesamte Anschlussrohrmeter": anschlussleitung_gesamt_vl_rl_m,
        "Hauptleitung": hauptleitung_m,
        "Wärmepumpen-Druckverlust": wp_druckverlust_mws,
        "Verteiler-Zeta": verteiler_zeta,
        "Zusatzinhalt": zusaetzlicher_inhalt_l,
    }.items():
        if float(wert) < 0:
            raise ValueError(f"{label} darf nicht negativ sein")

    ist_gesamt = anzahl * laenge if laenge else None
    erforderlich = q0 * 1000 / spezifisch * faktor if q0 and spezifisch else None
    erforderlich_pro_sonde = erforderlich / anzahl if erforderlich else None
    sonden_id = float(
        sonden_innendurchmesser_mm
        if sonden_innendurchmesser_mm not in (None, "")
        else SONDEN_INNENDURCHMESSER_MM[sonden_aussendurchmesser_mm]
    )
    rohrinhalt = _rohrinhalt_l(1, sonden_id)
    # Duplexsonde = zwei U-Rohre = vier Rohrstränge je Sondenmeter.
    sondeninhalt = anzahl * 4 * laenge * rohrinhalt if laenge else None
    anschlussinhalt = _rohrinhalt_l(
        float(anschlussleitung_gesamt_vl_rl_m), float(anschluss_innendurchmesser_mm)
    )
    hauptinhalt = _rohrinhalt_l(
        float(hauptleitung_m) * 2, float(hauptleitung_innendurchmesser_mm)
    )
    gesamtinhalt = (
        sondeninhalt + anschlussinhalt + hauptinhalt + float(zusaetzlicher_inhalt_l)
        if sondeninhalt is not None else None
    )
    glykol = (
        gesamtinhalt * float(glykol_konzentration_pct) / 100 * float(glykol_dichte_kg_l)
        if gesamtinhalt is not None else None
    )
    reserve = ist_gesamt - erforderlich if ist_gesamt is not None and erforderlich is not None else None
    if reserve is not None and abs(reserve) < 1e-9:
        reserve = 0.0

    rechenweg = []
    if erforderlich is not None:
        rechenweg.append({
            "groesse": "Lerf",
            "formel": "Lerf = Q0 · 1000 / qE · SF",
            "eingesetzt": f"{q0:g} · 1000 / {spezifisch:g} · {faktor:g}",
            "ergebnis": f"{erforderlich:.1f} m",
        })
    if sondeninhalt is not None:
        rechenweg.append({
            "groesse": "Vrohr je m",
            "formel": "Vrohr/m = π · dᵢ² / 4 · 1 m · 1000",
            "eingesetzt": f"π · {sonden_id / 1000:g}² / 4 · 1 · 1000",
            "ergebnis": f"{rohrinhalt:.4f} l/m je Rohrstrang",
        })
        rechenweg.append({
            "groesse": "Vsonde",
            "formel": "Vsonde = n · 4 · L · Rohrinhalt",
            "eingesetzt": f"{anzahl} · 4 · {laenge:g} · {rohrinhalt:g}",
            "ergebnis": f"{sondeninhalt:.1f} l",
        })
        if anschlussinhalt > 0:
            rechenweg.append({
                "groesse": "Vanschluss",
                "formel": "Vanschluss = π · dᵢ² / 4 · Lgesamt(VL+RL) · 1000",
                "eingesetzt": (
                    f"π · {float(anschluss_innendurchmesser_mm) / 1000:g}² / 4 · "
                    f"{float(anschlussleitung_gesamt_vl_rl_m):g} · 1000"
                ),
                "ergebnis": f"{anschlussinhalt:.1f} l",
            })
        if hauptinhalt > 0:
            rechenweg.append({
                "groesse": "Vhaupt",
                "formel": "Vhaupt = π · dᵢ² / 4 · (2 · L) · 1000",
                "eingesetzt": (
                    f"π · {float(hauptleitung_innendurchmesser_mm) / 1000:g}² / 4 · "
                    f"(2 · {float(hauptleitung_m):g}) · 1000"
                ),
                "ergebnis": f"{hauptinhalt:.1f} l",
            })
        rechenweg.append({
            "groesse": "Vgesamt",
            "formel": "Vgesamt = Vsonde + Vanschluss + Vhaupt + Vzusatz",
            "eingesetzt": (
                f"{sondeninhalt:.1f} + {anschlussinhalt:.1f} + {hauptinhalt:.1f} + "
                f"{float(zusaetzlicher_inhalt_l):.1f}"
            ),
            "ergebnis": f"{gesamtinhalt:.1f} l",
        })
    if glykol is not None:
        rechenweg.append({
            "groesse": "mGlykol",
            "formel": "mGlykol = Vgesamt · Konzentration · ρGlykol",
            "eingesetzt": (
                f"{gesamtinhalt:.1f} · {float(glykol_konzentration_pct):g}/100 · "
                f"{float(glykol_dichte_kg_l):g}"
            ),
            "ergebnis": f"{glykol:.1f} kg",
        })

    druckverlust_abschnitte = []
    druckverlust_rohre_pa = foerderhoehe_rohre_mws = None
    druckverlust_verteiler_pa = foerderhoehe_verteiler_mws = None
    foerderhoehe_gesamt_mws = foerderhoehe_gesamt_kpa = None
    flow = (
        float(sole_volumenstrom_m3h)
        if sole_volumenstrom_m3h not in (None, "") else None
    )
    if flow is not None and laenge is not None:
        flow_gesamt_m3_s = flow / 3600
        flow_u_kreis_m3_s = flow_gesamt_m3_s / anzahl / 2
        rechenweg.extend([
            {
                "groesse": "V̇ gesamt",
                "formel": "V̇gesamt [m³/s] = V̇gesamt [m³/h] / 3600",
                "eingesetzt": f"{flow:g} / 3600",
                "ergebnis": f"{flow_gesamt_m3_s:.8f} m³/s",
            },
            {
                "groesse": "V̇ je U-Kreis",
                "formel": "V̇U = V̇gesamt / nSonden / 2 U-Kreise",
                "eingesetzt": f"{flow_gesamt_m3_s:.8f} / {anzahl} / 2",
                "ergebnis": f"{flow_u_kreis_m3_s:.8f} m³/s",
            },
        ])
        abschnitt_daten = [
            ("Erdsonde", flow_u_kreis_m3_s, laenge * 2, sonden_id),
        ]
        if float(anschlussleitung_kritisch_m) > 0:
            abschnitt_daten.append((
                "Anschlussleitung", flow_u_kreis_m3_s,
                float(anschlussleitung_kritisch_m) * 2,
                float(anschluss_innendurchmesser_mm),
            ))
        if float(hauptleitung_m) > 0:
            abschnitt_daten.append((
                "Hauptleitung", flow_gesamt_m3_s, float(hauptleitung_m) * 2,
                float(hauptleitung_innendurchmesser_mm),
            ))
        for name, teil_flow, laenge_vl_rl, durchmesser in abschnitt_daten:
            abschnitt, schritte = _druckverlust_abschnitt(
                name=name,
                volumenstrom_m3_s=teil_flow,
                laenge_vl_rl_m=laenge_vl_rl,
                innendurchmesser_mm=durchmesser,
                dichte_kg_m3=float(sole_dichte_kg_m3),
                viskositaet_mm2_s=float(sole_viskositaet_mm2_s),
                rauheit_mm=float(rohrrauheit_mm),
            )
            druckverlust_abschnitte.append(abschnitt)
            rechenweg.extend(schritte)

        druckverlust_rohre_pa = sum(a["druckverlust_pa"] for a in druckverlust_abschnitte)
        foerderhoehe_rohre_mws = (
            druckverlust_rohre_pa / (float(sole_dichte_kg_m3) * ERDBESCHLEUNIGUNG_M_S2)
        )
        sonden_p_dyn = druckverlust_abschnitte[0]["dynamischer_druck_pa"]
        druckverlust_verteiler_pa = float(verteiler_zeta) * sonden_p_dyn
        foerderhoehe_verteiler_mws = (
            druckverlust_verteiler_pa
            / (float(sole_dichte_kg_m3) * ERDBESCHLEUNIGUNG_M_S2)
        )
        foerderhoehe_gesamt_mws = (
            foerderhoehe_rohre_mws + foerderhoehe_verteiler_mws
            + float(wp_druckverlust_mws)
        )
        foerderhoehe_gesamt_kpa = (
            foerderhoehe_gesamt_mws * float(sole_dichte_kg_m3)
            * ERDBESCHLEUNIGUNG_M_S2 / 1000
        )
        rechenweg.extend([
            {
                "groesse": "H Rohre",
                "formel": "Hrohre = ΣΔp / (ρ · g)",
                "eingesetzt": (
                    f"{druckverlust_rohre_pa:.0f} / "
                    f"({float(sole_dichte_kg_m3):g} · {ERDBESCHLEUNIGUNG_M_S2:g})"
                ),
                "ergebnis": f"{foerderhoehe_rohre_mws:.3f} mWS",
            },
            {
                "groesse": "H Verteiler",
                "formel": "Hverteiler = ζ · (ρ · w² / 2) / (ρ · g)",
                "eingesetzt": (
                    f"{float(verteiler_zeta):g} · {sonden_p_dyn:.1f} / "
                    f"({float(sole_dichte_kg_m3):g} · {ERDBESCHLEUNIGUNG_M_S2:g})"
                ),
                "ergebnis": f"{foerderhoehe_verteiler_mws:.3f} mWS",
            },
            {
                "groesse": "H Pumpe",
                "formel": "Hpumpe = Hrohre + Hverteiler + HWP",
                "eingesetzt": (
                    f"{foerderhoehe_rohre_mws:.3f} + {foerderhoehe_verteiler_mws:.3f} + "
                    f"{float(wp_druckverlust_mws):g}"
                ),
                "ergebnis": f"{foerderhoehe_gesamt_mws:.3f} mWS bei {flow:g} m³/h",
            },
        ])

    return {
        "quellenleistung_kw": round(q0, 2) if q0 is not None else None,
        "sonden_anzahl": anzahl,
        "sonden_laenge_m": round(laenge, 1) if laenge is not None else None,
        "ist_gesamt_m": round(ist_gesamt, 1) if ist_gesamt is not None else None,
        "spezifische_entzugsleistung_w_m": spezifisch,
        "sicherheitsfaktor": faktor,
        "erforderlich_gesamt_m": round(erforderlich, 1) if erforderlich is not None else None,
        "erforderlich_pro_sonde_m": round(erforderlich_pro_sonde, 1) if erforderlich_pro_sonde is not None else None,
        "reserve_m": round(reserve, 1) if reserve is not None else None,
        "ausreichend": reserve >= 0 if reserve is not None else None,
        "sonden_aussendurchmesser_mm": sonden_aussendurchmesser_mm,
        "sonden_innendurchmesser_mm": round(sonden_id, 2),
        "rohrinhalt_l_m": rohrinhalt,
        "sondeninhalt_l": round(sondeninhalt, 1) if sondeninhalt is not None else None,
        "anschlussinhalt_l": round(anschlussinhalt, 1),
        "hauptleitungsinhalt_l": round(hauptinhalt, 1),
        "zusaetzlicher_inhalt_l": round(float(zusaetzlicher_inhalt_l), 1),
        "gesamtinhalt_l": round(gesamtinhalt, 1) if gesamtinhalt is not None else None,
        "glykol_konzentration_pct": float(glykol_konzentration_pct),
        "glykolbedarf_kg": round(glykol, 1) if glykol is not None else None,
        "sole_volumenstrom_m3h": round(flow, 4) if flow is not None else None,
        "sole_dichte_kg_m3": float(sole_dichte_kg_m3),
        "sole_viskositaet_mm2_s": float(sole_viskositaet_mm2_s),
        "rohrrauheit_mm": float(rohrrauheit_mm),
        "anschlussleitung_kritisch_m": float(anschlussleitung_kritisch_m),
        "anschlussleitung_gesamt_vl_rl_m": float(anschlussleitung_gesamt_vl_rl_m),
        "anschluss_innendurchmesser_mm": float(anschluss_innendurchmesser_mm),
        "hauptleitung_m": float(hauptleitung_m),
        "hauptleitung_innendurchmesser_mm": float(hauptleitung_innendurchmesser_mm),
        "wp_druckverlust_mws": float(wp_druckverlust_mws),
        "verteiler_zeta": float(verteiler_zeta),
        "druckverlust_abschnitte": [
            {
                **a,
                "volumenstrom_m3_s": round(a["volumenstrom_m3_s"], 8),
                "geschwindigkeit_m_s": round(a["geschwindigkeit_m_s"], 4),
                "reynolds": round(a["reynolds"]),
                "lambda": round(a["lambda"], 6),
                "dynamischer_druck_pa": round(a["dynamischer_druck_pa"], 1),
                "druckverlust_pa": round(a["druckverlust_pa"], 1),
            }
            for a in druckverlust_abschnitte
        ],
        "druckverlust_rohre_pa": round(druckverlust_rohre_pa, 1) if druckverlust_rohre_pa is not None else None,
        "foerderhoehe_rohre_mws": round(foerderhoehe_rohre_mws, 3) if foerderhoehe_rohre_mws is not None else None,
        "druckverlust_verteiler_pa": round(druckverlust_verteiler_pa, 1) if druckverlust_verteiler_pa is not None else None,
        "foerderhoehe_verteiler_mws": round(foerderhoehe_verteiler_mws, 3) if foerderhoehe_verteiler_mws is not None else None,
        "foerderhoehe_gesamt_mws": round(foerderhoehe_gesamt_mws, 3) if foerderhoehe_gesamt_mws is not None else None,
        "foerderhoehe_gesamt_kpa": round(foerderhoehe_gesamt_kpa, 2) if foerderhoehe_gesamt_kpa is not None else None,
        "rechenweg": rechenweg,
    }
