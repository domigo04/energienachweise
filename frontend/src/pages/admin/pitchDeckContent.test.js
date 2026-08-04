import { describe, expect, it } from "vitest";
import {
  normaliseSlide, pitchPosition, pitchWert, PITCH_ANHANG, PITCH_HAUPTTEIL,
  PITCH_KONTAKT, PITCH_SLIDES, PITCH_ZAHLEN,
} from "./pitchDeckContent";

describe("Pitchdeck-Navigation", () => {
  it("hat fortlaufende, eindeutige Folien", () => {
    expect(PITCH_SLIDES.map((slide) => slide.id)).toEqual(
      PITCH_SLIDES.map((_, index) => index),
    );
    expect(new Set(PITCH_SLIDES.map((slide) => slide.key)).size).toBe(PITCH_SLIDES.length);
  });

  it("erzählt den Hauptteil in der abgesprochenen Reihenfolge", () => {
    expect(PITCH_HAUPTTEIL.map((slide) => slide.key)).toEqual([
      "sirego", "problem", "loesung", "workflow", "cockpit", "timeline",
      "leistungen", "markt", "finanzierung", "funding", "lizenzen", "kontakt",
    ]);
    expect(PITCH_HAUPTTEIL.at(-1).id).toBeLessThan(PITCH_ANHANG[0].id);
    expect(PITCH_ANHANG).toHaveLength(6);
  });

  it("begrenzt ungültige Foliennummern", () => {
    const letzte = PITCH_SLIDES.length - 1;
    expect(normaliseSlide(undefined)).toBe(0);
    expect(normaliseSlide("-4")).toBe(0);
    expect(normaliseSlide("8")).toBe(8);
    expect(normaliseSlide("99")).toBe(letzte);
  });

  it("zählt im Hauptteil Folien und im Anhang Anhänge", () => {
    expect(pitchPosition(0).zaehler).toBe("1 / 12");
    expect(pitchPosition(11).text).toMatch(/^Folie 12 von 12 · /);
    expect(pitchPosition(12).zaehler).toBe("1 / 6");
    expect(pitchPosition(12).text).toMatch(/^Anhang 1 von 6 · /);
  });

  it("hält den Kontakt der Abschlussfolie an einer Stelle", () => {
    expect(PITCH_KONTAKT.mail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
  });
});

describe("Kaufmännische Angaben", () => {
  it("macht leere Felder als offene Stelle sichtbar", () => {
    expect(pitchWert("")).toEqual({ text: "einzutragen", offen: true });
    expect(pitchWert("   ")).toEqual({ text: "einzutragen", offen: true });
    expect(pitchWert(undefined)).toEqual({ text: "einzutragen", offen: true });
    expect(pitchWert("CHF 5'000")).toEqual({ text: "CHF 5'000", offen: false });
  });

  it("übernimmt die belegten Werte aus dem Pilotplan", () => {
    expect(pitchWert(PITCH_ZAHLEN.finanzierung.pilotbeitrag).offen).toBe(false);
    expect(pitchWert(PITCH_ZAHLEN.lizenzen.core).offen).toBe(false);
  });
});
