import { describe, expect, it } from "vitest";
import { normaliseSlide, PITCH_SLIDES } from "./pitchDeckContent";

describe("Pitchdeck-Navigation", () => {
  it("hat fortlaufende, eindeutige Folien", () => {
    expect(PITCH_SLIDES).toHaveLength(15);
    expect(PITCH_SLIDES.map((slide) => slide.id)).toEqual(
      Array.from({ length: 15 }, (_, index) => index),
    );
  });

  it("begrenzt ungültige Foliennummern", () => {
    expect(normaliseSlide(undefined)).toBe(0);
    expect(normaliseSlide("-4")).toBe(0);
    expect(normaliseSlide("8")).toBe(8);
    expect(normaliseSlide("99")).toBe(14);
  });
});
