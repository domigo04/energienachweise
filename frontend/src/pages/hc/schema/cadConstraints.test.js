import { describe, expect, it } from 'vitest';
import {
  DIAG, FREI, ORTHO,
  aktiverConstraint, constrainPoint, laengeAusBuffer, laengeTaste,
  massAnker, massLabel, punktAusLaenge, rasterPunkt, segmentLaenge, zugLaenge,
} from './cadConstraints';

describe('Constraint-Zustand', () => {
  it('Shift kehrt den Ortho-Zustand um', () => {
    expect(aktiverConstraint(true, false)).toBe(ORTHO);
    expect(aktiverConstraint(true, true)).toBe(DIAG);
    expect(aktiverConstraint(false, false)).toBe(FREI);
    expect(aktiverConstraint(false, true)).toBe(ORTHO);
  });
});

describe('constrainPoint', () => {
  // Punkt 4 / Test 5 — das Beispiel aus dem Auftrag, wörtlich.
  it('ORTHO führt auf die dominante Achse (Beispiel aus dem Auftrag)', () => {
    const p = constrainPoint({ x: 1000, y: 1000 }, { x: 1800, y: 1200 }, { ortho: true, grid: 10 });
    expect(p).toEqual({ x: 1800, y: 1000 });
  });

  it('ORTHO führt vertikal, wenn die y-Abweichung dominiert', () => {
    const p = constrainPoint({ x: 1000, y: 1000 }, { x: 1200, y: 1800 }, { ortho: true, grid: 10 });
    expect(p).toEqual({ x: 1000, y: 1800 });
  });

  it('ORTHO erzeugt immer exakt horizontal oder vertikal', () => {
    const origin = { x: 500, y: 500 };
    for (const ziel of [{ x: 913, y: 622 }, { x: 431, y: 1288 }, { x: -222, y: 470 }]) {
      const p = constrainPoint(origin, ziel, { ortho: true, grid: 10 });
      const istHV = p.x === origin.x || p.y === origin.y;
      expect(istHV).toBe(true);
    }
  });

  it('DIAG erlaubt exakte 45°', () => {
    const p = constrainPoint({ x: 0, y: 0 }, { x: 400, y: 380 }, { ortho: true, shift: true, grid: 10 });
    expect(Math.abs(p.x)).toBe(Math.abs(p.y));
  });

  it('FREI bindet nur ans Raster', () => {
    const p = constrainPoint({ x: 0, y: 0 }, { x: 137, y: 244 }, { ortho: false, grid: 10 });
    expect(p).toEqual({ x: 140, y: 240 });
  });

  it('ohne Startpunkt gilt nur das Raster', () => {
    expect(constrainPoint(null, { x: 137, y: 244 }, { grid: 10 })).toEqual({ x: 140, y: 240 });
  });

  it('rastert auf die konfigurierte Rasterweite', () => {
    expect(rasterPunkt({ x: 123, y: 77 }, 25)).toEqual({ x: 125, y: 75 });
  });
});

describe('Masse', () => {
  it('rechnet Segment- und Zuglänge in mm', () => {
    expect(segmentLaenge({ x: 0, y: 0 }, { x: 2400, y: 0 })).toBe(2400);
    expect(zugLaenge([{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1000 }])).toBe(3400);
    expect(zugLaenge([{ x: 0, y: 0 }])).toBe(0);
  });

  it('beschriftet CAD-artig in mm, bei grossen Längen in m', () => {
    expect(massLabel(2400)).toBe('2400 mm');
    expect(massLabel(2400.4)).toBe('2400 mm');
    expect(massLabel(12500)).toBe('12.5 m');
    expect(massLabel(0)).toBe('0 mm');
  });

  it('setzt den Massanker neben das Segment, nicht darauf', () => {
    const anker = massAnker({ x: 0, y: 0 }, { x: 1000, y: 0 }, 14);
    expect(anker.x).toBe(500);          // Mitte
    expect(anker.y).toBe(0 + 14);       // seitlich versetzt
    expect(anker.laenge).toBe(1000);
  });

  it('liefert für ein Nullsegment einen Anker ohne Länge', () => {
    expect(massAnker({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, laenge: 0 });
  });
});

describe('numerische Direkteingabe', () => {
  // Punkt 8 / Test 8 — der Kern der Demo im Auftrag.
  it('2400 nach rechts ergibt ein exakt 2400 mm langes Segment', () => {
    const start = { x: 1000, y: 1000 };
    const cursorGrobRechts = { x: 1730, y: 1042 };
    const ende = punktAusLaenge(start, cursorGrobRechts, 2400, { ortho: true });
    expect(ende).toEqual({ x: 3400, y: 1000 });
    expect(segmentLaenge(start, ende)).toBe(2400);
  });

  it('nimmt die Richtung nach links/oben/unten korrekt auf', () => {
    const start = { x: 1000, y: 1000 };
    expect(punktAusLaenge(start, { x: 200, y: 1010 }, 500, { ortho: true })).toEqual({ x: 500, y: 1000 });
    expect(punktAusLaenge(start, { x: 1010, y: 300 }, 500, { ortho: true })).toEqual({ x: 1000, y: 500 });
    expect(punktAusLaenge(start, { x: 990, y: 1700 }, 500, { ortho: true })).toEqual({ x: 1000, y: 1500 });
  });

  it('folgt im freien Modus dem Vorschauvektor mit exakter Länge', () => {
    const ende = punktAusLaenge({ x: 0, y: 0 }, { x: 30, y: 40 }, 500, { ortho: false });
    expect(segmentLaenge({ x: 0, y: 0 }, ende)).toBeCloseTo(500, 6);
    expect(ende.x).toBeCloseTo(300, 6);
    expect(ende.y).toBeCloseTo(400, 6);
  });

  it('legt bei 45° die exakte Länge auf die Diagonale', () => {
    const ende = punktAusLaenge({ x: 0, y: 0 }, { x: 100, y: 95 }, 1000, { ortho: true, shift: true });
    expect(segmentLaenge({ x: 0, y: 0 }, ende)).toBeCloseTo(1000, 6);
    expect(Math.abs(ende.x)).toBeCloseTo(Math.abs(ende.y), 6);
  });

  it('erfindet ohne Richtung keinen Punkt', () => {
    // Cursor liegt noch auf dem Startpunkt — es gibt keine Richtung.
    expect(punktAusLaenge({ x: 10, y: 10 }, { x: 10, y: 10 }, 500)).toBeNull();
    expect(punktAusLaenge(null, { x: 1, y: 1 }, 500)).toBeNull();
    expect(punktAusLaenge({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBeNull();
    expect(punktAusLaenge({ x: 0, y: 0 }, { x: 100, y: 0 }, -5)).toBeNull();
    expect(punktAusLaenge({ x: 0, y: 0 }, { x: 100, y: 0 }, 'abc')).toBeNull();
  });

  it('nimmt Ziffern, ein Dezimaltrennzeichen und Backspace', () => {
    let b = '';
    for (const k of ['2', '4', '0', '0']) b = laengeTaste(b, k).buffer;
    expect(b).toBe('2400');
    expect(laengeTaste(b, 'Backspace')).toEqual({ buffer: '240', action: 'weiter' });
    expect(laengeTaste('12', ',')).toEqual({ buffer: '12.', action: 'weiter' });
    expect(laengeTaste('12.5', '.')).toEqual({ buffer: '12.5', action: 'ignoriert' });
    expect(laengeTaste('', '.')).toEqual({ buffer: '0.', action: 'weiter' });
  });

  it('ignoriert alles andere, damit während der Eingabe kein Shortcut feuert', () => {
    for (const k of ['l', 'L', 'm', 'd', 'a', 'F1', 'ArrowLeft', ' ']) {
      expect(laengeTaste('24', k)).toEqual({ buffer: '24', action: 'ignoriert' });
    }
  });

  it('Enter wendet an, Escape und leeres Enter brechen ab', () => {
    expect(laengeTaste('2400', 'Enter').action).toBe('anwenden');
    expect(laengeTaste('', 'Enter').action).toBe('abbrechen');
    expect(laengeTaste('2400', 'Escape')).toEqual({ buffer: '', action: 'abbrechen' });
    expect(laengeTaste('2', 'Backspace').action).toBe('abbrechen');
  });

  it('wandelt nur vollständige Zahlen um', () => {
    expect(laengeAusBuffer('2400')).toBe(2400);
    expect(laengeAusBuffer('12.5')).toBe(12.5);
    expect(laengeAusBuffer('')).toBeNull();
    expect(laengeAusBuffer('0')).toBeNull();
    expect(laengeAusBuffer('abc')).toBeNull();
  });
});
