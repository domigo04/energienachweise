import { useState } from "react";

// Horizontaler Boxplot je BKP-Position. Jede Zeile hat ihre EIGENE Skala
// (die Einheiten unterscheiden sich: CHF/kW, CHF/m² …) → zeigt die Streuung
// je Position, nicht einen gemeinsamen Massstab. Hover auf Box/Punkt/Whisker
// zeigt die exakten Zahlen.
export default function BoxPlot({ data = [] }) {
  const [hover, setHover] = useState(null); // { i, x, y }
  if (!data.length) return <p className="p-4 text-sm text-slate-400">Noch keine Daten.</p>;

  const rowH = 64, top = 14, W = 900, gutter = 110, right = 170;
  const trackL = gutter, trackR = W - right;
  const H = top * 2 + data.length * rowH;
  const fmt = (n) => Number(n).toLocaleString("de-CH", { maximumFractionDigits: n < 100 ? 1 : 0 });

  const zeigen = (i, e) => setHover({ i, x: e.clientX, y: e.clientY });
  const verstecken = () => setHover(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
        {data.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const range = (r.max - r.min) || Math.abs(r.mean) || 1;
          const a = r.min - range * 0.1;
          const b = r.max + range * 0.1;
          const x = (v) => trackL + ((v - a) / (b - a || 1)) * (trackR - trackL);
          const aktiv = hover?.i === i;
          return (
            <g key={r.bkp_nr} className="cursor-pointer" onMouseEnter={(e) => zeigen(i, e)} onMouseMove={(e) => zeigen(i, e)} onMouseLeave={verstecken}>
              {/* unsichtbarer breiter Hover-Bereich über die ganze Zeile */}
              <rect x="0" y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x="8" y={y - 5} className="fill-slate-700" fontSize="14" fontWeight="600">{r.bkp_nr}</text>
              <text x="8" y={y + 14} className="fill-slate-400" fontSize="11">{r.einheit}</text>

              <line x1={x(r.min)} y1={y} x2={x(r.max)} y2={y} className={aktiv ? "stroke-brand-400" : "stroke-slate-300"} strokeWidth={aktiv ? 3 : 2} />
              <line x1={x(r.min)} y1={y - 7} x2={x(r.min)} y2={y + 7} className={aktiv ? "stroke-brand-400" : "stroke-slate-300"} strokeWidth={aktiv ? 3 : 2} />
              <line x1={x(r.max)} y1={y - 7} x2={x(r.max)} y2={y + 7} className={aktiv ? "stroke-brand-400" : "stroke-slate-300"} strokeWidth={aktiv ? 3 : 2} />

              <rect x={x(r.q1)} y={y - 13} width={Math.max(2, x(r.q3) - x(r.q1))} height="26" rx="4"
                className={aktiv ? "fill-brand-200 stroke-brand-500" : "fill-brand-100 stroke-brand-400"} strokeWidth={aktiv ? 2.5 : 1.5} />
              <line x1={x(r.median)} y1={y - 15} x2={x(r.median)} y2={y + 15} className="stroke-slate-800" strokeWidth="2" />
              <circle cx={x(r.mean)} cy={y} r={aktiv ? 6.5 : 5.5} className="fill-amber-500 stroke-white" strokeWidth="2" />

              <text x={trackR + 12} y={y - 2} className="fill-slate-700" fontSize="13" fontWeight="600">Ø {fmt(r.mean)}</text>
              <text x={trackR + 12} y={y + 15} className="fill-slate-400" fontSize="11">{fmt(r.min)}–{fmt(r.max)}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="mb-1 font-semibold text-slate-800">{data[hover.i].bkp_nr} · {data[hover.i].einheit}</div>
          <div className="space-y-0.5 text-slate-600">
            <div>Minimum: <span className="font-medium text-slate-900">{fmt(data[hover.i].min)}</span></div>
            <div>P25: <span className="font-medium text-slate-900">{fmt(data[hover.i].q1)}</span></div>
            <div>Median: <span className="font-medium text-slate-900">{fmt(data[hover.i].median)}</span></div>
            <div>P75: <span className="font-medium text-slate-900">{fmt(data[hover.i].q3)}</span></div>
            <div>Maximum: <span className="font-medium text-slate-900">{fmt(data[hover.i].max)}</span></div>
            <div>Gewichteter Mittelwert: <span className="font-medium text-amber-600">{fmt(data[hover.i].mean)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
