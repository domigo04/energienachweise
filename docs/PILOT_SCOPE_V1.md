# Pilotumfang V1

Stand: 1. August 2026

Entscheidungsziel: Pilotbereitschaft bis 25. Oktober 2026

## Zweck

Der Pilot beweist, dass kleine und mittlere Schweizer Heizungsplanungsbüros mit
dem Heizungscockpit reale Prinzipschemata schneller und nachvollziehbarer als
mit getrennten CAD-, Excel- und PDF-Ständen bearbeiten können.

Der Pilot ist kein Nachweis für eine vollständig selbstbedienbare SaaS-Lösung
und kein vollständiger CAD- oder BIM-Ersatz. Er wird betreut durchgeführt.

## Kernversprechen

Ein Planer kann nach einer Einführung ein unterstütztes Projekt anlegen, ein
fachlich intelligentes Hydraulikschema erstellen, die berechneten Werte und
Warnungen nachvollziehen, einen unveränderbaren Stand sichern, einen
brauchbaren PDF-Export erzeugen und denselben Projektstand später wieder
öffnen.

Schema, Berechnung, Revision und Export verwenden dieselbe Projektgrundlage.

## Unterstützter Anwendungsbereich

Die folgenden Funktionen gehören zum Pilotkern, sofern die Abnahmetore in
`docs/PILOT_PLAN.md` erfüllt sind:

### Anlagen und Kreise

- Sole/Wasser- und Luft/Wasser-Wärmepumpen;
- Fernwärmeübergaben und hydraulische Trennung über Plattentauscher;
- ein oder zwei Wärmeerzeuger ohne komplexe Kaskadenregelung;
- technische Speicher und BWW-Speicher, wobei BWW-Speicher im Pilot nicht nach
  SIA 385 dimensioniert werden;
- Heizungsverteiler mit zwei bis acht Verbrauchergruppen;
- Einspritz-, Beimisch- und Drosselschaltungen nach `PHYSIK.md`;
- Heizungs-, Kälte- und Sole-Layer, ohne vollständige Kälteplanung;
- Pumpen, 2-/3-Weg-Ventile, Wärmezähler, Plattentauscher, STAD,
  Temperaturfühler und die bereits vorhandenen Hilfsbauteile;
- hydraulische Anschlussmarker und Auto-VL/RL-Paare im dokumentierten Umfang.

### Berechnung

- Volumenstrom, Mischtemperaturen und Massenstrombilanzen;
- Druckverlust in Reihen- und Parallelschaltungen;
- Pumpenförderhöhe mit gemeinsamem Teil und ungünstigstem Ast;
- Ventilauslegung und Ventilautorität;
- Wärmepumpen-Heiz- und Quellenkreis im dokumentierten Umfang;
- Plattentauscher auf Primär- und Sekundärseite;
- automatische Rohrdimensionierung anhand der hinterlegten Tabelle;
- Expansionsgefäss ausdrücklich als Planungshilfe.

Die verbindlichen Formeln und Grenzen stehen in `PHYSIK.md`. Eine Berechnung
wird im Pilot erst freigegeben, nachdem der zugehörige Golden-Testfall extern
geprüft wurde. Bis dahin ist sie nicht Teil des freigegebenen Pilotumfangs.

### Editor und Projektdaten

- Projekt erstellen und öffnen;
- Schema leer oder aus einer freigegebenen Vorlage starten;
- Bauteile platzieren, parametrisieren, drehen, spiegeln und löschen;
- Leitungen, Eckpunkte, T-Verbindungen und Inline-Bauteile bearbeiten;
- Schema speichern, neu laden und eine Revision wiederherstellen;
- nachvollziehbare Warnungen und manuelle Übersteuerungen;
- PDF-Export aus dem freigegebenen Revisionsstand;
- Chrome und Edge in den für den Pilot festgelegten Versionen.

## Nicht unterstützt

- Dampf, BHKW und Solarthermie;
- komplexe Erzeugerkaskaden oder vollständige Kaskadenregelungen;
- vollständige Trinkwasser-, Kälte-, Lüftungs-, Sanitär- oder Elektroplanung;
- automatische Herstellerdimensionierung oder verbindliche Produktauswahl;
- vollständige Ausführungsplanung;
- automatischer hydraulischer Abgleich eines vollständigen Rohrnetzes;
- Revit-, IFC- oder bidirektionale CAD-Integration;
- Schemaerstellung auf dem Smartphone;
- Safari oder weitere Browser ohne gesonderte Freigabe;
- selbstverändernde oder nicht nachvollziehbare Berechnungslogik;
- Zahlungsabwicklung, öffentliche Selbstregistrierung oder ein öffentliches
  Selbstbedienungs-Abo.

DXF ist ein Entscheidungspunkt, kein zugesicherter Pilotbestandteil. Benötigen
mindestens zwei von drei ausgewählten Pilotbüros zwingend eine bearbeitbare
CAD-Datei, wird ein minimaler DXF-Export zum separaten Pilot-Blocker. Ist er im
Zeitbudget nicht sicher lieferbar, werden Pilotumfang oder Starttermin neu
entschieden.

## Beta ausserhalb des Pilotkerns

LV-Import, OCR/KI-Auswertung, Referenzprojekte und Kostenschätzung bleiben ein
getrenntes Beta-Zusatzmodul. Sie dürfen mit ausgewählten Pilotbüros untersucht
werden, sind aber kein Abnahmekriterium für den Schema-/Hydraulikpilot und
dürfen dessen Stabilisierung nicht blockieren.

Die Kostenschätzung wird bis zu einem belastbaren Leave-one-out-Backtesting als
«Kostenindikation aus Referenzprojekten» bezeichnet.

## Feature-Freeze bis zum Pilotstart

Bis zur Pilotbereitschaft werden nicht begonnen:

- weitere Gewerke;
- neue Schnellrechner;
- KI-Chat oder automatische Schemaerzeugung;
- Revit-/IFC-Integration;
- vollständige Zahlungsintegration;
- mobile Schemaerstellung;
- weitere CAD-Befehle;
- zusätzliche Kostenschätzungslogiken;
- neue Bauteilfamilien, ausser ein bestätigtes Pilotprojekt wird dadurch
  blockiert.

Eine Ausnahme braucht ein GitHub-Issue mit nachgewiesener Pilot-Relevanz und
Dominics ausdrückliche Freigabe.

## Zehn kritische Nutzerabläufe

1. **Benutzerzugang:** Ein eingeladener aktiver Benutzer meldet sich an und
   sieht ausschliesslich Projekte seiner Firma.
2. **Projektstart:** Der Benutzer erstellt ein Projekt mit den erforderlichen
   Grunddaten und kann es später wiederfinden.
3. **Schemastart:** Er öffnet ein leeres Schema oder startet aus einer
   freigegebenen Firmenvorlage.
4. **Bauteile:** Er platziert, benennt und parametrisiert die für das Projekt
   erforderlichen Bauteile.
5. **Topologie:** Er verbindet und bearbeitet Leitungen, Eckpunkte,
   T-Verbindungen und Inline-Bauteile ohne ungewollte Verbindungen.
6. **Berechnung:** Er gibt hydraulische Werte ein und erhält reproduzierbare
   Resultate aus dem Backend-Rechenkern.
7. **Korrektur:** Er versteht Warnungen, korrigiert Eingaben oder dokumentiert
   eine zulässige manuelle Übersteuerung.
8. **Wiederöffnung:** Er speichert, schliesst und öffnet das Schema erneut, ohne
   Leitungen, Positionen, Eigenschaften oder VL/RL-Paare zu verlieren.
9. **Verbindlicher Stand:** Er erstellt eine Revision und kann einen früheren
   freigegebenen Stand unverändert anzeigen beziehungsweise wiederherstellen.
10. **Abgabe:** Er erzeugt einen lesbaren PDF-Export mit Projekt-, Schema-,
    Revisions- und Berechnungsinformationen ohne Editorartefakte.

## Abgrenzung der Verantwortung

Das Heizungscockpit unterstützt die Planung. Der verantwortliche Fachplaner
prüft Eingaben, Resultate und Abgabe. Der Pilot darf keine formelle
Normkonformität oder Herstellerauslegung versprechen, die nicht dokumentiert
und unabhängig validiert wurde.
