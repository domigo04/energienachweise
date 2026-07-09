import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

const KVS_REIHE = [0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10.0, 16.0, 25.0, 40.0, 63.0];

const fmtNum = (n, dec = 3) => n != null ? Number(n).toFixed(dec) : "—";

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

  const pvColor = (pv) => {
    if (pv < 30) return "#ef4444";
    if (pv > 80) return "#f59e0b";
    return "#16a34a";
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
        <Link to="/projekte" style={{ color: "#2563eb" }}>Projekte</Link>
        {" / "}Ventilauslegung
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Ventilauslegung (M3)</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
        kvs-Berechnung mit Ventilautorität nach deinem Excel
      </p>

      {/* Eingaben */}
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Eingaben</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 4 }}>
              Volumenstrom V' [m³/h] *
            </label>
            <input
              type="number" step="0.01" min="0"
              style={inputStyle}
              value={form.volumenstrom_m3h}
              onChange={e => set("volumenstrom_m3h", e.target.value)}
              placeholder="z.B. 0.49"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 4 }}>
              Δpvar (variable Anlage) [kPa] *
            </label>
            <input
              type="number" step="0.5" min="0"
              style={inputStyle}
              value={form.dp_var_kpa}
              onChange={e => set("dp_var_kpa", e.target.value)}
              placeholder="z.B. 26"
            />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>100 kPa = 1 bar</div>
          </div>
        </div>

        {result && (
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 4 }}>
              KVS wählen (Vorschlag: {result.kvs_vorschlag})
            </label>
            <select
              style={inputStyle}
              value={form.kvs_gewaehlt || result.kvs_vorschlag}
              onChange={e => set("kvs_gewaehlt", e.target.value)}
            >
              {KVS_REIHE.map(k => (
                <option key={k} value={k}>
                  KVS {k}{k === result.kvs_vorschlag ? " ← Vorschlag" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div style={{ color: "#ef4444", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Resultate */}
      {result && !result.fehler && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ background: "#1e40af", color: "white", padding: "12px 20px", fontSize: 14, fontWeight: 600 }}>
            Resultate
          </div>

          {/* Ventilautorität gross */}
          <div style={{ padding: "20px", background: "white" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 42, fontWeight: 700, color: pvColor(result.ventilautoritaet_pct) }}>
                  {fmtNum(result.ventilautoritaet_pct, 1)}%
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Ventilautorität Pv</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Ideal: 30–80%</div>
              </div>
              {/* Balken */}
              <div style={{ flex: 1 }}>
                <div style={{ background: "#f3f4f6", borderRadius: 4, height: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(result.ventilautoritaet_pct, 100)}%`,
                    background: pvColor(result.ventilautoritaet_pct),
                    height: "100%",
                    transition: "width 0.3s"
                  }} />
                  {/* Markierungen bei 30% und 80% */}
                  <div style={{ position: "absolute", top: 0, left: "30%", height: "100%", borderLeft: "2px dashed #9ca3af" }} />
                  <div style={{ position: "absolute", top: 0, left: "80%", height: "100%", borderLeft: "2px dashed #9ca3af" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                  <span>0%</span><span>30%</span><span style={{ marginLeft: "calc(50% - 16px)" }}>80%</span><span>100%</span>
                </div>
              </div>
            </div>

            {/* Zahlentabelle */}
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                <Row label="Theoretischer KVS" value={`${fmtNum(result.kvs_theor, 4)} m³/h·bar^½`} />
                <Row label="Gewählter KVS (nächste Norm-Grösse)" value={<strong>{result.kvs_eff}</strong>} />
                <Row label="Δpvar [kPa]" value={fmtNum(result.dp_var_kpa, 1)} />
                <Row label="Δpvar [bar]" value={fmtNum(result.dp_var_bar, 5)} />
                <Row label="Δpv,eff (Druckverlust Ventil) [kPa]" value={fmtNum(result.dp_v_eff_kpa, 2)} highlight />
                <Row label="Δpv,eff [bar]" value={fmtNum(result.dp_v_eff_bar, 6)} />
                <Row label="Ventilautorität Pv" value={<span style={{ color: pvColor(result.ventilautoritaet_pct), fontWeight: 600 }}>{fmtNum(result.ventilautoritaet_pct, 2)}%</span>} highlight />
              </tbody>
            </table>

            {/* Formeln */}
            <div style={{ marginTop: 16, background: "#f9fafb", borderRadius: 6, padding: 12, fontSize: 11, color: "#6b7280" }}>
              <strong>Formeln:</strong><br />
              kvs_theor = V' / √Δpvar [bar] = {fmtNum(result.volumenstrom_m3h, 3)} / √{fmtNum(result.dp_var_bar, 4)} = <strong>{fmtNum(result.kvs_theor, 4)}</strong><br />
              Δpv,eff [bar] = (V' / kvs_eff)² = ({fmtNum(result.volumenstrom_m3h, 3)} / {result.kvs_eff})² = <strong>{fmtNum(result.dp_v_eff_bar, 6)}</strong><br />
              Pv = Δpv,eff / (Δpv,eff + Δpvar) = {fmtNum(result.dp_v_eff_bar, 6)} / ({fmtNum(result.dp_v_eff_bar, 6)} + {fmtNum(result.dp_var_bar, 5)}) = <strong>{fmtNum(result.ventilautoritaet_pct, 2)}%</strong>
            </div>

            {/* Warnungen */}
            {result.warnings?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 6 }}>
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {result?.fehler && (
        <div style={{ color: "#ef4444", padding: 12, background: "#fef2f2", borderRadius: 6 }}>{result.fehler}</div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
  borderRadius: 6, fontSize: 14, boxSizing: "border-box",
};

function Row({ label, value, highlight }) {
  return (
    <tr style={{ background: highlight ? "#f0f9ff" : "white", borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ padding: "8px 12px", color: "#374151", width: "55%" }}>{label}</td>
      <td style={{ padding: "8px 12px", fontWeight: highlight ? 600 : 400, fontFamily: "monospace" }}>{value}</td>
    </tr>
  );
}
