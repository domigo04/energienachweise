import { describe, expect, it } from "vitest";

import { processingSchritt } from "./lvImportProgress";

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
