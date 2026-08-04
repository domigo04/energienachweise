export const PITCH_SLIDES = [
  { id: 0, label: "Heizungscockpit", eyebrow: "SIREGO GmbH" },
  { id: 1, label: "Eine Änderung", eyebrow: "Das bekannte Problem" },
  { id: 2, label: "Planung heute", eyebrow: "Getrennte Werkzeuge" },
  { id: 3, label: "Dazwischen", eyebrow: "Die Reibungsverluste" },
  { id: 4, label: "Die Lösung", eyebrow: "Ein verbundenes System" },
  { id: 5, label: "Das System reagiert", eyebrow: "Die Magic" },
  { id: 6, label: "Pilot V1", eyebrow: "Der unterstützte Systemtyp" },
  { id: 7, label: "Nachvollziehbar", eyebrow: "Keine Blackbox" },
  { id: 8, label: "LV wird Firmenwissen", eyebrow: "Das zweite Schwungrad" },
  { id: 9, label: "Der wirtschaftliche Nutzen", eyebrow: "Messbar im Pilot" },
  { id: 10, label: "Belastbarer Projektstand", eyebrow: "Export heute" },
  { id: 11, label: "Vom Produkt zum Beweis", eyebrow: "Gate für Gate" },
  { id: 12, label: "Geschäftsmodell", eyebrow: "Betreut starten" },
  { id: 13, label: "Design Partner", eyebrow: "Der Pilot" },
  { id: 14, label: "Gemeinsam testen", eyebrow: "Nächster Schritt" },
];

export function normaliseSlide(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), PITCH_SLIDES.length - 1);
}
