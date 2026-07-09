import { useState } from "react";

// Horizontale Balken je BKP-Position — Schätzung + Bandbreite (tief/hoch).
// Alle Werte in CHF → ein gemeinsamer Massstab ist hier sinnvoll. Hover auf
// einen Balken zeigt die exakten Zahlen.
export default function BarPlot({ data = [] }) {
  const [hover, setHover] = useState(null); // { i, x, y }
  if (!data.length) return <p className="p-4 text-sm text-slate-400">Keine Positionen.</p>;

  const rowH = 52, top = 14, W = 900, gutter = 84, right = 130;
  const trackL = gutter, trackR = W - right;
  const maxV = Math.max(...data.map((d) => d.high || d.estimate), 1) * 1.05;
  const H = top * 2 + data.length * rowH;
  const x = (v) => trackL + (v / maxV) * (trackR - trackL);
  const fmt = (n) => Math.round(n).toLocaleString("de-CH");

  const zeigen = (i, e) => setHover({ i, x: e.clientX, y: e.clientY });
  const verstecken = () => setHover(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
        {data.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const aktiv = hover?.i === i;
          return (
            <g key={r.bkp_nr} className="cursor-pointer" onMouseEnter={(e) => zeigen(i, e)} onMouseMove={(e) => zeigen(i, e)} onMouseLeave={verstecken}>
              <rect x="0" y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x="8" y={y + 5} className="fill-slate-700" fontSize="13" fontWeight="600">{r.bkp_nr}</text>
              <rect x={trackL} y={y - 11} width={Math.max(2, x(r.estimate) - trackL)} height="22" rx="4"
                className={aktiv ? "fill-brand-600" : "fill-brand-500"} />
              <line x1={x(r.low)} y1={y} x2={x(r.high)} y2={y} className={aktiv ? "stroke-slate-600" : "stroke-slate-400"} strokeWidth={aktiv ? 3 : 2} />
              <line x1={x(r.low)} y1={y - 6} x2={x(r.low)} y2={y + 6} className={aktiv ? "stroke-slate-600" : "stroke-slate-400"} strokeWidth={aktiv ? 3 : 2} />
              <line x1={x(r.high)} y1={y - 6} x2={x(r.high)} y2={y + 6} className={aktiv ? "stroke-slate-600" : "stroke-slate-400"} strokeWidth={aktiv ? 3 : 2} />
              <text x={trackR + 8} y={y + 4} className="fill-slate-600" fontSize="12">{fmt(r.estimate)}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="mb-1 font-semibold text-slate-800">{data[hover.i].bkp_nr} · {data[hover.i].bkp_name}</div>
          <div className="space-y-0.5 text-slate-600">
            <div>Tief: <span className="font-medium text-slate-900">{fmt(data[hover.i].low)} CHF</span></div>
            <div>Schätzung: <span className="font-medium text-brand-600">{fmt(data[hover.i].estimate)} CHF</span></div>
            <div>Hoch: <span className="font-medium text-slate-900">{fmt(data[hover.i].high)} CHF</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
