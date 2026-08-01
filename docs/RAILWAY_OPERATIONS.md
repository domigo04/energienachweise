# Railway-Betrieb

## Verbindliche Produktionsvariablen

- `ENVIRONMENT=production`
- `DATABASE_URL` verweist auf den Railway-PostgreSQL-Service
- `SECRET_KEY` ist ein zufälliger Wert mit mindestens 32 Zeichen
- `ALLOWED_ORIGINS` enthält nur die produktiven Frontend-Ursprünge

Der Backend-Start bricht absichtlich ab, wenn Produktion mit SQLite, ohne
PostgreSQL oder mit einem unsicheren JWT-Schlüssel konfiguriert ist.

## E-Mail-Versand (Infomaniak)

Ohne diese Variablen wird **keine** Bestätigungsmail verschickt: die
Registrierung legt das Konto an, meldet `email_versandt: false` und protokolliert
eine Zeile. Niemand kommt dann durch die Verifikation.

- `MAIL_HOST=mail.infomaniak.com`
- `MAIL_PORT=587` (STARTTLS, offizieller Standard; `465` = SSL als Alternative)
- `MAIL_USER` — vollständige Absenderadresse
- `MAIL_PASSWORD` — das für diese Adresse erzeugte Passwort, nicht das
  Infomaniak-Kontopasswort
- `MAIL_FROM` — optional, sonst gilt `MAIL_USER`
- `MAIL_FROM_NAME` — Anzeigename, Standard «Heizungscockpit»
- `APP_BASE_URL` — Basis für den Bestätigungslink, z. B.
  `https://www.energienachweise.com`. **Zeigt sie auf die falsche Domain, führen
  alle Links ins Leere.**

Der Versand ist bewusst SMTP und kein API-Dienst: Infomaniak ist Schweizer
Hosting, damit verlässt keine Kundenadresse den Rechtsraum, in dem das Produkt
verkauft wird.

Nach dem ersten Deploy einmal die Registrierung mit einer echten Adresse testen
— ein falsches Passwort merkt man sonst erst, wenn sich jemand anmelden will.

## Sicherheitsrelevante Variablen

- `LV_UPLOAD_MAX_MB` — Obergrenze für LV-Uploads, Standard 30
- `LV_LLM_STORE_RESPONSES` — muss `false` bleiben (siehe
  `docs/OFFENE_ENTSCHEIDE.md`)

## Deployment

Für den Backend-Service:

1. Railway-Root-Directory auf `/backend` setzen.
2. Config-as-Code-Pfad auf `/backend/railway.json` setzen.
3. Vor dem ersten Deploy einer bestehenden, noch unversionierten Datenbank
   einen manuellen Snapshot erstellen.
4. Der Pre-Deploy-Befehl migriert zuerst mit
   `python -m alembic -c alembic.ini upgrade head` die Datenbank und führt danach
   `python -m app.bootstrap_admin` aus. Damit erhält auch eine neue Datenbank
   idempotent den in `ADMIN_EMAIL` und `ADMIN_INITIAL_PASSWORD` konfigurierten
   Plattformadmin. Schlägt einer der Schritte fehl, geht das neue Deployment
   nicht live.
5. Der normale App-Start führt in Produktion keinerlei DDL und keinerlei Seeds
   aus. Ein später im Konto manuell geändertes Admin-Passwort wird durch den
   Pre-Deploy-Bootstrap nicht zurückgesetzt, solange die Passwortvariable
   unverändert bleibt.

Die erste Migration ist additiv: fehlende Tabellen, Spalten und Indizes werden
angelegt. Sie enthält kein `DROP TABLE` und kein automatisches Downgrade.

## Backup und Restore

Vor jeder Migration:

1. Im Railway-PostgreSQL-Service einen manuellen Backup-Snapshot erstellen.
2. Aufbewahrungsfrist und automatischen Backup-Zeitplan im Service prüfen.
3. Regelmässig in eine separate Testdatenbank wiederherstellen.
4. Dort mindestens Benutzer-, Firmen-, Projekt-, Schema- und
   Referenzprojektanzahl mit der Quelle vergleichen.
5. Login, Projektöffnung, Schema-Neuladen und PDF-Export aus dem Restore testen.

Ein Restore wird nie zuerst gegen die produktive Datenbank getestet. Die
Anwendungsmigration und das Railway-Backup sind zwei getrennte
Sicherheitsnetze.
