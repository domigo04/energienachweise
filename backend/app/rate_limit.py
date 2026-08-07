"""Begrenzung wiederholter Fehlversuche auf den öffentlichen Auth-Routen.

Login und Registrierung sind die einzigen Endpunkte, die ohne Token erreichbar
sind. Ohne Begrenzung kann ein Skript beliebig viele Passwörter durchprobieren;
die Kosten dafür trägt allein `verify_password` (bcrypt), und das schützt nur
gegen Geschwindigkeit, nicht gegen Ausdauer.

## Zwei Zähler, bewusst getrennt

* **Pro Konto** — das ist die eigentliche Abwehr gegen das Durchprobieren EINES
  Passworts. Sie greift früh (wenige Versuche), weil ein echter Mensch sein
  eigenes Passwort selten fünfmal hintereinander falsch tippt.
* **Pro IP** — greift gegen das Durchprobieren VIELER Konten von einer Stelle
  aus (Credential Stuffing). Sie ist bewusst weit gesetzt: hinter einem
  Firmen-NAT teilen sich viele Planer dieselbe Adresse, und ein zu enger Wert
  sperrt ein ganzes Büro aus. Eine Aussperrung wäre hier schlimmer als der
  Angriff, den sie verhindert.

Ein erfolgreicher Login setzt NUR den Kontozähler zurück, nie den IP-Zähler.
Sonst könnte jemand mit einem einzigen gültigen Konto seinen IP-Zähler nach
jedem Block wieder freikaufen.

## Grenze dieser Umsetzung (Pilot)

Die Zähler liegen im Arbeitsspeicher des Prozesses. Das trägt genau so lange,
wie das Backend als EIN Prozess läuft — der aktuelle Railway-Start
(`uvicorn app.main:app` ohne `--workers`) tut das. Beim Wechsel auf mehrere
Arbeitsprozesse oder mehrere Instanzen zählt jede für sich, und die
tatsächliche Grenze vervielfacht sich entsprechend. Dann gehören die Zähler in
einen gemeinsamen Speicher (Datenbank oder Redis); die Schnittstelle unten
bleibt dieselbe, nur `Versuchssperre` wird ausgetauscht.

Ein Neustart leert die Zähler. Das ist hinnehmbar: einen Neustart kann ein
Angreifer nicht auslösen, und die Sperre ist ohnehin nur wenige Minuten lang.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


# Konto: früh und spürbar. Fünf Fehlversuche in einer Viertelstunde sind für
# einen echten Menschen viel und für ein Skript nichts.
LOGIN_KONTO_GRENZE = 5
LOGIN_KONTO_FENSTER_S = 15 * 60
LOGIN_KONTO_SPERRE_S = 15 * 60

# IP: weit, weil sich hinter einer Adresse ein ganzes Büro verbergen kann.
LOGIN_IP_GRENZE = 50
LOGIN_IP_FENSTER_S = 15 * 60
LOGIN_IP_SPERRE_S = 15 * 60

# Registrierung: kein Konto, an dem gezählt werden könnte — hier gibt es nur
# die IP. Registrieren ist ein seltener Vorgang; zehn Anläufe pro Stunde
# decken auch ein Büro ab, das mehrere Mitarbeiter gleichzeitig anmeldet.
REGISTER_IP_GRENZE = 10
REGISTER_IP_FENSTER_S = 60 * 60
REGISTER_IP_SPERRE_S = 60 * 60


@dataclass
class _Eintrag:
    versuche: list[float] = field(default_factory=list)
    gesperrt_bis: float = 0.0


class Versuchssperre:
    """Zählt Fehlversuche je Schlüssel und sperrt nach Überschreiten.

    Bewusst ohne versteckte Uhr: `jetzt` ist überall ein Parameter. Nur dadurch
    lässt sich das Ablaufen von Fenster und Sperre prüfen, ohne im Test zu
    warten.

    Der Zugriff ist gesperrt (`threading.Lock`), weil FastAPI synchrone
    Endpunkte in einem Threadpool ausführt — zwei Anmeldungen können also
    wirklich gleichzeitig zählen.
    """

    def __init__(self, *, grenze: int, fenster_s: float, sperre_s: float) -> None:
        self.grenze = max(1, int(grenze))
        self.fenster_s = float(fenster_s)
        self.sperre_s = float(sperre_s)
        self._eintraege: dict[str, _Eintrag] = {}
        self._lock = threading.Lock()

    def restsperre_s(self, schluessel: str, jetzt: float | None = None) -> float:
        """Verbleibende Sperrzeit in Sekunden; 0.0 heisst „nicht gesperrt"."""
        jetzt = time.monotonic() if jetzt is None else jetzt
        with self._lock:
            eintrag = self._eintraege.get(schluessel)
            if not eintrag:
                return 0.0
            return max(0.0, eintrag.gesperrt_bis - jetzt)

    def fehlversuch(self, schluessel: str, jetzt: float | None = None) -> float:
        """Einen Fehlversuch zählen. Gibt die neue Restsperrzeit zurück."""
        jetzt = time.monotonic() if jetzt is None else jetzt
        with self._lock:
            eintrag = self._eintraege.setdefault(schluessel, _Eintrag())
            # Nur Versuche INNERHALB des Fensters zählen. Ohne dieses Vergessen
            # würde ein Konto über Wochen hinweg irgendwann gesperrt, obwohl
            # nie mehrere Fehlversuche zusammen auftraten.
            grenze_alt = jetzt - self.fenster_s
            eintrag.versuche = [t for t in eintrag.versuche if t > grenze_alt]
            eintrag.versuche.append(jetzt)
            if len(eintrag.versuche) >= self.grenze:
                eintrag.gesperrt_bis = jetzt + self.sperre_s
                # Nach dem Sperren bei null anfangen: sonst löst jeder weitere
                # Versuch sofort eine volle neue Sperre aus und die Sperre
                # verlängert sich endlos.
                eintrag.versuche = []
            return max(0.0, eintrag.gesperrt_bis - jetzt)

    def zuruecksetzen(self, schluessel: str) -> None:
        """Nach einer erfolgreichen Anmeldung: der Zähler dieses Kontos ist erledigt."""
        with self._lock:
            self._eintraege.pop(schluessel, None)

    def aufraeumen(self, jetzt: float | None = None) -> int:
        """Abgelaufene Einträge entfernen, damit der Speicher nicht wächst.

        Ein Angreifer könnte sonst mit erfundenen E-Mail-Adressen beliebig viele
        Schlüssel anlegen. Gibt die Zahl der entfernten Einträge zurück.
        """
        jetzt = time.monotonic() if jetzt is None else jetzt
        grenze_alt = jetzt - self.fenster_s
        with self._lock:
            veraltet = [
                schluessel for schluessel, eintrag in self._eintraege.items()
                if eintrag.gesperrt_bis <= jetzt
                and not any(t > grenze_alt for t in eintrag.versuche)
            ]
            for schluessel in veraltet:
                del self._eintraege[schluessel]
            return len(veraltet)

    def leeren(self) -> None:
        """Nur für Tests und den Prozessstart."""
        with self._lock:
            self._eintraege.clear()


def client_ip(forwarded_for: str | None, client_host: str | None) -> str:
    """Die Adresse, die für den IP-Zähler zählt.

    Hinter einem Proxy ist `client_host` immer die Adresse des Proxys — für
    alle Benutzer dieselbe. Ein IP-Zähler darauf würde beim ersten Angriff das
    gesamte Internet aussperren.

    Massgebend ist deshalb der LETZTE Eintrag in `X-Forwarded-For`: den hat der
    Proxy geschrieben, der uns am nächsten steht, und nur der ist
    vertrauenswürdig. Die vorderen Einträge darf der Aufrufer frei erfinden —
    wer den ersten nimmt, hat den Schutz selbst abgeschaltet.

    Ohne Header und ohne bekannte Adresse bleibt ein fester Ersatzschlüssel:
    lieber alle unbekannten Aufrufer gemeinsam begrenzen als gar nicht.
    """
    if forwarded_for:
        teile = [teil.strip() for teil in forwarded_for.split(",") if teil.strip()]
        if teile:
            return teile[-1]
    return (client_host or "").strip() or "unbekannt"


def sperrhinweis(rest_s: float) -> str:
    """Meldung für die 429-Antwort — ohne jede Auskunft über das Konto.

    Sie darf nicht verraten, ob die E-Mail existiert, ob das Passwort fast
    stimmte oder welcher der beiden Zähler ausgelöst hat.
    """
    minuten = max(1, int(rest_s // 60) + (1 if rest_s % 60 else 0))
    return (
        "Zu viele fehlgeschlagene Versuche. "
        f"Bitte in etwa {minuten} Minute{'n' if minuten != 1 else ''} erneut versuchen."
    )


# Die im Betrieb verwendeten Zähler. Modulweit, weil sie den Zustand EINES
# Prozesses halten (siehe Grenze oben).
login_konto_sperre = Versuchssperre(
    grenze=LOGIN_KONTO_GRENZE,
    fenster_s=LOGIN_KONTO_FENSTER_S,
    sperre_s=LOGIN_KONTO_SPERRE_S,
)
login_ip_sperre = Versuchssperre(
    grenze=LOGIN_IP_GRENZE,
    fenster_s=LOGIN_IP_FENSTER_S,
    sperre_s=LOGIN_IP_SPERRE_S,
)
register_ip_sperre = Versuchssperre(
    grenze=REGISTER_IP_GRENZE,
    fenster_s=REGISTER_IP_FENSTER_S,
    sperre_s=REGISTER_IP_SPERRE_S,
)

ALLE_SPERREN = (login_konto_sperre, login_ip_sperre, register_ip_sperre)


def alles_aufraeumen(jetzt: float | None = None) -> int:
    return sum(sperre.aufraeumen(jetzt) for sperre in ALLE_SPERREN)


def alles_leeren() -> None:
    for sperre in ALLE_SPERREN:
        sperre.leeren()
