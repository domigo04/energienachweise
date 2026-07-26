import { describe, expect, it } from 'vitest';
import {
  ENDPOINT, GRID, INTERSECTION, NEAREST, PORT,
  fangErgebnis, fangStil, pruefeFangTreue, segmentSchnittpunkt,
} from './cadSnap';

describe('Fangtypen', () => {
  it('hat für jeden geforderten Typ Form, Text und Farbe', () => {
    for (const typ of [GRID, ENDPOINT, PORT, INTERSECTION, NEAREST]) {
      const stil = fangStil(typ);
      expect(stil.form).toBeTruthy();
      expect(stil.label).toBeTruthy();
      expect(stil.farbe).toMatch(/^#/);
    }
  });

  it('gibt jedem Typ eine eigene Form — sonst sieht man den Unterschied nicht', () => {
    const formen = [GRID, ENDPOINT, PORT, INTERSECTION, NEAREST].map(t => fangStil(t).form);
    expect(new Set(formen).size).toBe(formen.length);
  });

  it('fällt bei unbekanntem Typ auf Raster zurück', () => {
    expect(fangStil('gibtsnicht').label).toBe('Raster');
  });
});

describe('fangErgebnis', () => {
  // Punkt 5 / Test 6 — Port-Fang muss die exakte Port-Koordinate ergeben.
  it('Fang auf Port ergibt exakt die Port-Koordinate', () => {
    const port = { typ: PORT, x: 1234, y: 5678, distanz: 9, nodeId: 'n1', handleId: 'vl' };
    const e = fangErgebnis([port], { x: 1240, y: 5680 });
    expect(e.point).toEqual({ x: 1234, y: 5678 });
    expect(e.typ).toBe(PORT);
    expect(e.treffer.nodeId).toBe('n1');
  });

  // Test 7 — Endpoint-Fang.
  it('Fang auf Endpunkt ergibt exakt die Endpunkt-Koordinate', () => {
    const e = fangErgebnis([{ typ: ENDPOINT, x: 800, y: 400, distanz: 3 }], { x: 810, y: 390 });
    expect(e.point).toEqual({ x: 800, y: 400 });
    expect(e.typ).toBe(ENDPOINT);
  });

  it('Port gewinnt gegen Raster und gegen den Leitungsfang', () => {
    const e = fangErgebnis([
      { typ: NEAREST, x: 100, y: 100, distanz: 1 },
      { typ: PORT, x: 200, y: 200, distanz: 12 },
    ], { x: 105, y: 105 });
    // Trotz grösserer Distanz gewinnt der Anschluss — er ist die Absicht.
    expect(e.typ).toBe(PORT);
    expect(e.point).toEqual({ x: 200, y: 200 });
  });

  it('bei gleicher Priorität gewinnt der nähere Punkt', () => {
    const e = fangErgebnis([
      { typ: ENDPOINT, x: 0, y: 0, distanz: 8 },
      { typ: ENDPOINT, x: 50, y: 50, distanz: 2 },
    ], { x: 40, y: 40 });
    expect(e.point).toEqual({ x: 50, y: 50 });
  });

  it('ohne Kandidat bleibt der Rasterpunkt mit sichtbarem Rastermarker', () => {
    const e = fangErgebnis([], { x: 300, y: 400 });
    expect(e.typ).toBe(GRID);
    expect(e.point).toEqual({ x: 300, y: 400 });
    expect(e.marker.label).toBe('Raster');
  });

  it('kann den Rastermarker unterdrücken, ohne den Punkt zu verlieren', () => {
    const e = fangErgebnis([], { x: 300, y: 400 }, { zeigeRaster: false });
    expect(e.point).toEqual({ x: 300, y: 400 });
    expect(e.marker).toBeNull();
  });

  it('verwirft unbrauchbare Kandidaten statt darauf zu fangen', () => {
    const e = fangErgebnis([
      { typ: PORT, x: Number.NaN, y: 10, distanz: 1 },
      { typ: 'phantasie', x: 10, y: 10, distanz: 1 },
      null,
    ], { x: 500, y: 500 });
    expect(e.typ).toBe(GRID);
    expect(e.point).toEqual({ x: 500, y: 500 });
  });

  it('ohne Kandidat und ohne Fallback gibt es kein Ergebnis', () => {
    expect(fangErgebnis([], null)).toBeNull();
    expect(fangErgebnis([], { x: Number.NaN, y: 1 })).toBeNull();
  });
});

describe('Fangtreue', () => {
  // Punkt 5 — die Regel, die das ganze Gefühl trägt.
  it('Marker und gesetzter Punkt sind immer identisch', () => {
    const faelle = [
      [{ typ: PORT, x: 1234, y: 5678, distanz: 4 }],
      [{ typ: ENDPOINT, x: -80, y: 42, distanz: 1 }],
      [{ typ: INTERSECTION, x: 0, y: 0, distanz: 0 }],
      [],
    ];
    for (const kandidaten of faelle) {
      const e = fangErgebnis(kandidaten, { x: 7, y: 7 });
      expect(pruefeFangTreue(e)).toBe(true);
    }
  });

  it('erkennt eine auseinanderlaufende Anzeige', () => {
    // Künstlich verfälscht — genau dieser Zustand darf nie entstehen.
    const e = fangErgebnis([{ typ: PORT, x: 100, y: 100, distanz: 1 }], { x: 0, y: 0 });
    e.marker.x += 6;
    expect(pruefeFangTreue(e)).toBe(false);
  });
});

describe('Schnittpunkt', () => {
  it('findet die echte Kreuzung zweier achsparalleler Segmente', () => {
    const p = segmentSchnittpunkt({ x: 500, y: 0 }, { x: 500, y: 1000 },
                                  { x: 0, y: 400 }, { x: 1000, y: 400 });
    expect(p).toEqual({ x: 500, y: 400 });
  });

  it('findet die Kreuzung auch in umgekehrter Reihenfolge', () => {
    const p = segmentSchnittpunkt({ x: 0, y: 400 }, { x: 1000, y: 400 },
                                  { x: 500, y: 0 }, { x: 500, y: 1000 });
    expect(p).toEqual({ x: 500, y: 400 });
  });

  it('fängt nicht auf der Verlängerung ausserhalb der Segmente', () => {
    const p = segmentSchnittpunkt({ x: 500, y: 0 }, { x: 500, y: 100 },
                                  { x: 0, y: 400 }, { x: 1000, y: 400 });
    expect(p).toBeNull();
  });

  it('liefert für parallele Segmente keinen Schnittpunkt', () => {
    expect(segmentSchnittpunkt({ x: 0, y: 0 }, { x: 100, y: 0 },
                               { x: 0, y: 50 }, { x: 100, y: 50 })).toBeNull();
  });
});
