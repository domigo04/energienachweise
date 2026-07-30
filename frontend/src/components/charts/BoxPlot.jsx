// Boxplot für EINE Kennwert-Zeile, gezeichnet auf der eigenen Skala dieser
// Zeile — die Einheiten je BKP-Position sind verschieden (CHF/m², CHF/kW …),
// ein gemeinsamer Massstab wäre irreführend. Der Balken zeigt nur die Form der
// Streuung; die exakten Zahlen stehen als Spalten daneben, darum braucht es
// hier weder Tooltip noch Achse.
const W = 200, H = 18, MITTE = H / 2;

export default function BoxPlot({ min, q1, median, q3, max, mean, gedaempft = false }) {
  const spanne = (max - min) || Math.abs(mean) || 1;
  const a = min - spanne * 0.08;
  const b = max + spanne * 0.08;
  const x = (v) => ((v - a) / (b - a)) * W;

  const linie = gedaempft ? "stroke-slate-200" : "stroke-slate-300";
  const box = gedaempft ? "fill-slate-50 stroke-slate-200" : "fill-slate-100 stroke-slate-400";
  const strich = gedaempft ? "stroke-slate-400" : "stroke-slate-800";
  const punkt = gedaempft ? "fill-slate-300" : "fill-brand-600";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img"
      aria-label={`Streuung ${min} bis ${max}, Median ${median}`}>
      <line x1={x(min)} y1={MITTE} x2={x(max)} y2={MITTE} className={linie} strokeWidth="1.5" />
      <line x1={x(min)} y1={MITTE - 4} x2={x(min)} y2={MITTE + 4} className={linie} strokeWidth="1.5" />
      <line x1={x(max)} y1={MITTE - 4} x2={x(max)} y2={MITTE + 4} className={linie} strokeWidth="1.5" />
      <rect x={x(q1)} y={MITTE - 6} width={Math.max(1.5, x(q3) - x(q1))} height="12" className={box} strokeWidth="1" />
      <line x1={x(median)} y1={MITTE - 7} x2={x(median)} y2={MITTE + 7} className={strich} strokeWidth="1.5" />
      <circle cx={x(mean)} cy={MITTE} r="2.5" className={punkt} />
    </svg>
  );
}
