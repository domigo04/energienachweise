// Gemeinsame Auswahllisten fürs KV-Tool (Auswertung + Kostenschätzung).
import { GENERATOR_TYPES, GENERATOR_TYPE_LABELS } from "../components/hc/nodes/generatorTypes";
export const PROJEKTARTEN = ["Neubau", "Umbau", "Sanierung", "Ersatz Wärmeerzeuger", "Aufstockung", "Mischprojekt"];
export const GEBAEUDETYPEN = ["MFH", "EFH", "Büro", "Gewerbe", "Schule", "Hotel", "Industrie", "Restaurant", "Schwimmhalle", "Spital", "Werkstatt"];
export const AUSBAUUMFAENGE = ["Vollausbau", "Grundausbau", "Mieterausbau", "nur Erzeugung", "nur Verteilung"];
export const ZERTIFIZIERUNGEN = ["Gesetz", "Minergie", "Minergie-P", "Minergie-Eco", "SNBS", "LEED"];

// Mehrfach-Auswahl mit denselben stabilen Codes wie LV-Import und Backend.
const HISTORISCHE_ERZEUGER = [
  { value: "gas", label: "Gas", aliases: ["Gas"] },
  { value: "oel", label: "Öl", aliases: ["Öl"] },
  { value: "solarthermie", label: "Solarthermie", aliases: ["Solarthermie"] },
];
export const WAERMEERZEUGER = GENERATOR_TYPES
  .filter((item) => item.value !== "hybrid")
  .map((item) => ({
    value: item.value,
    label: item.label,
    aliases: {
      ews_wp: ["Erdsonden-WP"], lwwp: ["Luft/Wasser-WP"],
      wasser_wp: ["Wasser/Wasser-WP"], fernwaerme: ["Fernwärme"],
      holz: ["Pellets/Holz"], solarthermie: ["Solarthermie"],
    }[item.value] || [],
  })).concat(HISTORISCHE_ERZEUGER);
export const waermeerzeugerLabel = (code) => GENERATOR_TYPE_LABELS[code]
  || HISTORISCHE_ERZEUGER.find((item) => item.value === code)?.label
  || code;
export const WAERMEABGABE = ["FBH", "Heizkörper", "TABS", "Deckenstrahlplatten", "Lufterhitzer", "Wandheizung", "Konvektoren"];

// Bohrmeter nur relevant, wenn ein Erdsonden-Kreislauf gewählt ist.
export const hasErdsonde = (arr) => (arr || []).some((e) => e === "ews_wp" || e.toLowerCase().includes("erdsonde"));

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
