"""Auslegungen für Bauteile im Hydraulikschema.

Die Funktionen sind bewusst unabhängig vom Graphen. Der Graph bestimmt die
automatischen Eingaben; hier leben nur Formeln, Einheiten und Rechenweg.
"""

from typing import Optional

from app.calculations.einzel import speichervolumen_wp
from app.calculations.grundlagen import mit_grundlage


ROHRINHALT_L_M = {25: 0.327, 32: 0.531, 40: 0.835}


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
    return mit_grundlage({
        **result,
        "leistung_kw": round(leistung, 2),
        "vorlauf_max_c": round(vorlauf, 1),
        "speicher_oben_c": round(oben, 1),
        "speicher_unten_c": round(ruecklauf, 1),
        "ueberdeckung_k": round(ueberdeckung, 1),
        "ueberbrueckung_min": round(float(ueberbrueckung_min), 1),
    }, 'schema_sizing')


def erdsondenfeld(
    *,
    quellenleistung_kw: Optional[float],
    sonden_anzahl: int,
    sonden_laenge_m: Optional[float],
    spezifische_entzugsleistung_w_m: Optional[float],
    sicherheitsfaktor: float = 1.10,
    sonden_aussendurchmesser_mm: int = 32,
    straenge_je_sonde: int = 4,
    glykol_konzentration_pct: float = 30.0,
    glykol_dichte_kg_l: float = 1.14,
    zusaetzlicher_inhalt_l: float = 0.0,
) -> dict:
    """Erdsondenfeld: Bohrmeter sowie Sonden-/Glykolinhalt.

    `straenge_je_sonde` ist die Zahl der Rohrstränge je Sondenmeter:
    Duplex (2 U-Rohre) = 4, Einfach-U = 2. Die standortabhängige
    Entzugsleistung bleibt eine sichtbare Eingabe. Eine pauschale
    EED-/Bohrtiefenempfehlung wird nicht aus den ortsgebundenen Tabellen der
    Vorlage abgeleitet.
    """
    anzahl = int(sonden_anzahl)
    if anzahl <= 0:
        raise ValueError("Sondenanzahl muss > 0 sein")
    if sonden_aussendurchmesser_mm not in ROHRINHALT_L_M:
        raise ValueError("Sondenrohr muss 25, 32 oder 40 mm sein")
    if straenge_je_sonde not in (2, 4):
        raise ValueError("Rohrstränge je Sonde müssen 2 (Einfach-U) oder 4 (Duplex) sein")
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

    ist_gesamt = anzahl * laenge if laenge else None
    erforderlich = q0 * 1000 / spezifisch * faktor if q0 and spezifisch else None
    erforderlich_pro_sonde = erforderlich / anzahl if erforderlich else None
    rohrinhalt = ROHRINHALT_L_M[sonden_aussendurchmesser_mm]
    # Duplexsonde = zwei U-Rohre = vier Rohrstränge je Sondenmeter, Einfach-U
    # = zwei. Der Solekreis rechnet mit derselben Zahl, sonst stünden im Export
    # zwei verschiedene Sondeninhalte.
    sondeninhalt = anzahl * straenge_je_sonde * laenge * rohrinhalt if laenge else None
    gesamtinhalt = (
        sondeninhalt + float(zusaetzlicher_inhalt_l)
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
            "formel_latex": r"L_{\mathrm{erf}} = \frac{Q_0 \cdot 1000}{q_E} \cdot SF",
            "eingesetzt": f"{q0:g} · 1000 / {spezifisch:g} · {faktor:g}",
            "eingesetzt_latex": (
                rf"\frac{{{q0:g} \cdot 1000}}{{{spezifisch:g}}} \cdot {faktor:g}"
            ),
            "ergebnis": f"{erforderlich:.1f} m",
        })
    if sondeninhalt is not None:
        rechenweg.append({
            "groesse": "Vsonde",
            "formel": "Vsonde = n · Stränge · L · Rohrinhalt",
            "formel_latex": (
                r"V_{\mathrm{Sonden}} = n \cdot N_{\mathrm{Stränge}} \cdot L "
                r"\cdot v_{\mathrm{Rohr}}"
            ),
            "eingesetzt": f"{anzahl} · {straenge_je_sonde} · {laenge:g} · {rohrinhalt:g}",
            "eingesetzt_latex": (
                rf"{anzahl} \cdot {straenge_je_sonde} \cdot {laenge:g} \cdot {rohrinhalt:g}"
            ),
            "ergebnis": f"{sondeninhalt:.1f} l",
        })
    if glykol is not None:
        rechenweg.append({
            "groesse": "mGlykol",
            "formel": "mGlykol = Vgesamt · Konzentration · ρGlykol",
            "formel_latex": (
                r"m_{\mathrm{Glykol}} = V_{\mathrm{gesamt}} \cdot "
                r"\frac{c}{100} \cdot \rho_{\mathrm{Glykol}}"
            ),
            "eingesetzt": (
                f"{gesamtinhalt:.1f} · {float(glykol_konzentration_pct):g}/100 · "
                f"{float(glykol_dichte_kg_l):g}"
            ),
            "eingesetzt_latex": (
                rf"{gesamtinhalt:.1f} \cdot "
                rf"\frac{{{float(glykol_konzentration_pct):g}}}{{100}} \cdot "
                rf"{float(glykol_dichte_kg_l):g}"
            ),
            "ergebnis": f"{glykol:.1f} kg",
        })

    return mit_grundlage({
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
        "straenge_je_sonde": straenge_je_sonde,
        "rohrinhalt_l_m": rohrinhalt,
        "sondeninhalt_l": round(sondeninhalt, 1) if sondeninhalt is not None else None,
        "zusaetzlicher_inhalt_l": round(float(zusaetzlicher_inhalt_l), 1),
        "gesamtinhalt_l": round(gesamtinhalt, 1) if gesamtinhalt is not None else None,
        "glykol_konzentration_pct": float(glykol_konzentration_pct),
        "glykolbedarf_kg": round(glykol, 1) if glykol is not None else None,
        "rechenweg": rechenweg,
    }, 'schema_sizing')
