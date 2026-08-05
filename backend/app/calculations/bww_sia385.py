"""Brauchwarmwasser nach SIA 385/2 — Speichervolumen und Anschlussleistung.

Quelle: `Warmwasser-Berechnung_SIA385.xlsm`, Blätter `Belegungsdaten`,
`Speichervolumen` und die zugehörigen Wertetabellen. Die Formeln sind 1:1
übernommen; bewusste Abweichungen und Unstimmigkeiten der Vorlage stehen in
PHYSIK.md §22 und erscheinen als Warnung.

Rechengang:

    Nutzfläche je Wohnung   → Personen  np,i = 3.3 − 2/(1 + (A_NF/100)³)
    np · V_W,u · f_warm     → Nutzwarmwasserbedarf  V_W,d,1
    V_W,d,1 / n_z           → Steuervolumen         V_W,sto,ctrl
    np · V_W,u,pk · f_pk    → Spitzendeckungsvolumen V_W,sto,pk
    ctrl + pk               → Bereitschaftsvolumen  V_W,sto,cont
    V_sto · cp · Δθ / …     → Anschlussleistung     Q_A
"""

import math
from typing import Optional

from app.calculations.einzel import _schritt, _z

# Bezugseinheiten Wohnungsbau in l/(d·P), Blatt `Werte Bezugseinheit`.
BEZUGSEINHEITEN = {
    "efh_einfach": {"label": "EFH einfacher Standard", "spitze": 50, "durchschnitt": 40},
    "efh_mittel": {"label": "EFH mittlerer Standard", "spitze": 60, "durchschnitt": 45},
    "efh_gehoben": {"label": "EFH gehobener Standard", "spitze": 70, "durchschnitt": 55},
    "ew_einfach": {"label": "Eigentumswohnung einfacher Standard", "spitze": 50, "durchschnitt": 40},
    "ew_mittel": {"label": "Eigentumswohnung mittlerer Standard", "spitze": 60, "durchschnitt": 45},
    "ew_gehoben": {"label": "Eigentumswohnung gehobener Standard", "spitze": 70, "durchschnitt": 55},
    "mfh_allgemein": {"label": "MFH allgemeiner Wohnungsbau", "spitze": 45, "durchschnitt": 35},
    "mfh_gehoben": {"label": "MFH gehobener Wohnungsbau", "spitze": 60, "durchschnitt": 45},
}

# Faktor Warmhaltesystem, Blatt `Werte Warmhaltesystem`.
WARMHALTESYSTEME = {
    "zirkulation": {"label": "Zirkulation", "faktor": 1.5},
    "warmhalteband": {"label": "Warmhalteband", "faktor": 1.35},
}

# Faktor Speicherkonfiguration, Blatt `Werte Speicherkonfig.`.
SPEICHERKONFIGURATIONEN = {
    "innen": {"label": "Innenliegender Wärmetauscher", "faktor": 1.25},
    "aussen": {"label": "Aussenliegender Wärmetauscher", "faktor": 1.1},
}

# Spitzendeckungsfaktor nach Personenzahl, Blatt `Werte Spitzendeckung`.
# Nur die Stufen; dazwischen gilt der zuletzt erreichte Wert (VLOOKUP mit WAHR).
SPITZENDECKUNG_STUFEN = [
    (1, 1.5), (2, 0.83), (3, 0.67), (4, 0.58), (5, 0.56), (6, 0.55), (7, 0.54),
    (9, 0.53), (12, 0.52), (15, 0.51), (18, 0.50), (22, 0.49), (24, 0.48),
    (26, 0.47), (27, 0.46), (28, 0.45), (29, 0.44), (30, 0.43), (32, 0.42),
    (33, 0.41), (35, 0.40), (37, 0.39), (39, 0.38), (50, 0.36), (60, 0.34),
    (70, 0.32), (80, 0.30), (90, 0.29), (100, 0.28), (125, 0.25), (150, 0.24),
    (175, 0.22), (200, 0.20), (225, 0.19), (250, 0.18), (275, 0.17),
    (300, 0.16), (301, 0.15),
]

CP_WASSER_KJ_KGK = 4.187


def _zahl(x) -> Optional[float]:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def personen_aus_nutzflaeche(nutzflaeche_m2: float) -> float:
    """Personen je Wohneinheit aus der Nutzfläche (Blatt `Belegungsdaten`).

    `np,i = 3.3 − 2 / (1 + (A_NF/100)³)`
    """
    a = float(nutzflaeche_m2)
    if a <= 0:
        raise ValueError("Nutzfläche muss > 0 sein")
    return 3.3 - 2 / (1 + (a / 100) ** 3)


def spitzendeckungsfaktor(personen: float) -> float:
    """Stufentabelle wie VLOOKUP mit WAHR: der zuletzt erreichte Wert gilt."""
    np_ = max(1, round(float(personen)))
    faktor = SPITZENDECKUNG_STUFEN[0][1]
    for grenze, wert in SPITZENDECKUNG_STUFEN:
        if np_ >= grenze:
            faktor = wert
        else:
            break
    return faktor


def _mround(wert: float, schritt: float) -> float:
    """Excel MROUND — auf ein Vielfaches runden."""
    if schritt <= 0:
        return wert
    return round(wert / schritt) * schritt


def _schritt_latex(groesse: str, formel: str, eingesetzt: str, ergebnis: str,
                   formel_latex: str, eingesetzt_latex: Optional[str] = None,
                   gruppe: str = "Brauchwarmwasser") -> dict:
    """Rechenschritt für UI/PDF, zusätzlich mit lesbarer Bruchdarstellung."""
    schritt = _schritt(groesse, formel, eingesetzt, ergebnis)
    schritt["formel_latex"] = formel_latex
    if eingesetzt_latex:
        schritt["eingesetzt_latex"] = eingesetzt_latex
    schritt["gruppe"] = gruppe
    return schritt


def _wohnungen_aufbereiten(wohnungen: Optional[list]) -> tuple[list, list]:
    """Strukturierte Wohnungszeilen validieren und Personen je Zeile rechnen."""
    zeilen, fehler = [], []
    for index, eintrag in enumerate(wohnungen or [], start=1):
        if not isinstance(eintrag, dict):
            fehler.append(f"Wohnung {index}: ungültige Belegungszeile.")
            continue
        name = str(eintrag.get("name") or f"Wohnung {index}").strip()
        flaeche = _zahl(eintrag.get("flaeche_m2"))
        if flaeche is None:
            continue
        if flaeche <= 0:
            fehler.append(f"{name}: Nutzfläche muss grösser als 0 m² sein.")
            continue
        zeilen.append({
            "id": str(eintrag.get("id") or f"wohnung-{index}"),
            "name": name,
            "flaeche_m2": round(flaeche, 2),
            "personen": round(personen_aus_nutzflaeche(flaeche), 4),
        })
    return zeilen, fehler


def bww_auslegung(
    *,
    personen: Optional[float] = None,
    nutzflaechen_m2: Optional[list] = None,
    wohnungen: Optional[list] = None,
    bezugseinheit_key: str = "mfh_allgemein",
    bezugseinheit_durchschnitt: Optional[float] = None,
    bezugseinheit_spitze: Optional[float] = None,
    warmhaltesystem: str = "zirkulation",
    speicherkonfiguration: str = "aussen",
    ladezyklen_pro_tag: float = 2,
    ladezeit_h: float = 2,
    temperaturerhoehung_k: float = 50,
    wirkungsgrad: float = 0.95,
    gewaehltes_speichervolumen_l: Optional[float] = None,
) -> dict:
    """Speichervolumen und Anschlussleistung nach SIA 385/2.

    Entweder `personen` direkt oder `nutzflaechen_m2` je Wohnung angeben.
    Die Bezugseinheiten kommen aus der Tabelle, lassen sich aber überschreiben.
    """
    warnungen = []
    rechenweg = []

    # ── Personen ────────────────────────────────────────────────────────────
    wohnungszeilen, wohnungsfehler = _wohnungen_aufbereiten(wohnungen)
    warnungen.extend(wohnungsfehler)
    if wohnungszeilen:
        einzeln = [w["personen"] for w in wohnungszeilen]
        np_ = sum(einzeln)
        flaechen = [w["flaeche_m2"] for w in wohnungszeilen]
        rechenweg.append(_schritt_latex(
            "n_{p,i}", "np,i = 3.3 − 2 / (1 + (A_NF/100)³), summiert",
            " + ".join(f"{p:.2f}" for p in einzeln), f"{np_:.2f} P",
            r"n_{p,i}=3.3-\frac{2}{1+\left(\frac{A_{NF,i}}{100}\right)^3}",
            " + ".join(f"{p:.2f}" for p in einzeln), gruppe="Belegungsdaten"))
    elif nutzflaechen_m2:
        flaechen = [float(a) for a in nutzflaechen_m2 if _zahl(a)]
        einzeln = [personen_aus_nutzflaeche(a) for a in flaechen]
        np_ = sum(einzeln)
        wohnungszeilen = [
            {"id": f"wohnung-{i}", "name": f"Wohnung {i}",
             "flaeche_m2": round(a, 2), "personen": round(p, 4)}
            for i, (a, p) in enumerate(zip(flaechen, einzeln), start=1)
        ]
        rechenweg.append(_schritt_latex(
            "n_{p,i}", "np,i = 3.3 − 2 / (1 + (A_NF/100)³), summiert",
            " + ".join(f"{p:.2f}" for p in einzeln), f"{np_:.2f} P",
            r"n_{p,i}=3.3-\frac{2}{1+\left(\frac{A_{NF,i}}{100}\right)^3}",
            " + ".join(f"{p:.2f}" for p in einzeln), gruppe="Belegungsdaten"))
    else:
        np_ = _zahl(personen)
        if np_ is None or np_ <= 0:
            return {"warnungen": ["Personenzahl oder Nutzflächen fehlen; "
                                  "ohne sie ist keine BWW-Auslegung möglich."]}

    if bezugseinheit_key not in BEZUGSEINHEITEN:
        raise ValueError(f"Unbekannte Bezugseinheit: {bezugseinheit_key}")
    if warmhaltesystem not in WARMHALTESYSTEME:
        raise ValueError(f"Unbekanntes Warmhaltesystem: {warmhaltesystem}")
    if speicherkonfiguration not in SPEICHERKONFIGURATIONEN:
        raise ValueError(f"Unbekannte Speicherkonfiguration: {speicherkonfiguration}")

    bezug = BEZUGSEINHEITEN[bezugseinheit_key]
    v_u = _zahl(bezugseinheit_durchschnitt)
    v_u = v_u if v_u and v_u > 0 else bezug["durchschnitt"]
    v_u_pk = _zahl(bezugseinheit_spitze)
    v_u_pk = v_u_pk if v_u_pk and v_u_pk > 0 else bezug["spitze"]

    f_warm = WARMHALTESYSTEME[warmhaltesystem]["faktor"]
    f_sto = SPEICHERKONFIGURATIONEN[speicherkonfiguration]["faktor"]
    f_pk = spitzendeckungsfaktor(np_)

    n_z = _zahl(ladezyklen_pro_tag) or 0
    t_z = _zahl(ladezeit_h) or 0
    d_theta = _zahl(temperaturerhoehung_k) or 0
    eta = _zahl(wirkungsgrad) or 0
    if n_z <= 0 or t_z <= 0 or d_theta <= 0 or not 0 < eta <= 1:
        raise ValueError("Ladezyklen, Ladezeit, ΔΘ und Wirkungsgrad müssen positiv sein "
                         "(Wirkungsgrad ≤ 1)")

    # ── Volumen ─────────────────────────────────────────────────────────────
    v_tag = np_ * v_u * f_warm
    v_ctrl = v_tag / n_z
    v_pk = np_ * v_u_pk * f_pk
    v_cont = v_ctrl + v_pk

    rechenweg.extend([
        _schritt_latex("V_{W,d,1}", "V = np · V_W,u · f_Warmhaltesystem",
                       f"{np_:.2f} · {_z(v_u, 1)} · {_z(f_warm, 2)}", f"{v_tag:.0f} l/d",
                       r"V_{W,d,1}=n_p\cdot V_{W,u}\cdot f_{warm}"),
        _schritt_latex("V_{W,sto,ctrl}", "V = V_W,d,1 / n_z",
                       f"{v_tag:.0f} / {_z(n_z, 1)}", f"{v_ctrl:.0f} l",
                       r"V_{W,sto,ctrl}=\frac{V_{W,d,1}}{n_z}"),
        _schritt_latex("V_{W,sto,pk}", "V = np · V_W,u,pk · f_pk",
                       f"{np_:.2f} · {_z(v_u_pk, 1)} · {_z(f_pk, 2)}", f"{v_pk:.0f} l",
                       r"V_{W,sto,pk}=n_p\cdot V_{W,u,pk}\cdot f_{pk}"),
        _schritt_latex("V_{W,sto,cont}", "V = V_sto,ctrl + V_sto,pk",
                       f"{v_ctrl:.0f} + {v_pk:.0f}", f"{v_cont:.0f} l",
                       r"V_{W,sto,cont}=V_{W,sto,ctrl}+V_{W,sto,pk}"),
    ])

    # Die Vorlage berechnet den Faktor Speicherkonfiguration, verwendet ihn aber
    # in keiner Formel. Er wird deshalb ausgewiesen, nicht still eingerechnet.
    warnungen.append(
        f"Faktor Speicherkonfiguration {f_sto:g} "
        f"({SPEICHERKONFIGURATIONEN[speicherkonfiguration]['label']}) ist in der "
        f"Vorlage berechnet, aber in keiner Formel verwendet. Mit ihm wären es "
        f"{v_cont * f_sto:.0f} l statt {v_cont:.0f} l — fachlich zu klären."
    )

    gewaehlt = _zahl(gewaehltes_speichervolumen_l)
    massgebend = gewaehlt if gewaehlt and gewaehlt > 0 else v_cont
    if gewaehlt and gewaehlt > 0 and gewaehlt < v_cont:
        warnungen.append(
            f"Gewählter Speicher {gewaehlt:.0f} l ist kleiner als das "
            f"Bereitschaftsvolumen {v_cont:.0f} l."
        )

    # ── Anschlussleistung ───────────────────────────────────────────────────
    # Vorlage: Q_A = MROUND( V · cp · ΔΘ / (n_z · t_z · 3600 · η), 0.5 )
    q_a_roh = massgebend * CP_WASSER_KJ_KGK * d_theta / (n_z * t_z * 3600 * eta)
    q_a = _mround(q_a_roh, 0.5)
    rechenweg.append(_schritt_latex(
        "Q_A", "Q = V · cp · ΔΘ / (n_z · t_z · 3600 · η)",
        f"{massgebend:.0f} · {CP_WASSER_KJ_KGK} · {_z(d_theta, 1)} / "
        f"({_z(n_z, 1)} · {_z(t_z, 1)} · 3600 · {_z(eta, 2)})",
        f"{q_a:.1f} kW",
        r"Q_A=\frac{V_{W,sto}\cdot c_p\cdot\Delta\theta}"
        r"{n_z\cdot t_z\cdot3600\cdot\eta}", gruppe="Leistungsberechnung"))

    # Ein Ladezyklus lädt den Speicher in t_z. Die Vorlage teilt zusätzlich
    # durch n_z, verteilt die Ladung also über alle Zyklen zusammen.
    q_a_je_zyklus = _mround(massgebend * CP_WASSER_KJ_KGK * d_theta / (t_z * 3600 * eta), 0.5)
    if abs(q_a_je_zyklus - q_a) > 0.5:
        warnungen.append(
            f"Vorlagenformel teilt durch n_z · t_z ({n_z:g} · {t_z:g} h) und ergibt "
            f"{q_a:.1f} kW. Wird der Speicher in einem Zyklus von {t_z:g} h geladen, "
            f"sind es {q_a_je_zyklus:.1f} kW. Bezug von t_z fachlich festlegen."
        )

    return {
        "personen": round(np_, 2),
        "wohnungen": wohnungszeilen,
        "bezugseinheit": bezug["label"],
        "bezugseinheit_durchschnitt_l_p_d": v_u,
        "bezugseinheit_spitze_l_p_d": v_u_pk,
        "warmhaltesystem": WARMHALTESYSTEME[warmhaltesystem]["label"],
        "faktor_warmhaltesystem": f_warm,
        "faktor_spitzendeckung": f_pk,
        "faktor_speicherkonfiguration": f_sto,
        "speicherkonfiguration": SPEICHERKONFIGURATIONEN[speicherkonfiguration]["label"],
        "ladezyklen_pro_tag": n_z,
        "ladezeit_h": t_z,
        "temperaturerhoehung_k": d_theta,
        "wirkungsgrad": eta,
        "nutzwarmwasserbedarf_l_d": round(v_tag),
        "steuervolumen_l": round(v_ctrl),
        "spitzendeckungsvolumen_l": round(v_pk),
        "bereitschaftsvolumen_l": round(v_cont),
        "gewaehltes_speichervolumen_l": round(gewaehlt) if gewaehlt else None,
        "massgebendes_volumen_l": round(massgebend),
        "anschlussleistung_kw": round(q_a, 2),
        "anschlussleistung_je_zyklus_kw": round(q_a_je_zyklus, 2),
        "rechenweg": rechenweg,
        "warnungen": warnungen,
    }


def leistungsabgleich(resultat: dict, waermepumpenleistung_kw: Optional[float],
                      quelle: str = "Nennleistung") -> dict:
    """BWW-Anschlussleistung gegen die verfügbare Wärmepumpenleistung prüfen.

    Die Berechnung selbst bleibt unverändert. Dieser Schritt zeigt lediglich,
    ob der gewählte Ladebetrieb mit der angeschlossenen Wärmepumpe möglich ist
    und welche Ladezeit bzw. Zykluszahl die Excel-Formel mindestens benötigt.
    """
    leistung = _zahl(waermepumpenleistung_kw)
    bedarf = _zahl(resultat.get("anschlussleistung_kw"))
    if not leistung or leistung <= 0 or bedarf is None:
        return resultat

    reserve = leistung - bedarf
    resultat["waermepumpenleistung_kw"] = round(leistung, 2)
    resultat["waermepumpenleistung_quelle"] = quelle
    resultat["leistung_ausreichend"] = reserve >= 0
    resultat["leistungsreserve_kw"] = round(reserve, 2)
    if reserve >= 0:
        return resultat

    volumen = _zahl(resultat.get("massgebendes_volumen_l")) or 0
    n_z = _zahl(resultat.get("ladezyklen_pro_tag")) or 0
    t_z = _zahl(resultat.get("ladezeit_h")) or 0
    d_theta = _zahl(resultat.get("temperaturerhoehung_k")) or 0
    eta = _zahl(resultat.get("wirkungsgrad")) or 0
    cp = CP_WASSER_KJ_KGK

    ladezeit_min = None
    if volumen > 0 and n_z > 0 and d_theta > 0 and eta > 0:
        roh = volumen * cp * d_theta / (n_z * leistung * 3600 * eta)
        ladezeit_min = math.ceil(roh * 10) / 10
        resultat["ladezeit_min_fuer_wp_h"] = round(ladezeit_min, 1)

    v_tag = _zahl(resultat.get("nutzwarmwasserbedarf_l_d")) or 0
    v_pk = _zahl(resultat.get("spitzendeckungsvolumen_l")) or 0
    gewaehlt = _zahl(resultat.get("gewaehltes_speichervolumen_l"))
    zyklen_min = None
    if v_tag > 0 and t_z > 0 and d_theta > 0 and eta > 0:
        start = max(1, math.ceil(n_z))
        for zyklen in range(start + 1, 13):
            v_ctrl = v_tag / zyklen
            v_cont = v_ctrl + v_pk
            massgebend = gewaehlt if gewaehlt and gewaehlt > 0 else v_cont
            q = _mround(
                massgebend * cp * d_theta / (zyklen * t_z * 3600 * eta), 0.5)
            if q <= leistung:
                zyklen_min = zyklen
                resultat["ladezyklen_min_fuer_wp"] = zyklen
                resultat["speichervolumen_bei_zyklen_l"] = round(v_cont)
                resultat["anschlussleistung_bei_zyklen_kw"] = round(q, 2)
                break

    optionen = []
    if ladezeit_min is not None:
        optionen.append(f"Ladezeit auf mindestens {ladezeit_min:.1f} h erhöhen")
    if zyklen_min is not None:
        optionen.append(f"auf mindestens {zyklen_min} Ladezyklen pro Tag erhöhen")
    hinweis = "; oder ".join(optionen) if optionen else "Ladebetrieb oder Wärmepumpe anpassen"
    resultat.setdefault("warnungen", []).append(
        f"BWW-Anschlussleistung {bedarf:.1f} kW ist höher als die verfügbare "
        f"Wärmepumpenleistung {leistung:.1f} kW ({quelle}). {hinweis}."
    )
    return resultat
