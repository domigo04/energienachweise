import { describe, expect, it } from "vitest";
import {
  normaliseSlide, pitchPosition, PITCH_ANHANG, PITCH_HAUPTTEIL, PITCH_KONTAKT, PITCH_SLIDES,
} from "./pitchDeckContent";

describe("Pitchdeck-Navigation", () => {
  it("hat fortlaufende, eindeutige Folien", () => {
    expect(PITCH_SLIDES.map((slide) => slide.id)).toEqual(
      PITCH_SLIDES.map((_, index) => index),
    );
    expect(new Set(PITCH_SLIDES.map((slide) => slide.key)).size).toBe(PITCH_SLIDES.length);
  });

  it("trennt Hauptteil und Anhang", () => {
    expect(PITCH_HAUPTTEIL).toHaveLength(11);
    expect(PITCH_ANHANG).toHaveLength(5);
    expect(PITCH_HAUPTTEIL.at(-1).id).toBeLessThan(PITCH_ANHANG[0].id);
  });

  it("begrenzt ungültige Foliennummern", () => {
    const letzte = PITCH_SLIDES.length - 1;
    expect(normaliseSlide(undefined)).toBe(0);
    expect(normaliseSlide("-4")).toBe(0);
    expect(normaliseSlide("8")).toBe(8);
    expect(normaliseSlide("99")).toBe(letzte);
  });

  it("zählt im Hauptteil Folien und im Anhang Anhänge", () => {
    expect(pitchPosition(0).zaehler).toBe("1 / 11");
    expect(pitchPosition(10).text).toMatch(/^Folie 11 von 11 · /);
    expect(pitchPosition(11).zaehler).toBe("1 / 5");
    expect(pitchPosition(11).text).toMatch(/^Anhang 1 von 5 · /);
  });

  it("hält den Kontakt der Abschlussfolie an einer Stelle", () => {
    expect(PITCH_KONTAKT.mail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
  });
});
