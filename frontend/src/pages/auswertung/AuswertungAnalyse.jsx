import { Fragment, useEffect, useMemo, useState } from "react";
import { getRefAnalyse, getRefKatalog } from "../../api/hcApi";
import BoxPlot from "../../components/charts/BoxPlot";
import PageHeader from "../../components/ui/PageHeader";
import GewerkLeiste from "../../components/ui/GewerkLeiste";
import { LEER, zahl } from "../../lib/format";

// Unter dieser Anzahl Projekte ist ein Kennwert nicht belastbar — die Zeile
// wird zurückgenommen, damit niemand aus einem einzelnen Projekt einen
// «Erfahrungswert» liest.
const DUENN = 3;

const kw = (n) => zahl(n, Number(n) < 100 ? 1 : 0);
// Streuung als Anteil des Medians: die Zahl, die sagt, ob ein Kennwert taugt.
const streuung = (k) => (k.median > 0 ? ((k.q3 - k.q1) / k.median) * 100 : null);

export default function AuswertungAnalyse() {
  const [data, setData] = useState(null);
  const [gruppenNamen, setGruppenNamen] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    getRefAnalyse().then(setData).catch(() => setError("Analyse konnte nicht geladen werden"));
    getRefKatalog().then((k) => setGruppenNamen(k.gruppen || {})).catch(() => {});
  }, []);

  // Nach BKP-Gruppe bündeln — dieselbe Gliederung wie im Erfassungsformular.
  const gruppen = useMemo(() => {
    const map = new Map();
    for (const k of data?.kennwerte || []) {
      const nr = String(k.bkp_nr).split(".")[0];
      if (!map.has(nr)) map.set(nr, []);
      map.get(nr).push(k);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de", { numeric: true }));
  }, [data]);

  return (
    <div className="px-5 py-7 lg:px-10 xl:px-12">
      <PageHeader
        back={{ to: "/auswertung", label: "Auswertung" }}
        title="Kennwert-Streuung"
        subtitle={`Kennwerte je BKP-Position${data ? ` über ${data.anzahl} Referenzprojekte` : ""}.`}
      />

      <GewerkLeiste aktiv="heizung" className="mb-5" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!data ? (
        <div className="py-16 text-center text-sm text-slate-400">Lade…</div>
      ) : data.kennwerte.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          {data.anzahl === 0
            ? "Noch keine Referenzprojekte erfasst."
            : `${data.anzahl} Referenzprojekte vorhanden, aber keines hat BKP-Kosten und Bezugsgrössen — ohne beides gibt es keinen Kennwert.`}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="whitespace-nowrap py-2 pl-3 pr-3">BKP</th>
                  <th className="w-full py-2 pr-3">Position</th>
                  <th className="whitespace-nowrap py-2 pr-3">Einheit</th>
                  <th className="whitespace-nowrap py-2 pr-3 text-right">n</th>
                  <th className="whitespace-nowrap py-2 pr-3 text-right">Median</th>
                  <th className="whitespace-nowrap py-2 pr-3 text-right">Ø</th>
                  <th className="whitespace-nowrap py-2 pr-3 text-right">Streuung</th>
                  <th className="whitespace-nowrap py-2 pr-3">Verteilung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gruppen.map(([nr, zeilen]) => (
                  <Fragment key={nr}>
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="py-1.5 pl-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {nr} {gruppenNamen[nr] || ""}
                      </td>
                    </tr>
                    {zeilen.map((k) => {
                      const duenn = k.count < DUENN;
                      const s = streuung(k);
                      return (
                        <tr key={k.bkp_nr} className={duenn ? "text-slate-400" : ""}>
                          <td className="whitespace-nowrap py-2 pl-3 pr-3 font-medium tabular-nums text-slate-700">{k.bkp_nr}</td>
                          <td className="max-w-0 truncate py-2 pr-3 text-slate-600">{k.bkp_name}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-slate-400">{k.einheit}</td>
                          <td
                            className={"py-2 pr-3 text-right tabular-nums " + (duenn ? "font-semibold text-amber-700" : "text-slate-500")}
                            title={duenn ? `Nur ${k.count} Projekt(e) — als Erfahrungswert nicht belastbar.` : undefined}
                          >
                            {k.count}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-800">{kw(k.median)}</td>
                          <td className={"py-2 pr-3 text-right font-medium tabular-nums " + (duenn ? "" : "text-slate-900")}>{kw(k.mean)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                            {s == null ? LEER : `${zahl(s)} %`}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2 text-[11px] tabular-nums text-slate-400">
                              <span className="w-14 text-right">{kw(k.min)}</span>
                              <BoxPlot {...k} gedaempft={duenn} />
                              <span className="w-14">{kw(k.max)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Box P25–P75 · Strich Median · Punkt Ø · eigene Skala je Zeile ·
            Streuung = (P75−P25) / Median · unter {DUENN} Projekten zurückgenommen
          </p>
        </>
      )}
    </div>
  );
}
