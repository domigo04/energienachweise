import { describe, expect, it } from 'vitest';
import {
  eckpunktEntfernen, eckpunktSetzen, gripsFuerRoute,
  istKollinear, routeBereinigen, routeIstGueltig,
  istKollinear, routeBereinigen, routeIstGueltig,
  segmentOrientierung, segmentVerschieben,
} from './cadEdit';

describe('Grips', () => {
  it('gibt Endpunkte und Eckpunkte mit eigenem Typ zurück', () => {
    const grips = gripsFuerRoute([
      { x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 300 }, { x: 900, y: 300 },
    ]);
    expect(grips.map(g => g.typ)).toEqual(['endpoint', 'vertex', 'vertex', 'endpoint']);
    expect(grips[0]).toMatchObject({ x: 0, y: 0, index: 0 });
    // Eckpunkt-Index bezieht sich auf edge.data.points (ohne Start/Ende).
    expect(grips[1].pointIndex).toBe(0);
    expect(grips[2].pointIndex).toBe(1);
  });

  it('liefert für eine gerade Leitung nur die zwei Endpunkte', () => {
    const grips = gripsFuerRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(grips).toHaveLength(2);
    expect(grips.every(g => g.typ === 'endpoint')).toBe(true);
  });

  it('liefert für eine unvollständige Route keine Grips', () => {
    expect(gripsFuerRoute([{ x: 0, y: 0 }])).toEqual([]);
    expect(gripsFuerRoute([])).toEqual([]);
  });
});

describe('segmentOrientierung', () => {
  it('erkennt senkrecht, waagrecht und diagonal', () => {
    expect(segmentOrientierung({ x: 10, y: 0 }, { x: 10, y: 400 })).toBe('vertical');
    expect(segmentOrientierung({ x: 0, y: 20 }, { x: 400, y: 20 })).toBe('horizontal');
    expect(segmentOrientierung({ x: 0, y: 0 }, { x: 100, y: 100 })).toBeNull();
    expect(segmentOrientierung({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('segmentVerschieben — der CAD-Fall aus Punkt 11', () => {
  // ──────┐          ─────────┐
  //       │    →              │
  // ──────┘          ─────────┘
  const route = [
    { x: 0, y: 0 },       // 0 Endpunkt links oben
    { x: 600, y: 0 },     // 1 Ecke oben
    { x: 600, y: 400 },   // 2 Ecke unten
    { x: 0, y: 400 },     // 3 Endpunkt links unten
  ];

  it('verschiebt das senkrechte Segment parallel und verlängert die Nachbarn', () => {
    const nachher = segmentVerschieben(route, [1, 2], 'vertical', { x: 300, y: 17 }, { grid: 10 });
    // Nur die beiden Segmentpunkte sind gewandert, und nur in x.
    expect(nachher[1]).toEqual({ x: 900, y: 0 });
    expect(nachher[2]).toEqual({ x: 900, y: 400 });
    // Die Endpunkte bleiben, wo sie waren — die Leitung wurde NICHT verschoben.
    expect(nachher[0]).toEqual({ x: 0, y: 0 });
    expect(nachher[3]).toEqual({ x: 0, y: 400 });
    // Die waagrechten Nachbarsegmente sind dadurch länger geworden.
    expect(nachher[1].x - nachher[0].x).toBe(900);
    expect(nachher[2].x - nachher[3].x).toBe(900);
    // Und senkrecht ist senkrecht geblieben.
    expect(segmentOrientierung(nachher[1], nachher[2])).toBe('vertical');
  });

  it('lässt ein senkrechtes Segment nicht nach oben/unten wandern', () => {
    const nachher = segmentVerschieben(route, [1, 2], 'vertical', { x: 0, y: 250 }, { grid: 10 });
    expect(nachher[1].y).toBe(0);
    expect(nachher[2].y).toBe(400);
  });

  it('verschiebt ein waagrechtes Segment nur senkrecht', () => {
    const nachher = segmentVerschieben(route, [0, 1], 'horizontal', { x: 180, y: -120 }, { grid: 10 });
    expect(nachher[0]).toEqual({ x: 0, y: -120 });
    expect(nachher[1]).toEqual({ x: 600, y: -120 });
    expect(segmentOrientierung(nachher[0], nachher[1])).toBe('horizontal');
  });

  it('rastert die Verschiebung', () => {
    const nachher = segmentVerschieben(route, [1, 2], 'vertical', { x: 297, y: 0 }, { grid: 25 });
    expect(nachher[1].x).toBe(600 + 300);
  });

  it('hält bei einem diagonalen Segment den Winkel', () => {
    const diag = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const nachher = segmentVerschieben(diag, [0, 1], null, { x: 40, y: -40 },
                                       { grid: 10, direction: { x: 100, y: 100 } });
    // Beide Punkte um denselben Vektor → Richtung unverändert.
    const vorher = { x: diag[1].x - diag[0].x, y: diag[1].y - diag[0].y };
    const jetzt = { x: nachher[1].x - nachher[0].x, y: nachher[1].y - nachher[0].y };
    expect(jetzt).toEqual(vorher);
  });

  it('mutiert die Eingabe nicht', () => {
    const kopie = route.map(p => ({ ...p }));
    segmentVerschieben(route, [1, 2], 'vertical', { x: 300, y: 0 }, { grid: 10 });
    expect(route).toEqual(kopie);
  });

  it('ist ohne betroffene Punkte ein No-Op', () => {
    expect(segmentVerschieben(route, [], 'vertical', { x: 300, y: 0 })).toEqual(route);
    expect(segmentVerschieben(null, [1], 'vertical', { x: 1, y: 1 })).toEqual([]);
  });
});

describe('Eckpunkte bearbeiten', () => {
  const points = [{ x: 100, y: 100 }, { x: 200, y: 200 }, { x: 300, y: 300 }];

  it('setzt einen Eckpunkt neu, ohne die Liste zu mutieren', () => {
    const nachher = eckpunktSetzen(points, 1, { x: 250, y: 180 });
    expect(nachher[1]).toEqual({ x: 250, y: 180 });
    expect(points[1]).toEqual({ x: 200, y: 200 });
    expect(nachher).not.toBe(points);
  });

  it('ignoriert einen Index ausserhalb der Liste', () => {
    expect(eckpunktSetzen(points, 9, { x: 0, y: 0 })).toEqual(points);
    expect(eckpunktSetzen(points, -1, { x: 0, y: 0 })).toEqual(points);
  });

  it('entfernt einen Eckpunkt', () => {
    expect(eckpunktEntfernen(points, 1)).toEqual([{ x: 100, y: 100 }, { x: 300, y: 300 }]);
    expect(eckpunktEntfernen(points, 5)).toEqual(points);
  });
});

describe('Route-Cleanup (Punkt 20)', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 200, y: 0 };

  it('entfernt den überflüssigen kollinearen Zwischenpunkt aus dem Auftrag', () => {
    // (0,0) (100,0) (200,0) → (0,0) (200,0)
    expect(routeBereinigen([{ x: 100, y: 0 }], { start, end })).toEqual([]);
  });

  it('behält eine echte Ecke', () => {
    const ecke = [{ x: 200, y: 0 }];
    expect(routeBereinigen(ecke, { start, end: { x: 200, y: 300 } })).toEqual(ecke);
  });

  it('entfernt einen Zwischenpunkt, der genau auf dem Nachbarn liegt', () => {
    const bereinigt = routeBereinigen(
      [{ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 300 }],
      { start, end: { x: 400, y: 300 } });
    expect(bereinigt).toEqual([{ x: 100, y: 100 }, { x: 100, y: 300 }]);
  });

  it('entfernt einen Zwischenpunkt, der auf dem Startpunkt klebt', () => {
    expect(routeBereinigen([{ x: 0, y: 0 }, { x: 0, y: 200 }], { start, end: { x: 300, y: 200 } }))
      .toEqual([{ x: 0, y: 200 }]);
  });

  it('entfernt NaN und Infinity', () => {
    const bereinigt = routeBereinigen(
      [{ x: Number.NaN, y: 5 }, { x: 100, y: 200 }, { x: 5, y: Infinity }],
      { start, end: { x: 400, y: 200 } });
    expect(bereinigt).toEqual([{ x: 100, y: 200 }]);
  });

  it('räumt eine Kette mehrerer kollinearer Punkte in einem Durchgang auf', () => {
    const bereinigt = routeBereinigen(
      [{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 0 }],
      { start, end });
    expect(bereinigt).toEqual([]);
  });

  it('lässt eine bereits saubere Treppe unverändert', () => {
    const treppe = [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }];
    expect(routeBereinigen(treppe, { start, end: { x: 200, y: 200 } })).toEqual(treppe);
  });

  it('funktioniert auch ohne bekannte Enden', () => {
    expect(routeBereinigen([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]))
      .toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  });

  it('verträgt leere und ungültige Eingaben', () => {
    expect(routeBereinigen([])).toEqual([]);
    expect(routeBereinigen(null)).toEqual([]);
  });

  it('erkennt Kollinearität mit Toleranz', () => {
    expect(istKollinear({ x: 0, y: 0 }, { x: 100, y: 0.3 }, { x: 200, y: 0 })).toBe(true);
    expect(istKollinear({ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 200, y: 0 })).toBe(false);
  });

  it('prüft, ob eine Route überhaupt zeichenbar ist', () => {
    expect(routeIstGueltig([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(true);
    expect(routeIstGueltig([{ x: 0, y: 0 }])).toBe(false);
    expect(routeIstGueltig([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }])).toBe(false);
    expect(routeIstGueltig(null)).toBe(false);
  });
});
