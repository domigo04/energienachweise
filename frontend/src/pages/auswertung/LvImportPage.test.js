import { describe, expect, it } from "vitest";

import { processingSchritt } from "./lvImportProgress";
import { costNeedsAttention, featureNeedsAttention } from "./LvImportPage";

describe("LV-Import Ladefortschritt", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [7, 2],
    [18, 3],
    [45, 4],
    [180, 4],
  ])("ordnet %i Sekunden dem Schritt %i zu", (seconds, expected) => {
    expect(processingSchritt(seconds)).toBe(expected);
  });
});

describe("LV-Review Hervorhebung", () => {
  it("markiert einen sicher erkannten, noch nicht manuell bestätigten Wert nicht orange", () => {
    expect(featureNeedsAttention({ effective_value: "35.3", confidence: "high", confirmed: false })).toBe(false);
  });

  it("markiert nur fehlende oder tatsächlich unsichere technische Werte", () => {
    expect(featureNeedsAttention({ effective_value: "", confidence: null })).toBe(true);
    expect(featureNeedsAttention({ effective_value: "4", confidence: "medium" })).toBe(true);
    expect(featureNeedsAttention({ effective_value: "4", confidence: "high", requires_review: true })).toBe(true);
  });

  it("lässt sichere Kosten neutral und hebt echte Zuordnungsprobleme hervor", () => {
    expect(costNeedsAttention({ detected_amount: 1200, canonical_key: "241.11", confidence: "high", confirmed: false, mapping_confirmed: false })).toBe(false);
    expect(costNeedsAttention({ detected_amount: 1200, canonical_key: null, confidence: "medium" })).toBe(true);
    expect(costNeedsAttention({ detected_amount: 1200, canonical_key: "241.11", validation_status: "mismatch" })).toBe(true);
  });
});
