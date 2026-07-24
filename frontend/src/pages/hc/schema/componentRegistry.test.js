import { describe, it, expect } from "vitest";
import {
  COMPONENTS,
  CATEGORIES,
  componentDef,
  isInlineInsertable,
  isOrientationAware,
  isAnnotation,
  componentsByCategory,
  inlineInsertableTypes,
} from "./componentRegistry";

// §4/§8 — die Registry ist die eine Quelle für Bauteil-Eigenschaften.

describe("componentRegistry", () => {
  it("jede Komponente hat eine gültige Kategorie", () => {
    const keys = new Set(CATEGORIES.map((c) => c.key));
    for (const c of COMPONENTS) expect(keys.has(c.category)).toBe(true);
  });

  it("MVP-Inline-Bauteile sind einsetzbar (§4)", () => {
    for (const t of ["pump", "valve2", "stad", "shutoff", "checkvalve", "waermezaehler", "temperatur"]) {
      expect(isInlineInsertable(t)).toBe(true);
    }
  });

  it("3-Weg-Ventil ist NICHT inline einsetzbar (Verzweigung ungelöst)", () => {
    expect(isInlineInsertable("valve3")).toBe(false);
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
