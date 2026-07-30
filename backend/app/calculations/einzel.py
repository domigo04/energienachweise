"""Kleine, projektunabhängige Heizungsberechnungen.

Die Formeln sind aus den bereitgestellten Excel-Arbeitsblättern abgeleitet und
hier bewusst als kurze, testbare Rechenkerne gehalten. Einheiten werden an der
Funktionsgrenze festgelegt, damit im Frontend keine zweite Rechenwahrheit
entsteht.
"""


def _positiv(name: str, wert: float, *, null_erlaubt: bool = False) -> float:
    wert = float(wert)
    if wert < 0 or (wert == 0 and not null_erlaubt):
        raise ValueError(f"{name} muss {'≥ 0' if null_erlaubt else '> 0'} sein")
    return wert


def waermetauscherflaeche(leistung_kw: float, u_wert_w_m2k: float, delta_t_lm_k: float) -> dict:
    q = _positiv("Leistung", leistung_kw)
    u = _positiv("U-Wert", u_wert_w_m2k)
    delta_t = _positiv("Temperaturdifferenz", delta_t_lm_k)
    flaeche = q * 1000 / (u * delta_t)
    return {"flaeche_m2": round(flaeche, 3), "leistung_kw": q}


def druckverlust_kvs(volumenstrom_m3h: float, kvs: float) -> dict:
    volumenstrom = _positiv("Volumenstrom", volumenstrom_m3h)
    kvs = _positiv("kvs", kvs)
    dp_kpa = (volumenstrom / kvs) ** 2 * 100
    return {"druckverlust_kpa": round(dp_kpa, 3), "druckverlust_bar": round(dp_kpa / 100, 5)}


def rohrausdehnung(laenge_m: float, temperaturdifferenz_k: float, alpha_mm_mk: float = 0.0115) -> dict:
    laenge = _positiv("Rohrlänge", laenge_m)
    delta_t = _positiv("Temperaturdifferenz", temperaturdifferenz_k, null_erlaubt=True)
    alpha = _positiv("Ausdehnungskoeffizient", alpha_mm_mk)
    aenderung_mm = laenge * delta_t * alpha
    return {
        "laengenaenderung_mm": round(aenderung_mm, 2),
        "endlaenge_m": round(laenge + aenderung_mm / 1000, 5),
    }


def waermepumpenleistung(leistung_kw: float, cop: float, bekannte_seite: str = "heizung") -> dict:
    leistung = _positiv("Leistung", leistung_kw)
    cop = _positiv("COP", cop)
    if cop <= 1:
        raise ValueError("COP muss > 1 sein")
    if bekannte_seite == "quelle":
        heizleistung = leistung * cop / (cop - 1)
        quellenleistung = leistung
    else:
        heizleistung = leistung
        quellenleistung = leistung - leistung / cop
    elektrische_leistung = heizleistung / cop
    return {
        "heizleistung_kw": round(heizleistung, 2),
        "quellenleistung_kw": round(quellenleistung, 2),
        "elektrische_leistung_kw": round(elektrische_leistung, 2),
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
    }


def jahresenergie(
    heizleistung_kw: float,
    vollbetriebsstunden_h_d: float,
    heizgradtage_kd_a: float,
    auslegungs_delta_t_k: float,
    bww_m3_d: float = 0,
    bww_tage_a: float = 365,
    bww_delta_t_k: float = 50,
    bww_verlustfaktor: float = 1.5,
) -> dict:
    leistung = _positiv("Heizleistung", heizleistung_kw)
    stunden = _positiv("Vollbetriebsstunden", vollbetriebsstunden_h_d)
    hgt = _positiv("Heizgradtage", heizgradtage_kd_a)
    delta_t = _positiv("Auslegungs-Temperaturdifferenz", auslegungs_delta_t_k)
    bww = _positiv("BWW-Tagesverbrauch", bww_m3_d, null_erlaubt=True)
    tage = _positiv("BWW-Nutzungstage", bww_tage_a)
    bww_delta = _positiv("BWW-Temperaturdifferenz", bww_delta_t_k)
    verlust = _positiv("BWW-Verlustfaktor", bww_verlustfaktor)

    heizung_kwh = leistung * stunden * hgt / delta_t
    bww_kwh = tage * (bww * verlust) * 998 * 4.187 * bww_delta / 3600
    return {
        "heizung_kwh_a": round(heizung_kwh),
        "bww_kwh_a": round(bww_kwh),
        "total_kwh_a": round(heizung_kwh + bww_kwh),
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
    }
