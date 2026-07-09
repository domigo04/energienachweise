// Gemeinsame Auswahllisten fürs KV-Tool (Auswertung + Kostenschätzung).
export const PROJEKTARTEN = ["Neubau", "Umbau", "Sanierung", "Aufstockung", "Mischprojekt"];
export const GEBAEUDETYPEN = ["MFH", "EFH", "Büro", "Gewerbe", "Schule", "Hotel", "Industrie", "Restaurant", "Schwimmhalle", "Spital", "Werkstatt"];
export const AUSBAUUMFAENGE = ["Vollausbau", "Grundausbau", "Mieterausbau", "nur Erzeugung", "nur Verteilung"];
export const ZERTIFIZIERUNGEN = ["Gesetz", "Minergie", "Minergie-P", "Minergie-Eco", "SNBS", "LEED"];

// Mehrfach-Auswahl (Häkchen)
export const WAERMEERZEUGER = ["Erdsonden-WP", "Luft/Wasser-WP", "Wasser/Wasser-WP", "Fernwärme", "Gas", "Öl", "Pellets/Holz", "Solarthermie"];
export const WAERMEABGABE = ["FBH", "Heizkörper", "TABS", "Deckenstrahlplatten", "Lufterhitzer", "Wandheizung", "Konvektoren"];

// Bohrmeter nur relevant, wenn ein Erdsonden-Kreislauf gewählt ist.
export const hasErdsonde = (arr) => (arr || []).some((e) => e.toLowerCase().includes("erdsonde"));

// Anlagenkonfiguration — ein sehr starker Faktor für die Ähnlichkeit (siehe
// calculations/kostenschaetzung.py). Ein monovalentes Referenzprojekt darf für
// die Komplexitäts-Positionen (Regelung/Armaturen/Schaltschrank/Koordination)
// nicht als Volltreffer für ein bivalentes/hybrides Projekt gelten.
export const ANLAGENKONFIGURATIONEN = [
  { value: "monovalent", label: "Monovalent", hinweis: "Genau ein Wärmeerzeuger." },
  { value: "bivalent", label: "Bivalent", hinweis: "Zwei Erzeuger mit gemeinsamer Hydraulik/Regelung." },
  { value: "hybrid", label: "Hybrid", hinweis: "Mehrere unterschiedliche Erzeugerarten." },
  { value: "kaskadiert", label: "Kaskadiert", hinweis: "Mehrere gleiche Erzeuger." },
  { value: "redundant", label: "Redundant", hinweis: "Ein Erzeuger dient nur als Backup." },
];

// Erst-Vorschlag anhand Anzahl gewählter Wärmeerzeuger — der Nutzer kann
// jederzeit auf eine andere Konfiguration wechseln (z.B. kaskadiert/redundant
// lassen sich aus den Häkchen allein nicht ableiten).
export const konfigurationVorschlag = (waermeerzeuger) => {
  const n = new Set(waermeerzeuger || []).size;
  if (n <= 1) return "monovalent";
  if (n === 2) return "bivalent";
  return "hybrid";
};

// SIA-Gebäudekategorie (aus dem Projekt) → KV-Gebäudetyp (für die Übernahme).
const SIA_ZU_GEBAEUDETYP = {
  MFH: "MFH", EFH: "EFH", Verwaltung: "Büro", Schulen: "Schule",
  Verkauf: "Gewerbe", Restaurant: "Gewerbe", Versammlung: "Gewerbe",
  Industrie: "Industrie", Lager: "Industrie",
};
export const siaZuGebaeudetyp = (sia) => SIA_ZU_GEBAEUDETYP[sia] || "";
