import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Panel, ConnectionMode, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES } from '../../components/hc/nodes/HydraulikNodes';
import { EDGE_TYPES } from '../../components/hc/edges/FlowEdge';
import { SCHALTUNGEN } from '../../components/hc/nodes/schaltungen';
import { getProject, listSchemas, createSchema, saveSchema } from '../../api/hcApi';

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
    if (nodes.length === 0) return { edgeFlows: {}, nodeFlows: {}, verteilerResults: {} };

    // ── V' pro Heizkreis (Sekundär-Fluss) ────────────────────
    const hkFlows = {};
    const nodeById = {};
    nodes.forEach(n => { nodeById[n.id] = n; });
    // F2: Knoten, an denen die Ast-Suche stoppen muss, damit sie nicht über einen
    // gemeinsamen Erzeuger / anderen Verteiler zu einer FREMDEN Gruppe überläuft.
    const blockNodes = new Set(nodes.filter(n => n.type === 'verteiler' || n.type === 'erzeuger').map(n => n.id));
    nodes.filter(n => n.type === 'heizkreis').forEach(hk => {
      const vl = parseFloat(hk.data.vl_temp), rl = parseFloat(hk.data.rl_temp), q = parseFloat(hk.data.q_kw);
      const dt = vl - rl;
      if (!isNaN(vl) && !isNaN(rl) && !isNaN(q) && dt > 0 && q > 0)
        hkFlows[hk.id] = q / (1.163 * dt);
    });
    if (!Object.keys(hkFlows).length) return { edgeFlows: {}, nodeFlows: {}, verteilerResults: {} };

    const edgeFlows  = {};
    const nodeFlows  = {};
    const calcEdges  = new Set(); // Kanten die schon berechnet wurden
    const verteilerResults = {}; // { [verteilerId]: { vl_vt, rl_misch, q_total, m_prim_total } }

    // ── VL-BFS: ab startId alle HK über VL/schwarz-Kanten summieren ─
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

    // ── RL-BFS: ab startId alle HK über BLAUE Kanten finden (für RL-Ast-Fluss) ─
    // Gibt alle erreichbaren heizkreis-Knoten zurück (Verteiler ausgeschlossen).
    const bfsRlHeizkreise = (startId, excludeNodes) => {
      const ex      = new Set(excludeNodes);
      const visited = new Set([startId, ...ex]);
      const queue   = [startId];
      const found   = [];
      if (nodeById[startId]?.type === 'heizkreis') found.push(startId);
      while (queue.length) {
        const cur = queue.shift();
        for (const e of edges) {
          if (e.style?.stroke !== '#3b82f6') continue; // nur RL-Kanten
          const other = e.source === cur ? e.target : e.target === cur ? e.source : null;
          if (other && !visited.has(other)) {
            visited.add(other);
            if (nodeById[other]?.type === 'heizkreis') found.push(other);
            queue.push(other);
          }
        }
      }
      return found;
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

    // ── 1. Verteiler-zentrierte Berechnung (PHYSIK.md §4) ─────
    nodes.filter(n => n.type === 'verteiler').forEach(vn => {
      const vnEdges = edges.filter(e => e.source === vn.id || e.target === vn.id);

      // Kanten nach Ast-Nummer und Typ (vl/rl) gruppieren
      const branches = {}; // { '1': {vlList, rlList}, 'main': {vlList, rlList} }
      vnEdges.forEach(e => {
        const h = e.source === vn.id ? e.sourceHandle : e.targetHandle;
        const { type, num } = parseHandle(h);
        if (!type || !num) return;
        if (!branches[num]) branches[num] = { vlList: [], rlList: [] };
        if (type === 'vl') branches[num].vlList.push(e);
        if (type === 'rl') branches[num].rlList.push(e);
      });

      // ── Schritt 1: je Ast den externen Knoten + HK-Daten bestimmen ──
      // VL-Ast → externer Knoten über VL-Kante → VL-BFS liefert HK-Liste
      // RL-Ast → externer Knoten über RL-Kante → RL-BFS liefert HK-Liste
      // In beiden Fällen brauchen wir die heizkreis-Daten der Gruppe.

      const astData = []; // { num, vlList, rlList, hkIds: [...] }
      Object.entries(branches).forEach(([num, br]) => {
        if (num === 'main') return;
        // Externe Knoten für VL- und RL-Seite bestimmen
        const vlEdge = br.vlList[0];
        const rlEdge = br.rlList[0];

        // Heizkreise über VL-BFS (rot/schwarz) ab VL-Seite
        let hkIds = [];
        if (vlEdge) {
          const extVl = vlEdge.source === vn.id ? vlEdge.target : vlEdge.source;
          // Alle HKs auf dieser VL-Ast-Seite (F2: an Verteiler UND Erzeuger stoppen)
          const vis = new Set([extVl, ...blockNodes]);
          const q2  = [extVl];
          if (nodeById[extVl]?.type === 'heizkreis') hkIds.push(extVl);
          while (q2.length) {
            const cur = q2.shift();
            for (const e of edges) {
              if (e.style?.stroke === '#3b82f6') continue;
              const other = e.source === cur ? e.target : e.target === cur ? e.source : null;
              if (other && !vis.has(other)) {
                vis.add(other);
                if (nodeById[other]?.type === 'heizkreis') hkIds.push(other);
                q2.push(other);
              }
            }
          }
        } else if (rlEdge) {
          // Kein VL-Ast: RL-BFS als Fallback
          const extRl = rlEdge.source === vn.id ? rlEdge.target : rlEdge.source;
          hkIds = bfsRlHeizkreise(extRl, [...blockNodes]);
        }
        astData.push({ num, vlList: br.vlList, rlList: br.rlList, hkIds });
      });

      // ── Schritt 2: VL_verteiler = max(vl_temp aller HKs) ────
      let vl_vt = -Infinity;
      astData.forEach(ast => {
        ast.hkIds.forEach(hkId => {
          const hk = nodeById[hkId];
          const vl = parseFloat(hk?.data?.vl_temp);
          if (!isNaN(vl)) vl_vt = Math.max(vl_vt, vl);
        });
      });
      if (!isFinite(vl_vt)) vl_vt = null;

      // ── Schritt 3: Primär-Fluss je Ast (PHYSIK.md §4) ────────
      let m_prim_total = 0;
      let rl_num = 0; // Zähler für gewichteten RL_misch
      let q_total = 0;
      const verteilerWarnings = []; // F1: unmögliche Gruppen laut melden statt still auf 0 setzen

      astData.forEach(ast => {
        // Summe Q und RL_misch-Beitrag aller HKs dieser Gruppe
        let ast_q = 0, ast_m_prim = 0;
        ast.hkIds.forEach(hkId => {
          const hk = nodeById[hkId];
          const q   = parseFloat(hk?.data?.q_kw);
          const rl  = parseFloat(hk?.data?.rl_temp);
          if (!isNaN(q) && !isNaN(rl) && vl_vt !== null) {
            const denom = 1.163 * (vl_vt - rl);
            if (denom > 0) {
              const m = q / denom;
              ast_m_prim += m;
              rl_num += m * rl;
              ast_q += q;
            } else {
              // F1: RL ≥ Verteiler-VL → physikalisch unmöglich. Laut warnen statt still 0.
              verteilerWarnings.push(`${hk?.data?.label || 'Heizkreis'}: RL ${rl} °C ≥ Verteiler-VL ${vl_vt} °C — physikalisch nicht möglich`);
            }
          }
        });
        ast.m_prim = ast_m_prim;
        m_prim_total += ast_m_prim;
        q_total += ast_q;

        // VL-Ast-Kanten: Primär-Fluss dieser Gruppe
        ast.vlList.forEach(e => { edgeFlows[e.id] = ast_m_prim; calcEdges.add(e.id); });

        // RL-Ast: RL-BFS vom externen RL-Knoten — eigenen Heizkreis suchen,
        // Fluss = m_prim dieser Gruppe (unabhängig von Stutzen-Nummer, PHYSIK §2)
        ast.rlList.forEach(e => {
          edgeFlows[e.id] = ast_m_prim;
          calcEdges.add(e.id);
        });
      });

      const rl_misch = m_prim_total > 0 ? rl_num / m_prim_total : null;

      // Hauptanschluss = Primär-Gesamt-Fluss
      ;[...(branches.main?.vlList || []), ...(branches.main?.rlList || [])].forEach(e => {
        edgeFlows[e.id] = m_prim_total;
        calcEdges.add(e.id);
      });

      nodeFlows[vn.id] = m_prim_total;
      verteilerResults[vn.id] = {
        vl_vt,
        rl_misch,
        q_total,
        m_prim_total,
        warnings: verteilerWarnings,
      };
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
          // Fluss nur beim Entdecken eines NEUEN Knotens gutschreiben — sonst
          // wird dieselbe Kante von beiden Enden gezählt (Doppelzählung).
          if (!visited.has(to)) {
            if (!calcEdges.has(eid)) edgeFlows[eid] = (edgeFlows[eid] || 0) + flow;
            visited.add(to); queue.push(to);
          }
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
          // Rücklauf: Fluss nur beim Entdecken eines NEUEN Knotens gutschreiben,
          // sonst zählt die Kante doppelt (Bug: 40.585 statt 20.292 nach dem HK).
          if (!visited.has(to)) {
            if (!calcEdges.has(eid)) edgeFlows[eid] = (edgeFlows[eid] || 0) + flow;
            visited.add(to); queue.push(to);
          }
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

    return { edgeFlows, nodeFlows, verteilerResults };
  }, [nodes, edges]);
}

// (Persönliche Schema-Vorlagen folgen in Phase 2 — jetzt lebt das Schema im Backend.)

// ── Properties Panel ─────────────────────────────────────────
function PropertiesPanel({ node, nodeFlows, verteilerResults, onUpdate, onDelete, navigate }) {
  if (!node) return (
    <div style={{ padding: 14, fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Eigenschaften</div>
      Einfachklick = ansehen · <b>Doppelklick = Auslegung öffnen</b>.
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

  // ── VERTEILER ──
  if (node.type === 'verteiler') {
    const vr = verteilerResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>Verteiler</PT>
        {fld('Bezeichnung','label','','','text')}
        {vr ? (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginTop:10, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Verteiler-Hydraulik (Primärseite)</div>
            {ro('VL Verteiler', vr.vl_vt != null ? vr.vl_vt.toFixed(1) : null, '°C', true)}
            {ro('RL Misch', vr.rl_misch != null ? vr.rl_misch.toFixed(1) : null, '°C')}
            {ro('Q total', vr.q_total != null ? vr.q_total.toFixed(2) : null, 'kW', true)}
            {ro('m_prim total', vr.m_prim_total != null ? vr.m_prim_total.toFixed(4) : null, 'm³/h', true)}
            {vr.warnings?.length > 0 && (
              <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c', marginTop:6 }}>
                ⚠ {vr.warnings.join(' · ')}
              </div>
            )}
          </>
        ) : (
          <div style={warnSt}>Heizkreise an Verteiler anschliessen</div>
        )}
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

// ── Auslegungs-Modal (Doppelklick auf ein Bauteil) ───────────
const TITLES = {
  heizkreis: 'Heizkreis', valve2: '2-Wege Regelventil', valve3: '3-Wege Mischventil',
  pump: 'Pumpe', erzeuger: 'Wärmeerzeuger', verteiler: 'Verteiler', speicher: 'Speicher',
};

function BigVal({ label, value, unit = '', sub = '', color = '#1d4ed8' }) {
  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:11, color:'#64748b' }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'monospace' }}>
        {value != null && value !== '' ? `${value}${unit ? ' ' + unit : ''}` : '—'}
      </div>
      {sub && <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function AuslegungModal({ node, v, onUpdate, onClose, navigate }) {
  const d = node.data;
  const set = (k, val) => onUpdate(node.id, k, val);
  let body;

  if (node.type === 'heizkreis') {
    const vl=parseFloat(d.vl_temp), rl=parseFloat(d.rl_temp), q=parseFloat(d.q_kw);
    const dt=vl-rl, calc=(!isNaN(vl)&&!isNaN(rl)&&!isNaN(q)&&dt>0)?q/(1.163*dt):null;
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><label style={lbl}>Vorlauf [°C]</label>
            <input type="number" style={{...inp,borderColor:'#fca5a5'}} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
          <div><label style={lbl}>Rücklauf [°C]</label>
            <input type="number" style={{...inp,borderColor:'#93c5fd'}} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
        </div>
        <div><label style={lbl}>Leistung Q [kW]</label>
          <input type="number" style={inp} value={d.q_kw??''} onChange={e=>set('q_kw',e.target.value)} placeholder="8.5"/></div>
        <BigVal label="Volumenstrom V'" value={calc!=null?calc.toFixed(4):null} unit="m³/h" color="#15803d"
          sub={calc!=null?`V' = Q / (1.163 · ΔT),  ΔT = ${dt} K  →  ${(calc*1000).toFixed(0)} l/h`:'Vorlauf, Rücklauf und Leistung eingeben'}/>
      </div>
    );
  } else if (node.type === 'valve2') {
    const dp_kpa=parseFloat(d.dp_var), dp_bar=dp_kpa/100;
    let kvs_theor=null, kvs_vorschlag=null, pv=null;
    if(v&&dp_kpa>0){kvs_theor=v/Math.sqrt(dp_bar); kvs_vorschlag=KVS_REIHE.find(k=>k>=kvs_theor)||KVS_REIHE.at(-1);}
    const kvs_eff=parseFloat(d.kvs_eff||kvs_vorschlag);
    if(v&&kvs_eff>0){const dpv=(v/kvs_eff)**2; pv=dpv/(dpv+dp_bar)*100;}
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <BigVal label="Durchfluss V' (aus verbundenem Heizkreis)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"
          sub={v?'kommt automatisch aus der Topologie':'Bauteil mit einem Heizkreis verbinden'}/>
        <div><label style={lbl}>Δpvar — Druckabfall variabler Anlagenteil [kPa]</label>
          <input type="number" style={inp} value={d.dp_var??''} onChange={e=>set('dp_var',e.target.value)} placeholder="26"/></div>
        {kvs_theor ? <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <BigVal label="kvs theoretisch" value={kvs_theor.toFixed(3)} color="#1e293b"/>
            <BigVal label="kvs Vorschlag" value={kvs_vorschlag} color="#1d4ed8" sub="nächstgrösser, Norm-Reihe"/>
          </div>
          <div><label style={lbl}>kvs gewählt</label>
            <select style={{...inp,cursor:'pointer'}} value={d.kvs_eff||kvs_vorschlag||''} onChange={e=>set('kvs_eff',e.target.value)}>
              {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===kvs_vorschlag?'  ← Vorschlag':''}</option>)}
            </select></div>
          {pv!=null && <PvBox pv={pv} v={v} kvs_eff={kvs_eff}/>}
        </> : <div style={warnSt}>Δpvar eingeben und Heizkreis verbinden — dann erscheint die kvs-Auslegung.</div>}
      </div>
    );
  } else if (node.type === 'valve3') {
    const dp_kpa=parseFloat(d.dp_var), dp_bar=dp_kpa/100;
    const kvs_vorschlag = (v&&dp_kpa>0) ? (KVS_REIHE.find(k=>k>=v/Math.sqrt(dp_bar))||KVS_REIHE.at(-1)) : null;
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <BigVal label="Durchfluss V' (aus Topologie)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"/>
        <div><label style={lbl}>Δpvar [kPa]</label>
          <input type="number" style={inp} value={d.dp_var??''} onChange={e=>set('dp_var',e.target.value)} placeholder="26"/></div>
        <BigVal label="kvs Vorschlag" value={kvs_vorschlag} color="#1d4ed8"/>
      </div>
    );
  } else if (node.type === 'pump') {
    const rohrL=parseFloat(d.rohr_m)||0, pam=parseFloat(d.pam)||70, app=parseFloat(d.apparate_kpa)||0;
    const dpRohr=rohrL*pam/1000, dpTotal=dpRohr+app;
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <BigVal label="Förder-Volumenstrom V' (aus Topologie)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div><label style={lbl}>Rohr VL+RL [m]</label><input type="number" style={inp} value={d.rohr_m??''} onChange={e=>set('rohr_m',e.target.value)} placeholder="120"/></div>
          <div><label style={lbl}>Auf [Pa/m]</label><input type="number" style={inp} value={d.pam??''} onChange={e=>set('pam',e.target.value)} placeholder="70"/></div>
          <div><label style={lbl}>Apparate [kPa]</label><input type="number" style={inp} value={d.apparate_kpa??''} onChange={e=>set('apparate_kpa',e.target.value)} placeholder="22"/></div>
        </div>
        <BigVal label="Förderhöhe" value={dpTotal>0?dpTotal.toFixed(1):null} unit="kPa"
          sub={dpTotal>0?`Rohr ${dpRohr.toFixed(1)} + Apparate ${app.toFixed(1)} kPa  =  ${(dpTotal/10).toFixed(2)} mWS`:'Rohrlänge und Apparate eingeben'}/>
      </div>
    );
  } else if (node.type === 'erzeuger') {
    body = (
      <div style={{ display:'grid', gap:10 }}>
        <div><label style={lbl}>Typ</label><input style={inp} value={d.typ??''} onChange={e=>set('typ',e.target.value)} placeholder="z.B. Wärmepumpe"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div><label style={lbl}>Leistung [kW]</label><input type="number" style={inp} value={d.leistung_kw??''} onChange={e=>set('leistung_kw',e.target.value)}/></div>
          <div><label style={lbl}>VL [°C]</label><input type="number" style={inp} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)}/></div>
          <div><label style={lbl}>RL [°C]</label><input type="number" style={inp} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)}/></div>
        </div>
        <button style={btnBlue} onClick={()=>navigate('/heizungscockpit/rechner/ravel')}>→ RAVEL Wirtschaftlichkeit</button>
      </div>
    );
  } else {
    body = <div style={{ fontSize:12, color:'#94a3b8' }}>Für dieses Bauteil ist in Phase 1 noch keine Auslegung hinterlegt.</div>;
  }

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e=>e.stopPropagation()} style={modalCard}>
        <div style={modalHeader}>
          <div>
            <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94a3b8' }}>Auslegung</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#1e293b' }}>
              {TITLES[node.type] || node.type}{d.label ? ` — ${d.label}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={modalClose} title="Schliessen">×</button>
        </div>
        <div style={{ padding:'4px 20px 16px' }}>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Bezeichnung</label>
            <input style={inp} value={d.label??''} onChange={e=>set('label',e.target.value)} placeholder="z.B. Ventil 1 — HK1 FBH"/>
          </div>
          {body}
        </div>
        <div style={{ padding:'10px 20px', borderTop:'1px solid #f1f5f9', fontSize:11, color:'#94a3b8', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>Änderungen werden automatisch im Schema gespeichert.</span>
          <button onClick={onClose} style={{ background:'#1d4ed8', color:'white', border:'none', borderRadius:6, padding:'5px 16px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Fertig</button>
        </div>
      </div>
    </div>
  );
}

const modalBackdrop = { position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 };
const modalCard = { background:'white', borderRadius:12, width:'min(560px, 94vw)', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.35)' };
const modalHeader = { display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'18px 20px 8px' };
const modalClose = { background:'none', border:'none', fontSize:26, lineHeight:1, color:'#94a3b8', cursor:'pointer', padding:0 };

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
  const { id: projectId } = useParams();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected]     = useState(null);
  const [edgeColor, setEdgeColor]   = useState('#ef4444');
  const [schemaName, setSchemaName] = useState('Schema');
  const [projectName, setProjectName] = useState('');
  const [schemaId, setSchemaId]     = useState(null);
  const [loaded, setLoaded]         = useState(false);
  const [saveState, setSaveState]   = useState('idle'); // idle | saving | saved | error
  const [auslegung, setAuslegung]   = useState(null);   // Bauteil für Doppelklick-Auslegung

  const { edgeFlows, nodeFlows, verteilerResults } = useHydraulicFlows(nodes, edges);

  // ── Schema aus Backend laden (oder anlegen, falls noch keins existiert) ──
  // Ref-Guard: pro Projekt nur EINMAL initialisieren. React-StrictMode führt
  // Effekte im Dev-Modus absichtlich doppelt aus — ohne Guard würden dabei
  // zwei Schemas angelegt. Bei Projektwechsel (neue id) wird neu geladen.
  const initedProject = useRef(null);
  useEffect(() => {
    if (initedProject.current === projectId) return;
    initedProject.current = projectId;
    (async () => {
      try {
        const proj = await getProject(projectId);
        setProjectName(proj.name);
      } catch { /* Projektname ist optional */ }
      try {
        const list = await listSchemas(projectId);
        const s = list[0] || await createSchema(projectId, { name: 'Schema', graph: { nodes: [], edges: [] } });
        setSchemaId(s.id);
        setSchemaName(s.name || 'Schema');
        setNodes(s.graph?.nodes || []);
        setEdges(s.graph?.edges || []);
      } catch (e) {
        console.error('Schema konnte nicht geladen werden', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [projectId, setNodes, setEdges]);

  // ── Autosave (debounced) — das Schema ist die eine Wahrheit ──
  useEffect(() => {
    if (!loaded || !schemaId) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await saveSchema(schemaId, { name: schemaName, graph: { nodes, edges } });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, schemaName, loaded, schemaId]);

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
    setSelected(null);
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
    const p = STD_PALETTE.find(p => p.type === raw);
    setNodes(ns => [...ns, { id: newId(), type: raw, position: pos, data: { label: p?.label || raw } }]);
  }, [screenToFlowPosition, setNodes, snap]);

  const onNodeClick       = useCallback((_, n) => setSelected(n), []);
  const onNodeDoubleClick = useCallback((_, n) => setAuslegung(n), []);
  const onPaneClick  = useCallback(() => setSelected(null), []);
  const selectedNode  = selected  ? nodes.find(n => n.id === selected.id)  || null : null;
  const auslegungNode = auslegung ? nodes.find(n => n.id === auslegung.id) || null : null;

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
        <Link to={`/heizungscockpit/projekte/${projectId}`} style={{ fontSize:12, color:'#2563eb', whiteSpace:'nowrap' }}>← {projectName || 'Projekt'}</Link>
        <span style={{ color:'#e2e8f0' }}>|</span>
        <input value={schemaName} onChange={e=>setSchemaName(e.target.value)}
          style={{ fontSize:13, fontWeight:700, border:'1px solid #f1f5f9', borderRadius:4, padding:'2px 8px', color:'#1e293b', minWidth:160 }}/>
        <span style={{ fontSize:11, whiteSpace:'nowrap', color: saveState==='error' ? '#dc2626' : saveState==='saving' ? '#94a3b8' : '#16a34a' }}>
          {saveState==='saving' ? '● Speichere…' : saveState==='error' ? '● Nicht gespeichert' : loaded ? '● Gespeichert' : ''}
        </span>

        <span style={{ fontSize:11, color:'#94a3b8' }}>Vorlage:</span>
        {Object.entries(SCHALTUNGEN).map(([k,s])=>(
          <button key={k} onClick={()=>loadSchema(k)}
            style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', color:'#374151', whiteSpace:'nowrap' }}>
            {s.name}
          </button>
        ))}

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

          {/* Persönliche Vorlagen folgen in Phase 2 (dann aus dem Backend) */}

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
            onNodeDoubleClick={onNodeDoubleClick}
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
          <PropertiesPanel node={selectedNode} nodeFlows={nodeFlows} verteilerResults={verteilerResults} onUpdate={updateNode} onDelete={deleteNode} navigate={navigate}/>
        </div>
      </div>

      {auslegungNode && (
        <AuslegungModal
          node={auslegungNode}
          v={nodeFlows[auslegungNode.id]}
          onUpdate={updateNode}
          onClose={() => setAuslegung(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

export default function HydraulikEditor() {
  return <ReactFlowProvider><EditorInner/></ReactFlowProvider>;
}
