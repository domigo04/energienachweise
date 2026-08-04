import { describe, expect, it } from "vitest";
import {
  normaliseSlide, pitchDeck, pitchPosition, pitchWert, PITCH_DECKS, PITCH_INVESTOR,
  PITCH_KONTAKT, PITCH_ZAHLEN,
} from "./pitchDeckContent";

const schluessel = (variante) => pitchDeck(variante).folien.map((folie) => folie.key);
const hauptteil = (variante) => pitchDeck(variante).folien.filter((folie) => !folie.anhang);

describe("Pitchdeck-Varianten", () => {
  it.each(["kunde", "investor"])("nummeriert %s fortlaufend und eindeutig", (variante) => {
    const { folien } = pitchDeck(variante);
    expect(folien.map((folie) => folie.id)).toEqual(folien.map((_, index) => index));
    expect(new Set(folien.map((folie) => folie.key)).size).toBe(folien.length);
    expect(folien.filter((folie) => folie.anhang).at(0).id)
      .toBeGreaterThan(folien.filter((folie) => !folie.anhang).at(-1).id);
  });

  it("erzählt die Kundenvariante in der abgesprochenen Reihenfolge", () => {
    expect(hauptteil("kunde").map((folie) => folie.key)).toEqual([
      "sirego", "problem", "loesung", "workflow", "cockpit", "timeline",
      "leistungen", "bedarf", "rechnung", "ausbau", "preise", "kontakt",
    ]);
  });

  it("hält Marktgrösse, Kosten und Bewertung aus der Kundenvariante heraus", () => {
    const nurInvestor = ["markt", "kosten", "bewertung"];
    expect(schluessel("kunde").filter((key) => nurInvestor.includes(key))).toEqual([]);
    expect(nurInvestor.every((key) => schluessel("investor").includes(key))).toBe(true);
  });

  it("fällt bei unbekannter Variante auf die Kundenvariante zurück", () => {
    expect(pitchDeck("gibtsnicht")).toBe(PITCH_DECKS.kunde);
    expect(pitchDeck(undefined).pfad).toBe("/admin/pitchdeck");
    expect(PITCH_DECKS.investor.pfad).toBe("/admin/pitchdeck/investor");
  });

  it("begrenzt ungültige Foliennummern je Variante", () => {
    const letzteKunde = PITCH_DECKS.kunde.folien.length - 1;
    const letzteInvestor = PITCH_DECKS.investor.folien.length - 1;
    expect(normaliseSlide(undefined, "kunde")).toBe(0);
    expect(normaliseSlide("-4", "kunde")).toBe(0);
    expect(normaliseSlide("8", "kunde")).toBe(8);
    expect(normaliseSlide("99", "kunde")).toBe(letzteKunde);
    expect(normaliseSlide("99", "investor")).toBe(letzteInvestor);
  });

  it("zählt im Hauptteil Folien und im Anhang Anhänge", () => {
    expect(pitchPosition(0, "kunde").zaehler).toBe("1 / 12");
    expect(pitchPosition(11, "kunde").text).toMatch(/^Folie 12 von 12 · /);
    expect(pitchPosition(12, "kunde").text).toMatch(/^Anhang 1 von 5 · /);
    expect(pitchPosition(0, "investor").zaehler).toBe("1 / 12");
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
    expect(pitchWert("CHF 7'500")).toEqual({ text: "CHF 7'500", offen: false });
  });

  it("hat für beide Varianten belegte Werte", () => {
    expect(pitchWert(PITCH_ZAHLEN.preise.pilot).offen).toBe(false);
    expect(pitchWert(PITCH_ZAHLEN.nutzen.stunden).offen).toBe(false);
    expect(pitchWert(PITCH_INVESTOR.markt.arr).offen).toBe(false);
    expect(pitchWert(PITCH_INVESTOR.bewertung.heute).offen).toBe(false);
  });
});
