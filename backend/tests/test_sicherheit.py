"""Sicherheitsprüfung 2026-08-01 — die neuen Schutzregeln.

Drei Löcher, die der Audit gefunden hat, und ihre Regeln:

* Datei-Uploads ohne Grösse und ohne Formprüfung (Server über den Speicher
  aushebelbar).
* Login ohne Bremse (Passwörter durchprobierbar).
* Keine Passwortregeln (das Konto war es wert, durchprobiert zu werden).
"""
import pytest

from app.login_guard import Loginbremse, MIN_PASSWORT_LAENGE, passwort_fehler
from app.upload_guard import UploadAbgelehnt, pruefe_pdf


# ── Uploads ─────────────────────────────────────────────────────────────────

def _pdf(nutzlast: bytes = b"x") -> bytes:
    return b"%PDF-1.7\n" + nutzlast


def test_ein_normales_pdf_geht_durch():
    pruefe_pdf(_pdf(b"harmlos"))


def test_leere_datei_wird_abgelehnt():
    with pytest.raises(UploadAbgelehnt):
        pruefe_pdf(b"")


def test_zu_grosse_datei_wird_abgelehnt():
    with pytest.raises(UploadAbgelehnt) as fehler:
        pruefe_pdf(_pdf(b"x" * 2048), max_bytes=1024)
    # 413 statt 422: die Datei ist nicht unverständlich, sie ist zu gross.
    assert fehler.value.status_code == 413


def test_nur_pdf_kommt_durch():
    """Geprüft wird der Inhalt, nicht der Dateiname — den behauptet der Absender."""
    for inhalt in (b"PK\x03\x04harmlos.zip", b"<?xml version='1.0'?><x/>",
                   b"#!/bin/sh\nrm -rf /", b"\x89PNG\r\n\x1a\n"):
        with pytest.raises(UploadAbgelehnt):
            pruefe_pdf(inhalt)


def test_fuehrende_leerzeichen_stoeren_nicht():
    """Manche Werkzeuge stellen dem PDF Leerraum voran — das bleibt ein PDF."""
    pruefe_pdf(b"\n  " + _pdf())


# ── Passwortregeln ──────────────────────────────────────────────────────────

def test_zu_kurzes_passwort_wird_abgelehnt():
    assert passwort_fehler("kurz") is not None
    assert passwort_fehler("a" * (MIN_PASSWORT_LAENGE - 1)) is not None


def test_langes_passwort_geht_durch():
    assert passwort_fehler("Winterthur-Heizung-2026") is None


def test_verbreitete_passwoerter_bleiben_draussen():
    for schwach in ("passwort", "12345678", "Password123", "energienachweise"):
        assert passwort_fehler(schwach) is not None


def test_zu_wenige_verschiedene_zeichen():
    """«aaaaaaaaaaaa» ist lang genug und trotzdem in Sekunden geraten."""
    assert passwort_fehler("aaaaaaaaaaaa") is not None
    assert passwort_fehler("ababababab") is not None


def test_leeres_passwort():
    assert passwort_fehler(None) is not None
    assert passwort_fehler("   ") is not None


# ── Login-Bremse ────────────────────────────────────────────────────────────

class _Uhr:
    """Steuerbare Uhr — die Tests sollen nicht 15 Minuten warten."""

    def __init__(self):
        self.jetzt = 1000.0

    def __call__(self):
        return self.jetzt

    def weiter(self, sekunden):
        self.jetzt += sekunden


def test_erste_fehlversuche_sind_frei():
    bremse = Loginbremse(max_versuche=3, uhr=_Uhr())
    for _ in range(2):
        bremse.fehlversuch("konto:a@example.invalid")
    assert bremse.gesperrt_fuer("konto:a@example.invalid") == 0


def test_nach_zu_vielen_fehlversuchen_wird_gesperrt():
    bremse = Loginbremse(max_versuche=3, uhr=_Uhr())
    for _ in range(3):
        bremse.fehlversuch("konto:a@example.invalid")
    assert bremse.gesperrt_fuer("konto:a@example.invalid") > 0


def test_die_sperre_laeuft_ab():
    uhr = _Uhr()
    bremse = Loginbremse(max_versuche=3, sperre_sekunden=60, fenster_sekunden=60, uhr=uhr)
    for _ in range(3):
        bremse.fehlversuch("konto:a@example.invalid")
    assert bremse.gesperrt_fuer("konto:a@example.invalid") > 0
    uhr.weiter(61)
    assert bremse.gesperrt_fuer("konto:a@example.invalid") == 0


def test_ein_gelungener_login_loescht_die_vorgeschichte():
    bremse = Loginbremse(max_versuche=3, uhr=_Uhr())
    for _ in range(2):
        bremse.fehlversuch("konto:a@example.invalid")
    bremse.erfolg("konto:a@example.invalid")
    for _ in range(2):
        bremse.fehlversuch("konto:a@example.invalid")
    assert bremse.gesperrt_fuer("konto:a@example.invalid") == 0


def test_konten_bremsen_sich_nicht_gegenseitig():
    """Ein Angriff auf ein Konto darf kein anderes aussperren."""
    bremse = Loginbremse(max_versuche=3, uhr=_Uhr())
    for _ in range(5):
        bremse.fehlversuch("konto:opfer@example.invalid")
    assert bremse.gesperrt_fuer("konto:opfer@example.invalid") > 0
    assert bremse.gesperrt_fuer("konto:andere@example.invalid") == 0


def test_alte_fehlversuche_fallen_aus_dem_fenster():
    uhr = _Uhr()
    bremse = Loginbremse(max_versuche=3, fenster_sekunden=60, uhr=uhr)
    bremse.fehlversuch("ip:203.0.113.5")
    uhr.weiter(61)
    bremse.fehlversuch("ip:203.0.113.5")
    bremse.fehlversuch("ip:203.0.113.5")
    # Der erste Versuch ist verjährt, also erst zwei im Fenster → keine Sperre.
    assert bremse.gesperrt_fuer("ip:203.0.113.5") == 0
