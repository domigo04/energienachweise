import { describe, it, expect } from "vitest";
import { createHydraulicEdge } from "./edgeFactory";

// Prio 1: keine zufälligen Leitungen. createHydraulicEdge ist die einzige
// Edge-Quelle und muss jede ungültige Erzeugung verweigern.

const gueltig = {
  id: "e1", source: "A", sourceHandle: "top", target: "B", targetHandle: "bottom",
  layerId: "heizung_vl", layerColor: "#ef4444",
  startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 100 },
};

describe("createHydraulicEdge", () => {
  it("erzeugt eine gültige Leitung", () => {
    const e = createHydraulicEdge(gueltig, []);
    expect(e).not.toBeNull();
    expect(e.type).toBe("flow");
    expect(e.data.layer_id).toBe("heizung_vl");
    expect(e.source).toBe("A");
    expect(e.target).toBe("B");
  });

  it("verweigert Selbstanschluss (source === target)", () => {
    expect(createHydraulicEdge({ ...gueltig, target: "A" }, [])).toBeNull();
  });

  it("verweigert fehlende Quelle oder Ziel", () => {
    expect(createHydraulicEdge({ ...gueltig, source: null }, [])).toBeNull();
    expect(createHydraulicEdge({ ...gueltig, target: undefined }, [])).toBeNull();
  });

  it("verweigert fehlende id", () => {
    expect(createHydraulicEdge({ ...gueltig, id: null }, [])).toBeNull();
  });

  it("verweigert ungültigen Layer", () => {
    expect(createHydraulicEdge({ ...gueltig, layerId: null }, [])).toBeNull();
  });

  it("verweigert Null-Länge (identische Endpunkte)", () => {
    expect(createHydraulicEdge({ ...gueltig, endPoint: { x: 0, y: 1 } }, [])).toBeNull();
  });

  it("verweigert Duplikat-Edge (gleiche Quelle/Ziel + Handles)", () => {
    const bestehend = [{ source: "A", sourceHandle: "top", target: "B", targetHandle: "bottom" }];
    expect(createHydraulicEdge(gueltig, bestehend)).toBeNull();
    // andere Handles → kein Duplikat
    expect(createHydraulicEdge({ ...gueltig, targetHandle: "left" }, bestehend)).not.toBeNull();
  });

  it("erlaubt dieselbe Strecke ohne Positionsangabe (keine Null-Längen-Prüfung)", () => {
    const { startPoint, endPoint, ...ohnePos } = gueltig;
    void startPoint; void endPoint;
    expect(createHydraulicEdge(ohnePos, [])).not.toBeNull();
  });
});
