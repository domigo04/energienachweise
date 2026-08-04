"""Solekreis der Erdsondenanlage gegen `Erdsonden.xlsx` geprüft.

Referenzfall aus dem Blatt `Druckverlustberechnung_erdsonde`: 4 Duplexsonden
à 220 m, Sondenrohr ID 26.2 mm, 30 m Zuleitung bis Verteiler und 12 m bis zur
Wärmepumpe (je ID 40.6 mm), 6.2 m³/h Sole, Ethylenglykol mit ρ = 1050 kg/m³ und
ν = 4.15 mm²/s.

Die Vorlage rechnet die Querschnitte teils mit 3.14 statt π. Hier wird
durchgehend π verwendet; die Abweichung liegt unter 0.2 % und wird über
`rel`-Toleranzen abgedeckt.
"""

import pytest

from app.calculations.hydraulik import berechne_schema
from app.calculations.sole_druckverlust import (
    INNENDURCHMESSER_MM,
    sole_druckverlust,
    waermetraeger_vorgabe,
)


REFERENZ = dict(
    sonden_anzahl=4,
    sonden_tiefe_m=220,
    sonden_innen_d_mm=26.2,
    sonden_straenge=4,
    zuleitung_verteiler_m=30,
    zuleitung_verteiler_innen_d_mm=40.6,
    zuleitung_wp_m=12,
    zuleitung_wp_innen_d_mm=40.6,
    zusatzinhalt_l=5,
    volumenstrom_m3_h=6.2,
    konzentration_pct=30,
    dichte_kg_m3=1050,
    cp_kj_kgk=3.68,
    viskositaet_mm2_s=4.15,
    druckverlust_wp_mws=1.3,
    verteiler_anzahl=1,
    zeta_verteiler=12,
)


def test_fuellinhalt_entspricht_der_vorlage():
    r = sole_druckverlust(**REFERENZ)

    assert r["inhalt_je_m_sonde_l"] == pytest.approx(2.1565, rel=1e-3)   # B11
    assert r["inhalt_sonden_l"] == pytest.approx(1897.7, rel=1e-3)        # B12
    assert r["inhalt_zuleitung_verteiler_l"] == pytest.approx(77.6, rel=2e-3)  # B17
    assert r["inhalt_zuleitung_wp_l"] == pytest.approx(31.1, rel=2e-3)    # B22
    assert r["inhalt_total_l"] == pytest.approx(2011.4, rel=1e-3)         # B24


def test_teilstuecke_entsprechen_der_vorlage():
    r = sole_druckverlust(**REFERENZ)
    sonde, zul_vert, zul_wp = r["teilstuecke"]

    # Erdwärmesonde: acht parallele Kreise (4 Sonden × 2 U-Rohre)
    assert r["kreise"] == 8
    assert sonde["geschwindigkeit_m_s"] == pytest.approx(0.3995, rel=2e-3)   # B34
    assert sonde["reynolds"] == pytest.approx(2522, rel=2e-3)               # B35
    assert sonde["dk"] == pytest.approx(1747, rel=1e-3)                     # B36
    assert sonde["stroemungsart"] == "Turbulent glatt"                      # B37
    assert sonde["lambda"] == pytest.approx(0.04465, rel=2e-3)              # B38
    assert sonde["dynamischer_druck_pa"] == pytest.approx(83.79, rel=3e-3)  # B39
    assert sonde["druckverlust_pa"] == pytest.approx(62828, rel=3e-3)       # B40

    assert zul_vert["geschwindigkeit_m_s"] == pytest.approx(0.1664, rel=2e-3)  # C34
    assert zul_vert["reynolds"] == pytest.approx(1628, rel=2e-3)               # C35
    assert zul_vert["lambda"] == pytest.approx(0.03932, rel=2e-3)              # C38
    assert zul_vert["druckverlust_pa"] == pytest.approx(844, rel=3e-3)         # C40

    assert zul_wp["geschwindigkeit_m_s"] == pytest.approx(1.3310, rel=2e-3)    # D34
    assert zul_wp["reynolds"] == pytest.approx(13021, rel=2e-3)                # D35
    assert zul_wp["stroemungsart"] == "Turbulent glatt"                        # D37
    assert zul_wp["druckverlust_pa"] == pytest.approx(16284, rel=3e-3)         # D40


def test_zuleitung_wird_laminar_erkannt_wo_die_vorlage_sich_verrechnet():
    """C37 der Vorlage prüft `dk` statt `Re` und meldet fälschlich turbulent.

    Die Lambda-Formel der Vorlage rechnet an derselben Stelle bereits laminar
    (64/Re). Hier ist die Anzeige mit der Rechnung konsistent.
    """
    r = sole_druckverlust(**REFERENZ)
    zul_vert = r["teilstuecke"][1]

    assert zul_vert["reynolds"] < 2340
    assert zul_vert["stroemungsart"] == "Laminar"
    assert zul_vert["lambda"] == pytest.approx(64 / zul_vert["reynolds"], rel=1e-3)


def test_foerderhoehe_und_betriebspunkt():
    r = sole_druckverlust(**REFERENZ)

    assert r["druckverlust_leitungen_mws"] == pytest.approx(8.16, abs=0.02)  # B41
    assert r["druckverlust_verteiler_mws"] == pytest.approx(0.10, abs=0.01)  # B45
    assert r["foerderhoehe_mws"] == pytest.approx(9.56, abs=0.03)            # B48
    assert r["foerdervolumen_m3_h"] == pytest.approx(6.2)                    # B49
    assert r["sonde_turbulent"] is True
    assert r["warnungen"] == []


def test_volumenstrom_aus_quellenleistung_und_sole_dt():
    r = sole_druckverlust(**{**REFERENZ, "volumenstrom_m3_h": None,
                             "quellenleistung_kw": 30, "sole_dt_k": 3})

    # V̇ = Q0 · 3600 / (c · ΔT · ρ) = 30 · 3600 / (3.68 · 3 · 1050)
    assert r["volumenstrom_m3_h"] == pytest.approx(9.317, rel=1e-3)
    assert r["volumenstrom_quelle"] == "aus Quellenleistung und Sole-ΔT"


def test_ohne_volumenstrom_gibt_es_warnung_statt_zahl():
    r = sole_druckverlust(**{**REFERENZ, "volumenstrom_m3_h": None})

    assert r.get("foerderhoehe_mws") is None
    assert r["inhalt_total_l"] == pytest.approx(2011.4, rel=1e-3)
    assert any("Solevolumenstrom fehlt" in w for w in r["warnungen"])


def test_laminare_sonde_wird_gewarnt():
    r = sole_druckverlust(**{**REFERENZ, "volumenstrom_m3_h": 2.0})

    assert r["teilstuecke"][0]["stroemungsart"] == "Laminar"
    assert r["sonde_turbulent"] is False
    assert any("laminar" in w for w in r["warnungen"])


def test_einfach_u_sonde_halbiert_inhalt_und_kreise():
    r = sole_druckverlust(**{**REFERENZ, "sonden_straenge": 2})

    assert r["kreise"] == 4
    assert r["inhalt_sonden_l"] == pytest.approx(1897.7 / 2, rel=1e-3)


def test_stoffwerte_und_innendurchmesser_sind_hinterlegt():
    assert INNENDURCHMESSER_MM[32] == 26.2
    assert INNENDURCHMESSER_MM[40] == 32.6
    vorgabe = waermetraeger_vorgabe(28)
    assert vorgabe["dichte_kg_m3"] == 1050
    assert vorgabe["viskositaet_mm2_s"] == 4.15
    assert "Erdsonden.xlsx" in vorgabe["quelle"]
    # Zwischenwerte greifen auf die nächstgelegene hinterlegte Zeile zurück.
    assert waermetraeger_vorgabe(31)["konzentration_pct"] == 30


def test_ungueltige_eingaben_werden_abgewiesen():
    for feld, wert in [("sonden_anzahl", 0), ("sonden_tiefe_m", 0),
                       ("sonden_innen_d_mm", 0), ("sonden_straenge", 3),
                       ("dichte_kg_m3", 0)]:
        with pytest.raises(ValueError):
            sole_druckverlust(**{**REFERENZ, feld: wert})


def test_schema_rechnet_solekreis_am_erdsondenknoten():
    nodes = [
        {"id": "wp", "type": "erzeuger", "data": {
            "generator_type": "ews_wp", "leistung_kw": 40, "cop": 4,
            "vl_temp": 35, "rl_temp": 30, "sole_vl": 3, "sole_rl": 0,
        }},
        {"id": "ews", "type": "erdsonden", "data": {
            "sonden_anzahl": 4, "sonden_laenge_m": 220, "sonden_rohr_mm": 32,
            "entzugsleistung_w_m": 45,
            "sole_zuleitung_verteiler_m": 30, "sole_id_zuleitung_verteiler_mm": 40.6,
            "sole_zuleitung_wp_m": 12, "sole_id_zuleitung_wp_mm": 40.6,
            "sole_zusatzinhalt_l": 5, "sole_volumenstrom_m3h": 6.2,
            "glykol_pct": 30, "sole_dichte_kg_m3": 1050,
            "sole_viskositaet_mm2_s": 4.15, "sole_dp_wp_mws": 1.3,
        }},
    ]

    dv = berechne_schema(nodes, [])["erdsonden_results"]["ews"]["druckverlust"]

    # Der Sondendurchmesser kommt aus der Normsondentabelle (32 mm → ID 26.2).
    assert dv["teilstuecke"][0]["innen_d_mm"] == 26.2
    assert dv["foerderhoehe_mws"] == pytest.approx(9.56, abs=0.03)
    assert dv["inhalt_total_l"] == pytest.approx(2011.4, rel=1e-3)
    assert dv["rechenweg"]


def test_bestandsschema_ohne_soleangaben_bleibt_lauffaehig():
    nodes = [{"id": "ews", "type": "erdsonden",
              "data": {"sonden_anzahl": 5, "sonden_laenge_m": 180}}]

    dv = berechne_schema(nodes, [])["erdsonden_results"]["ews"]["druckverlust"]

    assert dv["inhalt_sonden_l"] > 0
    assert dv.get("foerderhoehe_mws") is None
    assert any("Solevolumenstrom fehlt" in w for w in dv["warnungen"])
