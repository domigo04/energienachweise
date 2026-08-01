"""Passwortregeln und Bremse gegen Durchprobieren (Sicherheitsprüfung 2026-08-01).

Vorher nahm `/auth/login` beliebig viele Versuche entgegen — kein Zähler, keine
Sperre, keine Verzögerung. bcrypt bremst auf etwa hundert Versuche pro Sekunde,
verhindert aber nichts: mit einer Passwortliste ist ein schwaches Konto in
Stunden offen. Und schwach durfte es sein, denn eine Mindestlänge gab es nicht.

Beides steht hier, rein und ohne FastAPI:

* `passwort_fehler` — was ein brauchbares Passwort ausmacht.
* `Loginbremse`   — wie viele Fehlversuche ein Konto und eine Herkunft haben.

Die Bremse arbeitet im Arbeitsspeicher. Das ist bewusst: sie soll auch dann
greifen, wenn die Datenbank gerade langsam ist, und sie darf keinen Schreibzugriff
pro Fehlversuch auslösen — sonst wird sie selbst zum Angriffsziel. Bei mehreren
Serverinstanzen zählt jede für sich; das schwächt die Bremse, hebt sie aber nicht
auf. Wird das relevant, gehört der Zähler nach Redis.
"""
from __future__ import annotations

import time
from collections import defaultdict

# Ein Passwort ist kein Geheimnis, wenn man es raten kann. Länge schlägt
# Sonderzeichen — darum eine klare Mindestlänge statt Zeichenklassen-Akrobatik.
MIN_PASSWORT_LAENGE = 10

# Offensichtliches bleibt draussen. Bewusst kurz: eine lange Sperrliste erzeugt
# nur das Gefühl von Sicherheit.
VERBOTEN = frozenset({
    "passwort", "password", "12345678", "123456789", "1234567890",
    "qwertzuiop", "qwertyuiop", "heizung", "energienachweise", "willkommen",
    "adminadmin", "passwort123", "password123",
})

MAX_VERSUCHE = 8            # je Konto und je Herkunft
SPERRE_SEKUNDEN = 15 * 60   # danach zählt die Bremse wieder frei
FENSTER_SEKUNDEN = 15 * 60  # so lange bleibt ein Fehlversuch angerechnet


def passwort_fehler(passwort: str | None) -> str | None:
    """Gibt den Grund zurück, warum das Passwort nicht taugt — oder None."""
    wert = (passwort or "").strip()
    if len(wert) < MIN_PASSWORT_LAENGE:
        return f"Das Passwort braucht mindestens {MIN_PASSWORT_LAENGE} Zeichen."
    if wert.lower() in VERBOTEN:
        return "Dieses Passwort ist zu verbreitet. Bitte ein anderes wählen."
    if len(set(wert)) < 4:
        return "Das Passwort besteht aus zu wenigen verschiedenen Zeichen."
    return None


class Loginbremse:
    """Zählt Fehlversuche je Schlüssel (Konto bzw. Herkunfts-IP).

    Die Uhr ist einspritzbar, damit die Tests nicht warten müssen.
    """

    def __init__(self, *, max_versuche: int = MAX_VERSUCHE,
                 sperre_sekunden: int = SPERRE_SEKUNDEN,
                 fenster_sekunden: int = FENSTER_SEKUNDEN,
                 uhr=time.monotonic):
        self._max = max_versuche
        self._sperre = sperre_sekunden
        self._fenster = fenster_sekunden
        self._uhr = uhr
        self._versuche: dict[str, list[float]] = defaultdict(list)

    def _aktuelle(self, schluessel: str) -> list[float]:
        jetzt = self._uhr()
        frisch = [t for t in self._versuche[schluessel] if jetzt - t < self._fenster]
        self._versuche[schluessel] = frisch
        return frisch

    def gesperrt_fuer(self, schluessel: str) -> int:
        """Verbleibende Sperrzeit in Sekunden; 0 = nicht gesperrt."""
        frisch = self._aktuelle(schluessel)
        if len(frisch) < self._max:
            return 0
        rest = self._sperre - (self._uhr() - frisch[-1])
        return max(0, int(rest) + 1)

    def fehlversuch(self, schluessel: str) -> None:
        self._aktuelle(schluessel)
        self._versuche[schluessel].append(self._uhr())

    def erfolg(self, schluessel: str) -> None:
        """Ein gelungener Login löscht die Vorgeschichte."""
        self._versuche.pop(schluessel, None)

    def leeren(self) -> None:
        self._versuche.clear()


# Eine Instanz für den ganzen Prozess.
bremse = Loginbremse()
