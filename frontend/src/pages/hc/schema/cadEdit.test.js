import { describe, expect, it } from 'vitest';
import {
  abzweigPunkt,
  eckpunktEntfernen, eckpunktSetzen, gripsFuerRoute,
  istKollinear, routeBereinigen, routeIstGueltig,
  segmentAusrichten, segmentOrientierung, segmentVerschieben,
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

// ── Abzweig-Punkt (§18) ─────────────────────────────────────────────────────
describe("abzweigPunkt", () => {
  const a = { x: 0, y: 100 };
  const b = { x: 200, y: 100 };

  it("zweigt auf die Cursorseite ab", () => {
    const oben = abzweigPunkt(a, b, { x: 100, y: 100 }, { x: 100, y: 60 }, 70);
    expect(oben).toEqual({ x: 100, y: 30 });
    const unten = abzweigPunkt(a, b, { x: 100, y: 100 }, { x: 100, y: 140 }, 70);
    expect(unten).toEqual({ x: 100, y: 170 });
  });

  it("zweigt bei Cursor exakt auf der Leitung nach oben ab", () => {
    expect(abzweigPunkt(a, b, { x: 100, y: 100 }, { x: 100, y: 100 }, 70).y).toBe(30);
  });

  it("steht senkrecht auch auf einer senkrechten Leitung", () => {
    const p = abzweigPunkt({ x: 50, y: 0 }, { x: 50, y: 200 }, { x: 50, y: 100 }, { x: 90, y: 100 }, 70);
    expect(p).toEqual({ x: 120, y: 100 });
  });
});

// ── Ausrichten / Parallel (§35–§37) ─────────────────────────────────────────
describe("segmentAusrichten", () => {
  const refH = { a: { x: 0, y: 1000 }, b: { x: 300, y: 1000 } };

  it("macht ein schiefes Segment waagrecht und behält die Länge", () => {
    const route = [{ x: 0, y: 0 }, { x: 100, y: 40 }];
    const { route: neu, fehler } = segmentAusrichten(route, 0, refH, { klick: { x: 0, y: 0 } });
    expect(fehler).toBeUndefined();
    expect(neu[0]).toEqual({ x: 0, y: 0 });
    expect(neu[1].y).toBe(0);
    expect(neu[1].x).toBe(100);          // Projektion auf die Referenzrichtung
  });

  it("legt ein bereits paralleles Segment auf dieselbe Flucht", () => {
    const route = [{ x: 0, y: 1060 }, { x: 200, y: 1060 }];
    const { route: neu } = segmentAusrichten(route, 0, refH, {});
    expect(neu[0].y).toBe(1000);
    expect(neu[1].y).toBe(1000);
    expect(neu[0].x).toBe(0);            // längs verschiebt sich nichts
  });

  it("verweigert das Fluchten, wenn ein Ende an einem Anschluss hängt", () => {
    const route = [{ x: 0, y: 1060 }, { x: 200, y: 1060 }];
    const { fehler, route: neu } = segmentAusrichten(route, 0, refH, { fest: { start: true } });
    expect(neu).toBeUndefined();
    expect(fehler).toMatch(/Bauteilanschluss/);
  });

  it("hält beim Parallelmachen den Endpunkt näher am Klick fest", () => {
    const route = [{ x: 0, y: 0 }, { x: 100, y: 40 }];
    const nahB = segmentAusrichten(route, 0, refH, { klick: { x: 100, y: 40 } }).route;
    expect(nahB[1]).toEqual({ x: 100, y: 40 });   // b bleibt
    expect(nahB[0].y).toBe(40);                   // a wandert auf b's Höhe
  });

  it("bewegt den festen Anschluss nicht, sondern das freie Ende", () => {
    const route = [{ x: 0, y: 0 }, { x: 100, y: 40 }];
    const { route: neu } = segmentAusrichten(route, 0, refH, { fest: { start: true } });
    expect(neu[0]).toEqual({ x: 0, y: 0 });
    expect(neu[1].y).toBe(0);
  });

  it("richtet ein Innensegment aus, Nachbarn bleiben stehen", () => {
    const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }];
    const refV = { a: { x: 500, y: 0 }, b: { x: 500, y: 100 } };
    const { route: neu } = segmentAusrichten(route, 1, refV, { klick: { x: 100, y: 0 } });
    expect(neu[0]).toEqual({ x: 0, y: 0 });
    expect(neu[3]).toEqual({ x: 300, y: 200 });
    expect(neu[1].x).toBe(neu[2].x);              // Segment steht senkrecht
  });

  it("meldet eine Referenz ohne Richtung", () => {
    const route = [{ x: 0, y: 0 }, { x: 100, y: 40 }];
    const { fehler } = segmentAusrichten(route, 0, { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } }, {});
    expect(fehler).toMatch(/Richtung/);
  });

  it("meldet, wenn ein paralleles Segment bereits auf der Flucht liegt", () => {
    const route = [{ x: 0, y: 1000 }, { x: 200, y: 1000 }];
    expect(segmentAusrichten(route, 0, refH, {}).fehler).toMatch(/bereits/);
  });

  it("richtet auch an einer 45°-Referenz aus", () => {
    const ref45 = { a: { x: 0, y: 0 }, b: { x: 100, y: 100 } };
    const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { route: neu } = segmentAusrichten(route, 0, ref45, { klick: { x: 0, y: 0 } });
    expect(Math.round(neu[1].x)).toBe(Math.round(neu[1].y));
  });
});
