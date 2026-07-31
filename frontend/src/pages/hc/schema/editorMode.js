// Der eine Befehlszustand des Editors.
//
// Vorher lag er in mehreren Booleans (`zeichenModus`, `dauerLeitung`) plus dem
// impliziten „läuft gerade ein Entwurf?". Aus dieser Verteilung entsteht genau
// die Frage, die ein Planer nie stellen soll: „Bin ich noch im Leitungsmodus?"
//
// Hier ist der Zustand EIN Objekt, und jeder Übergang läuft über eine Funktion
// dieser Datei. Kein React, keine Pixel, keine Hydraulik — dadurch testbar.

export const MODIFY = 'modify';        // neutraler Grundzustand
export const DRAW_PIPE = 'draw-pipe';  // Leitung zeichnen
export const PLACE = 'place';          // Bauteil aus der Bibliothek setzen
export const MIRROR = 'mirror';        // Spiegelachse angeben
// Ausrichten: erst das Referenzsegment wählen, dann das Segment, das parallel
// bzw. auf dieselbe Flucht soll. Die Nutzlast trägt die Referenz zwischen den
// beiden Klicks — der Befehl hat damit KEINEN eigenen Zustand ausserhalb.
export const ALIGN = 'align';
// Verschieben: erst den Startpunkt (Basispunkt), dann den Zielpunkt klicken.
// Die Auswahl steht bereits fest, wenn der Befehl startet — sie liegt in der
// Nutzlast, damit ein Klick auf die Zeichenfläche sie nicht abwählt.
export const MOVE = 'move';

// Der Grundzustand. Nach dem Laden und nach jedem ESC gilt genau das.
export const HOME = Object.freeze({ type: MODIFY, persistent: false, payload: null });

const BEFEHLE = new Set([MODIFY, DRAW_PIPE, PLACE, MIRROR, ALIGN, MOVE]);

/** Grundzustand. Absichtlich eine Funktion — nie eine gemeinsame Referenz teilen. */
export function initialMode() {
  return { ...HOME };
}

/**
 * Einen Befehl starten.
 *
 * `persistent` heisst: der Befehl bleibt nach dem Abschluss aktiv (CAD-Dauer-
 * modus). Ohne das Flag fällt der Editor nach dem Abschluss auf `modify`
 * zurück — das ist der Revit-nahe Normalfall.
 */
export function startCommand(type, { persistent = false, payload = null } = {}) {
  if (!BEFEHLE.has(type)) return initialMode();
  if (type === MODIFY) return initialMode();
  return { type, persistent: Boolean(persistent), payload };
}

/**
 * ESC. Führt AUSNAHMSLOS nach `modify` — auch aus einem Dauerbefehl heraus.
 * Es darf keinen Zustand geben, aus dem ESC nicht herausführt.
 *
 * Der bisherige Zustand wird bewusst ignoriert; er ist nur der Lesbarkeit halber
 * ein Parameter, damit an der Aufrufstelle sichtbar bleibt, was abgebrochen wird.
 */
export function escape(_mode = null) {
  void _mode;
  return initialMode();
}

/**
 * Ein Befehl ist fertig (Enter, Rechtsklick, letzter Klick).
 * Dauerbefehl → derselbe Befehl erneut, aber ohne Nutzlast des alten Durchlaufs.
 * Sonst → `modify`.
 */
export function finishCommand(mode) {
  if (mode?.persistent && BEFEHLE.has(mode.type) && mode.type !== MODIFY) {
    return { type: mode.type, persistent: true, payload: null };
  }
  return initialMode();
}

/** Denselben Befehl ein-/ausschalten (Toolbar-Knopf zweimal drücken). */
export function toggleCommand(mode, type, options = {}) {
  return mode?.type === type ? initialMode() : startCommand(type, options);
}

export const istModify = (mode) => (mode?.type || MODIFY) === MODIFY;
export const istBefehl = (mode, type) => mode?.type === type;
export const zeichnetLeitung = (mode) => mode?.type === DRAW_PIPE;

/** Beschriftung für Statusleiste und Cursor-Hinweis. */
export const MODE_LABEL = {
  [MODIFY]: 'Modify',
  [DRAW_PIPE]: 'Leitung',
  [PLACE]: 'Bauteil setzen',
  [MIRROR]: 'Spiegeln',
  [ALIGN]: 'Ausrichten',
  [MOVE]: 'Verschieben',
};

export function modeLabel(mode) {
  return MODE_LABEL[mode?.type] || MODE_LABEL[MODIFY];
}

/** Im Befehl zeigt der Canvas ein Kreuz, im Grundzustand den normalen Zeiger. */
export function cursorFor(mode) {
  return istModify(mode) ? 'default' : 'crosshair';
}
