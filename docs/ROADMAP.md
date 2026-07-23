# Roadmap

Die Reihenfolge richtet sich nach realer Nutzbarkeit, nicht nach sichtbarer
Featuremenge.

## P0 – Produktionsgrundlage

- [ ] Projektzugriff konsequent auf firmenweit umstellen
- [ ] Rollen Plattformadmin, Firmenadmin und Firmenmitglied einführen
- [ ] Firmenadmin-Antrag und Bestätigung protokollieren
- [ ] direkte Schema-, Gruppen-, Kosten- und Exportrouten absichern
- [ ] PostgreSQL-Persistenz auf Railway verifizieren
- [ ] Alembic-Migrationen wiederherstellen
- [ ] Startmigrationen und `DROP TABLE` aus der App entfernen
- [ ] Backup und Restore testen
- [ ] CI für Backendtests und Frontend-Build

## P1 – Editor stabilisieren und verkleinern

- [ ] `HydraulikEditor.jsx` in Zustand, Geometrie, Werkzeuge, API und UI trennen
- [ ] gemeinsame Typen und standardisierte Bauteilklassen einführen
- [ ] wiederholte Node-, Handle- und Eigenschaftslogik vereinheitlichen
- [ ] `Ctrl`/`Cmd` für Auswahl erweitern
- [ ] `Shift` für gezieltes Abwählen
- [ ] reale Performancefälle messen und mindestens 30 FPS halten
- [ ] Editor-End-to-End-Test für Zeichnen, Speichern, Laden und Export

React Flow bleibt. Ein Rendererwechsel wird nur bei einem gemessenen,
reproduzierbaren Blocker neu beurteilt.

## P2 – Revisionen, Rechenweg und Zusammenarbeit

- [ ] explizites „Stand speichern“ für Schema und Kostenschätzung
- [ ] Vorgängerversion öffnen und vergleichen
- [ ] freigegebene Revisionen unveränderbar machen
- [ ] Berechnungsversion und Resultatsnapshot speichern
- [ ] Änderungsprotokoll mit Benutzer und Diff
- [ ] Rechenweg wie in Excel im PDF-/Excel-Export
- [ ] manuelle Überschreibungen mit Quelle und Begründung
- [ ] Anwesenheit und Soft-Locks für bearbeitete Bereiche

Die Kostenschätzung besitzt bereits Freigabesnapshots. Diese werden erweitert,
nicht parallel neu erfunden.

## P3 – Eine fachliche Projektwahrheit

- [ ] separate Heizgruppen mit Schema-Verbrauchergruppen verbinden
- [ ] Grunddaten nur einmal pflegen
- [ ] Projekt-Dashboard zeigt offene Prüfungen und Freigabestände aller Module
- [ ] Plankopf und Bauteileigenschaftstabellen aus der Revision erzeugen
- [ ] Projektvorlagen für typische Anlagen

## P4 – Coldstart der Kostendaten

- [ ] Submission als PDF/Bild hochladen
- [ ] Positionen und Beträge automatisch extrahieren
- [ ] Prüfoberfläche für unsichere Zuordnungen
- [ ] Korrektur- und Freigabeprozess
- [ ] Originaldatei und Herkunft dauerhaft verknüpfen

Es werden keine Referenzdaten anderer Firmen geliefert oder vermischt.

## P5 – Rückrechnung und Kalibrierung

- [ ] Rückrechnung gegen abgeschlossene 3-Plan-Projekte
- [ ] Leave-one-out-Backtesting pro BKP und total
- [ ] Fehlerkennzahlen und systematische Abweichungen anzeigen
- [ ] Gewichte nur innerhalb fachlicher Grenzen optimieren
- [ ] unabhängigen Prüfbestand verwenden
- [ ] Konfigurationen versionieren und manuell freigeben

Erst nach genügend echten Projekten entscheiden, ob ein genetischer Algorithmus
gegenüber einer einfacheren begrenzten Optimierung einen messbaren Vorteil hat.

## Später

- Herstellerdaten und Produktauswahl
- automatische Stückliste und vertiefte Kostenableitung aus dem Schema
- Echtzeit-Kollaboration
- KI-Befehle
- weitere Gewerke

## Erfolgsmessung

Ein Pilot ist erfolgreich, wenn ein Planer:

- ein echtes Schema schneller als mit CAD und Excel fertigstellt;
- Berechnungen fachlich nachvollziehen kann;
- einen geprüften Stand exportiert;
- das Projekt später identisch wieder öffnet;
- beim nächsten Projekt freiwillig wieder das Heizungscockpit verwendet.
