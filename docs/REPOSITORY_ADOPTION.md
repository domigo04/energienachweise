# Übernommene Muster aus `crmSirego` und `sirego`

Dieses Dokument hält fest, welche Konzepte aus den beiden SIREGO-Repositories
in das Heizungscockpit übernommen werden. Es werden keine fremden Stacks oder
ganzen Module kopiert. FastAPI, React/Vite und React Flow bleiben bestehen.

## Leitentscheidungen

1. **Eine gemeinsame Projektsprache.** Vergleichsrelevante Merkmale besitzen
   stabile Codes, sichtbare Labels und Synonyme. Die Backend-Registry
   `app.fachwerte` ist die einzige Quelle für LV-Import, Referenzprojekte,
   Kostenschätzung und Projektinformationen.
2. **Ein Projekt statt Dateninseln.** Schema, ProjectContext, Berechnungen,
   LV-Import, Kosten, Konditionen, Revisionen und Aktivitäten sind Sichten
   desselben Projekts. Werte werden nicht unabhängig mehrfach gepflegt.
3. **Nachvollziehbare Änderungen.** Fachliche Änderungen speichern Benutzer,
   Zeitpunkt, vorher/nachher, Quelle und den Status automatisch/manuell.
4. **Unveränderbare Freigaben.** Freigegebene Schema-, Berechnungs- und
   Kostenstände sind Snapshots. Spätere Änderungen erzeugen neue Versionen.
5. **Kompakte Fachoberflächen.** Karten, Felder, Einheiten, Status und Warnungen
   verwenden eine gemeinsame, ruhige visuelle Sprache. Farbe markiert nur
   Auswahl, Handlungsbedarf, Fehler oder Freigabe.
6. **Objektive Pilotmessung.** Erfolg wird über reale Abläufe und nicht über
   geschätzte Fertigstellungsprozente gemessen.
7. **Zentrale Sicherheit.** Rollen, Firmenzugriff und Sessions werden an
   gemeinsamen Grenzen geprüft, nicht individuell pro Oberfläche erfunden.

## Umsetzungsstand

### Bereits vorhanden

- zentrale Fachwerte mit Codes, Labels und Synonymen;
- verlustfreie Freigabe von LV-Grunddaten, Merkmalen, Kosten und kommerziellen
  Konditionen in ein Referenzprojekt;
- firmenbegrenzte Projekt- und Referenzabfragen;
- Schema-Revisionen, Audit-Ereignisse und Kostensnapshots;
- ProjectContext mit Herkunft, Vertrauen und manueller Übersteuerung;
- kompakte Karten- und Reviewdarstellung im LV-Importer.

### Diese Etappe

- Referenzprojekt und Grobkostenschätzung beziehen Wärmeerzeuger,
  Wärmeabgaben, Nutzung, Projektart und Zertifizierung direkt aus der
  Backend-Registry;
- historische Labels bleiben im Berechnungskern kompatibel, neue Eingaben
  werden als kanonische Codes gespeichert;
- Mehrfachauswahlen erhalten ein gemeinsames, zugängliches Chip-Design.

### Nächste getrennte Issues

1. **Projektinformationen anbinden:** dieselben Fachwerte und Mehrfachauswahlen
   auf der Projektinfo-Seite; ProjectContext bleibt die einzige effektive
   Quelle.
2. **Berechnungsdialog-Standard:** Eingaben, automatisch übernommene Werte,
   manuelle Overrides, Zwischenresultate, Ergebnis, Warnungen, Quelle und
   Rechenkernversion für Erdsonde, Speicher, BWW, Pumpe und Expansion.
3. **Aktivitätsansicht:** bestehende Audit-Ereignisse als verständliche
   Projektchronik mit vorher/nachher und Herkunft anzeigen.
4. **Pilotmetriken:** Zeit bis zum ersten gespeicherten Stand, erfolgreiche
   Wiederöffnung, Exporte, Fehler, Supportfälle und freiwillige Zweitnutzung.
   Keine Maus-Heatmap und keine Projektinhalte in Telemetriedaten.
5. **Session-Härtung:** kurzlebige beziehungsweise widerrufbare Sessions in
   sicheren HttpOnly-Cookies; eigener Security-Review und Migrationsplan.
6. **Freigabekette vervollständigen:** Berechnungssnapshot und Export eindeutig
   mit Projekt-, Schema- und Rechenkernrevision verbinden.

## Nicht übernommen

- Next.js oder Prisma als zweiter Anwendungsstack;
- Three.js für den 2D-Schemaeditor;
- Liveblocks vor korrekter Revisions- und Konfliktlogik;
- hartcodierte Admin-URL-Schlüssel;
- Fachberechnungen im Frontend;
- selbstgebautes Klicktracking ohne Datenschutz- und Datenqualitätskonzept;
- Zahlungsintegration vor einem erfolgreichen Pilot.
