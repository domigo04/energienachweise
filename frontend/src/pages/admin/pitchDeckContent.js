export const PITCH_SLIDES = [
  { id: 0, label: "Heizungscockpit", eyebrow: "SIREGO GmbH" },
  { id: 1, label: "Planung heute", eyebrow: "Das Problem" },
  { id: 2, label: "Dazwischen", eyebrow: "Die Reibungsverluste" },
  { id: 3, label: "Für Fachplaner", eyebrow: "Die Zielgruppe" },
  { id: 4, label: "Die Lösung", eyebrow: "Ein verbundener Projektstand" },
  { id: 5, label: "Die Magic", eyebrow: "Das Zielbild" },
  { id: 6, label: "Pilot V1", eyebrow: "Der unterstützte Systemtyp" },
  { id: 7, label: "Nachvollziehbar", eyebrow: "Keine Blackbox" },
  { id: 8, label: "LV wird Wissen", eyebrow: "Das zweite Schwungrad" },
  { id: 9, label: "Der Nutzen", eyebrow: "Messbar im Projekt" },
  { id: 10, label: "Produktstand", eyebrow: "Heute" },
  { id: 11, label: "Roadmap", eyebrow: "Gate für Gate" },
  { id: 12, label: "Geschäftsmodell", eyebrow: "Betreut starten" },
  { id: 13, label: "Design Partner", eyebrow: "Der Pilot" },
  { id: 14, label: "Gemeinsam testen", eyebrow: "Nächster Schritt" },
];

export function normaliseSlide(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), PITCH_SLIDES.length - 1);
}
