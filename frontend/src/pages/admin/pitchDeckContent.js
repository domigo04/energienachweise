// Kontakt der Abschlussfolie. Der QR-Code in `assets/pitchdeck/kontakt-qr.svg`
// zeigt auf `mailto:<mail>?subject=<betreff>` und muss bei einer Änderung hier
// neu erzeugt werden (siehe docs/PITCHDECK.md).
export const PITCH_KONTAKT = {
  name: "Dominic Goulon",
  firma: "SIREGO GmbH",
  rolle: "Heizungsfachplanung und Produktentwicklung",
  mail: "dominic.goulon@sirego.ch",
  betreff: "Pilotprojekt Heizungscockpit",
};

export const PITCH_SLIDES = [
  { id: 0, key: "titel", label: "Heizungscockpit", eyebrow: "SIREGO GmbH", tone: "dark" },
  { id: 1, key: "problem", label: "Eine Änderung. Fünf Excel neu.", eyebrow: "Das heutige Problem" },
  { id: 2, key: "beispiel", label: "15 kW auf 21 kW", eyebrow: "Konkretes Änderungsbeispiel" },
  { id: 3, key: "kette", label: "Das System reagiert", eyebrow: "Die Berechnungskette", tone: "dark" },
  { id: 4, key: "status", label: "Pilot V1", eyebrow: "Ehrlicher Funktionsstatus" },
  { id: 5, key: "projektstand", label: "Nachvollziehbarer Projektstand", eyebrow: "Formel, Warnung, Revision, Export" },
  { id: 6, key: "nutzen", label: "Nutzenhypothese", eyebrow: "Im Pilot zu messen" },
  { id: 7, key: "zielbuero", label: "Für wen der Pilot passt", eyebrow: "Design Partner" },
  { id: 8, key: "angebot", label: "Pilotangebot", eyebrow: "Leistung, Gates, Preis" },
  { id: 9, key: "hintergrund", label: "Fachlicher Hintergrund", eyebrow: "Warum dieses Problem" },
  { id: 10, key: "kontakt", label: "Pilotprojekt starten", eyebrow: "Nächster Schritt" },
  { id: 11, key: "lv", label: "LV und Kostenintelligenz", eyebrow: "Add-on nach dem Kern", anhang: true },
  { id: 12, key: "modell", label: "Geschäftsmodell nach dem Pilot", eyebrow: "Preise", anhang: true },
  { id: 13, key: "gates", label: "Technische Gates", eyebrow: "Reihenfolge statt Termine", anhang: true },
  { id: 14, key: "daten", label: "Daten und Datenschutz", eyebrow: "Vor dem Pilotstart geregelt", anhang: true },
  { id: 15, key: "annahmen", label: "Berechnungsannahmen", eyebrow: "Grundlage der Nutzenhypothese", anhang: true },
];

export const PITCH_HAUPTTEIL = PITCH_SLIDES.filter((slide) => !slide.anhang);
export const PITCH_ANHANG = PITCH_SLIDES.filter((slide) => slide.anhang);

export function normaliseSlide(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), PITCH_SLIDES.length - 1);
}

/** Fusszeile: im Hauptteil zählt die Folie, im Anhang der Anhang. */
export function pitchPosition(index) {
  const slide = PITCH_SLIDES[normaliseSlide(index)];
  const gruppe = slide.anhang ? PITCH_ANHANG : PITCH_HAUPTTEIL;
  const position = gruppe.findIndex((item) => item.id === slide.id) + 1;
  return {
    zaehler: `${position} / ${gruppe.length}`,
    text: slide.anhang
      ? `Anhang ${position} von ${gruppe.length} · ${slide.label}`
      : `Folie ${position} von ${gruppe.length} · ${slide.label}`,
  };
}
