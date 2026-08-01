# Pilotplan 2026

Stand: 1. August 2026

Planungszeitraum: 3. August 2026 bis 25. Januar 2027

## Zielbild und Termine

### Pilotbereitschaft bis 25. Oktober 2026

Bis zu diesem Datum gilt:

- der Umfang aus `docs/PILOT_SCOPE_V1.md` ist eingefroren;
- alle technischen Abnahmetore für reale Kundendaten sind erfüllt;
- drei geeignete Pilotbüros haben verbindlich zugesagt;
- Onboarding und erste reale Pilotprojekte haben begonnen.

Der 25. Oktober ist nicht der Termin für die abschliessende Wirksamkeitsprüfung
von sechs Kundenprojekten. Projekttermine externer Büros lassen sich nicht auf
zwei Wochen nach Pilotstart erzwingen.

### Pilotbewertung bis 25. Januar 2027

Nach drei Monaten wird entschieden, ob der Pilot erfolgreich ist, angepasst
werden muss oder gestoppt wird. Bis dahin sollen drei Büros mindestens je zwei
reale Projekte bearbeitet haben.

## Priorität gegenüber der bestehenden Roadmap

`docs/ROADMAP.md` priorisiert derzeit den LV-Import vor Produktions- und
Editorhärtung. Für die befristete Pilotvorbereitung gilt dieser Plan als
operative Prioritätsauflage: Der Schema-/Hydraulikkern, Datensicherheit,
fachliche Validierung und Export haben bis zum Pilotstart Vorrang.

Die dauerhafte Neufassung von `docs/ROADMAP.md` erfolgt in einem eigenen Issue.
Der LV-/Kostenbereich bleibt bis dahin als getrenntes Beta-Modul erhalten.

## Kapazität und Steuerung

Planungsannahme: durchschnittlich 15 Stunden interne Arbeit pro Woche.

- Gesamtbudget bis 25. Oktober: rund 180 Stunden;
- davon höchstens 144 Stunden fest verplanen;
- mindestens 36 Stunden Reserve für Findings, Regressionen und
  Integrationsaufwand;
- externe Fachprüfung, Rechtsberatung und Arbeitszeit der Pilotbüros werden
  separat geplant und früh terminiert.

Wird ein Abnahmetor im vorgesehenen Budget nicht erreicht, wird zuerst Scope
gestrichen. Der Termin wird nur gehalten, wenn Sicherheit, Datenintegrität und
fachliche Korrektheit nicht geschwächt werden.

## Arbeitsweise

- Ein Issue entspricht einem klar abgegrenzten Ergebnis.
- Ein Issue erhält einen Branch und einen Pull Request.
- Es laufen höchstens zwei Implementierungs-PRs und ein zusätzlicher
  Audit-/Review-Auftrag gleichzeitig.
- Zwei Agenten ändern nicht parallel dieselben Dateien oder dieselbe
  Schnittstelle.
- Audit und Reparatur sind getrennte Issues.
- Kritische Änderungen werden durch ein anderes Modell und Dominic geprüft.
- Kein Agent mergt selbstständig nach `main`.
- Nur Aufgaben der nächsten zwei Wochen werden detailliert auf `ready` gesetzt;
  spätere Arbeiten bleiben zunächst übergeordnete Backlog-Issues.

## Verantwortlichkeiten

| Rolle | Verantwortung |
| --- | --- |
| Dominic | Produktentscheid, fachliche Freigabe, akzeptierte Risiken, Pilotbüros und Merge |
| ChatGPT/Codex-Orchestrator | Backlog, Abhängigkeiten, Agentenaufträge, Reviewsynthese und Planpflege |
| Codex | klar begrenzte Backend-, Test-, Betriebs-, Dokumentations- und kleine Frontendaufgaben |
| Claude Code | Editor-/Zustandsanalyse, grosse zusammenhängende React-Themen und Cross-Model-Review |
| Externer Fachprüfer | unabhängige Prüfung der Golden-Testfälle und Berechnungsgrenzen |
| Pilotbüro | reale Projekte, strukturiertes Feedback und Abnahme des Arbeitsablaufs |

## Parallele externe Arbeit ab 3. August

Diese Arbeiten starten sofort und warten nicht auf die jeweilige technische
Phase:

- mindestens zehn potenzielle Pilotbüros ansprechen;
- unabhängigen Fachprüfer für die Golden-Testfälle verbindlich terminieren;
- Datenschutz- und Pilotvereinbarung durch eine Schweizer Fachperson planen;
- bis 16. August mit mindestens drei Büros den PDF-/DXF-Bedarf prüfen;
- geeignete reale Pilotprojekte und Ansprechpartner reservieren.

## Phasen bis zur Pilotbereitschaft

### Phase 1 — Umfang und Backlog

**3.–9. August · Richtbudget 10 Stunden**

Ergebnisse:

- `docs/PILOT_SCOPE_V1.md` freigegeben;
- zehn kritische Nutzerabläufe bestätigt;
- Feature-Freeze aktiv;
- Tag `pilot-scope-v1` auf dem nach `main` gemergten Scope-Stand erstellt;
- Backlog in Pilot-Blocker, nach Pilotstart und verwerfen geordnet;
- spätere Phasen als übergeordnete Issues angelegt;
- nur Phase 2 detailliert und arbeitsbereit.

Tor P1: Dominic bestätigt Umfang, Nicht-Ziele und Erfolgskriterien.

### Phase 2 — Betrieb, Datenschutz und Sicherheit

**10.–23. August · Richtbudget 34 Stunden**

Zuerst getrennte Audits für:

- PostgreSQL, Migration, Backup und Restore;
- Einladungsworkflow und Passwort-zurücksetzen;
- Login-Rate-Limiting und angemessene Token-/Sessionlaufzeit;
- Benutzerdeaktivierung und Mandantentrennung auf allen direkten Routen;
- Backend-Feature-Guards;
- Secrets, HTTPS, Request-IDs, zentralisiertes Error-Logging, Healthcheck und
  Alarmierung;
- Datenexport, Löschung, Backup-Aufbewahrung und KI-Datenflüsse.

Aus Findings entstehen priorisierte Reparatur-Issues. Mindestabnahme:

- eine leere Datenbank migriert vollständig;
- Staging und Produktion verwenden getrenntes PostgreSQL;
- ein Backup wurde tatsächlich in eine getrennte Umgebung zurückgespielt;
- kein bekannter kritischer firmenübergreifender Zugriff bleibt offen;
- inaktive Benutzer verlieren wirksam den Zugriff;
- wiederholte Loginversuche werden begrenzt;
- unsichere Standard-Secrets verhindern den Produktionsstart;
- Logs ermöglichen Fehleranalyse ohne vertrauliche Dokumentinhalte.

Tor P2: Keine fremden Projektdaten, bevor alle Mindestkriterien belegt sind.

### Phase 3 — Fachliche Berechnung validieren

**24. August–6. September · Richtbudget 34 Stunden**

Golden-Testfälle:

1. einfacher Heizkreis;
2. zwei parallele Heizgruppen;
3. Einspritzschaltung;
4. Beimischschaltung;
5. Drosselschaltung;
6. Wärmepumpe Heizkreis;
7. Wärmepumpe Solekreis;
8. Plattentauscher primär/sekundär;
9. Pumpenförderhöhe mit ungünstigstem Ast;
10. Ventilauslegung und Ventilautorität;
11. Rohrdimensionierung;
12. Expansionsgefäss.

Jeder Fall enthält Eingaben, Handrechnung, erwartetes Ergebnis, zulässige
Rundungsabweichung, Formelquelle, automatisierten Backendtest und Freigabe des
externen Fachprüfers.

Berechnungsversion, Eingaben, Ergebnis, Warnungen, Zeitpunkt, Bearbeiter und
Herkunft automatisch/manuell müssen für einen gespeicherten Stand
nachvollziehbar sein.

Tor P3: Kein ungeprüfter Fall wird als unterstützte Pilotberechnung beworben.
Ein nicht rechtzeitig validierter Fall wird aus dem Pilotumfang entfernt.

### Phase 4 — Schemaeditor stabilisieren

**7.–27. September · Richtbudget 38 Stunden plus Reserve nach Findings**

Schwerpunkte:

- wiederholtes Speichern, Schliessen und Öffnen ohne Datenverlust;
- mindestens 50 aufeinanderfolgende Änderungs-, Speicher- und
  Wiederöffnungszyklen am definierten Referenzprojekt;
- Revision wiederherstellen sowie Undo/Redo der Kernaktionen;
- Leitungen, Fangpunkte, T-Verbindungen, Drehen, Spiegeln, Inline-Bauteile,
  Trennen, Auto-RL, Layer und Underlay;
- Stressprojekt mit ungefähr 100 Bauteilen und 150–200 Leitungen;
- Autosave und Hydraulikrequests ohne sichtbare Blockierung oder veraltete
  Resultate; ältere Berechnungsrequests dürfen neuere Resultate nicht
  überschreiben;
- mindestens 15 automatisierte Browserabläufe für die Kernstrecke;
- offizielle Pilotbrowser Chrome und Edge.

Tor P4: Kein reproduzierbarer Datenverlust und kein bekannter Fehler, der einen
kritischen Nutzerablauf blockiert.

### Phase 5 — Export und DXF-Gate

**28. September–4. Oktober · Richtbudget 10 Stunden**

Der PDF-Export enthält ohne Nachbearbeitung mindestens Plankopf, Projekt- und
Schemaname, Datum, Revision, Hinweis «nicht massstäblich», Legende,
Bauteilnummern, lesbare Leitungsbeschriftungen und klar getrennte Warnungen.
Editorgriffe oder UI-Artefakte erscheinen nicht im Export.

Der DXF-Bedarf wurde bereits bis 16. August erhoben:

- mindestens zwei von drei Büros benötigen DXF zwingend: separates
  Pilot-Blocker-Issue und Budgetentscheid spätestens am 17. August;
- PDF reicht für die Pilotprojekte: DXF folgt direkt nach dem Pilotstart.

Tor P5: Mindestens zwei Pilotbüros bestätigen, dass der vorgesehene Export in
ihrem konkreten Pilotablauf verwendbar ist.

### Phase 6 — Pilot kommerziell und organisatorisch vorbereiten

**5.–11. Oktober · Richtbudget 10 Stunden interne Produktarbeit**

Ergebnisse:

- ein betreutes Dreimonatsangebot für bis zu fünf Nutzer mit Einführung,
  Unterstützung für zwei bis drei Firmenvorlagen, direktem Support und
  wöchentlichem Feedbacktermin;
- Arbeitsvorschlag CHF 5'000 pro Büro; eine Reduktion bis CHF 3'000 oder ein
  kostenloser Pilot braucht einen dokumentierten strategischen Gegenwert und
  Dominics Freigabe;
- Pilotvereinbarung, Datenschutz, Auftragsbearbeitung, Vertraulichkeit,
  Haftungsbegrenzung sowie Regeln für Datenexport und Löschung extern geprüft;
- Beispielprojekt und zwei Firmenvorlagen;
- Einführungsvideo, Kurzanleitung, bekannte Einschränkungen und Supportweg;
- drei verbindliche Pilotbüros mit verantwortlicher Kontaktperson und realen
  Projekten.

Tor P6: Dominic gibt Pilotangebot, Unterlagen, Onboarding und bekannte
Einschränkungen frei.

Ein geeignetes Pilotbüro hat zwei bis fünfzehn Heizungsplaner, erstellt
regelmässig Prinzipschemata, arbeitet teilweise mit AutoCAD/BricsCAD und Excel,
stellt zwei reale passende Projekte bereit, benennt eine verantwortliche
Person, nimmt wöchentlich am Feedback teil und besitzt eigene
Softwareentscheidungskompetenz. Ein unverbindliches Testbüro ohne reales
Projekt zählt nicht als eines der drei Pilotbüros.

### Phase 7 — Pilotstart

**12.–25. Oktober · Richtbudget 8 Stunden Produktreserve plus Onboarding**

Pro Büro:

- 90 Minuten Einführung;
- Benutzer und erstes reales Projekt einrichten;
- Standardschema laden und gemeinsam den Kernablauf einmal durchlaufen;
- Revision und PDF-Export erzeugen;
- Support- und Feedbackweg erklären.

Danach arbeitet das Büro selbstständig weiter. Dominic zeichnet nicht die
Kundenprojekte fertig und repariert keine Daten manuell, ausser ein
dokumentierter Pilot-Blocker erfordert einen freigegebenen Eingriff.

Tor P7 am 25. Oktober: drei Büros sind onboarded, erste reale Projekte laufen
und kein Sicherheits-, Datenverlust- oder fachlicher P0-Blocker ist offen.

## Messung im dreimonatigen Pilot

Wöchentlich erfasst werden:

- aktive Nutzer und bearbeitete Projekte;
- Zeit bis zum ersten fertigen Schema;
- Supportanfragen und Supportzeit;
- Fehler, Datenverluste und abgebrochene Arbeitsabläufe;
- verwendete und nicht verwendete Funktionen;
- Exporte, die intern oder extern verwendet wurden;
- freiwillige Wiederverwendung beim zweiten Projekt.

## Erfolgskriterien am 25. Januar 2027

### Technisch

- kein Datenverlust;
- keine kritische Authentifizierungs- oder Mandantentrennungslücke;
- mindestens 95 Prozent der kritischen E2E-Prüfungen erfolgreich;
- alle freigegebenen Berechnungsfälle validiert;
- Backup und Restore nachgewiesen;
- Standardprojekte ohne kritischen Absturz bearbeitbar.

### Nutzung

- drei Büros und mindestens sechs reale Projekte;
- mindestens zwei Büros verwenden das Produkt freiwillig für ein zweites
  Projekt;
- mindestens zwei Büros wollen nach dem Pilot weiterbezahlen;
- ein Standardschema entsteht ohne Dominics direkte Bearbeitung.

### Wirtschaftlich

- langfristiger Supportaufwand unter ungefähr zwei Stunden pro Projekt;
- Zahlungsbereitschaft von mindestens CHF 3'000–5'000 pro Jahr und Büro für
  den Kern;
- mindestens ein Kunde belegt einen klaren Zeitgewinn gegenüber AutoCAD und
  Excel.

## Stop- und Pivot-Kriterien

Der Kern wird neu beurteilt, wenn kein Büro ein zweites Projekt bearbeitet,
Planer trotz Einführung regelmässig zu AutoCAD zurückkehren, der Editor mehr
als drei Stunden Support pro Projekt verursacht oder Export und Berechnung
nicht in den realen Arbeitsablauf passen.

Die Kostenindikation bleibt intern/Beta, solange weniger als 30 brauchbare
Referenzprojekte vorhanden sind, kein Leave-one-out-Test durchgeführt wurde,
der Medianfehler deutlich über 15 Prozent liegt, einzelne BKP systematisch
unterschätzt werden oder die Datenqualität für Nutzer nicht nachvollziehbar
ist.

Bei einem negativen Editor-Pilot wird als Pivot ein fokussiertes Produkt aus
Hydraulikberechnung und Schemaprüfung bewertet, statt den vollständigen
CAD-ähnlichen Editor weiter auszubauen.
