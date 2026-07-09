// Horizontale Balken je BKP-Position — Schätzung + Bandbreite (tief/hoch).
// Alle Werte in CHF → ein gemeinsamer Massstab ist hier sinnvoll.
export default function BarPlot({ data = [] }) {
  if (!data.length) return <p className="p-4 text-sm text-slate-400">Keine Positionen.</p>;

  const rowH = 40, top = 10, W = 820, gutter = 74, right = 120;
  const trackL = gutter, trackR = W - right;
  const maxV = Math.max(...data.map((d) => d.high || d.estimate), 1) * 1.05;
  const H = top * 2 + data.length * rowH;
  const x = (v) => trackL + (v / maxV) * (trackR - trackL);
  const fmt = (n) => Math.round(n).toLocaleString("de-CH");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {data.map((r, i) => {
        const y = top + i * rowH + rowH / 2;
        return (
          <g key={r.bkp_nr}>
            <text x="8" y={y + 4} className="fill-slate-700" fontSize="12" fontWeight="600">{r.bkp_nr}</text>
            <rect x={trackL} y={y - 9} width={Math.max(2, x(r.estimate) - trackL)} height="18" rx="3" className="fill-brand-500" />
            <line x1={x(r.low)} y1={y} x2={x(r.high)} y2={y} className="stroke-slate-400" strokeWidth="2" />
            <line x1={x(r.low)} y1={y - 5} x2={x(r.low)} y2={y + 5} className="stroke-slate-400" strokeWidth="2" />
            <line x1={x(r.high)} y1={y - 5} x2={x(r.high)} y2={y + 5} className="stroke-slate-400" strokeWidth="2" />
            <text x={trackR + 8} y={y + 4} className="fill-slate-600" fontSize="11">{fmt(r.estimate)}</text>
          </g>
        );
      })}
    </svg>
  );
}
