import React, { useState } from "react";
import { api } from "../../api";
import PageHeader from "../../components/ui/PageHeader";
import InfoTip from "../../components/ui/InfoTip";

const KVS_REIHE = [0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10.0, 16.0, 25.0, 40.0, 63.0];

const fmtNum = (n, dec = 3) => (n != null ? Number(n).toFixed(dec) : "—");

// Ideal-Fenster der Ventilautorität: 30–80 %. Farben bleiben bewusst semantisch
// (rot = schlecht, grün = gut), nicht Marken-Rot.
const pvText = (pv) => (pv < 30 ? "text-red-600" : pv > 80 ? "text-amber-600" : "text-green-600");
const pvBar = (pv) => (pv < 30 ? "bg-red-500" : pv > 80 ? "bg-amber-500" : "bg-green-500");

const ERKL = {
  volumenstrom: "Der Wasser-Volumenstrom durch das Ventil im Auslegungsfall (aus der Heizgruppe).",
  dpvar: "Der veränderliche Druckverlust im Kreis ohne das Ventil selbst — die «Anlage», gegen die das Ventil arbeitet.",
  autoritaet: "Wie stark das Ventil den Durchfluss wirklich steuert. Unter 30 % regelt es schlecht, über 80 % ist es überdimensioniert. Ideal: 30–80 %.",
};

export default function VentilPage() {
  const [form, setForm] = useState({ volumenstrom_m3h: "", dp_var_kpa: "", kvs_gewaehlt: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    // Sofort neu berechnen wenn alle Pflichtfelder gesetzt
    if (next.volumenstrom_m3h && next.dp_var_kpa) {
      berechne(next);
    }
  };

  const berechne = async (f = form) => {
    const vol = parseFloat(f.volumenstrom_m3h);
    const dp = parseFloat(f.dp_var_kpa);
    if (!vol || !dp || vol <= 0 || dp <= 0) return;
    setLoading(true);
    setError("");
    try {
      const body = {
        volumenstrom_m3h: vol,
        dp_var_kpa: dp,
        kvs_gewaehlt: f.kvs_gewaehlt ? parseFloat(f.kvs_gewaehlt) : null,
      };
      const r = await api.post("/api/v1/ventil/berechnen", body);
      setResult(r.data);
    } catch {
      setError("Berechnung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <PageHeader
        back={{ to: "/start", label: "Start" }}
        title="Ventilauslegung"
        subtitle="kvs-Wert und Ventilautorität eines Regelventils — nach deinem Excel-Blatt (M3)."
      />

      {/* Eingaben */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-slate-800">Eingaben</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label flex items-center gap-1">Volumenstrom V' [m³/h] * <InfoTip text={ERKL.volumenstrom} /></label>
            <input type="number" step="0.01" min="0" className="input" value={form.volumenstrom_m3h}
              onChange={(e) => set("volumenstrom_m3h", e.target.value)} placeholder="z.B. 0.49" />
          </div>
          <div>
            <label className="label flex items-center gap-1">Δpvar (variable Anlage) [kPa] * <InfoTip text={ERKL.dpvar} /></label>
            <input type="number" step="0.5" min="0" className="input" value={form.dp_var_kpa}
              onChange={(e) => set("dp_var_kpa", e.target.value)} placeholder="z.B. 26" />
            <p className="mt-1 text-xs text-slate-400">100 kPa = 1 bar</p>
          </div>
        </div>

        {result && (
          <div className="mt-4">
            <label className="label">KVS wählen (Vorschlag: {result.kvs_vorschlag})</label>
            <select className="input" value={form.kvs_gewaehlt || result.kvs_vorschlag}
              onChange={(e) => set("kvs_gewaehlt", e.target.value)}>
              {KVS_REIHE.map((k) => (
                <option key={k} value={k}>KVS {k}{k === result.kvs_vorschlag ? " ← Vorschlag" : ""}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Resultate */}
      {result && !result.fehler && (
        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-700">Resultate</div>
          <div className="p-6">
            {/* Ventilautorität gross + Balken */}
            <div className="mb-6 flex flex-col items-center gap-6 sm:flex-row">
              <div className="text-center">
                <div className={"text-5xl font-bold " + pvText(result.ventilautoritaet_pct)}>{fmtNum(result.ventilautoritaet_pct, 1)}%</div>
                <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">Ventilautorität Pv <InfoTip text={ERKL.autoritaet} /></div>
                <div className="text-xs text-slate-400">Ideal: 30–80 %</div>
              </div>
              <div className="w-full flex-1">
                <div className="relative h-5 overflow-hidden rounded-full bg-slate-100">
                  <div className={"h-full transition-all " + pvBar(result.ventilautoritaet_pct)}
                    style={{ width: `${Math.min(result.ventilautoritaet_pct, 100)}%` }} />
                  <div className="absolute top-0 h-full border-l-2 border-dashed border-slate-400" style={{ left: "30%" }} />
                  <div className="absolute top-0 h-full border-l-2 border-dashed border-slate-400" style={{ left: "80%" }} />
                </div>
                <div className="relative mt-1 h-4 text-[10px] text-slate-400">
                  <span className="absolute left-0">0 %</span>
                  <span className="absolute -translate-x-1/2" style={{ left: "30%" }}>30 %</span>
                  <span className="absolute -translate-x-1/2" style={{ left: "80%" }}>80 %</span>
                  <span className="absolute right-0">100 %</span>
                </div>
              </div>
            </div>

            {/* Zahlentabelle */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <Row label="Theoretischer KVS" value={`${fmtNum(result.kvs_theor, 4)} m³/h·bar^½`} />
                  <Row label="Gewählter KVS (nächste Norm-Grösse)" value={<strong>{result.kvs_eff}</strong>} />
                  <Row label="Δpvar [kPa]" value={fmtNum(result.dp_var_kpa, 1)} />
                  <Row label="Δpvar [bar]" value={fmtNum(result.dp_var_bar, 5)} />
                  <Row label="Δpv,eff (Druckverlust Ventil) [kPa]" value={fmtNum(result.dp_v_eff_kpa, 2)} highlight />
                  <Row label="Δpv,eff [bar]" value={fmtNum(result.dp_v_eff_bar, 6)} />
                  <Row label="Ventilautorität Pv" value={<span className={"font-semibold " + pvText(result.ventilautoritaet_pct)}>{fmtNum(result.ventilautoritaet_pct, 2)}%</span>} highlight />
                </tbody>
              </table>
            </div>

            {/* Formeln */}
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-600">Formeln:</strong><br />
              kvs_theor = V' / √Δpvar [bar] = {fmtNum(result.volumenstrom_m3h, 3)} / √{fmtNum(result.dp_var_bar, 4)} = <strong>{fmtNum(result.kvs_theor, 4)}</strong><br />
              Δpv,eff [bar] = (V' / kvs_eff)² = ({fmtNum(result.volumenstrom_m3h, 3)} / {result.kvs_eff})² = <strong>{fmtNum(result.dp_v_eff_bar, 6)}</strong><br />
              Pv = Δpv,eff / (Δpv,eff + Δpvar) = {fmtNum(result.dp_v_eff_bar, 6)} / ({fmtNum(result.dp_v_eff_bar, 6)} + {fmtNum(result.dp_var_bar, 5)}) = <strong>{fmtNum(result.ventilautoritaet_pct, 2)}%</strong>
            </div>

            {/* Warnungen */}
            {result.warnings?.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {w}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {result?.fehler && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{result.fehler}</div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <tr className={"border-b border-slate-100 " + (highlight ? "bg-brand-50/40" : "")}>
      <td className="py-2 pr-3 text-slate-600" style={{ width: "55%" }}>{label}</td>
      <td className={"py-2 font-mono tabular-nums " + (highlight ? "font-semibold text-slate-900" : "text-slate-700")}>{value}</td>
    </tr>
  );
}
