"""Kleine, projektunabhängige Heizungsberechnungen.

Die Formeln sind aus den bereitgestellten Excel-Arbeitsblättern abgeleitet und
hier bewusst als kurze, testbare Rechenkerne gehalten. Einheiten werden an der
Funktionsgrenze festgelegt, damit im Frontend keine zweite Rechenwahrheit
entsteht.

Jede Funktion liefert neben den Zahlen einen `rechenweg`: Formel, eingesetzte
Werte und Zwischenergebnis je Schritt. Damit kann der Export zeigen, wie eine
Zahl zustande kam, statt sie nur zu behaupten.
"""


def _positiv(name: str, wert: float, *, null_erlaubt: bool = False) -> float:
    wert = float(wert)
    if wert < 0 or (wert == 0 and not null_erlaubt):
        raise ValueError(f"{name} muss {'≥ 0' if null_erlaubt else '> 0'} sein")
    return wert


def _z(wert: float, dez: int = 2) -> str:
    """Zahl fürs Auge: keine unnötigen Nullen, aber genug Stellen zum Nachrechnen."""
    text = f"{float(wert):.{dez}f}".rstrip("0").rstrip(".")
    return text or "0"


def _schritt(groesse: str, formel: str, eingesetzt: str, ergebnis: str) -> dict:
    return {"groesse": groesse, "formel": formel, "eingesetzt": eingesetzt, "ergebnis": ergebnis}


def waermetauscherflaeche(leistung_kw: float, u_wert_w_m2k: float, delta_t_lm_k: float) -> dict:
    q = _positiv("Leistung", leistung_kw)
    u = _positiv("U-Wert", u_wert_w_m2k)
    delta_t = _positiv("Temperaturdifferenz", delta_t_lm_k)
    flaeche = q * 1000 / (u * delta_t)
    return {
        "flaeche_m2": round(flaeche, 3),
        "leistung_kw": q,
        "rechenweg": [
            _schritt(
                "A", "A = Q · 1000 / (U · Δθlm)",
                f"{_z(q)} · 1000 / ({_z(u)} · {_z(delta_t)})",
                f"{_z(flaeche, 3)} m²",
            ),
        ],
    }


def druckverlust_kvs(volumenstrom_m3h: float, kvs: float) -> dict:
    volumenstrom = _positiv("Volumenstrom", volumenstrom_m3h)
    kvs = _positiv("kvs", kvs)
    dp_kpa = (volumenstrom / kvs) ** 2 * 100
    return {
        "druckverlust_kpa": round(dp_kpa, 3),
        "druckverlust_bar": round(dp_kpa / 100, 5),
        "rechenweg": [
            _schritt(
                "Δp", "Δp = (V / kvs)² · 100",
                f"({_z(volumenstrom)} / {_z(kvs)})² · 100",
                f"{_z(dp_kpa, 3)} kPa",
            ),
            _schritt("Δp", "Δp [bar] = Δp [kPa] / 100", f"{_z(dp_kpa, 3)} / 100", f"{_z(dp_kpa / 100, 5)} bar"),
        ],
    }


def rohrausdehnung(laenge_m: float, temperaturdifferenz_k: float, alpha_mm_mk: float = 0.0115) -> dict:
    laenge = _positiv("Rohrlänge", laenge_m)
    delta_t = _positiv("Temperaturdifferenz", temperaturdifferenz_k, null_erlaubt=True)
    alpha = _positiv("Ausdehnungskoeffizient", alpha_mm_mk)
    aenderung_mm = laenge * delta_t * alpha
    return {
        "laengenaenderung_mm": round(aenderung_mm, 2),
        "endlaenge_m": round(laenge + aenderung_mm / 1000, 5),
        "rechenweg": [
            _schritt(
                "ΔL", "ΔL = L · Δθ · α",
                f"{_z(laenge)} · {_z(delta_t)} · {_z(alpha, 4)}",
                f"{_z(aenderung_mm)} mm",
            ),
            _schritt(
                "L₁", "L₁ = L + ΔL / 1000",
                f"{_z(laenge)} + {_z(aenderung_mm)} / 1000",
                f"{_z(laenge + aenderung_mm / 1000, 5)} m",
            ),
        ],
    }


def waermepumpenleistung(leistung_kw: float, cop: float, bekannte_seite: str = "heizung") -> dict:
    leistung = _positiv("Leistung", leistung_kw)
    cop = _positiv("COP", cop)
    if cop <= 1:
        raise ValueError("COP muss > 1 sein")
    if bekannte_seite == "quelle":
        heizleistung = leistung * cop / (cop - 1)
        quellenleistung = leistung
        erster = _schritt(
            "Qh", "Qh = Q0 · COP / (COP − 1)",
            f"{_z(leistung)} · {_z(cop)} / ({_z(cop)} − 1)", f"{_z(heizleistung)} kW",
        )
    else:
        heizleistung = leistung
        quellenleistung = leistung - leistung / cop
        erster = _schritt(
            "Q0", "Q0 = Qh − Qh / COP",
            f"{_z(leistung)} − {_z(leistung)} / {_z(cop)}", f"{_z(quellenleistung)} kW",
        )
    elektrische_leistung = heizleistung / cop
    return {
        "heizleistung_kw": round(heizleistung, 2),
        "quellenleistung_kw": round(quellenleistung, 2),
        "elektrische_leistung_kw": round(elektrische_leistung, 2),
        "rechenweg": [
            erster,
            _schritt(
                "Pel", "Pel = Qh / COP",
                f"{_z(heizleistung)} / {_z(cop)}", f"{_z(elektrische_leistung)} kW",
            ),
        ],
    }


def speichervolumen_wp(
    leistung_kw: float,
    ueberbrueckung_min: float,
    delta_t_k: float,
    dichte_kg_m3: float = 988,
    waermekapazitaet_kj_kgk: float = 4.187,
) -> dict:
    leistung = _positiv("Leistung", leistung_kw)
    minuten = _positiv("Überbrückungszeit", ueberbrueckung_min)
    delta_t = _positiv("Temperaturdifferenz", delta_t_k)
    dichte = _positiv("Dichte", dichte_kg_m3)
    c = _positiv("Wärmekapazität", waermekapazitaet_kj_kgk)
    volumen_l = leistung * minuten * 60 / (c * delta_t * dichte) * 1000
    return {
        "speichervolumen_l": round(volumen_l),
        "richtwert_25_l_kw": round(leistung * 25),
        "rechenweg": [
            _schritt(
                "V", "V = Q · t · 60 / (c · Δθ · ρ) · 1000",
                f"{_z(leistung)} · {_z(minuten)} · 60 / ({_z(c, 3)} · {_z(delta_t)} · {_z(dichte)}) · 1000",
                f"{round(volumen_l)} l",
            ),
            _schritt(
                "Vref", "Vref = Q · 25 l/kW",
                f"{_z(leistung)} · 25", f"{round(leistung * 25)} l",
            ),
        ],
    }


def jahresenergie(
    heizleistung_kw: float,
    vollbetriebsstunden_h_d: float,
    heizgradtage_kd_a: float,
    auslegungs_delta_t_k: float,
    kuehlleistung_kw: float = 0,
    kuehl_vollbetriebsstunden_h_d: float = 0,
    kuehlgradtage_kd_a: float = 0,
    kuehl_delta_t_k: float = 0,
    bww_m3_d: float = 0,
    bww_tage_a: float = 365,
    bww_delta_t_k: float = 50,
    bww_verlustfaktor: float = 1.5,
    bww_dichte_kg_m3: float = 998,
    bww_c_kj_kgk: float = 4.187,
) -> dict:
    """Jahresenergiebedarf nach «Jahresenergiebedarf Heizung und BWW.xlsx».

    Das Blatt rechnet zwei Gradtaganteile und zählt sie zu Qh zusammen: den
    Heizanteil über die Heizgradtage und einen Kühlanteil über die Kühlgradtage.
    Der Kühlanteil fällt weg, solange seine Felder leer sind — dann ist Qh der
    reine Heizanteil.
    """
    leistung = _positiv("Heizleistung", heizleistung_kw)
    stunden = _positiv("Vollbetriebsstunden", vollbetriebsstunden_h_d)
    hgt = _positiv("Heizgradtage", heizgradtage_kd_a)
    delta_t = _positiv("Auslegungs-Temperaturdifferenz", auslegungs_delta_t_k)

    k_leistung = _positiv("Kühlleistung", kuehlleistung_kw, null_erlaubt=True)
    k_stunden = _positiv("Vollbetriebsstunden Kühlung", kuehl_vollbetriebsstunden_h_d, null_erlaubt=True)
    kgt = _positiv("Kühlgradtage", kuehlgradtage_kd_a, null_erlaubt=True)
    k_delta_t = _positiv("Temperaturdifferenz Kühlung", kuehl_delta_t_k, null_erlaubt=True)

    bww = _positiv("BWW-Tagesverbrauch", bww_m3_d, null_erlaubt=True)
    tage = _positiv("BWW-Nutzungstage", bww_tage_a)
    bww_delta = _positiv("BWW-Temperaturdifferenz", bww_delta_t_k)
    verlust = _positiv("BWW-Verlustfaktor", bww_verlustfaktor)
    dichte = _positiv("BWW-Dichte", bww_dichte_kg_m3)
    c = _positiv("BWW-Wärmekapazität", bww_c_kj_kgk)

    heizung_kwh = leistung * stunden * hgt / delta_t
    rechenweg = [
        _schritt(
            "Qh,Heizen", "Q = td · HGT · Q / Δθmax",
            f"{_z(stunden)} · {_z(hgt)} · {_z(leistung)} / {_z(delta_t)}",
            f"{round(heizung_kwh)} kWh/a",
        ),
    ]

    # Der Kühlanteil ist im Blatt derselbe Ansatz mit Kühlgradtagen. Fehlt eine
    # der vier Angaben, gibt es keinen Kühlanteil — und keine Division durch 0.
    kuehlung_kwh = 0.0
    if k_leistung and k_stunden and kgt and k_delta_t:
        kuehlung_kwh = k_stunden * kgt * k_leistung / k_delta_t
        rechenweg.append(_schritt(
            "Qh,Kühlen", "Q = td · KGT · Q / Δθmax",
            f"{_z(k_stunden)} · {_z(kgt)} · {_z(k_leistung)} / {_z(k_delta_t)}",
            f"{round(kuehlung_kwh)} kWh/a",
        ))

    qh_kwh = heizung_kwh + kuehlung_kwh
    if kuehlung_kwh:
        rechenweg.append(_schritt(
            "Qh", "Qh = Qh,Heizen + Qh,Kühlen",
            f"{round(heizung_kwh)} + {round(kuehlung_kwh)}", f"{round(qh_kwh)} kWh/a",
        ))

    bww_kwh = tage * (bww * verlust) * dichte * c * bww_delta / 3600
    rechenweg.append(_schritt(
        "Qbww", "Qbww = ta · (Vw,d · f) · ρw · c · Δθ / 3600",
        f"{_z(tage)} · ({_z(bww, 3)} · {_z(verlust)}) · {_z(dichte)} · {_z(c, 3)} · {_z(bww_delta)} / 3600",
        f"{round(bww_kwh)} kWh/a",
    ))
    rechenweg.append(_schritt(
        "Qtot", "Qtot = Qh + Qbww",
        f"{round(qh_kwh)} + {round(bww_kwh)}", f"{round(qh_kwh + bww_kwh)} kWh/a",
    ))

    return {
        "heizung_kwh_a": round(heizung_kwh),
        "kuehlung_kwh_a": round(kuehlung_kwh),
        "qh_kwh_a": round(qh_kwh),
        "bww_kwh_a": round(bww_kwh),
        "total_kwh_a": round(qh_kwh + bww_kwh),
        "rechenweg": rechenweg,
    }


def jaz_und_stromkosten(
    cop_werte: list[float],
    stunden: list[float],
    heizung_kwh_a: float,
    bww_kwh_a: float = 0,
    cop_bww: float = 2.5,
    systemfaktor: float = 0.9,
    strompreis_chf_kwh: float = 0.2,
) -> dict:
    if len(cop_werte) != len(stunden) or not cop_werte:
        raise ValueError("COP-Werte und Stunden müssen gleich viele Einträge haben")
    gewicht = sum(_positiv("Temperaturstunden", h, null_erlaubt=True) for h in stunden)
    if gewicht <= 0:
        raise ValueError("Mindestens eine Temperaturstunde muss > 0 sein")
    cops = [_positiv("COP", wert) for wert in cop_werte]
    jaz = sum(cop * h for cop, h in zip(cops, stunden)) / gewicht
    heizung = _positiv("Heizenergie", heizung_kwh_a, null_erlaubt=True)
    bww = _positiv("BWW-Energie", bww_kwh_a, null_erlaubt=True)
    cop_bww = _positiv("COP BWW", cop_bww)
    faktor = _positiv("Systemfaktor", systemfaktor)
    preis = _positiv("Strompreis", strompreis_chf_kwh, null_erlaubt=True)
    strom_kwh = (heizung / jaz + bww / cop_bww) / faktor
    return {
        "jaz": round(jaz, 2),
        "stromverbrauch_kwh_a": round(strom_kwh),
        "stromkosten_chf_a": round(strom_kwh * preis),
        "rechenweg": [
            _schritt(
                "JAZ", "JAZ = Σ(COPi · hi) / Σhi",
                f"{_z(sum(cop * h for cop, h in zip(cops, stunden)))} / {_z(gewicht)}",
                _z(jaz),
            ),
            _schritt(
                "Wel", "Wel = (Qh / JAZ + Qbww / COPbww) / fsys",
                f"({_z(heizung)} / {_z(jaz)} + {_z(bww)} / {_z(cop_bww)}) / {_z(faktor)}",
                f"{round(strom_kwh)} kWh/a",
            ),
            _schritt(
                "Kel", "Kel = Wel · Strompreis",
                f"{round(strom_kwh)} · {_z(preis, 3)}", f"CHF {round(strom_kwh * preis)}",
            ),
        ],
    }
