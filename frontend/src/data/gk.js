// Grobkostenschätzung (BKP) — Labels, Farben, Formatierung.
// Enum-Werte müssen exakt zum Backend passen (models/grobkostenschaetzung.py).

// Nutzungen und Projektarten — dieselben Listen wie in der Auswertung
// (kv.js), denn die Grobkostenschätzung rechnet direkt auf deren Daten:
// der Hard-Filter vergleicht die Projektart wortwörtlich.
import { GEBAEUDETYPEN, PROJEKTARTEN as KV_PROJEKTARTEN } from "./kv";
export const NUTZUNGEN = GEBAEUDETYPEN.map((n) => ({ value: n, label: n }));
export const PROJEKTARTEN = KV_PROJEKTARTEN.map((p) => ({ value: p, label: p }));

export const WP_TYPEN = [
  { value: "sole", label: "Sole/Wasser-WP" },
  { value: "luft", label: "Luft/Wasser-WP" },
  { value: "wasser", label: "Wasser/Wasser-WP" },
];

export const ABGABEN = [
  { value: "FBH", label: "Fussbodenheizung" },
  { value: "HK", label: "Heizkörper" },
  { value: "gemischt", label: "Gemischt" },
  { value: "Luft", label: "Luft" },
];

// Reihenfolge + Farben (aus der zentralen Diagramm-Palette in index.css)
export const BKP_GRUPPEN = [
  { nr: "241", name: "Energielagerung", farbe: "bg-chart-2", farbeText: "text-chart-2", hex: "var(--color-chart-2)" },
  { nr: "242", name: "Wärmeerzeugung", farbe: "bg-chart-1", farbeText: "text-chart-1", hex: "var(--color-chart-1)" },
  { nr: "243", name: "Wärmeverteilung", farbe: "bg-chart-3", farbeText: "text-chart-3", hex: "var(--color-chart-3)" },
  { nr: "247", name: "Spezialanlagen", farbe: "bg-chart-4", farbeText: "text-chart-4", hex: "var(--color-chart-4)" },
  { nr: "248", name: "Dämmungen", farbe: "bg-chart-5", farbeText: "text-chart-5", hex: "var(--color-chart-5)" },
  { nr: "249", name: "Diverses", farbe: "bg-chart-6", farbeText: "text-chart-6", hex: "var(--color-chart-6)" },
];

export const gruppeInfo = (nr) => BKP_GRUPPEN.find((g) => g.nr === nr) || { nr, name: "", farbe: "bg-slate-400", hex: "#94a3b8" };

export const METHODE_LABEL = {
  weg_a: "Kennwert (Weg A)",
  potenzfunktion: "Potenzfunktion",
  weg_b: "Mengen (Weg B)",
  prozent_anteil: "%-Anteil",
};

export const label = (liste, value) => liste.find((e) => e.value === value)?.label || value;

// Schweizer Zahlenformat: CHF 190'751
export const chf = (n) =>
  n == null ? "–" : "CHF " + Math.round(n).toLocaleString("de-CH");
export const num = (n, dez = 0) =>
  n == null ? "–" : Number(n).toLocaleString("de-CH", { maximumFractionDigits: dez, minimumFractionDigits: 0 });
export const pct = (n, dez = 1) => (n == null ? "–" : num(n, dez) + " %");
