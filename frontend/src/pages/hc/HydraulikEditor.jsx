import React, { useCallback, useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Panel, ConnectionMode, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES } from '../../components/hc/nodes/HydraulikNodes';
import { EDGE_TYPES } from '../../components/hc/edges/FlowEdge';
import { SCHALTUNGEN } from '../../components/hc/nodes/schaltungen';

// ── Konstanten ────────────────────────────────────────────────
const KVS_REIHE = [0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10, 16, 25, 40, 63];
const WAERMEABGABE = [
  { label: 'Fussbodenheizung (FBH)',  vl: 35, rl: 28 },
  { label: 'Heizkörper modern (HK)', vl: 55, rl: 45 },
  { label: 'Heizkörper alt (HK)',    vl: 70, rl: 55 },
  { label: 'Lufterhitzer',           vl: 60, rl: 45 },
  { label: 'BWW Aufheizung',         vl: 65, rl: 55 },
  { label: 'TABS',                   vl: 30, rl: 25 },
  { label: 'Wandheizung',            vl: 35, rl: 28 },
  { label: 'Konvektoren',            vl: 55, rl: 45 },
];

const STD_PALETTE = [
  { type: 'heizkreis',  label: 'Heizkreis',          desc: 'VL / RL / Q → V\' auto' },
  { type: 'pump',       label: 'Pumpe',               desc: 'V\' aus Topologie' },
  { type: 'valve2',     label: '2WV Regelventil',     desc: 'KVS-Vorschlag auto' },
  { type: 'valve3',     label: '3WM Mischventil',     desc: '' },
  { type: 'junction',   label: 'T-Stück',             desc: 'Abzweigung / Zusammenführung' },
  { type: 'checkvalve', label: 'Rückschlagventil',    desc: '' },
  { type: 'shutoff',    label: 'Absperrventil',       desc: '' },
  { type: 'erzeuger',   label: 'Wärmeerzeuger (WE)',  desc: '→ M10 RAVEL' },
  { type: 'speicher',   label: 'Speicher',            desc: '' },
  { type: 'verteiler',  label: 'Verteiler',           desc: '' },
];

const newId = () => `n_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
const LS_KEY = 'hc-user-schemas';

// ── Phase 2: Topologie-bewusste Hydraulik-Berechnung ─────────
// Für jede Leitung: V' = Summe der HK-Volumenströme auf der WE-fernen Seite
// (korrekte Parallel/Serien-Erkennung)
// ── Hydraulik: Verteiler-zentriert + Rückwärts-Propagierung ──
//
// Verteiler-Logik (Hauptweg):
//   vl-1 + rl-1 = Ast 1 (ein Kreis, gleicher V')
//   vl-2 + rl-2 = Ast 2 (eigener V')
//   vl-main + rl-main = Summe aller Äste
//
// Für alles ohne Verteiler: Rückwärts-Propagierung entlang VL-Kanten.
function useHydraulicFlows(nodes, edges) {
  return useMemo(() => {
    if (nodes.length === 0) return { edgeFlows: {}, nodeFlows: {} };

    // ── V' pro Heizkreis ──────────────────────────────────────
    const hkFlows = {};
    nodes.filter(n => n.type === 'heizkreis').forEach(hk => {
      const vl = parseFloat(hk.data.vl_temp), rl = parseFloat(hk.data.rl_temp), q = parseFloat(hk.data.q_kw);
      const dt = vl - rl;
      if (!isNaN(vl) && !isNaN(rl) && !isNaN(q) && dt > 0 && q > 0)
        hkFlows[hk.id] = q / (1.163 * dt);
    });
    if (!Object.keys(hkFlows).length) return { edgeFlows: {}, nodeFlows: {} };

    const edgeFlows  = {};
    const nodeFlows  = {};
    const calcEdges  = new Set(); // Kanten die schon berechnet wurden

    // ── Hilfsfunktion: BFS-V' ab startId, excludeNodes ausschliessen ─
    const bfsFlow = (startId, excludeNodes) => {
      const ex      = new Set(excludeNodes);
      const visited = new Set([startId, ...ex]);
      const queue   = [startId];
      let flow = hkFlows[startId] || 0;
      while (queue.length) {
        const cur = queue.shift();
        for (const e of edges) {
          if (e.style?.stroke === '#3b82f6') continue; // RL ignorieren
          const other = e.source === cur ? e.target : e.target === cur ? e.source : null;
          if (other && !visited.has(other)) {
            visited.add(other); flow += hkFlows[other] || 0; queue.push(other);
          }
        }
      }
      return flow;
    };

    // ── Handle-Parser: 'vl-1' → {type:'vl', num:'1'} ───────────
    const parseHandle = (h) => {
      if (!h) return { type: null, num: null };
      const t = h.startsWith('vl') ? 'vl' : h.startsWith('rl') ? 'rl' : null;
      if (!t) return { type: null, num: null };
      const m = h.match(/(\d+)/);
      const num = h.includes('main') ? 'main' : (m ? m[1] : null);
      return { type: t, num };
    };

    // ── 1. Verteiler-zentrierte Berechnung ─────────────────────
    nodes.filter(n => n.type === 'verteiler').forEach(vn => {
      const vnEdges = edges.filter(e => e.source === vn.id || e.target === vn.id);

      // Kanten nach Ast-Nummer und Typ (vl/rl) gruppieren
      const branches = {}; // { '1': {vl:edge, rl:edge}, 'main': {vl:edge, rl:edge} }
      vnEdges.forEach(e => {
        const h = e.source === vn.id ? e.sourceHandle : e.targetHandle;
        const { type, num } = parseHandle(h);
        if (!type || !num) return;
        if (!branches[num]) branches[num] = { vl: null, rl: null, vlList: [], rlList: [] };
        if (type === 'vl') { branches[num].vl = e; branches[num].vlList.push(e); }
        if (type === 'rl') { branches[num].rl = e; branches[num].rlList.push(e); }
      });

      let totalV = 0;

      // Nummerierte Äste (nicht 'main')
      Object.entries(branches).forEach(([num, br]) => {
        if (num === 'main') return;
        // Startknoten: der Knoten auf der Nicht-Verteiler-Seite der VL-Kante
        // (falls keine VL vorhanden: RL-Kante verwenden)
        const refEdge = br.vl || br.rl;
        if (!refEdge) return;
        const branchStart = refEdge.source === vn.id ? refEdge.target : refEdge.source;
        const branchV = bfsFlow(branchStart, [vn.id]);

        // VL-Ast und RL-Ast bekommen denselben V'
        ;[...br.vlList, ...br.rlList].forEach(e => {
          edgeFlows[e.id] = branchV;
          calcEdges.add(e.id);
        });
        totalV += branchV;
      });

      // Hauptanschluss = Summe aller Äste
      ;[...(branches.main?.vlList || []), ...(branches.main?.rlList || [])].forEach(e => {
        edgeFlows[e.id] = totalV;
        calcEdges.add(e.id);
      });

      nodeFlows[vn.id] = totalV;
    });

    // ── 2. Rückwärts-Propagierung für restliche VL-Kanten ──────
    // (Kreise ohne Verteiler oder Kanten zwischen Verteiler und WE/Pumpe)
    const revAdj = {};
    nodes.forEach(n => { revAdj[n.id] = []; });
    edges.forEach(e => {
      if (calcEdges.has(e.id)) return;       // schon berechnet
      if (e.style?.stroke === '#3b82f6') return; // RL weglassen
      const isVL = e.style?.stroke === '#ef4444';
      if (isVL) {
        revAdj[e.target]?.push({ to: e.source, eid: e.id });
      } else {
        revAdj[e.source]?.push({ to: e.target, eid: e.id });
        revAdj[e.target]?.push({ to: e.source, eid: e.id });
      }
    });

    Object.entries(hkFlows).forEach(([hkId, flow]) => {
      const visited = new Set([hkId]);
      const queue = [hkId];
      while (queue.length) {
        const cur = queue.shift();
        for (const { to, eid } of (revAdj[cur] || [])) {
          if (!calcEdges.has(eid)) edgeFlows[eid] = (edgeFlows[eid] || 0) + flow;
          if (!visited.has(to)) { visited.add(to); queue.push(to); }
        }
      }
    });

    // ── 3. RL-Kanten die noch kein V' haben ────────────────────
    const rlAdj = {};
    nodes.forEach(n => { rlAdj[n.id] = []; });
    edges.forEach(e => {
      if (e.style?.stroke !== '#3b82f6' || calcEdges.has(e.id)) return;
      rlAdj[e.source]?.push({ to: e.target, eid: e.id });
      rlAdj[e.target]?.push({ to: e.source, eid: e.id });
    });

    Object.entries(hkFlows).forEach(([hkId, flow]) => {
      const visited = new Set([hkId]);
      const queue = [hkId];
      while (queue.length) {
        const cur = queue.shift();
        for (const { to, eid } of (rlAdj[cur] || [])) {
          if (!calcEdges.has(eid)) edgeFlows[eid] = (edgeFlows[eid] || 0) + flow;
          if (!visited.has(to)) { visited.add(to); queue.push(to); }
        }
      }
    });

    // ── 4. Knoten-Flows ─────────────────────────────────────────
    nodes.forEach(node => {
      if (nodeFlows[node.id] !== undefined) return;
      nodeFlows[node.id] = node.type === 'heizkreis'
        ? (hkFlows[node.id] || 0)
        : Math.max(0, ...edges.filter(e => e.source === node.id || e.target === node.id)
            .map(e => edgeFlows[e.id] || 0));
    });

    return { edgeFlows, nodeFlows };
  }, [nodes, edges]);
}

// ── Phase 1: Schema speichern / überspeichern / laden ─────────
function useSavedSchemas() {
  const [schemas, setSchemas] = useState(() =>
    JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  );
  // Neu speichern oder bestehendes überspeichern (gleicher Name)
  const save = (name, nodes, edges) => {
    const exists = schemas.find(s => s.name === name);
    const updated = exists
      ? schemas.map(s => s.name === name ? { ...s, nodes, edges } : s)
      : [...schemas, { id: Date.now(), name, nodes, edges }];
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setSchemas(updated);
    return !!exists; // true = überspeichert
  };
  // Gezieltes Überspeichern per ID (Update-Button)
  const update = (id, nodes, edges) => {
    const updated = schemas.map(s => s.id === id ? { ...s, nodes, edges } : s);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setSchemas(updated);
  };
  const remove = (id) => {
    const updated = schemas.filter(s => s.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setSchemas(updated);
  };
  return { schemas, save, update, remove };
}

// Schema als Gruppe auf Canvas einfügen
function instantiateSchema(schema, dropPos, setNodes, setEdges) {
  const xs = schema.nodes.map(n => n.position.x);
  const ys = schema.nodes.map(n => n.position.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const idMap = {};
  const newNodes = schema.nodes.map(n => {
    const nid = newId(); idMap[n.id] = nid;
    return { ...n, id: nid, position: { x: dropPos.x + (n.position.x - cx), y: dropPos.y + (n.position.y - cy) } };
  });
  const newEdges = schema.edges.map(e => ({
    ...e, id: newId(),
    source: idMap[e.source] || e.source,
    target: idMap[e.target] || e.target,
  }));
  setNodes(ns => [...ns, ...newNodes]);
  setEdges(es => [...es, ...newEdges]);
}

// ── Properties Panel ─────────────────────────────────────────
function PropertiesPanel({ node, nodeFlows, onUpdate, onDelete, navigate }) {
  if (!node) return (
    <div style={{ padding: 14, fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Eigenschaften</div>
      Bauteil anklicken.
      <div style={{ marginTop: 14, fontSize: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
        <b>T-Stück:</b> Kleinen schwarzen Kreis platzieren → mehrere Leitungen anschliessen.<br /><br />
        <b>Parallel-Heizkreise:</b> Jeden HK mit T-Stück verbinden → T-Stück zur Pumpe → V' wird korrekt addiert.
      </div>
    </div>
  );

  const d = node.data;
  const v = nodeFlows[node.id];
  const set = (k, val) => onUpdate(node.id, k, val);

  const fld = (label, key, placeholder='', unit='', type='number') => (
    <div style={{ marginBottom: 7 }}>
      <label style={lbl}>{label}{unit && <span style={{ color: '#94a3b8' }}> [{unit}]</span>}</label>
      <input type={type} placeholder={placeholder} value={d[key]??''} onChange={e=>set(key,e.target.value)} style={inp} />
    </div>
  );

  const ro = (label, value, unit='', ok=false) => (
    <div style={{ marginBottom: 6 }}>
      <label style={lbl}>{label}</label>
      <div style={{ ...inp, background: ok?'#f0fdf4':'#f8fafc', color: ok?'#15803d':'#374151', fontWeight: ok?700:400, fontFamily:'monospace', fontSize:12 }}>
        {value!=null ? `${typeof value==='number'?value.toFixed(4):value}${unit?' '+unit:''}` : '—'}
      </div>
    </div>
  );

  // ── HEIZKREIS ──
  if (node.type === 'heizkreis') {
    const vl=parseFloat(d.vl_temp), rl=parseFloat(d.rl_temp), q=parseFloat(d.q_kw);
    const dt=vl-rl, calc=(!isNaN(vl)&&!isNaN(rl)&&!isNaN(q)&&dt>0)?q/(1.163*dt):null;
    return (
      <div style={panelSt}>
        <PT>Heizkreis</PT>
        {fld('Bezeichnung','label','z.B. OG Büro','','text')}
        <label style={lbl}>Wärmeabgabesystem</label>
        <select style={{...inp,cursor:'pointer'}} value={d.system||''} onChange={e=>{
          const s=WAERMEABGABE.find(x=>x.label===e.target.value);
          set('system',e.target.value); if(s){set('vl_temp',s.vl);set('rl_temp',s.rl);}
        }}>
          <option value="">— wählen —</option>
          {WAERMEABGABE.map(x=><option key={x.label}>{x.label}</option>)}
        </select>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:6}}>
          <div><label style={{...lbl,color:'#ef4444'}}>VL [°C]</label>
            <input type="number" style={{...inp,borderColor:'#fca5a5'}} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
          <div><label style={{...lbl,color:'#3b82f6'}}>RL [°C]</label>
            <input type="number" style={{...inp,borderColor:'#93c5fd'}} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
        </div>
        {fld('Leistung Q','q_kw','z.B. 8.5','kW')}
        {vl>0&&rl>0&&dt<=0&&<div style={warnSt}>⚠ VL muss grösser als RL sein</div>}
        <ResultBox v={calc} label="Berechneter Volumenstrom" unit="m³/h" />
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── 2WV ──
  if (node.type === 'valve2') {
    const dp_kpa=parseFloat(d.dp_var), dp_bar=dp_kpa/100;
    let kvs_theor=null, kvs_vorschlag=null, pv=null;
    if(v&&dp_kpa>0){kvs_theor=v/Math.sqrt(dp_bar); kvs_vorschlag=KVS_REIHE.find(k=>k>=kvs_theor)||KVS_REIHE.at(-1);}
    const kvs_eff=parseFloat(d.kvs_eff||kvs_vorschlag);
    if(v&&kvs_eff>0){const dpv=(v/kvs_eff)**2; pv=dpv/(dpv+dp_bar)*100;}
    return (
      <div style={panelSt}>
        <PT>2-Wege Regelventil</PT>
        {fld('Bezeichnung','label','','','text')}
        {v ? ro("V' (Topologie)",v,'m³/h',true) : <div style={warnSt}>Heizkreis verbinden</div>}
        {fld('Δpvar (variable Anlage)','dp_var','z.B. 26','kPa')}
        {kvs_theor&&<>
          {ro('KVS theoretisch',kvs_theor.toFixed(4),'m³/h·bar½')}
          <label style={lbl}>KVS gewählt (Norm-Reihe)</label>
          <select style={{...inp,cursor:'pointer'}} value={d.kvs_eff||kvs_vorschlag||''} onChange={e=>set('kvs_eff',e.target.value)}>
            {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===kvs_vorschlag?' ← Vorschlag':''}</option>)}
          </select>
          {pv!=null&&<PvBox pv={pv} v={v} kvs_eff={kvs_eff}/>}
        </>}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── PUMPE ──
  if (node.type === 'pump') {
    const rohrL=parseFloat(d.rohr_m)||0, pam=parseFloat(d.pam)||70, app=parseFloat(d.apparate_kpa)||0;
    const dpRohr=rohrL*pam/1000, dpTotal=dpRohr+app;
    return (
      <div style={panelSt}>
        <PT>Pumpe</PT>
        {fld('Bezeichnung','label','','','text')}
        {v ? ro("V' (Topologie)",v,'m³/h',true) : <div style={warnSt}>Heizkreis verbinden</div>}
        <div style={{fontSize:10,fontWeight:700,color:'#475569',marginTop:8,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Druckverlust approximativ</div>
        {fld('Rohrlänge VL+RL','rohr_m','z.B. 120','m')}
        {fld('Dimensioniert auf','pam','70','Pa/m')}
        {fld('Apparate gesamt','apparate_kpa','z.B. 22','kPa')}
        {dpTotal>0&&<div style={{background:'#f0f9ff',border:'1px solid #7dd3fc',borderRadius:6,padding:'8px 10px',marginTop:4}}>
          <div style={{fontSize:10,color:'#0369a1'}}>Rohrsystem: {dpRohr.toFixed(2)} kPa</div>
          <div style={{fontSize:16,fontWeight:700,color:'#1d4ed8',marginTop:4}}>Förderhöhe: {dpTotal.toFixed(1)} kPa = {(dpTotal/10).toFixed(2)} mWS</div>
        </div>}
        {fld('Förderhöhe (manuell)','foerderh','kPa')}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── 3WM ──
  if (node.type === 'valve3') {
    return (
      <div style={panelSt}>
        <PT>3-Wege Mischventil</PT>
        {fld('Bezeichnung','label','','','text')}
        {v ? ro("V' (Topologie)",v,'m³/h',true) : <div style={warnSt}>Heizkreis verbinden</div>}
        {fld('Δpvar','dp_var','26','kPa')}
        {v&&d.dp_var>0&&ro('KVS Vorschlag',(KVS_REIHE.find(k=>k>=v/Math.sqrt(parseFloat(d.dp_var)/100))||KVS_REIHE.at(-1)).toString(),'m³/h·bar½')}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── ERZEUGER ──
  if (node.type === 'erzeuger') {
    return (
      <div style={panelSt}>
        <PT>Wärmeerzeuger</PT>
        {fld('Bezeichnung','label','WE','','text')}
        {fld('Typ','typ','z.B. Wärmepumpe','','text')}
        {fld('Nennleistung','leistung_kw','','kW')}
        {fld('VL Temperatur','vl_temp','','°C')}
        {fld('RL Temperatur','rl_temp','','°C')}
        <button style={btnBlue} onClick={()=>navigate('/heizungscockpit/rechner/ravel')}>→ RAVEL Wirtschaftlichkeit</button>
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── DEFAULT ──
  return (
    <div style={panelSt}>
      <PT>{node.type}</PT>
      {fld('Bezeichnung','label','','','text')}
      <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
    </div>
  );
}

// ── UI-Helpers ────────────────────────────────────────────────
const panelSt = { padding: 12, overflowY: 'auto', flex: 1 };
const lbl = { display:'block', fontSize:10, color:'#6b7280', marginBottom:3, marginTop:6 };
const inp = { width:'100%', fontSize:12, border:'1px solid #e2e8f0', borderRadius:5, padding:'5px 8px', boxSizing:'border-box', background:'white' };
const warnSt = { fontSize:10, color:'#92400e', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:5, padding:'5px 8px', marginTop:4 };
const btnBlue = { width:'100%', padding:7, background:'#1d4ed8', color:'white', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', marginTop:8 };

function PT({ children }) { return <div style={{ fontSize:12, fontWeight:700, color:'#1e293b', marginBottom:8, paddingBottom:6, borderBottom:'1px solid #f1f5f9' }}>{children}</div>; }
function Div() { return <div style={{ borderTop:'1px solid #f1f5f9', margin:'12px 0' }}/>; }
function DelBtn({ onClick }) { return <button onClick={onClick} style={{ width:'100%', padding:'6px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:6, fontSize:11, cursor:'pointer' }}>Bauteil löschen</button>; }
function ResultBox({ v, label, unit }) {
  return (
    <div style={{ background:v?'#f0fdf4':'#f8fafc', border:`1px solid ${v?'#86efac':'#e2e8f0'}`, borderRadius:6, padding:'8px 10px', marginTop:6 }}>
      <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:700, fontFamily:'monospace', color:v?'#15803d':'#94a3b8' }}>{v?`${v.toFixed(4)} ${unit}`:'—'}</div>
      {v&&<div style={{fontSize:9,color:'#16a34a'}}>{(v*1000).toFixed(1)} l/h</div>}
    </div>
  );
}
function PvBox({ pv, v, kvs_eff }) {
  const col = pv<30?'#dc2626':pv>80?'#ca8a04':'#15803d';
  const bg  = pv<30?'#fef2f2':pv>80?'#fefce8':'#f0fdf4';
  const bd  = pv<30?'#fca5a5':pv>80?'#fde047':'#86efac';
  return (
    <div style={{background:bg,border:`1px solid ${bd}`,borderRadius:6,padding:'8px 10px',marginTop:6}}>
      <div style={{fontSize:10,color:'#6b7280'}}>Ventilautorität Pv</div>
      <div style={{fontSize:20,fontWeight:700,color:col}}>{pv.toFixed(1)} %</div>
      <div style={{fontSize:9,color:'#6b7280',marginTop:2}}>Δpv,eff = {((v/kvs_eff)**2*100).toFixed(2)} kPa · Ideal 30–80%</div>
      {pv<30&&<div style={{fontSize:9,color:'#dc2626',marginTop:2}}>⚠ Kleineren KVS wählen</div>}
    </div>
  );
}

// ── Haupt-Editor ──────────────────────────────────────────────
function EditorInner() {
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected]     = useState(null);
  const [edgeColor, setEdgeColor]   = useState('#ef4444');
  const [schemaName, setSchemaName] = useState('Neues Schema');
  const { schemas: userSchemas, save: saveSchema, update: updateSchema, remove: removeSchema } = useSavedSchemas();

  const { edgeFlows, nodeFlows } = useHydraulicFlows(nodes, edges);

  // Undo-History
  const snapshots = useRef([]);
  const snap = useCallback(() => {
    snapshots.current = [...snapshots.current.slice(-30), {
      n: JSON.parse(JSON.stringify(nodes)),
      e: JSON.parse(JSON.stringify(edges)),
    }];
  }, [nodes, edges]);
  const undo = useCallback(() => {
    if (snapshots.current.length < 2) return;
    snapshots.current.pop();
    const prev = snapshots.current[snapshots.current.length - 1];
    if (prev) { setNodes(prev.n); setEdges(prev.e); setSelected(null); }
  }, [setNodes, setEdges]);

  // CSS-Animationen + grössere Hitboxen
  React.useEffect(() => {
    const s = document.createElement('style');
    s.id = 'hc-flow-anim';
    s.textContent = `
      @keyframes hc-vl-pulse { from{stroke-dashoffset:10000} to{stroke-dashoffset:0} }
      @keyframes hc-rl-flow  { from{stroke-dashoffset:48}    to{stroke-dashoffset:0} }
      /* Grosse unsichtbare Hitbox um jeden Handle */
      .react-flow__handle {
        width: 20px !important; height: 20px !important;
        border-radius: 4px !important;
        transition: transform .1s, box-shadow .1s !important;
      }
      .react-flow__handle::after {
        content: ''; position: absolute;
        inset: -8px; border-radius: 6px;
      }
      .react-flow__handle:hover {
        transform: scale(1.6) !important;
        box-shadow: 0 0 0 4px rgba(59,130,246,.45) !important;
        z-index: 1000 !important;
      }
      /* Leitungen dicker bei hover */
      .react-flow__edge:hover .react-flow__edge-path { stroke-width: 5 !important; }
      /* Midpoint-Handle bei Hover auf Leitung einblenden */
      .react-flow__edge:hover .hc-edge-mid { opacity: 1 !important; }
    `;
    if (!document.getElementById('hc-flow-anim')) document.head.appendChild(s);
    return () => document.getElementById('hc-flow-anim')?.remove();
  }, []);

  // Keyboard-Shortcuts: V = VL, R = RL, Cmd+Z = Undo
  React.useEffect(() => {
    const handler = (ev) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z') {
        ev.preventDefault(); undo();
      }
      if (!ev.metaKey && !ev.ctrlKey) {
        if (ev.key === 'v' || ev.key === 'V') setEdgeColor('#ef4444');
        if (ev.key === 'r' || ev.key === 'R') setEdgeColor('#3b82f6');
        if (ev.key === 'b' || ev.key === 'B') setEdgeColor('#1e293b');
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          if (selected) { snap(); deleteNode(selected.id); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, selected, snap]);

  // Edges: VL durchgezogen, RL gestrichelt, V' als Label
  const displayEdges = useMemo(() => edges.map(edge => {
    const color = edge.style?.stroke || '#1e293b';
    const v = edgeFlows[edge.id];
    return {
      ...edge, type: 'flow', animated: false,
      label: v ? `${v.toFixed(3)} m³/h` : undefined,
      labelStyle:   { fontSize:9, fill:'#1e293b', fontFamily:'monospace', fontWeight:600 },
      labelBgStyle: { fill:'rgba(255,255,255,0.9)', borderRadius:3 },
      labelBgPadding: [3,5],
      style: { ...edge.style },
    };
  }), [edges, edgeFlows]);

  const loadSchema = (key) => {
    const s = SCHALTUNGEN[key];
    setNodes(s.nodes.map(n=>({...n})));
    setEdges(s.edges.map(e=>({...e})));
    setSchemaName(s.name); setSelected(null);
  };

  const handleSaveSchema = () => {
    if (nodes.length === 0) { alert('Kein Schema zum Speichern.'); return; }
    const existing = userSchemas.map(s => s.name).join(', ');
    const hint = existing ? ` (bestehende: ${existing} — gleicher Name = überspeichern)` : '';
    const name = window.prompt(`Schema-Name${hint}:`);
    if (!name?.trim()) return;
    const wasOverwrite = saveSchema(name.trim(), nodes, edges);
    alert(wasOverwrite ? `"${name}" überspeichert ✓` : `"${name}" gespeichert ✓`);
  };

  const onConnect = useCallback((params) => {
    snap();
    setEdges(eds => addEdge({ ...params, type:'flow', style:{ stroke:edgeColor, strokeWidth:2.5 } }, eds));
  }, [edgeColor, setEdges, snap]);

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback(e => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    snap();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (raw.startsWith('user-schema:')) {
      const id = parseInt(raw.replace('user-schema:', ''));
      const schema = userSchemas.find(s => s.id === id);
      if (schema) instantiateSchema(schema, pos, setNodes, setEdges);
      return;
    }
    const p = STD_PALETTE.find(p => p.type === raw);
    setNodes(ns => [...ns, { id: newId(), type: raw, position: pos, data: { label: p?.label || raw } }]);
  }, [screenToFlowPosition, setNodes, setEdges, userSchemas, snap]);

  const onNodeClick  = useCallback((_, n) => setSelected(n), []);
  const onPaneClick  = useCallback(() => setSelected(null), []);
  const selectedNode = selected ? nodes.find(n => n.id === selected.id) || null : null;

  const updateNode = (id, key, val) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  const deleteNode = (id) => {
    snap();
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
    setSelected(null);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 64px)', fontFamily:'system-ui,sans-serif' }}>
      {/* Topbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'white', borderBottom:'1px solid #e2e8f0', flexShrink:0, flexWrap:'wrap' }}>
        <Link to="/heizungscockpit" style={{ fontSize:12, color:'#2563eb', whiteSpace:'nowrap' }}>← Heizungscockpit</Link>
        <span style={{ color:'#e2e8f0' }}>|</span>
        <input value={schemaName} onChange={e=>setSchemaName(e.target.value)}
          style={{ fontSize:13, fontWeight:700, border:'1px solid #f1f5f9', borderRadius:4, padding:'2px 8px', color:'#1e293b', minWidth:160 }}/>

        <span style={{ fontSize:11, color:'#94a3b8' }}>Vorlage:</span>
        {Object.entries(SCHALTUNGEN).map(([k,s])=>(
          <button key={k} onClick={()=>loadSchema(k)}
            style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', color:'#374151', whiteSpace:'nowrap' }}>
            {s.name}
          </button>
        ))}

        {/* Phase 1: Schema speichern */}
        <button onClick={handleSaveSchema}
          style={{ fontSize:11, padding:'4px 10px', borderRadius:5, border:'1px solid #86efac', background:'#f0fdf4', cursor:'pointer', color:'#15803d', fontWeight:600, marginLeft:8, whiteSpace:'nowrap' }}>
          💾 Schema speichern
        </button>

        <div style={{ display:'flex', gap:4, alignItems:'center', marginLeft:'auto' }}>
          <span style={{ fontSize:11, color:'#94a3b8' }}>Linie:</span>
          {[['#ef4444','VL'],['#3b82f6','RL'],['#1e293b','—']].map(([c,t])=>(
            <button key={c} title={t} onClick={()=>setEdgeColor(c)}
              style={{ width:22, height:22, borderRadius:4, background:c, border:edgeColor===c?'2px solid #1e293b':'2px solid transparent', cursor:'pointer' }}/>
          ))}
          <span style={{ fontSize:10, color:'#94a3b8' }}>{edgeColor==='#ef4444'?'VL':edgeColor==='#3b82f6'?'RL':'Allg.'}</span>
          <span style={{ fontSize:9, color:'#cbd5e1', marginLeft:8 }}>Taste V=VL · R=RL · ⌘Z=Undo · Shift+Ziehen=Mehrfach</span>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Palette links */}
        <div style={{ width:158, background:'#f8fafc', borderRight:'1px solid #e2e8f0', overflowY:'auto', flexShrink:0 }}>
          <div style={{ padding:'8px 10px 4px', fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em' }}>
            SIA 410 Bauteile
          </div>
          {STD_PALETTE.map(p=>(
            <div key={p.type} draggable
              onDragStart={e=>{e.dataTransfer.setData('application/reactflow',p.type); e.dataTransfer.effectAllowed='move';}}
              style={{ margin:'3px 8px', padding:'6px 8px', background:'white', border:'1px solid #e2e8f0', borderRadius:6, cursor:'grab', fontSize:11, color:'#374151', userSelect:'none' }}>
              <div style={{ fontWeight:600 }}>{p.label}</div>
              {p.desc&&<div style={{ fontSize:9, color:'#94a3b8', marginTop:1 }}>{p.desc}</div>}
            </div>
          ))}

          {/* Phase 1: Gespeicherte Schaltungen */}
          {userSchemas.length > 0 && (
            <>
              <div style={{ padding:'10px 10px 4px', fontSize:9, fontWeight:700, color:'#16a34a', textTransform:'uppercase', letterSpacing:'0.08em', borderTop:'1px solid #e2e8f0', marginTop:6 }}>
                Meine Schaltungen
              </div>
              {userSchemas.map(s=>(
                <div key={s.id} draggable
                  onDragStart={e=>{e.dataTransfer.setData('application/reactflow',`user-schema:${s.id}`); e.dataTransfer.effectAllowed='move';}}
                  style={{ margin:'3px 8px', padding:'6px 8px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, cursor:'grab', fontSize:11, color:'#15803d', userSelect:'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:600 }}>{s.name}</div>
                      <div style={{ fontSize:9, color:'#4ade80' }}>{s.nodes.length} Bauteile</div>
                    </div>
                    <div style={{ display:'flex', gap:2 }}>
                      {/* Überspeichern */}
                      <button onClick={()=>{ if(nodes.length>0&&window.confirm(`"${s.name}" mit aktuellem Canvas überspeichern?`)){updateSchema(s.id,nodes,edges);} }}
                        title="Mit aktuellem Canvas überspeichern"
                        style={{ background:'none', border:'none', color:'#16a34a', cursor:'pointer', fontSize:12, padding:'0 3px', lineHeight:1 }}>↑</button>
                      <button onClick={()=>removeSchema(s.id)}
                        style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:14, padding:'0 2px', lineHeight:1 }}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ padding:'6px 10px 8px', fontSize:9, color:'#cbd5e1', marginTop:4 }}>
            Auf Canvas ziehen.<br/>T-Stück = Mehrfach-Abzweigung
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex:1, position:'relative' }}>
          <ReactFlow
            nodes={nodes} edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            connectionMode={ConnectionMode.Loose}
            snapToGrid snapGrid={[10,10]}
            selectionOnDrag
            multiSelectionKeyCode="Shift"
            defaultEdgeOptions={{ type:'flow', style:{ strokeWidth:2.5 } }}
            fitView
          >
            <Background color="#e2e8f0" gap={20}/>
            <Controls/>
            <MiniMap zoomable pannable nodeStrokeWidth={3}/>
            {nodes.length===0&&(
              <Panel position="top-center">
                <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 18px', fontSize:12, color:'#94a3b8', marginTop:60 }}>
                  Vorlage laden oder Bauteile ziehen
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Properties */}
        <div style={{ width:230, background:'#f8fafc', borderLeft:'1px solid #e2e8f0', overflowY:'auto', flexShrink:0, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'8px 12px 4px', fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid #f1f5f9' }}>
            Eigenschaften
          </div>
          <PropertiesPanel node={selectedNode} nodeFlows={nodeFlows} onUpdate={updateNode} onDelete={deleteNode} navigate={navigate}/>
        </div>
      </div>
    </div>
  );
}

export default function HydraulikEditor() {
  return <ReactFlowProvider><EditorInner/></ReactFlowProvider>;
}
