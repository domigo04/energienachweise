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
// Mit Lücke trennen (AutoCAD BREAK): zwei Punkte auf derselben Leitung.
export const BREAK = 'break';
// Ecke verbinden: zwei Teilstücke wählen; bleibt bis ESC aktiv.
export const CONNECT_CORNER = 'connect-corner';
// Dehnen (AutoCAD STRETCH): Fenster aufziehen, dann Basis- und Zielpunkt.
export const STRETCH = 'stretch';

// Der Grundzustand. Nach dem Laden und nach jedem ESC gilt genau das.
export const HOME = Object.freeze({ type: MODIFY, persistent: false, payload: null });

const BEFEHLE = new Set([MODIFY, DRAW_PIPE, PLACE, MIRROR, ALIGN, MOVE, BREAK, CONNECT_CORNER, STRETCH]);

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
  [BREAK]: 'Mit Lücke trennen',
  [CONNECT_CORNER]: 'Ecke verbinden',
  [STRETCH]: 'Dehnen',
};

export function modeLabel(mode) {
  return MODE_LABEL[mode?.type] || MODE_LABEL[MODIFY];
}

/** Im Befehl zeigt der Canvas ein Kreuz, im Grundzustand den normalen Zeiger. */
export function cursorFor(mode) {
  return istModify(mode) ? 'default' : 'crosshair';
}

/** Verlauf der zuletzt gestarteten Befehle, neuester zuerst. */
export function befehlMerken(verlauf = [], mode, limit = 3) {
  if (!mode || mode.type === MODIFY || !BEFEHLE.has(mode.type)) return [...verlauf];
  const eintrag = { type:mode.type, persistent:Boolean(mode.persistent), payload:mode.payload || null };
  return [eintrag, ...(verlauf || []).filter(item => item?.type !== mode.type)].slice(0, limit);
}

export function letztenBefehlWiederholen(verlauf = []) {
  const letzter = verlauf?.[0];
  return letzter ? startCommand(letzter.type, { persistent:letzter.persistent, payload:letzter.payload }) : null;
}

/** Vorschläge der Befehlszeile; Kürzel und Name sind gleichwertig suchbar. */
export function befehlsVorschlaege(eingabe = '', befehle = []) {
  const query = String(eingabe).trim().toLowerCase();
  if (!query) return [...befehle].slice(0, 8);
  return befehle
    .filter(item => String(item?.taste || '').toLowerCase().startsWith(query)
      || String(item?.name || '').toLowerCase().includes(query))
    .sort((a, b) => {
      const aExakt = String(a.taste || '').toLowerCase() === query ? 0 : 1;
      const bExakt = String(b.taste || '').toLowerCase() === query ? 0 : 1;
      return aExakt - bExakt || String(a.name).localeCompare(String(b.name), 'de');
    });
}

/** Was der aktive Befehl als Nächstes erwartet. */
export function befehlsPrompt(mode, payload = {}) {
  switch (mode?.type) {
    case DRAW_PIPE: return payload.hasDraft ? 'Nächsten Punkt angeben' : 'Ersten Punkt angeben';
    case PLACE: return 'Einfügepunkt angeben';
    case MIRROR: return payload.hasStart ? 'Zweiten Punkt der Spiegelachse angeben' : 'Ersten Punkt der Spiegelachse angeben';
    case ALIGN: return mode.payload ? 'Auszurichtendes Teilstück wählen' : 'Referenzteilstück wählen';
    case MOVE: return payload.hasBase ? 'Zielpunkt angeben' : 'Basispunkt angeben';
    case BREAK: return payload.hasFirst ? 'Zweiten Trennpunkt angeben' : 'Ersten Trennpunkt angeben';
    case CONNECT_CORNER: return mode.payload?.erste ? 'Zweites Teilstück wählen' : 'Erstes Teilstück wählen';
    case STRETCH: return payload.stage || 'Auswahlfenster angeben';
    default: return 'Befehl eingeben';
  }
}
