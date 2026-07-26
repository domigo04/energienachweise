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
```

Regeln:

- Nach dem Laden ist `modify` aktiv.
- ESC beendet jeden Befehl und führt nach `modify` zurück.
- Nach Abschluss eines Befehls gilt wieder `modify`, ausser der Befehl wurde
  ausdrücklich als dauerhaft gewählt (`persistent`).
- Der aktive Modus steht immer in der Statusleiste.
