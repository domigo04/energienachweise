import { describe, expect, it } from 'vitest';
import {
  ALIGN, CONNECT_CORNER, DRAW_PIPE, EXTEND, JOIN, MIRROR, MODIFY, OFFSET, PLACE, TRIM,
  cursorFor, escape, finishCommand, initialMode, istBefehl, istModify,
  befehlMerken, befehlsPrompt, befehlsVorschlaege, letztenBefehlWiederholen,
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
    expect(modeLabel(startCommand(CONNECT_CORNER))).toBe('Ecke verbinden');
  });

  it('Ausrichten ist ein Befehl mit Referenz-Nutzlast', () => {
    const mode = startCommand(ALIGN, { payload: { edgeId: 'e1', segmentIndex: 0 } });
    expect(mode.type).toBe(ALIGN);
    expect(mode.payload.edgeId).toBe('e1');
    expect(modeLabel(mode)).toBe('Ausrichten');
    expect(istModify(escape(mode))).toBe(true);
  });

  it('merkt und wiederholt die letzten drei Befehle', () => {
    let verlauf = [];
    verlauf = befehlMerken(verlauf, startCommand(DRAW_PIPE));
    verlauf = befehlMerken(verlauf, startCommand(ALIGN));
    expect(letztenBefehlWiederholen(verlauf).type).toBe(ALIGN);
    expect(verlauf.map(item => item.type)).toEqual([ALIGN, DRAW_PIPE]);
  });

  it('findet Befehle über Kürzel oder Namen und sagt den nächsten Schritt', () => {
    const liste = [
      { taste:'l', name:'Leitung', type:DRAW_PIPE },
      { taste:'p', name:'Polylinie', type:DRAW_PIPE },
      { taste:'a', name:'Ausrichten', type:ALIGN },
    ];
    expect(befehlsVorschlaege('l', liste)[0].type).toBe(DRAW_PIPE);
    expect(befehlsVorschlaege('p', liste)[0].name).toBe('Polylinie');
    expect(befehlsVorschlaege('richt', liste)[0].type).toBe(ALIGN);
    expect(befehlsPrompt(startCommand(DRAW_PIPE), { hasDraft:false })).toBe('Ersten Punkt angeben');
    expect(befehlsPrompt(startCommand(DRAW_PIPE), { hasDraft:true })).toBe('Nächsten Punkt angeben');
  });

  // ── Leitungen ändern (Issue #72) ────────────────────────────────────────

  it('kennt die vier Befehle zum Ändern bestehender Leitungen', () => {
    expect(modeLabel(startCommand(OFFSET))).toBe('Versatz');
    expect(modeLabel(startCommand(TRIM))).toBe('Stutzen');
    expect(modeLabel(startCommand(JOIN))).toBe('Verbinden');
  });

  it('hält Dehnen bis Kante von Dehnen (Fensterbefehl) auseinander', () => {
    // Zwei verschiedene Befehle — die Statusleiste darf sie nie verwechseln.
    expect(modeLabel(startCommand(EXTEND))).toBe('Dehnen bis Kante');
    expect(startCommand(EXTEND).type).not.toBe(startCommand('stretch').type);
  });

  it('trägt den Fortschritt in der Nutzlast statt in eigenen Zuständen', () => {
    const versatz = startCommand(OFFSET, { persistent: true, payload: { abstand: 350 } });
    expect(istBefehl(versatz, OFFSET)).toBe(true);
    expect(versatz.payload.abstand).toBe(350);
    const stutzen = startCommand(TRIM, { persistent: true, payload: { grenzEdgeId: 'e1' } });
    expect(stutzen.payload.grenzEdgeId).toBe('e1');
  });

  it('ESC führt aus jedem der vier Befehle zurück nach modify', () => {
    [OFFSET, TRIM, EXTEND, JOIN].forEach(typ => {
      const mode = startCommand(typ, { persistent: true, payload: { irgendwas: 1 } });
      expect(istModify(escape(mode))).toBe(true);
      expect(escape(mode).payload).toBeNull();
    });
  });

  it('bleibt als Dauerbefehl aktiv, wirft aber die alte Nutzlast weg', () => {
    const mode = startCommand(TRIM, { persistent: true, payload: { grenzEdgeId: 'e1' } });
    const danach = finishCommand(mode);
    expect(danach).toEqual({ type: TRIM, persistent: true, payload: null });
  });

  it('lässt sich über denselben Knopf wieder ausschalten', () => {
    const mode = startCommand(JOIN, { persistent: true });
    expect(istModify(toggleCommand(mode, JOIN))).toBe(true);
  });
});
