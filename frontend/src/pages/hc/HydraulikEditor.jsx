import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Panel, ConnectionMode, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES, NUMMERIERT } from '../../components/hc/nodes/HydraulikNodes';
import { EDGE_TYPES } from '../../components/hc/edges/FlowEdge';
import { SCHALTUNGEN } from '../../components/hc/nodes/schaltungen';
import { getProject, listSchemas, createSchema, saveSchema, hydraulikBerechnen } from '../../api/hcApi';
import { API_BASE } from '../../api';

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
  { type: 'gruppe',     label: 'Verbrauchergruppe',  desc: 'CAD-Strang: Pumpe, Einspritz, Q/VL/RL' },
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

// Nächste freie Bauteil-Nummer (Nummerierung bleibt stabil, weil sie in
// node.data.nr gespeichert wird — das Schema ist die Datenbank).
const naechsteNr = (ns) => ns.reduce((m, x) => Math.max(m, parseInt(x.data?.nr) || 0), 0) + 1;

// ── Hydraulik-Berechnung: passiert im BACKEND (Goldene Regel) ──
// Der Editor schickt den Graphen (debounced) an POST /api/v1/hydraulik/berechnen
// und zeigt nur noch die Resultate an. Regeln: PHYSIK.md §1–§4,
// Rechen-Kern: backend/app/calculations/hydraulik.py (pytest-getestet).

// (Persönliche Schema-Vorlagen folgen in Phase 2 — jetzt lebt das Schema im Backend.)

// ── Properties Panel ─────────────────────────────────────────
function PropertiesPanel({ node, nodeFlows, verteilerResults, gruppeResults, onUpdate, onDelete, onSetAbgaenge, navigate }) {
  if (!node) return (
    <div style={{ padding: 14, fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Eigenschaften</div>
      Einfachklick = ansehen · <b>Doppelklick = Auslegung öffnen</b>.
      <div style={{ marginTop: 14, fontSize: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
        <b>Verbrauchergruppe (roter Block):</b> auf die Leinwand ziehen, VL/RL unten an die Verteiler-Stutzen anschliessen — die Einspritzung wird im Block gerechnet.<br /><br />
        <b>Verteiler:</b> Anzahl Abgänge hier im Panel wählbar. Die Summen stehen links am Balken.
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

  // ── VERBRAUCHERGRUPPE (ein Block, Einspritz-Rechnung intern — PHYSIK §4) ──
  if (node.type === 'gruppe') {
    const gr = gruppeResults?.[node.id];
    const vl=parseFloat(d.vl_temp), rl=parseFloat(d.rl_temp), dt=vl-rl;
    return (
      <div style={panelSt}>
        <PT>Verbrauchergruppe</PT>
        {fld('Bezeichnung','label','z.B. Gruppe 1 — FBH EG','','text')}
        <label style={lbl}>Typ (Wärmeabgabe)</label>
        <select style={{...inp,cursor:'pointer'}} value={d.typ||''} onChange={e=>{
          const s=WAERMEABGABE.find(x=>x.label===e.target.value);
          set('typ',e.target.value); if(s){set('vl_temp',s.vl);set('rl_temp',s.rl);}
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
        {fld('Druckverlust Ast','dp_kpa','z.B. 20','kPa')}
        {vl>0&&rl>0&&dt<=0&&<div style={warnSt}>⚠ VL muss grösser als RL sein</div>}
        <div style={{ display:'flex', gap:12, marginTop:8, fontSize:11, color:'#374151' }}>
          <label style={{ display:'flex', gap:4, alignItems:'center', cursor:'pointer' }}>
            <input type="checkbox" checked={d.hat_pumpe!==false} onChange={e=>set('hat_pumpe',e.target.checked)}/> Pumpe
          </label>
          <label style={{ display:'flex', gap:4, alignItems:'center', cursor:'pointer' }}>
            <input type="checkbox" checked={d.hat_ventil!==false} onChange={e=>set('hat_ventil',e.target.checked)}/> Ventil
          </label>
        </div>
        {gr && gr.m_sek != null ? (
          <>
            <ResultBox v={gr.m_sek} label="V' sekundär (Gruppenseite)" unit="m³/h" />
            {ro("V' primär (Verteilerseite)", gr.m_prim, 'm³/h', true)}
            {gr.einspritz ? (
              <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6, padding:'6px 8px', marginTop:4, fontSize:10, color:'#b91c1c' }}>
                <b>Einspritzung aktiv</b> — Bypass {Number(gr.m_bypass).toFixed(3)} m³/h · ΔT prim {gr.dt_prim} K
              </div>
            ) : (
              <div style={{ fontSize:9, color:'#94a3b8', marginTop:4 }}>Keine Einspritzung — primär = sekundär.</div>
            )}
            {gr.pumpe?.dp_kpa != null && ro('Pumpe Förderhöhe', `${gr.pumpe.dp_kpa.toFixed(1)} kPa = ${gr.pumpe.mws.toFixed(2)} mWS`, '')}
            {gr.ventil && ro('Ventil kvs / Autorität', `${gr.ventil.kvs_eff} / ${gr.ventil.pv.toFixed(1)} %`, '')}
            <div style={{ fontSize:9, color:'#94a3b8', marginTop:4 }}>Pumpe + Ventil auslegen: <b>Doppelklick</b> auf den Strang.</div>
          </>
        ) : (
          <div style={warnSt}>Q, VL und RL eingeben — das Backend rechnet automatisch.</div>
        )}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── HEIZKREIS ──
  if (node.type === 'heizkreis') {
    const vl=parseFloat(d.vl_temp), rl=parseFloat(d.rl_temp), dt=vl-rl;
    const calc = v ?? null; // V' kommt vom Backend
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
        <label style={lbl}>Anzahl Abgänge</label>
        <select style={{...inp,cursor:'pointer'}} value={parseInt(d.abgaenge)||4} onChange={e=>onSetAbgaenge(node.id, parseInt(e.target.value))}>
          {[2,3,4,5,6,7,8].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        {fld('Abstand VL–RL Balken','hoehe','560 (Standard)','px')}
        {vr ? (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginTop:10, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Verteiler-Hydraulik (Primärseite)</div>
            {ro('VL Verteiler', vr.vl_vt != null ? vr.vl_vt.toFixed(1) : null, '°C', true)}
            {ro('RL Misch', vr.rl_misch != null ? vr.rl_misch.toFixed(1) : null, '°C')}
            {ro('Q total', vr.q_total != null ? vr.q_total.toFixed(2) : null, 'kW', true)}
            {ro('m_prim total', vr.m_prim_total != null ? vr.m_prim_total.toFixed(4) : null, 'm³/h', true)}
            {ro('Δp ungünstigster Ast', vr.dp_max_ast != null ? `${vr.dp_max_ast.toFixed(1)} (Ast ${vr.dp_max_ast_nr})` : null, 'kPa')}
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
  gruppe: 'Verbrauchergruppe', heizkreis: 'Heizkreis', valve2: '2-Wege Regelventil',
  valve3: '3-Wege Mischventil', pump: 'Pumpe', erzeuger: 'Wärmeerzeuger',
  verteiler: 'Verteiler', speicher: 'Speicher',
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

function AuslegungModal({ node, v, gr, vr, onUpdate, onClose, navigate }) {
  const d = node.data;
  const set = (k, val) => onUpdate(node.id, k, val);
  let body;

  if (node.type === 'gruppe') {
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <div><label style={lbl}>Typ (Wärmeabgabe)</label>
          <select style={{...inp,cursor:'pointer'}} value={d.typ||''} onChange={e=>{
            const s=WAERMEABGABE.find(x=>x.label===e.target.value);
            set('typ',e.target.value); if(s){set('vl_temp',s.vl);set('rl_temp',s.rl);}
          }}>
            <option value="">— wählen —</option>
            {WAERMEABGABE.map(x=><option key={x.label}>{x.label}</option>)}
          </select></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div><label style={lbl}>VL [°C]</label><input type="number" style={{...inp,borderColor:'#fca5a5'}} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
          <div><label style={lbl}>RL [°C]</label><input type="number" style={{...inp,borderColor:'#93c5fd'}} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
          <div><label style={lbl}>Q [kW]</label><input type="number" style={inp} value={d.q_kw??''} onChange={e=>set('q_kw',e.target.value)} placeholder="8.5"/></div>
        </div>
        <div><label style={lbl}>Druckverlust Ast [kPa] — für den ungünstigsten Ast am Verteiler</label>
          <input type="number" style={inp} value={d.dp_kpa??''} onChange={e=>set('dp_kpa',e.target.value)} placeholder="20"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <BigVal label="V' sekundär (Gruppenseite)" value={gr?.m_sek!=null?Number(gr.m_sek).toFixed(3):null} unit="m³/h" color="#15803d"
            sub={gr?.dt_sek!=null?`ΔT sek = ${gr.dt_sek} K`:''}/>
          <BigVal label="V' primär (Verteilerseite)" value={gr?.m_prim!=null?Number(gr.m_prim).toFixed(3):null} unit="m³/h" color="#1d4ed8"
            sub={gr?.dt_prim!=null?`ΔT prim = ${gr.dt_prim} K`:''}/>
        </div>
        {gr?.einspritz
          ? <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 12px', fontSize:11, color:'#b91c1c' }}>
              <b>Einspritzung aktiv</b> (PHYSIK §4): Der Bypass im Block trägt {Number(gr.m_bypass).toFixed(3)} m³/h.
              Die Gruppe mischt die Verteiler-VL auf {d.vl_temp} °C herunter.
            </div>
          : <div style={{ fontSize:11, color:'#94a3b8' }}>Keine Einspritzung — die Gruppe läuft direkt mit der Verteiler-Vorlauftemperatur (primär = sekundär).</div>}

        {/* Ausrüstung im Strang: Pumpe + Ventil wie Einzelbauteile auslegen */}
        <div style={{ display:'flex', gap:16, fontSize:12, color:'#374151' }}>
          <label style={{ display:'flex', gap:5, alignItems:'center', cursor:'pointer' }}>
            <input type="checkbox" checked={d.hat_pumpe!==false} onChange={e=>set('hat_pumpe',e.target.checked)}/> Pumpe im Strang
          </label>
          <label style={{ display:'flex', gap:5, alignItems:'center', cursor:'pointer' }}>
            <input type="checkbox" checked={d.hat_ventil!==false} onChange={e=>set('hat_ventil',e.target.checked)}/> Ventil im Strang
          </label>
        </div>

        {d.hat_pumpe !== false && (
          <div style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1e293b', marginBottom:8 }}>Pumpe im Strang (Sekundärkreis, V' = {gr?.m_sek!=null?Number(gr.m_sek).toFixed(3):'—'} m³/h)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <div><label style={lbl}>Rohr VL+RL [m]</label><input type="number" style={inp} value={d.pumpe_rohr_m??''} onChange={e=>set('pumpe_rohr_m',e.target.value)} placeholder="40"/></div>
              <div><label style={lbl}>Auf [Pa/m]</label><input type="number" style={inp} value={d.pumpe_pam??''} onChange={e=>set('pumpe_pam',e.target.value)} placeholder="70"/></div>
              <div><label style={lbl}>Apparate [kPa]</label><input type="number" style={inp} value={d.pumpe_apparate_kpa??''} onChange={e=>set('pumpe_apparate_kpa',e.target.value)} placeholder="15"/></div>
            </div>
            <div style={{ marginTop:8 }}>
              <BigVal label="Förderhöhe" value={gr?.pumpe?.dp_kpa!=null?gr.pumpe.dp_kpa.toFixed(1):null} unit="kPa"
                sub={gr?.pumpe?.dp_kpa!=null?`= ${gr.pumpe.mws.toFixed(2)} mWS · bei V' ${Number(gr.pumpe.v??0).toFixed(3)} m³/h`:'Rohrlänge/Apparate eingeben'}/>
            </div>
          </div>
        )}

        {d.hat_ventil !== false && (
          <div style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1e293b', marginBottom:8 }}>Einspritz-/Regelventil (Primärseite, V' = {gr?.m_prim!=null?Number(gr.m_prim).toFixed(3):'—'} m³/h)</div>
            <div><label style={lbl}>Δpvar — Druckabfall variabler Anlagenteil [kPa]</label>
              <input type="number" style={inp} value={d.ventil_dp_var??''} onChange={e=>set('ventil_dp_var',e.target.value)} placeholder="26"/></div>
            {gr?.ventil ? (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                  <BigVal label="kvs theoretisch" value={Number(gr.ventil.kvs_theor).toFixed(3)} color="#1e293b"/>
                  <BigVal label="kvs Vorschlag" value={gr.ventil.kvs_vorschlag} color="#1d4ed8" sub="nächstgrösser, Norm-Reihe"/>
                </div>
                <div style={{ marginTop:8 }}><label style={lbl}>kvs gewählt</label>
                  <select style={{...inp,cursor:'pointer'}} value={d.ventil_kvs_eff||gr.ventil.kvs_vorschlag||''} onChange={e=>set('ventil_kvs_eff',e.target.value)}>
                    {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===gr.ventil.kvs_vorschlag?'  ← Vorschlag':''}</option>)}
                  </select></div>
                <PvBox pv={gr.ventil.pv} v={gr.ventil.v} kvs_eff={gr.ventil.kvs_eff}/>
              </>
            ) : (
              <div style={{ ...warnSt, marginTop:8 }}>Δpvar eingeben — dann rechnet das Backend kvs + Ventilautorität.</div>
            )}
          </div>
        )}
      </div>
    );
  } else if (node.type === 'verteiler') {
    body = vr ? (
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <BigVal label="VL Verteiler" value={vr.vl_vt!=null?vr.vl_vt.toFixed(1):null} unit="°C" color="#dc2626" sub="höchste Gruppen-VL (PHYSIK §4)"/>
          <BigVal label="RL Misch" value={vr.rl_misch!=null?vr.rl_misch.toFixed(1):null} unit="°C" color="#2563eb" sub="mengengewichtet über Primär-Flüsse"/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <BigVal label="Σ Leistung" value={vr.q_total!=null?vr.q_total.toFixed(2):null} unit="kW" color="#15803d"/>
          <BigVal label="Σ V' primär" value={vr.m_prim_total!=null?vr.m_prim_total.toFixed(4):null} unit="m³/h" color="#15803d"/>
        </div>
        <BigVal label="Δp ungünstigster Ast" value={vr.dp_max_ast!=null?vr.dp_max_ast.toFixed(1):null} unit="kPa"
          sub={vr.dp_max_ast_nr?`Ast ${vr.dp_max_ast_nr} ist massgebend — übrige Kreise über Ventile einregeln`:'Δp je Gruppe eingeben (Feld «Druckverlust Ast»)'}/>
        {vr.warnings?.length > 0 && (
          <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c' }}>⚠ {vr.warnings.join(' · ')}</div>
        )}
      </div>
    ) : <div style={warnSt}>Verbrauchergruppen an die Stutzen anschliessen — dann rechnet der Verteiler.</div>;
  } else if (node.type === 'heizkreis') {
    const vl=parseFloat(d.vl_temp), rl=parseFloat(d.rl_temp);
    const dt=vl-rl, calc = v ?? null; // V' kommt vom Backend
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
  const [showLegende, setShowLegende] = useState(false);

  const [hydraulik, setHydraulik] = useState({ edge_flows: {}, node_flows: {}, verteiler_results: {}, gruppe_results: {} });

  // Graph (debounced) ans Backend schicken — dort wird gerechnet
  useEffect(() => {
    if (!loaded) return;
    let weg = false;
    const t = setTimeout(async () => {
      try {
        const res = await hydraulikBerechnen({
          nodes: nodes.map(n => ({ id: n.id, type: n.type, data: { ...n.data, _calc: undefined } })),
          edges: edges.map(e => ({
            id: e.id, source: e.source, target: e.target,
            sourceHandle: e.sourceHandle || null, targetHandle: e.targetHandle || null,
            stroke: e.style?.stroke || null,
          })),
        });
        if (!weg) setHydraulik(res);
      } catch { /* Backend nicht erreichbar — letzte Werte behalten */ }
    }, 350);
    return () => { weg = true; clearTimeout(t); };
  }, [nodes, edges, loaded]);

  const edgeFlows = hydraulik.edge_flows || {};
  const nodeFlows = hydraulik.node_flows || {};
  const verteilerResults = hydraulik.verteiler_results || {};
  const gruppeResults = hydraulik.gruppe_results || {};

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
        // Fehlende Bauteil-Nummern nachtragen (ältere Schemas)
        let geladen = s.graph?.nodes || [];
        let maxNr = geladen.reduce((m, x) => Math.max(m, parseInt(x.data?.nr) || 0), 0);
        geladen = geladen.map(n => (NUMMERIERT.includes(n.type) && n.data?.nr == null)
          ? { ...n, data: { ...n.data, nr: ++maxNr } } : n);
        setNodes(geladen);
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

  // Berechnete Werte (Backend) in die Node-Daten spiegeln — nur für die Anzeige.
  // Verteiler-Rahmen: nur die Balken sind greifbar (dragHandle), die Lücke
  // dazwischen lässt Klicks durch (pointerEvents none) und liegt hinter den
  // Strängen (zIndex -10) — so lassen sich Gruppen zwischen die Balken stellen.
  const displayNodes = useMemo(() => nodes.map(n => {
    if (n.type === 'verteiler') {
      const c = verteilerResults[n.id];
      return {
        ...n,
        dragHandle: '.vt-bar',
        zIndex: -10,
        style: { ...n.style, pointerEvents: 'none' },
        data: c ? { ...n.data, _calc: c } : n.data,
      };
    }
    if (n.type === 'gruppe' || n.type === 'heizkreis') {
      return { ...n, data: { ...n.data, _calc: { ...(gruppeResults[n.id] || {}), v: nodeFlows[n.id] } } };
    }
    return n;
  }), [nodes, verteilerResults, gruppeResults, nodeFlows]);

  // Legende: Nr · Bauteil · Bezeichnung · Kennwerte (reine Anzeige der
  // Backend-Resultate — dieselben Zeilen erscheinen im PDF)
  const legende = useMemo(() => {
    const fx = (v, d = 3) => (v == null ? '—' : Number(v).toFixed(d));
    return nodes
      .filter(n => !['junction', 'label'].includes(n.type))
      .slice()
      .sort((a, b) => (parseInt(a.data?.nr) || 9999) - (parseInt(b.data?.nr) || 9999))
      .map(n => {
        const d = n.data || {};
        let werte = '—';
        if (n.type === 'gruppe') {
          const c = gruppeResults[n.id] || {};
          werte = `${d.q_kw ?? '—'} kW · ${d.vl_temp ?? '—'}/${d.rl_temp ?? '—'} °C · sek ${fx(c.m_sek)} / prim ${fx(c.m_prim)} m³/h${c.einspritz ? ' · Einspritz' : ''}${d.dp_kpa ? ` · Δp ${d.dp_kpa} kPa` : ''}`;
        } else if (n.type === 'heizkreis') {
          werte = `${d.q_kw ?? '—'} kW · ${d.vl_temp ?? '—'}/${d.rl_temp ?? '—'} °C · V' ${fx(nodeFlows[n.id])} m³/h`;
        } else if (n.type === 'verteiler') {
          const c = verteilerResults[n.id] || {};
          werte = `VL ${fx(c.vl_vt, 1)} / RL ${fx(c.rl_misch, 1)} °C · Σ ${fx(c.q_total, 2)} kW · ${fx(c.m_prim_total)} m³/h${c.dp_max_ast != null ? ` · Δp Ast ${c.dp_max_ast_nr}: ${c.dp_max_ast} kPa` : ''}`;
        } else if (n.type === 'pump') {
          werte = `V' ${fx(nodeFlows[n.id])} m³/h`;
        } else if (n.type === 'valve2' || n.type === 'valve3') {
          werte = `V' ${fx(nodeFlows[n.id])} m³/h${d.dp_var ? ` · Δpvar ${d.dp_var} kPa` : ''}${d.kvs_eff ? ` · kvs ${d.kvs_eff}` : ''}`;
        } else if (n.type === 'erzeuger') {
          werte = [d.typ, d.leistung_kw ? `${d.leistung_kw} kW` : null].filter(Boolean).join(' · ') || '—';
        }
        return { nr: d.nr, bauteil: TITLES[n.type] || n.type, bez: d.label || '', werte };
      });
  }, [nodes, gruppeResults, verteilerResults, nodeFlows]);

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
    const extra = raw === 'verteiler' ? { abgaenge: 4 } : {};
    setNodes(ns => [...ns, {
      id: newId(), type: raw, position: pos,
      data: { label: p?.label || raw, ...extra, ...(NUMMERIERT.includes(raw) ? { nr: naechsteNr(ns) } : {}) },
    }]);
  }, [screenToFlowPosition, setNodes, snap]);

  const onNodeClick       = useCallback((_, n) => setSelected(n), []);
  const onNodeDoubleClick = useCallback((_, n) => setAuslegung(n), []);
  const onPaneClick  = useCallback(() => setSelected(null), []);
  const selectedNode  = selected  ? nodes.find(n => n.id === selected.id)  || null : null;
  const auslegungNode = auslegung ? nodes.find(n => n.id === auslegung.id) || null : null;

  const updateNode = (id, key, val) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  // Verteiler: Anzahl Abgänge ändern — Leitungen an wegfallenden Stutzen entfernen
  const setAbgaenge = (id, count) => {
    snap();
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, abgaenge: count } } : n));
    setEdges(es => es.filter(e => {
      const h = e.source === id ? e.sourceHandle : e.target === id ? e.targetHandle : null;
      const m = h && h.match(/^(vl|rl)-(\d+)$/);
      return !m || parseInt(m[2]) <= count;
    }));
  };

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

        <span style={{ fontSize:11, color:'#94a3b8', marginLeft:6 }}>PDF:</span>
        {[['schema','Schema'],['berechnungen','Rechnung'],['beides','Beides']].map(([k,t])=>(
          <button key={k} disabled={!schemaId}
            onClick={()=>window.open(`${API_BASE}/api/v1/schemas/${schemaId}/pdf?inhalt=${k}`,'_blank')}
            style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', cursor:'pointer', whiteSpace:'nowrap' }}>
            ⤓ {t}
          </button>
        ))}
        <button onClick={()=>setShowLegende(v=>!v)}
          style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:'1px solid #e2e8f0', background: showLegende?'#1e293b':'#f8fafc', color: showLegende?'white':'#374151', cursor:'pointer', whiteSpace:'nowrap' }}>
          Legende
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

          {/* Persönliche Vorlagen folgen in Phase 2 (dann aus dem Backend) */}

          <div style={{ padding:'6px 10px 8px', fontSize:9, color:'#cbd5e1', marginTop:4 }}>
            Auf Canvas ziehen.<br/>T-Stück = Mehrfach-Abzweigung
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex:1, position:'relative' }}>
          <ReactFlow
            nodes={displayNodes} edges={displayEdges}
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

          {/* Legende (Pflichtenheft §10) — dieselben Zeilen landen im PDF */}
          {showLegende && (
            <div style={{ position:'absolute', left:0, right:0, bottom:0, background:'white', borderTop:'2px solid #e2e8f0', maxHeight:190, overflowY:'auto', zIndex:20, padding:'6px 14px 10px', boxShadow:'0 -6px 16px rgba(15,23,42,0.08)' }}>
              <table style={{ width:'100%', fontSize:10, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', fontSize:8 }}>
                    <th style={{ padding:'4px 8px 4px 0', width:30 }}>Nr</th>
                    <th style={{ padding:'4px 8px 4px 0', width:140 }}>Bauteil</th>
                    <th style={{ padding:'4px 8px 4px 0', width:170 }}>Bezeichnung</th>
                    <th style={{ padding:'4px 0' }}>Kennwerte</th>
                  </tr>
                </thead>
                <tbody>
                  {legende.map((z, i) => (
                    <tr key={i} style={{ borderTop:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'3px 8px 3px 0', fontWeight:700, color:'#dc2626' }}>{z.nr ?? '—'}</td>
                      <td style={{ padding:'3px 8px 3px 0', color:'#1e293b' }}>{z.bauteil}</td>
                      <td style={{ padding:'3px 8px 3px 0', color:'#475569' }}>{z.bez}</td>
                      <td style={{ padding:'3px 0', fontFamily:'monospace', color:'#334155' }}>{z.werte}</td>
                    </tr>
                  ))}
                  {legende.length===0 && (
                    <tr><td colSpan="4" style={{ padding:8, color:'#94a3b8' }}>Noch keine Bauteile im Schema.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Properties */}
        <div style={{ width:230, background:'#f8fafc', borderLeft:'1px solid #e2e8f0', overflowY:'auto', flexShrink:0, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'8px 12px 4px', fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid #f1f5f9' }}>
            Eigenschaften
          </div>
          <PropertiesPanel node={selectedNode} nodeFlows={nodeFlows} verteilerResults={verteilerResults} gruppeResults={gruppeResults} onUpdate={updateNode} onDelete={deleteNode} onSetAbgaenge={setAbgaenge} navigate={navigate}/>
        </div>
      </div>

      {auslegungNode && (
        <AuslegungModal
          node={auslegungNode}
          v={nodeFlows[auslegungNode.id]}
          gr={gruppeResults[auslegungNode.id]}
          vr={verteilerResults[auslegungNode.id]}
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
