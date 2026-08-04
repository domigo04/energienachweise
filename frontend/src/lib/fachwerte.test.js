import { describe, expect, it } from "vitest";
import { fachwertLabel, fachwertLabels, fachwertOptionen } from "./fachwerte";

const listen = {
  generator_types: [
    { code: "ews_wp", label: "Sole/Wasser-Wärmepumpe (Erdsonden)" },
    { code: "fernwaerme", label: "Fernwärme" },
  ],
};

describe("zentrale Fachwerte im Frontend", () => {
  it("wandelt Backend-Einträge in Auswahloptionen um", () => {
    expect(fachwertOptionen(listen, "generator_types")).toEqual([
      { value: "ews_wp", label: "Sole/Wasser-Wärmepumpe (Erdsonden)" },
      { value: "fernwaerme", label: "Fernwärme" },
    ]);
  });

  it("zeigt Labels aus der Registry und lässt unbekannte Altcodes sichtbar", () => {
    expect(fachwertLabel(listen, "generator_types", "fernwaerme")).toBe("Fernwärme");
    expect(fachwertLabel(listen, "generator_types", "alter_code")).toBe("alter_code");
    expect(fachwertLabels(listen, "generator_types", ["ews_wp", "alter_code"]))
      .toBe("Sole/Wasser-Wärmepumpe (Erdsonden), alter_code");
  });

  it("liefert für leere Werte einen kontrollierten Platzhalter", () => {
    expect(fachwertLabel(listen, "generator_types", null)).toBe("—");
    expect(fachwertLabels(listen, "generator_types", [])).toBe("—");
    expect(fachwertOptionen(listen, "unbekannt")).toEqual([]);
  });
});
