import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp, w_from_T_RH, h_from_T_w, T_from_h_w, RH_from_T_w, rho_moist } from "./hx/psychro";

/**
 * HxDiagram · v7.1 (responsive, fix)
 * – Fix: doppelte hoverPxPy-Deklaration entfernt
 * – Fix: ungenutzten Import pws entfernt
 * – Tooltips für T / φ wieder aktiviert
 */

export default function HxDiagram({ standalone = true }) {
  // Defaults
  const TMIN_DEFAULT = -20, TMAX_DEFAULT = 40, XMAX_DEFAULT = 30;

  // UI State
  const [p_kPa, setP] = useState(100);
  const [tMin, setTMin] = useState(TMIN_DEFAULT);
  const [tMax, setTMax] = useState(TMAX_DEFAULT);
  const [xMax, setXMax] = useState(XMAX_DEFAULT);
  const [showT, setShowT] = useState(true);
  const [showRH, setShowRH] = useState(true);
  const [showSat, setShowSat] = useState(true);
  const [showPointLabels, setShowPointLabels] = useState(true);
  const [labelMode, setLabelMode] = useState("index"); // "index" | "semantic"

  // Fälle
  const DEFAULT_CASES = [
    { id: "winter", name: "Winter −13°C / 90%", color: "#16a34a", T: -13, RH: 90, visible: true, Texh: 22, Eta: 70, Tset: 20, V: 2000 },
    { id: "sommer", name: "Sommer 35°C / 40%", color: "#e11d48", T: 35, RH: 40, visible: true, Texh: 24, Eta: 60, Tset: 18, V: 2000 },
    { id: "schwuel", name: "Schwül 29°C / 60%", color: "#f59e0b", T: 29, RH: 60, visible: true, Texh: 24, Eta: 60, Tset: 20, V: 2000 },
  ];
  const [cases, setCases] = useState(DEFAULT_CASES);
  const [activeCaseId, setActiveCaseId] = useState(DEFAULT_CASES[0].id);
  const [editingCaseId, setEditingCaseId] = useState(null);
  const getCase = (id) => cases.find(c => c.id === id) || DEFAULT_CASES[0];
  const visibleCaseIds = useMemo(() => cases.filter(c => c.visible).map(c => c.id), [cases]);

  // Daten
  const [points, setPoints] = useState([]);     // {id, caseId, x_gpkg, h, label?}
  const [processes, setProcesses] = useState([]); // {id, caseId, type:"heater"|"cooler"|"wrg"|"adiabatic", p1:{x_gpkg,h}, p2:{x_gpkg,h}}
  const [wrgByCase, setWrgByCase] = useState({}); // cid -> {w,x,T_oa,h_oa,T_wrg,h_wrg}
  const [calcInfo, setCalcInfo] = useState({});   // cid -> {type,Q,m_da,Tin,Tout}

  // Hydraulik
  const [hydroHeat, setHydroHeat] = useState({}); // cid -> {Q_kW, Ts, Tr}
  const [hydroCool, setHydroCool] = useState({}); // cid -> {Q_kW, Ts, Tr}  (Default 35/28)

  // Tools
  const TOOLS = { HEATER: "heater", COOLER: "cooler", ADIABATIC: "adiabatic", POINT: "point" };
  const [tool, setTool] = useState(TOOLS.HEATER);

  // Undo/Redo
  const [undoStack, setUndo] = useState([]);
  const [redoStack, setRedo] = useState([]);
  const snapshot = () => ({
    points: JSON.parse(JSON.stringify(points)),
    processes: JSON.parse(JSON.stringify(processes)),
    cases: JSON.parse(JSON.stringify(cases)),
    activeCaseId,
    wrgByCase: JSON.parse(JSON.stringify(wrgByCase)),
    calcInfo: JSON.parse(JSON.stringify(calcInfo)),
    hydroHeat: JSON.parse(JSON.stringify(hydroHeat)),
    hydroCool: JSON.parse(JSON.stringify(hydroCool)),
  });
  const pushUndo = () => { setUndo(s => [...s, snapshot()]); setRedo([]); };
  const doUndo = () => setUndo(s => {
    if (!s.length) return s;
    setRedo(r => [...r, snapshot()]);
    const prev = s[s.length - 1];
    setPoints(prev.points); setProcesses(prev.processes); setCases(prev.cases);
    setActiveCaseId(prev.activeCaseId); setWrgByCase(prev.wrgByCase||{});
    setCalcInfo(prev.calcInfo||{}); setHydroHeat(prev.hydroHeat||{}); setHydroCool(prev.hydroCool||{});
    return s.slice(0, -1);
  });
  const doRedo = () => setRedo(r => {
    if (!r.length) return r;
    setUndo(u => [...u, snapshot()]);
    const nxt = r[r.length - 1];
    setPoints(nxt.points); setProcesses(nxt.processes); setCases(nxt.cases);
    setActiveCaseId(nxt.activeCaseId); setWrgByCase(nxt.wrgByCase||{});
    setCalcInfo(nxt.calcInfo||{}); setHydroHeat(nxt.hydroHeat||{}); setHydroCool(nxt.hydroCool||{});
    return r.slice(0, -1);
  });

  // Canvas & Drag
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const animRef = useRef(null);
  const lastSizeRef = useRef({ W: 0, H: 0, dpr: 1 });

  // drag state
  const dragRef = useRef({ mode: "none", type: null, x1: 0, x2: 0, h1: 0, h2: 0 });

  // safe ranges
  const safe = useMemo(() => {
    const P = Number.isFinite(p_kPa) ? clamp(p_kPa, 30, 120) : 100;
    const X = Number.isFinite(xMax) ? clamp(xMax, 1, 50) : XMAX_DEFAULT;
    const lo0 = Number.isFinite(tMin) ? tMin : TMIN_DEFAULT;
    const hi0 = Number.isFinite(tMax) ? tMax : TMAX_DEFAULT;
    const tLo = Math.min(lo0, hi0 - 1);
    const tHi = Math.max(hi0, lo0 + 1);
    return { P, X, tLo, tHi };
  }, [p_kPa, xMax, tMin, tMax]);

  const { yMin, yMax } = useMemo(() => {
    const top = h_from_T_w(safe.tHi, safe.X/1000);
    const bottom = h_from_T_w(safe.tLo, 0);
    let ymax = Math.ceil((Math.max(top, 5) + 10) / 5) * 5;
    let ymin = Math.floor((Math.min(0, bottom) - 10) / 5) * 5;
    if (ymax - ymin < 50) ymax = ymin + 50;
    if (!Number.isFinite(ymax) || !Number.isFinite(ymin)) { return { yMin: -20, yMax: 80 }; }
    return { yMin: ymin, yMax: ymax };
  }, [safe]);

  // helpers
  const uid = () => Math.random().toString(36).slice(2, 9);
  const pickColor = (i) => ["#0ea5e9","#16a34a","#e11d48","#f59e0b","#8b5cf6","#22c55e","#06b6d4","#ef4444"][i % 8];
  const findPointNear = (cid, x, h, epsX=0.03, epsH=0.3) =>
    points.find(p => p.caseId===cid && Math.abs(p.x_gpkg-x)<=epsX && Math.abs(p.h-h)<=epsH);
  const addOrUpdatePoint = (cid, x, h, label) => {
    const ex = findPointNear(cid, x, h);
    if (ex) { if (label && !ex.label) setPoints(ps => ps.map(p => p.id===ex.id?{...p,label}:p)); return ex; }
    const np = { id: uid(), caseId: cid, x_gpkg: x, h, label };
    setPoints(ps => [...ps, np]); return np;
  };

  // WRG + Nachgeräte
  const computeWRG = (cid) => {
    const cas = getCase(cid); const P = safe.P*1000;
    const w = w_from_T_RH(cas.T, cas.RH, P); const x = 1000*w;
    const T_oa = cas.T; const h_oa = h_from_T_w(T_oa, w);
    const eps = clamp(cas.Eta,0,95)/100; const T_exh = cas.Texh;
    const T_wrg = T_oa + eps*(T_exh - T_oa);
    const h_wrg = h_from_T_w(T_wrg, w);
    return { w,x,T_oa,h_oa,T_wrg,h_wrg };
  };

  const simulateCaseWRG = (cid) => {
    const cas = getCase(cid); if (!cas) return;
    const { w, x, T_oa, h_oa, T_wrg, h_wrg } = computeWRG(cid);
    pushUndo();
    addOrUpdatePoint(cid, x, h_oa, "OA");
    addOrUpdatePoint(cid, x, h_wrg, "WRG");
    const h_set = h_from_T_w(cas.Tset, w);
    const type2 = cas.Tset >= T_wrg ? "heater" : "cooler";
    setProcesses(pr => [...pr,
      { id: uid(), caseId: cid, type: "wrg",   p1:{x_gpkg:x,h:h_oa},  p2:{x_gpkg:x,h:h_wrg} },
      { id: uid(), caseId: cid, type: type2,   p1:{x_gpkg:x,h:h_wrg}, p2:{x_gpkg:x,h:h_set} }
    ]);
    addOrUpdatePoint(cid, x, h_set, "ZU");
    setWrgByCase(m => ({ ...m, [cid]: { w,x,T_oa,h_oa,T_wrg,h_wrg } }));
  };

  const addHeaterAfterWRG = (cid) => {
    const cas = getCase(cid); const P = safe.P*1000;
    const base = wrgByCase[cid] || computeWRG(cid);
    const { w, x, T_wrg, h_wrg } = base; const Tout = cas.Tset;
    if (!(Tout > T_wrg)) return alert("T_set muss > T_WRG sein (Heizen).");
    const h2 = h_from_T_w(Tout, w); const rho = rho_moist(T_wrg, w, P);
    const m_m = (rho * Math.max(0, cas.V||0)) / 3600; const m_da = m_m/(1+w);
    const Q = m_da * (h2 - h_wrg); // kW
    pushUndo(); setProcesses(pr => [...pr, { id: uid(), caseId: cid, type: "heater", p1:{x_gpkg:x,h:h_wrg}, p2:{x_gpkg:x,h:h2} }]);
    addOrUpdatePoint(cid, x, h_wrg, "WRG"); addOrUpdatePoint(cid, x, h2, "ZU");
    setCalcInfo(o => ({ ...o, [cid]: { type:"heater", Q, m_da, Tin: T_wrg, Tout } }));
    setHydroHeat(h => ({ ...h, [cid]: h[cid] ?? { Q_kW: Math.max(0,Q), Ts: 70, Tr: 50 } }));
  };
  const addCoolerAfterWRG = (cid) => {
    const cas = getCase(cid); const P = safe.P*1000;
    const base = wrgByCase[cid] || computeWRG(cid);
    const { w, x, T_wrg, h_wrg } = base; const Tout = cas.Tset;
    if (!(Tout < T_wrg)) return alert("T_set muss < T_WRG sein (Kühlen).");
    const h2 = h_from_T_w(Tout, w); const rho = rho_moist(T_wrg, w, P);
    const m_m = (rho * Math.max(0, cas.V||0)) / 3600; const m_da = m_m/(1+w);
    const Q = m_da * (h2 - h_wrg); // kW (negativ)
    pushUndo(); setProcesses(pr => [...pr, { id: uid(), caseId: cid, type: "cooler", p1:{x_gpkg:x,h:h_wrg}, p2:{x_gpkg:x,h:h2} }]);
    addOrUpdatePoint(cid, x, h_wrg, "WRG"); addOrUpdatePoint(cid, x, h2, "ZU");
    setCalcInfo(o => ({ ...o, [cid]: { type:"cooler", Q, m_da, Tin: T_wrg, Tout } }));
    setHydroCool(h => ({ ...h, [cid]: h[cid] ?? { Q_kW: Math.abs(Q), Ts: 35, Tr: 28 } })); // Default 35/28
  };

  // UI: Inputs & Buttons
  const NumberField = ({ label, unit, value, onCommit, min = -1e9, max = 1e9 }) => {
    const [draft, setDraft] = useState(String(value ?? ""));
    useEffect(() => setDraft(String(value ?? "")), [value]);
    const commit = () => {
      const t = String(draft).replace(",", ".").trim();
      if (t === "" || t === "-" || t === "." || t === "-.") { setDraft(String(value ?? "")); return; }
      const n = parseFloat(t);
      if (!Number.isFinite(n)) { setDraft(String(value ?? "")); return; }
      onCommit(clamp(n, min, max));
    };
    const invalid = (() => { const n = parseFloat(String(draft).replace(",", ".")); return !Number.isFinite(n) ? false : (n < min || n > max); })();
    return (
      <label className="text-sm text-slate-700">
        <div className="mb-1">{label}</div>
        <div className="relative">
          <input type="text" inputMode="decimal"
            value={draft}
            onChange={e=>setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e=>{ if(e.key==="Enter"){ commit(); e.currentTarget.blur(); } }}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none text-base ${invalid?"border-red-400 focus:ring-red-200":"border-slate-300 focus:ring-blue-200"}`} />
          {unit && <span className="absolute right-3 top-2 text-xs text-slate-400 select-none">{unit}</span>}
        </div>
      </label>
    );
  };
  const Button = ({ children, className = "", variant = "default", ...props }) => {
    const styles = {
      default: "bg-slate-900 hover:bg-slate-800 text-white",
      outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
      sky: "bg-sky-400 hover:bg-sky-500 text-white"
    };
    return <button className={`h-10 px-4 rounded-lg text-sm transition-colors ${styles[variant]} ${className}`} {...props}>{children}</button>;
  };
  const Segmented = ({ value, onChange, items }) => (
    // Scrollbar erlaubt auf Handy, kein Zeilenumbruch
    <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <div className="inline-flex whitespace-nowrap rounded-lg border border-slate-300 overflow-hidden">
        {items.map((it, i) => (
          <button key={it.value} onClick={() => onChange(it.value)}
            className={[
              "px-4 h-10 text-sm transition-colors",
              i>0?"border-l border-slate-300":"",
              value===it.value?"bg-slate-900 text-white":"bg-white text-slate-700 hover:bg-slate-50"
            ].join(" ")}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );

  // Cases UI
  const addCase = () => {
    const i = cases.length; const id = `case_${uid()}`;
    let name = window.prompt("Name für neuen Fall (z.B. Winter -10°C / 85%)", `Neuer Fall ${i+1}`);
    if (!name || !name.trim()) name = `Neuer Fall ${i+1}`;
    const newCase = { id, name: name.trim(), color: pickColor(i), T: 0, RH: 50, visible: true, Texh: 22, Eta: 60, Tset: 20, V: 2000 };
    pushUndo(); setCases(prev => [...prev, newCase]); setActiveCaseId(id);
  };
  const removeCase = (id) => {
    if (cases.length <= 1) return;
    pushUndo();
    setCases(prev => prev.filter(c => c.id !== id));
    setPoints(ps => ps.filter(p => p.caseId !== id));
    setProcesses(pr => pr.filter(p => p.caseId !== id));
    setWrgByCase(m => { const mm = { ...m }; delete mm[id]; return mm; });
    setCalcInfo(m => { const mm = { ...m }; delete mm[id]; return mm; });
    setHydroHeat(m => { const mm = { ...m }; delete mm[id]; return mm; });
    setHydroCool(m => { const mm = { ...m }; delete mm[id]; return mm; });
    if (activeCaseId === id) {
      const rest = cases.filter(c => c.id !== id);
      setActiveCaseId(rest[0]?.id || DEFAULT_CASES[0].id);
    }
  };

  const CasesTabs = () => (
    // Tabs horizontal scrollbar auf Handy
    <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <div className="flex items-center gap-2 w-max">
        {cases.map((c, idx) => (
          <div key={c.id} className={`flex items-center gap-2 h-10 pl-2 pr-1 rounded-lg border ${activeCaseId===c.id?"bg-slate-900 text-white border-slate-900":"bg-white text-slate-700 border-slate-300"}`}>
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:c.color}} />
            {editingCaseId===c.id ? (
              <input autoFocus className={`h-7 px-2 rounded ${activeCaseId===c.id?"bg-white/10 text-white placeholder-white/60":"bg-slate-50"}`}
                defaultValue={c.name}
                onBlur={(e)=>{ const v = e.target.value.trim()||c.name; setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,name:v}:cc)); setEditingCaseId(null); }}
                onKeyDown={(e)=>{ if(e.key==='Enter'){ e.currentTarget.blur(); } if(e.key==='Escape'){ setEditingCaseId(null);} }} />
            ) : (
              <button onClick={()=>setActiveCaseId(c.id)} className="px-1 text-sm whitespace-nowrap">{c.name}</button>
            )}
            <button title="Umbenennen" className={`w-6 h-6 rounded ${activeCaseId===c.id?"hover:bg-white/10":"hover:bg-slate-100"}`} onClick={()=>setEditingCaseId(c.id)}>✎</button>
            <button title="Fall schließen" className={`w-6 h-6 rounded ${activeCaseId===c.id?"hover:bg-white/10":"hover:bg-slate-100"}`} onClick={()=>removeCase(c.id)}>×</button>
          </div>
        ))}
        <button onClick={addCase} className="h-10 px-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">+ Neuer Fall</button>
      </div>
    </div>
  );

  // Panels (Hydraulik)
  const HeaterHydraulics = ({ cid }) => {
    const info = calcInfo[cid];
    if (!info || info.type !== "heater") return null;
    const cfg = hydroHeat[cid] || { Q_kW: Math.max(0, info.Q||0), Ts: 70, Tr: 50 };
    const c_w = 4.187; const dT = Math.max(0.1, (cfg.Ts ?? 70) - (cfg.Tr ?? 50));
    const Q_kW = Math.max(0, cfg.Q_kW ?? Math.max(0, info.Q||0));
    const m_kg_s = Q_kW / (c_w * dT); const m_kg_h = m_kg_s * 3600;
    const flowPct = Math.max(0, Math.min(1, m_kg_h / 5000));
    return (
      <div className="mt-6 border-t pt-4">
        <h4 className="font-semibold mb-2">Heizkreis · Massenstrom</h4>
        <p className="text-xs text-slate-500 mb-3">ṁ = (Q·3600)/(c·ΔT), c=4.187 kJ/(kg·K)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumberField label="Heizleistung Q" unit="kW" value={Q_kW} min={0} onCommit={(v)=>setHydroHeat(h=>({ ...h, [cid]: { ...(h[cid]||{}), Q_kW: v } }))} />
          <NumberField label="Vorlauftemperatur" unit="°C" value={cfg.Ts ?? 70} onCommit={(v)=>setHydroHeat(h=>({ ...h, [cid]: { ...(h[cid]||{}), Ts: v } }))} />
          <NumberField label="Rücklauftemperatur" unit="°C" value={cfg.Tr ?? 50} onCommit={(v)=>setHydroHeat(h=>({ ...h, [cid]: { ...(h[cid]||{}), Tr: v } }))} />
          <label className="text-sm text-slate-700">
            <div className="mb-1">ΔT</div>
            <div className="h-10 px-3 py-2 border rounded-lg bg-slate-50 flex items-center">{dT.toFixed(1)} K</div>
          </label>
        </div>
        <div className="mt-4 w-full h-3 rounded-full bg-slate-200 overflow-hidden relative">
          <div style={{ width: `${Math.max(6, flowPct*100)}%`, height: "100%", backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0.08) 0 10px, rgba(0,0,0,0.02) 10px 20px)", animation: "flowMove 1.2s linear infinite" }} />
        </div>
        <style>{`@keyframes flowMove{to{background-position:-200px 0}}`}</style>
        <div className="mt-3 text-sm bg-amber-50 border border-amber-200 px-3 py-2 rounded">Ergebnis: <strong>ṁ ≈ {m_kg_h.toFixed(0)} kg/h</strong> ({m_kg_s.toFixed(3)} kg/s)</div>
      </div>
    );
  };

  const CoolerHydraulics = ({ cid }) => {
    const info = calcInfo[cid];
    if (!info || info.type !== "cooler") return null;
    const cfg = hydroCool[cid] || { Q_kW: Math.abs(info.Q||0), Ts: 35, Tr: 28 }; // Default 35/28
    const c_w = 4.187; const dT = Math.max(0.1, (cfg.Ts ?? 35) - (cfg.Tr ?? 28));
    const Qabs_kW = Math.max(0, cfg.Q_kW ?? Math.abs(info.Q||0));
    const m_kg_s = Qabs_kW / (c_w * dT); const m_kg_h = m_kg_s * 3600;
    const flowPct = Math.max(0, Math.min(1, m_kg_h / 5000));
    return (
      <div className="mt-6 border-t pt-4">
        <h4 className="font-semibold mb-2">Kaltwasserkreis · Massenstrom</h4>
        <p className="text-xs text-slate-500 mb-3">ṁ = (|Q|·3600)/(c·ΔT) · Default VL/RL = 35/28 °C</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumberField label="Kälteleistung |Q|" unit="kW" value={Qabs_kW} min={0} onCommit={(v)=>setHydroCool(h=>({ ...h, [cid]: { ...(h[cid]||{}), Q_kW: v } }))} />
          <NumberField label="Vorlauf (VL)" unit="°C" value={cfg.Ts ?? 35} onCommit={(v)=>setHydroCool(h=>({ ...h, [cid]: { ...(h[cid]||{}), Ts: v } }))} />
          <NumberField label="Rücklauf (RL)" unit="°C" value={cfg.Tr ?? 28} onCommit={(v)=>setHydroCool(h=>({ ...h, [cid]: { ...(h[cid]||{}), Tr: v } }))} />
          <label className="text-sm text-slate-700">
            <div className="mb-1">ΔT</div>
            <div className="h-10 px-3 py-2 border rounded-lg bg-slate-50 flex items-center">{dT.toFixed(1)} K</div>
          </label>
        </div>
        <div className="mt-4 w-full h-3 rounded-full bg-slate-200 overflow-hidden relative">
          <div style={{ width: `${Math.max(6, flowPct*100)}%`, height: "100%", backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0.08) 0 10px, rgba(0,0,0,0.02) 10px 20px)", animation: "flowMove 1.2s linear infinite" }} />
        </div>
        <div className="mt-3 text-sm bg-sky-50 border border-sky-200 px-3 py-2 rounded">Ergebnis: <strong>ṁ ≈ {m_kg_h.toFixed(0)} kg/h</strong> ({m_kg_s.toFixed(3)} kg/s)</div>
      </div>
    );
  };

  const CasesPanel = () => {
    const c = getCase(activeCaseId); const info = calcInfo[c.id]; const wrg = wrgByCase[c.id];
    return (
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <h3 className="font-semibold mb-3">Aktiver Fall · Außenluft</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumberField label="Außenluft T" unit="°C" value={c.T} onCommit={(v)=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,T:v}:cc))} />
          <NumberField label="Außenluft φ" unit="%" value={c.RH} min={0} max={100} onCommit={(v)=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,RH:v}:cc))} />
          <NumberField label="Volumenstrom" unit="m³/h" value={c.V} min={0} onCommit={(v)=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,V:v}:cc))} />
          <label className="text-sm text-slate-700 flex items-end">
            <span className="mr-2">Sichtbar</span>
            <input type="checkbox" className="h-10 w-10" checked={c.visible} onChange={e=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,visible:e.target.checked}:cc))}/>
          </label>
        </div>

        <div className="mt-5 border-t pt-4">
          <h4 className="font-semibold mb-2">WRG + Nachbehandlung (Quick)</h4>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Abluft T_exh" unit="°C" value={c.Texh} onCommit={(v)=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,Texh:v}:cc))} />
            <NumberField label="WRG ε sensibel" unit="%" value={c.Eta} min={0} max={95} onCommit={(v)=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,Eta:v}:cc))} />
            <NumberField label="Zuluft Soll T_set" unit="°C" value={c.Tset} onCommit={(v)=>setCases(prev=>prev.map(cc=>cc.id===c.id?{...cc,Tset:v}:cc))} />
          </div>
          <div className="mt-3"><Button variant="sky" onClick={()=>simulateCaseWRG(c.id)}>Simulieren → WRG & Nachgerät</Button></div>
          {wrg && <p className="mt-2 text-xs text-slate-600">T_WRG ≈ {wrg.T_wrg.toFixed(1)}°C (w={wrg.w.toFixed(4)} kg/kg, x={wrg.x.toFixed(2)} g/kg)</p>}
        </div>

        {c.id === "winter" ? (
          <div className="mt-6 border-t pt-4">
            <h4 className="font-semibold mb-2">Lufterhitzer hinzufügen</h4>
            <p className="text-xs text-slate-500 mb-2">Eintritt = T_WRG, Austritt = T_set, Q = ṁ_da·Δh</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={()=>addHeaterAfterWRG(c.id)}>Heizer hinzufügen</Button>
              {info && info.type==='heater' && (
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                  Q ≈ {info.Q.toFixed(2)} kW · ṁ_da ≈ {info.m_da.toFixed(3)} kg/s · {info.Tin.toFixed(1)}°C → {info.Tout.toFixed(1)}°C
                </div>
              )}
            </div>
            <HeaterHydraulics cid={c.id} />
          </div>
        ) : (
          <div className="mt-6 border-t pt-4">
            <h4 className="font-semibold mb-2">Luftkühler hinzufügen</h4>
            <p className="text-xs text-slate-500 mb-2">Eintritt = T_WRG, Austritt = T_set, Kälteleistung = ṁ_da·Δh</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={()=>addCoolerAfterWRG(c.id)}>Kühler hinzufügen</Button>
              {info && info.type==='cooler' && (
                <div className="text-sm text-sky-700 bg-sky-50 border border-sky-200 px-2 py-1 rounded">
                  Q ≈ {info.Q.toFixed(2)} kW (neg.) · ṁ_da ≈ {info.m_da.toFixed(3)} kg/s · {info.Tin.toFixed(1)}°C → {info.Tout.toFixed(1)}°C
                </div>
              )}
            </div>
            <CoolerHydraulics cid={c.id} />
          </div>
        )}
      </div>
    );
  };

  const DiagramPanel = () => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
      <h3 className="font-semibold mb-3">Diagramm</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberField label="Druck" unit="kPa" value={p_kPa} min={30} max={120} onCommit={setP} />
        <NumberField label="x max" unit="g/kg" value={xMax} min={5} max={50} onCommit={(v)=>setXMax(Math.max(1,v))} />
        <NumberField label="T min" unit="°C" value={tMin} onCommit={setTMin} />
        <NumberField label="T max" unit="°C" value={tMax} onCommit={setTMax} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-700 items-center">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showT} onChange={e=>setShowT(e.target.checked)}/>Isothermen</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showRH} onChange={e=>setShowRH(e.target.checked)}/>φ-Kurven</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showSat} onChange={e=>setShowSat(e.target.checked)}/>Sättigung</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showPointLabels} onChange={e=>setShowPointLabels(e.target.checked)}/>Punkt-Labels</label>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Label-Modus</span>
          <Segmented value={labelMode} onChange={setLabelMode}
            items={[{ value: "index", label: "P#" }, { value: "semantic", label: "OA/WRG/ZU" }]} />
        </div>
      </div>
    </div>
  );

  // ---------- CANVAS RENDER ----------
  const lineHit = (x1,y1,x2,y2, px,py) => {
    const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1; const dot=A*C+B*D, lenSq=C*C+D*D; let t=lenSq?dot/lenSq:-1;
    t=Math.max(0,Math.min(1,t)); const lx=x1+t*C, ly=y1+t*D; const dx=px-lx, dy=py-ly;
    return { d:Math.hypot(dx,dy), lx, ly };
  };

  const startAnim = () => { if (!animRef.current) { const step=()=>{ animRef.current=requestAnimationFrame(step); draw(true); }; animRef.current=requestAnimationFrame(step);} };
  const stopAnim = () => { if (animRef.current) cancelAnimationFrame(animRef.current); animRef.current=null; };

  const draw = useCallback((force=false) => {
    const c = canvasRef.current; if (!c) return;
    try {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.floor(r.width));
      const H = Math.max(1, Math.floor(r.height));
      const now = performance.now();

      // Pads/Plot – auf Handy enger
      const isMobile = W < 640;
      const pad = { left: isMobile ? 86 : 130, right: isMobile ? 54 : 90, top: isMobile ? 42 : 54, bottom: isMobile ? 40 : 44 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;
      if (plotW <= 10 || plotH <= 10) return;

      if (force || lastSizeRef.current.W !== W || lastSizeRef.current.H !== H || lastSizeRef.current.dpr !== dpr || c.width !== W*dpr || c.height !== H*dpr) {
        c.width = W*dpr; c.height = H*dpr; lastSizeRef.current = { W, H, dpr };
      }

      const ctx = c.getContext("2d");
      ctx.setTransform(dpr,0,0,dpr,0,0);

      const x2px = (x) => pad.left + (x / safe.X) * plotW;
      const y2py = (y) => pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
      const px2x = (px) => ((px - pad.left) / plotW) * safe.X;
      const py2y = (py) => yMin + (1 - (py - pad.top) / plotH) * (yMax - yMin);

      // bg
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);

      // Grid
      ctx.lineWidth = 1; ctx.font = isMobile ? "11px system-ui" : "12px system-ui";
      for (let x = 0; x <= safe.X; x += 2) {
        const px = x2px(x);
        ctx.strokeStyle = x % 10 === 0 ? "#cbd5e1" : "#eef2f7";
        ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, pad.top + plotH); ctx.stroke();
        if (x % 10 === 0) { ctx.fillStyle = "#334155"; ctx.textAlign = "center"; ctx.fillText(String(x), px, pad.top + plotH + (isMobile?16:20)); }
      }
      const yStep = 5; const yStart = Math.ceil(yMin / yStep) * yStep;
      for (let y = yStart; y <= yMax; y += yStep) {
        const py = y2py(y);
        ctx.strokeStyle = Math.round(y) % 20 === 0 ? "#cbd5e1" : "#eef2f7";
        ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(pad.left + plotW, py); ctx.stroke();
        if (Math.round(y) % 10 === 0) { ctx.fillStyle = "#334155"; ctx.textAlign = "right"; ctx.fillText(String(y), pad.left - (isMobile?16:20), py + 4); }
      }

      // Achsen
      ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.font = isMobile ? "12px system-ui" : "13px system-ui";
      ctx.fillText("x  [g/kg trockene Luft]", pad.left + plotW / 2, H - (isMobile?6:8));
      ctx.save(); ctx.translate(isMobile?20:24, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText("h  [kJ/kg trockene Luft]", 0, 0); ctx.restore();

      // Hover-Koords (einmal!)
      const hoverPxPy = (() => { if (!c._hoverXY) return null; const { x, h } = c._hoverXY; return { px: x2px(x), py: y2py(h) }; })();
      let hoverIso = null, hoverPhi = null;

      // Isothermen (und Näherung für Tooltip)
      if (showT) {
        ctx.strokeStyle = "#0ea5e9"; ctx.lineWidth = 1.05;
        for (let T = safe.tLo; T <= safe.tHi; T += 5) {
          const X1 = x2px(0), Y1 = y2py(h_from_T_w(T,0)); const X2 = x2px(safe.X), Y2 = y2py(h_from_T_w(T,safe.X/1000));
          ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
          if (hoverPxPy) { const hit = lineHit(X1,Y1,X2,Y2, hoverPxPy.px, hoverPxPy.py); if (!hoverIso || hit.d < hoverIso.d) hoverIso = { d: hit.d, T, at:{ x: hit.lx, y: hit.ly } }; }
        }
      }

      // φ-Kurven (und Näherung für Tooltip)
      if (showRH) {
        const P = safe.P * 1000; ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1;
        for (let RH = 0; RH <= 100; RH += 10) {
          let started=false, prevX=null, prevY=null; let bestLocal=null;
          for (let T = safe.tLo; T <= safe.tHi; T += 1) {
            const w = w_from_T_RH(T, RH, P), x = 1000*w; if (!Number.isFinite(w) || x > safe.X) continue;
            const h = h_from_T_w(T, w), X = x2px(x), Y = y2py(h);
            if (!started) { ctx.beginPath(); ctx.moveTo(X,Y); started=true; } else { ctx.lineTo(X,Y); }
            if (hoverPxPy && prevX!==null) { const hit = lineHit(prevX, prevY, X, Y, hoverPxPy.px, hoverPxPy.py); if (!bestLocal || hit.d < bestLocal.d) bestLocal = { d: hit.d, RH, at:{ x: hit.lx, y: hit.ly } }; }
            prevX = X; prevY = Y;
          }
          started && ctx.stroke();
          if (bestLocal && (!hoverPhi || bestLocal.d < hoverPhi.d)) hoverPhi = bestLocal;
        }
      }

      // Sättigung
      if (showSat) {
        const P = safe.P * 1000; ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2;
        ctx.beginPath(); let started=false;
        for (let T = safe.tLo; T <= safe.tHi; T += 0.5) {
          const w = w_from_T_RH(T, 100, P), x = 1000*w; if (!Number.isFinite(w) || x > safe.X) continue;
          const h = h_from_T_w(T, w), X = x2px(x), Y = y2py(h);
          if (!started) { ctx.moveTo(X,Y); started=true; } else { ctx.lineTo(X,Y); }
        }
        started && ctx.stroke();
      }

      // helper arrow
      const drawArrowHead = (x1,y1,x2,y2,color) => {
        const ang = Math.atan2(y2-y1, x2-x1);
        const size = 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - size*Math.cos(ang - Math.PI/8), y2 - size*Math.sin(ang - Math.PI/8));
        ctx.lineTo(x2 - size*Math.cos(ang + Math.PI/8), y2 - size*Math.sin(ang + Math.PI/8));
        ctx.closePath(); ctx.fill();
      };

      // Prozesse
      for (const pr of processes) {
        if (!visibleCaseIds.includes(pr.caseId)) continue;
        const cas = getCase(pr.caseId);
        const x1 = x2px(pr.p1.x_gpkg), y1 = y2py(pr.p1.h);
        const x2 = x2px(pr.p2.x_gpkg), y2 = y2py(pr.p2.h);

        ctx.strokeStyle = cas.color; ctx.lineWidth = 8; ctx.globalAlpha = 0.14;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.lineWidth = 3;
        if (pr.type === "cooler") ctx.setLineDash([8,4]);
        else if (pr.type === "wrg") ctx.setLineDash([3,3]);
        else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle = cas.color; ctx.stroke();
        ctx.setLineDash([]);
        drawArrowHead(x1,y1,x2,y2, cas.color);
      }

      // Drag-Vorschau
      if (dragRef.current.mode === "dragProc") {
        const cas = getCase(activeCaseId);
        const phase = (now / 120) % 20;
        const x1 = x2px(dragRef.current.x1), y1 = y2py(dragRef.current.h1);
        const x2 = x2px(dragRef.current.x2), y2 = y2py(dragRef.current.h2);

        ctx.strokeStyle = cas.color; ctx.lineWidth = 10; ctx.globalAlpha = 0.12;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.globalAlpha = 1;

        ctx.save();
        ctx.strokeStyle = cas.color; ctx.lineWidth = 4;
        ctx.setLineDash([10,6]); ctx.lineDashOffset = -phase;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.restore();

        drawArrowHead(x1,y1,x2,y2, cas.color);

        const r2 = 6 + 2 * Math.sin(now/150);
        ctx.beginPath(); ctx.arc(x2, y2, r2, 0, Math.PI*2);
        ctx.fillStyle = cas.color; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1; ctx.stroke();
      }

      // Punkte
      const getLbl = (p, i) => !showPointLabels ? null : (labelMode==="index" ? `P${i+1}` : (p.label || `P${i+1}`));
      for (let i=0;i<points.length;i++) {
        const p = points[i]; if (!visibleCaseIds.includes(p.caseId)) continue;
        const cas = getCase(p.caseId); const px = x2px(p.x_gpkg), py = y2py(p.h);
        ctx.fillStyle = cas.color; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        const lbl = getLbl(p,i); if (lbl) { ctx.font = isMobile ? "11px system-ui" : "12px system-ui"; ctx.textAlign = "left"; ctx.fillStyle = "#0f172a"; ctx.fillText(lbl, px + 10, py - 6); }
      }

      // Crosshair
      if (c._hoverXY) {
        const { x, h } = c._hoverXY;
        if (x>=0 && x<=safe.X && h>=yMin && h<=yMax) {
          ctx.strokeStyle = "#94a3b8"; ctx.setLineDash([4,4]);
          ctx.beginPath(); ctx.moveTo(x2px(x), pad.top); ctx.lineTo(x2px(x), pad.top+plotH); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(pad.left, y2py(h)); ctx.lineTo(pad.left+plotW, y2py(h)); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Tooltips (jetzt wirklich gerendert)
      const tooltip = (text, x, y) => {
        const padBox = 6; ctx.font = isMobile ? "11px system-ui" : "12px system-ui"; const tw = ctx.measureText(text).width; const th = 18;
        ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(x - padBox, y - th, tw + 2*padBox, th + 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#111827"; ctx.textAlign = "left"; ctx.fillText(text, x, y - 2);
      };
      const HIT_PX = 8;
      if (hoverPxPy) {
        if (hoverIso && hoverIso.d <= HIT_PX) tooltip(`T ≈ ${hoverIso.T}°C`, hoverIso.at.x + 12, hoverIso.at.y - 8);
        if (hoverPhi && hoverPhi.d <= HIT_PX) tooltip(`φ ≈ ${hoverPhi.RH}%`, hoverPhi.at.x + 12, hoverPhi.at.y - 8);
      }

      // expose
      c._px2x = px2x; c._py2y = py2y; c._x2px = x2px; c._y2py = y2py;
    } catch (err) {
      const c2 = canvasRef.current; if (!c2) return;
      const ctx = c2.getContext("2d");
      ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c2.width,c2.height);
      ctx.fillStyle="#ef4444"; ctx.font="14px system-ui";
      ctx.fillText("Zeichenfehler abgefangen – Eingaben prüfen (NaN).", 16, 24);
      console.error("HxDiagram draw error:", err);
    }
  }, [safe, yMin, yMax, showT, showRH, showSat, showPointLabels, labelMode, points, processes, cases, activeCaseId]);

  // resize & observer
  useEffect(() => {
    const onR = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw(true); }); };
    draw(true); window.addEventListener("resize", onR);
    const c = canvasRef.current; let ro; if (c && "ResizeObserver" in window) { ro = new ResizeObserver(onR); ro.observe(c); }
    return () => { window.removeEventListener("resize", onR); if (rafRef.current) cancelAnimationFrame(rafRef.current); if (ro) ro.disconnect(); stopAnim(); };
  }, [draw]);

  // pointer events
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;

    const schedule = () => { if (!rafRef.current) { rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw(); }); } };
    const updateHover = (clientX, clientY) => { const r = c.getBoundingClientRect(); const x = c._px2x?.(clientX - r.left) ?? 0; const h = c._py2y?.(clientY - r.top) ?? 0; c._hoverXY = { x, h }; };

    const onPointerMove = (e) => {
      if (dragRef.current.mode === "dragProc") {
        const r = c.getBoundingClientRect();
        const xCur = clamp(c._px2x?.(e.clientX - r.left) ?? 0, 0, xMax);
        const hCur = clamp(c._py2y?.(e.clientY - r.top) ?? 0, yMin, yMax);
        if (dragRef.current.type === TOOLS.ADIABATIC) {
          dragRef.current.x2 = xCur; // horizontal
          dragRef.current.h2 = dragRef.current.h1;
        } else {
          dragRef.current.h2 = hCur; // vertikal
          dragRef.current.x2 = dragRef.current.x1;
        }
      } else {
        updateHover(e.clientX, e.clientY);
        schedule();
      }
    };

    const onPointerDown = (e) => {
      const r = c.getBoundingClientRect();
      const x = clamp(c._px2x?.(e.clientX - r.left) ?? 0, 0, xMax);
      const h = clamp(c._py2y?.(e.clientY - r.top) ?? 0, yMin, yMax);
      if (tool === TOOLS.POINT) { pushUndo(); setPoints(ps => [...ps, { id: uid(), caseId: activeCaseId, x_gpkg: x, h }]); schedule(); return; }
      if (tool === TOOLS.HEATER || tool === TOOLS.COOLER || tool === TOOLS.ADIABATIC) {
        try { c.setPointerCapture?.(e.pointerId); } catch {}
        dragRef.current = { mode: "dragProc", type: tool, x1: x, x2: x, h1: h, h2: h };
        startAnim();
      }
    };

    const onPointerUp = (e) => {
      if (dragRef.current.mode !== "dragProc") return;
      let { x1, x2, h1, h2, type } = dragRef.current;

      const MIN_DH = 0.25;  // kJ/kg
      const MIN_DX = 0.1;   // g/kg

      if (type === TOOLS.HEATER) {
        if (!(h2 > h1 + 0.02)) h2 = Math.min(yMax, h1 + MIN_DH);
        x2 = x1;
      } else if (type === TOOLS.COOLER) {
        if (!(h2 < h1 - 0.02)) h2 = Math.max(yMin, h1 - MIN_DH);
        x2 = x1;
      } else if (type === TOOLS.ADIABATIC) {
        if (!(x2 > x1 + 0.005)) x2 = Math.min(xMax, x1 + MIN_DX);
        h2 = h1;
      }

      pushUndo();
      setProcesses(pr => [...pr, { id: uid(), caseId: activeCaseId, type, p1:{x_gpkg:x1,h:h1}, p2:{x_gpkg:x2,h:h2} }]);

      dragRef.current.mode = "none";
      try { c.releasePointerCapture?.(e.pointerId); } catch {}
      stopAnim();
      schedule();
    };

    const onPointerLeave = () => { if (c) { c._hoverXY = null; schedule(); } };
    const onKeyDown = (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)))) { e.preventDefault(); doRedo(); }
      else if (e.key === "Escape") { dragRef.current.mode = "none"; stopAnim(); schedule(); }
    };

    c.addEventListener("pointermove", onPointerMove, { passive: true });
    c.addEventListener("pointerdown", onPointerDown);
    c.addEventListener("pointerup", onPointerUp);
    c.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      c.removeEventListener("pointermove", onPointerMove);
      c.removeEventListener("pointerdown", onPointerDown);
      c.removeEventListener("pointerup", onPointerUp);
      c.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [draw, tool, activeCaseId, xMax, yMin, yMax]);

  // Export SVG→PDF
  const buildSVG = () => {
    const W = 2200, H = 1500;
    const padL = 150, padR = 110, padT = 70, padB = 48;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x2px = (x) => padL + (x / safe.X) * plotW;
    const y2py = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;
    const P = safe.P * 1000;

    const pathIsoT = (T) => `M ${x2px(0)} ${y2py(h_from_T_w(T,0))} L ${x2px(safe.X)} ${y2py(h_from_T_w(T,safe.X/1000))}`;
    const pathRH = (RH, step=1) => { let d = "", first = true; for (let T = safe.tLo; T <= safe.tHi; T += step) { const w = w_from_T_RH(T, RH, P), x = 1000*w; if (!Number.isFinite(w) || x > safe.X) continue; const X = x2px(x), Y = y2py(h_from_T_w(T, w)); d += first ? `M ${X.toFixed(1)} ${Y.toFixed(1)}` : ` L ${X.toFixed(1)} ${Y.toFixed(1)}`; first = false; } return d; };

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="#fff"/>`;

    for (let x = 0; x <= safe.X; x += 2) { const col = x % 10 === 0 ? "#cbd5e1" : "#eef2f7"; svg += `
<line x1="${x2px(x)}" y1="${padT}" x2="${x2px(x)}" y2="${padT + plotH}" stroke="${col}" stroke-width="1"/>`; if (x % 10 === 0) svg += `
<text x="${x2px(x)}" y="${padT + plotH + 22}" text-anchor="middle" fill="#334155" font-size="16">${x}</text>`; }
    for (let y = Math.ceil(yMin / 5) * 5; y <= yMax; y += 5) { const col = Math.round(y) % 20 === 0 ? "#cbd5e1" : "#eef2f7"; svg += `
<line x1="${padL}" y1="${y2py(y)}" x2="${padL + plotW}" y2="${y2py(y)}" stroke="${col}" stroke-width="1"/>`; if (Math.round(y) % 10 === 0) svg += `
<text x="${padL - 16}" y="${y2py(y) + 4}" text-anchor="end" fill="#334155" font-size="16">${y}</text>`; }

    if (showT) for (let T = safe.tLo; T <= safe.tHi; T += 5) svg += `
<path d="${pathIsoT(T)}" stroke="#0ea5e9" stroke-width="1.05" fill="none"/>`;
    if (showRH) for (let RH = 0; RH <= 100; RH += 10) svg += `
<path d="${pathRH(RH,1)}" stroke="#8b5cf6" stroke-width="1" fill="none"/>`;
    if (showSat) svg += `
<path d="${pathRH(100,0.5)}" stroke="#ef4444" stroke-width="2" fill="none"/>`;

    const visibleSet = cases.filter(c=>c.visible).map(c=>c.id);
    for (const pr of processes) {
      if (!visibleSet.includes(pr.caseId)) continue; const cas = getCase(pr.caseId);
      let dash=""; if (pr.type==='cooler') dash=" stroke-dasharray=\"8 4\""; else if (pr.type==='wrg') dash=" stroke-dasharray=\"3 3\"";
      svg += `
<g>
  <line x1="${x2px(pr.p1.x_gpkg)}" y1="${y2py(pr.p1.h)}" x2="${x2px(pr.p2.x_gpkg)}" y2="${y2py(pr.p2.h)}" stroke="${cas.color}" stroke-width="8" opacity="0.14"/>
  <line x1="${x2px(pr.p1.x_gpkg)}" y1="${y2py(pr.p1.h)}" x2="${x2px(pr.p2.x_gpkg)}" y2="${y2py(pr.p2.h)}" stroke="${cas.color}" stroke-width="3"${dash}/>
</g>`;
    }

    for (let i=0;i<points.length;i++) {
      const p = points[i]; if (!visibleSet.includes(p.caseId)) continue; const cas = getCase(p.caseId);
      const lbl = (labelMode==="index") ? `P${i+1}` : (p.label ? p.label : `P${i+1}`);
      svg += `
<circle cx="${x2px(p.x_gpkg)}" cy="${y2py(p.h)}" r="6" fill="${cas.color}" stroke="#0f172a" stroke-width="1.5"/>`;
      if (showPointLabels) svg += `
<text x="${x2px(p.x_gpkg)+10}" y="${y2py(p.h)-6}" text-anchor="start" fill="#0f172a" font-size="15">${lbl}</text>`;
    }

    svg += `
<text x="${padL + plotW / 2}" y="${H - 14}" text-anchor="middle" fill="#0f172a" font-size="18">x  [g/kg trockene Luft]</text>`;
    svg += `
<g transform="translate(26 ${padT + plotH / 2}) rotate(-90)"><text text-anchor="middle" fill="#0f172a" font-size="18">h  [kJ/kg trockene Luft]</text></g>`;
    svg += `
</svg>`;
    return svg;
  };

  const exportPDF = () => {
    const svg = buildSVG();
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>@page{size:A3 landscape;margin:0}html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;background:#fff}svg{width:100%;height:auto}</style></head><body onload="setTimeout(()=>{print()},120)">${svg}</body></html>`;
    const w = window.open("", "_blank"); if (!w) return alert("Popup-Blocker?");
    w.document.open(); w.document.write(html); w.document.close();
  };

  // ---------- MAIN LAYOUT ----------
  const CanvasBlock = () => (
    <div className="p-2 md:p-3">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-slate-200 bg-white
                   h-[65vh] min-h-[360px] md:h-[1100px] xl:h-[1500px]"
        style={{ cursor: tool==="point" ? "crosshair" : (tool==="adiabatic" ? "ew-resize" : "ns-resize"), touchAction: "none" }}
      />
    </div>
  );

  const PointsPanel = () => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
      <h3 className="font-semibold mb-3">Punkte (gesamt: {points.length})</h3>
      {points.length===0 ? (
        <p className="text-sm text-slate-500">Noch keine Punkte. Tool „Punkt“ oder Simulation erzeugt OA/WRG/ZU.</p>
      ) : (
        <ul className="text-sm divide-y divide-slate-200 max-h-[55vh] md:max-h-[32rem] overflow-auto">
          {points.map((p, i) => {
            const cas = getCase(p.caseId);
            const w = Math.max(0, p.x_gpkg/1000);
            const T = T_from_h_w(p.h, w);
            const phi = RH_from_T_w(T, w, safe.P*1000);
            return (
              <li key={p.id} className="py-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-semibold" style={{background:cas.color}}>{i+1}</span>
                <div className="flex-1">
                  <div className="font-medium">
                    P{i+1}{p.label ? ` · ${p.label}`:""} · T={T.toFixed(1)}°C · φ={clamp(phi,0,100).toFixed(0)}% · h={p.h.toFixed(1)} kJ/kg · x={p.x_gpkg.toFixed(2)} g/kg
                    <span className="text-slate-500 text-xs ml-2">({cas.name})</span>
                  </div>
                </div>
                <Button variant="outline" className="h-8 px-3" onClick={()=>{ pushUndo(); setPoints(ps => ps.filter(pp => pp.id !== p.id)); }}>Löschen</Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const ProcsPanel = () => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
      <h3 className="font-semibold mb-3">Prozesse (gesamt: {processes.length})</h3>
      {processes.length===0 ? (
        <p className="text-sm text-slate-500">Noch keine Prozesse. Heizen/Kühlen/Adiabatisch ziehen oder Simulation/Buttons nutzen.</p>
      ) : (
        <ul className="text-sm divide-y divide-slate-200 max-h-[55vh] md:max-h-[32rem] overflow-auto">
          {processes.map((pr, idx) => {
            const cas = getCase(pr.caseId);
            const w = Math.max(0, pr.p1.x_gpkg/1000);
            const T1 = T_from_h_w(pr.p1.h, w); const T2 = T_from_h_w(pr.p2.h, w);
            const phi1 = RH_from_T_w(T1, w, safe.P*1000); const phi2 = RH_from_T_w(T2, w, safe.P*1000);
            const title = pr.type==='heater'?"Heizen": pr.type==='cooler'?"Kühlen": pr.type==='wrg'?"WRG":"Adiabatisch";
            return (
              <li key={pr.id} className="py-2">
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-semibold" style={{background:cas.color}}>{idx+1}</span>
                  <div className="flex-1">
                    <div className="font-medium">{title} · x={pr.p1.x_gpkg.toFixed(2)} g/kg → {pr.p2.x_gpkg.toFixed(2)} g/kg <span className="text-slate-500 text-xs">({cas.name})</span></div>
                    <div className="text-slate-600">T₁={T1.toFixed(1)}°C / φ₁={clamp(phi1,0,100).toFixed(0)}% → T₂={T2.toFixed(1)}°C / φ₂={clamp(phi2,0,100).toFixed(0)}% · ΔT={(T2-T1).toFixed(1)} K</div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" className="h-8 px-3" onClick={()=>{ pushUndo(); setProcesses(arr => arr.filter(p => p.id !== pr.id)); }}>Löschen</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const Main = () => (
    <div className="mx-auto p-3 md:p-5 max-w-none">
      {/* Topbar */}
      <div className="mb-3 md:mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={tool} onChange={setTool} items={[
          { value: TOOLS.HEATER,    label: "Heizen (↑)" },
          { value: TOOLS.COOLER,    label: "Kühlen (↓)" },
          { value: TOOLS.ADIABATIC, label: "Adiabatisch (→)" },
          { value: TOOLS.POINT,     label: "Punkt" }
        ]} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={doUndo} title="Rückgängig (Strg/⌘+Z)">Undo</Button>
          <Button variant="outline" onClick={doRedo} title="Wiederholen (Strg/⌘+Umsch+Z)">Redo</Button>
          <Button variant="outline" onClick={()=>{ pushUndo(); setPoints([]); setProcesses([]); setWrgByCase({}); setCalcInfo({}); setHydroHeat({}); setHydroCool({}); }}>Reset</Button>
          <Button variant="outline" onClick={exportPDF}>PDF</Button>
        </div>
      </div>

      <div className="mb-3"><CasesTabs /></div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 mb-4">
        <CasesPanel />
        <DiagramPanel />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex items-center">
          <div>
            <h3 className="text-lg font-semibold">Mollier h–x Diagramm ({safe.P} kPa)</h3>
            <p className="text-sm text-slate-600">Bereich: {safe.tLo}…{safe.tHi} °C · 0…{safe.X} g/kg</p>
          </div>
          <div className="ml-auto hidden md:flex items-center gap-3 text-xs text-slate-500">
            <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50">Heizen: ↑ · Kühlen: ↓ · Adiabatisch: → · Punkt: Klick</span>
            <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50">Undo/Redo: Strg/⌘+Z / Strg/⌘+Y</span>
          </div>
        </div>
        <CanvasBlock />
      </div>

      <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <PointsPanel />
        <ProcsPanel />
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <header className="bg-white border-b border-slate-200 p-4 md:p-5 sticky top-0 z-40">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Mollier h–x Diagramm · Fälle (Außenluft, WRG quick)</h1>
          <p className="text-slate-600 text-sm md:text-base">OA/WRG/ZU · Heizer/Kühler/Adiabatisch · Hydraulik (Heiz & Kaltwasser 35/28) · PDF</p>
        </header>
        <Main />
      </div>
    );
  }
  return <Main />;
}
