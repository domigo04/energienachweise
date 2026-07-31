# Railway-Betrieb

## Verbindliche Produktionsvariablen

- `ENVIRONMENT=production`
- `DATABASE_URL` verweist auf den Railway-PostgreSQL-Service
- `SECRET_KEY` ist ein zufälliger Wert mit mindestens 32 Zeichen
- `ALLOWED_ORIGINS` enthält nur die produktiven Frontend-Ursprünge

Der Backend-Start bricht absichtlich ab, wenn Produktion mit SQLite, ohne
PostgreSQL oder mit einem unsicheren JWT-Schlüssel konfiguriert ist.

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
