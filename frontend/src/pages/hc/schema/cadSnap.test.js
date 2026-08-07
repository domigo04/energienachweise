import { describe, expect, it } from 'vitest';
import {
  ENDPOINT, GRID, INTERSECTION, NEAREST, PORT,
  fangErgebnis, fangMitHysterese, fangShortcut, fangStil, fangspurPunkt,
  naechsterFangkandidat, orthogonalerTStueckPunkt, pruefeFangTreue,
  segmentSchnittpunkt, senkrechterFang, sortiereFangkandidaten,
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

  it('findet auch den Schnittpunkt zweier schräger Segmente', () => {
    expect(segmentSchnittpunkt({ x:0, y:0 }, { x:100, y:100 },
      { x:0, y:100 }, { x:100, y:0 })).toEqual({ x:50, y:50 });
  });
});

describe('Fangziel-Wechsel und Einmal-Shortcuts', () => {
  const kandidaten = [
    { typ:'nearest', x:90, y:90, distanz:1, edgeId:'e1' },
    { typ:'endpoint', x:100, y:100, distanz:5, edgeId:'e2' },
    { typ:'midpoint', x:110, y:110, distanz:2, edgeId:'e3' },
  ];

  it('sortiert wie die automatische Fangentscheidung und rotiert mit Tab', () => {
    const sortiert = sortiereFangkandidaten(kandidaten);
    expect(sortiert.map(item => item.typ)).toEqual(['endpoint', 'midpoint', 'nearest']);
    const erster = naechsterFangkandidat(kandidaten);
    const zweiter = naechsterFangkandidat(kandidaten, erster);
    const dritter = naechsterFangkandidat(kandidaten, zweiter);
    expect([erster.typ, zweiter.typ, dritter.typ]).toEqual(['endpoint', 'midpoint', 'nearest']);
    expect(naechsterFangkandidat(kandidaten, dritter)).toEqual(erster);
  });

  it('kennt Revit-artige Zweitastenbefehle als Einmal-Fang', () => {
    expect(fangShortcut('SE')).toBe('endpoint');
    expect(fangShortcut('sm')).toBe('midpoint');
    expect(fangShortcut('SI')).toBe('intersection');
    expect(fangShortcut('SP')).toBe('perpendicular');
    expect(fangShortcut('SN')).toBe('nearest');
    expect(fangShortcut('SA')).toBe('port');
    expect(fangShortcut('SX')).toBeNull();
  });
});

describe('orthogonaler T-Stück-Fang', () => {
  it('trifft eine senkrechte Bestandsleitung auf Höhe des neuen Astes', () => {
    expect(orthogonalerTStueckPunkt(
      { x:100, y:350 }, { x:500, y:0 }, { x:500, y:800 },
    )).toEqual({ x:500, y:350 });
  });

  it('trifft eine waagrechte Bestandsleitung senkrecht', () => {
    expect(orthogonalerTStueckPunkt(
      { x:420, y:900 }, { x:0, y:300 }, { x:800, y:300 },
    )).toEqual({ x:420, y:300 });
  });

  it('erzeugt keinen Fang auf der Verlängerung oder auf einer Schräge', () => {
    expect(orthogonalerTStueckPunkt(
      { x:100, y:900 }, { x:500, y:0 }, { x:500, y:800 },
    )).toBeNull();
    expect(orthogonalerTStueckPunkt(
      { x:100, y:300 }, { x:0, y:0 }, { x:500, y:500 },
    )).toBeNull();
  });
});

describe('Senkrechtfang und Fangspur', () => {
  it('setzt Marker und Ziel exakt auf den Lotfuss', () => {
    const hit = senkrechterFang(
      { x:250, y:50 }, { x:248, y:402 }, { x:0, y:400 }, { x:800, y:400 }, 10,
    );
    expect(hit).toMatchObject({ x:250, y:400, typ:'perpendicular' });
    expect(pruefeFangTreue(fangErgebnis([hit], { x:248, y:402 }))).toBe(true);
  });

  it('erzeugt nur horizontale und vertikale Fangspuren samt Schnittpunkt', () => {
    const result = fangspurPunkt({ x:102, y:298 }, [{ x:100, y:20 }, { x:500, y:300 }], 5);
    expect(result.point).toEqual({ x:100, y:300 });
    expect(result.guides).toHaveLength(2);
    result.guides.forEach(guide => {
      expect(guide.x1 === guide.x2 || guide.y1 === guide.y2).toBe(true);
    });
  });
});

describe('Hysterese gegen Fang-Flackern (Punkt 8)', () => {
  const e = (typ, x, y, distanz) => fangErgebnis([{ typ, x, y, distanz }], { x: 0, y: 0 });

  it('hält den bestehenden Fang, wenn der neue nur unwesentlich näher ist', () => {
    const gehalten = e(ENDPOINT, 100, 100, 10);
    const neu = e(ENDPOINT, 200, 200, 9);      // nur 10 % näher
    expect(fangMitHysterese(neu, gehalten).point).toEqual({ x: 100, y: 100 });
  });

  it('wechselt, wenn der neue Fang deutlich näher ist', () => {
    const gehalten = e(ENDPOINT, 100, 100, 10);
    const neu = e(ENDPOINT, 200, 200, 3);
    expect(fangMitHysterese(neu, gehalten).point).toEqual({ x: 200, y: 200 });
  });

  it('lässt einen wichtigeren Fangtyp sofort gewinnen', () => {
    const gehalten = e(NEAREST, 100, 100, 2);
    const neu = e(PORT, 300, 300, 12);
    expect(fangMitHysterese(neu, gehalten).typ).toBe(PORT);
  });

  it('gibt einen wichtigeren gehaltenen Fang erst auf, wenn er ausser Reichweite ist', () => {
    const gehalten = e(PORT, 100, 100, 8);
    const schwaecher = e(NEAREST, 200, 200, 1);
    // noch in Reichweite → Port bleibt
    expect(fangMitHysterese(schwaecher, gehalten, { radius: 12 }).typ).toBe(PORT);
    // ausser Reichweite → der schwächere übernimmt
    expect(fangMitHysterese(schwaecher, e(PORT, 100, 100, 30), { radius: 12 }).typ).toBe(NEAREST);
  });

  it('behält Identität bei unverändertem Fang (kein Neu-Rendern)', () => {
    const gehalten = e(PORT, 100, 100, 4);
    const gleich = e(PORT, 100, 100, 4);
    expect(fangMitHysterese(gleich, gehalten)).toBe(gehalten);
  });

  it('verträgt fehlende Werte', () => {
    const gehalten = e(PORT, 10, 10, 1);
    expect(fangMitHysterese(null, gehalten)).toBe(gehalten);
    expect(fangMitHysterese(null, null)).toBeNull();
    // Rasterfang hat keinen Treffer → immer der neue Zustand
    expect(fangMitHysterese(e(PORT, 5, 5, 1), fangErgebnis([], { x: 0, y: 0 })).typ).toBe(PORT);
  });
});
