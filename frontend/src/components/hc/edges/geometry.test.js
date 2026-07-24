import { describe, it, expect } from "vitest";
import {
  streckenLaenge,
  projektionAufSegment,
  splitRouteAtPoint,
  mergeReconnectWaypoints,
  reconnectThroughNode,
  segmentAusrichtung,
  adaptivePolyline,
  roundedPolylinePath,
} from "./geometry";

// §3/§6 — die geometrische Kernlogik des Inline-Einsetzens und Wiederverbindens.
// Reine Funktionen, damit sie ohne Editor/Browser abgesichert sind (§13).

describe("streckenLaenge", () => {
  it("summiert die Segmentlängen", () => {
    expect(streckenLaenge([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }])).toBe(7);
  });
  it("ist 0 bei einem einzelnen Punkt", () => {
    expect(streckenLaenge([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe("projektionAufSegment", () => {
  it("projiziert senkrecht auf ein horizontales Segment", () => {
    const p = projektionAufSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(p.x).toBe(5);
    expect(p.y).toBe(0);
    expect(p.distance).toBe(3);
  });
  it("klemmt ausserhalb liegende Punkte auf die Segmentenden", () => {
    const p = projektionAufSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(p.t).toBe(0);
    expect(p.x).toBe(0);
  });
  it("liefert null für ein entartetes Segment", () => {
    expect(projektionAufSegment({ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBeNull();
  });
});

describe("splitRouteAtPoint", () => {
  // A ───────── B  →  A ──── P ──── B
  it("teilt eine gerade Leitung mittig und erhält keine Zwischenpunkte", () => {
    const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const { before, after, firstShare } = splitRouteAtPoint(route, 0, { x: 50, y: 0 });
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(firstShare).toBeCloseTo(0.5);
  });

  it("erhält bestehende Waypoints beidseits des Einfügepunkts", () => {
    // Route mit zwei Ecken: Start, W1, W2, Ende
    const route = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 40 }];
    // Einfügepunkt auf dem letzten Segment (index 2)
    const { before, after, firstShare } = splitRouteAtPoint(route, 2, { x: 60, y: 40 });
    expect(before).toEqual([{ x: 40, y: 0 }, { x: 40, y: 40 }]); // W1, W2 bleiben im ersten Stück
    expect(after).toEqual([]);                                    // nach der Ecke keine weiteren
    expect(firstShare).toBeGreaterThan(0.5);                      // erstes Stück ist länger
  });

  it("Längenanteile addieren sich zu 1", () => {
    const route = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 100, y: 0 }];
    const { firstShare } = splitRouteAtPoint(route, 1, { x: 60, y: 0 });
    expect(firstShare).toBeCloseTo(0.6); // 60 von 100
  });
});

describe("mergeReconnectWaypoints", () => {
  // A ── P ── B  →  A ─────── B (P wird zum Stützpunkt)
  it("führt zwei Routen über den Knoten zu einer zusammen", () => {
    const routeA = [{ x: 0, y: 0 }, { x: 50, y: 0 }];  // A → Knoten(50,0)
    const routeB = [{ x: 50, y: 0 }, { x: 100, y: 0 }]; // Knoten → B
    expect(mergeReconnectWaypoints(routeA, routeB)).toEqual([{ x: 50, y: 0 }]);
  });

  it("erhält die Zwischenpunkte beider Teilstücke", () => {
    const routeA = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 }];
    const routeB = [{ x: 50, y: 0 }, { x: 70, y: 0 }, { x: 100, y: 0 }];
    expect(mergeReconnectWaypoints(routeA, routeB)).toEqual([
      { x: 20, y: 0 }, { x: 50, y: 0 }, { x: 70, y: 0 },
    ]);
  });
});

describe("reconnectThroughNode", () => {
  // A → P und P → B, P wird gelöscht → A ─── B mit P als Stützpunkt (§6).
  const routes = {
    e1: [{ x: 0, y: 0 }, { x: 50, y: 0 }],   // A → P(50,0)
    e2: [{ x: 50, y: 0 }, { x: 100, y: 0 }], // P → B
  };
  const routeOf = (e) => routes[e._k];

  it("führt zwei Durchgangsleitungen wieder zusammen", () => {
    const e1 = { _k: "e1", source: "A", sourceHandle: "top", target: "P", targetHandle: "bottom" };
    const e2 = { _k: "e2", source: "P", sourceHandle: "top", target: "B", targetHandle: "bottom" };
    const rc = reconnectThroughNode(e1, e2, "P", routeOf);
    expect(rc.source).toBe("A");
    expect(rc.sourceHandle).toBe("top");
    expect(rc.target).toBe("B");
    expect(rc.targetHandle).toBe("bottom");
    expect(rc.points).toEqual([{ x: 50, y: 0 }]); // Bauteilort bleibt Stützpunkt
  });

  it("funktioniert auch bei umgekehrter Kantenrichtung", () => {
    // e2 zeigt B → P statt P → B
    const routes2 = { e1: routes.e1, e2: [{ x: 100, y: 0 }, { x: 50, y: 0 }] };
    const e1 = { _k: "e1", source: "A", sourceHandle: "top", target: "P", targetHandle: "bottom" };
    const e2 = { _k: "e2", source: "B", sourceHandle: "bottom", target: "P", targetHandle: "top" };
    const rc = reconnectThroughNode(e1, e2, "P", (e) => routes2[e._k]);
    expect(rc.source).toBe("A");
    expect(rc.target).toBe("B");
    expect(rc.points).toEqual([{ x: 50, y: 0 }]);
  });

  it("verweigert die Zusammenführung bei gleichem Aussenknoten (keine eindeutige Topologie)", () => {
    const e1 = { _k: "e1", source: "A", sourceHandle: "top", target: "P", targetHandle: "bottom" };
    const e2 = { _k: "e2", source: "P", sourceHandle: "top", target: "A", targetHandle: "x" };
    expect(reconnectThroughNode(e1, e2, "P", routeOf)).toBeNull();
  });
});

describe("adaptivePolyline — CAD-Grundsatz", () => {
  it("vertikal ausgerichtete Handles → exakt gerade Leitung (keine Lead-Segmente)", () => {
    // gleiche X, unterschiedliche Handle-Seiten dürfen KEINEN Knick erzwingen.
    expect(adaptivePolyline({ x: 40, y: 0 }, { x: 40, y: 120 }, [], "bottom", "top")).toEqual([
      { x: 40, y: 0 }, { x: 40, y: 120 },
    ]);
  });

  it("horizontal ausgerichtete Handles → exakt gerade Leitung", () => {
    expect(adaptivePolyline({ x: 0, y: 50 }, { x: 120, y: 50 }, [], "right", "left")).toEqual([
      { x: 0, y: 50 }, { x: 120, y: 50 },
    ]);
  });

  it("versetzte Enden → genau ein 90°-Knick, keine herauslaufenden Leads", () => {
    const route = adaptivePolyline({ x: 0, y: 0 }, { x: 100, y: 60 }, [], "right", null);
    expect(route).toHaveLength(3);
    // Der Knick liegt exakt auf der Ecke, nicht 20–60 px aus dem Bauteil heraus.
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[1]).toEqual({ x: 100, y: 0 }); // erst horizontal (Handle rechts)
    expect(route[2]).toEqual({ x: 100, y: 60 });
  });

  it("vorhandene Waypoints haben Vorrang — nur sie, keine zusätzlichen Punkte", () => {
    const wp = [{ x: 40, y: 0 }, { x: 40, y: 80 }];
    const route = adaptivePolyline({ x: 0, y: 0 }, { x: 80, y: 80 }, wp, "right", "left");
    expect(route).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 80, y: 80 }]);
  });

  it("Node auf bestehender Leitung → beide neuen Edges bilden zusammen die Gerade", () => {
    // Gerade A(40,0) → B(40,120), Bauteil bei P(40,60).
    const first = adaptivePolyline({ x: 40, y: 0 }, { x: 40, y: 60 }, [], "bottom", "top");
    const second = adaptivePolyline({ x: 40, y: 60 }, { x: 40, y: 120 }, [], "bottom", "top");
    expect(first).toEqual([{ x: 40, y: 0 }, { x: 40, y: 60 }]);
    expect(second).toEqual([{ x: 40, y: 60 }, { x: 40, y: 120 }]);
    // Zusammengesetzt (P einmal) = exakt die ursprüngliche Gerade.
    const kombiniert = vereinfachtKombinieren(first, second);
    expect(kombiniert).toEqual([{ x: 40, y: 0 }, { x: 40, y: 120 }]);
  });

  it("Inline-Bauteil entlang derselben Achse verschieben → kein zusätzlicher Knick", () => {
    // P wandert von y=60 auf y=90, bleibt auf derselben X-Achse wie A.
    const vorher = adaptivePolyline({ x: 40, y: 0 }, { x: 40, y: 60 }, [], "bottom", "top");
    const nachher = adaptivePolyline({ x: 40, y: 0 }, { x: 40, y: 90 }, [], "bottom", "top");
    expect(vorher).toHaveLength(2);
    expect(nachher).toHaveLength(2); // weiterhin gerade, kein Knick
  });
});

// kleine Hilfe: zwei Teilstücke an gemeinsamem Punkt zusammenfügen + vereinfachen
function vereinfachtKombinieren(a, b) {
  const roh = [...a, ...b.slice(1)];
  return roh.filter((p, i, all) => {
    if (!i || i === all.length - 1) return true;
    const before = all[i - 1], after = all[i + 1];
    const cross = (p.x - before.x) * (after.y - p.y) - (p.y - before.y) * (after.x - p.x);
    return Math.abs(cross) > 0.5;
  });
}

describe("roundedPolylinePath — nur echte 90°-Ecken", () => {
  it("gerade Leitung → ausschliesslich M … L …, kein Q", () => {
    const d = roundedPolylinePath([{ x: 0, y: 0 }, { x: 0, y: 100 }], 8);
    expect(d).toBe("M 0 0 L 0 100");
    expect(d).not.toContain("Q");
  });

  it("echte 90°-Ecke wird leicht abgerundet (enthält Q)", () => {
    const d = roundedPolylinePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 8);
    expect(d).toContain("Q");
  });

  it("kollineare Punkte erzeugen keinen Bogen", () => {
    const d = roundedPolylinePath([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }], 8);
    expect(d).not.toContain("Q");
  });
});

describe("segmentAusrichtung", () => {
  it("erkennt horizontale und vertikale Segmente", () => {
    expect(segmentAusrichtung({ x: 0, y: 0 }, { x: 10, y: 1 })).toBe("horizontal");
    expect(segmentAusrichtung({ x: 0, y: 0 }, { x: 1, y: 10 })).toBe("vertikal");
  });
});
