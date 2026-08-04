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

// Kaufmännische Angaben der Folien Marktpotenzial, Finanzierung, Funding und
// Lizenzen. Leere Felder erscheinen im Deck sichtbar als «einzutragen» — sie
// werden bewusst nicht geschätzt. Belegte Werte stammen aus docs/PILOT_PLAN.md.
export const PITCH_ZAHLEN = {
  markt: {
    bueros: "",        // z. B. "rund 900" – Heizungsplanungsbüros in der Schweiz
    zielsegment: "",   // z. B. "410" – davon mit 2–15 Planern
    potenzial: "",     // z. B. "CHF 2.1 Mio." – jährliches Lizenzpotenzial
    quelle: "",        // Quelle der Marktzahlen, z. B. Verbandsstatistik
  },
  finanzierung: {
    bisher: "",        // bisher in die Entwicklung geflossen
    laufend: "",       // laufender Aufwand pro Monat oder Jahr
    pilotbeitrag: "CHF 5'000",       // docs/PILOT_PLAN.md, Phase 6
    pilotdauer: "3 Monate begleitet", // docs/PILOT_PLAN.md, Phase 6
  },
  funding: {
    bedarf: "",        // Finanzierungsbedarf bis zum Marktstart
    verwendung: "",    // wofür die Mittel eingesetzt werden
    zeitraum: "",      // Zeitraum bis zum Marktstart
  },
  lizenzen: {
    core: "CHF 4'000–6'000",  // docs/PILOT_PLAN.md, pro Büro und Jahr
    pilotkondition: "",       // was Pilotbüros beim Marktstart erhalten
    addon: "LV und Kostenintelligenz",
  },
};

/** Leere kaufmännische Felder bleiben im Deck als offene Stelle sichtbar. */
export function pitchWert(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? { text, offen: false } : { text: "einzutragen", offen: true };
}

export const PITCH_SLIDES = [
  { id: 0, key: "sirego", label: "SIREGO", eyebrow: "Wer dahinter steht" },
  { id: 1, key: "problem", label: "Eine Änderung. Fünf Excel neu.", eyebrow: "Das Problem" },
  { id: 2, key: "loesung", label: "Das System reagiert", eyebrow: "Die Lösung" },
  { id: 3, key: "workflow", label: "Der Workflow", eyebrow: "Ein Kreislauf statt Dateien" },
  { id: 4, key: "cockpit", label: "Heizungscockpit erklärt", eyebrow: "Was im Werkzeug steckt" },
  { id: 5, key: "timeline", label: "MVP-Timeline", eyebrow: "Der Weg zum Marktstart" },
  { id: 6, key: "leistungen", label: "Was Sie bekommen", eyebrow: "Im Piloten enthalten" },
  { id: 7, key: "markt", label: "Marktpotenzial", eyebrow: "Warum es das Werkzeug geben wird" },
  { id: 8, key: "finanzierung", label: "Finanzierung", eyebrow: "Wie die Entwicklung getragen wird" },
  { id: 9, key: "funding", label: "Funding", eyebrow: "Bis zum Marktstart" },
  { id: 10, key: "lizenzen", label: "Lizenzen bei Marktstart", eyebrow: "Danach" },
  { id: 11, key: "kontakt", label: "Termin vereinbaren", eyebrow: "Nächster Schritt" },
  { id: 12, key: "status", label: "Funktionsstatus heute", eyebrow: "Anhang · für Rückfragen", anhang: true },
  { id: 13, key: "nutzen", label: "Nutzenhypothese", eyebrow: "Anhang · im Pilot zu messen", anhang: true },
  { id: 14, key: "lv", label: "LV und Kostenintelligenz", eyebrow: "Anhang · Add-on", anhang: true },
  { id: 15, key: "gates", label: "Technische Gates", eyebrow: "Anhang · Reihenfolge statt Termine", anhang: true },
  { id: 16, key: "daten", label: "Daten und Datenschutz", eyebrow: "Anhang · vor dem Pilotstart", anhang: true },
  { id: 17, key: "annahmen", label: "Berechnungsannahmen", eyebrow: "Anhang · Grundlagen", anhang: true },
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
