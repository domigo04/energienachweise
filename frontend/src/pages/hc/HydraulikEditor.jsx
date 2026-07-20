import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Panel, ConnectionMode, useReactFlow, ReactFlowProvider,
  NodeToolbar, Position, useUpdateNodeInternals,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_TYPES, NUMMERIERT, ROTATABLE } from '../../components/hc/nodes/HydraulikNodes';
import { EDGE_TYPES } from '../../components/hc/edges/FlowEdge';
import { SCHALTUNGEN } from '../../components/hc/nodes/schaltungen';
import { getProject, listSchemas, createSchema, saveSchema, hydraulikBerechnen } from '../../api/hcApi';
import { api } from '../../api';

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

// Palette nach Bauteil-Klassen sortiert (Dominic-Feedback 2026-07-06)
const PALETTE_GRUPPEN = [
  { titel: 'Erzeugung & Speicher', items: [
    { type: 'erzeuger',   label: 'Wärmeerzeuger (WE)',  desc: '→ M10 RAVEL' },
    { type: 'speicher',   label: 'Speicher',            desc: 'technischer Speicher (rot)' },
    { type: 'bww',        label: 'BWW-Speicher',        desc: 'Brauchwarmwasser (grün) — SIA 385 folgt' },
    { type: 'pwt',        label: 'Plattentauscher (PWT)', desc: 'Wärmetauscher, 2 Kreise' },
  ]},
  { titel: 'Verteilung', items: [
    { type: 'verteiler',  label: 'Verteiler',           desc: 'VL/RL-Balken, wählbare Abgänge' },
    { type: 'gruppe',     label: 'Verbrauchergruppe',   desc: 'CAD-Strang: Pumpe, Einspritz, Q/VL/RL' },
    { type: 'heizkreis',  label: 'Heizkreis',           desc: 'VL / RL / Q → V\' auto' },
  ]},
  { titel: 'Förderung & Armaturen', items: [
    { type: 'pump',       label: 'Pumpe',               desc: 'V\' aus Topologie' },
    { type: 'valve2',     label: '2-Weg-Regelventil',   desc: 'KVS + Autorität auto' },
    { type: 'valve3',     label: '3-Weg-Mischventil',   desc: '' },
    { type: 'shutoff',    label: 'Kugelhahn / Absperr', desc: 'Handventil' },
    { type: 'stad',       label: 'STAD',                desc: 'Strangregulierventil' },
    { type: 'checkvalve', label: 'Rückschlagventil',    desc: '' },
  ]},
  { titel: 'Sicherheit & Mess', items: [
    { type: 'expansion',  label: 'Expansionsgefäss',    desc: 'VN nach Dominics Excel-Methode' },
    { type: 'sicherheitsventil', label: 'Sicherheitsventil', desc: 'SV mit Feder' },
    { type: 'waermezaehler', label: 'Wärmezähler',      desc: 'übernimmt Leitungs-Durchfluss' },
    { type: 'temperatur', label: 'Temperaturfühler',    desc: 'nur Symbol' },
  ]},
  { titel: 'Verbindungen', items: [
    { type: 'junction',   label: 'T-Stück',             desc: 'Abzweigung / Zusammenführung' },
    { type: 'anschluss',  label: 'Anschluss-Marker',    desc: 'Ersetzt lange Leitung — Buchstabe koppeln' },
  ]},
];
const STD_PALETTE = PALETTE_GRUPPEN.flatMap(g => g.items);

const newId = () => `n_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

// Nächste freie Bauteil-Nummer (Nummerierung bleibt stabil, weil sie in
// node.data.nr gespeichert wird — das Schema ist die Datenbank).
const naechsteNr = (ns) => ns.reduce((m, x) => Math.max(m, parseInt(x.data?.nr) || 0), 0) + 1;

// Nächster freier Buchstabe für Anschluss-Marker (A, B, C … PHYSIK §9)
const naechsterBuchstabe = (ns) => {
  const belegt = new Set(ns.filter(n => n.type === 'anschluss').map(n => n.data?.buchstabe));
  for (let i = 0; i < 26; i++) {
    const b = String.fromCharCode(65 + i);
    if (!belegt.has(b)) return b;
  }
  return 'A';
};

// Schaltungsarten der Verbrauchergruppe (PHYSIK.md §6)
const SCHALTUNGSARTEN = [
  { wert: 'einspritz', name: 'Einspritzschaltung', hinweis: '2-Weg-Ventil · Bypass über dem Ventil · druckbehaftet (Hauptpumpe nötig)' },
  { wert: 'beimisch',  name: 'Beimischschaltung',  hinweis: '3-Weg-Ventil · Bypass am Ventil · drucklos (keine Hauptpumpe)' },
  { wert: 'drossel',   name: 'Drosselschaltung',   hinweis: 'Nur Ventil, keine Gruppenpumpe · kann nicht mischen' },
];
const schaltungVon = (d) => (['einspritz', 'beimisch', 'drossel'].includes(d?.schaltung) ? d.schaltung : 'einspritz');

// ── Leitungs-Panel (Klick auf eine Leitung, PHYSIK §10) ───────
// Zeigt die automatisch gewählte Dimension (DN + Pa/m aus Dominics Tabelle)
// und lässt die Länge eintragen → Δp = Pa/m · Länge / 1000.
function LeitungPanel({ edge, leitungResults, onUpdateEdge, onDelete }) {
  const lg = leitungResults[edge.id];
  const ro = (label, value, unit='', ok=false) => (
    <div style={{ marginBottom: 6 }}>
      <label style={lbl}>{label}</label>
      <div style={{ ...inp, background: ok?'#f0fdf4':'#f8fafc', color: ok?'#15803d':'#374151', fontWeight: ok?700:400, fontFamily:'monospace', fontSize:12 }}>
        {value!=null ? `${value}${unit?' '+unit:''}` : '—'}
      </div>
    </div>
  );
  return (
    <div style={panelSt}>
      <PT>Leitung</PT>
      {lg ? (
        <>
          {ro('Dimension (automatisch)', lg.dn, '', true)}
          {ro('Reibungsdruckverlust', lg.pam.toFixed(1), 'Pa/m', true)}
          <div style={{ marginBottom: 7 }}>
            <label style={lbl}>Länge [m]</label>
            <input type="number" style={inp} value={edge.data?.laenge_m ?? ''}
              onChange={e => onUpdateEdge(edge.id, 'laenge_m', e.target.value)} placeholder="z.B. 12" />
          </div>
          {lg.dp_kpa != null
            ? ro('Δp dieser Leitung', lg.dp_kpa.toFixed(2), 'kPa', true)
            : <div style={{ fontSize: 9, color: '#94a3b8' }}>Länge eingeben für Δp dieser Leitung.</div>}
          {lg.warnung && <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c', marginTop:6 }}>⚠ {lg.warnung}</div>}
        </>
      ) : (
        <div style={warnSt}>Kein Durchfluss auf dieser Leitung — Dimensionierung erscheint, sobald sie Wasser führt.</div>
      )}
      <Div /><DelBtn onClick={() => onDelete(edge.id)} />
    </div>
  );
}

// ── Hydraulik-Berechnung: passiert im BACKEND (Goldene Regel) ──
// Der Editor schickt den Graphen (debounced) an POST /api/v1/hydraulik/berechnen
// und zeigt nur noch die Resultate an. Regeln: PHYSIK.md §1–§4,
// Rechen-Kern: backend/app/calculations/hydraulik.py (pytest-getestet).

// (Persönliche Schema-Vorlagen folgen in Phase 2 — jetzt lebt das Schema im Backend.)

// ── Properties Panel ─────────────────────────────────────────
// Rohrinhalt [l/m] je Dimension (1:1 aus Dominics Excel) — Expansionsgefäss.
const ROHR_DIMS = [
  ['12/16', 0.113], ['13/17', 0.133], ['14/18', 0.154], ['16/20', 0.201],
  ['DN10', 0.123], ['DN15', 0.201], ['DN20', 0.366], ['DN25', 0.581],
  ['DN32', 1.122], ['DN40', 1.499], ['DN50', 2.332], ['DN65', 3.880],
  ['DN80', 5.343], ['DN100', 9.004], ['DN125', 13.6], ['DN150', 19.9], ['DN200', 33.8],
];
const ZUSATZ_NAMEN = ['Heizkessel', 'Vorschaltgefäss', 'WW-Erwärmer', 'Heizkörper', 'Plattentauscher', 'Lufterhitzer', 'Sonden', 'Verteiler EWS'];

function PropertiesPanel({ node, nodeFlows, verteilerResults, gruppeResults, ventilResults, pumpenResults, expansionResults, anschlussWarnungen, anschlussResults, pwtResults, onUpdate, onDelete, onSetAbgaenge, navigate }) {
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
        <label style={lbl}>Schaltung</label>
        <select style={{...inp,cursor:'pointer'}} value={schaltungVon(d)} onChange={e=>set('schaltung',e.target.value)}>
          {SCHALTUNGSARTEN.map(s=><option key={s.wert} value={s.wert}>{s.name}</option>)}
        </select>
        <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>
          {SCHALTUNGSARTEN.find(s=>s.wert===schaltungVon(d))?.hinweis}
        </div>
        <label style={{ display:'flex', gap:5, alignItems:'center', cursor:'pointer', fontSize:11, color:'#374151', marginTop:8 }}>
          <input type="checkbox" checked={!!d.hat_wz} onChange={e=>set('hat_wz',e.target.checked)}/>
          Wärmezähler (mit VL-/RL-Fühler)
        </label>
        <label style={{ display:'flex', gap:5, alignItems:'center', cursor:'pointer', fontSize:11, color:'#374151', marginTop:6 }}>
          <input type="checkbox" checked={!!d.hat_anschluss}
            onChange={e=>{ set('hat_anschluss',e.target.checked); if (e.target.checked && !d.anschluss_buchstabe) set('anschluss_buchstabe','A'); }}/>
          Anschluss für separate Gruppe
        </label>
        {d.hat_anschluss && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, marginLeft:22 }}>
            <span style={{ fontSize:10, color:'#64748b' }}>Buchstabe</span>
            <input style={{ ...inp, width:46, textAlign:'center', textTransform:'uppercase' }} maxLength={1}
              value={d.anschluss_buchstabe ?? 'A'} onChange={e=>set('anschluss_buchstabe', e.target.value.toUpperCase().slice(0,1))}/>
            <span style={{ fontSize:9, color:'#94a3b8' }}>koppelt mit gleichem Buchstaben</span>
          </div>
        )}
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

  // ── 2WV / 3WM — kvs + Ventilautorität kommen vom Backend ──
  if (node.type === 'valve2' || node.type === 'valve3') {
    const ver = ventilResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>{node.type === 'valve2' ? '2-Wege Regelventil' : '3-Wege Mischventil'}</PT>
        {fld('Bezeichnung','label','','','text')}
        {v ? ro("V' (aus Leitung)",v,'m³/h',true) : <div style={warnSt}>In eine Leitung mit Durchfluss setzen</div>}
        {fld('Δpvar (variable Anlage)','dp_var','z.B. 26','kPa')}
        {ver ? <>
          {ro('KVS theoretisch', ver.kvs_theor, 'm³/h·bar½')}
          <label style={lbl}>KVS gewählt (Norm-Reihe)</label>
          <select style={{...inp,cursor:'pointer'}} value={d.kvs_eff||ver.kvs_vorschlag||''} onChange={e=>set('kvs_eff',e.target.value)}>
            {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===ver.kvs_vorschlag?' ← Vorschlag':''}</option>)}
          </select>
          <PvBox pv={ver.pv} v={ver.v} kvs_eff={ver.kvs_eff}/>
        </> : <div style={{ fontSize:9, color:'#94a3b8', marginTop:4 }}>Δpvar eingeben — das Backend rechnet kvs + Autorität.</div>}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── PUMPE (Hauptpumpe) — Förderhöhe = gemeinsamer Teil + ungünstigster Ast ──
  if (node.type === 'pump') {
    const pr = pumpenResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>Pumpe</PT>
        {fld('Bezeichnung','label','','','text')}
        {v ? ro("V' (aus Leitung)",v,'m³/h',true) : <div style={warnSt}>In eine Leitung mit Durchfluss setzen</div>}
        <div style={{fontSize:10,fontWeight:700,color:'#475569',marginTop:8,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Δp gemeinsamer Teil</div>
        {fld('Rohrlänge VL+RL','rohr_m','z.B. 60','m')}
        {fld('Dimensioniert auf','pam','70','Pa/m')}
        {fld('Apparate gesamt','apparate_kpa','z.B. 10','kPa')}
        {pr?.foerderhoehe_kpa != null && (
          <div style={{background:'#f0f9ff',border:'1px solid #7dd3fc',borderRadius:6,padding:'8px 10px',marginTop:4}}>
            <div style={{fontSize:10,color:'#0369a1'}}>
              Gemeinsamer Teil {pr.dp_gemeinsam_kpa ?? 0} kPa{pr.dp_ast_kpa ? ` + ungünstigster Ast ${pr.dp_ast_kpa} kPa` : ' (kein Verteiler gefunden)'}
            </div>
            <div style={{fontSize:16,fontWeight:700,color:'#1d4ed8',marginTop:4}}>Förderhöhe: {pr.foerderhoehe_kpa.toFixed(1)} kPa = {pr.mws.toFixed(2)} mWS</div>
          </div>
        )}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── WÄRMEZÄHLER — übernimmt den Durchfluss der Leitung ──
  if (node.type === 'waermezaehler') {
    return (
      <div style={panelSt}>
        <PT>Wärmezähler</PT>
        {fld('Bezeichnung','label','','','text')}
        {fld('Typ','typ','z.B. Ultraschall','','text')}
        {fld('Fabrikat','fabrikat','','','text')}
        {v ? ro('Durchfluss (aus Leitung)', v, 'm³/h', true)
           : <div style={warnSt}>In eine Leitung mit Durchfluss setzen — der Zähler übernimmt automatisch.</div>}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── EXPANSIONSGEFÄSS (PHYSIK §8, Dominics Excel-Methode) ──
  if (node.type === 'expansion') {
    const xr = expansionResults?.[node.id];
    const ews = d.medium === 'ews';
    return (
      <div style={panelSt}>
        <PT>Expansionsgefäss</PT>
        {fld('Bezeichnung','label','','','text')}
        {/* Zusammenfassung — Details + Rohrinhalt-Tabelle im Doppelklick-Modal */}
        <div style={{ fontSize:9, color:'#94a3b8', marginBottom:6 }}>
          Zusammenfassung — <b>Doppelklick</b> öffnet die Rohrinhalt-Tabelle und alle Eingaben.
        </div>
        {xr?.vsys_l!=null && (
          <div style={{ fontSize:10, color:'#0c4a6e', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'5px 7px', marginBottom:6 }}>
            Vsys <b>{xr.vsys_l} l</b>{d.anlageinhalt_l ? ' (bekannt)' : ' (Tabelle)'}
            {xr.t_mittel!=null ? ` · t_m ${xr.t_mittel} °C` : ''}{xr.leistung_kw!=null ? ` · ${xr.leistung_kw} kW` : ''}
          </div>
        )}
        {parseFloat(d.hoehe_m) > 12 && <div style={warnSt}>⚠ Über 12 m Höhe: Expansionsgefäss mit Kompressor nötig.</div>}
        {xr && !xr.fehler && (
          <>
            {ro('Nennvolumen VN,min', xr.vn_l.toFixed(1), 'l', true)}
            {ro('Vorschlag Norm-Grösse', `${xr.vorschlag_l}`, 'l', true)}
            <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>e {xr.e} · X {xr.x} · Vex,tot {xr.vex_tot_l} l · p0 {xr.p0_bar} / pfin {xr.pfin_bar} bar</div>
          </>
        )}
        {xr?.fehler && <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c' }}>⚠ {xr.fehler}</div>}
        {!xr && <div style={{ fontSize:9, color:'#94a3b8', marginTop:4 }}>Alle vier Werte eingeben — das Backend rechnet nach EN 12828 (PHYSIK §8).</div>}
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
        <button style={btnBlue} onClick={()=>navigate('/rechner/ravel')}>→ RAVEL Wirtschaftlichkeit</button>
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

  // ── PLATTENTAUSCHER (Systemtrennung, Gegenstrom) ──
  if (node.type === 'pwt') {
    const pr = pwtResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>Plattentauscher (PWT)</PT>
        {fld('Bezeichnung','label','','','text')}
        <div style={{ fontSize:9, color:'#94a3b8', marginBottom:4 }}>
          Links = Primär (von der Gruppe: oben VL EIN, unten RL AUS). Rechts = Sekundär im Gegenstrom: unten kalt EIN, oben warm AUS.
        </div>
        {pr?.quelle
          ? <div style={{ fontSize:10, color:'#0c4a6e', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'5px 7px', marginBottom:6 }}>
              <b>Primär von {pr.quelle}</b><br/>Q {pr.q_kw ?? '—'} kW · VL/RL {pr.vl_prim ?? '—'}/{pr.rl_prim ?? '—'} °C · V′ {pr.m_prim != null ? Number(pr.m_prim).toFixed(3) : '—'} m³/h
            </div>
          : <div style={warnSt}>Primärseite (links) mit einer Verbrauchergruppe verbinden — dann wird die Leistung übernommen.</div>}
        <label style={lbl}>Sekundär Vorlauf (warm, AUS oben) [°C]</label>
        <input type="number" style={inp} value={d.vl_sek??''} onChange={e=>set('vl_sek',e.target.value)} placeholder="z.B. 50"/>
        <label style={lbl}>Sekundär Rücklauf (kalt, EIN unten) [°C]</label>
        <input type="number" style={inp} value={d.rl_sek??''} onChange={e=>set('rl_sek',e.target.value)} placeholder="z.B. 40"/>
        {pr?.warnung && <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c', marginTop:6 }}>⚠ {pr.warnung}</div>}
        {pr?.m_sek != null && (<>
          {ro('Sekundär ΔT', pr.dt_sek, 'K', true)}
          {ro('Sekundär Massenstrom', Number(pr.m_sek).toFixed(3), 'm³/h', true)}
          <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>gleiche Leistung Q → Fluss = Q / (1.163 · ΔT_sek)</div>
        </>)}
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── ANSCHLUSS-MARKER (PHYSIK §9) ──
  if (node.type === 'anschluss') {
    const eigeneWarnung = (anschlussWarnungen || []).find(w => w.startsWith(`Anschluss ${d.buchstabe}:`));
    return (
      <div style={panelSt}>
        <PT>Anschluss-Marker</PT>
        {fld('Bezeichnung','label','','','text')}
        <label style={lbl}>Buchstabe</label>
        <input maxLength={1} style={{...inp, textTransform:'uppercase', fontWeight:700}} value={d.buchstabe||''}
          onChange={e=>set('buchstabe', e.target.value.slice(0,1).toUpperCase())}/>
        <div style={{ fontSize:9, color:'#94a3b8', marginTop:4 }}>
          Ein zweiter Marker mit demselben Buchstaben wird virtuell verbunden — Fluss und Temperatur werden durchgereicht.
        </div>
        {eigeneWarnung
          ? <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c', marginTop:6 }}>⚠ {eigeneWarnung}</div>
          : <div style={{ fontSize:10, color:'#16a34a', marginTop:6 }}>✓ Gegenstück gefunden</div>}
        {(() => { const ar = (anschlussResults || {})[node.id]; return ar ? (
          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'6px 8px', marginTop:6, fontSize:10, color:'#0c4a6e' }}>
            <b>Übernimmt von {ar.quelle}</b><br/>
            {ar.q_kw != null && <>Q {ar.q_kw} kW · </>}VL/RL {ar.vl ?? '—'}/{ar.rl ?? '—'} °C<br/>
            V' {ar.m != null ? Number(ar.m).toFixed(3) : '—'} m³/h — die Leitung ab hier trägt diesen Fluss.
          </div>
        ) : null; })()}
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
  waermezaehler: 'Wärmezähler', expansion: 'Expansionsgefäss',
  bww: 'Brauchwarmwasser-Speicher', shutoff: 'Kugelhahn / Absperrventil',
  stad: 'STAD-Strangregulierventil', temperatur: 'Temperaturfühler',
  sicherheitsventil: 'Sicherheitsventil', pwt: 'Plattentauscher (PWT)',
  checkvalve: 'Rückschlagventil', anschluss: 'Anschluss-Marker',
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

function AuslegungModal({ node, v, gr, vr, ver, pr, xr, onUpdate, onClose, navigate }) {
  const d = node.data;
  const set = (k, val) => onUpdate(node.id, k, val);
  const [tab, setTab] = useState('gruppe');
  let body;

  if (node.type === 'gruppe') {
    // Sauber getrennte Auslegung: Tabs Gruppe / Pumpe / Ventil (Dominic-Feedback).
    // Die Schaltung bestimmt die Ausrüstung: Drossel hat keine Gruppenpumpe.
    const schaltung = schaltungVon(d);
    const tabs = [['gruppe','Gruppe'], ...(schaltung !== 'drossel' ? [['pumpe','Pumpe']] : []), ['ventil','Ventil']];
    const aktTab = tabs.some(([k]) => k === tab) ? tab : 'gruppe';
    const ventilTitel = schaltung === 'beimisch' ? 'Beimischventil (3-Weg)' : schaltung === 'drossel' ? 'Drosselventil (2-Weg)' : 'Einspritzventil (2-Weg)';
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ display:'flex', gap:2, borderBottom:'2px solid #f1f5f9' }}>
          {tabs.map(([k,t]) => (
            <button key={k} onClick={()=>setTab(k)}
              style={{ padding:'7px 18px', fontSize:12, fontWeight:600, cursor:'pointer', background:'none', border:'none',
                borderBottom: aktTab===k?'2.5px solid #dc2626':'2.5px solid transparent',
                color: aktTab===k?'#dc2626':'#64748b', marginBottom:-2 }}>
              {t}
            </button>
          ))}
        </div>

        {aktTab === 'gruppe' && (
          <>
            <div><label style={lbl}>Schaltung</label>
              <select style={{...inp,cursor:'pointer'}} value={schaltung} onChange={e=>set('schaltung',e.target.value)}>
                {SCHALTUNGSARTEN.map(s=><option key={s.wert} value={s.wert}>{s.name}</option>)}
              </select>
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:3 }}>{SCHALTUNGSARTEN.find(s=>s.wert===schaltung)?.hinweis}</div></div>
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
                  <b>Mischung aktiv</b> (PHYSIK §4): Der Bypass trägt {Number(gr.m_bypass).toFixed(3)} m³/h.
                  Die Gruppe mischt die Verteiler-VL auf {d.vl_temp} °C herunter.
                </div>
              : <div style={{ fontSize:11, color:'#94a3b8' }}>Keine Mischung — die Gruppe läuft direkt mit der Verteiler-Vorlauftemperatur (primär = sekundär).</div>}
            <label style={{ display:'flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:12, color:'#374151' }}>
              <input type="checkbox" checked={!!d.hat_wz} onChange={e=>set('hat_wz',e.target.checked)}/>
              Wärmezähler im Strang (SIA-410-Symbol, mit Fühler im VL und RL)
            </label>
          </>
        )}

        {aktTab === 'pumpe' && (
          <>
            <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{d.label ? `${d.label} — ` : ''}Pumpe (Sekundärkreis, V' = {gr?.m_sek!=null?Number(gr.m_sek).toFixed(3):'—'} m³/h)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <div><label style={lbl}>Rohr VL+RL [m]</label><input type="number" style={inp} value={d.pumpe_rohr_m??''} onChange={e=>set('pumpe_rohr_m',e.target.value)} placeholder="40"/></div>
              <div><label style={lbl}>Auf [Pa/m]</label><input type="number" style={inp} value={d.pumpe_pam??''} onChange={e=>set('pumpe_pam',e.target.value)} placeholder="70"/></div>
              <div><label style={lbl}>Apparate [kPa]</label><input type="number" style={inp} value={d.pumpe_apparate_kpa??''} onChange={e=>set('pumpe_apparate_kpa',e.target.value)} placeholder="15"/></div>
            </div>
            <BigVal label="Förderhöhe" value={gr?.pumpe?.dp_kpa!=null?gr.pumpe.dp_kpa.toFixed(1):null} unit="kPa"
              sub={gr?.pumpe?.dp_kpa!=null?`= ${gr.pumpe.mws.toFixed(2)} mWS · bei V' ${Number(gr.pumpe.v??0).toFixed(3)} m³/h`:'Rohrlänge/Apparate eingeben'}/>
            <div style={{ fontSize:10, color:'#94a3b8' }}>Hinweis: Die Hauptpumpe nach dem Erzeuger zeichnest du selbst als eigenes Bauteil.</div>
          </>
        )}

        {aktTab === 'ventil' && (
          <>
            <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{d.label ? `${d.label} — ` : ''}{ventilTitel} · Primärseite, V' = {gr?.m_prim!=null?Number(gr.m_prim).toFixed(3):'—'} m³/h</div>
            <div><label style={lbl}>Δpvar — Druckabfall variabler Anlagenteil [kPa]</label>
              <input type="number" style={inp} value={d.ventil_dp_var??''} onChange={e=>set('ventil_dp_var',e.target.value)} placeholder="26"/></div>
            {gr?.ventil ? (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <BigVal label="kvs theoretisch" value={Number(gr.ventil.kvs_theor).toFixed(3)} color="#1e293b"/>
                  <BigVal label="kvs Vorschlag" value={gr.ventil.kvs_vorschlag} color="#1d4ed8" sub="nächstgrösser, Norm-Reihe"/>
                </div>
                <div><label style={lbl}>kvs gewählt</label>
                  <select style={{...inp,cursor:'pointer'}} value={d.ventil_kvs_eff||gr.ventil.kvs_vorschlag||''} onChange={e=>set('ventil_kvs_eff',e.target.value)}>
                    {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===gr.ventil.kvs_vorschlag?'  ← Vorschlag':''}</option>)}
                  </select></div>
                <PvBox pv={gr.ventil.pv} v={gr.ventil.v} kvs_eff={gr.ventil.kvs_eff}/>
              </>
            ) : (
              <div style={warnSt}>Δpvar eingeben — dann rechnet das Backend kvs + Ventilautorität automatisch aus dem Gruppen-Volumenstrom.</div>
            )}
          </>
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
  } else if (node.type === 'valve2' || node.type === 'valve3') {
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <BigVal label="Durchfluss V' (aus der Leitung)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"
          sub={v?'kommt automatisch aus dem Schema':'Bauteil in eine Leitung mit Durchfluss setzen'}/>
        <div><label style={lbl}>Δpvar — Druckabfall variabler Anlagenteil [kPa]</label>
          <input type="number" style={inp} value={d.dp_var??''} onChange={e=>set('dp_var',e.target.value)} placeholder="26"/></div>
        {ver ? <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <BigVal label="kvs theoretisch" value={Number(ver.kvs_theor).toFixed(3)} color="#1e293b"/>
            <BigVal label="kvs Vorschlag" value={ver.kvs_vorschlag} color="#1d4ed8" sub="nächstgrösser, Norm-Reihe"/>
          </div>
          <div><label style={lbl}>kvs gewählt</label>
            <select style={{...inp,cursor:'pointer'}} value={d.kvs_eff||ver.kvs_vorschlag||''} onChange={e=>set('kvs_eff',e.target.value)}>
              {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===ver.kvs_vorschlag?'  ← Vorschlag':''}</option>)}
            </select></div>
          <PvBox pv={ver.pv} v={ver.v} kvs_eff={ver.kvs_eff}/>
        </> : <div style={warnSt}>Δpvar eingeben — dann rechnet das Backend die kvs-Auslegung.</div>}
      </div>
    );
  } else if (node.type === 'pump') {
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <BigVal label="Förder-Volumenstrom V' (aus der Leitung)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"/>
        <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>Δp gemeinsamer Teil (Rohr + Apparate)</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div><label style={lbl}>Rohr VL+RL [m]</label><input type="number" style={inp} value={d.rohr_m??''} onChange={e=>set('rohr_m',e.target.value)} placeholder="60"/></div>
          <div><label style={lbl}>Auf [Pa/m]</label><input type="number" style={inp} value={d.pam??''} onChange={e=>set('pam',e.target.value)} placeholder="70"/></div>
          <div><label style={lbl}>Apparate [kPa]</label><input type="number" style={inp} value={d.apparate_kpa??''} onChange={e=>set('apparate_kpa',e.target.value)} placeholder="10"/></div>
        </div>
        <BigVal label="Förderhöhe = gemeinsamer Teil + ungünstigster Ast" value={pr?.foerderhoehe_kpa!=null?pr.foerderhoehe_kpa.toFixed(1):null} unit="kPa"
          sub={pr?.foerderhoehe_kpa!=null
            ? `${pr.dp_gemeinsam_kpa ?? 0} kPa gemeinsam${pr.dp_ast_kpa ? ` + ${pr.dp_ast_kpa} kPa ungünstigster Ast (Verteiler)` : ' — kein Verteiler mit Δp gefunden'}  =  ${pr.mws.toFixed(2)} mWS`
            : 'Rohrlänge/Apparate eingeben; der ungünstigste Ast kommt automatisch vom Verteiler'}/>
      </div>
    );
  } else if (node.type === 'waermezaehler') {
    body = (
      <div style={{ display:'grid', gap:12 }}>
        <BigVal label="Durchfluss (aus der Leitung übernommen)" value={v?v.toFixed(4):null} unit="m³/h" color="#0f766e"
          sub="Der Wärmezähler übernimmt automatisch den Durchfluss der Leitung, in der er sitzt."/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div><label style={lbl}>Typ</label><input style={inp} value={d.typ??''} onChange={e=>set('typ',e.target.value)} placeholder="z.B. Ultraschall"/></div>
          <div><label style={lbl}>Fabrikat</label><input style={inp} value={d.fabrikat??''} onChange={e=>set('fabrikat',e.target.value)} placeholder=""/></div>
        </div>
      </div>
    );
  } else if (node.type === 'expansion') {
    const ews = d.medium === 'ews';
    body = (
      <div style={{ display:'grid', gap:12 }}>
        {/* Rohrinhalt-Tabelle (l/m aus Dominics Excel) → Vsys automatisch */}
        <div>
          <label style={lbl}>Rohrinhalt — Meter pro Dimension (l/m aus deinem Excel)</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 16px', maxHeight:220, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 8px' }}>
            {ROHR_DIMS.map(([dim,lm])=>{
              const m=(d.rohre||{})[dim];
              return (
                <div key={dim} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                  <span style={{ width:56, color:'#64748b' }}>{dim}</span>
                  <input type="number" value={m??''} placeholder="0"
                    onChange={e=>{ const r={...(d.rohre||{})}; if(e.target.value) r[dim]=e.target.value; else delete r[dim]; set('rohre',r); }}
                    style={{ width:64, padding:'3px 5px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:11 }}/>
                  <span style={{ color:'#94a3b8', fontSize:10 }}>m{m?` → ${(parseFloat(m)*lm).toFixed(1)} l`:''}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <label style={lbl}>Zusatz-Bauteile [l]</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'3px 10px' }}>
            {ZUSATZ_NAMEN.map(name=>{
              const cur=(d.zusatz||[]).find(z=>z.name===name);
              return (
                <div key={name} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10 }}>
                  <span style={{ flex:1, color:'#64748b' }}>{name}</span>
                  <input type="number" value={cur?.liter??''} placeholder="0"
                    onChange={e=>{ const rest=(d.zusatz||[]).filter(z=>z.name!==name); const v=e.target.value; set('zusatz', v?[...rest,{name,liter:v}]:rest); }}
                    style={{ width:52, padding:'2px 4px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:10 }}/>
                </div>
              );
            })}
          </div>
        </div>
        {xr?.vsys_l!=null && <div style={{ fontSize:12, color:'#0c4a6e', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'6px 8px' }}>Vsys = <b>{xr.vsys_l} l</b>{d.anlageinhalt_l?' (bekannt, überschreibt Tabelle)':' (aus Rohrinhalt-Tabelle)'}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div><label style={lbl}>Vsys bekannt? (überschreibt Tabelle) [l]</label><input type="number" style={inp} value={d.anlageinhalt_l??''} onChange={e=>set('anlageinhalt_l',e.target.value)} placeholder="optional"/></div>
          <div><label style={lbl}>Speicherinhalt Vsto [l]</label><input type="number" style={inp} value={d.speicher_l??''} onChange={e=>set('speicher_l',e.target.value)} placeholder="optional"/></div>
          <div><label style={lbl}>Medium</label>
            <select style={{...inp,cursor:'pointer'}} value={d.medium||'heizungswasser'} onChange={e=>set('medium',e.target.value)}>
              <option value="heizungswasser">Heizungswasser</option>
              <option value="frostschutz30">Frostschutz 30 %</option>
              <option value="frostschutz40">Frostschutz 40 %</option>
              <option value="ews">Erdsonden (EWS)</option>
            </select></div>
          {!ews && <div><label style={lbl}>Mitteltemperatur [°C] {(xr?.t_mittel!=null&&!d.t_mittel)?`— auto ${xr.t_mittel}`:''}</label><input type="number" style={inp} value={d.t_mittel??''} onChange={e=>set('t_mittel',e.target.value)} placeholder={xr?.t_mittel!=null?`auto ${xr.t_mittel}`:'höchste VL'}/></div>}
          {!ews && <div><label style={lbl}>Erzeugerleistung [kW] {(xr?.leistung_kw!=null&&!d.leistung_kw)?`— auto ${xr.leistung_kw}`:''}</label><input type="number" style={inp} value={d.leistung_kw??''} onChange={e=>set('leistung_kw',e.target.value)} placeholder={xr?.leistung_kw!=null?`auto ${xr.leistung_kw}`:'aus Schema'}/></div>}
          <div><label style={lbl}>Statische Höhe [m]</label><input type="number" style={inp} value={d.hoehe_m??''} onChange={e=>set('hoehe_m',e.target.value)} placeholder="10"/></div>
          <div><label style={lbl}>SV-Ansprechdruck [bar]</label><input type="number" style={inp} value={d.psv_bar??''} onChange={e=>set('psv_bar',e.target.value)} placeholder="3.0"/></div>
        </div>
        {parseFloat(d.hoehe_m) > 12 && <div style={warnSt}>⚠ Über 12 m Höhe: Expansionsgefäss mit Kompressor nötig (noch nicht als eigene Auslegung hinterlegt).</div>}
        {xr && !xr.fehler ? (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <BigVal label="Nennvolumen VN,min" value={xr.vn_l.toFixed(1)} unit="l" color="#15803d"/>
              <BigVal label="Vorschlag Norm-Grösse" value={xr.vorschlag_l} unit="l" color="#1d4ed8" sub="nächstgrösser"/>
            </div>
            <div style={{ fontSize:11, color:'#64748b' }}>
              e = {xr.e} · X = {xr.x} → Vex,tot = {xr.vex_tot_l} l · Vordruck p0 = {xr.p0_bar} bar · Enddruck pfin = {xr.pfin_bar} bar (Dominics Excel-Methode, PHYSIK §8)
            </div>
          </>
        ) : xr?.fehler ? (
          <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c' }}>⚠ {xr.fehler}</div>
        ) : (
          <div style={warnSt}>Anlageinhalt, Mitteltemperatur, Leistung, Höhe und SV-Druck eingeben — das Backend rechnet VN und schlägt die Norm-Grösse vor.</div>
        )}
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
        <button style={btnBlue} onClick={()=>navigate('/rechner/ravel')}>→ RAVEL Wirtschaftlichkeit</button>
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
const modalCard = { background:'white', borderRadius:12, width:'min(680px, 94vw)', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.35)' };
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
  const updateNodeInternals = useUpdateNodeInternals();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected]     = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [edgeColor, setEdgeColor]   = useState('#ef4444');
  const [schemaName, setSchemaName] = useState('Schema');
  const [projectName, setProjectName] = useState('');
  const [schemaId, setSchemaId]     = useState(null);
  const [loaded, setLoaded]         = useState(false);
  const [saveState, setSaveState]   = useState('idle'); // idle | saving | saved | error
  const [auslegung, setAuslegung]   = useState(null);   // Bauteil für Doppelklick-Auslegung
  const [showLegende, setShowLegende] = useState(false);
  const [showWarnungen, setShowWarnungen] = useState(false);
  const [schaltungswahl, setSchaltungswahl] = useState(null); // {nodeId, x, y} — Menü nach Gruppe-Drop

  const [hydraulik, setHydraulik] = useState({ edge_flows: {}, node_flows: {}, verteiler_results: {}, gruppe_results: {}, ventil_results: {}, pumpen_results: {}, expansion_results: {}, leitung_results: {}, anschluss_warnings: [], warnungen: [] });

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
            data: e.data ? { laenge_m: e.data.laenge_m } : null,
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
  const ventilResults = hydraulik.ventil_results || {};
  const pumpenResults = hydraulik.pumpen_results || {};
  const expansionResults = hydraulik.expansion_results || {};
  const leitungResults = hydraulik.leitung_results || {};
  const anschlussWarnungen = hydraulik.anschluss_warnings || [];
  const anschlussResults = hydraulik.anschluss_results || {};
  const pwtResults = hydraulik.pwt_results || {};
  const alleWarnungen = hydraulik.warnungen || [];

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

  // 90°-Drehung des gewählten Bauteils (nur Armaturen; Anschlüsse drehen mit).
  const rotateNode = useCallback((id) => {
    snap();
    setNodes(ns => ns.map(x => (x.id === id && ROTATABLE.has(x.type))
      ? { ...x, data: { ...x.data, rotation: (((x.data?.rotation || 0) + 90) % 360) } }
      : x));
    setTimeout(() => updateNodeInternals(id), 0);
  }, [setNodes, snap, updateNodeInternals]);

  const connectStart = useRef(null);
  const clipboard = useRef(null);
  const nodesRef = useRef([]);
  nodesRef.current = nodes;

  // Keyboard-Shortcuts: V = VL, R = RL, D = Drehen, Cmd+Z = Undo, Cmd+C/V = Kopieren/Einfügen
  React.useEffect(() => {
    const handler = (ev) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z') {
        ev.preventDefault(); undo();
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'c' || ev.key === 'C')) {
        if (selected) { const n = nodesRef.current.find(x => x.id === selected.id); if (n) clipboard.current = n; }
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'v' || ev.key === 'V') && clipboard.current) {
        ev.preventDefault();
        const src = clipboard.current;
        snap();
        setNodes(ns => [...ns, { ...src, id: newId(), selected: false,
          position: { x: (src.position?.x || 0) + 24, y: (src.position?.y || 0) + 24 },
          data: { ...src.data, ...(NUMMERIERT.includes(src.type) ? { nr: naechsteNr(ns) } : {}) } }]);
      }
      if (!ev.metaKey && !ev.ctrlKey) {
        if (ev.key === 'v' || ev.key === 'V') setEdgeColor('#ef4444');
        if (ev.key === 'r' || ev.key === 'R') setEdgeColor('#3b82f6');
        if (ev.key === 'b' || ev.key === 'B') setEdgeColor('#1e293b');
        if (ev.key === 'd' || ev.key === 'D') { if (selected && ROTATABLE.has(selected.type)) rotateNode(selected.id); }
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          if (selected) { snap(); deleteNode(selected.id); }
          else if (selectedEdgeId) { deleteEdge(selectedEdgeId); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, selected, selectedEdgeId, snap, rotateNode]);

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
    if (n.type === 'waermezaehler') {
      return { ...n, data: { ...n.data, _calc: { v: nodeFlows[n.id] } } };
    }
    if (n.type === 'expansion') {
      const c = expansionResults[n.id];
      return c ? { ...n, data: { ...n.data, _calc: c } } : n;
    }
    return n;
  }), [nodes, verteilerResults, gruppeResults, nodeFlows, expansionResults]);

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
          const sn = { einspritz: 'Einspritz', beimisch: 'Beimisch', drossel: 'Drossel' }[schaltungVon(d)];
          const bez = d.label || 'Gruppe';
          werte = `${sn} · ${d.q_kw ?? '—'} kW · ${d.vl_temp ?? '—'}/${d.rl_temp ?? '—'} °C · sek ${fx(c.m_sek)} / prim ${fx(c.m_prim)} m³/h${d.dp_kpa ? ` · Δp ${d.dp_kpa} kPa` : ''}${d.hat_wz ? ' · WZ' : ''}${c.pumpe?.dp_kpa != null ? ` · ${bez} Pumpe ${c.pumpe.dp_kpa.toFixed(1)} kPa` : ''}${c.ventil ? ` · ${bez} Ventil kvs ${c.ventil.kvs_eff} (Pv ${c.ventil.pv.toFixed(1)}%)` : ''}`;
        } else if (n.type === 'heizkreis') {
          werte = `${d.q_kw ?? '—'} kW · ${d.vl_temp ?? '—'}/${d.rl_temp ?? '—'} °C · V' ${fx(nodeFlows[n.id])} m³/h`;
        } else if (n.type === 'verteiler') {
          const c = verteilerResults[n.id] || {};
          werte = `VL ${fx(c.vl_vt, 1)} / RL ${fx(c.rl_misch, 1)} °C · Σ ${fx(c.q_total, 2)} kW · ${fx(c.m_prim_total)} m³/h${c.dp_max_ast != null ? ` · Δp Ast ${c.dp_max_ast_nr}: ${c.dp_max_ast} kPa` : ''}`;
        } else if (n.type === 'pump') {
          const p = pumpenResults[n.id] || {};
          werte = `V' ${fx(p.v ?? nodeFlows[n.id])} m³/h${p.foerderhoehe_kpa != null ? ` · Förderhöhe ${p.foerderhoehe_kpa.toFixed(1)} kPa${p.dp_ast_kpa ? ` (gemeinsam ${p.dp_gemeinsam_kpa ?? 0} + Ast ${p.dp_ast_kpa})` : ''}` : ''}`;
        } else if (n.type === 'valve2' || n.type === 'valve3') {
          const ve = ventilResults[n.id];
          werte = `V' ${fx(nodeFlows[n.id])} m³/h${ve ? ` · kvs ${ve.kvs_eff} · Pv ${ve.pv.toFixed(1)} %` : ''}`;
        } else if (n.type === 'waermezaehler') {
          werte = [d.typ, `V' ${fx(nodeFlows[n.id])} m³/h (aus Leitung)`].filter(Boolean).join(' · ');
        } else if (n.type === 'expansion') {
          const ex = expansionResults[n.id];
          werte = ex && !ex.fehler ? `VN ${ex.vn_l} l → ${ex.vorschlag_l} l · p0 ${ex.p0_bar} / pe ${ex.pe_bar} bar` : ex?.fehler ? `⚠ ${ex.fehler}` : '—';
        } else if (n.type === 'erzeuger') {
          werte = [d.typ, d.leistung_kw ? `${d.leistung_kw} kW` : null].filter(Boolean).join(' · ') || '—';
        }
        return { nr: d.nr, bauteil: TITLES[n.type] || n.type, bez: d.label || '', werte };
      });
  }, [nodes, gruppeResults, verteilerResults, nodeFlows, ventilResults, pumpenResults, expansionResults]);

  // Edges: VL durchgezogen, RL gestrichelt, V' als Label
  const displayEdges = useMemo(() => edges.map(edge => {
    const color = edge.style?.stroke || '#1e293b';
    const v = edgeFlows[edge.id];
    const lg = leitungResults[edge.id];
    // Neues Label-Format (Dominic 2026-07-06): DN gross oben, Massenstrom m' in kg/h
    // darunter. Pa/m steht weiterhin im Klick-Panel (LeitungPanel), nicht mehr am Strich.
    const dn = lg ? String(lg.dn).split(' ')[0] : null;
    const kgh = v != null ? Math.round(v * 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'") : null;
    const label = v ? (
      <div style={{ textAlign: 'center', lineHeight: 1.05 }}>
        {dn && <div style={{ fontSize: 12, fontWeight: 800 }}>{dn}</div>}
        <div style={{ fontSize: 8.5, fontWeight: 600 }}>{`m' ${kgh} kg/h`}</div>
      </div>
    ) : undefined;
    return {
      ...edge, type: 'flow', animated: false,
      label,
      labelStyle:   { fontSize:9, fill:'#1e293b', fontFamily:'monospace', fontWeight:600 },
      labelBgStyle: { fill:'rgba(255,255,255,0.9)', borderRadius:3 },
      labelBgPadding: [3,5],
      style: { ...edge.style },
    };
  }), [edges, edgeFlows, leitungResults]);

  const loadSchema = (key) => {
    const s = SCHALTUNGEN[key];
    setNodes(s.nodes.map(n=>({...n})));
    setEdges(s.edges.map(e=>({...e})));
    setSelected(null);
  };

  // PDF-Endpunkt verlangt seit dem Sicherheits-Review 2026-07-19 ein
  // Bearer-Token — window.open() sendet keine Header mit, darum authentifiziert
  // als Blob laden (Token kommt automatisch vom Axios-Interceptor in api.js)
  // und danach wie gewohnt in einem neuen Tab öffnen.
  const downloadPdf = async (inhalt) => {
    if (!schemaId) return;
    try {
      const res = await api.get(`/api/v1/schemas/${schemaId}/pdf`, {
        params: { inhalt },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      alert('PDF konnte nicht geladen werden.');
    }
  };

  const onConnect = useCallback((params) => {
    snap();
    setEdges(eds => addEdge({ ...params, type:'flow', style:{ stroke:edgeColor, strokeWidth:2.5 } }, eds));
  }, [edgeColor, setEdges, snap]);

  const onConnectStart = useCallback((_, params) => { connectStart.current = params; }, []);

  // Freie Leitung: endet die Verbindung im Leeren (nicht auf einem Anschluss),
  // wird dort ein Fangpunkt gesetzt (rot am VL, blau am RL) — so lassen sich
  // Leitungen frei zeichnen, ohne dass beide Enden an einem Bauteil hängen müssen.
  const onConnectEnd = useCallback((event) => {
    const cs = connectStart.current; connectStart.current = null;
    if (!cs?.nodeId) return;
    if (event.target?.closest?.('.react-flow__handle')) return;  // auf einem Bauteil gelandet → onConnect
    const { clientX, clientY } = event.changedTouches ? event.changedTouches[0] : event;
    const p = screenToFlowPosition({ x: clientX, y: clientY });
    const jid = newId();
    snap();
    const farbe = edgeColor === '#ef4444' || edgeColor === '#3b82f6' ? edgeColor : '#334155';
    setNodes(ns => [...ns, { id: jid, type: 'junction', position: { x: p.x - 6, y: p.y - 6 }, data: { color: farbe } }]);
    const vonQuelle = cs.handleType !== 'target';
    setEdges(es => addEdge({
      source: vonQuelle ? cs.nodeId : jid, sourceHandle: vonQuelle ? cs.handleId : 'left',
      target: vonQuelle ? jid : cs.nodeId, targetHandle: vonQuelle ? 'left' : cs.handleId,
      type: 'flow', style: { stroke: edgeColor, strokeWidth: 2.5 },
    }, es));
  }, [screenToFlowPosition, setNodes, setEdges, snap, edgeColor]);

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback(e => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    snap();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const p = STD_PALETTE.find(p => p.type === raw);
    const id = newId();
    setNodes(ns => {
      const extra = raw === 'verteiler' ? { abgaenge: 4 }
        : raw === 'gruppe' ? { schaltung: 'einspritz' }
        : raw === 'anschluss' ? { buchstabe: naechsterBuchstabe(ns) }
        : {};
      return [...ns, {
        id, type: raw, position: pos,
        data: { label: p?.label || raw, ...extra, ...(NUMMERIERT.includes(raw) ? { nr: naechsteNr(ns) } : {}) },
      }];
    });
    // Verbrauchergruppe: direkt nach dem Ablegen die Schaltung wählen
    if (raw === 'gruppe') setSchaltungswahl({ nodeId: id, x: e.clientX, y: e.clientY });
  }, [screenToFlowPosition, setNodes, snap]);

  const onNodeClick       = useCallback((_, n) => { setSelected(n); setSelectedEdgeId(null); }, []);
  const onNodeDoubleClick = useCallback((_, n) => setAuslegung(n), []);
  const onEdgeClick       = useCallback((_, e) => { setSelectedEdgeId(e.id); setSelected(null); }, []);
  const onPaneClick  = useCallback(() => { setSelected(null); setSelectedEdgeId(null); }, []);
  const selectedNode  = selected  ? nodes.find(n => n.id === selected.id)  || null : null;
  const selectedEdge  = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) || null : null;
  const auslegungNode = auslegung ? nodes.find(n => n.id === auslegung.id) || null : null;

  const updateNode = (id, key, val) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));

  const updateEdgeData = (id, key, val) =>
    setEdges(es => es.map(e => e.id === id ? { ...e, data: { ...e.data, [key]: val } } : e));

  const deleteEdge = (id) => {
    snap();
    setEdges(es => es.filter(e => e.id !== id));
    setSelectedEdgeId(null);
  };

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
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', fontFamily:'system-ui,sans-serif' }}>
      {/* Topbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'white', borderBottom:'1px solid #e2e8f0', flexShrink:0, flexWrap:'wrap' }}>
        <Link to={`/projekte/${projectId}`} style={{ fontSize:12, color:'#2563eb', whiteSpace:'nowrap' }}>← {projectName || 'Projekt'}</Link>
        <Link to={`/projekte/${projectId}/schema-cad`}
          style={{ fontSize:11, fontWeight:700, padding:'4px 9px', borderRadius:6, border:'1px solid #f59e0b', background:'#fffbeb', color:'#92400e', whiteSpace:'nowrap' }}>
          Konva vergleichen
        </Link>
        <Link to={`/projekte/${projectId}/schema-reactflow`}
          style={{ fontSize:11, fontWeight:700, padding:'4px 9px', borderRadius:6, border:'1px solid #818cf8', background:'#eef2ff', color:'#4338ca', whiteSpace:'nowrap' }}>
          React Flow vergleichen
        </Link>
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
            onClick={()=>downloadPdf(k)}
            style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', cursor:'pointer', whiteSpace:'nowrap' }}>
            ⤓ {t}
          </button>
        ))}
        <button onClick={()=>{ setShowLegende(v=>!v); setShowWarnungen(false); }}
          style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:'1px solid #e2e8f0', background: showLegende?'#1e293b':'#f8fafc', color: showLegende?'white':'#374151', cursor:'pointer', whiteSpace:'nowrap' }}>
          Legende
        </button>
        <button onClick={()=>{ setShowWarnungen(v=>!v); setShowLegende(false); }}
          style={{ fontSize:11, padding:'3px 8px', borderRadius:4, border:`1px solid ${alleWarnungen.length?'#fca5a5':'#e2e8f0'}`, background: showWarnungen?'#b91c1c':(alleWarnungen.length?'#fef2f2':'#f8fafc'), color: showWarnungen?'white':(alleWarnungen.length?'#b91c1c':'#374151'), cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
          Warnungen
          {alleWarnungen.length>0 && (
            <span style={{ background: showWarnungen?'white':'#dc2626', color: showWarnungen?'#b91c1c':'white', borderRadius:9, minWidth:16, height:16, fontSize:9, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
              {alleWarnungen.length}
            </span>
          )}
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
        {/* Palette links — nach Bauteil-Klassen gruppiert */}
        <div style={{ width:168, background:'#f8fafc', borderRight:'1px solid #e2e8f0', overflowY:'auto', flexShrink:0 }}>
          <div style={{ padding:'8px 10px 2px', fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em' }}>
            SIA 410 Bauteile
          </div>
          {PALETTE_GRUPPEN.map(gr=>(
            <div key={gr.titel}>
              <div style={{ padding:'8px 10px 2px', fontSize:8, fontWeight:700, color:'#cbd5e1', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {gr.titel}
              </div>
              {gr.items.map(p=>(
                <div key={p.type} draggable
                  onDragStart={e=>{e.dataTransfer.setData('application/reactflow',p.type); e.dataTransfer.effectAllowed='move';}}
                  style={{ margin:'3px 8px', padding:'5px 8px', background:'white', border:'1px solid #e2e8f0', borderRadius:6, cursor:'grab', fontSize:11, color:'#374151', userSelect:'none' }}>
                  <div style={{ fontWeight:600 }}>{p.label}</div>
                  {p.desc&&<div style={{ fontSize:9, color:'#94a3b8', marginTop:1 }}>{p.desc}</div>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ padding:'6px 10px 10px', fontSize:9, color:'#cbd5e1', marginTop:4 }}>
            Auf Canvas ziehen.
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex:1, position:'relative' }}>
          <ReactFlow
            nodes={displayNodes} edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
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
            {selectedNode && ROTATABLE.has(selectedNode.type) && (
              <NodeToolbar nodeId={selectedNode.id} isVisible position={Position.Top} offset={10}>
                <button onClick={() => rotateNode(selectedNode.id)} title="Bauteil 90° drehen (Taste D)"
                  style={{ display:'flex', alignItems:'center', gap:4, background:'white', border:'1px solid #cbd5e1',
                    borderRadius:6, padding:'4px 9px', fontSize:11, fontWeight:600, color:'#334155', cursor:'pointer',
                    boxShadow:'0 2px 6px rgba(15,23,42,0.12)' }}>
                  ↻ 90°
                </button>
              </NodeToolbar>
            )}
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

          {/* Warnungen-Report (Dominic-Feedback): alle Warnungen an einem Ort —
              Verteiler-Mischregeln, Anschluss-Marker, Ventilautorität, Expansionsgefäss */}
          {showWarnungen && (
            <div style={{ position:'absolute', left:0, right:0, bottom:0, background:'white', borderTop:'2px solid #fca5a5', maxHeight:220, overflowY:'auto', zIndex:20, padding:'6px 14px 10px', boxShadow:'0 -6px 16px rgba(15,23,42,0.08)' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#b91c1c', textTransform:'uppercase', letterSpacing:'0.05em', padding:'4px 0' }}>
                Warnungen &amp; Fehler ({alleWarnungen.length})
              </div>
              {alleWarnungen.length === 0 ? (
                <div style={{ fontSize:11, color:'#16a34a', padding:'6px 0' }}>✓ Keine Warnungen — Schema physikalisch plausibel.</div>
              ) : (
                <ul style={{ margin:0, padding:0, listStyle:'none' }}>
                  {alleWarnungen.map((w, i) => (
                    <li key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'5px 0', borderTop: i>0 ? '1px solid #f1f5f9' : 'none', fontSize:11, color:'#7f1d1d' }}>
                      <span>⚠</span><span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Properties */}
        <div style={{ width:230, background:'#f8fafc', borderLeft:'1px solid #e2e8f0', overflowY:'auto', flexShrink:0, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'8px 12px 4px', fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid #f1f5f9' }}>
            Eigenschaften
          </div>
          {selectedEdge ? (
            <LeitungPanel edge={selectedEdge} leitungResults={leitungResults} onUpdateEdge={updateEdgeData} onDelete={deleteEdge} />
          ) : (
            <PropertiesPanel node={selectedNode} nodeFlows={nodeFlows} verteilerResults={verteilerResults} gruppeResults={gruppeResults} ventilResults={ventilResults} pumpenResults={pumpenResults} expansionResults={expansionResults} anschlussWarnungen={anschlussWarnungen} anschlussResults={anschlussResults} pwtResults={pwtResults} onUpdate={updateNode} onDelete={deleteNode} onSetAbgaenge={setAbgaenge} navigate={navigate}/>
          )}
        </div>
      </div>

      {auslegungNode && (
        <AuslegungModal
          key={auslegungNode.id}
          node={auslegungNode}
          v={nodeFlows[auslegungNode.id]}
          gr={gruppeResults[auslegungNode.id]}
          vr={verteilerResults[auslegungNode.id]}
          ver={ventilResults[auslegungNode.id]}
          pr={pumpenResults[auslegungNode.id]}
          xr={expansionResults[auslegungNode.id]}
          onUpdate={updateNode}
          onClose={() => setAuslegung(null)}
          navigate={navigate}
        />
      )}

      {/* Schaltungswahl direkt nach dem Ablegen einer Verbrauchergruppe */}
      {schaltungswahl && (
        <div onClick={() => setSchaltungswahl(null)} style={{ position:'fixed', inset:0, zIndex:3000 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ position:'fixed', left: Math.min(schaltungswahl.x, window.innerWidth-280), top: Math.min(schaltungswahl.y, window.innerHeight-180),
              background:'white', border:'1px solid #e2e8f0', borderRadius:10, boxShadow:'0 12px 32px rgba(15,23,42,0.25)', padding:6, width:270 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', padding:'4px 8px', textTransform:'uppercase', letterSpacing:'0.05em' }}>
              Welche Schaltung?
            </div>
            {SCHALTUNGSARTEN.map(s => (
              <button key={s.wert}
                onClick={() => { updateNode(schaltungswahl.nodeId, 'schaltung', s.wert); setSchaltungswahl(null); }}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'7px 8px', background:'none', border:'none', borderRadius:6, cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='#fef2f2'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <div style={{ fontSize:12, fontWeight:600, color:'#1e293b' }}>{s.name}</div>
                <div style={{ fontSize:9, color:'#94a3b8', marginTop:1 }}>{s.hinweis}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HydraulikEditor() {
  return <ReactFlowProvider><EditorInner/></ReactFlowProvider>;
}
