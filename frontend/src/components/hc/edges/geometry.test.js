import { describe, it, expect } from "vitest";
import {
  streckenLaenge,
  projektionAufSegment,
  splitRouteAtPoint,
  mergeReconnectWaypoints,
  reconnectThroughNode,
  segmentAusrichtung,
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

describe("segmentAusrichtung", () => {
  it("erkennt horizontale und vertikale Segmente", () => {
    expect(segmentAusrichtung({ x: 0, y: 0 }, { x: 10, y: 1 })).toBe("horizontal");
    expect(segmentAusrichtung({ x: 0, y: 0 }, { x: 1, y: 10 })).toBe("vertikal");
  });
});
