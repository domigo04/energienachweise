# Browsertests für die CAD-Interaktion

Diese Tests fahren die Kerninteraktionen des Schemaeditors in einem echten
Browser durch. Sie prüfen **Geometrie**, nicht das Vorhandensein von Elementen:
gemessen werden Fangkoordinaten, gespeicherte Leitungspunkte, Anschlusslagen und
Portreferenzen aus dem Backend.

## Ausführen

Ein Kommando, wiederholbar, ohne manuelles Aufräumen:

```bash
cd frontend
npm run e2e:cad
```

Das setzt eine isolierte Testumgebung auf (temporäre SQLite-Datei, Backend,
Frontend), fährt alle Läufe und räumt danach auf. Der Rückgabewert ist 0, wenn
alle Läufe grün sind.

Einzelne Läufe:

```bash
npm run e2e:cad -- portsnap        # nur einen Lauf
npm run e2e:cad -- mirror copy     # eine Auswahl
```

Zum Nachschauen im Browser den Aufbau stehen lassen und einzeln starten:

```bash
npm run e2e:setup       # baut auf, schreibt e2e/.run.json
npm run e2e:portsnap    # beliebig oft wiederholbar
npm run e2e:stop        # beendet und räumt auf
```

`e2e/.run.json` enthält Adressen, Token und die **erzeugten** Projekt- und
Schema-IDs. Kein Test nimmt an, dass ein Schema die ID 1 hat.

Ports über `CAD_API_PORT` / `CAD_APP_PORT` verschiebbar. `CAD_KEEP_FILES=1`
behält den Arbeitsordner samt Serverprotokollen und Bildschirmfotos.

## Läufe

| Lauf | Prüft |
|---|---|
| `portsnap` | Anschlussfang: Vierfach-Identität, Anschluss gegen Raster, kein Flackern, Zoom 25–400 %, Anschlüsse nach Drehung |
| `geometrie` | Segment-Stretch waagrecht/senkrecht, Portbindung, Bauteil-Move, Undo/Redo, Drehung, Auswahlfenster, Abbrüche, Speichern/Neuladen |
| `mirror` | Spiegeln: Anschlusslagen, ID-Stabilität, Fang danach, Portreferenzen, Persistenz — mit und ohne angeschlossene Leitungen |
| `copy` | Kopieren: eigene ID, eigene Nummer, eigene Anschlüsse, **keine Geisterverbindung**, keine verwaisten Referenzen |
| `underlay` | Dieselbe Messreihe mit und ohne Unterlage im Vergleich, Zeigerereignisse, Weltsystemtreue bei 25/100/400 % |
| `datenblock` | Datenblöcke am Bauteil: gleiche Breite, Ausrichten mit Fangpunkten und Hilfslinien, Lage nach Neuladen, Inhalt der Gruppe |

Die zentrale Aussage von `portsnap` ist die Vierfach-Identität:

    sichtbarer Marker == gewählter Fang == gesetzter Endpunkt
                      == gespeicherte Portreferenz

Die letzte Stufe wird gegen den Graphen im Backend geprüft, nicht gegen den
Bildschirm.

## Die Prüfsonde

Der Editor legt im Entwicklungsmodus die letzte Fangentscheidung unter
`window.__hcSnap` ab (Verlauf unter `window.__hcSnapVerlauf`). Nur dadurch lässt
sich prüfen, dass der angezeigte Marker und der intern gewählte Fang dieselbe
Koordinate haben — ohne das wäre nur „irgendein Marker ist sichtbar" prüfbar. In
der Produktion existiert die Sonde nicht (`import.meta.env.DEV`).

## Warum nicht in CI

Der Lauf braucht Backend, Frontend und Chromium gleichzeitig und dauert einige
Minuten. Er ist lokal stabil (mehrfach wiederholt), aber ein CI-Job müsste
zusätzlich Python-Abhängigkeiten, Tesseract und den Browser bereitstellen und
würde die Laufzeit jedes Pushes deutlich verlängern. Solange der Lauf nicht über
mehrere Wochen als stabil belegt ist, ist ein rot blinkender CI-Job schlechter
als ein verlässlicher lokaler Lauf. `npm test` (Unit) und `npm run build` bleiben
das CI-Gate.

## Stolperfallen, die hier schon Zeit gekostet haben

- `PUT /api/v1/schemas/{id}/graph` erwartet den Graphen **unter `graph`**. Flach
  gesendet antwortet er 200 und löscht nichts.
- `PUT /api/v1/schemas/{id}/underlay` erwartet die Felder dagegen **flach**
  (`mime`, `data`, `x`, `y`, `w`, `h`, `scale`, `opacity`, `locked`).
- `allInnerTexts()` liefert für SVG-`<text>` leere Strings — über `textContent`
  lesen (`w.svgTexte()`).
- Bauteile nicht über `nodeIds().at(-1)` suchen: das trifft die unsichtbaren
  Leitungsanker. `w.bauteilIds('<typ>')` verwenden.
- Testgeometrie kompakt um die Bildmitte legen. Das Einpassen der Ansicht kennt
  nur Bauteilgrenzen, und Leitungsanker sind 1 px gross — eine weit ausgreifende
  Leitung landet sonst unter dem Eigenschaften-Panel.
- Vor einer Geometriemessung `w.mausWeg()` aufrufen: ein überfahrenes Handle
  wird grösser gerendert, sein gemessener Mittelpunkt wandert dadurch um einige
  Pixel.
- Über ein Neuladen hinweg nur **Weltkoordinaten** vergleichen
  (`w.portsWeltVon`). Der Bildausschnitt ist danach nicht garantiert derselbe.
- Portkoordinaten immer **nach** dem Zoomsetzen lesen.
- Palettenbezeichnungen mit Klammern („Wärmeerzeuger (WE)") müssen für die
  Suchregex maskiert werden — `w.palette()` macht das.

## Testdaten

Ausschliesslich Testwerte gegen eine temporäre SQLite-Datei, die am Ende
gelöscht wird. Es gehören **keine** echten Projekt- oder Benutzerdaten in diese
Tests.
