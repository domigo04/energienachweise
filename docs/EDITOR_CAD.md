# Schemaeditor — CAD-Bedienmodell

Dieses Dokument hält fest, **was im bestehenden Editor bereits vorhanden ist und
weiterverwendet wird**, und wo für das CAD-Bediengefühl echte Lücken bestehen.
Es steht bewusst vor dem Umbau: es gibt keinen zweiten Editor neben dem
bestehenden.

## Analysebefund

Der Editor ist bereits deutlich CAD-näher, als es von aussen wirkt. Vorhanden
und funktionsfähig:

| Bereich | Stelle | Bewertung |
|---|---|---|
| Polyline-Geometrie je Leitung | `edge.data.points` + `cad_polyline`, `polyline_version` | wird weiterverwendet |
| Freie Endpunkte im Canvas | `junction`-Nodes mit `data.cad_anchor` | wird weiterverwendet |
| Einzige Edge-Erzeugung | `schema/edgeFactory.js` | wird weiterverwendet |
| Polyline-Mathematik | `components/hc/edges/geometry.js` | wird weiterverwendet |
| Rasterfang | `rasterPunkt`, `GRID_OPTIONEN` | wird weiterverwendet |
| Orthogonaler Segmentfang | `orthogonalerSegmentfang` | wird Constraint-System |
| 45°-Fang über Shift | `auf45GradFangen` | wird Constraint-System |
| Objektfang + Hilfslinien | `objektAusrichtung`, `guidesAmPunkt` | wird weiterverwendet |
| Fangpunktliste | `objektFangpunkte` (Ports + Leitungsendpunkte) | wird weiterverwendet |
| Fang auf Leitung / T-Stück | `naechsteLeitung`, `leitungTeilen` | wird weiterverwendet |
| Eckpunkt-/Segment-/Endpunkt-Grips | `edgePointDrag`, `edgeSegmentDrag`, `edgeEndpointDrag` | wird weiterverwendet |
| Zeichnen mehrerer Eckpunkte | `leitungsEntwurf` + `cadKlick` | wird weiterverwendet |
| Enter beendet, Backspace nimmt zurück | Tastaturhandler | wird weiterverwendet |
| Rechtsklick bricht ab | `onPaneContextMenu` | wird weiterverwendet |
| Shortcuts greifen nicht in Inputs | Prüfung auf `INPUT/TEXTAREA/SELECT` | wird weiterverwendet |
| Underlay, Revisionen, Undo | eigene Bereiche | unberührt |

Damit ist der Kern des CAD-Verhaltens vorhanden. Nicht vorhanden waren:

1. **Ein zentraler Modus.** Der Zustand lag in zwei Booleans (`zeichenModus`,
   `dauerLeitung`) plus dem impliziten „läuft ein Entwurf?". Genau daraus
   entsteht die Frage „bin ich noch im Leitungsmodus?".
2. **ORTHO als umschaltbarer Zustand.** Orthogonal war fest verdrahtet, 45° nur
   über Shift, ohne sichtbaren Zustand.
3. **Temporäre Masse beim Zeichnen.** Die Länge des laufenden Segments war
   nirgends sichtbar.
4. **Numerische Direkteingabe.** Es gab keine Möglichkeit, eine Länge zu tippen.
5. **Snap-Typen.** Es gab einen gestrichelten Kreis in zwei Farben, aber keine
   unterscheidbaren Marker und keine Benennung des Fangs.
6. **Statusleiste.** Nur eine kleine Pille „Direktes Zeichnen aktiv".

## Trennung Geometrie / Hydraulik

Der Umbau zieht die Trennlinie so:

```
schema/editorMode.js    Befehlszustand         (rein, testbar, kein React)
schema/cadConstraints.js Geometrie/Constraints (rein, testbar, kein React)
schema/edgeFactory.js   hydraulische Leitung   (bleibt die einzige Quelle)
HydraulikEditor.jsx     Bedienung + Bindung an React Flow
```

Geometrie kennt keine Hydraulik: `cadConstraints.js` weiss nichts über
Vorlauf, Rücklauf, Layer oder Medien. Hydraulik kennt keine Pixel:
`edgeFactory.js` entscheidet über Gültigkeit einer Verbindung, nicht über ihren
Verlauf. Beide beschreiben dasselbe Objekt — die Leitung —, aber von
verschiedenen Seiten.

React Flow bleibt Viewport, Node-Host und Persistenzformat. Die CAD-Geometrie
wird bereits heute über `ViewportPortal` in einem eigenen SVG gezeichnet, nicht
über die React-Flow-Verbindungsmechanik. Dieser Weg wird ausgebaut, nicht
ersetzt.

## Bedienmodell

```
modify      neutraler Grundzustand, Auswahl und Bearbeitung
draw-pipe   Leitung zeichnen
place       Bauteil aus der Bibliothek setzen
mirror      Spiegelachse angeben
trim        Abschnitt bis zur nächsten Schnittkante entfernen
```

Regeln:

- Nach dem Laden ist `modify` aktiv.
- ESC beendet jeden Befehl und führt nach `modify` zurück.
- Nach Abschluss eines Befehls gilt wieder `modify`, ausser der Befehl wurde
  ausdrücklich als dauerhaft gewählt (`persistent`).
- Der aktive Modus steht immer in der Statusleiste.
- `draw-pipe` startet auch ohne Tastendruck, wenn direkt ein **Bauteilanschluss**
  angeklickt wird. Der Anschluss ist ein kleines, bewusst getroffenes Ziel — die
  Sperre gegen zufällige Leitungen (`canStartHydraulicLine`) gilt weiter für die
  freie Fläche, wo ein Versehen möglich wäre.
- Der Leitungsknopf hat drei Stufen: aus → einmalig → dauerhaft → aus. „Dauerhaft"
  ist kein eigenes Werkzeug, sondern eine Eigenschaft des Befehls.

## Werkzeugleiste am Canvasrand

Alle Zeichenbefehle stehen senkrecht am linken Rand der Zeichenfläche
(`.hc-toolrail`), nur als Symbol, mit der Taste am Knopf und im Tooltip:

| Werkzeug | Befehl |
|---|---|
| Leitung zeichnen | `draw-pipe`, drei Stufen (aus → einmalig → dauerhaft) |
| Verschieben | `move` |
| Bauteil drehen | 90°-Drehung des gewählten Bauteils |
| Bauteil spiegeln | waagrechte Spiegelung |
| Ausrichten | `align` |
| Mit Lücke trennen | `break` |
| Trimmen | `trim`, Befehl `TR`, bleibt bis ESC aktiv |
| Dehnen | `stretch` |
| Auswahl kopieren | Bauteile, Leitungen und einzelne Teilstücke gemeinsam |
| Auswahl löschen | dieselbe gemeinsame Auswahl in einer Undo-Aktion |
| Notiz-Stecknadel | Eintrag im Projektjournal |

Drei Gründe für die Leiste:

1. **Fünf dieser Befehle gab es vorher nur als Taste** — wer sie nicht auswendig
   kannte, wusste nicht, dass es sie gibt.
2. **Die Kopfzeile mischte vier Dinge**: Zustand, Menüs, eine Meldung und
   Werkzeuge. Jetzt bleibt dort, was das Projekt betrifft; die Werkzeuge stehen
   dort, wo gezeichnet wird.
3. **Ein Werkzeug ohne passende Auswahl ist abgeblendet**, nicht still
   wirkungslos. Drehen ohne gewähltes Bauteil und Trennen ohne gewählte Leitung
   sagen das, statt beim Klick nichts zu tun.

Knopf und Taste gehen durch **dieselbe** Funktion (`leitungBefehl`,
`trennenStarten`, `dehnenStarten`, `ausrichtenUmschalten`). Zwei Kopien desselben
Befehls laufen früher oder später auseinander, und dann tut der Knopf etwas
anderes als die Taste.

## Leitung beenden

| Geste | Wirkung |
|---|---|
| Doppelklick | beendet am letzten gesetzten Eckpunkt |
| zweiter Klick auf denselben Punkt | dasselbe — es entsteht kein Nullsegment |
| Enter | beendet an der aktuellen Cursorposition |
| ESC | beendet am letzten gesetzten Eckpunkt, Dauerbefehl endet mit |
| Rechtsklick | bricht ab, ohne etwas zu erzeugen |

## Auswahlstufen an einer Leitung

Ein Klick trifft das **Teilstück**. `Tab` erweitert auf das **Leitungssystem** und
`Tab` führt zurück. Zusammen gehören Leitungen, die über eine `junction` hängen
(freier Anker, Eckknoten, T-Stück). Ein Bauteil trennt das System: sonst würde ein
Klick auf den Vorlauf über die Pumpe hinweg den Rücklauf mitmarkieren. Die
Geometrie dazu liegt rein und getestet in `schema/cadEdit.js::leitungsSystem`;
die Statusleiste sagt jederzeit, welche Stufe gewählt ist.

Jedes gerade Stück zwischen zwei Ecken ist dabei ein eigenes Auswahlobjekt.
`Cmd/Ctrl` ergänzt oder entfernt ein Teilstück, `Shift` entfernt es aus der
Auswahl. `Cmd/Ctrl+C` kopiert alle gewählten Bauteile, ganzen Leitungen und
Teilstücke; beim Einfügen erhalten freie Segmentenden echte CAD-Anker und können
wie gezeichnete Leitungsenden wieder an einen Port oder eine Leitung gefangen
werden. `Delete` entfernt dieselbe gemeinsame Auswahl.

## Trimmen (`TR`)

`T`, danach `R`, startet den dauerhaften Trimmbefehl. Alle übrigen sichtbaren
Leitungssegmente gelten als Schnittkanten. Ein Klick entfernt den Bereich des
getroffenen geraden Teilstücks zwischen den beiden nächsten Schnittkanten. Gibt
es auf diesem Teilstück keine Schnittkante, wird das ganze Teilstück von Ecke zu
Ecke entfernt. Die hydraulische Verbindung wird an der Lücke wirklich getrennt;
offene Enden sind Junctions. `ESC` beendet den Befehl.

## Ruhe im Grundzustand

Die Anschlusszone (`.hc-zone-frame` an Speicher, Wärmeerzeuger, BWW) erscheint
ausschliesslich, solange der Leitungsbefehl läuft. Im Grundzustand ist sie
Information ohne Anlass, und ein Hover-Effekt macht das Bauteil beim blossen
Darüberfahren nervös. Dasselbe gilt für die Anschlusspunkte selbst: sie wachsen
nicht mehr unter der Maus — das verschob nebenbei ihren gemessenen Mittelpunkt.

## Fensterauswahl — bewusst eine Betriebsart (Sprint-Entscheid)

Gewünscht war die CAD-Richtungslogik: links→rechts wählt nur vollständig
umschlossene Elemente, rechts→links auch bloss berührte.

Umgesetzt wurde sie zunächst über die React-Flow-Eigenschaft `selectionMode`,
die während des Ziehens je nach Richtung umgeschaltet wurde. Im Browsertest
funktionierte davon nur eine Richtung: React Flow übernimmt eine mitten im
Ziehen geänderte Betriebsart nicht mehr für die laufende Auswahl. Die
Umschaltung wurde darum zurückgebaut.

**Aktueller Zustand:** `SelectionMode.Full` — es werden ausschliesslich
vollständig umschlossene Elemente gewählt. Browser-verifiziert.

**Warum nicht selbst gebaut:** Eine eigene Fensterauswahl bräuchte vier Teile —
Unterdrücken der React-Flow-Auswahl, eigenes Gummiband, Geometrietests in
Weltkoordinaten (Bauteil-Bounding-Box und Leitungspolylinie gegen Rechteck) und
eigenes Setzen des Auswahlzustands für Knoten UND Kanten. Die ersten beiden und
der letzte greifen in genau den Pfad ein, der jetzt geprüft grün ist. Für einen
Sprint, dessen Leitsatz „Verlässlichkeit vor Funktionsumfang" lautet, ist das
das falsche Risiko.

**Verschoben, nicht verworfen.** Wenn es kommt, dann so: die Geometrieprüfungen
zuerst als reines, getestetes Modul (`cadSelection.js`) neben `cadEdit.js`, mit
`containment`/`crossing` als zwei Funktionen über Weltkoordinaten. Erst wenn
diese für Bauteile und Polylinien belegt sind, die Anbindung an den Editor —
und dann mit einem Browsertest, der beide Richtungen bei 25 %, 100 % und 200 %
sowie mit Unterlage prüft.

## Bauteil in eine Leitung einsetzen

Ein Bauteil mit zwei Anschlüssen (Pumpe, Ventil, Zähler …) wird nicht neben
eine Leitung gesetzt, sondern **in** sie:

```
vorher:    A ──────────────── B
nachher:   A ── Bauteil.top | Bauteil.bottom ── B
```

Die getroffene Leitung wird an der Klickstelle geteilt. Beide Teilstücke
übernehmen Layer, Medium, DN und die übrigen Fachdaten; die Länge wird
aufgeteilt, nicht verdoppelt. Es entsteht keine zusätzliche Junction — das
Bauteil selbst ist der Knoten zwischen den Teilstücken.

### Wer darf eingesetzt werden

Ausschliesslich `inlineInsertable` in `schema/componentRegistry.js`. Die
Eigenschaft gehört zum Bauteil, nicht zum Editor, und wird nie aus dem
Symbolnamen erraten. Nicht inline sind:

- Bauteile ohne zweiseitige Flussachse (Temperaturfühler ist ein Abgriff)
- Verzweigungen (3-Weg-Ventil)
- Anlagenteile mit eigener Anschlussgeometrie (Speicher, Wärmeerzeuger,
  Verteiler, Erdsondenfeld, Verbrauchergruppe)

### Rückmeldung vor dem Klick

Schwebt ein einsetzbares Bauteil über einer Leitung, wird der betroffene
Abschnitt hervorgehoben, der Einsetzpunkt markiert und „in Leitung einsetzen"
angezeigt. Die Vorschau steht dabei auf dem **Leitungstreffer**, nicht auf dem
Rasterpunkt — das Bauteil landet also dort, wo der Geist steht. Ohne geeignete
Leitung gilt die normale freie Platzierung.

### Verbindung entsteht nur bewusst

Eine geometrische Kreuzung zweier Leitungen erzeugt **keine** Verbindung. Eine
Verbindung entsteht nur, wenn eine Leitung ausdrücklich auf einer anderen endet
oder ein Bauteil eingesetzt wird. Ein Fang auf den Mittelpunkt einer Leitung
zählt dabei als Fang auf der Leitung: er erzeugt dieselbe T-Verbindung. Vorher
entstand dort nur ein freier Anker auf derselben Koordinate — optisch
angeschlossen, fachlich nicht.

Das Einsetzen ist EINE Rückgängig-Aktion: der Schnappschuss entsteht vor der
Erzeugung, und Bauteil wie Teilstücke liegen darin gemeinsam.
