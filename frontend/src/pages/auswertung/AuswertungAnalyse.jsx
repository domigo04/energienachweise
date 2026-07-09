import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRefAnalyse } from "../../api/hcApi";
import BoxPlot from "../../components/charts/BoxPlot";

const fmt = (n) => Number(n).toLocaleString("de-CH", { maximumFractionDigits: n < 100 ? 1 : 0 });

export default function AuswertungAnalyse() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getRefAnalyse().then(setData).catch(() => setError("Analyse konnte nicht geladen werden"));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/auswertung" className="hover:text-brand-600">Auswertung</Link>
        <span>/</span>
        <span className="text-slate-800">Analyse</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Kennwert-Streuung</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kennwerte je BKP-Position über alle Referenzprojekte {data ? `(${data.anzahl})` : ""}. Box = P25–P75, Strich = Median, Punkt = Mittel.
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!data ? (
        <div className="py-16 text-center text-sm text-slate-400">Lade…</div>
      ) : data.kennwerte.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-sm text-slate-400">
          Noch keine auswertbaren Kennwerte. Erfasse Referenzprojekte mit BKP-Kosten und Bezugsgrössen.
        </div>
      ) : (
        <>
          <div className="card mb-6 overflow-x-auto p-4">
            <BoxPlot data={data.kennwerte} />
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="p-3">BKP</th><th className="p-3">Position</th><th className="p-3 text-right">n</th>
                  <th className="p-3 text-right">Median</th><th className="p-3 text-right">Ø</th><th className="p-3">Einheit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.kennwerte.map((k) => (
                  <tr key={k.bkp_nr}>
                    <td className="p-3 font-medium text-slate-700">{k.bkp_nr}</td>
                    <td className="p-3 text-slate-600">{k.bkp_name}</td>
                    <td className="p-3 text-right text-slate-500">{k.count}</td>
                    <td className="p-3 text-right text-slate-800">{fmt(k.median)}</td>
                    <td className="p-3 text-right font-semibold text-slate-900">{fmt(k.mean)}</td>
                    <td className="p-3 text-slate-400">{k.einheit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
