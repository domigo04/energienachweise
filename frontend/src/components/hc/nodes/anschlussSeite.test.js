import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { anfahrtsSeite, anschluesseNachDrehung, gedrehteSeite } from './anschlussSeite';

describe('gedrehteSeite', () => {
  it('lässt eine Seite ohne Drehung unverändert', () => {
    expect(gedrehteSeite(Position.Top)).toBe(Position.Top);
    expect(gedrehteSeite(Position.Right, 0, false)).toBe(Position.Right);
  });

  it('dreht im Uhrzeigersinn — wie die CSS-Transformation', () => {
    expect(gedrehteSeite(Position.Top, 90)).toBe(Position.Right);
    expect(gedrehteSeite(Position.Right, 90)).toBe(Position.Bottom);
    expect(gedrehteSeite(Position.Bottom, 90)).toBe(Position.Left);
    expect(gedrehteSeite(Position.Left, 90)).toBe(Position.Top);
  });

  it('hält die Flussachse bei jeder Drehung zusammen', () => {
    // Das war der Fehler am 3-Weg-Ventil: die beiden Enden der Flussachse
    // müssen IMMER gegenüberliegen, sonst liegen sie nicht auf einer Höhe.
    for (const rotation of [0, 90, 180, 270, 360, -90]) {
      const a = gedrehteSeite(Position.Top, rotation);
      const b = gedrehteSeite(Position.Bottom, rotation);
      const gegenueber = {
        [Position.Top]: Position.Bottom, [Position.Bottom]: Position.Top,
        [Position.Left]: Position.Right, [Position.Right]: Position.Left,
      };
      expect(b).toBe(gegenueber[a]);
    }
  });

  it('rechnet auch mit 180°, 270° und negativen Winkeln', () => {
    expect(gedrehteSeite(Position.Top, 180)).toBe(Position.Bottom);
    expect(gedrehteSeite(Position.Top, 270)).toBe(Position.Left);
    expect(gedrehteSeite(Position.Top, 360)).toBe(Position.Top);
    expect(gedrehteSeite(Position.Top, -90)).toBe(Position.Left);
  });

  it('vertauscht beim Spiegeln links und rechts, oben und unten bleiben', () => {
    expect(gedrehteSeite(Position.Left, 0, true)).toBe(Position.Right);
    expect(gedrehteSeite(Position.Right, 0, true)).toBe(Position.Left);
    expect(gedrehteSeite(Position.Top, 0, true)).toBe(Position.Top);
    expect(gedrehteSeite(Position.Bottom, 0, true)).toBe(Position.Bottom);
  });

  it('spiegelt zuerst und dreht danach — Reihenfolge wie rotate() scaleX(-1)', () => {
    // Links → gespiegelt rechts → 90° gedreht unten.
    expect(gedrehteSeite(Position.Left, 90, true)).toBe(Position.Bottom);
    // Ohne Spiegelung wäre links → oben.
    expect(gedrehteSeite(Position.Left, 90, false)).toBe(Position.Top);
  });

  it('gibt eine unbekannte Seite unverändert zurück', () => {
    expect(gedrehteSeite(undefined, 90)).toBeUndefined();
    expect(gedrehteSeite('schräg', 90)).toBe('schräg');
  });
});

describe('anfahrtsSeite', () => {
  it('erkennt die dominante Achse', () => {
    const p = { x: 100, y: 100 };
    expect(anfahrtsSeite(p, { x: 100, y: 20 })).toBe(Position.Top);
    expect(anfahrtsSeite(p, { x: 100, y: 300 })).toBe(Position.Bottom);
    expect(anfahrtsSeite(p, { x: 10, y: 100 })).toBe(Position.Left);
    expect(anfahrtsSeite(p, { x: 400, y: 100 })).toBe(Position.Right);
  });

  it('entscheidet bei schräger Leitung nach der längeren Achse', () => {
    expect(anfahrtsSeite({ x: 0, y: 0 }, { x: 100, y: 20 })).toBe(Position.Right);
    expect(anfahrtsSeite({ x: 0, y: 0 }, { x: 20, y: 100 })).toBe(Position.Bottom);
  });

  it('gibt ohne brauchbare Punkte nichts zurück', () => {
    expect(anfahrtsSeite(null, { x: 1, y: 1 })).toBeNull();
    expect(anfahrtsSeite({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('anschluesseNachDrehung — Pumpe in einer senkrechten Leitung', () => {
  // Eine Pumpe hat zwei Anschlüsse auf ihrer Flussachse.
  const pumpe = [
    { id: 'top', position: Position.Top },
    { id: 'bottom', position: Position.Bottom },
  ];
  // Leitung A kommt von oben, Leitung B von unten.
  const anschluesse = [
    { edgeId: 'A', ende: 'target', handleId: 'top', anfahrt: Position.Top },
    { edgeId: 'B', ende: 'source', handleId: 'bottom', anfahrt: Position.Bottom },
  ];

  it('tauscht bei 180° die Anschlüsse, damit keine Leitung untendurch muss', () => {
    const wechsel = anschluesseNachDrehung(pumpe, anschluesse, 180);
    expect(wechsel).toEqual([
      { edgeId: 'A', ende: 'target', handleId: 'bottom' },
      { edgeId: 'B', ende: 'source', handleId: 'top' },
    ]);
  });

  it('ändert bei 0° nichts', () => {
    expect(anschluesseNachDrehung(pumpe, anschluesse, 0)).toEqual([]);
  });

  it('lässt bei 90° alles stehen — das Bauteil hat sich wirklich weggedreht', () => {
    // Die Anschlüsse liegen danach links und rechts; von oben kommt keiner mehr.
    expect(anschluesseNachDrehung(pumpe, anschluesse, 90)).toEqual([]);
  });

  it('lässt eine quer liegende Pumpe beim Spiegeln in Ruhe', () => {
    // 90° gedreht liegt «top» rechts und «bottom» links. Die waagrechte
    // Spiegelung vertauscht nur links und rechts der DEKLARIERTEN Seiten —
    // oben/unten bleiben, die beiden Anschlüsse also auch.
    const quer = [
      { edgeId: 'A', ende: 'target', handleId: 'top', anfahrt: Position.Right },
      { edgeId: 'B', ende: 'source', handleId: 'bottom', anfahrt: Position.Left },
    ];
    expect(anschluesseNachDrehung(pumpe, quer, 90, true)).toEqual([]);
  });

  it('tauscht beim Spiegeln, wenn die Anschlüsse links und rechts liegen', () => {
    const waagrecht = [
      { id: 'links', position: Position.Left },
      { id: 'rechts', position: Position.Right },
    ];
    const anliegend = [
      { edgeId: 'A', ende: 'target', handleId: 'links', anfahrt: Position.Left },
      { edgeId: 'B', ende: 'source', handleId: 'rechts', anfahrt: Position.Right },
    ];
    expect(anschluesseNachDrehung(waagrecht, anliegend, 0, true)).toEqual([
      { edgeId: 'A', ende: 'target', handleId: 'rechts' },
      { edgeId: 'B', ende: 'source', handleId: 'links' },
    ]);
  });
});

describe('anschluesseNachDrehung — Grenzen', () => {
  const ventil = [
    { id: 'top', position: Position.Top },
    { id: 'bottom', position: Position.Bottom },
    { id: 'right', position: Position.Right },
  ];

  it('springt nie auf einen Anschluss, der vorher frei war', () => {
    // Nur EINE Leitung, von oben, bei 90° gedrehtem Ventil: «top» liegt jetzt
    // rechts, «right» unten. Von oben liegt nur «bottom» — der ist aber frei
    // und darf deshalb nicht einspringen.
    const einzeln = [{ edgeId: 'A', ende: 'target', handleId: 'top', anfahrt: Position.Top }];
    expect(anschluesseNachDrehung(ventil, einzeln, 90)).toEqual([]);
  });

  it('lässt einen dritten Anschluss unberührt, wenn er passt', () => {
    const drei = [
      { edgeId: 'A', ende: 'target', handleId: 'top', anfahrt: Position.Bottom },
      { edgeId: 'B', ende: 'source', handleId: 'bottom', anfahrt: Position.Top },
      { edgeId: 'C', ende: 'source', handleId: 'right', anfahrt: Position.Left },
    ];
    // 180°: top→bottom, bottom→top, right→left. Alle drei passen bereits.
    expect(anschluesseNachDrehung(ventil, drei, 180)).toEqual([]);
  });

  it('kommt mit unbekannten Anschlüssen und leerer Eingabe klar', () => {
    expect(anschluesseNachDrehung([], [], 180)).toEqual([]);
    expect(anschluesseNachDrehung(ventil, [
      { edgeId: 'A', ende: 'target', handleId: 'gibtsnicht', anfahrt: Position.Top },
    ], 180)).toEqual([]);
  });
});
