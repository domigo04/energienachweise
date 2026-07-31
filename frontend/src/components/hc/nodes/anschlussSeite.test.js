import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { gedrehteSeite } from './anschlussSeite';

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
