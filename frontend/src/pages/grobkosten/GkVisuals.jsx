// Grobkostenschätzung — kleine gemeinsame UI-Bausteine. Bewusst schlicht
// (Dominic: «lieber simple als überrissen») — die Rechenweg-Erklärung ist
// Text mit echten Zahlen, keine grossen Diagramme.
import { chf } from "../../data/gk";

export function VertrauenBadge({ stufe }) {
  const cls = { hoch: "badge-hoch", mittel: "badge-mittel", niedrig: "badge-tief" }[stufe]
    || "badge bg-slate-100 text-slate-500";
  return <span className={cls}>{stufe}</span>;
}

// Gestapelter Gesamtbalken über alle BKP-Gruppen (eine Zeile, mit Legende).
export function GruppenStapel({ ergebnisse, gruppeInfo }) {
  const total = ergebnisse.reduce((s, e) => s + e.betrag, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-lg">
        {ergebnisse.filter((e) => e.betrag > 0).map((e) => (
          <div
            key={e.bkp_gruppe}
            className={`${gruppeInfo(e.bkp_gruppe).farbe} flex items-center justify-center overflow-hidden`}
            style={{ width: `${(e.betrag / total) * 100}%` }}
            title={`BKP ${e.bkp_gruppe}: ${chf(e.betrag)}`}
          >
            {e.betrag / total > 0.08 && (
              <span className="truncate px-1 text-[11px] font-semibold text-white">{e.bkp_gruppe}</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {ergebnisse.filter((e) => e.betrag > 0).map((e) => (
          <span key={e.bkp_gruppe} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-sm ${gruppeInfo(e.bkp_gruppe).farbe}`} />
            {e.bkp_gruppe} {gruppeInfo(e.bkp_gruppe).name}
          </span>
        ))}
      </div>
    </div>
  );
}
