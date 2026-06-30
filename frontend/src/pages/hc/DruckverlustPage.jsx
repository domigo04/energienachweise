import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

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

const inputStyle = {
  padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 13, width: "100%", boxSizing: "border-box",
};

const numInput = (val, onChange, placeholder = "0") => (
  <input
    type="number" step="0.1" min="0"
    style={inputStyle}
    value={val}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
  />
);

export default function DruckverlustPage() {
  const [kreise, setKreise] = useState(DEFAULT_KREISE);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(0);

  const updateKreis = (ki, field, val) => {
    setKreise(prev => prev.map((k, i) => i === ki ? { ...k, [field]: val } : k));
  };

  const updateApparat = (ki, ai, field, val) => {
    setKreise(prev => prev.map((k, i) => {
      if (i !== ki) return k;
      return {
        ...k,
        apparate: k.apparate.map((a, j) => j === ai ? { ...a, [field]: val } : a),
      };
    }));
  };

  const addApparat = (ki) => {
    setKreise(prev => prev.map((k, i) => i === ki
      ? { ...k, apparate: [...k.apparate, { name: "Neu", anzahl: 1, dp_kpa: 0 }] }
      : k
    ));
  };

  const removeApparat = (ki, ai) => {
    setKreise(prev => prev.map((k, i) => i === ki
      ? { ...k, apparate: k.apparate.filter((_, j) => j !== ai) }
      : k
    ));
  };

  const berechne = async () => {
    setLoading(true);
    setError("");
    try {
      const body = {
        kreise: kreise.map(k => ({
          name: k.name,
          rohrlange_m: parseFloat(k.rohrlange_m) || 0,
          druckgefaelle_pam: parseFloat(k.druckgefaelle_pam) || 70,
          apparate: k.apparate
            .filter(a => parseFloat(a.anzahl) > 0 || parseFloat(a.dp_kpa) > 0)
            .map(a => ({ name: a.name, anzahl: parseFloat(a.anzahl) || 0, dp_kpa: parseFloat(a.dp_kpa) || 0 })),
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
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
        <Link to="/heizungscockpit" style={{ color: "#2563eb" }}>Heizungscockpit</Link>
        {" / "}Druckverlust approximativ
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Druckverlust approximativ (M4)</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        Rohrsystem + Apparate je Pumpenkreis — basierend auf deinem Excel
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {kreise.map((k, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            style={{
              padding: "8px 16px", fontSize: 13, borderRadius: 6, cursor: "pointer",
              background: activeTab === i ? "#1e40af" : "#f3f4f6",
              color: activeTab === i ? "white" : "#374151",
              border: "none", fontWeight: activeTab === i ? 600 : 400,
            }}
          >
            {k.name}
            {results?.[i] && (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>
                {results[i].total_kpa} kPa
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Aktiver Kreis */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
        {/* Rohrsystem */}
        <div style={{ background: "#f9fafb", padding: "14px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Rohrsystem</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Länge VL+RL [m]</label>
              {numInput(k.rohrlange_m, v => updateKreis(activeTab, "rohrlange_m", v), "0")}
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Dimensioniert auf [Pa/m]</label>
              {numInput(k.druckgefaelle_pam, v => updateKreis(activeTab, "druckgefaelle_pam", v), "70")}
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Typisch: 70–100 Pa/m</div>
            </div>
          </div>
          {/* Zwischenergebnis Rohr */}
          {k.rohrlange_m > 0 && k.druckgefaelle_pam > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#2563eb" }}>
              → Rohrsystem: {((parseFloat(k.rohrlange_m) || 0) * (parseFloat(k.druckgefaelle_pam) || 0) / 1000).toFixed(2)} kPa
            </div>
          )}
        </div>

        {/* Apparate */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Apparate</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={th}>Bezeichnung</th>
                <th style={{ ...th, width: 80 }}>Stk.</th>
                <th style={{ ...th, width: 110 }}>kPa / Stk.</th>
                <th style={{ ...th, width: 90 }}>Total kPa</th>
                <th style={{ ...th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {k.apparate.map((a, ai) => {
                const tot = (parseFloat(a.anzahl) || 0) * (parseFloat(a.dp_kpa) || 0);
                return (
                  <tr key={ai} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={td}>
                      <input
                        style={{ ...inputStyle, minWidth: 120 }}
                        value={a.name}
                        onChange={e => updateApparat(activeTab, ai, "name", e.target.value)}
                      />
                    </td>
                    <td style={td}>{numInput(a.anzahl, v => updateApparat(activeTab, ai, "anzahl", v), "0")}</td>
                    <td style={td}>{numInput(a.dp_kpa, v => updateApparat(activeTab, ai, "dp_kpa", v), "0")}</td>
                    <td style={{ ...td, fontWeight: tot > 0 ? 600 : 400, color: tot > 0 ? "#1e40af" : "#9ca3af", textAlign: "right" }}>
                      {tot > 0 ? tot.toFixed(2) : "—"}
                    </td>
                    <td style={td}>
                      <button onClick={() => removeApparat(activeTab, ai)}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={() => addApparat(activeTab)}
            style={{ marginTop: 10, fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            + Apparat hinzufügen
          </button>
        </div>
      </div>

      {/* Berechnen */}
      <button
        onClick={berechne}
        disabled={loading}
        style={{
          background: "#1e40af", color: "white", border: "none", borderRadius: 8,
          padding: "12px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer",
          opacity: loading ? 0.6 : 1, marginBottom: 20,
        }}
      >
        {loading ? "Berechne…" : "Alle Kreise berechnen"}
      </button>

      {error && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      {/* Resultate */}
      {results && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Resultate</h2>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ background: "#1e40af", color: "white" }}>
                <th style={{ ...th, color: "white" }}>Pumpenkreis</th>
                <th style={{ ...th, color: "white", textAlign: "right" }}>Rohrsystem [kPa]</th>
                <th style={{ ...th, color: "white", textAlign: "right" }}>Apparate [kPa]</th>
                <th style={{ ...th, color: "white", textAlign: "right" }}>Total [kPa]</th>
                <th style={{ ...th, color: "white", textAlign: "right" }}>Total [mWS]</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <td style={td}><strong>{r.kreis_name}</strong></td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>{r.dp_rohr_kpa}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>{r.dp_apparate_kpa}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "#1e40af" }}>{r.total_kpa}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>{r.total_mws}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Detail aktiver Kreis */}
          {res && res.apparate_details?.length > 0 && (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Detail: {res.kreis_name}
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "5px 8px", color: "#6b7280" }}>Rohrsystem ({kreise[activeTab].rohrlange_m} m × {kreise[activeTab].druckgefaelle_pam} Pa/m)</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{res.dp_rohr_kpa} kPa</td>
                  </tr>
                  {res.apparate_details.filter(a => a.total_kpa > 0).map((a, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "5px 8px", color: "#374151" }}>{a.name} ({a.anzahl} × {a.dp_kpa_pro_stk} kPa)</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{a.total_kpa} kPa</td>
                    </tr>
                  ))}
                  <tr style={{ background: "#dbeafe", fontWeight: 700 }}>
                    <td style={{ padding: "8px 8px" }}>Total Druckverlust</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>{res.total_kpa} kPa = {res.total_mws} mWS</td>
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

const th = { padding: "8px 10px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" };
const td = { padding: "6px 8px", verticalAlign: "middle" };
