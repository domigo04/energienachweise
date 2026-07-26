import { describe, expect, it } from 'vitest';
import {
  DRAW_PIPE, MIRROR, MODIFY, PLACE,
  cursorFor, escape, finishCommand, initialMode, istModify,
  modeLabel, startCommand, toggleCommand, zeichnetLeitung,
} from './editorMode';

describe('editorMode', () => {
  it('startet im Grundzustand modify', () => {
    expect(initialMode()).toEqual({ type: MODIFY, persistent: false, payload: null });
    expect(istModify(initialMode())).toBe(true);
  });

  it('gibt bei jedem Aufruf ein eigenes Objekt zurück', () => {
    // Sonst könnte ein Aufrufer versehentlich den geteilten Grundzustand ändern.
    expect(initialMode()).not.toBe(initialMode());
  });

  // Punkt 1 / Test 1 — der wichtigste Fall überhaupt.
  it('ESC führt aus JEDEM Befehl zurück nach modify', () => {
    for (const type of [DRAW_PIPE, PLACE, MIRROR, MODIFY]) {
      expect(escape(startCommand(type)).type).toBe(MODIFY);
      // auch aus einem Dauerbefehl heraus
      expect(escape(startCommand(type, { persistent: true })).type).toBe(MODIFY);
    }
  });

  it('ESC löscht die Nutzlast des Befehls', () => {
    const mode = startCommand(PLACE, { payload: { nodeType: 'pump' } });
    expect(mode.payload).toEqual({ nodeType: 'pump' });
    expect(escape(mode).payload).toBeNull();
  });

  it('Abschluss fällt ohne Dauermodus auf modify zurück', () => {
    expect(finishCommand(startCommand(DRAW_PIPE)).type).toBe(MODIFY);
  });

  it('Abschluss behält einen ausdrücklichen Dauerbefehl', () => {
    const nachher = finishCommand(startCommand(DRAW_PIPE, { persistent: true }));
    expect(nachher.type).toBe(DRAW_PIPE);
    expect(nachher.persistent).toBe(true);
    // Die Nutzlast des abgeschlossenen Durchlaufs darf nicht überleben.
    expect(nachher.payload).toBeNull();
  });

  it('startCommand(modify) ist der Grundzustand, nie ein Befehl', () => {
    expect(startCommand(MODIFY, { persistent: true })).toEqual(initialMode());
  });

  it('unbekannter Befehl endet im Grundzustand statt in einem Fantasiezustand', () => {
    expect(startCommand('kein-befehl').type).toBe(MODIFY);
  });

  it('toggleCommand schaltet denselben Befehl aus', () => {
    const zeichnen = startCommand(DRAW_PIPE);
    expect(toggleCommand(zeichnen, DRAW_PIPE).type).toBe(MODIFY);
    expect(toggleCommand(initialMode(), DRAW_PIPE).type).toBe(DRAW_PIPE);
    // Von einem Befehl direkt in einen anderen.
    expect(toggleCommand(zeichnen, PLACE).type).toBe(PLACE);
  });

  it('zeichnetLeitung erkennt nur den Leitungsbefehl', () => {
    expect(zeichnetLeitung(startCommand(DRAW_PIPE))).toBe(true);
    expect(zeichnetLeitung(startCommand(PLACE))).toBe(false);
    expect(zeichnetLeitung(initialMode())).toBe(false);
  });

  it('liefert Beschriftung und Cursor für die Statusanzeige', () => {
    expect(modeLabel(initialMode())).toBe('Modify');
    expect(modeLabel(startCommand(DRAW_PIPE))).toBe('Leitung');
    expect(modeLabel(undefined)).toBe('Modify');
    expect(cursorFor(initialMode())).toBe('default');
    expect(cursorFor(startCommand(DRAW_PIPE))).toBe('crosshair');
  });
});
