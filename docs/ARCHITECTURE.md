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

React Flow ist die 2D-Interaktions- und Darstellungsschicht, nicht der Rechenkern.
Hydraulische Topologie, Betriebszustände und Berechnungen bleiben im Graph-JSON und
Backend renderer-unabhängig. Eine spätere Canvas-/WebGL-Darstellung kann deshalb die
Ansicht ersetzen, ohne den Fachgraphen neu zu bauen. Three.js ist für den aktuellen
2D-Schemaeditor kein Ziel: 3D-Rendering löst weder Portsemantik noch Topologie,
orthogonales Routing, Revisionen oder hydraulische Betriebszustände.

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

Normale Benutzer benötigen bereits an der zentralen Authentifizierungsgrenze
eine existierende, aktive Firma. Die Datenbank erlaubt eine leere
Firmenzuordnung ausschliesslich für globale Plattformadmins; es gibt keinen
automatischen Rückfall auf Firma 1. Migrationen prüfen unsichere Altbestände
vor einer Schemaänderung und reparieren Zuordnungen nicht stillschweigend.

Es darf keinen Mischzustand geben, bei dem die Projektliste privat ist, direkte
Schema-IDs innerhalb der Firma aber zugänglich sind. Projekte sind firmenweit;
Schreib- und Freigaberechte werden explizit geregelt.

### Öffentliche Auth-Routen

Login und Registrierung sind die einzigen Endpunkte ohne Token. Wiederholte
Fehlversuche werden begrenzt (`app/rate_limit.py`): eng pro Konto, weit pro
Absenderadresse. Die Antwort ist ein 429 mit `Retry-After` und ohne jede
Auskunft darüber, ob das Konto existiert.

**Pilotgrenze:** Die Zähler liegen im Arbeitsspeicher des Prozesses. Das trägt,
solange das Backend als EIN Prozess läuft — der aktuelle Railway-Start
(`uvicorn app.main:app` ohne `--workers`) tut das. Sobald mehrere
Arbeitsprozesse oder Instanzen laufen, zählt jede für sich und die tatsächliche
Grenze vervielfacht sich; dann gehören die Zähler in einen gemeinsamen Speicher.

Die Absenderadresse kommt aus dem LETZTEN Eintrag von `X-Forwarded-For` — nur
den schreibt der Proxy, der uns am nächsten steht. Wer den ersten nähme, hätte
den Schutz abgeschaltet, weil ein Aufrufer die vorderen Einträge frei erfinden
kann. Das gilt für genau eine Proxy-Ebene; kommt eine zweite dazu, muss die
Regel mitgezogen werden.

### Sitzungslebensdauer und Widerruf

- Zugriffstokens laufen standardmässig nach 15 Minuten ab; die Konfiguration
  darf für den Pilot höchstens 60 Minuten betragen.
- Jedes Token enthält die serverseitig geprüfte `session_version` des
  Benutzers. Passwortwechsel, Benutzerdeaktivierung und Entzug der
  Freischaltung erhöhen diese Version und widerrufen damit alle älteren
  Tokens sofort.
- Tokens ohne Versionsclaim gelten nach Einführung dieses Verfahrens nicht
  mehr. Ein Deployment dieser Migration verlangt deshalb einmalig ein neues
  Login für bestehende Browser-Sitzungen.
- Das Frontend speichert Token und Benutzerzustand im `sessionStorage`, nicht
  dauerhaft im `localStorage`. Beim Schliessen des Tabs, bei Ablauf oder
  Widerruf ist ein neues Login erforderlich.
- Ein HttpOnly-Cookie mit Refresh-Token ist bewusst nicht Teil dieses
  Pilot-Schnitts. Es würde eine abgestimmte SameSite-, CORS- und CSRF-Strategie
  für die getrennten Frontend-/Backend-Ursprünge benötigen.

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
