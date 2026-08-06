import { describe, expect, it } from 'vitest';
import {
  abzweigPunkt,
  abstandSegmentZuRechteck,
  eckpunktWeiterziehen,
  endpunktWeiterziehen,
  entwurfFuerAbschluss,
  eckpunktEntfernen, eckpunktSetzen, gripsFuerRoute,
  fensterAus, imFenster, istKollinear, labelSichtbar, labelVerschoben, labelVersatz,
  geradenSchnittpunkt, leitungMitLueckeTrennen, leitungenMitEckeVerbinden,
  leitungsSystem, leitungVerschieben,
  routeBereinigen, routeDehnen, routeIstGueltig, routeSegmenteEntfernen,
  segmentAusrichten, segmentOrientierung, segmentVerschieben,
  segmentZumVerschieben, verschiebungLabel,
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

describe('freien Endpunkt wie in Revit weiterziehen', () => {
  const horizontal = [{ x:0, y:0 }, { x:500, y:0 }];

  it('behält die bestehende Gerade und fügt bei 90° eine Ecke ein', () => {
    expect(endpunktWeiterziehen(horizontal, 'target', { x:520, y:700 }, { grid:10 }).route)
      .toEqual([{ x:0, y:0 }, { x:500, y:0 }, { x:500, y:700 }]);
  });

  it('verlängert auf derselben Achse ohne unnötigen Stützpunkt', () => {
    expect(endpunktWeiterziehen(horizontal, 'target', { x:900, y:20 }, { grid:10 }).route)
      .toEqual([{ x:0, y:0 }, { x:900, y:0 }]);
  });

  it('erzeugt bei einem Klick ohne Bewegung keinen doppelten Punkt', () => {
    expect(endpunktWeiterziehen(horizontal, 'target', { x:500, y:0 }, { grid:10 }).route)
      .toEqual(horizontal);
  });

  it('lässt eine bewusste Schräge ab 30° als neue Verlängerung zu', () => {
    expect(endpunktWeiterziehen(horizontal, 'target', { x:800, y:400 }, { grid:10 }).route)
      .toEqual([{ x:0, y:0 }, { x:500, y:0 }, { x:800, y:400 }]);
  });

  it('funktioniert spiegelbildlich am Leitungsanfang', () => {
    expect(endpunktWeiterziehen(horizontal, 'source', { x:0, y:500 }, { grid:10 }).route)
      .toEqual([{ x:0, y:500 }, { x:0, y:0 }, { x:500, y:0 }]);
  });
});

describe('bestehenden Eckpunkt orthogonal weiterziehen', () => {
  const route = [{ x:0, y:0 }, { x:500, y:0 }, { x:500, y:600 }];

  it('verhindert eine zufällige Schräge auch im nachfolgenden Teilstück', () => {
    expect(eckpunktWeiterziehen(route, 1, { x:700, y:180 }, { grid:10 }).route)
      .toEqual([
        { x:0, y:0 }, { x:700, y:0 }, { x:700, y:600 }, { x:500, y:600 },
      ]);
  });

  it('lässt die bewusst über 30° gezogene Strecke zu und schliesst orthogonal an', () => {
    expect(eckpunktWeiterziehen(route, 1, { x:400, y:400 }, { grid:10 }).route)
      .toEqual([
        { x:0, y:0 }, { x:400, y:400 }, { x:400, y:600 }, { x:500, y:600 },
      ]);
  });
});

describe('Abstand Teilstück zu Bauteil', () => {
  it('misst den kürzesten Abstand zur Bauteilkante', () => {
    const mass = abstandSegmentZuRechteck(
      { x:0, y:0 }, { x:500, y:0 }, { x:200, y:300, width:100, height:80 },
    );
    expect(mass.distance).toBe(300);
    expect(mass.a).toEqual({ x:200, y:0 });
    expect(mass.b).toEqual({ x:200, y:300 });
  });

  it('meldet keinen Abstand, wenn das Teilstück die Bauteilbox schneidet', () => {
    expect(abstandSegmentZuRechteck(
      { x:0, y:350 }, { x:500, y:350 }, { x:200, y:300, width:100, height:80 },
    ).distance).toBe(0);
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
    const nachher = segmentVerschieben(route, [1, 2], 'vertical', { x: 300, y: 17 }, { grid: 10, axisLocked:true });
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
    const nachher = segmentVerschieben(route, [1, 2], 'vertical', { x: 0, y: 250 }, { grid: 10, axisLocked:true });
    expect(nachher[1].y).toBe(0);
    expect(nachher[2].y).toBe(400);
  });

  it('verschiebt ein waagrechtes Segment nur senkrecht', () => {
    const nachher = segmentVerschieben(route, [0, 1], 'horizontal', { x: 180, y: -120 }, { grid: 10, axisLocked:true });
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
                                       { grid: 10, direction: { x: 100, y: 100 }, axisLocked:true });
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

  it('verschiebt ein Teilstück standardmässig frei in X und Y', () => {
    const nachher = segmentVerschieben(route, [1, 2], 'vertical', { x: 125, y: -75 }, { grid: 5 });
    expect(nachher[1]).toEqual({ x: 725, y: -75 });
    expect(nachher[2]).toEqual({ x: 725, y: 325 });
  });

  it('schützt bei einem Randsegment den hydraulischen Endpunkt', () => {
    const vorbereitet = segmentZumVerschieben([{ x:0, y:0 }, { x:500, y:0 }], 0);
    expect(vorbereitet.points).toEqual([{ x:0, y:0 }, { x:500, y:0 }]);
    expect(vorbereitet.pointIndexes).toEqual([0, 1]);
    expect(vorbereitet.orientation).toBe('horizontal');
    const bewegt = segmentVerschieben(vorbereitet.points, vorbereitet.pointIndexes, 'horizontal', { x:0, y:200 });
    expect(bewegt).toEqual([{ x:0, y:200 }, { x:500, y:200 }]);
  });

  it('beschriftet die Verschiebung in cm und ab einem Meter in m', () => {
    expect(verschiebungLabel({ x:300, y:400 })).toBe('50 cm');
    expect(verschiebungLabel({ x:1000, y:0 })).toBe('1 m');
  });
});

describe('Leitung am letzten Eckpunkt abschliessen', () => {
  it('verwendet den letzten gesetzten Eckpunkt und nie die Cursorvorschau', () => {
    const draft = {
      startPoint:{ x:0, y:0 },
      points:[{ x:300, y:0 }, { x:300, y:500 }],
    };
    expect(entwurfFuerAbschluss(draft)).toEqual({
      endPoint:{ x:300, y:500 },
      draft:{ startPoint:{ x:0, y:0 }, points:[{ x:300, y:0 }] },
    });
  });

  it('erzeugt ohne gesetzten Eckpunkt keine Leitung', () => {
    expect(entwurfFuerAbschluss({ startPoint:{ x:0, y:0 }, points:[] })).toBeNull();
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

describe('Leitung verschieben (MOVE)', () => {
  const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  it('nimmt freie Enden mit und verschiebt alle Zwischenpunkte', () => {
    const ergebnis = leitungVerschieben(route, { x: 50, y: 20 }, { startFrei: true, endFrei: true });
    expect(ergebnis.start).toEqual({ x: 50, y: 20 });
    expect(ergebnis.end).toEqual({ x: 150, y: 120 });
    expect(ergebnis.points).toEqual([{ x: 150, y: 20 }]);
  });

  it('lässt ein Ende am Bauteil stehen und setzt dort einen Stützpunkt', () => {
    const ergebnis = leitungVerschieben(route, { x: 0, y: 40 }, { startFrei: false, endFrei: true });
    expect(ergebnis.start).toBeNull();
    // Der Anschluss bleibt; die Leitung führt neu zur verschobenen Geometrie.
    expect(ergebnis.points[0]).toEqual({ x: 0, y: 40 });
    expect(ergebnis.points.at(-1)).toEqual({ x: 100, y: 40 });
    expect(ergebnis.end).toEqual({ x: 100, y: 140 });
  });

  it('hält beide Anschlüsse fest, wenn kein Ende frei ist', () => {
    const ergebnis = leitungVerschieben(route, { x: 30, y: 0 }, {});
    expect(ergebnis.start).toBeNull();
    expect(ergebnis.end).toBeNull();
    expect(ergebnis.points).toEqual([{ x: 30, y: 0 }, { x: 130, y: 0 }, { x: 130, y: 100 }]);
  });

  it('macht nichts ohne Vektor oder ohne brauchbare Route', () => {
    expect(leitungVerschieben(route, { x: 0, y: 0 })).toBeNull();
    expect(leitungVerschieben([{ x: 0, y: 0 }], { x: 10, y: 0 })).toBeNull();
  });
});

describe('Leitungsbeschriftung', () => {
  it('liefert immer einen brauchbaren Versatz', () => {
    expect(labelVersatz({})).toEqual({ x: 0, y: 0 });
    expect(labelVersatz({ label_offset: { x: 'abc', y: 12 } })).toEqual({ x: 0, y: 12 });
    expect(labelVersatz({ label_offset: { x: -30, y: 5 } })).toEqual({ x: -30, y: 5 });
  });

  it('ist sichtbar, solange sie nicht ausdrücklich ausgeblendet wurde', () => {
    expect(labelSichtbar({})).toBe(true);
    expect(labelSichtbar({ label_hidden: false })).toBe(true);
    expect(labelSichtbar({ label_hidden: true })).toBe(false);
  });

  it('addiert den Ziehweg, wahlweise aufs Raster', () => {
    expect(labelVerschoben({ x: 10, y: 0 }, { x: 5, y: -3 })).toEqual({ x: 15, y: -3 });
    expect(labelVerschoben({ x: 0, y: 0 }, { x: 12, y: 7 }, { grid: 10 })).toEqual({ x: 10, y: 10 });
    expect(labelVerschoben(null, null)).toEqual({ x: 0, y: 0 });
  });
});


describe('Mit Lücke trennen (BREAK)', () => {
  //  A ────────── B ────────── C   (0,0) (600,0) (600,400)
  const route = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 400 }];

  it('schneidet das Stück zwischen den zwei Punkten heraus', () => {
    const { erste, zweite } = leitungMitLueckeTrennen(
      route, { segmentIndex: 0, x: 200, y: 0 }, { segmentIndex: 0, x: 400, y: 0 });
    expect(erste).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(zweite).toEqual([{ x: 400, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 400 }]);
  });

  it('ist unabhängig von der Reihenfolge der zwei Klicks', () => {
    const vorwaerts = leitungMitLueckeTrennen(
      route, { segmentIndex: 0, x: 200, y: 0 }, { segmentIndex: 1, x: 600, y: 100 });
    const rueckwaerts = leitungMitLueckeTrennen(
      route, { segmentIndex: 1, x: 600, y: 100 }, { segmentIndex: 0, x: 200, y: 0 });
    expect(vorwaerts).toEqual(rueckwaerts);
  });

  it('trennt über eine Ecke hinweg und lässt die Ecke im richtigen Teil', () => {
    const { erste, zweite } = leitungMitLueckeTrennen(
      route, { segmentIndex: 0, x: 300, y: 0 }, { segmentIndex: 1, x: 600, y: 250 });
    expect(erste).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }]);
    expect(zweite).toEqual([{ x: 600, y: 250 }, { x: 600, y: 400 }]);
  });

  it('verweigert zwei Punkte auf derselben Stelle', () => {
    const { fehler } = leitungMitLueckeTrennen(
      route, { segmentIndex: 0, x: 300, y: 0 }, { segmentIndex: 0, x: 300, y: 0 });
    expect(fehler).toMatch(/Lücke/);
  });

  it('verweigert einen Punkt neben der Leitung', () => {
    expect(leitungMitLueckeTrennen(route, { segmentIndex: 9, x: 0, y: 0 },
      { segmentIndex: 0, x: 100, y: 0 }).fehler).toBeTruthy();
  });
});

describe('Ecke verbinden (TR)', () => {
  it('verlängert zwei getrennte Teilstücke bis zur gemeinsamen Ecke', () => {
    const waagrecht = [{ x:0, y:0 }, { x:400, y:0 }];
    const senkrecht = [{ x:600, y:200 }, { x:600, y:500 }];
    const result = leitungenMitEckeVerbinden(waagrecht, 0, senkrecht, 0, {
      erlaubteSeitenA:['end'], erlaubteSeitenB:['start'],
    });
    expect(result.ecke).toEqual({ x:600, y:0 });
    expect(result.erste).toEqual({ seite:'end', route:[{ x:0, y:0 }, { x:600, y:0 }] });
    expect(result.zweite).toEqual({ seite:'start', route:[{ x:600, y:0 }, { x:600, y:500 }] });
  });

  it('kürzt überstehende Leitungen auf denselben Eckpunkt', () => {
    const result = leitungenMitEckeVerbinden(
      [{ x:0, y:0 }, { x:800, y:0 }], 0,
      [{ x:600, y:-200 }, { x:600, y:500 }], 0,
      { erlaubteSeitenA:['end'], erlaubteSeitenB:['start'] },
    );
    expect(result.erste.route.at(-1)).toEqual({ x:600, y:0 });
    expect(result.zweite.route[0]).toEqual({ x:600, y:0 });
  });

  it('verweigert parallele Leitungen und Innensegmente', () => {
    expect(leitungenMitEckeVerbinden(
      [{ x:0,y:0 }, { x:100,y:0 }], 0,
      [{ x:0,y:50 }, { x:100,y:50 }], 0,
    ).fehler).toMatch(/Parallele/);
    expect(leitungenMitEckeVerbinden(
      [{ x:0,y:0 }, { x:100,y:0 }, { x:100,y:100 }, { x:200,y:100 }], 1,
      [{ x:150,y:50 }, { x:150,y:150 }], 0,
    ).fehler).toMatch(/Leitungsenden/);
  });

  it('beachtet die freigegebenen Enden und mutiert keine Eingabe', () => {
    const a = [{ x:0,y:0 }, { x:400,y:0 }];
    const b = [{ x:600,y:200 }, { x:600,y:500 }];
    const kopieA = a.map(p => ({ ...p }));
    const result = leitungenMitEckeVerbinden(a, 0, b, 0, {
      erlaubteSeitenA:['start'], erlaubteSeitenB:['end'],
    });
    expect(result.erste.seite).toBe('start');
    expect(result.zweite.seite).toBe('end');
    expect(a).toEqual(kopieA);
  });

  it('schneidet unendlich verlängerte Geraden', () => {
    expect(geradenSchnittpunkt(
      { x:0,y:0 }, { x:10,y:0 }, { x:50,y:-10 }, { x:50,y:10 },
    )).toEqual({ x:50, y:0 });
  });
});

describe('Ausgewählte Teilstücke löschen', () => {

  it('entfernt mehrere ausgewählte Teilstücke als getrennte Lücken', () => {
    const teile = routeSegmenteEntfernen([
      { x:0, y:0 }, { x:100, y:0 }, { x:100, y:100 }, { x:200, y:100 }, { x:200, y:200 },
    ], [1, 3]);
    expect(teile).toEqual([
      [{ x:0, y:0 }, { x:100, y:0 }],
      [{ x:100, y:100 }, { x:200, y:100 }],
    ]);
  });

});

describe('Dehnen (STRETCH)', () => {
  const route = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 300 }];

  it('bewegt nur die Punkte im Fenster — das Segment wird dadurch länger', () => {
    const fenster = fensterAus({ x: 400, y: -100 }, { x: 700, y: 100 });
    const { route: neu, bewegt } = routeDehnen(route, fenster, { x: 200, y: 0 },
      { startFest: true, endFest: true });
    expect(bewegt).toBe(1);
    expect(neu[0]).toEqual({ x: 0, y: 0 });        // ausserhalb: bleibt
    expect(neu[1]).toEqual({ x: 700, y: 0 });      // im Fenster: wandert
    expect(neu[2]).toEqual({ x: 500, y: 300 });    // ausserhalb: bleibt
    // Genau das ist der Unterschied zum Verschieben: die Länge ändert sich.
    expect(neu[1].x - neu[0].x).toBe(700);
  });

  it('schützt die hydraulischen Enden, auch wenn sie im Fenster liegen', () => {
    const alles = fensterAus({ x: -1000, y: -1000 }, { x: 1000, y: 1000 });
    const { route: neu, bewegt } = routeDehnen(route, alles, { x: 50, y: 50 });
    expect(neu[0]).toEqual({ x: 0, y: 0 });
    expect(neu[2]).toEqual({ x: 500, y: 300 });
    expect(bewegt).toBe(1);
  });

  it('lässt freie Enden mitwandern, wenn sie nicht geschützt sind', () => {
    const alles = fensterAus({ x: -1000, y: -1000 }, { x: 1000, y: 1000 });
    const { bewegt } = routeDehnen(route, alles, { x: 50, y: 0 },
      { startFest: false, endFest: false });
    expect(bewegt).toBe(3);
  });

  it('meldet eine wirkungslose Dehnung über bewegt = 0', () => {
    const daneben = fensterAus({ x: 900, y: 900 }, { x: 1000, y: 1000 });
    expect(routeDehnen(route, daneben, { x: 50, y: 0 }).bewegt).toBe(0);
  });

  it('kennt das Fenster unabhängig von der Ecken-Reihenfolge', () => {
    const a = fensterAus({ x: 100, y: 100 }, { x: 0, y: 0 });
    expect(a).toEqual({ x1: 0, y1: 0, x2: 100, y2: 100 });
    expect(imFenster({ x: 50, y: 50 }, a)).toBe(true);
    expect(imFenster({ x: 150, y: 50 }, a)).toBe(false);
    expect(imFenster(null, a)).toBe(false);
  });
});

describe('Leitungssystem (Tab-Auswahl)', () => {
  // vl1 ── anker ── vl2 ── tstueck ── vl3
  //                          └────────── vl4
  // pumpe trennt: rl1 hängt am selben Bauteil, gehört aber nicht dazu.
  const nodes = [
    { id: 'anker', type: 'junction' },
    { id: 'tstueck', type: 'junction' },
    { id: 'ende', type: 'junction' },
    { id: 'rlAnker', type: 'junction' },
    { id: 'pumpe', type: 'pump' },
    { id: 'kessel', type: 'erzeuger' },
  ];
  const edges = [
    { id: 'vl1', source: 'pumpe', target: 'anker' },
    { id: 'vl2', source: 'anker', target: 'tstueck' },
    { id: 'vl3', source: 'tstueck', target: 'ende' },
    { id: 'vl4', source: 'tstueck', target: 'kessel' },
    { id: 'rl1', source: 'pumpe', target: 'rlAnker' },
    { id: 'rl2', source: 'rlAnker', target: 'kessel' },
  ];

  it('zieht über Anker und T-Stücke alles zusammen, was zusammenhängt', () => {
    expect(leitungsSystem(edges, nodes, 'vl1').sort())
      .toEqual(['vl1', 'vl2', 'vl3', 'vl4']);
  });

  it('findet dasselbe System, egal wo man hineinklickt', () => {
    expect(leitungsSystem(edges, nodes, 'vl4').sort())
      .toEqual(['vl1', 'vl2', 'vl3', 'vl4']);
  });

  it('läuft nicht über ein Bauteil hinweg — Vorlauf bleibt vom Rücklauf getrennt', () => {
    // Beide hängen an der Pumpe und am Kessel — trotzdem zwei Systeme.
    expect(leitungsSystem(edges, nodes, 'vl1')).not.toContain('rl1');
    expect(leitungsSystem(edges, nodes, 'rl1').sort()).toEqual(['rl1', 'rl2']);
  });

  it('gibt bei unbekannter Leitung nichts zurück', () => {
    expect(leitungsSystem(edges, nodes, 'gibtsnicht')).toEqual([]);
    expect(leitungsSystem([], [], 'vl1')).toEqual([]);
  });
});
