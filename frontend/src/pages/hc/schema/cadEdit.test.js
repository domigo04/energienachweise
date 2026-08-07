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
  leitungTrimmen, routeBisKanteDehnen, routenVerbinden, routeVersetzen,
  routeBereinigen, routeDehnen, routeIstGueltig, routeSegmenteEntfernen,
  griffAktionen, loeschAuswahl, segmentAusrichten, segmentOrientierung, segmentVerschieben,
  segmentZumVerschieben, streckenSchnittpunkt, trimGrenzen, versatzSeite,
  verschiebungLabel,
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

  it('nennt je Grifftyp genau seine möglichen Aktionen', () => {
    expect(griffAktionen('endpoint')).toEqual(['strecken', 'weiterziehen', 'anschliessen']);
    expect(griffAktionen('corner')).toEqual(['strecken', 'entfernen', 'teilen']);
    expect(griffAktionen('segment')).toEqual(['versetzen', 'einfuegen', 'laenge']);
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

  it('zeigt in einer diagonalen Ecklage keine schräge Hilfslinie', () => {
    expect(abstandSegmentZuRechteck(
      { x:0, y:0 }, { x:500, y:0 }, { x:600, y:300, width:100, height:80 },
    )).toBeNull();
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

  it('verschiebt einen freien Endpunkt mit dem letzten Teilstück statt einen Knick zu erzeugen', () => {
    const vorbereitet = segmentZumVerschieben(
      [{ x:0, y:0 }, { x:500, y:0 }, { x:500, y:400 }], 1, { endFrei:true },
    );
    expect(vorbereitet.points).toEqual([{ x:500, y:0 }]);
    expect(vorbereitet.pointIndexes).toEqual([0]);
    expect(vorbereitet.moveEnd).toBe(true);
  });

  it('beschriftet die Verschiebung in cm und ab einem Meter in m', () => {
    expect(verschiebungLabel({ x:300, y:400 })).toBe('50 cm');
    expect(verschiebungLabel({ x:1000, y:0 })).toBe('1 m');
  });
});

describe('Löschauswahl', () => {
  it('löscht ein gewähltes Teilstück nicht zusätzlich als ganze Leitung', () => {
    expect(loeschAuswahl(['e1', 'e2'], [{ edgeId:'e1', segmentIndex:2 }])).toEqual({
      ganzeEdgeIds:['e2'], segmente:[{ edgeId:'e1', segmentIndex:2 }],
    });
  });
});

describe('Leitung mit Doppelklick oder Escape am letzten Eckpunkt abschliessen', () => {
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

// ── Leitungen ändern: Versatz, Stutzen, Dehnen bis Kante, Verbinden ────────

describe('Versatz (OFFSET)', () => {
  const gerade = [{ x:0, y:0 }, { x:1000, y:0 }];

  it('legt eine gerade Leitung parallel im gewählten Abstand daneben', () => {
    const { route } = routeVersetzen(gerade, 200, { seite:1 });
    expect(route).toEqual([{ x:0, y:200 }, { x:1000, y:200 }]);
  });

  it('versetzt auf die andere Seite, wenn die Seite umgekehrt gewählt wird', () => {
    const { route } = routeVersetzen(gerade, 200, { seite:-1 });
    expect(route).toEqual([{ x:0, y:-200 }, { x:1000, y:-200 }]);
  });

  it('lässt die Quelle unverändert', () => {
    const original = JSON.parse(JSON.stringify(gerade));
    routeVersetzen(gerade, 200, { seite:1 });
    expect(gerade).toEqual(original);
  });

  it('schneidet die Ecke sauber, statt an der Ecke eine Lücke zu lassen', () => {
    // L-Form: rechts, dann runter. Nach innen versetzt muss die Ecke exakt
    // auf dem Schnittpunkt der beiden versetzten Geraden sitzen.
    const ecke = [{ x:0, y:0 }, { x:1000, y:0 }, { x:1000, y:800 }];
    const { route } = routeVersetzen(ecke, 100, { seite:1 });
    expect(route).toHaveLength(3);
    expect(route[1]).toEqual({ x:900, y:100 });
  });

  it('bleibt bei einer geraden Durchlaufecke ohne erfundenen Knick', () => {
    // Zwei Teilstücke auf derselben Achse: der Zwischenpunkt wandert nur mit.
    const durchlauf = [{ x:0, y:0 }, { x:500, y:0 }, { x:1000, y:0 }];
    const { route } = routeVersetzen(durchlauf, 50, { seite:1 });
    expect(route).toEqual([{ x:0, y:50 }, { x:500, y:50 }, { x:1000, y:50 }]);
  });

  it('ist mehrfach anwendbar und liefert gleichmässige Abstände', () => {
    const erste = routeVersetzen(gerade, 200, { seite:1 }).route;
    const zweite = routeVersetzen(erste, 200, { seite:1 }).route;
    expect(zweite).toEqual([{ x:0, y:400 }, { x:1000, y:400 }]);
  });

  it('weist Abstand null und unbrauchbare Leitungen ab, statt zu raten', () => {
    expect(routeVersetzen(gerade, 0).fehler).toBeTruthy();
    expect(routeVersetzen(gerade, Number.NaN).fehler).toBeTruthy();
    expect(routeVersetzen([{ x:0, y:0 }], 100).fehler).toBeTruthy();
    expect(routeVersetzen([{ x:0, y:0 }, { x:0, y:0 }], 100).fehler).toBeTruthy();
  });

  it('bestimmt die Seite aus der Cursorlage am getroffenen Teilstück', () => {
    // Teilstück zeigt nach rechts; Normale (-dy, dx) zeigt nach unten (+y).
    expect(versatzSeite({ x:0, y:0 }, { x:100, y:0 }, { x:50, y:80 })).toBe(1);
    expect(versatzSeite({ x:0, y:0 }, { x:100, y:0 }, { x:50, y:-80 })).toBe(-1);
  });

  it('versetzt zur Cursorseite hin — Seite und Versatz stimmen überein', () => {
    const cursor = { x:500, y:-300 };
    const seite = versatzSeite(gerade[0], gerade[1], cursor);
    const { route } = routeVersetzen(gerade, 200, { seite });
    expect(route[0].y).toBe(-200);      // gleiche Richtung wie der Cursor
  });
});

describe('Stutzen (TRIM)', () => {
  // Waagrechte Leitung, senkrechte Begrenzung bei x = 600.
  const route = [{ x:0, y:0 }, { x:1000, y:0 }];
  const grenze = [{ x:600, y:-200 }, { x:600, y:200 }];

  it('findet nur echte Kreuzungen innerhalb beider Strecken', () => {
    expect(streckenSchnittpunkt({ x:0, y:0 }, { x:100, y:0 }, { x:50, y:-50 }, { x:50, y:50 }))
      .toMatchObject({ x:50, y:0 });
    // Die Begrenzung endet vor der Leitung — eine gedachte Verlängerung zählt nicht.
    expect(streckenSchnittpunkt({ x:0, y:0 }, { x:100, y:0 }, { x:50, y:20 }, { x:50, y:50 }))
      .toBeNull();
    // Parallel.
    expect(streckenSchnittpunkt({ x:0, y:0 }, { x:100, y:0 }, { x:0, y:10 }, { x:100, y:10 }))
      .toBeNull();
  });

  it('meldet den Schnittpunkt mit Längsmass', () => {
    const grenzen = trimGrenzen(route, grenze);
    expect(grenzen).toHaveLength(1);
    expect(grenzen[0]).toMatchObject({ x:600, y:0, segmentIndex:0 });
  });

  it('kürzt genau am Schnittpunkt und entfernt das angeklickte Stück', () => {
    // Klick rechts der Begrenzung — der rechte Teil fällt weg.
    const ergebnis = leitungTrimmen(route, grenze, { segmentIndex:0, x:800, y:0 });
    expect(ergebnis.routen).toEqual([[{ x:0, y:0 }, { x:600, y:0 }]]);
  });

  it('entfernt spiegelbildlich das linke Stück, wenn links geklickt wird', () => {
    const ergebnis = leitungTrimmen(route, grenze, { segmentIndex:0, x:200, y:0 });
    expect(ergebnis.routen).toEqual([[{ x:600, y:0 }, { x:1000, y:0 }]]);
  });

  it('lässt bei zwei Begrenzungen zwei Reste stehen', () => {
    const zweiFach = [
      { x:300, y:-200 }, { x:300, y:200 },
      { x:700, y:200 }, { x:700, y:-200 },
    ];
    const ergebnis = leitungTrimmen(route, zweiFach, { segmentIndex:0, x:500, y:0 });
    expect(ergebnis.routen).toEqual([
      [{ x:0, y:0 }, { x:300, y:0 }],
      [{ x:700, y:0 }, { x:1000, y:0 }],
    ]);
  });

  it('behält die Eckpunkte des stehenbleibenden Stücks unverändert', () => {
    const abgewinkelt = [{ x:0, y:0 }, { x:0, y:500 }, { x:1000, y:500 }];
    const senkrecht = [{ x:600, y:300 }, { x:600, y:700 }];
    const ergebnis = leitungTrimmen(abgewinkelt, senkrecht, { segmentIndex:1, x:800, y:500 });
    expect(ergebnis.routen).toEqual([[{ x:0, y:0 }, { x:0, y:500 }, { x:600, y:500 }]]);
  });

  it('weist ab, wenn die Begrenzung die Leitung nicht kreuzt', () => {
    const daneben = [{ x:2000, y:-200 }, { x:2000, y:200 }];
    expect(leitungTrimmen(route, daneben, { segmentIndex:0, x:500, y:0 }).fehler).toBeTruthy();
  });

  it('weist einen Klick ausserhalb der Leitung ab, statt zu raten', () => {
    expect(leitungTrimmen(route, grenze, { segmentIndex:5, x:500, y:0 }).fehler).toBeTruthy();
    expect(leitungTrimmen(route, grenze, null).fehler).toBeTruthy();
  });
});

describe('Dehnen bis Kante (EXTEND)', () => {
  const route = [{ x:0, y:0 }, { x:500, y:0 }];
  const grenze = [{ x:900, y:-200 }, { x:900, y:200 }];

  it('verlängert das Ende in seiner eigenen Richtung bis zur Begrenzung', () => {
    const ergebnis = routeBisKanteDehnen(route, 'target', grenze);
    expect(ergebnis.punkt).toEqual({ x:900, y:0 });
    expect(ergebnis.route).toEqual([{ x:0, y:0 }, { x:900, y:0 }]);
  });

  it('verlängert spiegelbildlich am Leitungsanfang', () => {
    const links = [{ x:-400, y:-200 }, { x:-400, y:200 }];
    const ergebnis = routeBisKanteDehnen(route, 'source', links);
    expect(ergebnis.route).toEqual([{ x:-400, y:0 }, { x:500, y:0 }]);
  });

  it('knickt nicht ab — die Richtung des Randstücks bleibt erhalten', () => {
    const abgewinkelt = [{ x:0, y:0 }, { x:0, y:500 }, { x:500, y:500 }];
    // Die Begrenzung muss auf der Höhe des Randstücks liegen (y = 500).
    const aufHoehe = [{ x:900, y:300 }, { x:900, y:700 }];
    const ergebnis = routeBisKanteDehnen(abgewinkelt, 'target', aufHoehe);
    expect(ergebnis.route).toEqual([{ x:0, y:0 }, { x:0, y:500 }, { x:900, y:500 }]);
  });

  it('nimmt die nächstliegende Begrenzung, nicht irgendeine', () => {
    const zwei = [
      { x:700, y:-200 }, { x:700, y:200 },
      { x:1200, y:200 }, { x:1200, y:-200 },
    ];
    expect(routeBisKanteDehnen(route, 'target', zwei).punkt).toEqual({ x:700, y:0 });
  });

  it('verlängert nie nach hinten', () => {
    // Begrenzung liegt hinter dem Startpunkt: vom Ende aus nicht erreichbar.
    const hinten = [{ x:-300, y:-200 }, { x:-300, y:200 }];
    expect(routeBisKanteDehnen(route, 'target', hinten).fehler).toBeTruthy();
  });

  it('dockt nicht an eine gedachte Verlängerung der Begrenzung an', () => {
    // Die Begrenzung endet oberhalb der Leitung — ihre Gerade träfe, sie selbst nicht.
    const zuKurz = [{ x:900, y:100 }, { x:900, y:400 }];
    expect(routeBisKanteDehnen(route, 'target', zuKurz).fehler).toBeTruthy();
  });

  it('weist parallele Begrenzungen und ungültige Eingaben ab', () => {
    expect(routeBisKanteDehnen(route, 'target', [{ x:0, y:80 }, { x:900, y:80 }]).fehler).toBeTruthy();
    expect(routeBisKanteDehnen(route, 'mitte', grenze).fehler).toBeTruthy();
    expect(routeBisKanteDehnen([{ x:0, y:0 }], 'target', grenze).fehler).toBeTruthy();
  });
});

describe('Verbinden (JOIN)', () => {
  const links = [{ x:0, y:0 }, { x:500, y:0 }];
  const rechts = [{ x:500, y:0 }, { x:1000, y:0 }];

  it('macht aus zwei Teilstücken eine Leitung ohne doppelten Punkt', () => {
    const ergebnis = routenVerbinden(links, rechts);
    expect(ergebnis.route).toEqual([{ x:0, y:0 }, { x:500, y:0 }, { x:1000, y:0 }]);
    expect(ergebnis).toMatchObject({ seiteA:'end', seiteB:'start', beginntBei:'a' });
  });

  it('verbindet auch, wenn das zweite Teilstück verkehrt herum läuft', () => {
    const gedreht = [{ x:1000, y:0 }, { x:500, y:0 }];
    const ergebnis = routenVerbinden(links, gedreht);
    expect(ergebnis.route).toEqual([{ x:0, y:0 }, { x:500, y:0 }, { x:1000, y:0 }]);
    expect(ergebnis).toMatchObject({ seiteA:'end', seiteB:'end' });
  });

  it('verbindet am Leitungsanfang und beginnt dann bei der zweiten Leitung', () => {
    const davor = [{ x:-500, y:0 }, { x:0, y:0 }];
    const ergebnis = routenVerbinden(links, davor);
    expect(ergebnis.route).toEqual([{ x:-500, y:0 }, { x:0, y:0 }, { x:500, y:0 }]);
    expect(ergebnis).toMatchObject({ seiteA:'start', seiteB:'end', beginntBei:'b' });
  });

  it('erhält die Ecken beider Teilstücke', () => {
    const ecke = [{ x:500, y:0 }, { x:500, y:400 }, { x:900, y:400 }];
    expect(routenVerbinden(links, ecke).route).toEqual([
      { x:0, y:0 }, { x:500, y:0 }, { x:500, y:400 }, { x:900, y:400 },
    ]);
  });

  it('lässt den überflüssigen Zwischenpunkt durch die Bereinigung fallen', () => {
    const { route } = routenVerbinden(links, rechts);
    // Der gemeinsame Punkt liegt auf der Geraden — als Ecke trägt er nichts.
    expect(routeBereinigen(route.slice(1, -1), { start:route[0], end:route.at(-1) })).toEqual([]);
  });

  it('behält eine echte Ecke als Zwischenpunkt', () => {
    const nachUnten = [{ x:500, y:0 }, { x:500, y:400 }];
    const { route } = routenVerbinden(links, nachUnten);
    expect(routeBereinigen(route.slice(1, -1), { start:route[0], end:route.at(-1) }))
      .toEqual([{ x:500, y:0 }]);
  });

  it('verbindet nichts, was sich nur kreuzt oder gar nicht berührt', () => {
    const kreuzt = [{ x:250, y:-200 }, { x:250, y:200 }];
    expect(routenVerbinden(links, kreuzt).fehler).toBeTruthy();
    expect(routenVerbinden(links, [{ x:900, y:0 }, { x:1200, y:0 }]).fehler).toBeTruthy();
    expect(routenVerbinden(links, [{ x:0, y:0 }]).fehler).toBeTruthy();
  });
});
