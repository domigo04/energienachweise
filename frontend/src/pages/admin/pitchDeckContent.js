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

// Zahlen der Kundenvariante: nur Grössen, die ein Planungsbüro als Käufer
// betreffen — Bedarf, eigener Nutzen, Preis. Marktgrössen in Lizenzen, ARR und
// Unternehmensbewertung stehen bewusst nur in der Investorenvariante.
export const PITCH_ZAHLEN = {
  bedarf: {
    workflows: "rund 25'000",
    workflowsSpanne: "Bandbreite 17'000–35'000 pro Jahr",
    gebaeude: "936'000",
    projekteProPlaner: "15 Projekte",
  },
  nutzen: {
    stunden: "8 Stunden",       // Zielannahme für das fertige Produkt, je Projekt
    intern: "CHF 600",          // direkte interne Kosteneinsparung je Projekt
    verrechenbar: "CHF 1'120",  // freigesetzte verrechenbare Kapazität je Projekt
    jahrStunden: "120 Stunden", // 15 Projekte je Planer und Jahr
    jahrFranken: "CHF 9'000",
    amortisation: "nach rund 4 Projekten",
  },
  preise: {
    pilot: "CHF 7'500",
    pilotdauer: "12 Wochen · zwei reale Projekte",
    core: "CHF 1'680",
    professional: "CHF 2'640",
    enterprise: "CHF 3'600–4'800",
    beispiel: "rund CHF 14'400",
    beispielBasis: "fünf Professional-Nutzer, inklusive Unternehmensgrundgebühr",
  },
};

// Zahlen der Investorenvariante. Alle Angaben sind Schätzungen mit Bandbreite;
// das Basisszenario steht jeweils als Einzelwert daneben.
export const PITCH_INVESTOR = {
  markt: {
    firmen: "900–1'800",
    lizenzen: "2'800–6'000",
    nutzerBasis: "rund 4'200",
    arr: "CHF 5–20 Mio.",
    arrBasis: "Basisszenario rund CHF 12 Mio.",
    effizienz: "rund CHF 15 Mio.",
  },
  kosten: {
    pilot: "CHF 120'000–300'000",
    v1: "CHF 650'000–1.2 Mio.",
    endprodukt: "CHF 1.5–3.5 Mio.",
    pilotErloes: "CHF 7'500 – 25'000",
  },
  bewertung: {
    heute: "CHF 1–1.8 Mio.",
    mitPiloten: "CHF 1.5–3 Mio.",
    marktfuehrer: "CHF 15–40 Mio.",
    grenze: "Über CHF 100 Mio. ist nur mit DACH-Expansion, weiteren Gewerken und deutlich über CHF 10 Mio. wiederkehrendem Jahresumsatz plausibel.",
  },
};

// Ausbaustufen in der Reihenfolge, in der sie gebaut werden.
export const PITCH_AUSBAU = [
  ["Schemaeditor und Hydraulik", "Schema, Berechnung, Revisionen und PDF-Export."],
  ["Firmenstandards", "Eigene Vorlagen, Prüfschritte und Zusammenarbeit im Büro."],
  ["Kostenindikation", "Grobkosten aus geprüften Referenzprojekten."],
  ["LV-Import", "Unternehmerangebote per OCR und KI in die eigene Wissensbasis."],
  ["Weitere Gewerke", "Ausbau über die Heizung hinaus und in den DACH-Raum."],
];

/** Leere kaufmännische Felder bleiben im Deck als offene Stelle sichtbar. */
export function pitchWert(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? { text, offen: false } : { text: "einzutragen", offen: true };
}

const KUNDE = [
  { key: "sirego", label: "SIREGO", eyebrow: "Wer dahinter steht" },
  { key: "problem", label: "Eine Änderung. Fünf Excel neu.", eyebrow: "Das Problem" },
  { key: "loesung", label: "Das System reagiert", eyebrow: "Die Lösung" },
  { key: "workflow", label: "Der Workflow", eyebrow: "Ein Kreislauf statt Dateien" },
  { key: "cockpit", label: "Heizungscockpit erklärt", eyebrow: "Was im Werkzeug steckt" },
  { key: "timeline", label: "MVP-Timeline", eyebrow: "Der Weg zum Marktstart" },
  { key: "leistungen", label: "Was Sie bekommen", eyebrow: "Im Piloten enthalten" },
  { key: "bedarf", label: "Der Bedarf", eyebrow: "Warum es das Werkzeug geben wird" },
  { key: "rechnung", label: "Was es Ihnen bringt", eyebrow: "Pro Planer gerechnet" },
  { key: "ausbau", label: "Ausbaustufen", eyebrow: "Was als Nächstes kommt" },
  { key: "preise", label: "Pilot und Lizenz", eyebrow: "Was es kostet" },
  { key: "kontakt", label: "Termin vereinbaren", eyebrow: "Nächster Schritt" },
  { key: "status", label: "Funktionsstatus heute", eyebrow: "Anhang · für Rückfragen", anhang: true },
  { key: "lv", label: "LV und Kostenintelligenz", eyebrow: "Anhang · Add-on", anhang: true },
  { key: "gates", label: "Technische Gates", eyebrow: "Anhang · Reihenfolge statt Termine", anhang: true },
  { key: "daten", label: "Daten und Datenschutz", eyebrow: "Anhang · vor dem Pilotstart", anhang: true },
  { key: "annahmen", label: "Berechnungsannahmen", eyebrow: "Anhang · Grundlagen", anhang: true },
];

const INVESTOR = [
  { key: "sirego", label: "SIREGO", eyebrow: "Wer dahinter steht" },
  { key: "problem", label: "Eine Änderung. Fünf Excel neu.", eyebrow: "Das Problem" },
  { key: "loesung", label: "Das System reagiert", eyebrow: "Die Lösung" },
  { key: "cockpit", label: "Heizungscockpit erklärt", eyebrow: "Der Stand heute" },
  { key: "markt", label: "Marktgrösse", eyebrow: "Schweiz" },
  { key: "rechnung", label: "Nutzen beim Kunden", eyebrow: "Warum gekauft wird" },
  { key: "preise", label: "Preismodell", eyebrow: "Wie Umsatz entsteht" },
  { key: "ausbau", label: "Ausbaustufen", eyebrow: "Produktplan" },
  { key: "kosten", label: "Entwicklungskosten", eyebrow: "Was der Ausbau braucht" },
  { key: "bewertung", label: "Bewertung", eyebrow: "Heute und langfristig" },
  { key: "timeline", label: "MVP-Timeline", eyebrow: "Der Weg zum Marktstart" },
  { key: "kontakt", label: "Termin vereinbaren", eyebrow: "Nächster Schritt" },
  { key: "status", label: "Funktionsstatus heute", eyebrow: "Anhang · für Rückfragen", anhang: true },
  { key: "bedarf", label: "Der Bedarf", eyebrow: "Anhang · Grundlage der Marktzahlen", anhang: true },
  { key: "lv", label: "LV und Kostenintelligenz", eyebrow: "Anhang · Add-on", anhang: true },
  { key: "gates", label: "Technische Gates", eyebrow: "Anhang · Reihenfolge statt Termine", anhang: true },
  { key: "daten", label: "Daten und Datenschutz", eyebrow: "Anhang · vor dem Pilotstart", anhang: true },
  { key: "annahmen", label: "Berechnungsannahmen", eyebrow: "Anhang · Grundlagen", anhang: true },
];

const nummeriert = (folien) => folien.map((folie, id) => ({ ...folie, id }));

export const PITCH_DECKS = {
  kunde: { pfad: "/admin/pitchdeck", titel: "Kundenvariante", folien: nummeriert(KUNDE) },
  investor: { pfad: "/admin/pitchdeck/investor", titel: "Investorenvariante", folien: nummeriert(INVESTOR) },
};

/** Unbekannte Variante fällt auf die Kundenvariante zurück. */
export function pitchDeck(variante) {
  return PITCH_DECKS[variante] || PITCH_DECKS.kunde;
}

export function normaliseSlide(value, variante) {
  const { folien } = pitchDeck(variante);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), folien.length - 1);
}

/** Fusszeile: im Hauptteil zählt die Folie, im Anhang der Anhang. */
export function pitchPosition(index, variante) {
  const { folien } = pitchDeck(variante);
  const slide = folien[normaliseSlide(index, variante)];
  const gruppe = folien.filter((item) => Boolean(item.anhang) === Boolean(slide.anhang));
  const position = gruppe.findIndex((item) => item.id === slide.id) + 1;
  return {
    zaehler: `${position} / ${gruppe.length}`,
    text: slide.anhang
      ? `Anhang ${position} von ${gruppe.length} · ${slide.label}`
      : `Folie ${position} von ${gruppe.length} · ${slide.label}`,
  };
}
