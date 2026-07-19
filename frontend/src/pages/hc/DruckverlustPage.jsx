import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../../api";
import PageHeader from "../../components/ui/PageHeader";

const DEFAULT_KREISE = [
  {
    name: "Verbraucher Pumpe",
    rohrlange_m: 120,
    druckgefaelle_pam: 70,
    apparate: [
      { name: "AB-PM", anzahl: 0, dp_kpa: 0 },
      { name: "STAD", anzahl: 0, dp_kpa: 0 },
      { name: "FBH Kreis", anzahl: 0, dp_kpa: 0 },
      { name: "Wärmezähler", anzahl: 0, dp_kpa: 0 },
      { name: "Ventil", anzahl: 0, dp_kpa: 0 },
      { name: "Absperrklappe", anzahl: 5, dp_kpa: 0.2 },
      { name: "Sonstiges", anzahl: 0, dp_kpa: 0 },
    ],
  },
  {
    name: "Erzeuger Pumpe",
    rohrlange_m: 20,
    druckgefaelle_pam: 70,
    apparate: [
      { name: "STAD", anzahl: 1, dp_kpa: 3 },
      { name: "Wärmezähler BWW", anzahl: 1, dp_kpa: 8 },
      { name: "Umschaltventil", anzahl: 1, dp_kpa: 1 },
      { name: "PWT / Speicher", anzahl: 1, dp_kpa: 12 },
      { name: "Sonstiges", anzahl: 0, dp_kpa: 0 },
    ],
  },
  {
    name: "Sole Pumpe",
    rohrlange_m: 0,
    druckgefaelle_pam: 70,
    apparate: [
      { name: "STAD", anzahl: 1, dp_kpa: 5 },
      { name: "Wärmezähler Sole", anzahl: 1, dp_kpa: 20 },
      { name: "Umschaltventil", anzahl: 1, dp_kpa: 4 },
      { name: "PWT", anzahl: 1, dp_kpa: 19 },
      { name: "EWS (Erdsonde)", anzahl: 1, dp_kpa: 77 },
      { name: "Sonstiges", anzahl: 0, dp_kpa: 0 },
    ],
  },
];

function NumInput({ value, onChange, placeholder = "0" }) {
  return (
    <input type="number" step="0.1" min="0" className="input px-2.5 py-1.5"
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  );
}

export default function DruckverlustPage() {
  const [kreise, setKreise] = useState(DEFAULT_KREISE);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(0);

  const updateKreis = (ki, field, val) => {
    setKreise((prev) => prev.map((k, i) => (i === ki ? { ...k, [field]: val } : k)));
  };

  const updateApparat = (ki, ai, field, val) => {
    setKreise((prev) => prev.map((k, i) => {
      if (i !== ki) return k;
      return { ...k, apparate: k.apparate.map((a, j) => (j === ai ? { ...a, [field]: val } : a)) };
    }));
  };

  const addApparat = (ki) => {
    setKreise((prev) => prev.map((k, i) => (i === ki
      ? { ...k, apparate: [...k.apparate, { name: "Neu", anzahl: 1, dp_kpa: 0 }] }
      : k)));
  };

  const removeApparat = (ki, ai) => {
    setKreise((prev) => prev.map((k, i) => (i === ki
      ? { ...k, apparate: k.apparate.filter((_, j) => j !== ai) }
      : k)));
  };

  const berechne = async () => {
    setLoading(true);
    setError("");
    try {
      const body = {
        kreise: kreise.map((k) => ({
          name: k.name,
          rohrlange_m: parseFloat(k.rohrlange_m) || 0,
          druckgefaelle_pam: parseFloat(k.druckgefaelle_pam) || 70,
          apparate: k.apparate
            .filter((a) => parseFloat(a.anzahl) > 0 || parseFloat(a.dp_kpa) > 0)
            .map((a) => ({ name: a.name, anzahl: parseFloat(a.anzahl) || 0, dp_kpa: parseFloat(a.dp_kpa) || 0 })),
        })),
      };
      const r = await api.post("/api/v1/druckverlust/berechnen", body);
      setResults(r.data.kreise);
    } catch {
      setError("Berechnung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const k = kreise[activeTab];
  const res = results?.[activeTab];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <PageHeader
        back={{ to: "/start", label: "Start" }}
        title="Druckverlust approximativ"
        subtitle="Rohrsystem + Apparate je Pumpenkreis — nach deinem Excel-Blatt (M4)."
      />

      {/* Tabs (Pumpenkreise) */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {kreise.map((kr, i) => (
          <button key={i} onClick={() => setActiveTab(i)}
            className={"rounded-lg px-4 py-2 text-sm font-semibold transition " +
              (activeTab === i ? "bg-brand-600 text-white shadow-sm" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {kr.name}
            {results?.[i] && <span className="ml-2 opacity-80">{results[i].total_kpa} kPa</span>}
          </button>
        ))}
      </div>

      {/* Aktiver Kreis */}
      <div className="card mb-5 overflow-hidden">
        {/* Rohrsystem */}
        <div className="border-b border-slate-100 bg-slate-50 p-5">
          <div className="mb-3 font-semibold text-slate-800">Rohrsystem</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Länge VL+RL [m]</label>
              <NumInput value={k.rohrlange_m} onChange={(v) => updateKreis(activeTab, "rohrlange_m", v)} />
            </div>
            <div>
              <label className="label">Dimensioniert auf [Pa/m]</label>
              <NumInput value={k.druckgefaelle_pam} onChange={(v) => updateKreis(activeTab, "druckgefaelle_pam", v)} placeholder="70" />
              <p className="mt-1 text-xs text-slate-400">Typisch: 70–100 Pa/m</p>
            </div>
          </div>
          {k.rohrlange_m > 0 && k.druckgefaelle_pam > 0 && (
            <div className="mt-2 text-xs font-medium text-brand-600">
              → Rohrsystem: {((parseFloat(k.rohrlange_m) || 0) * (parseFloat(k.druckgefaelle_pam) || 0) / 1000).toFixed(2)} kPa
            </div>
          )}
        </div>

        {/* Apparate */}
        <div className="p-5">
          <div className="mb-3 font-semibold text-slate-800">Apparate</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2">Bezeichnung</th>
                  <th className="px-3 py-2" style={{ width: 80 }}>Stk.</th>
                  <th className="px-3 py-2" style={{ width: 110 }}>kPa / Stk.</th>
                  <th className="px-3 py-2 text-right" style={{ width: 90 }}>Total kPa</th>
                  <th className="px-3 py-2" style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {k.apparate.map((a, ai) => {
                  const tot = (parseFloat(a.anzahl) || 0) * (parseFloat(a.dp_kpa) || 0);
                  return (
                    <tr key={ai}>
                      <td className="px-3 py-1.5">
                        <input className="input px-2.5 py-1.5" style={{ minWidth: 120 }} value={a.name}
                          onChange={(e) => updateApparat(activeTab, ai, "name", e.target.value)} />
                      </td>
                      <td className="px-3 py-1.5"><NumInput value={a.anzahl} onChange={(v) => updateApparat(activeTab, ai, "anzahl", v)} /></td>
                      <td className="px-3 py-1.5"><NumInput value={a.dp_kpa} onChange={(v) => updateApparat(activeTab, ai, "dp_kpa", v)} /></td>
                      <td className={"px-3 py-1.5 text-right font-mono tabular-nums " + (tot > 0 ? "font-semibold text-slate-900" : "text-slate-300")}>
                        {tot > 0 ? tot.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button onClick={() => removeApparat(activeTab, ai)} className="text-slate-300 transition hover:text-red-500" title="Entfernen">
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => addApparat(activeTab)} className="btn-ghost mt-3 px-0 text-brand-600 hover:bg-transparent hover:text-brand-700">
            <Plus className="size-4" /> Apparat hinzufügen
          </button>
        </div>
      </div>

      {/* Berechnen */}
      <button onClick={berechne} disabled={loading} className="btn-primary">
        {loading ? "Berechne…" : "Alle Kreise berechnen"}
      </button>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Resultate */}
      {results && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold text-slate-800">Resultate</h2>
          <div className="card mb-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-2">Pumpenkreis</th>
                    <th className="px-4 py-2 text-right">Rohrsystem [kPa]</th>
                    <th className="px-4 py-2 text-right">Apparate [kPa]</th>
                    <th className="px-4 py-2 text-right">Total [kPa]</th>
                    <th className="px-4 py-2 text-right">Total [mWS]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 font-medium text-slate-800">{r.kreis_name}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600">{r.dp_rohr_kpa}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600">{r.dp_apparate_kpa}</td>
                      <td className="px-4 py-2 text-right font-mono font-bold tabular-nums text-brand-600">{r.total_kpa}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600">{r.total_mws}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail aktiver Kreis */}
          {res && res.apparate_details?.length > 0 && (
            <div className="card p-5">
              <div className="mb-3 text-sm font-semibold text-slate-700">Detail: {res.kreis_name}</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-500">Rohrsystem ({kreise[activeTab].rohrlange_m} m × {kreise[activeTab].druckgefaelle_pam} Pa/m)</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">{res.dp_rohr_kpa} kPa</td>
                  </tr>
                  {res.apparate_details.filter((a) => a.total_kpa > 0).map((a, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-600">{a.name} ({a.anzahl} × {a.dp_kpa_pro_stk} kPa)</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">{a.total_kpa} kPa</td>
                    </tr>
                  ))}
                  <tr className="bg-brand-50/50 font-bold">
                    <td className="py-2 text-slate-800">Total Druckverlust</td>
                    <td className="py-2 text-right font-mono tabular-nums text-brand-700">{res.total_kpa} kPa = {res.total_mws} mWS</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
