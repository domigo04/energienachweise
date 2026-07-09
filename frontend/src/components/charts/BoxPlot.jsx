// Horizontaler Boxplot je BKP-Position. Jede Zeile hat ihre EIGENE Skala
// (die Einheiten unterscheiden sich: CHF/kW, CHF/m² …) → zeigt die Streuung
// je Position, nicht einen gemeinsamen Massstab.
export default function BoxPlot({ data = [] }) {
  if (!data.length) return <p className="p-4 text-sm text-slate-400">Noch keine Daten.</p>;

  const rowH = 48, top = 10, W = 820, gutter = 100, right = 160;
  const trackL = gutter, trackR = W - right;
  const H = top * 2 + data.length * rowH;
  const fmt = (n) => Number(n).toLocaleString("de-CH", { maximumFractionDigits: n < 100 ? 1 : 0 });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {data.map((r, i) => {
        const y = top + i * rowH + rowH / 2;
        const range = (r.max - r.min) || Math.abs(r.mean) || 1;
        const a = r.min - range * 0.1;
        const b = r.max + range * 0.1;
        const x = (v) => trackL + ((v - a) / (b - a || 1)) * (trackR - trackL);
        return (
          <g key={r.bkp_nr}>
            <text x="8" y={y - 3} className="fill-slate-700" fontSize="13" fontWeight="600">{r.bkp_nr}</text>
            <text x="8" y={y + 13} className="fill-slate-400" fontSize="10">{r.einheit}</text>

            <line x1={x(r.min)} y1={y} x2={x(r.max)} y2={y} className="stroke-slate-300" strokeWidth="2" />
            <line x1={x(r.min)} y1={y - 6} x2={x(r.min)} y2={y + 6} className="stroke-slate-300" strokeWidth="2" />
            <line x1={x(r.max)} y1={y - 6} x2={x(r.max)} y2={y + 6} className="stroke-slate-300" strokeWidth="2" />

            <rect x={x(r.q1)} y={y - 10} width={Math.max(2, x(r.q3) - x(r.q1))} height="20" rx="3"
              className="fill-brand-100 stroke-brand-400" strokeWidth="1.5" />
            <line x1={x(r.median)} y1={y - 12} x2={x(r.median)} y2={y + 12} className="stroke-slate-800" strokeWidth="2" />
            <circle cx={x(r.mean)} cy={y} r="4.5" className="fill-amber-500 stroke-white" strokeWidth="1.5" />

            <text x={trackR + 12} y={y - 1} className="fill-slate-700" fontSize="12" fontWeight="600">Ø {fmt(r.mean)}</text>
            <text x={trackR + 12} y={y + 13} className="fill-slate-400" fontSize="10">{fmt(r.min)}–{fmt(r.max)}</text>
          </g>
        );
      })}
    </svg>
  );
}
