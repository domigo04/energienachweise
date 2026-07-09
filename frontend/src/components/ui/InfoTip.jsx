import { Info } from "lucide-react";

// Kleines "i"-Icon mit Erklärungstext als Popover bei Hover/Fokus — für
// Formel-/Berechnungs-Erklärungen im KV-Tool (Dominic will, dass Nutzer dem
// Ergebnis vertrauen können, weil sie den Rechenweg sehen).
export default function InfoTip({ text, className = "" }) {
  if (!text) return null;
  return (
    <span className={"group relative inline-flex " + className}>
      <Info className="size-3.5 shrink-0 cursor-help text-slate-400 hover:text-brand-600" strokeWidth={2.5} tabIndex={0} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs font-normal leading-snug text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
