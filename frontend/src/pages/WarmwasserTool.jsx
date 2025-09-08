import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, LabelList,
  LineChart, Line, ReferenceLine,
} from "recharts";

/* ---------------- Lookup ---------------- */
const GEBTYP = [
  { key: "EFH_einfach", label: "EFH einfacher Standard", avg_lpd: 40, peak_lpd: 50 },
  { key: "EFH_mittel",  label: "EFH mittlerer Standard", avg_lpd: 45, peak_lpd: 60 },
  { key: "EFH_gehoben", label: "EFH gehobener Standard", avg_lpd: 55, peak_lpd: 70 },
  { key: "EW_einfach",  label: "Eigentumswohnung einfacher Standard", avg_lpd: 40, peak_lpd: 50 },
  { key: "EW_mittel",   label: "Eigentumswohnung mittlerer Standard", avg_lpd: 45, peak_lpd: 60 },
  { key: "EW_gehoben",  label: "Eigentumswohnung gehobener Standard", avg_lpd: 55, peak_lpd: 70 },
  { key: "MFH_allg",    label: "MFH allgemeiner Wohnungsbau", avg_lpd: 35, peak_lpd: 45 },
  { key: "MFH_gehoben", label: "MFH gehobener Wohnungsbau", avg_lpd: 45, peak_lpd: 60 },
];

const WARMHALTE = [
  { key: "zirkulation",   label: "Zirkulation",   f: 1.5 },
  { key: "warmhalteband", label: "Warmhalteband", f: 1.35 },
];

const SPEICHERKFG = [
  { key: "innenWT",  label: "Innenliegender Wärmetauscher", f: 1.25 },
  { key: "aussenWT", label: "Aussenliegender Wärmetauscher", f: 1.10 },
];

// Leitungsverluste [kWh/(m*d)]
const LOSS_CONV = 0.12, LOSS_RAR = 0.15;
// Speicherverluste
const C1 = 0.11, C2 = 0.10, V0 = 1;
// r*cp für QW (kWh/K pro Liter)
const RCP_KWH_PER_K = 1.16e-3;
// cp (kJ/kgK) für QA
const CP_KJ_PER_KG_K = 4.187;

/* ---------------- Utils ---------------- */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const mround05 = (kW) => Math.round(kW * 2) / 2;

function personsFromANF(anf) {
  const A = Number(anf);
  if (!isFinite(A) || A <= 0) return 0;
  const t = (A / 100) ** 3;
  return Math.max(0, 3.3 - 2 / (1 + t));
}
// f_pk Tabelle (nachempfunden, n=1..400)
function buildPeakFactorTable(maxN = 400) {
  const m = new Map();
  const seeds = [0,1.5,0.83,0.67,0.58,0.56,0.55,0.54,0.54,0.53,0.53,0.53,0.52,0.52,0.52,0.51,0.51,0.51,0.50,0.50,0.50,0.50,0.49,0.49,0.49];
  for (let n=1;n<seeds.length;n++) m.set(n,seeds[n]);
  let last = seeds[seeds.length-1];
  for (let n=seeds.length;n<=maxN;n++){ last = Math.max(0.45,last-0.0015); m.set(n,last); }
  return m;
}
const PEAK = buildPeakFactorTable(400);
const fpk = (np) => PEAK.get(clamp(Math.round(np),1,400)) ?? 0.5;

// Tagesprofile (Summe=1 nach Normalisierung)
const DHW_PROFILES = {
  wohnung: {
    label: "Wohnung / MFH",
    proto: [0.004,0.004,0.004,0.004,0.006,0.02,0.06,0.08,0.06,0.03,0.025,0.03,0.045,0.03,0.025,0.03,0.04,0.06,0.09,0.09,0.07,0.035,0.02,0.01],
  },
  buero: {
    label: "Büro / Verwaltung",
    proto: [0.004,0.004,0.004,0.004,0.006,0.01,0.02,0.06,0.09,0.08,0.05,0.04,0.10,0.08,0.05,0.03,0.02,0.015,0.01,0.008,0.006,0.005,0.004,0.004],
  },
  hotel: {
    label: "Hotel / Gastro",
    proto: [0.006,0.006,0.006,0.008,0.015,0.04,0.07,0.09,0.08,0.05,0.03,0.03,0.03,0.03,0.03,0.035,0.045,0.07,0.09,0.085,0.06,0.035,0.02,0.015],
  },
};
const normalize = (arr) => {
  const s = arr.reduce((a,b)=>a+b,0) || 1;
  return arr.map(v=>v/s);
};

// Heizung – CH typische Monatsanteile (Summe=1)
const HEAT_MONTHS = ["Jan","Feb","Mrz","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const HEAT_MONTH_SHARE = normalize([16,14,12,9,5,2,1,1,3,8,13,16]);

/* ---------------- Component ---------------- */
export default function WarmwasserTool() {
  // Start LEER – keine Default-Wohnungen
  const [wohnungen, setWohnungen] = useState([]); // [{id, geschoss, anf}]
  const [gebTyp, setGebTyp] = useState("MFH_allg");
  const [warmhalt, setWarmhalt] = useState("zirkulation");
  const [speicher, setSpeicher] = useState("aussenWT");

  // Speicher / WT
  const [nz, setNz] = useState(2);
  const [tz_h, setTzH] = useState(2);
  const [dT, setDT] = useState(50);
  const [etaWT, setEtaWT] = useState(0.95);

  // Verluste & Hilfsenergie (inkl. Leitungsverluste -> war dir wichtig)
  const [ncp, setNcp] = useState(5);
  const [lenConv, setLenConv] = useState(0);
  const [lenRaR, setLenRaR] = useState(0);
  const [lenWHB, setLenWHB] = useState(0);
  const [Ppump_kW, setPpump] = useState(0);
  const [pump_h_d, setPumpH] = useState(24);
  const [wpCirc, setWpCirc] = useState(false);
  const [cop, setCOP] = useState(3);

  // DHW Tagesprofil
  const [profilKey, setProfilKey] = useState("wohnung");

  // Heizung
  const [Aref_m2, setAref] = useState(0);
  const [qH_kWhm2a, setQH] = useState(0);

  /* ---- Derived ---- */
  const whgNp = useMemo(() => wohnungen.map(w => ({...w, np: personsFromANF(w.anf)})), [wohnungen]);
  const npSum = useMemo(() => whgNp.reduce((s,w)=>s+w.np,0), [whgNp]);

  const typ   = useMemo(() => GEBTYP.find(t=>t.key===gebTyp) || GEBTYP[0], [gebTyp]);
  const fWarm = useMemo(() => (WARMHALTE.find(f=>f.key===warmhalt)?.f ?? WARMHALTE[0].f), [warmhalt]);
  const fSto  = useMemo(() => (SPEICHERKFG.find(f=>f.key===speicher)?.f ?? SPEICHERKFG[0].f), [speicher]);

  // Bedarf & Speicher
  const VWd1   = useMemo(()=> npSum * typ.avg_lpd * fWarm, [npSum, typ, fWarm]); // [l/d]
  const VW_ctrl= useMemo(()=> nz>0 ? VWd1/nz : 0, [VWd1, nz]);
  const f_pk   = useMemo(()=> fpk(npSum), [npSum]);
  const VW_pk  = useMemo(()=> npSum * typ.peak_lpd * f_pk, [npSum, typ, f_pk]);
  const VW_cont= useMemo(()=> VW_ctrl + VW_pk, [VW_ctrl, VW_pk]);
  const VW_sto = useMemo(()=> VW_cont * fSto, [VW_cont, fSto]);

  // Anschlussleistung WT [kW]
  const QA_kW = useMemo(() => {
    if (nz<=0 || tz_h<=0 || etaWT<=0) return 0;
    const E_kWh = (VW_sto * CP_KJ_PER_KG_K * dT) / 3600; // pro Zyklus
    const P = E_kWh / (nz * tz_h * etaWT);
    return mround05(P);
  }, [VW_sto, dT, nz, tz_h, etaWT]);

  // Wärmebedarf & Verluste
  const QW_kWh_d = useMemo(()=> VWd1 * dT * RCP_KWH_PER_K, [VWd1, dT]); // [kWh/d]
  const Q_sto_ls = useMemo(()=> C1*Math.sqrt(VW_sto/V0) + C2*(ncp-2), [VW_sto, ncp]); // [kWh/d]

  const Q_hl_ls  = useMemo(()=>{
    // Zirkulation (konventionell + Rohr-an-Rohr) – sonst Warmhalteband mit 2/3
    const anyZ = lenConv>0 || lenRaR>0;
    return anyZ ? lenConv*LOSS_CONV + lenRaR*LOSS_RAR : (lenWHB*LOSS_RAR)*(2/3);
  }, [lenConv,lenRaR,lenWHB]);

  const f_hl = useMemo(()=> (lenConv+lenRaR>0 ? 1 : 1/3), [lenConv,lenRaR]);

  const E_aux = useMemo(()=>{
    const pump = Ppump_kW * pump_h_d;
    if (!wpCirc) return pump;
    const heatLossCirc = (lenConv*LOSS_CONV + lenRaR*LOSS_RAR) * (2/3);
    const wp = cop>0 ? heatLossCirc / cop : 0;
    return pump + wp;
  }, [Ppump_kW,pump_h_d,wpCirc,lenConv,lenRaR,cop]);

  const x_ls = useMemo(()=>{
    if (QW_kWh_d<=0) return 0;
    return ((Q_sto_ls + f_hl*Q_hl_ls + 2.5*E_aux)/QW_kWh_d)*100;
  }, [Q_sto_ls,f_hl,Q_hl_ls,E_aux,QW_kWh_d]);

  /* ---- Charts ---- */
  // 1) Energiebilanz (kWh/Tag)
  const energyChart = useMemo(()=>[
    { name: "Bedarf QW",        key: "QW",   kWh: round2(QW_kWh_d) },
    { name: "Speicherverluste", key: "Sto",  kWh: round2(Q_sto_ls) },
    { name: "Leitungsverluste", key: "HL",   kWh: round2(f_hl*Q_hl_ls) },
    { name: "Hilfsenergie·2.5", key: "Aux",  kWh: round2(2.5*E_aux) },
  ], [QW_kWh_d, Q_sto_ls, Q_hl_ls, f_hl, E_aux]);

  // 2) Tagesprofil (24 h)
  const dayFractions = useMemo(()=> normalize(DHW_PROFILES[profilKey].proto), [profilKey]);
  const dhwDayChart = useMemo(()=>{
    return Array.from({length:24}, (_,h)=>{
      const liters = VWd1 * dayFractions[h]; // l/h
      const kW     = liters * dT * RCP_KWH_PER_K; // kWh/h == kW
      const HH = String(h).padStart(2,"0");
      return { h: `${HH}:00`, lph: round1(liters), kW: round2(kW) };
    });
  }, [VWd1, dayFractions, dT]);

  // 3) Heizung Monat (kWh/Monat)
  const E_heat_annual = useMemo(()=> Aref_m2 * qH_kWhm2a, [Aref_m2,qH_kWhm2a]);
  const heatMonthlyChart = useMemo(()=>{
    return HEAT_MONTHS.map((m,i)=>({ m, kWh: round2(E_heat_annual * HEAT_MONTH_SHARE[i]) }));
  }, [E_heat_annual]);

  /* ---- Export ---- */
  function downloadJSON() {
    const payload = {
      wohnungen: whgNp.map(({id,geschoss,anf,np}) => ({id,geschoss,anf,np:round2(np)})),
      totals: {
        npSum: round2(npSum),
        VWd1: round2(VWd1),
        VW_ctrl: round2(VW_ctrl),
        VW_pk: round2(VW_pk),
        VW_cont: round2(VW_cont),
        VW_sto: round2(VW_sto),
        QA_kW: round2(QA_kW),
        QW_kWh_d: round2(QW_kWh_d),
        Q_sto_ls: round2(Q_sto_ls),
        Q_hl_ls: round2(Q_hl_ls),
        E_aux: round2(E_aux),
        x_ls: round2(x_ls),
        f_pk: round2(f_pk),
        f_hl,
      },
      params: { gebTyp, warmhalt, speicher, nz, tz_h, dT, etaWT, ncp, lenConv, lenRaR, lenWHB, Ppump_kW, pump_h_d, wpCirc, cop, profilKey, Aref_m2, qH_kWhm2a },
      charts: { energyChart, dhwDayChart, heatMonthlyChart },
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "warmwasser_tool_export.json"; a.click();
    URL.revokeObjectURL(url);
  }

  /* ---- UI ---- */
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-8 space-y-8">
      {/* Header */}
      <header className="rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Warmwasser & Heizung – Tool</h1>
            <p className="opacity-90">Belegung · Speicher · Leistung · Verluste · Diagramme</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadJSON} className="rounded-xl bg-white/10 px-4 py-2 text-white backdrop-blur-md hover:bg-white/20 transition shadow">
              Export JSON
            </button>
          </div>
        </div>
      </header>

      {/* Belegungsdaten */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Belegungsdaten (leer – füge Wohnungen hinzu)</h2>
          <button
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
            onClick={() => setWohnungen(v => [...v, { id: String(v.length+1).padStart(2,"0"), geschoss: "", anf: 0 }])}
          >
            + Wohnung hinzufügen
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left">WHG-Nr.</th>
                <th className="px-3 py-2 text-left">Geschoss</th>
                <th className="px-3 py-2 text-right">ANF [m²]</th>
                <th className="px-3 py-2 text-right">Personen np,i</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {whgNp.length === 0 ? (
                <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">Noch keine Wohnungen eingetragen.</td></tr>
              ) : whgNp.map((w, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">
                    <input value={w.id} onChange={e=>{
                      const id=e.target.value; setWohnungen(a=>a.map((x,i)=>i===idx?{...x,id}:x));
                    }} className="w-20 rounded border px-2 py-1"/>
                  </td>
                  <td className="px-3 py-2">
                    <input value={w.geschoss} onChange={e=>{
                      const geschoss=e.target.value; setWohnungen(a=>a.map((x,i)=>i===idx?{...x,geschoss}:x));
                    }} className="w-28 rounded border px-2 py-1"/>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" value={w.anf}
                      onChange={e=>{
                        const anf=parseFloat(e.target.value);
                        setWohnungen(a=>a.map((x,i)=>i===idx?{...x,anf:isNaN(anf)?0:anf}:x));
                      }}
                      className="w-28 rounded border px-2 py-1 text-right"/>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{round2(w.np)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={()=>setWohnungen(a=>a.filter((_,i)=>i!==idx))} className="text-red-600 hover:underline">entfernen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Basis-Parameter */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
            Summe Personen <span className="font-semibold">np = {round2(npSum)}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">Gebäudeart</label>
            <select value={gebTyp} onChange={e=>setGebTyp(e.target.value)} className="rounded border px-2 py-1">
              {GEBTYP.map(t=> <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">Warmhaltesystem</label>
            <select value={warmhalt} onChange={e=>setWarmhalt(e.target.value)} className="rounded border px-2 py-1">
              {WARMHALTE.map(f=> <option key={f.key} value={f.key}>{f.label} (f={f.f})</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Speicher/Leistung */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Speichervolumen & Anschlussleistung</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Speicherkonfiguration</span>
              <select value={speicher} onChange={e=>setSpeicher(e.target.value)} className="rounded border px-2 py-1">
                {SPEICHERKFG.map(f=> <option key={f.key} value={f.key}>{f.label} (f={f.f})</option>)}
              </select>
            </div>
            <Num label="Ladezyklen pro Tag [nz]" v={nz} set={setNz}/>
            <Num label="Zeit je Ladezyklus [h]" v={tz_h} set={setTzH}/>
            <Num label="Δθ Erwärmung [K]" v={dT} set={setDT}/>
            <Num label="Wirkungsgrad WT η" v={etaWT} set={setEtaWT} step={0.01}/>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 space-y-2">
            <Row label="Nutzwarmwasserbedarf VW,d,1 [l/d]" value={VWd1}/>
            <Row label="Steuervolumen VW,sto,ctrl,1 [l]" value={VW_ctrl}/>
            <Row label={`Spitzendeckungsvolumen VW,sto,pk [l] (f_pk=${round2(f_pk)})`} value={VW_pk}/>
            <Row label="Bereitschaftsvolumen VW,sto,cont,1 [l]" value={VW_cont}/>
            <Row label={`Speichervolumen VW,sto,1 [l] (f_sto=${fSto})`} value={VW_sto} strong/>
            <div className="pt-2 border-t">
              <Row label="Anschlussleistung Wärmetauscher QA [kW]" value={QA_kW} strong/>
            </div>
          </div>
        </div>
      </section>

      {/* Diagramm 1: Energiebilanz */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Energiebilanz – kWh/Tag</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={energyChart} barSize={42}>
              <defs>
                <linearGradient id="gradQW" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#2563eb"/>
                </linearGradient>
                <linearGradient id="gradSto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#7c3aed"/>
                </linearGradient>
                <linearGradient id="gradHL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399"/><stop offset="100%" stopColor="#059669"/>
                </linearGradient>
                <linearGradient id="gradAux" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#d97706"/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tickMargin={8}/>
              <YAxis tickFormatter={(v)=>`${v}`} width={70} label={{ value:"kWh/Tag", angle:-90, position:"insideLeft" }}/>
              <Tooltip content={<EnergyTooltip/>}/>
              <Legend />
              <Bar dataKey="kWh" name="kWh/Tag" fillOpacity={0.95}
                   shape={props => <rect {...props} rx={10} ry={10}/> }
                   fill={(d)=>({
                     QW:"url(#gradQW)",Sto:"url(#gradSto)",HL:"url(#gradHL)",Aux:"url(#gradAux)"
                   }[d.payload.key])}>
                <LabelList dataKey="kWh" position="top" formatter={(v)=>v?.toFixed(1)} />
              </Bar>
              <ReferenceLine y={0} stroke="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Leitungsverluste werden mit Faktor <span className="font-mono">{round2(f_hl)}</span> berücksichtigt (Zirkulation vorhanden = 1, sonst 1/3).
        </p>
      </section>

      {/* Diagramm 2: Warmwasser Tagesprofil */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Warmwasser – Tagesprofil (24 h)</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Nutzprofil</label>
            <select value={profilKey} onChange={e=>setProfilKey(e.target.value)} className="rounded border px-2 py-1">
              {Object.entries(DHW_PROFILES).map(([k,v])=>(
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dhwDayChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="h" interval={1} tickMargin={8}/>
              <YAxis yAxisId="left"  label={{ value:"l/h", angle:-90, position:"insideLeft" }}/>
              <YAxis yAxisId="right" orientation="right" label={{ value:"kW", angle:90, position:"insideRight" }}/>
              <Tooltip content={<DayTooltip/>}/>
              <Legend />
              <Line yAxisId="left"  type="monotone" dataKey="lph" name="Warmwasser [l/h]" stroke="#0ea5e9" strokeWidth={3} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="kW"  name="Leistung [kW]"    stroke="#6366f1" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Kurven sind typische Richtwerte (Wohnung: morgens/abends, Büro: Ankunft+Mittag, Hotel: Frühstück & Dinner).
          Sie skalieren mit deinem Tagesbedarf <span className="font-mono">{round1(VWd1)} l/d</span> und Δθ.
        </p>
      </section>

      {/* Heizung */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Heizung – Monatsverteilung</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Num label="Energiebezugsfläche Aref [m²]" v={Aref_m2} set={setAref}/>
            <Num label="spez. Heizwärmebedarf qₕ [kWh/m²·a]" v={qH_kWhm2a} set={setQH}/>
            <p className="text-sm text-slate-600">
              Jahresbedarf: <span className="font-medium">{round2(E_heat_annual)} kWh/a</span>
            </p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatMonthlyChart} barSize={26}>
                <defs>
                  <linearGradient id="gradHeat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fca5a5"/><stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="m" tickMargin={8}/>
                <YAxis label={{ value:"kWh/Monat", angle:-90, position:"insideLeft" }}/>
                <Tooltip content={<HeatTooltip/>}/>
                <Legend />
                <Bar dataKey="kWh" name="Heizenergie [kWh/Monat]" fill="url(#gradHeat)" shape={p => <rect {...p} rx={8} ry={8}/>}>
                  <LabelList dataKey="kWh" position="top" formatter={(v)=>v?.toFixed(0)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <footer className="pb-8 text-xs text-slate-500">
        <p>Leitungsverluste (Zirkulation/Warmhalteband) sind vollständig integriert. Diagramme aktualisieren sich live.</p>
      </footer>
    </div>
  );
}

/* --------- kleine Helfer --------- */
function Row({ label, value, strong=false }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={"tabular-nums " + (strong ? "font-semibold" : "")}>
        {Number.isFinite(value) ? round2(value) : "-"}
      </span>
    </div>
  );
}
function Num({label,v,set,step=1}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-72 text-sm text-slate-600">{label}</label>
      <input type="number" step={step} value={v} onChange={e=>set(parseFloat(e.target.value)||0)} className="w-32 rounded border px-2 py-1"/>
    </div>
  );
}

/* --------- Tooltips (schön formatiert) --------- */
function EnergyTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="text-sm font-medium">{v?.toFixed(2)} kWh/Tag</div>
    </div>
  );
}
function DayTooltip({ active, payload, label }) {
  if (!active || !payload) return null;
  const lph = payload.find(p=>p.dataKey==="lph")?.value;
  const kW  = payload.find(p=>p.dataKey==="kW")?.value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="text-sm"><span className="font-medium">{lph?.toFixed(0)}</span> l/h</div>
      <div className="text-sm"><span className="font-medium">{kW?.toFixed(2)}</span> kW</div>
    </div>
  );
}
function HeatTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="text-sm font-medium">{v?.toFixed(0)} kWh</div>
    </div>
  );
}
