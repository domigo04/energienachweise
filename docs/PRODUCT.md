# Produkt

## Ziel

Das Heizungscockpit soll einen realen Heizungsplanungsablauf schneller und
nachvollziehbarer machen als die Kombination aus CAD, Excel und einzelnen
Dokumenten.

Der Kern ist nicht ein allgemeines CAD. Der Kern ist ein fachlich intelligentes
Hydraulikschema, aus dem Berechnungen, Prüfungen, Bauteildaten, Kosten und
Exporte entstehen.

## Zielgruppe

- Gebäudetechnikplaner Heizung
- Projekt- und Fachprojektleiter
- kleine und mittlere Planungsbüros

## Kernablauf im Projekt

1. Projekt oder Vorlage öffnen.
2. Schema zeichnen und Bauteile parametrisieren.
3. Hydraulik live berechnen und Warnungen bearbeiten.
4. automatische Werte prüfen oder begründet überschreiben.
5. einen fachlich geprüften Stand speichern und freigeben.
6. Schema, Rechenwege, Bauteildaten und Plankopf aus derselben Revision exportieren.

Ein Projekt gilt erst als erfolgreich bearbeitet, wenn ein echter, prüfbarer
Stand exportiert und später identisch wieder geöffnet werden kann.

## Schnellrechner

Ventil, Druckverlust und weitere Einzelberechnungen bleiben ohne Projekt
nutzbar. Sie verwenden denselben Backend-Rechenkern wie das Schema. Neue
Schnellrechner haben aktuell keine Priorität.

## Kostenschätzung und Referenzen

- Referenzprojekte sind vertrauliche Firmendaten.
- Es gibt keinen firmenübergreifenden Referenzpool.
- Jede Firma baut ihre eigene Datenbasis auf.
- Der Coldstart wird durch Dokumentimport erleichtert: gerechnete
  Unternehmer-Submissionen werden eingelesen, automatisch strukturiert und
  anschliessend durch einen Nutzer korrigiert und freigegeben.
- Nicht geprüfte Importdaten dürfen nicht als vollwertige Referenzen rechnen.
- Die Herkunft jeder verwendeten Zahl bleibt sichtbar.

## Kalibrierung der Ähnlichkeit

Die Berechnung darf datenbasiert verbessert werden, aber nicht unkontrolliert
ihre eigene Fachlogik verändern.

Vorgesehener Ablauf:

1. Ein abgeschlossenes Projekt wird temporär aus den Referenzen entfernt.
2. Das System schätzt dieses Projekt mit den übrigen Referenzen.
3. Schätzung und Ist-Kosten werden pro BKP und total verglichen.
4. Das wird als Leave-one-out-Test für viele Projekte wiederholt.
5. Gewichte und Maluswerte werden innerhalb fachlich erlaubter Grenzen optimiert.
6. Ein unabhängiger Prüfbestand entscheidet, ob die neue Konfiguration besser ist.
7. Eine neue Konfiguration wird versioniert und erst nach Freigabe produktiv.

Bei wenigen Parametern sind eine begrenzte Raster-, Random- oder
Bayes-Optimierung besser nachvollziehbar als ein genetischer Algorithmus. Ein
genetischer Algorithmus ist erst sinnvoll, wenn genügend echte Projekte
vorhanden sind und einfachere Verfahren nicht ausreichen.

Optimierungsziel ist nicht nur der kleinste Gesamtfehler. Grosse Fehler,
systematische Unterbewertungen und falsche BKP-Verteilungen müssen stärker
bestraft werden.

## Zusammenarbeit und Rollen

Projekte gehören der Firma, nicht einem einzelnen Benutzer.

Rollen:

- **Plattformadmin:** verwaltet Firmen und bestätigt Firmenadmins.
- **Firmenadmin:** verwaltet Firmenmitglieder und alle Projekte der Firma.
- **Firmenmitglied:** arbeitet an den freigegebenen Firmenprojekten.

Spätere optionale Projektrechte sind Betrachter, Bearbeiter und Prüfer.

Der Firmenadmin wird von einem Firmenmitglied beantragt und durch den
Plattformadmin bestätigt. Jede Rollenänderung wird protokolliert.

## Editor-Bedienung

- React Flow bleibt.
- Klick wählt ein Element.
- `Ctrl`/`Cmd` erweitert die Auswahl.
- `Shift` entfernt im Auswahlkontext Elemente aus der Auswahl. Während des
  Leitungszeichnens bleibt `Shift` die Winkelbegrenzung auf 0°, 45° und 90°.
- gemeinsame Aktionen auf Mehrfachauswahl: verschieben, löschen, kopieren,
  spiegeln und Eigenschaften ändern, soweit fachlich zulässig.
- Leitungen bleiben orthogonal; bewusst gesetzte 45°-Segmente bleiben erhalten.
- automatische Vorlauf-/Rücklauf-Funktionen müssen jederzeit einzeln
  nachbearbeitbar sein.

## Nicht-Ziele der nächsten Produktstufe

- kein vollständiger AutoCAD-Ersatz;
- keine komplexe Schemaerstellung auf dem Smartphone;
- kein firmenübergreifender Austausch vertraulicher Referenzkosten;
- keine selbstverändernde Blackbox-Berechnung;
- keine weiteren Gewerke, bevor der Heizungsablauf vollständig funktioniert;
- keine KI-Befehle, bevor Versionierung, Rechte und Nachvollziehbarkeit stehen.
