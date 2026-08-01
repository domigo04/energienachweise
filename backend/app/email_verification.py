"""Bestätigungstoken für E-Mail-Adressen (Sicherheitsprüfung, Befund M2).

Ohne Verifikation konnte sich jemand mit einer **fremden** Adresse registrieren
und stand danach in der Freischaltliste eines Firmenadmins. Ein unaufmerksamer
Klick, und der Fremde sass im Mandanten dieser Firma — mit Zugriff auf alle
Projekte und Kosten.

Drei Regeln, rein und ohne DB, damit sie ohne Server prüfbar sind:

1. **Der Token ist zufällig und lang.** `secrets.token_urlsafe(32)` — 256 Bit.
2. **Gespeichert wird nur sein Hash.** Wer die Datenbank liest, kann damit kein
   Konto bestätigen. Dasselbe Prinzip wie beim Passwort, nur ohne bcrypt: der
   Token hat volle Entropie, ein schneller Hash genügt und ein langsamer würde
   den Abgleich unnötig teuer machen.
3. **Er läuft ab und gilt einmal.** 24 Stunden, danach wertlos; nach der
   Einlösung ebenso.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

GUELTIG_STUNDEN = 24


def neuer_token() -> tuple[str, str, datetime]:
    """(Klartext für die Mail, Hash für die Datenbank, Ablaufzeitpunkt)."""
    klartext = secrets.token_urlsafe(32)
    return klartext, token_hash(klartext), datetime.utcnow() + timedelta(hours=GUELTIG_STUNDEN)


def token_hash(klartext: str) -> str:
    return hashlib.sha256((klartext or "").encode("utf-8")).hexdigest()


def passt(klartext: str, gespeicherter_hash: str | None) -> bool:
    """Vergleich in konstanter Zeit — ein Zeitunterschied verrät sonst, wie weit
    ein geratener Token stimmt."""
    if not klartext or not gespeicherter_hash:
        return False
    return hmac.compare_digest(token_hash(klartext), gespeicherter_hash)


def ist_abgelaufen(ablauf: datetime | None, *, jetzt: datetime | None = None) -> bool:
    """Ohne Ablaufzeitpunkt gilt der Token als abgelaufen — nicht als ewig."""
    if ablauf is None:
        return True
    return (jetzt or datetime.utcnow()) >= ablauf
