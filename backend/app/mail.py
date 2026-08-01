"""E-Mail-Versand über Infomaniak (Entscheid Dominic 2026-08-01).

Bewusst SMTP und kein API-Dienst: Infomaniak ist Schweizer Hosting, und damit
verlässt keine Adresse der Kunden den Rechtsraum, in dem das Produkt verkauft
wird. Das passt zur Linie, die in `docs/OFFENE_ENTSCHEIDE.md` für die LV-Daten
diskutiert wird.

Konfiguration (Umgebungsvariablen):

    MAIL_HOST        mail.infomaniak.com
    MAIL_PORT        587  (STARTTLS, offizieller Standard; 465 = SSL, Alternative)
    MAIL_USER        vollständige Absenderadresse
    MAIL_PASSWORD    das für diese Adresse erzeugte Passwort
    MAIL_FROM        Absenderadresse (Standard: MAIL_USER)
    MAIL_FROM_NAME   Anzeigename
    APP_BASE_URL     Basis für die Links in der Mail

**Ohne MAIL_HOST wird nichts verschickt.** Der Versand schreibt dann eine Zeile
ins Protokoll und meldet «nicht versandt». Das ist Absicht: lokal soll niemand
echte Mails auslösen, und ein fehlendes Passwort darf die Registrierung nicht
zum Absturz bringen — der Benutzer bekommt stattdessen einen sichtbaren Hinweis.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr


def _konfig() -> dict:
    host = (os.getenv("MAIL_HOST") or "").strip()
    user = (os.getenv("MAIL_USER") or "").strip()
    return {
        "host": host,
        "port": int(os.getenv("MAIL_PORT", "587") or 587),
        "user": user,
        "passwort": os.getenv("MAIL_PASSWORD") or "",
        "absender": (os.getenv("MAIL_FROM") or user).strip(),
        "absender_name": (os.getenv("MAIL_FROM_NAME") or "Heizungscockpit").strip(),
    }


def versand_bereit() -> bool:
    k = _konfig()
    return bool(k["host"] and k["user"] and k["passwort"] and k["absender"])


def basis_url() -> str:
    """Basis für Links in Mails, ohne Schrägstrich am Ende."""
    return (os.getenv("APP_BASE_URL") or "https://www.energienachweise.com").rstrip("/")


def baue_nachricht(*, an: str, betreff: str, text: str) -> EmailMessage:
    """Reine Textmail. Kein HTML — nichts, was ein Mailprogramm interpretieren
    muss, und nichts, worin sich ein Link verstecken lässt."""
    k = _konfig()
    nachricht = EmailMessage()
    nachricht["From"] = formataddr((k["absender_name"], k["absender"]))
    nachricht["To"] = an
    nachricht["Subject"] = betreff
    nachricht.set_content(text)
    return nachricht


def sende(*, an: str, betreff: str, text: str) -> bool:
    """Verschickt die Mail. Gibt zurück, ob sie wirklich rausgegangen ist.

    Fehler beim Versand werden nicht durchgereicht: eine Registrierung darf
    nicht daran scheitern, dass der Mailserver gerade klemmt. Der Aufrufer
    erfährt es über den Rückgabewert und kann es dem Benutzer sagen.
    """
    if not versand_bereit():
        print(f"[MAIL] nicht versandt (keine Konfiguration): {betreff} → {an}")
        return False

    k = _konfig()
    nachricht = baue_nachricht(an=an, betreff=betreff, text=text)
    kontext = ssl.create_default_context()
    try:
        if k["port"] == 465:
            with smtplib.SMTP_SSL(k["host"], k["port"], context=kontext, timeout=20) as server:
                server.login(k["user"], k["passwort"])
                server.send_message(nachricht)
        else:
            with smtplib.SMTP(k["host"], k["port"], timeout=20) as server:
                server.starttls(context=kontext)
                server.login(k["user"], k["passwort"])
                server.send_message(nachricht)
        return True
    except Exception as fehler:                      # noqa: BLE001 — bewusst breit
        # Absichtlich ohne Adresse im Protokoll: eine fehlgeschlagene Zustellung
        # ist kein Grund, E-Mail-Adressen in die Serverlogs zu schreiben.
        print(f"[MAIL] Versand fehlgeschlagen ({type(fehler).__name__}): {betreff}")
        return False


def bestaetigungstext(*, name: str | None, token: str) -> tuple[str, str]:
    """Betreff und Text der Bestätigungsmail."""
    link = f"{basis_url()}/bestaetigen/{token}"
    anrede = f"Hallo {name}" if name else "Hallo"
    text = (
        f"{anrede}\n\n"
        "Bitte bestätige deine E-Mail-Adresse für das Heizungscockpit:\n\n"
        f"{link}\n\n"
        "Der Link ist 24 Stunden gültig. Danach schaltet ein Administrator dein\n"
        "Konto frei — du bekommst darüber keine weitere Mail, melde dich einfach\n"
        "später nochmals an.\n\n"
        "Hast du dich nicht registriert, ignoriere diese Nachricht. Ohne\n"
        "Bestätigung bleibt das Konto gesperrt.\n"
    )
    return "Heizungscockpit — E-Mail bestätigen", text
