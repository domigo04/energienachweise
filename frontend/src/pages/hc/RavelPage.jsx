import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../../api";
import PageHeader from "../../components/ui/PageHeader";

const ENERGIETRAEGER_STEIGERUNG = {
  "Öl": 2.5, "Gas": 2.5, "Wärmepumpe (Strom)": 1.5,
  "Holzpellets": 2.0, "Fernwärme": 2.0, "Strom allgemein": 1.5,
};

const VARIANTE_DEFAULT = {
  name: "", investition: "", nutzungsdauer: 20, zinssatz_pct: 3.0,
  betrieb_pa: "", betrieb_steigerung_pct: 2.0,
  energie_pa: "", energie_steigerung_pct: 2.5,
};

// Varianten-Farben aus der Diagramm-Palette (index.css) — gut unterscheidbar,
// markenkonform.
const FARBEN = ["#dc2626", "#0d9488", "#0284c7", "#d97706", "#4f46e5", "#64748b"];
// Kostenarten im Balken: Kapital / Betrieb / Energie
const SEG = { kapital: "#0284c7", betrieb: "#0d9488", energie: "#d97706" };

const fmt = (n, dec = 0) => (n != null ? Number(n).toLocaleString("de-CH", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—");
const chf = (n) => (n != null ? `CHF ${fmt(n)}` : "—");

export default function RavelPage() {
  const [varianten, setVarianten] = useState([
    { ...VARIANTE_DEFAULT, name: "Variante 1", energie_steigerung_pct: 2.5 },
    { ...VARIANTE_DEFAULT, name: "Variante 2", energie_steigerung_pct: 2.5 },
  ]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setV = (i, field, val) => {
    setVarianten((prev) => prev.map((v, j) => (j === i ? { ...v, [field]: val } : v)));
  };

  const addVariante = () => {
    if (varianten.length >= 6) return;
    setVarianten((prev) => [...prev, { ...VARIANTE_DEFAULT, name: `Variante ${prev.length + 1}` }]);
  };

  const removeVariante = (i) => {
    setVarianten((prev) => prev.filter((_, j) => j !== i));
    setResults(null);
  };

  const berechne = async () => {
    setLoading(true);
    setError("");
    try {
      const body = {
        varianten: varianten.map((v) => ({
          name: v.name || "Ohne Name",
          investition: parseFloat(v.investition) || 0,
          nutzungsdauer: parseInt(v.nutzungsdauer) || 20,
          zinssatz_pct: parseFloat(v.zinssatz_pct) || 3.0,
          betrieb_pa: parseFloat(v.betrieb_pa) || 0,
          betrieb_steigerung_pct: parseFloat(v.betrieb_steigerung_pct) || 2.0,
          energie_pa: parseFloat(v.energie_pa) || 0,
          energie_steigerung_pct: parseFloat(v.energie_steigerung_pct) || 2.5,
        })),
      };
      const r = await api.post("/api/v1/ravel/berechnen", body);
      setResults(r.data);
    } catch {
      setError("Berechnung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const rangColor = (rang) => (rang === 1 ? "text-green-600" : "text-slate-600");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <PageHeader
        back={{ to: "/start", label: "Start" }}
        title="RAVEL-Wirtschaftlichkeitsvergleich"
        subtitle="Dynamische Annuitätenmethode nach RAVEL-Leitfaden — bis 6 Varianten parallel (M10)."
      />

      {/* Varianten-Eingabe */}
      <div className="card mb-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 700 }}>
          <thead>
            <tr className="bg-slate-50">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500" style={{ width: 180 }}>Feld</th>
              {varianten.map((v, i) => (
                <th key={i} className="px-3 py-2.5" style={{ width: 160 }}>
                  <div className="flex items-center justify-between gap-1">
                    <input className="w-full border-none bg-transparent p-0 text-sm font-semibold outline-none" style={{ color: FARBEN[i] }}
                      value={v.name} onChange={(e) => setV(i, "name", e.target.value)} />
                    {varianten.length > 1 && (
                      <button onClick={() => removeVariante(i)} className="text-slate-300 transition hover:text-red-500" title="Variante entfernen">
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Investition & Laufzeit" span={varianten.length} />
            <InputRow label="Investition [CHF]" field="investition" varianten={varianten} setV={setV} step={100} placeholder="z.B. 25000" />
            <InputRow label="Nutzungsdauer [Jahre]" field="nutzungsdauer" varianten={varianten} setV={setV} step={1} placeholder="20" />
            <InputRow label="Zinssatz i [%]" field="zinssatz_pct" varianten={varianten} setV={setV} step={0.1} placeholder="3.0" />

            <SectionRow label="Betriebskosten" span={varianten.length} />
            <InputRow label="Betriebskosten/Jahr [CHF]" field="betrieb_pa" varianten={varianten} setV={setV} step={50} placeholder="z.B. 500" />
            <InputRow label="Preissteigerung Betrieb [%]" field="betrieb_steigerung_pct" varianten={varianten} setV={setV} step={0.1} placeholder="2.0" />

            <SectionRow label="Energiekosten" span={varianten.length} />
            <InputRow label="Energiekosten/Jahr [CHF]" field="energie_pa" varianten={varianten} setV={setV} step={50} placeholder="z.B. 2400" />
            <tr className="border-b border-slate-100">
              <td className="px-3 py-2 align-top text-slate-600">
                Preissteigerung Energie [%]
                <div className="mt-0.5 text-xs text-slate-400">Öl/Gas ~2.5 %, WP ~1.5 %, Holz ~2.0 %</div>
              </td>
              {varianten.map((v, i) => (
                <td key={i} className="px-3 py-2 text-center">
                  <input type="number" step={0.1} className="input px-2.5 py-1.5" value={v.energie_steigerung_pct}
                    onChange={(e) => setV(i, "energie_steigerung_pct", e.target.value)} />
                  <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                    {Object.entries(ENERGIETRAEGER_STEIGERUNG).slice(0, 3).map(([kk, val]) => (
                      <button key={kk} onClick={() => setV(i, "energie_steigerung_pct", val)}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:bg-slate-100">
                        {kk.split(" ")[0]}: {val}%
                      </button>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Knöpfe */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button onClick={berechne} disabled={loading} className="btn-primary">
          {loading ? "Berechne…" : "Vergleich berechnen"}
        </button>
        {varianten.length < 6 && (
          <button onClick={addVariante} className="btn-secondary"><Plus className="size-4" /> Variante hinzufügen</button>
        )}
        <span className="text-xs text-slate-400">{varianten.length}/6 Varianten</span>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Resultate */}
      {results && (
        <div>
          {/* Günstigste Variante */}
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <span className="text-2xl">🏆</span>
            <div>
              <div className="font-bold text-green-700">{results.guenstigste}</div>
              <div className="text-xs text-green-600">Günstigste Variante nach mittleren Jahreskosten</div>
            </div>
          </div>

          {/* Vergleichstabelle */}
          <h2 className="mb-3 font-semibold text-slate-800">Mittlere Jahreskosten (MJK)</h2>
          <div className="card mb-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5 text-left">Kostenart</th>
                  {results.varianten.map((v, i) => (
                    <th key={i} className="px-4 py-2.5 text-right">
                      <div className="text-slate-700">{v.name}</div>
                      <div className="font-normal text-slate-400">Rang {v.rang}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <MjkRow label="Investition" val={(v) => chf(v.investition)} vs={results.varianten} />
                <MjkRow label="Nutzungsdauer / Zinssatz" val={(v) => `${v.nutzungsdauer} J. / ${v.zinssatz_pct}%`} vs={results.varianten} muted />
                <MjkRow label="Annuitätsfaktor a" val={(v) => v.annuitaetsfaktor} vs={results.varianten} muted />
                <MjkRow label="Kapitalkosten (K = Invest × a)" val={(v) => chf(v.kapitalkosten)} vs={results.varianten} />
                <MjkRow label="Mittl. Betriebskosten" val={(v) => chf(v.betrieb_mittel)} vs={results.varianten} />
                <MjkRow label="Mittl. Energiekosten" val={(v) => chf(v.energie_mittel)} vs={results.varianten} />
                <tr className="border-t-2 border-brand-200 bg-brand-50/50 font-bold">
                  <td className="px-4 py-3 text-slate-800">Mittlere Jahreskosten (MJK)</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} className={"px-4 py-3 text-right font-mono tabular-nums " + rangColor(v.rang)}>
                      {chf(v.mjk)}
                      <div className={"text-xs font-normal " + rangColor(v.rang)}>Rang {v.rang}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Balkendiagramm */}
          <h2 className="mb-3 font-semibold text-slate-800">Kostenstruktur im Vergleich</h2>
          <div className="card p-5">
            {results.varianten.map((v, i) => {
              const max = Math.max(...results.varianten.map((x) => x.mjk));
              const w = (val) => (max > 0 ? (val / max) * 100 : 0);
              return (
                <div key={i} className="mb-4 last:mb-0">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold text-slate-700">{v.rang}. {v.name}</span>
                    <span className="font-mono font-semibold text-slate-800">{chf(v.mjk)} / Jahr</span>
                  </div>
                  <div className="flex h-6 overflow-hidden rounded-lg bg-slate-100">
                    <div className="transition-all" style={{ width: `${w(v.kapitalkosten)}%`, background: SEG.kapital }} title={`Kapital: ${chf(v.kapitalkosten)}`} />
                    <div className="transition-all" style={{ width: `${w(v.betrieb_mittel)}%`, background: SEG.betrieb }} title={`Betrieb: ${chf(v.betrieb_mittel)}`} />
                    <div className="transition-all" style={{ width: `${w(v.energie_mittel)}%`, background: SEG.energie }} title={`Energie: ${chf(v.energie_mittel)}`} />
                  </div>
                </div>
              );
            })}
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: SEG.kapital }} />Kapital</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: SEG.betrieb }} />Betrieb</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: SEG.energie }} />Energie</span>
            </div>
          </div>

          {/* Warnungen */}
          {results.varianten.some((v) => v.warnings?.length > 0) && (
            <div className="mt-4 space-y-2">
              {results.varianten.filter((v) => v.warnings?.length > 0).map((v, i) =>
                v.warnings.map((w, j) => (
                  <div key={`${i}-${j}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {v.name}: {w}</div>
                ))
              )}
            </div>
          )}

          {/* Methodik */}
          <div className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
            <strong className="text-slate-600">Methodik:</strong> Dynamische Annuitätenmethode nach RAVEL-Leitfaden (BfK, 1994)<br />
            a = i·(1+i)^n / ((1+i)^n − 1) | m = a·[1−(1+r)^−n] / r wobei r = (i−e)/(1+e)<br />
            MJK = K_Kapital + B_mittel + E_mittel
          </div>
        </div>
      )}
    </div>
  );
}

function SectionRow({ label, span }) {
  return (
    <tr className="bg-slate-100/70">
      <td colSpan={span + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</td>
    </tr>
  );
}

function InputRow({ label, field, varianten, setV, step = 1, placeholder = "" }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 text-slate-600">{label}</td>
      {varianten.map((v, i) => (
        <td key={i} className="px-3 py-2 text-center">
          <input type="number" step={step} className="input px-2.5 py-1.5" value={v[field]}
            onChange={(e) => setV(i, field, e.target.value)} placeholder={placeholder} />
        </td>
      ))}
    </tr>
  );
}

function MjkRow({ label, val, vs, muted }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="px-4 py-2 text-slate-600">{label}</td>
      {vs.map((v, i) => (
        <td key={i} className={"px-4 py-2 text-right font-mono tabular-nums " + (muted ? "text-slate-400" : "text-slate-700")}>{val(v)}</td>
      ))}
    </tr>
  );
}
