import { zahl } from "../../lib/format";

// Schlichtes Balkendiagramm für Resultate: eine Zeile je Wert, Länge relativ
// zum grössten Wert. Bewusst reines SVG-freies Markup — es braucht keine
// Achsen, keine Legende und keine Bibliothek, um drei Zahlen zu vergleichen.
//
//   werte = [{ label, wert, farbe?, hinweis? }]
const FARBEN = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-6)"];

export default function Balken({ werte, einheit = "", dezimalen = 0 }) {
  const gefiltert = (werte || []).filter((w) => Number.isFinite(Number(w.wert)));
  if (!gefiltert.length) return null;
  const max = Math.max(...gefiltert.map((w) => Math.abs(Number(w.wert))));

  return (
    <div className="space-y-2.5">
      {gefiltert.map((w, i) => {
        const anteil = max > 0 ? (Math.abs(Number(w.wert)) / max) * 100 : 0;
        return (
          <div key={w.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-slate-600">{w.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-slate-800">
                {zahl(w.wert, dezimalen)}
                {einheit && <span className="ml-1 text-slate-400">{einheit}</span>}
              </span>
            </div>
            <div className="mt-1 h-2.5 bg-slate-100">
              <div className="h-full transition-all"
                style={{ width: `${anteil}%`, background: w.farbe || FARBEN[i % FARBEN.length] }} />
            </div>
            {w.hinweis && <div className="mt-0.5 text-[11px] text-slate-400">{w.hinweis}</div>}
          </div>
        );
      })}
    </div>
  );
}
