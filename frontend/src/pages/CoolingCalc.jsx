// frontend/src/pages/CoolingCalc.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  calcProject, exportJSON, importJSONText,
  exportCSV, importCSVText, ORIENT_FACTORS
} from "../lib/cooling";
import { loadLibrary, applyRoomType } from "../lib/library";

const LS_KEY = "cooling_project_autosave_v4";

/* ---------- Defaults ---------- */
const emptyRoom = () => ({
  name: "Neuer Raum",
  envelope_area_m2: 20,          // Hüll-/Transmissionsfläche [m²]
  u_value_W_m2K: 0.6,            // U-Wert [W/m²K]
  delta_t_K: 8,                  // Temperaturdifferenz Innen-Außen [K]

  ventilation_strategy: "direct",
  airflow_m3h: 0,                // Außenluft/Zuluft [m³/h] (bei Strategie „direkt“)
  ventilation_deltaT_K: null,    // Temperaturdifferenz für Lüftung [K] (leer = =ΔT)
  ventilation_deltaW_kg_per_kg: null, // Feuchtedifferenz Lüftung Δw [kg/kg]
  co2_emission_lph_per_person: 18,
  co2_indoor_limit_ppm: 1000,
  co2_outdoor_ppm: 400,

  // Solar (entweder „direct“ in W oder „calc“)
  solar_mode: "direct",
  solar_gains_W: 0,              // direkte solare Gewinne [W]
  fenster_area_m2: 0,            // Fensterfläche [m²] (nur calc)
  g_value: 0.6,                  // g-Wert der Verglasung [-] (nur calc)
  orient: "S",                   // Orientierung (N, NO, O, SO, S, SW, W, NW, H)
  mass_class: "medium",          // Bauschwere (light/medium/heavy)
  storage_factor_override: null, // Speicherfaktor manuell (leer = automatisch)
  solar_irr_W_m2: 450,           // Einstrahlung [W/m²] (Sommer-Design)

  // interne Lasten
  people_count: 0,               // Personenanzahl
  sensible_per_person_W: 75,     // sensible Wärmeabgabe pro Person [W]
  latent_per_person_W: 55,       // latente Wärmeabgabe pro Person [W]
  equipment_W: 0,                // Geräte [W]
  lighting_W: 0,                 // Beleuchtung [W]
});

/* ---------- Seite ---------- */
export default function CoolingCalc() {
  const [project, setProject] = useState(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch {}
    return {
      project_name: "Demo Kühllast",
      climate_station: "Zürich",
      rooms: [{
        ...emptyRoom(),
        name: "Büro EG",
        envelope_area_m2: 40,
        airflow_m3h: 300,
        solar_mode: "direct",
        solar_gains_W: 500,
        people_count: 4,
        equipment_W: 400,
        lighting_W: 300,
      }]
    };
  });

  const [lib, setLib] = useState(null);
  useEffect(() => { loadLibrary().then(setLib).catch(()=>{}); }, []);

  // Rechnen + Autosave
  const [result, setResult] = useState(() => calcProject(project));
  useEffect(() => {
    const enriched = {
      ...project,
      rooms: project.rooms.map(r => ({ ...r, _solarFactors: lib?.solar })),
    };
    setResult(calcProject(enriched));
    try { localStorage.setItem(LS_KEY, JSON.stringify(project)); } catch {}
  }, [project, lib]);

  const fileInput = useRef(null);
  const orientations = useMemo(() => Object.keys(ORIENT_FACTORS), []);

  /* ---------- Helpers ---------- */
  const addRoom = () => {
    setProject(p => ({ ...p, rooms: [...p.rooms, emptyRoom()] }));
    burstConfetti(); // 💥 Konfetti!
  };
  const removeRoom = (idx) => setProject(p => ({ ...p, rooms: p.rooms.filter((_, i) => i !== idx) }));
  const updateRoom = (idx, patch) =>
    setProject(p => ({ ...p, rooms: p.rooms.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  const updateField = (idx, key) => (e) => {
    const v = e.target.value;
    const numericKeys = [
      "envelope_area_m2","u_value_W_m2K","delta_t_K",
      "airflow_m3h","ventilation_deltaT_K","ventilation_deltaW_kg_per_kg",
      "co2_emission_lph_per_person","co2_indoor_limit_ppm","co2_outdoor_ppm",
      "solar_gains_W","fenster_area_m2","g_value","solar_irr_W_m2",
      "people_count","sensible_per_person_W","latent_per_person_W","equipment_W","lighting_W",
      "storage_factor_override"
    ];
    updateRoom(idx, { [key]: numericKeys.includes(key) ? (v === "" ? "" : Number(v)) : v });
  };

  // Enter / Shift+Enter → nächstes/voriges Feld (Tab-ähnlich)
  const onEnterNav = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const nodes = Array.from(document.querySelectorAll("[data-nav='1']"))
      .filter(el => !el.disabled && el.offsetParent !== null);
    const i = nodes.indexOf(e.currentTarget);
    const next = e.shiftKey ? Math.max(0, i - 1) : Math.min(nodes.length - 1, i + 1);
    nodes[next]?.focus();
    nodes[next]?.select?.();
  };

  const download = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportJsonFile = () =>
    download(new Blob([exportJSON(project)], { type: "application/json" }),
      `${project.project_name.replace(/\s+/g, "_")}_cooling.json`);
  const exportCsvFile = () =>
    download(new Blob([exportCSV(project)], { type: "text/csv;charset=utf-8" }),
      `${project.project_name.replace(/\s+/g, "_")}_cooling.csv`);
  const importFile = async (file) => {
    const txt = await file.text();
    const p = file.name.toLowerCase().endsWith(".json")
      ? importJSONText(txt)
      : importCSVText(txt, { project_name: project.project_name, climate_station: project.climate_station });
    setProject(p);
  };
  const applyTypeToRoom = (idx, typeId, area) => {
    if (!lib) return;
    const type = lib.roomTypes.find(t => t.id === typeId);
    if (!type) return;
    updateRoom(idx, applyRoomType({ type, area_m2: Number(area || 0) }));
  };

  const totals = result.totals;

  /* ---------- Render ---------- */
  return (
    <div className="px-4 py-4 w-full max-w-none">
      <InlineCSS />

      <h1 className="text-xl font-semibold mb-1">Kühllast (Client-only)</h1>
      <p className="text-xs text-gray-600 mb-4">
        Kompakte Eingabe mit Enter/Tab-Navigation, Tooltips und Diagrammen. Import/Export JSON/CSV.
      </p>

      {/* Kopf */}
      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        <input
          className="input-sm"
          placeholder="Projektname"
          value={project.project_name}
          data-nav="1"
          onKeyDown={onEnterNav}
          onChange={(e) => setProject(p => ({ ...p, project_name: e.target.value }))}
        />
        <input
          className="input-sm"
          placeholder="Klimastation (z. B. Zürich)"
          value={project.climate_station || ""}
          data-nav="1"
          onKeyDown={onEnterNav}
          onChange={(e) => setProject(p => ({ ...p, climate_station: e.target.value }))}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={addRoom} className="btn-sm primary">+ Raum</button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.csv,text/csv,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            importFile(f);
            e.target.value = "";
          }}
        />
        <button className="btn-sm" onClick={() => fileInput.current?.click()}>Import</button>
        <button className="btn-sm" onClick={exportCsvFile}>Export CSV</button>
        <button className="btn-sm" onClick={exportJsonFile}>Export JSON</button>
      </div>

      {/* Tabelle – volle Bildschirmbreite */}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <Th label="Raumbezeichnung" tip="Sprechender Name, z. B. 'Büro EG'" />
              <Th label="Hüllfläche A_env [m²]" tip="Transmissionsrelevante Fläche gegen Außen/andere Zonen" />
              <Th label="U-Wert [W/m²K]" tip="Mittlerer U-Wert der Hüllfläche" />
              <Th label="ΔT Innen–Außen [K]" tip="Temperaturdifferenz für Transmission (Sommer-Design)" />

              <Th label="Lüftungs-Strategie" tip="direkt: V̇ vorgeben • CO₂: Luftmenge aus CO₂-Grenze abschätzen" />
              <Th label="Außen-/Zuluft V̇ [m³/h]" tip="Nur bei Strategie 'direkt': Außenluftvolumenstrom" />
              <Th label="ΔT Lüftung [K]" tip="Temperaturdifferenz Zuluft–Raum für sensible Lüftungslast" />
              <Th label="Δw Lüftung [kg/kg]" tip="Feuchte­differenz für latente Lüftungslast (typ. 0.002–0.006)" />

              <Th label="Solar-Modus" tip="'direct' = Gewinne in W • 'calc' = aus Fläche/g/Orientierung" />
              <Th label="Solare Gewinne [W]" tip="Nur bei 'direct': solare Last direkt in W" />
              <Th label="Fensterfläche [m²]" tip="Nur 'calc': effektive Glasfläche" />
              <Th label="g-Wert [-]" tip="Gesamtenergiedurchlassgrad Verglasung" />
              <Th label="Orientierung" tip="N/NO/O/SO/S/SW/W/NW/H – maßgebliche Fensterorientierung" />
              <Th label="Einstrahlung [W/m²]" tip="Sommer-Design-Einstrahlung auf Fenster" />
              <Th label="Bauschwere" tip="light/medium/heavy → Speicherfaktoren für solare Last" />
              <Th label="Speicherfaktor" tip="Optionaler Override (leer = automatisch)" />

              <Th label="Personen [#]" tip="Anzahl Personen im Raum" />
              <Th label="Sensible Pers.-Last [W/P]" tip="Sensible Wärme pro Person" />
              <Th label="Latente Pers.-Last [W/P]" tip="Latente Feuchte-/Wärmelast pro Person" />
              <Th label="Geräte [W]" tip="Elektrische Geräte, Server, etc." />
              <Th label="Beleuchtung [W]" tip="Beleuchtungsleistung (ggf. mit Kühllastfaktor)" />

              <Th label="Vorlage" tip="Nutzungstyp + Fläche anwenden" />
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {project.rooms.map((r, i) => (
              <tr key={i}>
                <Td><input className="input-cell w-36" value={r.name} placeholder="z. B. Büro EG" data-nav="1" onKeyDown={onEnterNav} onChange={updateField(i, "name")} /></Td>
                <Td><Num v={r.envelope_area_m2} set={updateField(i, "envelope_area_m2")} onEnter={onEnterNav} placeholder="m²" /></Td>
                <Td><Num v={r.u_value_W_m2K} set={updateField(i, "u_value_W_m2K")} onEnter={onEnterNav} placeholder="W/m²K" step="0.05" /></Td>
                <Td><Num v={r.delta_t_K} set={updateField(i, "delta_t_K")} onEnter={onEnterNav} placeholder="K" /></Td>

                <Td>
                  <select className="select-cell" value={r.ventilation_strategy} data-nav="1" onKeyDown={onEnterNav} onChange={updateField(i, "ventilation_strategy")}>
                    <option value="direct">direkt</option>
                    <option value="co2">CO₂-basiert</option>
                  </select>
                </Td>
                <Td><Num v={r.airflow_m3h} set={updateField(i, "airflow_m3h")} onEnter={onEnterNav} placeholder="m³/h" dis={r.ventilation_strategy !== "direct"} /></Td>
                <Td><Num v={r.ventilation_deltaT_K ?? ""} set={updateField(i, "ventilation_deltaT_K")} onEnter={onEnterNav} placeholder="K (leer = ΔT)" /></Td>
                <Td><Num v={r.ventilation_deltaW_kg_per_kg ?? ""} set={updateField(i, "ventilation_deltaW_kg_per_kg")} onEnter={onEnterNav} placeholder="z. B. 0.004" /></Td>

                <Td>
                  <select className="select-cell" value={r.solar_mode} data-nav="1" onKeyDown={onEnterNav} onChange={updateField(i, "solar_mode")}>
                    <option value="direct">direct</option>
                    <option value="calc">calc</option>
                  </select>
                </Td>
                <Td><Num v={r.solar_gains_W} set={updateField(i, "solar_gains_W")} onEnter={onEnterNav} placeholder="W" dis={r.solar_mode !== "direct"} /></Td>
                <Td><Num v={r.fenster_area_m2} set={updateField(i, "fenster_area_m2")} onEnter={onEnterNav} placeholder="m²" dis={r.solar_mode !== "calc"} /></Td>
                <Td><Num v={r.g_value} set={updateField(i, "g_value")} onEnter={onEnterNav} placeholder="0…1" step="0.05" dis={r.solar_mode !== "calc"} /></Td>
                <Td>
                  <select className="select-cell" value={r.orient} data-nav="1" onKeyDown={onEnterNav} onChange={updateField(i, "orient")} disabled={r.solar_mode !== "calc"}>
                    {orientations.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Td>
                <Td><Num v={r.solar_irr_W_m2} set={updateField(i, "solar_irr_W_m2")} onEnter={onEnterNav} placeholder="W/m²" dis={r.solar_mode !== "calc"} /></Td>
                <Td>
                  <select className="select-cell" value={r.mass_class || "medium"} data-nav="1" onKeyDown={onEnterNav} onChange={updateField(i, "mass_class")}>
                    <option value="light">light</option>
                    <option value="medium">medium</option>
                    <option value="heavy">heavy</option>
                  </select>
                </Td>
                <Td><Num v={r.storage_factor_override ?? ""} set={updateField(i, "storage_factor_override")} onEnter={onEnterNav} step="0.05" placeholder="auto" /></Td>

                <Td><Num v={r.people_count} set={updateField(i, "people_count")} onEnter={onEnterNav} placeholder="Anzahl" /></Td>
                <Td><Num v={r.sensible_per_person_W} set={updateField(i, "sensible_per_person_W")} onEnter={onEnterNav} placeholder="W/Person" /></Td>
                <Td><Num v={r.latent_per_person_W} set={updateField(i, "latent_per_person_W")} onEnter={onEnterNav} placeholder="W/Person" /></Td>
                <Td><Num v={r.equipment_W} set={updateField(i, "equipment_W")} onEnter={onEnterNav} placeholder="W" /></Td>
                <Td><Num v={r.lighting_W} set={updateField(i, "lighting_W")} onEnter={onEnterNav} placeholder="W" /></Td>

                <Td>
                  {lib ? (
                    <div className="flex gap-1 items-center">
                      <select className="select-cell" id={`type-${i}`} data-nav="1" onKeyDown={onEnterNav}>
                        {lib.roomTypes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                      <input className="input-cell w-16" type="number" step="1" placeholder="A [m²]" id={`area-${i}`} data-nav="1" onKeyDown={onEnterNav} />
                      <button
                        className="btn-icon"
                        title="Vorlage anwenden"
                        onClick={() => {
                          const typeId = document.getElementById(`type-${i}`).value;
                          const area = document.getElementById(`area-${i}`).value;
                          applyTypeToRoom(i, typeId, area);
                        }}
                      >⮕</button>
                    </div>
                  ) : <span className="text-slate-400">–</span>}
                </Td>

                <Td>
                  <button className="btn-icon danger" title="Löschen" onClick={() => removeRoom(i)}>✕</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ergebnisse + Diagramme */}
      <div className="grid lg:grid-cols-[420px,1fr] gap-4 mt-4">
        <div className="card">
          <h2 className="card-title">Totals</h2>
          <KV label="Q_trans [W]" v={totals.q_trans_W} />
          <KV label="Q_int,sens [W]" v={totals.q_int_sens_W} />
          <KV label="Q_vent,sens [W]" v={totals.q_vent_sens_W} />
          <KV label="Q_solar [W]" v={totals.q_solar_W} />
          <KV label="Q_lat (Pers+Vent) [W]" v={totals.q_latent_total_W} />
          <div className="sep" />
          <KV label="Q_ges,sens [W]" v={totals.q_sensible_total_W} strong />
          <KV label="Q_ges,total [W]" v={totals.q_total_W} strong />
        </div>

        <div className="card">
          <h2 className="card-title">Räume – sensibel / latent</h2>
          <Bars
            rows={result.rooms.map(r => ({
              name: r.name,
              sens: r.q_sensible_total_W,
              lat: r.q_latent_total_W,
            }))}
          />
          <div className="h-4" />
          <h2 className="card-title">Saisonal – geschätzte Kühllast</h2>
          <SeasonBars totals={totals} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Mini Diagramme (SVG/Div) ---------- */
function Bars({ rows }) {
  if (!rows?.length) return <div className="text-xs text-slate-500">Keine Räume.</div>;
  const max = Math.max(...rows.map(r => r.sens + r.lat), 1);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const total = r.sens + r.lat;
        const pw = (x) => Math.max(1, Math.round((x / max) * 100));
        return (
          <div key={i}>
            <div className="flex justify-between text-[11px]">
              <span className="truncate pr-2">{r.name}</span>
              <span className="tabular-nums">{Math.round(total).toLocaleString("de-CH")} W</span>
            </div>
            <div className="bar-row" role="img" aria-label={`sensibel ${Math.round(r.sens)} W, latent ${Math.round(r.lat)} W`}>
              <div className="bar sens" style={{ width: pw(r.sens) + "%" }} />
              <div className="bar lat"  style={{ width: pw(r.lat)  + "%" }} />
            </div>
          </div>
        );
      })}
      <div className="legend">
        <span className="dot sens" /> sensibel
        <span className="dot lat" /> latent
      </div>
    </div>
  );
}

/* Heuristische Saison-Gewichtung (für Übersicht, nicht Normnachweis) */
const SEASON_WEIGHTS = {
  winter:  { trans: 0.10, vent: 0.20, solar: 0.15, internal: 0.40, latent: 0.30 },
  spring:  { trans: 0.30, vent: 0.50, solar: 0.60, internal: 0.80, latent: 0.60 },
  summer:  { trans: 0.60, vent: 1.00, solar: 1.00, internal: 1.00, latent: 1.00 },
  autumn:  { trans: 0.30, vent: 0.50, solar: 0.50, internal: 0.80, latent: 0.60 },
};

function SeasonBars({ totals }) {
  const parts = {
    trans: totals.q_trans_W,
    vent:  totals.q_vent_sens_W,
    solar: totals.q_solar_W,
    internal: totals.q_int_sens_W,
    latent: totals.q_latent_total_W,
  };
  const seasons = Object.entries(SEASON_WEIGHTS).map(([k, w]) => {
    const sum = parts.trans*w.trans + parts.vent*w.vent + parts.solar*w.solar + parts.internal*w.internal + parts.latent*w.latent;
    return { name: k, value: sum };
  });
  const max = Math.max(...seasons.map(s => s.value), 1);
  const nice = (x) => Math.round(x).toLocaleString("de-CH");

  return (
    <div className="grid grid-cols-4 gap-2 items-end" style={{ minHeight: 120 }}>
      {seasons.map((s) => (
        <div key={s.name} className="flex flex-col items-center gap-1">
          <div className="season-col" style={{ height: Math.max(6, (s.value / max) * 100) + "%" }} title={`${s.name}: ~${nice(s.value)} W`} />
          <div className="text-[11px] capitalize text-slate-600">{s.name}</div>
          <div className="text-[11px] tabular-nums">{nice(s.value)} W</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- kleine UI-Helpers ---------- */
function Th({ label, tip }) {
  return (
    <th className="th">
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className="info" title={tip}>i</span>
      </div>
    </th>
  );
}
function Td({ children }) { return <td className="td">{children}</td>; }
function Num({ v, set, onEnter, dis=false, placeholder, step="any" }) {
  return (
    <input
      type="number"
      step={step}
      className={`input-cell ${dis ? "disabled" : ""}`}
      value={v}
      placeholder={placeholder}
      disabled={dis}
      data-nav="1"
      onKeyDown={onEnter}
      onChange={set}
    />
  );
}
function KV({ label, v, strong }) {
  return (
    <div className={`flex items-center justify-between py-[2px] ${strong ? "font-semibold" : ""}`}>
      <span className="text-[12px] text-slate-600">{label}</span>
      <span className="text-[13px] tabular-nums">{Number(v).toLocaleString("de-CH")}</span>
    </div>
  );
}

/* ---------- Konfetti ---------- */
function burstConfetti() {
  const host = document.createElement("div");
  host.className = "confetti-host";
  document.body.appendChild(host);

  const COUNT = 60;
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement("span");
    p.className = "confetti";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = `hsl(${Math.random()*360}, 90%, 55%)`;
    p.style.animationDelay = (Math.random() * 0.2) + "s";
    p.style.transform = `translateY(-20px) rotate(${Math.random()*180}deg)`;
    host.appendChild(p);
  }
  // Aufräumen
  setTimeout(() => host.remove(), 1200);
}

/* ---------- Inline CSS: kompakt, volle Breite, Tooltips, Konfetti ---------- */
function InlineCSS() {
  useEffect(() => {
    if (document.getElementById("cooling-compact-css")) return;
    const s = document.createElement("style");
    s.id = "cooling-compact-css";
    s.textContent = `
      :root { --gap: 6px; --radius: 10px; --bd: 1px solid #e2e8f0; }

      .input-sm { border: var(--bd); border-radius: var(--radius); padding: 6px 8px; font-size: 13px; }

      .btn-sm { border: var(--bd); border-radius: 10px; padding: 6px 10px; font-size: 12px; background: #fff; }
      .btn-sm.primary { background:#0f172a; color:#fff; border-color:#0f172a; }
      .btn-sm.primary:hover { filter: brightness(1.08); }
      .btn-icon { border: var(--bd); border-radius: 8px; padding: 2px 8px; font-size: 12px; line-height: 1.2; background:#fff; }
      .btn-icon.danger { background:#fee2e2; border-color:#fecaca; }

      .table-wrap { width: 100%; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; table-layout: fixed; }
      .tbl thead th { position: sticky; top: 0; background: #fafafa; z-index: 1; }
      .th { text-align: left; padding: 6px 6px; border-bottom: var(--bd); font-weight: 600; color:#334155; white-space: nowrap; }
      .td { padding: 4px 6px; border-bottom: var(--bd); }

      .info { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; font-size:10px; font-weight:700; color:#0f172a; border:1px solid #cbd5e1; border-radius:999px; cursor:help; }
      .input-cell { width: 86px; border: var(--bd); border-radius: 8px; padding: 4px 6px; font-size: 12px; }
      .input-cell::placeholder { color:#94a3b8; }
      .input-cell.disabled { opacity: .55; background:#f8fafc; }
      .select-cell { border: var(--bd); border-radius: 8px; padding: 4px 6px; font-size: 12px; background:#fff; }

      .w-16 { width: 64px; } .w-36 { width: 144px; }

      .card { border: var(--bd); border-radius: var(--radius); padding: 10px; }
      .card-title { font-weight: 600; margin-bottom: 6px; font-size: 14px; }
      .sep { height:1px; background:#e2e8f0; margin:6px 0; }

      .bar-row { display:flex; width:100%; height:10px; border-radius:6px; overflow:hidden; background:#f1f5f9; }
      .bar { height:100%; }
      .bar.sens { background:#334155; } /* dunkel (sensibel) */
      .bar.lat  { background:#94a3b8; } /* hell (latent) */
      .legend { display:flex; gap:10px; align-items:center; margin-top:6px; font-size:12px; color:#475569; }
      .legend .dot { display:inline-block; width:10px; height:10px; border-radius:999px; margin:0 4px 0 8px;}
      .legend .dot.sens { background:#334155; } .legend .dot.lat { background:#94a3b8; }

      .season-col { width: 26px; background: linear-gradient(180deg, #0f172a, #94a3b8); border-radius: 6px; }

      /* Desktop: volle Breite */
      @media (min-width: 1024px) {
        .table-wrap { overflow-x: visible; }
        .tbl { table-layout: auto; }
      }

      /* Konfetti */
      .confetti-host { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 70; }
      .confetti {
        position: absolute;
        top: -12px;
        width: 8px; height: 12px; border-radius: 2px;
        opacity: 0.95;
        animation: confetti-fall 1.2s ease-in forwards;
      }
      @keyframes confetti-fall {
        0%   { transform: translateY(-20px) rotate(0deg); }
        100% { transform: translateY(110vh) rotate(540deg); opacity: 0.2; }
      }
    `;
    document.head.appendChild(s);
  }, []);
  return null;
}
