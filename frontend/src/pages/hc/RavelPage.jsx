import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

const ENERGIETRAEGER_STEIGERUNG = {
  "Öl": 2.5, "Gas": 2.5, "Wärmepumpe (Strom)": 1.5,
  "Holzpellets": 2.0, "Fernwärme": 2.0, "Strom allgemein": 1.5,
};

const VARIANTE_DEFAULT = {
  name: "", investition: "", nutzungsdauer: 20, zinssatz_pct: 3.0,
  betrieb_pa: "", betrieb_steigerung_pct: 2.0,
  energie_pa: "", energie_steigerung_pct: 2.5,
};

const FARBEN = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2"];

const fmt = (n, dec = 0) => n != null ? Number(n).toLocaleString("de-CH", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—";
const chf = (n) => n != null ? `CHF ${fmt(n)}` : "—";

const inputSt = {
  padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, width: "100%", boxSizing: "border-box",
};

export default function RavelPage() {
  const [varianten, setVarianten] = useState([
    { ...VARIANTE_DEFAULT, name: "Variante 1", energie_steigerung_pct: 2.5 },
    { ...VARIANTE_DEFAULT, name: "Variante 2", energie_steigerung_pct: 2.5 },
  ]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setV = (i, field, val) => {
    setVarianten(prev => prev.map((v, j) => j === i ? { ...v, [field]: val } : v));
  };

  const addVariante = () => {
    if (varianten.length >= 6) return;
    setVarianten(prev => [...prev, { ...VARIANTE_DEFAULT, name: `Variante ${prev.length + 1}` }]);
  };

  const removeVariante = (i) => {
    setVarianten(prev => prev.filter((_, j) => j !== i));
    setResults(null);
  };

  const berechne = async () => {
    setLoading(true);
    setError("");
    try {
      const body = {
        varianten: varianten.map(v => ({
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

  // Farbe für Rang
  const rangColor = (rang) => {
    if (rang === 1) return "#16a34a";
    if (rang === 2) return "#2563eb";
    return "#6b7280";
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
        <Link to="/projekte" style={{ color: "#2563eb" }}>Projekte</Link>
        {" / "}RAVEL-Wirtschaftlichkeit
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>RAVEL-Wirtschaftlichkeitsvergleich (M10)</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        Dynamische Annuitätenmethode nach RAVEL-Leitfaden — bis 6 Varianten parallel
      </p>

      {/* Varianten Eingabe */}
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 700, fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ ...th, width: 180 }}>Feld</th>
              {varianten.map((v, i) => (
                <th key={i} style={{ ...th, width: 160, textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <input
                      style={{ ...inputSt, fontWeight: 600, color: FARBEN[i], border: "none", background: "transparent", padding: "2px 0" }}
                      value={v.name}
                      onChange={e => setV(i, "name", e.target.value)}
                    />
                    {varianten.length > 1 && (
                      <button onClick={() => removeVariante(i)}
                        style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>
                        ×
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
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={tdSt}>
                Preissteigerung Energie [%]
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Öl/Gas ~2.5%, WP ~1.5%, Holz ~2.0%</div>
              </td>
              {varianten.map((v, i) => (
                <td key={i} style={{ ...tdSt, textAlign: "center" }}>
                  <input
                    type="number" step={0.1}
                    style={inputSt}
                    value={v.energie_steigerung_pct}
                    onChange={e => setV(i, "energie_steigerung_pct", e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, justifyContent: "center" }}>
                    {Object.entries(ENERGIETRAEGER_STEIGERUNG).slice(0, 3).map(([k, val]) => (
                      <button key={k} onClick={() => setV(i, "energie_steigerung_pct", val)}
                        style={{ fontSize: 10, padding: "2px 4px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 3, cursor: "pointer" }}>
                        {k.split(" ")[0]}: {val}%
                      </button>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
        <button onClick={berechne} disabled={loading}
          style={{ background: "#1e40af", color: "white", border: "none", borderRadius: 8, padding: "11px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Berechne…" : "Vergleich berechnen"}
        </button>
        {varianten.length < 6 && (
          <button onClick={addVariante}
            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "11px 20px", fontSize: 14, cursor: "pointer" }}>
            + Variante hinzufügen
          </button>
        )}
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{varianten.length}/6 Varianten</span>
      </div>

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      {/* Resultate */}
      {results && (
        <div>
          {/* Günstigste Variante */}
          <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>🏆</span>
            <div>
              <div style={{ fontWeight: 700, color: "#15803d" }}>{results.guenstigste}</div>
              <div style={{ fontSize: 12, color: "#166534" }}>Günstigste Variante nach mittleren Jahreskosten</div>
            </div>
          </div>

          {/* Vergleichstabelle */}
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Mittlere Jahreskosten (MJK)</h2>
          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1e3a8a", color: "white" }}>
                  <th style={{ ...th, color: "white" }}>Kostenart</th>
                  {results.varianten.map((v, i) => (
                    <th key={i} style={{ ...th, color: "white", textAlign: "right" }}>
                      <div>{v.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>Rang {v.rang}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  <td style={tdSt}>Investition</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", fontFamily: "monospace" }}>{chf(v.investition)}</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={tdSt}>Nutzungsdauer / Zinssatz</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", color: "#6b7280" }}>{v.nutzungsdauer} J. / {v.zinssatz_pct}%</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  <td style={tdSt}>Annuitätsfaktor a</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", fontFamily: "monospace", color: "#6b7280" }}>{v.annuitaetsfaktor}</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={tdSt}>Kapitalkosten (K = Invest × a)</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", fontFamily: "monospace" }}>{chf(v.kapitalkosten)}</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  <td style={tdSt}>Mittl. Betriebskosten</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", fontFamily: "monospace" }}>{chf(v.betrieb_mittel)}</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={tdSt}>Mittl. Energiekosten</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", fontFamily: "monospace" }}>{chf(v.energie_mittel)}</td>
                  ))}
                </tr>
                <tr style={{ background: "#dbeafe", fontWeight: 700, borderTop: "2px solid #2563eb" }}>
                  <td style={{ ...tdSt, fontSize: 14 }}>Mittlere Jahreskosten (MJK)</td>
                  {results.varianten.map((v, i) => (
                    <td key={i} style={{ ...tdSt, textAlign: "right", fontFamily: "monospace", fontSize: 15, color: rangColor(v.rang) }}>
                      {chf(v.mjk)}
                      <div style={{ fontSize: 11, fontWeight: 400, color: rangColor(v.rang) }}>Rang {v.rang}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Balkendiagramm */}
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Kostenstruktur im Vergleich</h2>
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            {results.varianten.map((v, i) => {
              const max = Math.max(...results.varianten.map(x => x.mjk));
              const barWidth = max > 0 ? (v.mjk / max) * 100 : 0;
              const kWidth = max > 0 ? (v.kapitalkosten / max) * 100 : 0;
              const bWidth = max > 0 ? (v.betrieb_mittel / max) * 100 : 0;
              const eWidth = max > 0 ? (v.energie_mittel / max) * 100 : 0;
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{v.rang}. {v.name}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{chf(v.mjk)} / Jahr</span>
                  </div>
                  <div style={{ height: 24, background: "#f3f4f6", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${kWidth}%`, background: "#2563eb", transition: "width 0.5s" }} title={`Kapital: ${chf(v.kapitalkosten)}`} />
                    <div style={{ width: `${bWidth}%`, background: "#16a34a", transition: "width 0.5s" }} title={`Betrieb: ${chf(v.betrieb_mittel)}`} />
                    <div style={{ width: `${eWidth}%`, background: "#f59e0b", transition: "width 0.5s" }} title={`Energie: ${chf(v.energie_mittel)}`} />
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280", marginTop: 8 }}>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#2563eb", borderRadius: 2, marginRight: 4 }} />Kapital</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#16a34a", borderRadius: 2, marginRight: 4 }} />Betrieb</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#f59e0b", borderRadius: 2, marginRight: 4 }} />Energie</span>
            </div>
          </div>

          {/* Warnungen */}
          {results.varianten.some(v => v.warnings?.length > 0) && (
            <div style={{ marginTop: 16 }}>
              {results.varianten.filter(v => v.warnings?.length > 0).map((v, i) => (
                v.warnings.map((w, j) => (
                  <div key={`${i}-${j}`} style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 6 }}>
                    ⚠️ {v.name}: {w}
                  </div>
                ))
              ))}
            </div>
          )}

          {/* Formel-Erklärung */}
          <div style={{ marginTop: 20, background: "#f9fafb", borderRadius: 8, padding: 16, fontSize: 12, color: "#6b7280" }}>
            <strong>Methodik:</strong> Dynamische Annuitätenmethode nach RAVEL-Leitfaden (BfK, 1994)<br />
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
    <tr style={{ background: "#f3f4f6" }}>
      <td colSpan={span + 1} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </td>
    </tr>
  );
}

function InputRow({ label, field, varianten, setV, step = 1, placeholder = "" }) {
  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={tdSt}>{label}</td>
      {varianten.map((v, i) => (
        <td key={i} style={{ ...tdSt, textAlign: "center" }}>
          <input
            type="number" step={step}
            style={inputSt}
            value={v[field]}
            onChange={e => setV(i, field, e.target.value)}
            placeholder={placeholder}
          />
        </td>
      ))}
    </tr>
  );
}

const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600 };
const tdSt = { padding: "8px 10px", verticalAlign: "middle", borderBottom: "1px solid #f3f4f6", fontSize: 13 };
