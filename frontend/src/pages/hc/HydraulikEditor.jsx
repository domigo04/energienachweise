import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, Download, Eye,
  Layers3, LayoutTemplate, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Settings2, Undo2,
} from 'lucide-react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  Panel, ConnectionMode, useReactFlow, ReactFlowProvider,
  NodeToolbar, Position, useStore, useUpdateNodeInternals, ViewportPortal,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './HydraulikEditor.css';
import { NODE_TYPES, NUMMERIERT, ROTATABLE } from '../../components/hc/nodes/HydraulikNodes';
import { EDGE_TYPES } from '../../components/hc/edges/FlowEdge';
import { pairedHandleId, parallelWaypoints, roundedPolylinePath } from '../../components/hc/edges/geometry';
import { SCHALTUNGEN } from '../../components/hc/nodes/schaltungen';
import { getSchemaEditor, createSchema, saveSchemaGraph, hydraulikBerechnen } from '../../api/hcApi';
import { api } from '../../api';

// ── Konstanten ────────────────────────────────────────────────
const KVS_REIHE = [0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10, 16, 25, 40, 63];
const LEITUNGS_LAYER = [
  { id:'heizung_vl', label:'Heizung VL', kurz:'H VL', color:'#ef4444', role:'vl', dashed:false },
  { id:'heizung_rl', label:'Heizung RL', kurz:'H RL', color:'#3b82f6', role:'rl', dashed:true },
  { id:'kaelte_vl', label:'Kälte VL', kurz:'K VL', color:'#06b6d4', role:'vl', dashed:false },
  { id:'kaelte_rl', label:'Kälte RL', kurz:'K RL', color:'#0e7490', role:'rl', dashed:true },
  { id:'sole_vl', label:'Sole VL', kurz:'S VL', color:'#8b5cf6', role:'vl', dashed:false },
  { id:'sole_rl', label:'Sole RL', kurz:'S RL', color:'#6d28d9', role:'rl', dashed:true },
  { id:'bww', label:'Brauchwarmwasser', kurz:'BWW', color:'#16a34a', role:null, dashed:false },
  { id:'neutral', label:'Allgemein', kurz:'Allg.', color:'#334155', role:null, dashed:false },
];
const DEFAULT_LAYER_VISIBILITY = Object.fromEntries(LEITUNGS_LAYER.map(layer => [layer.id, true]));
const CAD_GRID = 10;
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);
const DEFAULT_DRAWING_CONFIG = {
  corner_radius:8,
  grid_size:CAD_GRID,
  shortcut_polyline:'p',
  shortcut_line:'l',
  auto_return:true,
};

const rasterPunkt = (point, grid = CAD_GRID) => ({
  x:Math.round(point.x / grid) * grid,
  y:Math.round(point.y / grid) * grid,
});

const shortcutTaste = (value, fallback) => String(value || fallback).trim().slice(-1).toLowerCase();

function graphFuerSpeicherung(nodes, edges, layerConfig, drawingConfig) {
  const saubereNodes = nodes.map(node => {
    const { selected, dragging, measured, ...rest } = node;
    void selected; void dragging; void measured;
    const data = { ...(node.data || {}) };
    delete data._calc;
    return { ...rest, data };
  });
  const saubereEdges = edges.map(edge => {
    const { selected, ...rest } = edge;
    void selected;
    return rest;
  });
  return {
    nodes:saubereNodes,
    edges:saubereEdges,
    layer_config:layerConfig,
    drawing_config:drawingConfig,
  };
}

const normalisiereDrawingConfig = (config = {}) => ({
  corner_radius:Math.max(0, Math.min(40, Number(config.corner_radius ?? DEFAULT_DRAWING_CONFIG.corner_radius) || 0)),
  grid_size:[5, 10, 20].includes(Number(config.grid_size)) ? Number(config.grid_size) : DEFAULT_DRAWING_CONFIG.grid_size,
  shortcut_polyline:shortcutTaste(config.shortcut_polyline, DEFAULT_DRAWING_CONFIG.shortcut_polyline),
  shortcut_line:shortcutTaste(config.shortcut_line, DEFAULT_DRAWING_CONFIG.shortcut_line),
  auto_return:config.auto_return !== false,
});

const ruecklaufLayerVon = (layer) => {
  if (layer?.role !== 'vl' || !layer.id.endsWith('_vl')) return null;
  return LEITUNGS_LAYER.find(item => item.id === layer.id.replace(/_vl$/, '_rl')) || null;
};

const layerVonEdge = (edge) => {
  const gespeichert = LEITUNGS_LAYER.find(layer => layer.id === edge.data?.layer_id);
  if (gespeichert) return gespeichert;
  if (edge.style?.stroke === '#ef4444') return LEITUNGS_LAYER[0];
  if (edge.style?.stroke === '#3b82f6') return LEITUNGS_LAYER[1];
  return LEITUNGS_LAYER.find(layer => layer.id === 'neutral');
};

// Exakter Richtungsfang wie im CAD-Lab: horizontal, vertikal oder diagonal.
// Die Shift-Taste wird sowohl beim freien Leitungsende als auch beim Verschieben
// eines Stützpunkts ausgewertet.
function auf45GradFangen(origin, point, grid = 10) {
  if (!origin) return point;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const angle = Math.round(Math.atan2(Math.abs(dy), Math.abs(dx)) / (Math.PI / 4));
  if (angle <= 0) return { x: Math.round(point.x / grid) * grid, y: origin.y };
  if (angle >= 2) return { x: origin.x, y: Math.round(point.y / grid) * grid };
  const distance = Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / grid) * grid;
  return { x: origin.x + sx * distance, y: origin.y + sy * distance };
}

// Standard im Schema ist bewusst orthogonal. 45° entsteht nur über Shift;
// ohne Shift gewinnt die Achse, in deren Richtung der Cursor weiter entfernt
// liegt. Dadurch kann kein zufälliger flacher Winkel gespeichert werden.
function orthogonalerSegmentfang(origin, point, grid = CAD_GRID) {
  if (!origin) return rasterPunkt(point, grid);
  const raster = rasterPunkt(point, grid);
  return Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y)
    ? { x:raster.x, y:origin.y }
    : { x:origin.x, y:raster.y };
}

const richtungsVektor = (side) => ({
  left:{ x:-1, y:0 }, right:{ x:1, y:0 },
  top:{ x:0, y:-1 }, bottom:{ x:0, y:1 },
}[side] || null);

function erlaubterLeitungswinkel(a, b) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return dx < 0.5 || dy < 0.5 || Math.abs(dx - dy) < 0.5;
}

function vereinfachteRoute(points) {
  const unique = points.filter((point, index, all) => point
    && (!index || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > 0.5));
  return unique.filter((point, index, all) => {
    if (!index || index === all.length - 1) return true;
    const before = all[index - 1];
    const after = all[index + 1];
    const cross = (point.x - before.x) * (after.y - point.y)
      - (point.y - before.y) * (after.x - point.x);
    return Math.abs(cross) > 0.5;
  });
}

// Gespeicherte Eckpunkte sind geometrische Hinweise. Die beiden Punkte an den
// Bauteilen werden bei jeder Darstellung aus den aktuellen Handle-Koordinaten
// neu projiziert. Verschieben oder Vergrössern eines Bauteils hält dadurch den
// ersten und letzten Abschnitt rechtwinklig, ohne die restliche Route zu verlieren.
function adaptivePolyline(start, end, storedPoints = [], sourceSide = null, targetSide = null) {
  if (!start || !end) return [];
  const raw = (storedPoints || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const sourceVector = richtungsVektor(sourceSide);
  const targetVector = richtungsVektor(targetSide);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const lead = Math.max(24, Math.min(60, distance / 4 || 24));

  let hints;
  if (!raw.length) {
    const sourceLead = sourceVector
      ? { x:start.x + sourceVector.x * lead, y:start.y + sourceVector.y * lead }
      : { ...start };
    const targetLead = targetVector
      ? { x:end.x + targetVector.x * lead, y:end.y + targetVector.y * lead }
      : { ...end };
    hints = [sourceLead, { x:targetLead.x, y:sourceLead.y }, targetLead];
  } else {
    const first = raw[0];
    const last = raw.at(-1);
    const sourceLead = sourceSide === 'left' || sourceSide === 'right'
      ? { x:first.x, y:start.y }
      : sourceSide === 'top' || sourceSide === 'bottom'
        ? { x:start.x, y:first.y }
        : { ...first };
    const targetLead = targetSide === 'left' || targetSide === 'right'
      ? { x:last.x, y:end.y }
      : targetSide === 'top' || targetSide === 'bottom'
        ? { x:end.x, y:last.y }
        : { ...last };
    hints = raw.length === 1
      ? [sourceLead, targetLead]
      : [sourceLead, ...raw.slice(1, -1), targetLead];
  }

  const route = [{ ...start }];
  [...hints, { ...end }].forEach(point => {
    const previous = route.at(-1);
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.5) return;
    if (!erlaubterLeitungswinkel(previous, point)) {
      const before = route.at(-2);
      const previousWasHorizontal = before && Math.abs(previous.y - before.y) < 0.5;
      const previousWasVertical = before && Math.abs(previous.x - before.x) < 0.5;
      const elbow = previousWasVertical
        ? { x:previous.x, y:point.y }
        : previousWasHorizontal
          ? { x:point.x, y:previous.y }
          : Math.abs(point.x - previous.x) >= Math.abs(point.y - previous.y)
            ? { x:point.x, y:previous.y }
            : { x:previous.x, y:point.y };
      if (Math.hypot(elbow.x - previous.x, elbow.y - previous.y) > 0.5) route.push(elbow);
    }
    route.push(point);
  });
  return vereinfachteRoute(route);
}

function guidesAmPunkt(guides, point) {
  return (guides || []).flatMap(guide => {
    const vertical = Math.abs(guide.x1 - guide.x2) < 0.5;
    const horizontal = Math.abs(guide.y1 - guide.y2) < 0.5;
    if (vertical && Math.abs(point.x - guide.x1) < 0.5) return [{ ...guide, x2:point.x, y2:point.y }];
    if (horizontal && Math.abs(point.y - guide.y1) < 0.5) return [{ ...guide, x2:point.x, y2:point.y }];
    return [];
  });
}

// Objektfang über alle bekannten Bauteil-Handles und Leitungsendpunkte. X und
// Y werden getrennt bewertet, damit auch der Schnittpunkt zweier verschiedener
// Ausrichtungslinien gefangen werden kann.
function objektAusrichtung(point, snapPoints, tolerance = 10, grid = CAD_GRID) {
  const raster = rasterPunkt(point, grid);
  let xMatch = null;
  let yMatch = null;
  snapPoints.forEach(snapPoint => {
    const dx = Math.abs(point.x - snapPoint.x);
    const dy = Math.abs(point.y - snapPoint.y);
    const distance = Math.hypot(point.x - snapPoint.x, point.y - snapPoint.y);
    const xScore = dx * 10000 + distance - (snapPoint.priority || 0);
    const yScore = dy * 10000 + distance - (snapPoint.priority || 0);
    if (dx <= tolerance && (!xMatch || xScore < xMatch.score)) xMatch = { snapPoint, score:xScore };
    if (dy <= tolerance && (!yMatch || yScore < yMatch.score)) yMatch = { snapPoint, score:yScore };
  });
  const snapped = {
    x:xMatch ? xMatch.snapPoint.x : raster.x,
    y:yMatch ? yMatch.snapPoint.y : raster.y,
  };
  const guides = [];
  if (xMatch && Math.abs(snapped.y - xMatch.snapPoint.y) > 1) {
    guides.push({
      x1:xMatch.snapPoint.x,
      y1:xMatch.snapPoint.y,
      x2:snapped.x,
      y2:snapped.y,
      snapType:xMatch.snapPoint.kind,
    });
  }
  if (yMatch && Math.abs(snapped.x - yMatch.snapPoint.x) > 1) {
    guides.push({
      x1:yMatch.snapPoint.x,
      y1:yMatch.snapPoint.y,
      x2:snapped.x,
      y2:snapped.y,
      snapType:yMatch.snapPoint.kind,
    });
  }
  return { point:snapped, guides, xMatch:xMatch?.snapPoint, yMatch:yMatch?.snapPoint };
}

function anschlussSeite(handle, internal) {
  if (handle?.position) return String(handle.position).toLowerCase();
  const width = internal?.measured?.width || 0;
  const height = internal?.measured?.height || 0;
  const centerX = (handle?.x || 0) + (handle?.width || 0) / 2;
  const centerY = (handle?.y || 0) + (handle?.height || 0) / 2;
  const candidates = [
    ['left', centerX],
    ['right', Math.abs(width - centerX)],
    ['top', centerY],
    ['bottom', Math.abs(height - centerY)],
  ];
  return candidates.sort((a, b) => a[1] - b[1])[0]?.[0] || null;
}

// Der letzte Abschnitt trifft den Bauteilanschluss immer rechtwinklig. Die
// Seite des Handles entscheidet, ob die Anfahrt horizontal oder vertikal ist.
function orthogonalerAnschlussEckpunkt(origin, target, side) {
  if (!origin || !target || !side) return null;
  let corner = null;
  if (side === 'left' || side === 'right') corner = { x:origin.x, y:target.y };
  if (side === 'top' || side === 'bottom') corner = { x:target.x, y:origin.y };
  if (!corner) return null;
  const sameAsOrigin = Math.hypot(corner.x - origin.x, corner.y - origin.y) < 1;
  const sameAsTarget = Math.hypot(corner.x - target.x, corner.y - target.y) < 1;
  return sameAsOrigin || sameAsTarget ? null : corner;
}

function projektionAufSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return null;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, t, distance:Math.hypot(point.x - x, point.y - y) };
}

function punktAnAchseSpiegeln(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const quadrat = dx * dx + dy * dy;
  if (!quadrat) return { ...point };
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / quadrat;
  const lot = { x:a.x + t * dx, y:a.y + t * dy };
  return { x:2 * lot.x - point.x, y:2 * lot.y - point.y };
}

const streckenLaenge = (points) => points.slice(1)
  .reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);

function ConstrainedConnectionLine({ fromX, fromY, toX, toY, fromPosition, connectionLineStyle = {}, shift = false }) {
  const start = { x:fromX, y:fromY };
  const target = shift
    ? auf45GradFangen(start, { x:toX, y:toY }, 1)
    : orthogonalerSegmentfang(start, { x:toX, y:toY }, 1);
  const route = adaptivePolyline(start, target, [], String(fromPosition || '').toLowerCase(), null);
  return <path d={roundedPolylinePath(route, 8)} fill="none"
    stroke={connectionLineStyle.stroke || '#64748b'} strokeWidth={2.5} strokeDasharray="8 5" />;
}
const WAERMEABGABE = [
  { label: 'Fussbodenheizung (FBH)',  vl: 35, rl: 28 },
  { label: 'Heizkörper modern (HK)', vl: 50, rl: 40 },
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
    { type: 'erdsonden',  label: 'Erdsondenfeld',       desc: 'Dynamischer Soleverteiler mit Duplexsonden' },
    { type: 'speicher',   label: 'Speicher',            desc: 'Inhalt wird direkt im Symbol angezeigt' },
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
function LeitungPanel({ edge, leitungResults, onUpdateEdge, onUpdateLayer, onDelete }) {
  const lg = leitungResults[edge.id];
  const layer = layerVonEdge(edge);
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
      <label style={lbl}>Medien-Layer</label>
      <select style={inp} value={layer.id} onChange={event => onUpdateLayer(edge.id, event.target.value)}>
        {LEITUNGS_LAYER.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5, fontSize:9, color:'#64748b' }}>
        <span style={{ width:26, borderTop:`3px ${layer.dashed?'dashed':'solid'} ${layer.color}` }}/>
        {layer.role ? `Fachlich ${layer.role.toUpperCase()}` : 'Ohne VL/RL-Zuordnung'}
      </div>
      {edge.data?.paired_edge_id && (
        <div style={{ marginTop:6, padding:'5px 7px', borderRadius:6, background:'#eff6ff', color:'#1d4ed8', fontSize:9, lineHeight:1.4 }}>
          VL/RL-Paar · Diese Leitung bleibt unabhängig bearbeitbar.
        </div>
      )}
      {edge.data?.auto_pair_open && (
        <div style={{ ...warnSt, background:'#fff7ed', border:'1px solid #fdba74', color:'#c2410c', marginTop:6 }}>
          Automatischer Rücklauf besitzt noch ein freies Ende. Endgriff auf den gewünschten Fangpunkt ziehen.
        </div>
      )}
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
            ? <>
              {ro('Δp dieser Leitung', lg.dp_kpa.toFixed(2), 'kPa', true)}
              <div style={{ marginTop:-3, marginBottom:7, fontSize:8.5, color:'#64748b', fontFamily:'monospace' }}>
                {lg.pam.toFixed(1)} Pa/m × {Number(lg.laenge_m).toFixed(1)} m ÷ 1000
              </div>
            </>
            : <div style={{ fontSize: 9, color: '#94a3b8' }}>Länge eingeben für Δp dieser Leitung.</div>}
          {lg.warnung && <div style={{ ...warnSt, background:'#fef2f2', border:'1px solid #fca5a5', color:'#b91c1c', marginTop:6 }}>⚠ {lg.warnung}</div>}
        </>
      ) : (
        <div style={warnSt}>Kein Durchfluss auf dieser Leitung — Dimensionierung erscheint, sobald sie Wasser führt.</div>
      )}
      <Div />
      <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b' }}>
        <b style={{ color:'#334155' }}>Leitungsführung:</b> Die gewählte Leitung direkt am Segment ziehen: senkrechte Stücke bewegen sich links/rechts, waagrechte oben/unten. Doppelklick setzt einen Eckpunkt. Rechtsklick auf einen Endgriff → «Linie weiterziehen». Grüne Hilfslinien zeigen den orthogonalen Fang; Shift rastet auf 0°, 45° oder 90°.
      </div>
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

  // ── SPEICHER ──
  if (node.type === 'speicher') {
    return (
      <div style={panelSt}>
        <PT>Speicher</PT>
        {fld('Bezeichnung','label','Speicher','','text')}
        {fld('Speicherinhalt','speicher_liter','z.B. 800','L')}
        <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 7px' }}>
          Der Inhalt erscheint direkt im Speicher-Symbol. Die Anzahl und Lage der Anschlüsse bleibt davon unabhängig.
        </div>
        <Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── ERDSONDENFELD ──
  if (node.type === 'erdsonden') {
    const anzahl = Math.max(1, Math.min(24, parseInt(d.sonden_anzahl) || 5));
    const laenge = parseFloat(d.sonden_laenge_m);
    return (
      <div style={panelSt}>
        <PT>Erdsondenfeld</PT>
        {fld('Bezeichnung','label','Erdsondenfeld','','text')}
        <label style={lbl}>Anzahl Duplexsonden</label>
        <select style={{...inp,cursor:'pointer'}} value={anzahl}
          onChange={e=>onUpdate(node.id, 'sonden_anzahl', parseInt(e.target.value))}>
          {Array.from({ length:24 }, (_, i) => i + 1).map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        {fld('Sondenlänge','sonden_laenge_m','z.B. 180','m')}
        <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 7px' }}>
          Das Symbol zeigt pro Sonde zwei U-Rohre. Der Verteiler wächst automatisch mit.
          {Number.isFinite(laenge) && laenge > 0 && <> Gesamtbohrmeter: <b>{Math.round(anzahl * laenge).toLocaleString('de-CH')} m</b>.</>}
        </div>
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
  verteiler: 'Verteiler', speicher: 'Speicher', erdsonden: 'Erdsondenfeld',
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
  } else if (node.type === 'speicher') {
    body = (
      <div style={{ display:'grid', gap:10 }}>
        <div><label style={lbl}>Speicherinhalt [L]</label>
          <input type="number" min="0" style={inp} value={d.speicher_liter??''} onChange={e=>set('speicher_liter',e.target.value)} placeholder="z.B. 800"/></div>
        <BigVal label="Anzeige im Schema" value={d.speicher_liter || null} unit="L" color="#334155"
          sub="Der Wert wird direkt im Speicherbehälter dargestellt."/>
        <div style={{ fontSize:11, color:'#64748b' }}>
          Die sichtbaren Fangpunkte bleiben unabhängig vom Inhalt. Eine frei konfigurierbare 3-/4-Punkt-Anbindung folgt als eigener Schritt.
        </div>
      </div>
    );
  } else if (node.type === 'erdsonden') {
    const anzahl = Math.max(1, Math.min(24, parseInt(d.sonden_anzahl) || 5));
    const laenge = parseFloat(d.sonden_laenge_m);
    body = (
      <div style={{ display:'grid', gap:10 }}>
        <div><label style={lbl}>Anzahl Duplexsonden</label>
          <select style={{...inp,cursor:'pointer'}} value={anzahl}
            onChange={e=>set('sonden_anzahl', parseInt(e.target.value))}>
            {Array.from({ length:24 }, (_, i) => i + 1).map(k=><option key={k} value={k}>{k}</option>)}
          </select></div>
        <div><label style={lbl}>Sondenlänge [m]</label>
          <input type="number" min="1" style={inp} value={d.sonden_laenge_m??''}
            onChange={e=>set('sonden_laenge_m',e.target.value)} placeholder="z.B. 180"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <BigVal label="Duplexsonden" value={anzahl} color="#4f46e5" sub="je zwei U-Rohre"/>
          <BigVal label="Gesamtbohrmeter"
            value={Number.isFinite(laenge) && laenge > 0 ? Math.round(anzahl * laenge).toLocaleString('de-CH') : null}
            unit="m" color="#7c3aed" sub="Anzahl × Sondenlänge"/>
        </div>
        <div style={{ fontSize:11, color:'#64748b' }}>
          Rechts liegen die beiden Hauptanschlüsse des Sole-Vor- und -Rücklaufs. Die einzelnen Sondenabgänge werden intern im Verteiler dargestellt.
        </div>
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

function ToolbarMenu({ label, badge, children, icon: Icon, primary = false, align = 'left' }) {
  return (
    <details className={`hc-toolbar-menu${primary ? ' is-primary' : ''}`}>
      <summary className="hc-toolbar-menu__trigger">
        {Icon && <Icon size={15} strokeWidth={2} />}
        <span>{label}</span>
        {badge > 0 && <span className="hc-toolbar-menu__badge">{badge}</span>}
        <ChevronDown className="hc-toolbar-menu__chevron" size={13} />
      </summary>
      <div className={`hc-toolbar-menu__content${align === 'right' ? ' is-right' : ''}`}>
        {children}
      </div>
    </details>
  );
}

const menuActionStyle = {
  width:'100%', display:'flex', alignItems:'center', gap:7, padding:'7px 9px', border:0, borderRadius:7,
  background:'transparent', color:'#334155', fontSize:10, fontWeight:600, textDecoration:'none', textAlign:'left', cursor:'pointer', whiteSpace:'nowrap',
};

const closeToolbarMenu = (event) => event.currentTarget.closest('details')?.removeAttribute('open');

// ── Haupt-Editor ──────────────────────────────────────────────
function EditorInner() {
  const navigate = useNavigate();
  const { id: projectId } = useParams();
  const { screenToFlowPosition, getInternalNode, getZoom, fitView, getViewport, setViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeGeometryVersion = useStore(state => {
    let signature = '';
    state.nodeLookup.forEach(node => {
      const position = node.internals?.positionAbsolute || node.position || {};
      signature += `${node.id}:${position.x || 0}:${position.y || 0}:${node.measured?.width || 0}:${node.measured?.height || 0}|`;
    });
    return signature;
  });
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected]     = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [activeLayerId, setActiveLayerId] = useState('heizung_vl');
  const [layerVisibility, setLayerVisibility] = useState(DEFAULT_LAYER_VISIBILITY);
  const [showLayers, setShowLayers] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [paletteGroupsOpen, setPaletteGroupsOpen] = useState(() => ({
    'Erzeugung & Speicher':true,
    Verteilung:true,
  }));
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [drawingConfig, setDrawingConfig] = useState(DEFAULT_DRAWING_CONFIG);
  const [leitungsEntwurf, setLeitungsEntwurf] = useState(null);
  const [leitungsCursor, setLeitungsCursor] = useState(null);
  const [leitungsSnap, setLeitungsSnap] = useState(null);
  const [leitungsGuides, setLeitungsGuides] = useState([]);
  const [endpointMenu, setEndpointMenu] = useState(null); // { x, y, edgeId, side }
  const [edgeMenu, setEdgeMenu] = useState(null); // { x, y, edgeId, point }
  const [markierteEdgeIds, setMarkierteEdgeIds] = useState([]);
  const [spiegelAchse, setSpiegelAchse] = useState(null); // { edgeId, start, cursor }
  const [schemaName, setSchemaName] = useState('Schema');
  const [projectName, setProjectName] = useState('');
  const [schemaId, setSchemaId]     = useState(null);
  const [loaded, setLoaded]         = useState(false);
  const [saveState, setSaveState]   = useState('idle'); // idle | saving | saved | error
  const [auslegung, setAuslegung]   = useState(null);   // Bauteil für Doppelklick-Auslegung
  const [showLegende, setShowLegende] = useState(false);
  const [showWarnungen, setShowWarnungen] = useState(false);
  const [schaltungswahl, setSchaltungswahl] = useState(null); // {nodeId, x, y} — Menü nach Gruppe-Drop
  const leitungsEntwurfRef = useRef(null);
  const leitungsCursorRef = useRef(null);
  const leitungsCursorFrame = useRef(null);

  useEffect(() => { leitungsEntwurfRef.current = leitungsEntwurf; }, [leitungsEntwurf]);
  useEffect(() => { leitungsCursorRef.current = leitungsCursor; }, [leitungsCursor]);

  useEffect(() => {
    const down = (event) => { if (event.key === 'Shift') setShiftPressed(true); };
    const up = (event) => { if (event.key === 'Shift') setShiftPressed(false); };
    const blur = () => setShiftPressed(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const [hydraulik, setHydraulik] = useState({ edge_flows: {}, node_flows: {}, verteiler_results: {}, gruppe_results: {}, ventil_results: {}, pumpen_results: {}, expansion_results: {}, leitung_results: {}, anschluss_warnings: [], warnungen: [] });
  const letzteHydraulikSignatur = useRef('');
  const hydraulikAbort = useRef(null);

  // Graph (debounced) ans Backend schicken — dort wird gerechnet
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      const payload = {
        nodes: nodes.map(n => ({ id:n.id, type:n.type, data:{ ...n.data, _calc:undefined } })),
        edges: edges.map(e => {
          const layer = layerVonEdge(e);
          return {
            id:e.id, source:e.source, target:e.target,
            sourceHandle:e.sourceHandle || null, targetHandle:e.targetHandle || null,
            stroke:layer.role === 'vl' ? '#ef4444' : layer.role === 'rl' ? '#3b82f6' : (e.style?.stroke || null),
            data:e.data ? { laenge_m:e.data.laenge_m } : null,
          };
        }),
      };
      const signatur = JSON.stringify(payload);
      // Position, Auswahl und Zoom beeinflussen die Physik nicht. Beim blossen
      // Verschieben eines Bauteils entfällt deshalb der komplette Roundtrip.
      if (signatur === letzteHydraulikSignatur.current) return;
      letzteHydraulikSignatur.current = signatur;
      hydraulikAbort.current?.abort();
      const controller = new AbortController();
      hydraulikAbort.current = controller;
      try {
        const res = await hydraulikBerechnen(payload, { signal:controller.signal });
        if (hydraulikAbort.current === controller) setHydraulik(res);
      } catch (error) {
        if (hydraulikAbort.current === controller && error?.code !== 'ERR_CANCELED') {
          letzteHydraulikSignatur.current = '';
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [nodes, edges, loaded]);

  useEffect(() => () => hydraulikAbort.current?.abort(), []);

  const edgeFlows = hydraulik.edge_flows || EMPTY_OBJECT;
  const nodeFlows = hydraulik.node_flows || EMPTY_OBJECT;
  const verteilerResults = hydraulik.verteiler_results || EMPTY_OBJECT;
  const gruppeResults = hydraulik.gruppe_results || EMPTY_OBJECT;
  const ventilResults = hydraulik.ventil_results || EMPTY_OBJECT;
  const pumpenResults = hydraulik.pumpen_results || EMPTY_OBJECT;
  const expansionResults = hydraulik.expansion_results || EMPTY_OBJECT;
  const leitungResults = hydraulik.leitung_results || EMPTY_OBJECT;
  const anschlussWarnungen = hydraulik.anschluss_warnings || EMPTY_ARRAY;
  const anschlussResults = hydraulik.anschluss_results || EMPTY_OBJECT;
  const pwtResults = hydraulik.pwt_results || EMPTY_OBJECT;
  const alleWarnungen = hydraulik.warnungen || EMPTY_ARRAY;

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
        const start = await getSchemaEditor(projectId);
        setProjectName(start.project?.name || 'Projekt');
        const s = start.schema || await createSchema(projectId, { name: 'Schema', graph: { nodes: [], edges: [] } });
        setSchemaId(s.id);
        setSchemaName(s.name || 'Schema');
        // Fehlende Bauteil-Nummern nachtragen (ältere Schemas)
        let geladen = s.graph?.nodes || [];
        let maxNr = geladen.reduce((m, x) => Math.max(m, parseInt(x.data?.nr) || 0), 0);
        geladen = geladen.map(n => {
          if (n.type === 'junction' && !n.data?.cad_anchor) {
            // Migration der kurzzeitig sichtbaren 12×12-Junctions: gespeichert
            // wurde deren linke obere Ecke, die neue CAD-Ebene speichert den
            // tatsächlichen Leitungsfangpunkt.
            return {
              ...n,
              position:{ x:(n.position?.x || 0) + 6, y:(n.position?.y || 0) + 6 },
              data:{ ...(n.data || {}), cad_anchor:true },
            };
          }
          return (NUMMERIERT.includes(n.type) && n.data?.nr == null)
            ? { ...n, data: { ...n.data, nr: ++maxNr } } : n;
        });
        const geladeneDrawingConfig = normalisiereDrawingConfig(s.graph?.drawing_config);
        setDrawingConfig(geladeneDrawingConfig);
        setNodes(geladen);
        setEdges((s.graph?.edges || []).map(edge => ({
          ...edge,
          data:{
            ...(edge.data || {}),
            cad_polyline:true,
            polyline_version:1,
            corner_radius:edge.data?.corner_radius ?? geladeneDrawingConfig.corner_radius,
          },
        })));
        const layerConfig = s.graph?.layer_config;
        if (LEITUNGS_LAYER.some(layer => layer.id === layerConfig?.active_layer_id)) {
          const active = LEITUNGS_LAYER.find(layer => layer.id === layerConfig.active_layer_id);
          setActiveLayerId(active.id);
        }
        if (layerConfig?.visibility) setLayerVisibility({ ...DEFAULT_LAYER_VISIBILITY, ...layerConfig.visibility });
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
        const graph = graphFuerSpeicherung(
          nodes,
          edges,
          { active_layer_id:activeLayerId, visibility:layerVisibility },
          drawingConfig,
        );
        await saveSchemaGraph(schemaId, { name:schemaName, graph });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, schemaName, loaded, schemaId, activeLayerId, layerVisibility, drawingConfig]);

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

  const drawingConfigAktualisieren = useCallback((key, value) => {
    const next = normalisiereDrawingConfig({ ...drawingConfig, [key]:value });
    setDrawingConfig(next);
    if (key === 'corner_radius') {
      setEdges(items => items.map(edge => ({
        ...edge,
        data:{ ...(edge.data || {}), corner_radius:next.corner_radius },
      })));
    }
  }, [drawingConfig, setEdges]);

  // CSS-Animationen + grössere Hitboxen
  React.useEffect(() => {
    const s = document.createElement('style');
    s.id = 'hc-flow-anim';
    s.textContent = `
      @keyframes hc-vl-pulse { from{stroke-dashoffset:10000} to{stroke-dashoffset:0} }
      @keyframes hc-rl-flow  { from{stroke-dashoffset:48}    to{stroke-dashoffset:0} }
      /* Kleine sichtbare Fangpunkte mit komfortabler unsichtbarer Hitbox. */
      .react-flow__handle {
        width: 11px !important; height: 11px !important;
        min-width: 11px !important; min-height: 11px !important;
        border-radius: 3px !important;
        transition: transform .1s, box-shadow .1s !important;
      }
      .react-flow__handle::after {
        content: ''; position: absolute;
        inset: -7px; border-radius: 7px;
      }
      .react-flow__handle:hover {
        transform: scale(1.25) !important;
        box-shadow: 0 0 0 3px rgba(59,130,246,.35) !important;
        z-index: 1000 !important;
      }
      /* Bei der kleinen Pumpe darf die Hitbox nicht das ganze Symbol abdecken:
         Mitte bleibt frei zum Anwählen und Verschieben. */
      .react-flow__handle.hc-pump-handle {
        width: 8px !important; height: 8px !important;
        min-width: 8px !important; min-height: 8px !important;
      }
      .react-flow__handle.hc-pump-handle::after { inset: -3px; }
      .react-flow__handle.hc-junction-handle {
        width: 1px !important; height: 1px !important; min-width: 0 !important; min-height: 0 !important;
        left: 0 !important; top: 0 !important; transform: none !important;
        opacity: 0 !important; pointer-events: none !important; box-shadow: none !important;
      }
      /* Leitungen dicker bei hover */
      .react-flow__edge:hover .react-flow__edge-path { stroke-width: 5 !important; }
      /* Midpoint-Handle bei Hover auf Leitung einblenden */
      .react-flow__edge:hover .hc-edge-mid { opacity: 1 !important; }
      .hc-pdf-capture .react-flow__handle,
      .hc-pdf-capture .react-flow__controls,
      .hc-pdf-capture .react-flow__minimap,
      .hc-pdf-capture .react-flow__panel,
      .hc-pdf-capture .react-flow__attribution { display:none !important; }
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
  const edgesRef = useRef([]);
  const edgePointDrag = useRef(null);
  const edgeSegmentDrag = useRef(null);
  const edgePointFrame = useRef(null);
  const edgeEndpointDrag = useRef(null);
  const deleteEdgeRef = useRef(null);
  const deleteNodeRef = useRef(null);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const activeLayer = LEITUNGS_LAYER.find(layer => layer.id === activeLayerId) || LEITUNGS_LAYER[0];
  const connectionLineRenderer = useCallback((props) => <ConstrainedConnectionLine {...props} shift={shiftPressed} />, [shiftPressed]);
  const layerWaehlen = useCallback((layerId) => {
    const layer = LEITUNGS_LAYER.find(item => item.id === layerId);
    if (!layer) return;
    setActiveLayerId(layer.id);
    setLayerVisibility(current => ({ ...current, [layer.id]:true }));
  }, []);

  const handlePosition = useCallback((nodeId, handleId) => {
    const graphNode = nodesRef.current.find(node => node.id === nodeId);
    if (graphNode?.type === 'junction' && graphNode.data?.cad_anchor) {
      return { x:graphNode.position?.x || 0, y:graphNode.position?.y || 0 };
    }
    const internal = getInternalNode(nodeId);
    if (!internal) return null;
    const bounds = [
      ...(internal.internals.handleBounds?.source || []),
      ...(internal.internals.handleBounds?.target || []),
    ];
    const handle = bounds.find(item => item.id === handleId) || bounds[0];
    const absolute = internal.internals.positionAbsolute;
    if (handle) return { x:absolute.x + handle.x + handle.width / 2, y:absolute.y + handle.y + handle.height / 2 };
    return {
      x:absolute.x + (internal.measured.width || 12) / 2,
      y:absolute.y + (internal.measured.height || 12) / 2,
    };
  }, [getInternalNode]);

  const exakteHandlePosition = useCallback((nodeId, handleId) => {
    if (!handleId) return null;
    const internal = getInternalNode(nodeId);
    if (!internal) return null;
    const bounds = [
      ...(internal.internals.handleBounds?.source || []),
      ...(internal.internals.handleBounds?.target || []),
    ];
    const handle = bounds.find(item => item.id === handleId);
    const absolute = internal.internals.positionAbsolute;
    return handle && absolute
      ? { x:absolute.x + handle.x + handle.width / 2, y:absolute.y + handle.y + handle.height / 2 }
      : null;
  }, [getInternalNode]);

  const handleAusrichtung = useCallback((nodeId, handleId) => {
    const internal = getInternalNode(nodeId);
    if (!internal) return null;
    const bounds = [
      ...(internal.internals.handleBounds?.source || []),
      ...(internal.internals.handleBounds?.target || []),
    ];
    return anschlussSeite(bounds.find(item => item.id === handleId), internal);
  }, [getInternalNode]);

  const routePunkte = useCallback((edge) => {
    const start = handlePosition(edge.source, edge.sourceHandle);
    const end = handlePosition(edge.target, edge.targetHandle);
    if (!start || !end) return [];
    const sourceNode = nodesRef.current.find(node => node.id === edge.source);
    const targetNode = nodesRef.current.find(node => node.id === edge.target);
    const sourceSide = sourceNode?.type === 'junction' ? null : handleAusrichtung(edge.source, edge.sourceHandle);
    const targetSide = targetNode?.type === 'junction' ? null : handleAusrichtung(edge.target, edge.targetHandle);
    return adaptivePolyline(start, end, edge.data?.points || [], sourceSide, targetSide);
  }, [handleAusrichtung, handlePosition]);

  // Eine einzige, pro Graphänderung neu aufgebaute Fangpunktliste hält den
  // Pointer-Move-Pfad leichtgewichtig. Darin liegen alle Bauteilanschlüsse und
  // die beiden Endpunkte jeder sichtbaren Leitung.
  const objektFangpunkte = useMemo(() => {
    // Der Wert wird als Revisionsschlüssel verwendet: Nach Messung oder
    // Verschieben eines React-Flow-Nodes werden die absoluten Handle-Koordinaten
    // neu aus dem internen Store gelesen.
    void nodeGeometryVersion;
    const result = [];
    const seen = new Set();
    const add = (point) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      const key = `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}:${point.nodeId || ''}:${point.handleId || ''}:${point.kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(point);
    };

    nodes.forEach(node => {
      if (['junction', 'label'].includes(node.type)) return;
      const internal = getInternalNode(node.id);
      const absolute = internal?.internals.positionAbsolute;
      if (!internal || !absolute) return;
      const handles = [
        ...(internal.internals.handleBounds?.source || []),
        ...(internal.internals.handleBounds?.target || []),
      ];
      handles.forEach(handle => add({
        x:absolute.x + handle.x + handle.width / 2,
        y:absolute.y + handle.y + handle.height / 2,
        kind:'handle',
        nodeId:node.id,
        nodeType:node.type,
        handleId:handle.id,
        handlePosition:anschlussSeite(handle, internal),
      }));
    });

    edges.forEach(edge => {
      const layer = layerVonEdge(edge);
      if (layerVisibility[layer.id] === false) return;
      const route = routePunkte(edge);
      if (route.length < 2) return;
      add({
        ...route[0],
        kind:'endpoint',
        edgeId:edge.id,
        layerId:layer.id,
        nodeId:edge.source,
        nodeType:nodesRef.current.find(node => node.id === edge.source)?.type,
        handleId:edge.sourceHandle,
        handlePosition:handleAusrichtung(edge.source, edge.sourceHandle),
      });
      add({
        ...route.at(-1),
        kind:'endpoint',
        edgeId:edge.id,
        layerId:layer.id,
        nodeId:edge.target,
        nodeType:nodesRef.current.find(node => node.id === edge.target)?.type,
        handleId:edge.targetHandle,
        handlePosition:handleAusrichtung(edge.target, edge.targetHandle),
      });
    });
    return result;
  }, [edges, getInternalNode, handleAusrichtung, layerVisibility, nodeGeometryVersion, nodes, routePunkte]);

  const naechsterFreierLeitungsEndpunkt = useCallback((point, layerId, radius = 14, excludedEdgeId = null) => {
    let best = null;
    objektFangpunkte.forEach(snapPoint => {
      if (snapPoint.kind !== 'endpoint' || snapPoint.nodeType !== 'junction'
        || snapPoint.layerId !== layerId || snapPoint.edgeId === excludedEdgeId) return;
      const distance = Math.hypot(point.x - snapPoint.x, point.y - snapPoint.y);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { ...snapPoint, distance, position:{ x:snapPoint.x, y:snapPoint.y } };
      }
    });
    return best;
  }, [objektFangpunkte]);

  const naechsteLeitung = useCallback((point, layerId, radius = 18, excludedEdgeIds = new Set()) => {
    let best = null;
    edgesRef.current.forEach(edge => {
      if (excludedEdgeIds.has(edge.id)) return;
      if (layerVonEdge(edge).id !== layerId) return;
      const route = routePunkte(edge);
      for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex += 1) {
        const hit = projektionAufSegment(point, route[segmentIndex], route[segmentIndex + 1]);
        if (!hit || hit.t <= 0.05 || hit.t >= 0.95 || hit.distance > radius) continue;
        if (!best || hit.distance < best.distance) best = { ...hit, edge, route, segmentIndex };
      }
    });
    return best;
  }, [routePunkte]);

  const naechsteSichtbareLeitung = useCallback((point, radius = 24) => {
    let best = null;
    edgesRef.current.forEach(edge => {
      const layer = layerVonEdge(edge);
      if (layerVisibility[layer.id] === false) return;
      const route = routePunkte(edge);
      for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex += 1) {
        const hit = projektionAufSegment(point, route[segmentIndex], route[segmentIndex + 1]);
        if (!hit || hit.t <= 0.04 || hit.t >= 0.96 || hit.distance > radius) continue;
        if (!best || hit.distance < best.distance) best = { ...hit, edge, route, segmentIndex };
      }
    });
    return best;
  }, [layerVisibility, routePunkte]);

  const naechsterBauteilAnschluss = useCallback((point, excludedNodeId, role, radius = 24) => {
    let best = null;
    nodesRef.current.forEach(node => {
      if (node.id === excludedNodeId || ['junction', 'label'].includes(node.type)) return;
      const internal = getInternalNode(node.id);
      const absolute = internal?.internals.positionAbsolute;
      if (!internal || !absolute) return;
      const handles = [
        ...(internal.internals.handleBounds?.source || []),
        ...(internal.internals.handleBounds?.target || []),
      ];
      handles.forEach(handle => {
        const id = handle.id || '';
        if (role === 'vl' && id.startsWith('rl')) return;
        if (role === 'rl' && id.startsWith('vl')) return;
        const position = { x:absolute.x + handle.x + handle.width / 2, y:absolute.y + handle.y + handle.height / 2 };
        const distance = Math.hypot(point.x - position.x, point.y - position.y);
        if (distance <= radius && (!best || distance < best.distance)) {
          best = {
            distance,
            position,
            nodeId:node.id,
            handleId:handle.id,
            handlePosition:anschlussSeite(handle, internal),
          };
        }
      });
    });
    return best;
  }, [getInternalNode]);

  const leitungTeilen = useCallback((hit, junctionId, layerId) => {
    const host = hit.edge;
    const junctionPoint = { x:hit.x, y:hit.y };
    const before = hit.route.slice(1, hit.segmentIndex + 1);
    const after = hit.route.slice(hit.segmentIndex + 1, -1);
    const firstRoute = [hit.route[0], ...before, junctionPoint];
    const secondRoute = [junctionPoint, ...after, hit.route.at(-1)];
    const totalGeometry = streckenLaenge(firstRoute) + streckenLaenge(secondRoute);
    const oldLength = Number.parseFloat(host.data?.laenge_m);
    const firstShare = totalGeometry ? streckenLaenge(firstRoute) / totalGeometry : 0.5;
    const splitData = (points, share) => ({
      ...(host.data || {}), layer_id:layerId, cad_polyline:true, polyline_version:1, points,
      ...(Number.isFinite(oldLength) ? { laenge_m:Number((oldLength * share).toFixed(2)) } : {}),
    });
    return [{
      ...host, target:junctionId, targetHandle:'center-target', data:splitData(before, firstShare), selected:false,
    }, {
      ...host, id:newId(), source:junctionId, sourceHandle:'center-source', data:splitData(after, 1 - firstShare), selected:false,
    }];
  }, []);

  const cadAnker = useCallback((id, point, layer) => ({
    id,
    type:'junction',
    position:{ x:point.x, y:point.y },
    selectable:false,
    draggable:false,
    data:{ cad_anchor:true, layer_id:layer.id, color:layer.color },
  }), []);

  const ruecklaufPaarErstellen = useCallback((primaryEdge, startPoint, endPoint) => {
    const primaryLayer = layerVonEdge(primaryEdge);
    const returnLayer = drawingConfig.auto_return ? ruecklaufLayerVon(primaryLayer) : null;
    if (!returnLayer || !startPoint || !endPoint) return null;

    const endpoint = (nodeId, handleId) => {
      const node = nodesRef.current.find(item => item.id === nodeId);
      const returnHandleId = node && node.type !== 'junction' ? pairedHandleId(node.type, handleId) : null;
      const pairedPosition = returnHandleId ? exakteHandlePosition(nodeId, returnHandleId) : null;
      return pairedPosition ? { nodeId, handleId:returnHandleId, position:pairedPosition } : null;
    };

    // Der Rücklauf verläuft fachlich entgegengesetzt: vom Ziel des Vorlaufs
    // zurück zur Quelle. Die sichtbare Geometrie bleibt parallel, nur die
    // topologische Richtung und Reihenfolge der Stützpunkte werden gedreht.
    const sourceCounterpart = endpoint(primaryEdge.source, primaryEdge.sourceHandle);
    const targetCounterpart = endpoint(primaryEdge.target, primaryEdge.targetHandle);
    // Pumpen, Ventile und freie Leitungsenden haben bewusst kein gespiegeltes
    // Anschluss-Paar. Dort darf Auto-RL keine zufällige Parallelleitung bauen.
    if (!sourceCounterpart || !targetCounterpart) return null;
    const returnEdgeId = newId();
    const returnPoints = parallelWaypoints(
      primaryEdge.data?.points || [],
      startPoint,
      endPoint,
      sourceCounterpart.position,
      targetCounterpart.position,
    ).reverse();
    const returnEdge = {
      id:returnEdgeId,
      source:targetCounterpart.nodeId,
      sourceHandle:targetCounterpart.handleId,
      target:sourceCounterpart.nodeId,
      targetHandle:sourceCounterpart.handleId,
      type:'flow',
      selected:false,
      data:{
        layer_id:returnLayer.id,
        cad_polyline:true,
        polyline_version:1,
        corner_radius:drawingConfig.corner_radius,
        points:returnPoints,
        paired_edge_id:primaryEdge.id,
        auto_paired:true,
      },
      style:{ stroke:returnLayer.color, strokeWidth:4.5 },
    };
    return {
      primaryEdge:{
        ...primaryEdge,
        data:{ ...(primaryEdge.data || {}), paired_edge_id:returnEdgeId },
      },
      returnEdge,
      createdNodes:[],
    };
  }, [drawingConfig, exakteHandlePosition]);

  const letzterEntwurfsPunkt = useCallback((draft) => {
    if (!draft) return null;
    if (draft.points?.length) return draft.points.at(-1);
    if (draft.startEndpoint) return handlePosition(draft.startEndpoint.nodeId, draft.startEndpoint.handleId);
    return draft.startPoint;
  }, [handlePosition]);

  const leitungsEntwurfStarten = useCallback((startPoint, startEndpoint = null, options = {}) => {
    const draft = {
      layerId:options.layerId || activeLayer.id,
      startPoint,
      startEndpoint,
      points:[],
      ...options,
    };
    leitungsEntwurfRef.current = draft;
    setLeitungsEntwurf(draft);
    setLeitungsCursor(startPoint);
    leitungsCursorRef.current = startPoint;
    setLeitungsSnap(null);
    setLeitungsGuides([]);
    setSelected(null);
    setSelectedEdgeId(null);
    setEndpointMenu(null);
  }, [activeLayer.id]);

  const leitungWeiterziehen = useCallback((edgeId, side) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    if (route.length < 2) return;
    const startPoint = side === 'source' ? route[0] : route.at(-1);
    const nodeId = side === 'source' ? edge.source : edge.target;
    const handleId = side === 'source' ? edge.sourceHandle : edge.targetHandle;
    const layer = layerVonEdge(edge);
    layerWaehlen(layer.id);
    leitungsEntwurfStarten(startPoint, { nodeId, handleId }, {
      layerId:layer.id,
      extendEdgeId:edge.id,
      extendSide:side,
    });
  }, [layerWaehlen, leitungsEntwurfStarten, routePunkte]);

  const leitungsEntwurfAbschliessen = useCallback((rawPoint, snapHit = null, shift = false) => {
    const draft = leitungsEntwurfRef.current;
    if (!draft || !rawPoint) return;
    const layer = LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer;
    const startPoint = draft.startEndpoint
      ? handlePosition(draft.startEndpoint.nodeId, draft.startEndpoint.handleId)
      : draft.startPoint;
    const anchor = letzterEntwurfsPunkt(draft) || startPoint;
    const endPoint = snapHit
      ? { x:snapHit.x, y:snapHit.y }
      : shift ? auf45GradFangen(anchor, rawPoint, drawingConfig.grid_size) : orthogonalerSegmentfang(anchor, rawPoint, drawingConfig.grid_size);
    if (!startPoint || Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) < 2) return;
    const finalPoints = [...(draft.points || [])];
    const connectionCorner = snapHit?.type === 'port'
      ? orthogonalerAnschlussEckpunkt(anchor, endPoint, snapHit.handlePosition)
      : null;
    if (connectionCorner) finalPoints.push(connectionCorner);

    snap();

    if (draft.extendEdgeId) {
      const existing = edgesRef.current.find(item => item.id === draft.extendEdgeId);
      if (!existing) return;
      const side = draft.extendSide;
      const oldEndpointNodeId = side === 'source' ? existing.source : existing.target;
      const oldEndpointNode = nodesRef.current.find(node => node.id === oldEndpointNodeId);
      const incidentCount = edgesRef.current.filter(item => item.source === oldEndpointNodeId || item.target === oldEndpointNodeId).length;
      const reusableAnchorId = oldEndpointNode?.type === 'junction'
        && oldEndpointNode.data?.cad_anchor
        && incidentCount === 1
        ? oldEndpointNode.id
        : null;
      const finalAnchorId = snapHit?.type === 'port' ? null : reusableAnchorId || newId();

      if (finalAnchorId && finalAnchorId !== reusableAnchorId) {
        setNodes(items => [...items, cadAnker(finalAnchorId, endPoint, layer)]);
      } else if (finalAnchorId) {
        setNodes(items => items.map(node => node.id === finalAnchorId ? { ...node, position:endPoint } : node));
      } else if (reusableAnchorId) {
        setNodes(items => items.filter(node => node.id !== reusableAnchorId));
      }

      const existingRoute = routePunkte(existing);
      const oldInnerPoints = existingRoute.slice(1, -1);
      const newEndpoint = snapHit?.type === 'port'
        ? { nodeId:snapHit.nodeId, handleId:snapHit.handleId }
        : { nodeId:finalAnchorId, handleId:side === 'source' ? 'center-source' : 'center-target' };
      const nextPoints = side === 'source'
        ? [...finalPoints].reverse().concat(startPoint, oldInnerPoints)
        : oldInnerPoints.concat(startPoint, finalPoints);
      const extended = {
        ...existing,
        ...(side === 'source'
          ? { source:newEndpoint.nodeId, sourceHandle:newEndpoint.handleId }
          : { target:newEndpoint.nodeId, targetHandle:newEndpoint.handleId }),
        data:{
          ...(existing.data || {}),
          layer_id:layer.id,
          cad_polyline:true,
          corner_radius:drawingConfig.corner_radius,
          points:nextPoints,
        },
        style:{ ...(existing.style || {}), stroke:layer.color, strokeWidth:4.5 },
      };

      if (snapHit?.type === 'line') {
        const [first, second] = leitungTeilen(snapHit, finalAnchorId, layer.id);
        setEdges(items => [
          ...items.filter(item => item.id !== existing.id && item.id !== snapHit.edge.id),
          first, second, extended,
        ]);
      } else {
        setEdges(items => items.map(item => item.id === existing.id ? extended : item));
      }

      leitungsEntwurfRef.current = null;
      setLeitungsEntwurf(null);
      setLeitungsSnap(null);
      setLeitungsCursor(null);
      leitungsCursorRef.current = null;
      setLeitungsGuides([]);
      setSelectedEdgeId(existing.id);
      return;
    }

    const createdNodes = [];
    const sourceAnchorId = draft.startEndpoint ? null : newId();
    const targetAnchorId = snapHit?.type === 'port' ? null : newId();
    if (sourceAnchorId) createdNodes.push(cadAnker(sourceAnchorId, startPoint, layer));
    if (targetAnchorId) createdNodes.push(cadAnker(targetAnchorId, endPoint, layer));

    const edgeId = newId();
    const sourceSide = draft.startEndpoint
      ? handleAusrichtung(draft.startEndpoint.nodeId, draft.startEndpoint.handleId)
      : null;
    const targetSide = snapHit?.type === 'port' ? snapHit.handlePosition : null;
    const polylinePoints = adaptivePolyline(startPoint, endPoint, finalPoints, sourceSide, targetSide).slice(1, -1);
    let edge = {
      id:edgeId,
      source:draft.startEndpoint?.nodeId || sourceAnchorId,
      sourceHandle:draft.startEndpoint?.handleId || 'center-source',
      target:snapHit?.type === 'port' ? snapHit.nodeId : targetAnchorId,
      targetHandle:snapHit?.type === 'port' ? snapHit.handleId : 'center-target',
      type:'flow',
      data:{
        layer_id:layer.id,
        cad_polyline:true,
        polyline_version:1,
        corner_radius:drawingConfig.corner_radius,
        points:polylinePoints,
      },
      style:{ stroke:layer.color, strokeWidth:4.5 },
    };
    const returnPair = ruecklaufPaarErstellen(edge, startPoint, endPoint);
    if (returnPair) {
      edge = returnPair.primaryEdge;
      createdNodes.push(...returnPair.createdNodes);
    }
    if (createdNodes.length) setNodes(items => [...items, ...createdNodes]);
    const pairedEdges = returnPair ? [returnPair.returnEdge] : [];

    if (snapHit?.type === 'line') {
      const [first, second] = leitungTeilen(snapHit, targetAnchorId, layer.id);
      setEdges(items => [...items.filter(item => item.id !== snapHit.edge.id), first, second, edge, ...pairedEdges]);
    } else {
      setEdges(items => [...items, edge, ...pairedEdges]);
    }

    leitungsEntwurfRef.current = null;
    setLeitungsEntwurf(null);
    setLeitungsSnap(null);
    setLeitungsCursor(null);
    leitungsCursorRef.current = null;
    setLeitungsGuides([]);
    setSelectedEdgeId(edgeId);
  }, [activeLayer, cadAnker, drawingConfig, handleAusrichtung, handlePosition, letzterEntwurfsPunkt, leitungTeilen, routePunkte, ruecklaufPaarErstellen, setEdges, setNodes, snap]);

  const cadKlick = useCallback((event, nurBeiAnschluss = false) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const draft = leitungsEntwurfRef.current;
    const layer = draft
      ? LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer
      : activeLayer;
    const zoom = Math.max(getZoom(), 0.2);
    const portHit = naechsterBauteilAnschluss(raw, null, layer.role, 28 / zoom);
    const endpointHit = portHit ? null : naechsterFreierLeitungsEndpunkt(raw, layer.id, 16 / zoom, draft?.extendEdgeId);

    if (!draft) {
      if (nurBeiAnschluss && !portHit && !endpointHit) return true;
      const startHit = portHit || endpointHit;
      const startPoint = startHit?.position || rasterPunkt(raw, drawingConfig.grid_size);
      leitungsEntwurfStarten(startPoint, startHit ? { nodeId:startHit.nodeId, handleId:startHit.handleId } : null);
      return true;
    }
    if (portHit) {
      leitungsEntwurfAbschliessen(portHit.position, { ...portHit, ...portHit.position, type:'port' }, event.shiftKey || shiftPressed);
      return true;
    }
    if (endpointHit) {
      leitungsEntwurfAbschliessen(endpointHit.position, { ...endpointHit, ...endpointHit.position, type:'port' }, event.shiftKey || shiftPressed);
      return true;
    }
    if (nurBeiAnschluss) return true;
    const excludedEdges = draft.extendEdgeId ? new Set([draft.extendEdgeId]) : new Set();
    const lineHit = naechsteLeitung(raw, layer.id, 22 / zoom, excludedEdges);
    if (lineHit) {
      leitungsEntwurfAbschliessen(lineHit, { ...lineHit, type:'line' }, event.shiftKey || shiftPressed);
      return true;
    }
    const previous = letzterEntwurfsPunkt(draft);
    const alignment = objektAusrichtung(raw, [
        ...objektFangpunkte,
        ...(previous ? [{ ...previous, kind:'draft', priority:1000 }] : []),
      ], 10 / zoom, drawingConfig.grid_size);
    const point = event.shiftKey || shiftPressed
      ? auf45GradFangen(previous, alignment.point, drawingConfig.grid_size)
      : orthogonalerSegmentfang(previous, alignment.point, drawingConfig.grid_size);
    const next = { ...draft, points:[...(draft.points || []), point] };
    leitungsEntwurfRef.current = next;
    setLeitungsEntwurf(next);
    return true;
  }, [activeLayer, drawingConfig, getZoom, letzterEntwurfsPunkt, leitungsEntwurfAbschliessen, leitungsEntwurfStarten, naechsteLeitung, naechsterBauteilAnschluss, naechsterFreierLeitungsEndpunkt, objektFangpunkte, screenToFlowPosition, shiftPressed]);

  const cadHandlePointerDown = useCallback((event) => {
    const handle = event.target?.closest?.('.react-flow__handle');
    if (!handle) return;
    const nodeId = handle.dataset.nodeid;
    const handleId = handle.dataset.handleid;
    const node = nodesRef.current.find(item => item.id === nodeId);
    if (!nodeId || node?.type === 'junction') return;
    const draft = leitungsEntwurfRef.current;
    const layer = draft
      ? LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer
      : activeLayer;
    if (layer.role === 'vl' && handleId?.startsWith('rl')) return;
    if (layer.role === 'rl' && handleId?.startsWith('vl')) return;
    const point = handlePosition(nodeId, handleId);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    if (!draft) {
      leitungsEntwurfStarten(point, { nodeId, handleId });
      return;
    }
    leitungsEntwurfAbschliessen(point, {
      x:point.x,
      y:point.y,
      type:'port',
      nodeId,
      handleId,
      handlePosition:handleAusrichtung(nodeId, handleId),
    }, event.shiftKey || shiftPressed);
  }, [activeLayer, handleAusrichtung, handlePosition, leitungsEntwurfAbschliessen, leitungsEntwurfStarten, shiftPressed]);

  const cadCursorAktualisieren = useCallback((event) => {
    const draft = leitungsEntwurfRef.current;
    if (!draft) return;
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    if (leitungsCursorFrame.current) cancelAnimationFrame(leitungsCursorFrame.current);
    leitungsCursorFrame.current = requestAnimationFrame(() => {
      const layer = LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer;
      const zoom = Math.max(getZoom(), 0.2);
      const portHit = naechsterBauteilAnschluss(raw, null, layer.role, 28 / zoom);
      if (portHit) {
        leitungsCursorRef.current = portHit.position;
        setLeitungsCursor(portHit.position);
        setLeitungsSnap({ ...portHit, ...portHit.position, type:'port' });
        const previous = letzterEntwurfsPunkt(draft);
        const corner = orthogonalerAnschlussEckpunkt(previous, portHit.position, portHit.handlePosition);
        setLeitungsGuides(corner ? [{
          x1:portHit.position.x,
          y1:portHit.position.y,
          x2:corner.x,
          y2:corner.y,
          snapType:'handle',
        }] : []);
        return;
      }
      const endpointHit = naechsterFreierLeitungsEndpunkt(raw, layer.id, 16 / zoom, draft.extendEdgeId);
      if (endpointHit) {
        leitungsCursorRef.current = endpointHit.position;
        setLeitungsCursor(endpointHit.position);
        setLeitungsSnap({ ...endpointHit, ...endpointHit.position, type:'port' });
        setLeitungsGuides([]);
        return;
      }
      const excludedEdges = draft.extendEdgeId ? new Set([draft.extendEdgeId]) : new Set();
      const lineHit = naechsteLeitung(raw, layer.id, 22 / zoom, excludedEdges);
      if (lineHit) {
        leitungsCursorRef.current = { x:lineHit.x, y:lineHit.y };
        setLeitungsCursor({ x:lineHit.x, y:lineHit.y });
        setLeitungsSnap({ ...lineHit, type:'line' });
        setLeitungsGuides([]);
        return;
      }
      const previous = letzterEntwurfsPunkt(draft);
      const alignment = objektAusrichtung(raw, [
          ...objektFangpunkte,
          ...(previous ? [{ ...previous, kind:'draft', priority:1000 }] : []),
        ], 10 / zoom, drawingConfig.grid_size);
      const point = event.shiftKey || shiftPressed
        ? auf45GradFangen(previous, alignment.point, drawingConfig.grid_size)
        : orthogonalerSegmentfang(previous, alignment.point, drawingConfig.grid_size);
      leitungsCursorRef.current = point;
      setLeitungsCursor(point);
      setLeitungsSnap(null);
      setLeitungsGuides(guidesAmPunkt(alignment.guides, point));
    });
  }, [activeLayer, drawingConfig.grid_size, getZoom, letzterEntwurfsPunkt, naechsteLeitung, naechsterBauteilAnschluss, naechsterFreierLeitungsEndpunkt, objektFangpunkte, screenToFlowPosition, shiftPressed]);

  const cadEntwurfRoute = (() => {
    if (!leitungsEntwurf) return [];
    const start = leitungsEntwurf.startEndpoint
      ? handlePosition(leitungsEntwurf.startEndpoint.nodeId, leitungsEntwurf.startEndpoint.handleId)
      : leitungsEntwurf.startPoint;
    const previous = leitungsEntwurf.points.at(-1) || start;
    const preview = leitungsSnap
      ? { x:leitungsSnap.x, y:leitungsSnap.y }
      : leitungsCursor
        ? leitungsCursor
        : null;
    const connectionCorner = leitungsSnap?.type === 'port'
      ? orthogonalerAnschlussEckpunkt(previous, preview, leitungsSnap.handlePosition)
      : null;
    if (!start || !preview) return [];
    const sourceSide = leitungsEntwurf.startEndpoint
      ? handleAusrichtung(leitungsEntwurf.startEndpoint.nodeId, leitungsEntwurf.startEndpoint.handleId)
      : null;
    const targetSide = leitungsSnap?.type === 'port' ? leitungsSnap.handlePosition : null;
    return adaptivePolyline(
      start,
      preview,
      [...leitungsEntwurf.points, ...(connectionCorner ? [connectionCorner] : [])],
      sourceSide,
      targetSide,
    );
  })();

  const punktHinzufuegen = useCallback((event, edgeId) => {
    event.preventDefault();
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    if (route.length < 2) return;
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    let best = null;
    for (let index = 0; index < route.length - 1; index += 1) {
      const hit = projektionAufSegment(raw, route[index], route[index + 1]);
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, segmentIndex:index };
    }
    if (!best) return;
    snap();
    setSelectedEdgeId(edgeId);
    setSelected(null);
    const basePoints = route.slice(1, -1);
    const origin = route[best.segmentIndex];
    const raster = rasterPunkt(best, drawingConfig.grid_size);
    const point = event.shiftKey
      ? auf45GradFangen(origin, best, drawingConfig.grid_size)
      : erlaubterLeitungswinkel(origin, raster)
        ? raster
        : orthogonalerSegmentfang(origin, best, drawingConfig.grid_size);
    basePoints.splice(best.segmentIndex, 0, point);
    setEdges(items => items.map(item => item.id === edgeId
      ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points:basePoints } }
      : item));
  }, [drawingConfig.grid_size, routePunkte, screenToFlowPosition, setEdges, snap]);

  const punktEntfernen = useCallback((edgeId, pointIndex) => {
    snap();
    setEdges(items => items.map(item => {
      if (item.id !== edgeId) return item;
      const points = routePunkte(item).slice(1, -1).filter((_, index) => index !== pointIndex);
      return { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } };
    }));
  }, [routePunkte, setEdges, snap]);

  const punktDragStart = useCallback((event, edgeId, pointIndex) => {
    event.preventDefault();
    snap();
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const points = routePunkte(edge).slice(1, -1);
    edgePointDrag.current = { edgeId, pointIndex, points };
    setEdges(items => items.map(item => item.id === edgeId
      ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } }
      : item));
  }, [routePunkte, setEdges, snap]);

  const segmentDragStart = useCallback((event, edgeId) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    if (route.length < 2) return;
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    let best = null;
    for (let index = 0; index < route.length - 1; index += 1) {
      const hit = projektionAufSegment(raw, route[index], route[index + 1]);
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, segmentIndex:index };
    }
    if (!best) return;
    event.preventDefault();
    snap();

    // Beide Enden des verschobenen Segments müssen Stützpunkte sein. Liegt
    // ein Segment direkt an einem Bauteil, wird am festen Anschluss unbemerkt
    // ein zusätzlicher Eckpunkt eingefügt. So bleibt der Fangpunkt verbunden.
    const workingRoute = route.map(point => ({ ...point }));
    let startIndex = best.segmentIndex;
    let endIndex = startIndex + 1;
    if (startIndex === 0) {
      workingRoute.splice(1, 0, { ...workingRoute[0] });
      startIndex = 1;
      endIndex = 2;
    }
    if (endIndex === workingRoute.length - 1) {
      workingRoute.splice(endIndex, 0, { ...workingRoute.at(-1) });
    }
    const a = workingRoute[startIndex];
    const b = workingRoute[endIndex];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const orientation = Math.abs(dy) > Math.abs(dx) * 1.5
      ? 'vertical'
      : Math.abs(dx) > Math.abs(dy) * 1.5 ? 'horizontal' : 'diagonal';
    edgeSegmentDrag.current = {
      edgeId,
      pointer:raw,
      points:workingRoute.slice(1, -1),
      pointIndexes:[startIndex - 1, endIndex - 1],
      orientation,
      direction:{ x:dx, y:dy },
    };
  }, [routePunkte, screenToFlowPosition, snap]);

  useEffect(() => {
    const move = (event) => {
      const drag = edgeSegmentDrag.current;
      if (!drag) return;
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      let moveX = raw.x - drag.pointer.x;
      let moveY = raw.y - drag.pointer.y;
      if (drag.orientation === 'vertical') {
        moveX = Math.round(moveX / drawingConfig.grid_size) * drawingConfig.grid_size;
        moveY = 0;
      } else if (drag.orientation === 'horizontal') {
        moveX = 0;
        moveY = Math.round(moveY / drawingConfig.grid_size) * drawingConfig.grid_size;
      } else {
        const length = Math.hypot(drag.direction.x, drag.direction.y) || 1;
        const nx = -drag.direction.y / length;
        const ny = drag.direction.x / length;
        const distance = Math.round((moveX * nx + moveY * ny) / drawingConfig.grid_size) * drawingConfig.grid_size;
        moveX = nx * distance;
        moveY = ny * distance;
      }
      const nextPoints = drag.points.map((point, index) => drag.pointIndexes.includes(index)
        ? { x:point.x + moveX, y:point.y + moveY }
        : point);
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setEdges(items => items.map(item => item.id === drag.edgeId
          ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points:nextPoints } }
          : item));
      });
    };
    const up = () => { edgeSegmentDrag.current = null; };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drawingConfig.grid_size, screenToFlowPosition, setEdges]);

  useEffect(() => {
    const move = (event) => {
      const drag = edgePointDrag.current;
      if (!drag) return;
      const edge = edgesRef.current.find(item => item.id === drag.edgeId);
      if (!edge) return;
      const points = drag.points || [];
      const origin = drag.pointIndex > 0
        ? points[drag.pointIndex - 1]
        : handlePosition(edge.source, edge.sourceHandle);
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      const point = event.shiftKey
        ? auf45GradFangen(origin, raw, drawingConfig.grid_size)
        : orthogonalerSegmentfang(origin, raw, drawingConfig.grid_size);
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setEdges(items => items.map(item => {
          if (item.id !== drag.edgeId) return item;
          const next = [...points];
          next[drag.pointIndex] = point;
          drag.points = next;
          return { ...item, data:{ ...(item.data || {}), points:next } };
        }));
      });
    };
    const up = () => { edgePointDrag.current = null; };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
    };
  }, [drawingConfig.grid_size, handlePosition, screenToFlowPosition, setEdges]);

  const endpointDragStart = useCallback((event, edgeId, side) => {
    event.preventDefault();
    event.stopPropagation();
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    if (route.length < 2) return;
    snap();
    const endpointNodeId = side === 'source' ? edge.source : edge.target;
    const endpointNode = nodesRef.current.find(node => node.id === endpointNodeId);
    const incidentCount = edgesRef.current.filter(item => item.source === endpointNodeId || item.target === endpointNodeId).length;
    const point = side === 'source' ? route[0] : route.at(-1);
    const otherPoint = side === 'source' ? route.at(-1) : route[0];
    const layer = layerVonEdge(edge);
    let anchorId = endpointNode?.type === 'junction' && endpointNode.data?.cad_anchor && incidentCount === 1
      ? endpointNode.id
      : null;

    if (!anchorId) {
      anchorId = newId();
      setNodes(items => [...items, cadAnker(anchorId, point, layer)]);
      setEdges(items => items.map(item => {
        if (item.id !== edgeId) return item;
        return side === 'source'
          ? { ...item, source:anchorId, sourceHandle:'center-source' }
          : { ...item, target:anchorId, targetHandle:'center-target' };
      }));
    }
    edgeEndpointDrag.current = { edgeId, side, anchorId, layerId:layer.id, role:layer.role, otherPoint };
    setSelectedEdgeId(edgeId);
    setSelected(null);
  }, [cadAnker, routePunkte, setEdges, setNodes, snap]);

  const endpointContextMenu = useCallback((event, edgeId, side) => {
    setSelectedEdgeId(edgeId);
    setSelected(null);
    setEdgeMenu(null);
    setEndpointMenu({ x:event.clientX, y:event.clientY, edgeId, side });
  }, []);

  const edgeContextMenu = useCallback((event, edgeId) => {
    setEndpointMenu(null);
    setSelectedEdgeId(edgeId);
    setSelected(null);
    setEdgeMenu({
      x:event.clientX,
      y:event.clientY,
      edgeId,
      point:screenToFlowPosition({ x:event.clientX, y:event.clientY }),
    });
  }, [screenToFlowPosition]);

  useEffect(() => {
    const punktFuerEvent = (event, drag) => {
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      return event.shiftKey
        ? auf45GradFangen(drag.otherPoint, raw, drawingConfig.grid_size)
        : orthogonalerSegmentfang(drag.otherPoint, raw, drawingConfig.grid_size);
    };
    const move = (event) => {
      const drag = edgeEndpointDrag.current;
      if (!drag) return;
      const point = punktFuerEvent(event, drag);
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setNodes(items => items.map(node => node.id === drag.anchorId ? { ...node, position:point } : node));
      });
    };
    const up = (event) => {
      const drag = edgeEndpointDrag.current;
      if (!drag) return;
      edgeEndpointDrag.current = null;
      const point = punktFuerEvent(event, drag);
      const zoom = Math.max(getZoom(), 0.2);
      const portHit = naechsterBauteilAnschluss(point, drag.anchorId, drag.role, 28 / zoom);
      if (portHit) {
        setEdges(items => items.map(edge => {
          if (edge.id !== drag.edgeId) return edge;
          const otherNodeId = drag.side === 'source' ? edge.target : edge.source;
          const otherNode = nodesRef.current.find(node => node.id === otherNodeId);
          const otherDegree = edgesRef.current.filter(item => item.source === otherNodeId || item.target === otherNodeId).length;
          const nextEdge = drag.side === 'source'
            ? { ...edge, source:portHit.nodeId, sourceHandle:portHit.handleId }
            : { ...edge, target:portHit.nodeId, targetHandle:portHit.handleId };
          return edge.data?.auto_paired
            ? { ...nextEdge, data:{ ...(nextEdge.data || {}), auto_pair_open:otherNode?.type === 'junction' && otherDegree <= 1 } }
            : nextEdge;
        }));
        setNodes(items => items.filter(node => node.id !== drag.anchorId));
        return;
      }
      const lineHit = naechsteLeitung(point, drag.layerId, 22 / zoom, new Set([drag.edgeId]));
      if (lineHit) {
        const [first, second] = leitungTeilen(lineHit, drag.anchorId, drag.layerId);
        setNodes(items => items.map(node => node.id === drag.anchorId
          ? { ...node, position:{ x:lineHit.x, y:lineHit.y } }
          : node));
        setEdges(items => {
          const draggedEdge = items.find(edge => edge.id === drag.edgeId);
          const otherNodeId = drag.side === 'source' ? draggedEdge?.target : draggedEdge?.source;
          const otherNode = nodesRef.current.find(node => node.id === otherNodeId);
          const otherDegree = items.filter(edge => edge.source === otherNodeId || edge.target === otherNodeId).length;
          const base = items
            .filter(edge => edge.id !== lineHit.edge.id)
            .map(edge => edge.id === drag.edgeId && edge.data?.auto_paired
              ? { ...edge, data:{ ...(edge.data || {}), auto_pair_open:otherNode?.type === 'junction' && otherDegree <= 1 } }
              : edge);
          return [...base, first, second];
        });
        return;
      }
      setNodes(items => items.map(node => node.id === drag.anchorId ? { ...node, position:point } : node));
    };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drawingConfig.grid_size, getZoom, leitungTeilen, naechsteLeitung, naechsterBauteilAnschluss, screenToFlowPosition, setEdges, setNodes]);

  // Keyboard-Shortcuts: Zeichenwerkzeuge sind konfigurierbar; V/R wechseln
  // weiterhin schnell den Heizungs-Layer, D dreht ein Bauteil.
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
        const key = ev.key.toLowerCase();
        if (key === drawingConfig.shortcut_line || key === drawingConfig.shortcut_polyline) {
          ev.preventDefault();
          setSelected(null);
          setSelectedEdgeId(null);
          setEndpointMenu(null);
          return;
        }
        if (ev.key === 'Escape' && spiegelAchse) {
          setSpiegelAchse(null);
          return;
        }
        if (ev.key === 'Escape' && (endpointMenu || edgeMenu)) {
          setEndpointMenu(null);
          setEdgeMenu(null);
          return;
        }
        if (ev.key === 'Escape' && leitungsEntwurfRef.current) {
          leitungsEntwurfRef.current = null;
          leitungsCursorRef.current = null;
          setLeitungsEntwurf(null);
          setLeitungsCursor(null);
          setLeitungsSnap(null);
          setLeitungsGuides([]);
          return;
        }
        if (ev.key === 'Enter' && leitungsEntwurfRef.current && leitungsCursorRef.current) {
          ev.preventDefault();
          leitungsEntwurfAbschliessen(leitungsCursorRef.current, leitungsSnap, ev.shiftKey || shiftPressed);
          return;
        }
        if (ev.key === 'Backspace' && leitungsEntwurfRef.current?.points?.length) {
          ev.preventDefault();
          const next = {
            ...leitungsEntwurfRef.current,
            points:leitungsEntwurfRef.current.points.slice(0, -1),
          };
          leitungsEntwurfRef.current = next;
          setLeitungsEntwurf(next);
          return;
        }
        if (ev.key === 'v' || ev.key === 'V') layerWaehlen('heizung_vl');
        if (ev.key === 'r' || ev.key === 'R') layerWaehlen('heizung_rl');
        if (ev.key === 'b' || ev.key === 'B') layerWaehlen('neutral');
        if (ev.key === 'd' || ev.key === 'D') { if (selected && ROTATABLE.has(selected.type)) rotateNode(selected.id); }
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          if (selected) { snap(); deleteNodeRef.current?.(selected.id); }
          else if (selectedEdgeId) { deleteEdgeRef.current?.(selectedEdgeId); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, selected, selectedEdgeId, snap, rotateNode, layerWaehlen, leitungsEntwurfAbschliessen, leitungsSnap, shiftPressed, endpointMenu, edgeMenu, spiegelAchse, drawingConfig, setNodes]);

  // Berechnete Werte (Backend) in die Node-Daten spiegeln — nur für die Anzeige.
  // Verteiler-Rahmen: nur die Balken sind greifbar (dragHandle), die Lücke
  // dazwischen lässt Klicks durch (pointerEvents none) und liegt hinter den
  // Strängen (zIndex -10) — so lassen sich Gruppen zwischen die Balken stellen.
  const displayNodes = useMemo(() => nodes.map(n => {
    if (n.type === 'junction') {
      return {
        ...n,
        selectable:false,
        draggable:false,
        style:{ ...(n.style || {}), width:1, height:1, opacity:0, pointerEvents:'none' },
        data:{ ...(n.data || {}), cad_anchor:true },
      };
    }
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
        } else if (n.type === 'speicher') {
          werte = d.speicher_liter ? `${d.speicher_liter} L` : '—';
        } else if (n.type === 'erdsonden') {
          const anzahl = Math.max(1, Math.min(24, parseInt(d.sonden_anzahl) || 5));
          const laenge = parseFloat(d.sonden_laenge_m);
          werte = `${anzahl} Duplex-Erdsonden${Number.isFinite(laenge) && laenge > 0
            ? ` à ${laenge} m · ${Math.round(anzahl * laenge).toLocaleString('de-CH')} m total`
            : ''}`;
        }
        return { nr: d.nr, bauteil: TITLES[n.type] || n.type, bez: d.label || '', werte };
      });
  }, [nodes, gruppeResults, verteilerResults, nodeFlows, ventilResults, pumpenResults, expansionResults]);

  const junctionDegrees = useMemo(() => {
    const degrees = new Map();
    edges.forEach(edge => {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });
    return degrees;
  }, [edges]);

  // Edges: VL durchgezogen, RL gestrichelt, V' als Label
  const displayEdges = useMemo(() => {
    void nodeGeometryVersion;
    return edges.map(edge => {
    const layer = layerVonEdge(edge);
    const color = layer.color;
    const effectiveRoute = routePunkte(edge);
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
      selected:selectedEdgeId === edge.id,
      hidden: layerVisibility[layer.id] === false,
      data: {
        ...(edge.data || {}),
        cad_polyline:true,
        _routePoints:effectiveRoute.slice(1, -1),
        _groupSelected:markierteEdgeIds.includes(edge.id),
        _layerRole:layer.role,
        _dashed:layer.dashed,
        _onAddPoint:punktHinzufuegen,
        _onRemovePoint:punktEntfernen,
        _onPointPointerDown:punktDragStart,
        _onSegmentPointerDown:segmentDragStart,
        _onEndpointPointerDown:endpointDragStart,
        _onEndpointContextMenu:endpointContextMenu,
        _onContextMenu:edgeContextMenu,
        _sourceJunctionDegree:nodesRef.current.some(node => node.id === edge.source && node.type === 'junction') ? junctionDegrees.get(edge.source) || 0 : 0,
        _targetJunctionDegree:nodesRef.current.some(node => node.id === edge.target && node.type === 'junction') ? junctionDegrees.get(edge.target) || 0 : 0,
      },
      label,
      labelStyle:   { fontSize:9, fill:'#1e293b', fontFamily:'monospace', fontWeight:600 },
      labelBgStyle: { fill:'rgba(255,255,255,0.9)', borderRadius:3 },
      labelBgPadding: [3,5],
      style: { ...edge.style, stroke:color },
      };
    });
  }, [edges, edgeContextMenu, edgeFlows, endpointContextMenu, endpointDragStart, junctionDegrees, layerVisibility, leitungResults, markierteEdgeIds, nodeGeometryVersion, punktDragStart, punktEntfernen, punktHinzufuegen, routePunkte, segmentDragStart, selectedEdgeId]);

  const loadSchema = (key) => {
    const s = SCHALTUNGEN[key];
    setNodes(s.nodes.map(n=>({...n})));
    setEdges(s.edges.map(e=>({
      ...e,
      data:{ ...(e.data || {}), cad_polyline:true, polyline_version:1, corner_radius:drawingConfig.corner_radius },
    })));
    setSelected(null);
  };

  const downloadPdf = async (inhalt) => {
    if (!schemaId) return;
    const alterViewport = getViewport();
    const alteAuswahl = selected;
    const alteKante = selectedEdgeId;
    const alteMarkierung = markierteEdgeIds;
    let flowElement = null;
    try {
      let schemaPng = null;
      if (inhalt === 'schema' || inhalt === 'beides') {
        setSelected(null);
        setSelectedEdgeId(null);
        setMarkierteEdgeIds([]);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await fitView({ padding:0.06, duration:0, minZoom:0.1, maxZoom:1.5 });
        await new Promise(resolve => requestAnimationFrame(resolve));
        flowElement = document.querySelector('.hc-hydraulik-flow');
        if (!flowElement) throw new Error('Zeichenfläche nicht gefunden');
        flowElement.classList.add('hc-pdf-capture');
        const { toPng } = await import('html-to-image');
        schemaPng = await toPng(flowElement, {
          pixelRatio:2,
          backgroundColor:'#f8fafc',
          cacheBust:true,
          width:flowElement.clientWidth,
          height:flowElement.clientHeight,
        });
      }
      const graph = graphFuerSpeicherung(
        nodes,
        edges,
        { active_layer_id:activeLayerId, visibility:layerVisibility },
        drawingConfig,
      );
      const res = await api.post(`/api/v1/schemas/${schemaId}/pdf`, {
        inhalt,
        graph,
        schema_png:schemaPng,
      }, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      console.error('PDF-Export fehlgeschlagen', error);
      alert('PDF konnte nicht geladen werden.');
    } finally {
      flowElement?.classList.remove('hc-pdf-capture');
      setViewport(alterViewport, { duration:0 });
      setSelected(alteAuswahl);
      setSelectedEdgeId(alteKante);
      setMarkierteEdgeIds(alteMarkierung);
    }
  };

  const onConnect = useCallback((params) => {
    snap();
    const startPoint = handlePosition(params.source, params.sourceHandle);
    const endPoint = handlePosition(params.target, params.targetHandle);
    const sourceSide = handleAusrichtung(params.source, params.sourceHandle);
    const targetSide = handleAusrichtung(params.target, params.targetHandle);
    let edge = {
      ...params, id:newId(), type:'flow',
      data:{
        ...(params.data || {}),
        layer_id:activeLayer.id,
        cad_polyline:true,
        polyline_version:1,
        corner_radius:drawingConfig.corner_radius,
        points:adaptivePolyline(startPoint, endPoint, [], sourceSide, targetSide).slice(1, -1),
      },
      style:{ stroke:activeLayer.color, strokeWidth:2.5 },
    };
    const returnPair = ruecklaufPaarErstellen(edge, startPoint, endPoint);
    if (returnPair) edge = returnPair.primaryEdge;
    const exists = edgesRef.current.some(item => item.source === params.source
      && item.target === params.target
      && item.sourceHandle === params.sourceHandle
      && item.targetHandle === params.targetHandle);
    if (exists) return;
    if (returnPair?.createdNodes.length) setNodes(nodesNow => [...nodesNow, ...returnPair.createdNodes]);
    setEdges(items => [...items, edge, ...(returnPair ? [returnPair.returnEdge] : [])]);
  }, [activeLayer, drawingConfig.corner_radius, handleAusrichtung, handlePosition, ruecklaufPaarErstellen, setEdges, setNodes, snap]);

  const onConnectStart = useCallback((_, params) => { connectStart.current = params; }, []);

  // Bestehende React-Flow-Schnellverbindung bleibt erhalten. Wird im Leeren
  // losgelassen, entsteht nur ein unsichtbarer CAD-Anker – kein Junction-Bauteil.
  const onConnectEnd = useCallback((event) => {
    const cs = connectStart.current; connectStart.current = null;
    if (!cs?.nodeId) return;
    if (event.target?.closest?.('.react-flow__handle')) return;  // auf einem Bauteil gelandet → onConnect
    const { clientX, clientY } = event.changedTouches ? event.changedTouches[0] : event;
    const raw = screenToFlowPosition({ x: clientX, y: clientY });
    const origin = handlePosition(cs.nodeId, cs.handleId);
    const p = event.shiftKey
      ? auf45GradFangen(origin, raw, drawingConfig.grid_size)
      : orthogonalerSegmentfang(origin, raw, drawingConfig.grid_size);
    const jid = newId();
    snap();
    const vonQuelle = cs.handleType !== 'target';
    const hit = naechsteLeitung(p, activeLayer.id, 22 / Math.max(getZoom(), 0.2));
    const junctionPoint = hit ? { x:hit.x, y:hit.y } : p;

    let branch = {
      id:newId(),
      source:vonQuelle ? cs.nodeId : jid,
      sourceHandle:vonQuelle ? cs.handleId : 'center-source',
      target:vonQuelle ? jid : cs.nodeId,
      targetHandle:vonQuelle ? 'center-target' : cs.handleId,
      type:'flow',
      data:{
        layer_id:activeLayer.id,
        cad_polyline:true,
        polyline_version:1,
        corner_radius:drawingConfig.corner_radius,
        points:adaptivePolyline(
          vonQuelle ? origin : junctionPoint,
          vonQuelle ? junctionPoint : origin,
          [],
          vonQuelle ? handleAusrichtung(cs.nodeId, cs.handleId) : null,
          vonQuelle ? null : handleAusrichtung(cs.nodeId, cs.handleId),
        ).slice(1, -1),
      },
      style:{ stroke:activeLayer.color, strokeWidth:4.5 },
    };
    const startPoint = vonQuelle ? origin : junctionPoint;
    const endPoint = vonQuelle ? junctionPoint : origin;
    const returnPair = ruecklaufPaarErstellen(branch, startPoint, endPoint);
    if (returnPair) branch = returnPair.primaryEdge;
    setNodes(items => [
      ...items,
      cadAnker(jid, junctionPoint, activeLayer),
      ...(returnPair?.createdNodes || []),
    ]);
    const pairedEdges = returnPair ? [returnPair.returnEdge] : [];

    if (!hit) {
      setEdges(items => [...items, branch, ...pairedEdges]);
      return;
    }

    // Bewusstes Ablegen des Leitungsendes auf einer Leitung erzeugt ein echtes
    // T-Stück. Die bestehende Leitung wird topologisch in zwei Teile geteilt;
    // eine reine optische Kreuzung bleibt dagegen weiterhin unverbunden.
    const [first, second] = leitungTeilen(hit, jid, activeLayer.id);
    setEdges(es => [...es.filter(edge => edge.id !== hit.edge.id), first, second, branch, ...pairedEdges]);
    setSelectedEdgeId(null);
  }, [activeLayer, cadAnker, drawingConfig.corner_radius, drawingConfig.grid_size, getZoom, handleAusrichtung, handlePosition, leitungTeilen, naechsteLeitung, ruecklaufPaarErstellen, screenToFlowPosition, setNodes, setEdges, snap]);

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback(e => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    snap();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const p = STD_PALETTE.find(p => p.type === raw);
    const id = newId();
    const lineHit = raw === 'pump' ? naechsteSichtbareLeitung(pos, 30 / Math.max(getZoom(), 0.2)) : null;
    const nodePosition = lineHit ? { x:lineHit.x - 20, y:lineHit.y - 20 } : pos;
    setNodes(ns => {
      const extra = raw === 'verteiler' ? { abgaenge: 4 }
        : raw === 'erdsonden' ? { sonden_anzahl: 5, sonden_laenge_m: 180 }
        : raw === 'gruppe' ? { schaltung: 'einspritz' }
        : raw === 'anschluss' ? { buchstabe: naechsterBuchstabe(ns) }
        : {};
      return [...ns, {
        id, type: raw, position: nodePosition,
        data: { label: p?.label || raw, ...extra, ...(NUMMERIERT.includes(raw) ? { nr: naechsteNr(ns) } : {}) },
      }];
    });
    if (lineHit) {
      const host = lineHit.edge;
      const a = lineHit.route[lineHit.segmentIndex];
      const b = lineHit.route[lineHit.segmentIndex + 1];
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const forward = horizontal ? b.x >= a.x : b.y >= a.y;
      const entryHandle = horizontal ? (forward ? 'left' : 'right') : (forward ? 'top' : 'bottom');
      const exitHandle = horizontal ? (forward ? 'right' : 'left') : (forward ? 'bottom' : 'top');
      const beforePoints = lineHit.route.slice(1, lineHit.segmentIndex + 1);
      const afterPoints = lineHit.route.slice(lineHit.segmentIndex + 1, -1);
      const beforeRoute = [lineHit.route[0], ...beforePoints, { x:lineHit.x, y:lineHit.y }];
      const afterRoute = [{ x:lineHit.x, y:lineHit.y }, ...afterPoints, lineHit.route.at(-1)];
      const geometryTotal = streckenLaenge(beforeRoute) + streckenLaenge(afterRoute);
      const oldLength = Number.parseFloat(host.data?.laenge_m);
      const dataFor = (points, share) => {
        const data = {
          ...(host.data || {}),
          cad_polyline:true,
          points,
          ...(Number.isFinite(oldLength) ? { laenge_m:Number((oldLength * share).toFixed(2)) } : {}),
        };
        delete data.paired_edge_id;
        delete data.auto_paired;
        delete data.auto_pair_open;
        return data;
      };
      const firstShare = geometryTotal ? streckenLaenge(beforeRoute) / geometryTotal : 0.5;
      const first = {
        ...host,
        target:id,
        targetHandle:entryHandle,
        data:dataFor(beforePoints, firstShare),
        selected:false,
      };
      const second = {
        ...host,
        id:newId(),
        source:id,
        sourceHandle:exitHandle,
        data:dataFor(afterPoints, 1 - firstShare),
        selected:false,
      };
      setEdges(items => {
        const cleaned = items
          .filter(edge => edge.id !== host.id)
          .map(edge => {
            if (edge.data?.paired_edge_id !== host.id) return edge;
            const data = { ...edge.data };
            delete data.paired_edge_id;
            return { ...edge, data };
          });
        return [...cleaned, first, second];
      });
    }
    // Verbrauchergruppe: direkt nach dem Ablegen die Schaltung wählen
    if (raw === 'gruppe') setSchaltungswahl({ nodeId: id, x: e.clientX, y: e.clientY });
  }, [getZoom, naechsteSichtbareLeitung, screenToFlowPosition, setEdges, setNodes, snap]);

  const onNodeClick = useCallback((event, node) => {
    if (leitungsEntwurfRef.current) { cadKlick(event, true); return; }
    setEndpointMenu(null);
    setSelected(node);
    setSelectedEdgeId(null);
    setInspectorOpen(true);
  }, [cadKlick]);
  const onNodeDoubleClick = useCallback((_, node) => { if (!leitungsEntwurfRef.current) setAuslegung(node); }, []);
  const onEdgeClick = useCallback((event, edge) => {
    if (leitungsEntwurfRef.current) { cadKlick(event); return; }
    setEndpointMenu(null);
    setEdgeMenu(null);
    setMarkierteEdgeIds([]);
    setSelectedEdgeId(edge.id);
    setSelected(null);
    setInspectorOpen(true);
  }, [cadKlick]);

  const spiegelKopieErstellen = useCallback((edgeId, axisStart, axisEnd) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    if (route.length < 2) return;
    const gespiegelt = route.map(point => punktAnAchseSpiegeln(point, axisStart, axisEnd));
    const layer = layerVonEdge(edge);
    const sourceId = newId();
    const targetId = newId();
    const id = newId();
    const data = {
      ...(edge.data || {}),
      cad_polyline:true,
      polyline_version:1,
      points:gespiegelt.slice(1, -1),
    };
    delete data.paired_edge_id;
    delete data.auto_paired;
    delete data.auto_pair_open;
    snap();
    setNodes(items => [
      ...items,
      cadAnker(sourceId, gespiegelt[0], layer),
      cadAnker(targetId, gespiegelt.at(-1), layer),
    ]);
    setEdges(items => [...items, {
      ...edge,
      id,
      source:sourceId,
      sourceHandle:'center-source',
      target:targetId,
      targetHandle:'center-target',
      selected:false,
      data,
    }]);
    setSelectedEdgeId(id);
    setMarkierteEdgeIds([]);
  }, [cadAnker, routePunkte, setEdges, setNodes, snap]);

  const onPaneClick = useCallback((event) => {
    if (spiegelAchse) {
      event.preventDefault();
      const point = rasterPunkt(screenToFlowPosition({ x:event.clientX, y:event.clientY }), drawingConfig.grid_size);
      if (!spiegelAchse.start) {
        setSpiegelAchse({ ...spiegelAchse, start:point, cursor:point });
      } else if (Math.hypot(point.x - spiegelAchse.start.x, point.y - spiegelAchse.start.y) > 2) {
        spiegelKopieErstellen(spiegelAchse.edgeId, spiegelAchse.start, point);
        setSpiegelAchse(null);
      }
      return;
    }
    if (leitungsEntwurfRef.current) { cadKlick(event); return; }
    setEndpointMenu(null);
    setEdgeMenu(null);
    if (!selected && !selectedEdgeId) {
      cadKlick(event);
      return;
    }
    setSelected(null);
    setSelectedEdgeId(null);
    setMarkierteEdgeIds([]);
  }, [cadKlick, drawingConfig.grid_size, screenToFlowPosition, selected, selectedEdgeId, spiegelAchse, spiegelKopieErstellen]);

  const canvasMouseMove = useCallback((event) => {
    if (spiegelAchse?.start) {
      const cursor = rasterPunkt(screenToFlowPosition({ x:event.clientX, y:event.clientY }), drawingConfig.grid_size);
      setSpiegelAchse(current => current ? { ...current, cursor } : current);
    }
    cadCursorAktualisieren(event);
  }, [cadCursorAktualisieren, drawingConfig.grid_size, screenToFlowPosition, spiegelAchse?.start]);
  const onPaneContextMenu = useCallback((event) => {
    if (!leitungsEntwurfRef.current) return;
    event.preventDefault();
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    leitungsEntwurfAbschliessen(raw, leitungsSnap, event.shiftKey || shiftPressed);
  }, [leitungsEntwurfAbschliessen, leitungsSnap, screenToFlowPosition, shiftPressed]);
  const selectedNode  = selected  ? nodes.find(n => n.id === selected.id)  || null : null;
  const selectedEdge  = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) || null : null;
  const auslegungNode = auslegung ? nodes.find(n => n.id === auslegung.id) || null : null;

  const updateNode = (id, key, val) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: val } } : n));
    if (key === 'sonden_anzahl') setTimeout(() => updateNodeInternals(id), 0);
  };

  const updateEdgeData = (id, key, val) =>
    setEdges(es => es.map(e => e.id === id ? { ...e, data: { ...e.data, [key]: val } } : e));

  const updateEdgeLayer = (id, layerId) => {
    const layer = LEITUNGS_LAYER.find(item => item.id === layerId);
    if (!layer) return;
    snap();
    setEdges(es => es.map(edge => edge.id === id
      ? { ...edge, data:{ ...(edge.data || {}), layer_id:layer.id }, style:{ ...(edge.style || {}), stroke:layer.color } }
      : edge));
    setLayerVisibility(current => ({ ...current, [layer.id]:true }));
  };

  const deleteEdge = (id) => {
    snap();
    const remaining = edgesRef.current
      .filter(edge => edge.id !== id)
      .map(edge => {
        if (edge.data?.paired_edge_id !== id) return edge;
        const data = { ...edge.data };
        delete data.paired_edge_id;
        return { ...edge, data };
      });
    const usedNodes = new Set(remaining.flatMap(edge => [edge.source, edge.target]));
    setEdges(remaining);
    setNodes(items => items.filter(node => node.type !== 'junction' || usedNodes.has(node.id)));
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
    const remaining = edgesRef.current.filter(edge => edge.source !== id && edge.target !== id);
    const usedNodes = new Set(remaining.flatMap(edge => [edge.source, edge.target]));
    setNodes(ns => ns.filter(node => node.id !== id && (node.type !== 'junction' || usedNodes.has(node.id))));
    setEdges(remaining);
    setSelected(null);
  };
  deleteEdgeRef.current = deleteEdge;
  deleteNodeRef.current = deleteNode;

  const saveLabel = !loaded
    ? 'Wird geladen'
    : saveState === 'error'
      ? 'Nicht gespeichert'
      : saveState === 'saving'
        ? 'Speichert …'
        : 'Gespeichert';

  return (
    <div className="hc-editor-shell">
      <header className="hc-editor-header">
        <div className="hc-editor-header__identity">
          <Link to={`/projekte/${projectId}`} className="hc-icon-button hc-back-button" title="Zurück zum Projekt">
            <ArrowLeft size={18} />
          </Link>
          <div className="hc-editor-title">
            <div className="hc-editor-title__eyebrow">{projectName || 'Projekt'} · Anlagenschema</div>
            <input value={schemaName} onChange={e=>setSchemaName(e.target.value)} aria-label="Schemaname"
              className="hc-editor-title__input" />
          </div>
        </div>

        <div className={`hc-save-state is-${!loaded ? 'loading' : saveState}`} title={saveLabel}>
          <span className="hc-save-state__dot" />
          <span>{saveLabel}</span>
        </div>

        <div className="hc-editor-header__actions">
          <button onClick={undo} className="hc-icon-button" title="Rückgängig (⌘/Ctrl + Z)">
            <Undo2 size={17} />
          </button>
          <ToolbarMenu label="Exportieren" icon={Download} primary align="right">
            {[['schema','Schema als PDF'],['berechnungen','Berechnungen als PDF'],['beides','Schema + Berechnungen']].map(([key,text])=>(
              <button key={key} disabled={!schemaId} onClick={event=>{ downloadPdf(key); closeToolbarMenu(event); }}
                style={{ ...menuActionStyle, opacity:schemaId?1:.45 }}>
                <Download size={14} /> {text}
              </button>
            ))}
          </ToolbarMenu>
        </div>
      </header>

      <nav className="hc-editor-toolbar" aria-label="Schema-Werkzeuge">
        <div className={`hc-drawing-state${leitungsEntwurf ? ' is-active' : ''}`}
          title="Bauteil auswählen oder auf Fangpunkt beziehungsweise freie Fläche klicken">
          <span className="hc-drawing-state__icon">{leitungsEntwurf ? '⌁' : <Check size={13} />}</span>
          <span>{leitungsEntwurf ? 'Leitung wird gezeichnet' : 'Direktes Zeichnen aktiv'}</span>
        </div>

        <ToolbarMenu label="Vorlagen" icon={LayoutTemplate}>
          {Object.entries(SCHALTUNGEN).map(([key, schema])=>(
            <button key={key} onClick={event=>{ loadSchema(key); closeToolbarMenu(event); }} style={menuActionStyle}>
              <LayoutTemplate size={14} /> {schema.name}
            </button>
          ))}
        </ToolbarMenu>

        <ToolbarMenu label="Zeichnen" icon={Settings2}>
          <div style={{ width:270, padding:6 }}>
            <label style={{ display:'grid', gridTemplateColumns:'88px 1fr 42px', alignItems:'center', gap:7, marginBottom:10, fontSize:10, color:'#475569' }}>
              Bogenradius
              <input type="range" min="0" max="40" step="1" value={drawingConfig.corner_radius} onChange={event=>drawingConfigAktualisieren('corner_radius', event.target.value)} />
              <input type="number" min="0" max="40" value={drawingConfig.corner_radius} onChange={event=>drawingConfigAktualisieren('corner_radius', event.target.value)} style={{ width:42, border:'1px solid #cbd5e1', borderRadius:5, padding:3, fontSize:10 }}/>
            </label>
            <label style={{ display:'grid', gridTemplateColumns:'88px 1fr', alignItems:'center', gap:7, marginBottom:10, fontSize:10, color:'#475569' }}>
              Raster
              <select value={drawingConfig.grid_size} onChange={event=>drawingConfigAktualisieren('grid_size', event.target.value)} style={{ border:'1px solid #cbd5e1', borderRadius:5, padding:4, background:'white', fontSize:10 }}>
                <option value="5">5 px · fein</option><option value="10">10 px · normal</option><option value="20">20 px · grob</option>
              </select>
            </label>
            <label style={{ display:'flex', gap:7, alignItems:'center', padding:'8px 0', borderTop:'1px solid #f1f5f9', fontSize:10, fontWeight:700, color:'#334155' }}>
              <input type="checkbox" checked={drawingConfig.auto_return} onChange={event=>drawingConfigAktualisieren('auto_return', event.target.checked)}/> Auto-Rücklauf bei passenden VL/RL-Anschlüssen
            </label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 38px', gap:6, alignItems:'center', paddingTop:8, borderTop:'1px solid #f1f5f9', fontSize:10, color:'#475569' }}>
              <label htmlFor="shortcut-line">Leitung starten</label><input id="shortcut-line" maxLength="1" value={drawingConfig.shortcut_line} onFocus={event=>event.currentTarget.select()} onChange={event=>drawingConfigAktualisieren('shortcut_line', event.target.value)} style={{ textAlign:'center', textTransform:'uppercase', border:'1px solid #cbd5e1', borderRadius:5, padding:4, fontWeight:800 }}/>
            </div>
            <button onClick={event=>{
              setDrawingConfig(DEFAULT_DRAWING_CONFIG);
              setEdges(items => items.map(edge => ({ ...edge, data:{ ...(edge.data || {}), corner_radius:DEFAULT_DRAWING_CONFIG.corner_radius } })));
              closeToolbarMenu(event);
            }} style={{ ...menuActionStyle, marginTop:8, paddingLeft:0, color:'#4f46e5' }}>
              Standard wiederherstellen
            </button>
          </div>
        </ToolbarMenu>

        <ToolbarMenu label="Ansicht" icon={Eye}>
          <button onClick={event=>{ setPaletteOpen(value=>!value); closeToolbarMenu(event); }} style={menuActionStyle}>
            {paletteOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />} Bauteilpalette
          </button>
          <button onClick={event=>{ setInspectorOpen(value=>!value); closeToolbarMenu(event); }} style={menuActionStyle}>
            {inspectorOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} Eigenschaften
          </button>
          <button onClick={event=>{ setShowMiniMap(value=>!value); closeToolbarMenu(event); }} style={menuActionStyle}>
            <Eye size={14} /> {showMiniMap?'Übersichtskarte ausblenden':'Übersichtskarte einblenden'}
          </button>
          <button onClick={event=>{ setShowLegende(value=>!value); setShowWarnungen(false); closeToolbarMenu(event); }} style={menuActionStyle}>
            <Layers3 size={14} /> {showLegende?'Legende schliessen':'Legende öffnen'}
          </button>
        </ToolbarMenu>

        <button onClick={()=>{ setShowWarnungen(value=>!value); setShowLegende(false); }}
          className={`hc-warning-button${alleWarnungen.length ? ' has-warnings' : ''}`}>
          <AlertTriangle size={14} />
          <span>{alleWarnungen.length ? `${alleWarnungen.length} Warnungen` : 'Keine Warnungen'}</span>
        </button>

        <div className="hc-editor-toolbar__spacer" />

        <div className="hc-layer-control">
          <button onClick={()=>setShowLayers(value=>!value)} className="hc-layer-control__trigger">
            <span className="hc-layer-swatch" style={{ background:activeLayer.color }}/>{activeLayer.label}
            <ChevronDown size={13} />
          </button>
          {ruecklaufLayerVon(activeLayer) && (
            <button onClick={()=>drawingConfigAktualisieren('auto_return', !drawingConfig.auto_return)}
              className={`hc-auto-return${drawingConfig.auto_return ? ' is-active' : ''}`}>
              Auto-RL {drawingConfig.auto_return?'an':'aus'}
            </button>
          )}
          {showLayers && <div className="hc-layer-popover">
            {LEITUNGS_LAYER.map(layer=><div key={layer.id} style={{ display:'grid', gridTemplateColumns:'28px 1fr auto', alignItems:'center', gap:4, borderRadius:7, background:activeLayer.id===layer.id?'#eef2ff':'transparent', padding:3 }}>
              <button title={layerVisibility[layer.id]===false?'Einblenden':'Ausblenden'} onClick={()=>setLayerVisibility(current=>({ ...current, [layer.id]:current[layer.id]===false }))} style={{ border:0, background:'transparent', cursor:'pointer', opacity:layerVisibility[layer.id]===false?.35:1 }}>{layerVisibility[layer.id]===false?'○':'●'}</button>
              <button onClick={()=>{ layerWaehlen(layer.id); setShowLayers(false); }} style={{ display:'flex', alignItems:'center', gap:7, minHeight:27, border:0, background:'transparent', cursor:'pointer', fontSize:10, fontWeight:activeLayer.id===layer.id?800:600, color:'#334155' }}><span style={{ width:22, borderTop:`3px ${layer.dashed?'dashed':'solid'} ${layer.color}` }}/>{layer.label}</button>
              <span style={{ fontSize:8, color:'#94a3b8' }}>{layer.role?.toUpperCase() || '–'}</span>
            </div>)}
          </div>}
        </div>
      </nav>

      <div className="hc-editor-workspace">
        {/* Einklappbare Bauteilpalette mit Akkordeon-Untermenüs. */}
        <aside className={`hc-palette${paletteOpen ? ' is-open' : ' is-collapsed'}`}>
          <div className="hc-sidepanel-header">
            {paletteOpen && <div>
              <strong>Bauteile</strong>
              <span>Auf die Zeichenfläche ziehen</span>
            </div>}
            <button onClick={()=>setPaletteOpen(value=>!value)} title={paletteOpen?'Bauteile einklappen':'Bauteile öffnen'}
              className="hc-sidepanel-toggle">
              {paletteOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          </div>
          {paletteOpen && PALETTE_GRUPPEN.map(group=>{
            const open = paletteGroupsOpen[group.titel] === true;
            return <div key={group.titel} className="hc-palette-group">
              <button onClick={()=>setPaletteGroupsOpen(current=>({ ...current, [group.titel]:!open }))}
                className={`hc-palette-group__trigger${open ? ' is-open' : ''}`}>
                {group.titel}<ChevronDown size={14} />
              </button>
              {open && <div className="hc-palette-group__items">
                {group.items.map(item=><div key={item.type} draggable
                  onDragStart={event=>{ event.dataTransfer.setData('application/reactflow',item.type); event.dataTransfer.effectAllowed='move'; }}
                  className="hc-palette-item">
                  <span className="hc-palette-item__grip">⠿</span>
                  <span>
                    <strong>{item.label}</strong>
                    {item.desc && <small>{item.desc}</small>}
                  </span>
                </div>)}
              </div>}
            </div>;
          })}
          {!paletteOpen && <button onClick={()=>setPaletteOpen(true)} title="Bauteilpalette öffnen" className="hc-collapsed-label">Bauteile</button>}
        </aside>

        {/* Canvas */}
        <main className="hc-canvas-wrap" onPointerDownCapture={cadHandlePointerDown}>
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
            onNodeDragStart={snap}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onPaneMouseMove={canvasMouseMove}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={connectionLineRenderer}
            connectionLineStyle={{ stroke:activeLayer.color, strokeWidth:2.5 }}
            snapToGrid snapGrid={[drawingConfig.grid_size,drawingConfig.grid_size]}
            selectionOnDrag
            nodesDraggable
            nodesConnectable={false}
            panOnDrag
            multiSelectionKeyCode="Shift"
            defaultEdgeOptions={{ type:'flow', style:{ strokeWidth:2.5 } }}
            fitView
            className={leitungsEntwurf ? 'cursor-crosshair hc-hydraulik-flow' : 'hc-hydraulik-flow'}
          >
            <Background color="#e2e8f0" gap={drawingConfig.grid_size * 2}/>
            <Controls/>
            {showMiniMap && <MiniMap zoomable pannable nodeStrokeWidth={3}/>}
            {leitungsEntwurf && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:'#4f46e5', color:'white', fontSize:10, fontWeight:700, boxShadow:'0 6px 16px rgba(79,70,229,.28)' }}>
                  {leitungsSnap?.type === 'port'
                    ? 'Am Bauteil einrasten'
                    : leitungsSnap?.type === 'line'
                      ? 'T-Verbindung erstellen'
                      : leitungsEntwurf.extendEdgeId
                        ? 'Linie weiterziehen · Klick = neuer Eckpunkt · Enter = fertig'
                        : 'Leitung zeichnen · Klick = Eckpunkt · Enter = fertig'}
                  <button onClick={()=>leitungsCursorRef.current && leitungsEntwurfAbschliessen(leitungsCursorRef.current, leitungsSnap, shiftPressed)}
                    style={{ width:22, height:22, borderRadius:11, border:0, background:'rgba(255,255,255,.2)', color:'white', cursor:'pointer', fontWeight:800 }}
                    title="Leitung abschliessen">✓</button>
                </div>
              </Panel>
            )}
            <ViewportPortal>
              <svg width="1" height="1" style={{ position:'absolute', left:0, top:0, overflow:'visible', pointerEvents:'none' }}>
                {cadEntwurfRoute.length >= 2 && (
                  <path d={roundedPolylinePath(cadEntwurfRoute, drawingConfig.corner_radius)} fill="none"
                    stroke={(LEITUNGS_LAYER.find(layer => layer.id === leitungsEntwurf?.layerId) || activeLayer).color}
                    strokeWidth="4.5" strokeDasharray="12 7" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {leitungsGuides.map((guide, index) => (
                  <g key={`guide-${index}`}>
                    <line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2}
                      stroke="#22c55e" strokeWidth="1.5" strokeDasharray="7 5" opacity="0.95" />
                    <circle cx={guide.x1} cy={guide.y1} r="4" fill="#f0fdf4" stroke="#16a34a" strokeWidth="1.5" />
                  </g>
                ))}
                {leitungsSnap && (
                  <circle cx={leitungsSnap.x} cy={leitungsSnap.y} r="12" fill="none"
                    stroke={leitungsSnap.type === 'line' ? '#7c3aed' : '#16a34a'} strokeWidth="3" strokeDasharray="5 3" />
                )}
                {spiegelAchse?.start && spiegelAchse?.cursor && (
                  <line x1={spiegelAchse.start.x} y1={spiegelAchse.start.y}
                    x2={spiegelAchse.cursor.x} y2={spiegelAchse.cursor.y}
                    stroke="#7c3aed" strokeWidth="2" strokeDasharray="9 6" />
                )}
              </svg>
            </ViewportPortal>
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
        </main>

        {/* Properties */}
        {inspectorOpen && (
          <aside className="hc-inspector">
            <div className="hc-sidepanel-header">
              <div>
                <strong>{selectedEdge ? 'Leitung' : selectedNode ? (selectedNode.data?.label || 'Bauteil') : 'Eigenschaften'}</strong>
                <span>{selectedEdge || selectedNode ? 'Auswahl bearbeiten' : 'Bauteil oder Leitung auswählen'}</span>
              </div>
              <button onClick={()=>setInspectorOpen(false)} title="Eigenschaften einklappen" className="hc-sidepanel-toggle">
                <PanelRightClose size={16} />
              </button>
            </div>
            {selectedEdge ? (
              <LeitungPanel edge={selectedEdge} leitungResults={leitungResults} onUpdateEdge={updateEdgeData} onUpdateLayer={updateEdgeLayer} onDelete={deleteEdge} />
            ) : (
              <PropertiesPanel node={selectedNode} nodeFlows={nodeFlows} verteilerResults={verteilerResults} gruppeResults={gruppeResults} ventilResults={ventilResults} pumpenResults={pumpenResults} expansionResults={expansionResults} anschlussWarnungen={anschlussWarnungen} anschlussResults={anschlussResults} pwtResults={pwtResults} onUpdate={updateNode} onDelete={deleteNode} onSetAbgaenge={setAbgaenge} navigate={navigate}/>
            )}
          </aside>
        )}
      </div>

      {edgeMenu && (
        <div onPointerDown={()=>setEdgeMenu(null)} style={{ position:'fixed', inset:0, zIndex:3600 }}>
          <div onPointerDown={event=>event.stopPropagation()}
            style={{ position:'fixed', left:Math.min(edgeMenu.x, window.innerWidth - 245), top:Math.min(edgeMenu.y, window.innerHeight - 330),
              width:235, background:'white', border:'1px solid #cbd5e1', borderRadius:10, padding:6, boxShadow:'0 16px 36px rgba(15,23,42,.24)' }}>
            <div style={{ padding:'4px 8px 6px', fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Leitung
            </div>
            {[
              ['◎', 'Ähnliches auswählen', 'Alle Leitungen desselben Layers markieren', () => {
                const edge = edgesRef.current.find(item=>item.id===edgeMenu.edgeId);
                if (edge) {
                  const layerId = layerVonEdge(edge).id;
                  setMarkierteEdgeIds(edgesRef.current.filter(item=>layerVonEdge(item).id===layerId).map(item=>item.id));
                }
              }],
              ['＋', 'Ähnliches platzieren', 'Neue Leitung mit demselben Layer starten', () => {
                const edge = edgesRef.current.find(item=>item.id===edgeMenu.edgeId);
                if (edge) {
                  const layer = layerVonEdge(edge);
                  layerWaehlen(layer.id);
                  leitungsEntwurfStarten(edgeMenu.point, null, { layerId:layer.id });
                }
              }],
              ['⌜', 'Ecke hinzufügen', 'Stützpunkt an dieser Stelle einsetzen', () => punktHinzufuegen({
                preventDefault:()=>{}, clientX:edgeMenu.x, clientY:edgeMenu.y, shiftKey:false,
              }, edgeMenu.edgeId)],
              ['⌁', 'Linie weiterziehen', 'Vom näheren Leitungsende fortsetzen', () => {
                const edge = edgesRef.current.find(item=>item.id===edgeMenu.edgeId);
                const route = edge ? routePunkte(edge) : [];
                if (route.length > 1) {
                  const ds = Math.hypot(edgeMenu.point.x-route[0].x, edgeMenu.point.y-route[0].y);
                  const dt = Math.hypot(edgeMenu.point.x-route.at(-1).x, edgeMenu.point.y-route.at(-1).y);
                  leitungWeiterziehen(edgeMenu.edgeId, ds <= dt ? 'source' : 'target');
                }
              }],
              ['◇', 'An Spiegelachse spiegeln', 'Zwei Punkte zeichnen · erzeugt eine Kopie', () => setSpiegelAchse({ edgeId:edgeMenu.edgeId, start:null, cursor:null })],
              ['⌫', 'Löschen', 'Leitung und unbenutzte freie Enden entfernen', () => deleteEdge(edgeMenu.edgeId)],
            ].map(([icon, title, sub, action])=>(
              <button key={title} onClick={()=>{ action(); setEdgeMenu(null); }}
                style={{ width:'100%', display:'grid', gridTemplateColumns:'25px 1fr', gap:5, padding:'7px 8px', border:0, borderRadius:7, background:'transparent', textAlign:'left', cursor:'pointer', color:title==='Löschen'?'#b91c1c':'#334155' }}>
                <span style={{ fontSize:15 }}>{icon}</span>
                <span style={{ fontSize:10.5, fontWeight:750 }}>{title}<span style={{ display:'block', marginTop:1, fontSize:8, fontWeight:500, color:'#94a3b8' }}>{sub}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {endpointMenu && (
        <div onPointerDown={()=>setEndpointMenu(null)} style={{ position:'fixed', inset:0, zIndex:3600 }}>
          <div onPointerDown={event=>event.stopPropagation()}
            style={{ position:'fixed', left:Math.min(endpointMenu.x, window.innerWidth - 215), top:Math.min(endpointMenu.y, window.innerHeight - 110),
              width:205, padding:6, borderRadius:10, background:'white', border:'1px solid #cbd5e1',
              boxShadow:'0 14px 34px rgba(15,23,42,.24)' }}>
            <div style={{ padding:'4px 8px 6px', fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>
              {endpointMenu.side === 'source' ? 'Leitungsanfang' : 'Leitungsende'}
            </div>
            <button onClick={()=>leitungWeiterziehen(endpointMenu.edgeId, endpointMenu.side)}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', minHeight:38, padding:'7px 9px', border:0,
                borderRadius:7, background:'#eef2ff', color:'#3730a3', fontSize:11, fontWeight:800, cursor:'pointer', textAlign:'left' }}>
              <span style={{ fontSize:17 }}>⌁</span>
              <span>Linie weiterziehen<div style={{ marginTop:1, fontSize:8, fontWeight:500, color:'#6366f1' }}>Weitere Klicks setzen Eckpunkte</div></span>
            </button>
          </div>
        </div>
      )}

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
