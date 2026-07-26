import { describe, it, expect } from "vitest";
import {
  COMPONENTS,
  CATEGORIES,
  componentDef,
  isInlineInsertable,
  isBranchInsertable,
  isOrientationAware,
  isAnnotation,
  componentsByCategory,
  inlineInsertableTypes,
  placementBehavior,
  branchAnschluss,
  freierPort,
} from "./componentRegistry";

// §4/§8 — die Registry ist die eine Quelle für Bauteil-Eigenschaften.

describe("componentRegistry", () => {
  it("jede Komponente hat eine gültige Kategorie", () => {
    const keys = new Set(CATEGORIES.map((c) => c.key));
    for (const c of COMPONENTS) expect(keys.has(c.category)).toBe(true);
  });

  it("MVP-Inline-Bauteile sind einsetzbar (§4)", () => {
    for (const t of ["pump", "valve2", "stad", "shutoff", "checkvalve", "waermezaehler"]) {
      expect(isInlineInsertable(t)).toBe(true);
    }
  });

  it("Temperaturfühler ist ein Abgriff und teilt keine Leitung", () => {
    expect(placementBehavior("temperatur")).toBe("free");
    expect(isInlineInsertable("temperatur")).toBe(false);
    expect(isBranchInsertable("temperatur")).toBe(false);
  });

  it("3-Weg-Ventil ist inline mit freiem drittem Anschluss (§21)", () => {
    expect(placementBehavior("valve3")).toBe("inline_threeway");
    expect(isInlineInsertable("valve3")).toBe(true);
    expect(freierPort("valve3")).toBe("right");
  });

  it("Sicherheitsventil und Expansionsgefäss sind Abzweige (§16/§18)", () => {
    for (const t of ["sicherheitsventil", "expansion"]) {
      expect(placementBehavior(t)).toBe("branch");
      expect(isBranchInsertable(t)).toBe(true);
      expect(isInlineInsertable(t)).toBe(false);
      const b = branchAnschluss(t);
      expect(typeof b.port).toBe("string");
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(1);
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
    }
  });

  it("Erzeuger, Speicher und Verteiler bleiben frei platzierbar (§16)", () => {
    for (const t of ["erzeuger", "speicher", "verteiler"]) {
      expect(placementBehavior(t)).toBe("free");
      expect(isInlineInsertable(t)).toBe(false);
      expect(isBranchInsertable(t)).toBe(false);
    }
  });

  it("unbekannter Typ verhält sich wie free", () => {
    expect(placementBehavior("gibtsnicht")).toBe("free");
  });

  it("inline-einsetzbare Bauteile übernehmen die Orientierung (§5)", () => {
    for (const t of inlineInsertableTypes()) expect(isOrientationAware(t)).toBe(true);
  });

  it("Annotationen sind als solche markiert und nicht inline (§9/§10)", () => {
    for (const t of ["label", "concrete_area", "interface_line"]) {
      expect(isAnnotation(t)).toBe(true);
      expect(isInlineInsertable(t)).toBe(false);
    }
  });

  it("componentsByCategory liefert Bauteile in Reihenfolge", () => {
    const armaturen = componentsByCategory("armaturen").map((c) => c.type);
    expect(armaturen).toContain("valve2");
    expect(armaturen).toContain("stad");
  });

  it("referenziert nur bestehende Node-Typen (keine Dubletten)", () => {
    const typen = COMPONENTS.map((c) => c.type);
    expect(new Set(typen).size).toBe(typen.length);
  });

  it("componentDef gibt null für unbekannte Typen", () => {
    expect(componentDef("gibtsnicht")).toBeNull();
  });
});
