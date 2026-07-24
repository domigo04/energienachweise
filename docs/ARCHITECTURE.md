# Architektur

## Grundsatz

Das Projekt ist die fachliche One Source of Truth. Projektgrunddaten,
Anlagenschema, externe Mengen, Berechnungen und Kosten sind miteinander
verbundene Sichten desselben Projekts. Das Schema ist die primäre technische
Quelle für Anlagenstruktur und daraus ableitbare Mengen. Werte, die nicht aus
dem Schema hervorgehen können, werden zentral als Projektinformationen oder
nachvollziehbare Ergänzungen geführt.

Eine Information wird möglichst nur einmal gepflegt: EBF, Erzeugertyp,
Bohrmeter usw. existieren an genau einer Stelle, und alle Module lesen den
effektiven Wert über den `ProjectContext` (`backend/app/project_context.py`),
statt ihn erneut abzufragen oder zu kopieren.

Bauteile und Leitungen tragen Eingaben und Beziehungen. Das Backend berechnet
daraus Resultate. Frontend-Demos oder Exporte dürfen keine abweichende Formel
besitzen.

## ProjectContext — der Datenhub

Je Parameter werden vier Quellen zu einem effektiven Wert zusammengeführt
(nie eine zweite persistente Kopie der Schemamengen):

- `schema_value` — live aus dem Anlagenschema (`schema_mengen.py`)
- `project_value` — zentrale Grunddaten in `HcProjectBaseData`
- `external_value` — Gebäude-/externe Ergänzung in `HcProjectParameter`
- `manual_override` — ausdrückliche Übersteuerung durch den Planer (gewinnt)

Daraus entstehen `effective_value`, `source`, `confidence` und `status`. Das
Schema leitet ausdrücklich auch strukturierte Grössen ab: Erzeugertyp,
Erzeugerleistung (getrennt von der Verbraucherleistung), Bohrmeter
(Sondenanzahl × Länge) und Speichervolumen (summierte Einzelinhalte).

## Aktueller Stack

- React/Vite/Tailwind
- React Flow als Schema-Editor
- FastAPI und SQLAlchemy
- PostgreSQL in Produktion
- SQLite nur lokal
- JWT-Authentifizierung

## Aktueller Datenstand

- `HcProject`: Projekt und Grunddaten
- `HcSchema.graph_json`: vollständiger Schema-Graph
- `HcHeatingGroup`: aktuell noch separate Heizgruppen
- `Kostenschaetzung`: aktueller Kostenstand
- `KostenschaetzungVersion`: freigegebene Kostensnapshots
- `RefProjekt`/`RefKostenzeile`: firmeninterne Referenzdaten

`HcCalculationResult` existiert, ist aber noch nicht in einen verbindlichen
Revisionsablauf eingebunden.

## Zielbild ohne unnötigen Komplettumbau

Das Graph-JSON bleibt vorerst bestehen. Ergänzt werden:

- Schema-Revision mit fortlaufender Nummer
- unveränderbares Graph-Snapshot
- Eingabe- und Berechnungssnapshot
- Version des Rechenkerns
- Status: Entwurf, geprüft, freigegeben, verworfen
- Ersteller, Prüfer und Freigabeperson
- Änderungsprotokoll

Ein Autosave aktualisiert den Arbeitsstand. Ein bewusstes „Stand speichern“
erzeugt eine Revision. Eine Freigabe sperrt diese Revision dauerhaft.

## Änderungsprotokoll

Relevante Ereignisse werden append-only gespeichert:

- Bauteil platziert, gelöscht, verschoben oder gedreht
- Leitung erstellt, gelöscht oder geometrisch geändert
- Eigenschaft oder manueller Wert geändert
- Berechnung ausgeführt
- Warnung ignoriert oder erledigt
- Revision erstellt, geprüft oder freigegeben
- Export erzeugt

Mindestens gespeichert werden:

- Firma, Projekt, Schema und Revision
- Benutzer-ID und sichtbarer Benutzername
- Zeitpunkt
- Ereignistyp
- betroffene Element-IDs
- vorher/nachher oder ein kompakter Diff

Autosave-Bewegungen werden zusammengefasst, damit das Protokoll nicht jede
Mausbewegung einzeln speichert.

## Gleichzeitiges Arbeiten

Erste Stufe:

- sichtbare Anwesenheit anderer Nutzer;
- Soft-Lock auf aktiv bearbeiteten Bauteilen oder Bereichen;
- Hinweis statt stiller Überschreibung;
- Konflikterkennung über Revisionsnummer.

Echte Echtzeit-Kollaboration ist eine spätere Stufe. Zuerst müssen Revisionen
und Konflikterkennung korrekt sein.

## Berechtigungen

Jeder Projekt-, Schema-, Gruppen-, Kosten- und Exportendpunkt prüft:

1. Benutzer ist aktiv.
2. Benutzer gehört zur Firma des Projekts.
3. Benutzerrolle erlaubt die Aktion.

Es darf keinen Mischzustand geben, bei dem die Projektliste privat ist, direkte
Schema-IDs innerhalb der Firma aber zugänglich sind. Projekte sind firmenweit;
Schreib- und Freigaberechte werden explizit geregelt.

## Persistenz

Benutzer, Firmen, Projekte und Referenzen liegen in PostgreSQL. Ein Deployment
oder Git-Push darf diese Daten nicht neu anlegen oder löschen.

Voraussetzungen auf Railway:

- PostgreSQL-Service vorhanden;
- Backend-Variable `DATABASE_URL` mit diesem Service verbunden;
- keine produktive SQLite-Datei im Container;
- Migrationen separat und versioniert ausführen;
- Backup- und Restore-Test.

`Base.metadata.create_all()` und manuelle `ALTER TABLE`-Operationen beim
App-Start werden durch Alembic-Migrationen ersetzt. Startcode darf keine
fachlichen Tabellen löschen.

## Dokumentimport

Submissionen werden nicht direkt zu Referenzen. Der Import besitzt Stufen:

1. Originaldatei speichern und hashen.
2. Text und Tabellen extrahieren.
3. BKP, Position, Betrag, Rabatt, Skonto und Projektdaten vorschlagen.
4. Unsichere Werte markieren.
5. Nutzer korrigiert und bestätigt.
6. Freigabe erzeugt eine verwendbare Referenz.

Original, extrahierte Werte, Korrekturen und Freigabe bleiben nachvollziehbar.

## Export

Jeder Export verwendet genau eine Projekt- oder Schema-Revision. Er enthält:

- Revisionsstand und Rechenkernversion;
- Eingaben, Formeln, Zwischenschritte und Resultate;
- manuelle Überschreibungen mit Begründung;
- Benutzer für Bearbeitung, Prüfung und Freigabe;
- Plankopf und Bauteileigenschaften.

Schemaansicht und PDF verwenden dieselbe Geometriequelle.
