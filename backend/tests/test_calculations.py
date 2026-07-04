"""Bestehende Rechen-Module — Formel-Tests mit konkreten Zahlen (Goldene Regel)."""
from types import SimpleNamespace

import pytest

from app.calculations.heizgruppen import berechne_rl_gemischt, pruefe_plausibilitaet
from app.calculations.ravel import annuitaetsfaktor, mittelwertfaktor
from app.calculations.ventil import berechne_kvs


# ── Gemeinsamer Rücklauf (3 Gruppen, mengengewichtet) ───────────────────────
def test_rl_gemischt_3_gruppen():
    gruppen = [
        SimpleNamespace(status="aktiv", volumenstrom_m3h=1.0, ruecklauf=28.0),
        SimpleNamespace(status="aktiv", volumenstrom_m3h=2.0, ruecklauf=45.0),
        SimpleNamespace(status="aktiv", volumenstrom_m3h=1.0, ruecklauf=30.0),
    ]
    # (1·28 + 2·45 + 1·30) / 4 = 148 / 4 = 37.0
    assert berechne_rl_gemischt(gruppen) == pytest.approx(37.0, abs=0.01)


def test_rl_gemischt_ignoriert_inaktive():
    gruppen = [
        SimpleNamespace(status="aktiv", volumenstrom_m3h=1.0, ruecklauf=28.0),
        SimpleNamespace(status="inaktiv", volumenstrom_m3h=9.0, ruecklauf=90.0),
    ]
    assert berechne_rl_gemischt(gruppen) == pytest.approx(28.0, abs=0.01)


# ── Plausibilität ────────────────────────────────────────────────────────────
def test_plausi_vl_kleiner_rl():
    warnings = pruefe_plausibilitaet(5.0, 30.0, 35.0, "aktiv")
    assert any("VL muss höher als RL" in w for w in warnings)


def test_plausi_kleines_dt():
    warnings = pruefe_plausibilitaet(5.0, 35.0, 33.0, "aktiv")  # ΔT = 2 K
    assert any("kleines ΔT" in w for w in warnings)


def test_plausi_ok():
    assert pruefe_plausibilitaet(8.5, 35.0, 28.0, "aktiv") == []


# ── Ventil (kvs + Ventilautorität) ──────────────────────────────────────────
def test_ventil_kvs():
    # V' = 1.462 m³/h, Δpvar = 26 kPa = 0.26 bar
    r = berechne_kvs(1.462, 26.0)
    assert r["kvs_theor"] == pytest.approx(1.462 / (0.26 ** 0.5), abs=0.001)  # 2.867
    assert r["kvs_vorschlag"] == 4.0  # nächstgrösserer Wert der Norm-Reihe
    # Δpv = (1.462/4)² = 0.1336 bar = 13.36 kPa
    assert r["dp_v_eff_kpa"] == pytest.approx(13.36, abs=0.05)
    # Pv = 13.36 / (13.36+26) = 33.9 % → im Idealband 30–80
    assert r["ventilautoritaet_pct"] == pytest.approx(33.94, abs=0.1)
    assert r["warnings"] == []


def test_ventil_autoritaet_zu_klein_warnt():
    r = berechne_kvs(1.0, 26.0, kvs_gewaehlt=10.0)
    assert r["ventilautoritaet_pct"] < 30
    assert any("zu gering" in w for w in r["warnings"])


# ── RAVEL ────────────────────────────────────────────────────────────────────
def test_annuitaetsfaktor_abnahme():
    # Abnahmekriterium: i=6 %, n=15 → 0.1030
    assert annuitaetsfaktor(0.06, 15) == pytest.approx(0.1030, abs=0.0001)


def test_mittelwertfaktor_i_gleich_e():
    # i = e → m = n · a
    a = annuitaetsfaktor(0.03, 20)
    assert mittelwertfaktor(0.03, 0.03, 20) == pytest.approx(20 * a, abs=1e-9)
