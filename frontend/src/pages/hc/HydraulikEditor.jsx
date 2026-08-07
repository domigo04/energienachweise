import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, AlignHorizontalJustifyCenter, ArrowLeft, Check, ChevronDown, Copy, Download, Eye, EyeOff,
  FlipHorizontal2, Grid2x2, History,
  Image as ImageIcon, Layers3, LayoutTemplate, Link2, ListOrdered, Lock, Unlock, MapPin, Move, MoveHorizontal,
  CopyPlus, CornerDownRight, MoveRight, PanelLeftClose, PanelLeftOpen, RotateCcw, RotateCw,
  Scissors, Slice, Spline,
  PanelRightClose, PanelRightOpen, Redo2, Save as SaveIcon, Settings, Settings2, Trash2, Undo2, X,
} from 'lucide-react';
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState,
  Panel, ConnectionMode, useReactFlow, ReactFlowProvider,
  NodeToolbar, Position, SelectionMode, useStore, useUpdateNodeInternals, ViewportPortal,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './HydraulikEditor.css';
import { NODE_TYPES, NUMMERIERT, ROTATABLE } from '../../components/hc/nodes/HydraulikNodes';
import {
  anfahrtsSeite,
  anschluesseNachDrehung,
  besteAnschluesse,
  gedrehteSeite,
  GLEICHWERTIGE_ANSCHLUESSE,
} from '../../components/hc/nodes/anschlussSeite';
import { EDGE_TYPES } from '../../components/hc/edges/FlowEdge';
import { pairedHandleId, parallelWaypoints, roundedPolylinePath, splitRouteAtCorner, splitRouteAtPoint, reconnectThroughNode, adaptivePolyline, orthogonalerAnschlussEckpunkt, segmentAchse, mitgezogeneWaypoints } from '../../components/hc/edges/geometry';
import { createHydraulicEdge, canStartHydraulicLine } from './schema/edgeFactory';
import {
  ALIGN, ARRAY, BREAK, CONNECT_CORNER, COPY, DRAW_PIPE, EXTEND, HOME, JOIN, MIRROR, MOVE,
  OFFSET, PLACE, ROTATE, STRETCH, TRIM,
  befehlMerken, befehlsPrompt, befehlsVorschlaege, escape as escapeMode, finishCommand, initialMode,
  letztenBefehlWiederholen,
  istBefehl, istModify, modeLabel, startCommand, toggleCommand, zeichnetLeitung,
} from './schema/editorMode';
import {
  constrainPoint, istBewussteDiagonale, laengeAusBuffer, laengeTaste, massAnker,
  massLabel, rasterPunkt as rasterAufGitter,
  POLAR_WINKEL, punktAusDynamischerEingabe, punktAusLaenge, richtungsWinkelGrad,
  segmentLaenge, segmentMassLabel, winkelLabel,
} from './schema/cadConstraints';
import {
  CORNER, ENDPOINT, GRID, MIDPOINT, NEAREST, PERPENDICULAR, PORT,
  fangErgebnis, fangspurPunkt, fangStil, orthogonalerTStueckPunkt, senkrechterFang,
} from './schema/cadSnap';
import { SOLE_ROHRE, SOLE_TRAEGER } from './schema/soleTabellen';
import {
  wohnungAendern, wohnungEntfernen, wohnungHinzufuegen, wohnungenAusDaten,
} from './schema/bwwWohnungen';
import { eingefuegterKnoten, kopierbarerKnoten } from './schema/nodeClipboard';
import { nodesMitExportGeometrie } from './schema/exportGeometrie';
import {
  abstandSegmentZuRechteck, abzweigPunkt, eckpunktWeiterziehen, endpunktWeiterziehen, fensterAus, labelVerschoben, labelVersatz,
  leitungMitLueckeTrennen, leitungenMitEckeVerbinden, leitungsSystem, leitungTrimmen,
  leitungVerschieben,
  routeBereinigen, routeBisKanteDehnen, routeDehnen, routenVerbinden,
  routeSegmenteEntfernen, routeVersetzen,
  griffAktionen, loeschAuswahl, segmentAusrichten, segmentVerschieben, segmentVerschiebungDelta,
  entwurfFuerAbschluss, segmentZumVerschieben, versatzSeite, verschiebungLabel,
} from './schema/cadEdit';
import {
  anzahlAusBuffer, bauteilLage, bauteilPosition, drehung, kopierPlan,
  reihenAbbildungen, routeAbgebildet, spiegelung, verschiebung as verschiebungsAbbildung,
  winkelAusBuffer, winkelZwischen,
} from './schema/cadTransform';
import { anzahlAenderungen, neueNummern } from './schema/nummerierung';
import {
  blockSichtbar, brauchtMigration, migrierteDaten, naechsteBlockLage,
} from './schema/datenblock';
import {
  CAD_GRID, DEFAULT_DRAWING_CONFIG, GRID_OPTIONEN,
  graphFuerEditor, normalisiereDrawingConfig,
} from './schema/graphMigration';
import { SCHALTUNGEN } from '../../components/hc/nodes/schaltungen';
import {
  LWWP_BAUARTEN,
  generatorType,
  hatSoleOderWasserkreis,
  istWaermepumpe,
} from '../../components/hc/nodes/generatorTypes';
import {
  createProjectNote,
  createSchema,
  createSchemaRevision,
  deleteSchemaUnderlay,
  getProjectNotes,
  getSchemaEditor,
  getUserSettings,
  saveUserSettings,
  getSchemaTemplates,
  getSchemaTemplate,
  createSchemaTemplate,
  deleteSchemaTemplate,
  getSchemaUnderlay,
  hydraulikBerechnen,
  listSchemaRevisions,
  patchSchemaUnderlay,
  restoreSchemaRevision,
  saveSchemaGraph,
  setSchemaUnderlay,
  updateProjectNote,
} from '../../api/hcApi';
import { api } from '../../api';
import { dateiZuUnderlay } from './schema/underlay';
import {
  branchAnschluss, inlineNodePosition, isBranchInsertable, isInlineInsertable,
} from './schema/componentRegistry';
import MathFormula from '../../components/ui/MathFormula';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

// ── Konstanten ────────────────────────────────────────────────
const KVS_REIHE = [0.1, 0.16, 0.25, 0.4, 0.63, 1.0, 1.6, 2.5, 4.0, 6.3, 10, 16, 25, 40, 63];
// Wie ein Bauteil auf eine bestehende Leitung trifft (frei / inline / Abzweig),
// steht AUSSCHLIESSLICH in `schema/componentRegistry.js` (`placement`). Vorher
// stand hier ein zweites, handgepflegtes Set — und die beiden Quellen wichen
// schon voneinander ab. Die Eigenschaft gehört zum Bauteil, nicht zum Editor.

// Abstand des Abzweig-Bauteils von der Leitung (§18): weit genug, dass Symbol
// und Leitung sich nicht überlagern, nah genug für einen kurzen Stich.
const BRANCH_ABSTAND = 70;
const branchAnschlussPunkt = (hit, cursor) => abzweigPunkt(
  hit.route[hit.segmentIndex], hit.route[hit.segmentIndex + 1],
  { x:hit.x, y:hit.y }, cursor, BRANCH_ABSTAND);

const LEITUNGS_LAYER = [
  { id:'heizung_vl', label:'Heizung VL', kurz:'H VL', color:'#ef4444', role:'vl', dashed:false },
  { id:'heizung_rl', label:'Heizung RL', kurz:'H RL', color:'#3b82f6', role:'rl', dashed:true },
  { id:'kaelte_vl', label:'Kälte VL', kurz:'K VL', color:'#06b6d4', role:'vl', dashed:false },
  { id:'kaelte_rl', label:'Kälte RL', kurz:'K RL', color:'#0e7490', role:'rl', dashed:true },
  { id:'sole_vl', label:'Sole VL', kurz:'S VL', color:'#eab308', role:'vl', dashed:false },
  { id:'sole_rl', label:'Sole RL', kurz:'S RL', color:'#16a34a', role:'rl', dashed:true },
  { id:'bww', label:'Trinkwarmwasser', kurz:'TWW', color:'#ef4444', role:null, dashed:false },
  { id:'trinkkaltwasser', label:'Trinkkaltwasser', kurz:'TKW', color:'#16a34a', role:null, dashed:true },
  { id:'neutral', label:'Allgemein', kurz:'Allg.', color:'#334155', role:null, dashed:false },
];
const DEFAULT_LAYER_VISIBILITY = Object.fromEntries(LEITUNGS_LAYER.map(layer => [layer.id, true]));
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);
const TOLERANZ_OPTIONEN = [4, 8, 12, 20];        // Fangtoleranz in mm

// Rasterfang kommt aus dem Constraint-Modul — eine Quelle, nicht zwei.
const rasterPunkt = (point, grid = CAD_GRID) => rasterAufGitter(point, grid);

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

const ruecklaufLayerVon = (layer) => {
  if (layer?.role !== 'vl' || !layer.id.endsWith('_vl')) return null;
  return LEITUNGS_LAYER.find(item => item.id === layer.id.replace(/_vl$/, '_rl')) || null;
};

// ── Leitungen ändern (Issue #72) ──────────────────────────────────────────
// Standardabstand für den Versatz in mm. Im laufenden Befehl ändern ihn die
// Zifferntasten; der zuletzt gewählte Wert bleibt für weitere Versätze stehen.
const VERSATZ_STANDARD = 200;

const versatzHinweis = (abstand) => `Versatz · Abstand ${abstand} mm · `
  + 'auf die Leitung klicken, auf der Seite, wo die Kopie hin soll · '
  + 'Ziffern ändern den Abstand · Shift legt die Kopie auf den aktiven Layer · ESC beendet.';

const layerVonEdge = (edge) => {
  const gespeichert = LEITUNGS_LAYER.find(layer => layer.id === edge.data?.layer_id);
  if (gespeichert) return gespeichert;
  if (edge.style?.stroke === '#ef4444') return LEITUNGS_LAYER[0];
  if (edge.style?.stroke === '#3b82f6') return LEITUNGS_LAYER[1];
  return LEITUNGS_LAYER.find(layer => layer.id === 'neutral');
};

function guidesAmPunkt(guides, point) {
  return (guides || []).flatMap(guide => {
    const vertical = Math.abs(guide.x1 - guide.x2) < 0.5;
    const horizontal = Math.abs(guide.y1 - guide.y2) < 0.5;
    if (vertical && Math.abs(point.x - guide.x1) < 0.5) return [{ ...guide, x2:point.x, y2:point.y }];
    if (horizontal && Math.abs(point.y - guide.y1) < 0.5) return [{ ...guide, x2:point.x, y2:point.y }];
    return [];
  });
}

// Beim Fang auf ein gerades Bestandsteilstück liegt das T-Stück dort, wo die
// orthogonale Achse des neuen Astes die Bestandsleitung wirklich berührt. So
// entsteht weder ein überlappendes Stück auf der Bestandsleitung noch ein
// zweiter Griff. Eine bewusst gezeichnete Schräge ab 30° behält den Nearest-
// Fangpunkt des Cursors.
function tStueckHit(origin, raw, hit) {
  if (!origin || !hit?.route || !Number.isInteger(hit.segmentIndex)
      || istBewussteDiagonale(origin, raw)) return hit;
  const punkt = orthogonalerTStueckPunkt(
    origin, hit.route[hit.segmentIndex], hit.route[hit.segmentIndex + 1],
  );
  return punkt ? { ...hit, ...punkt, position:punkt, type:'line', cornerIndex:undefined } : hit;
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
  // Die deklarierte Position (Handle-Prop) dreht NICHT mit der CSS-
  // Transformation mit — sie wird hier korrigiert, sonst zeigt die Anfahrt in
  // die falsche Richtung. Die Regel dazu liegt rein und getestet in
  // `nodes/anschlussSeite.js`; sie darf nur an EINER Stelle stehen.
  if (handle?.position) {
    return gedrehteSeite(
      String(handle.position).toLowerCase(),
      internal?.data?.rotation || 0,
      Boolean(internal?.data?.mirrored),
    );
  }
  // Geometrische Herleitung: die gemessenen Bounds spiegeln die Drehung bereits
  // (getBoundingClientRect), daher keine zusätzliche Korrektur.
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

const streckenLaenge = (points) => points.slice(1)
  .reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);

function ConstrainedConnectionLine({ fromX, fromY, toX, toY, fromPosition, connectionLineStyle = {}, shift = false, ortho = true, polar = false, polarWinkel = 45 }) {
  const start = { x:fromX, y:fromY };
  const target = constrainPoint(start, { x:toX, y:toY }, { ortho, shift, grid:1, polar, polarWinkel });
  const route = adaptivePolyline(start, target, [], String(fromPosition || '').toLowerCase(), null);
  return <path d={roundedPolylinePath(route, 8)} fill="none"
    stroke={connectionLineStyle.stroke || '#64748b'} strokeWidth={2.5} strokeDasharray="8 5" />;
}
// Punkt 5 — temporäres Mass als Zeichenhilfsmittel, nicht als Web-Badge.
//
// Aufbau wie eine CAD-Masskette: zwei Masshilfslinien vom Segment nach aussen,
// eine Masslinie dazwischen, Endstriche und die Zahl freigestellt darüber. Alle
// Grössen in Screen-Pixeln durch den Zoom geteilt, damit die Darstellung bei
// 25 % und bei 400 % gleich aussieht und der Text immer lesbar bleibt.
function CadMass({ mass, zoom }) {
  if (!mass?.a || !mass?.b || !mass.laenge) return null;
  const z = Math.max(zoom || 1, 0.05);
  const { a, b } = mass;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy) || 1;
  // Normale des Segments — die Richtung, in die die Masskette versetzt wird.
  const nx = -dy / laenge;
  const ny = dx / laenge;
  const versatz = 22 / z;
  const ueberstand = 5 / z;          // Masshilfslinie ragt etwas über die Masslinie
  const a2 = { x:a.x + nx * versatz, y:a.y + ny * versatz };
  const b2 = { x:b.x + nx * versatz, y:b.y + ny * versatz };
  const mitte = { x:(a2.x + b2.x) / 2, y:(a2.y + b2.y) / 2 };
  const senkrecht = Math.abs(dx) < Math.abs(dy);
  // Bei senkrechtem Segment steht die Zahl daneben, bei waagrechtem darüber —
  // sonst liegt sie quer auf der Masslinie.
  const textX = mitte.x + (senkrecht ? 0 : 0);
  const textY = mitte.y - (senkrecht ? 0 : 6 / z);
  const stift = 1 / z;
  return (
    <g pointerEvents="none" stroke="#0f172a" strokeWidth={stift} opacity="0.85">
      {/* Masshilfslinien an den Segmentenden */}
      <line x1={a.x} y1={a.y} x2={a2.x + nx * ueberstand} y2={a2.y + ny * ueberstand} />
      <line x1={b.x} y1={b.y} x2={b2.x + nx * ueberstand} y2={b2.y + ny * ueberstand} />
      {/* Masslinie */}
      <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} />
      {/* Endstriche (CAD-Schrägstriche statt Pfeilspitzen) */}
      {[a2, b2].map((punkt, i) => (
        <line key={i}
          x1={punkt.x - (nx + dx / laenge) * ueberstand} y1={punkt.y - (ny + dy / laenge) * ueberstand}
          x2={punkt.x + (nx + dx / laenge) * ueberstand} y2={punkt.y + (ny + dy / laenge) * ueberstand} />
      ))}
      {/* Zahl freigestellt: weisser Halo statt Kasten, damit die Zeichnung
          darunter sichtbar bleibt. */}
      <text x={textX} y={textY} textAnchor="middle" dominantBaseline={senkrecht ? 'middle' : 'auto'}
        stroke="#ffffff" strokeWidth={3.5 / z} strokeLinejoin="round" paintOrder="stroke"
        fill="#0f172a" fontSize={12 / z} fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, monospace">
        {mass.label}
      </text>
    </g>
  );
}

// Direktmass zwischen einem gewählten Teilstück und einer nahen Bauteilkante.
// Anders als CadMass wird es nicht parallel versetzt: Die beiden Endpunkte sind
// bereits die geometrisch kürzeste Verbindung und damit selbst die Masslinie.
function CadDirektMass({ mass, zoom }) {
  if (!mass?.a || !mass?.b || !(mass.distance > 0)) return null;
  const z = Math.max(zoom || 1, 0.05);
  const dx = mass.b.x - mass.a.x;
  const dy = mass.b.y - mass.a.y;
  // Distanzhilfen sind im Schema ausnahmslos horizontal oder vertikal. Eine
  // diagonale Restgeometrie wird lieber nicht gezeigt als irreführend.
  if (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) return null;
  const laenge = Math.hypot(dx, dy) || 1;
  const tx = dx / laenge;
  const ty = dy / laenge;
  const nx = -ty;
  const ny = tx;
  const tick = 5 / z;
  const mitte = { x:(mass.a.x + mass.b.x) / 2, y:(mass.a.y + mass.b.y) / 2 };
  return (
    <g pointerEvents="none" stroke="#475569" strokeWidth={1 / z} opacity="0.82">
      <line x1={mass.a.x} y1={mass.a.y} x2={mass.b.x} y2={mass.b.y} strokeDasharray={`${4 / z} ${3 / z}`} />
      {[mass.a, mass.b].map((punkt, index) => (
        <line key={index} x1={punkt.x - nx * tick} y1={punkt.y - ny * tick}
          x2={punkt.x + nx * tick} y2={punkt.y + ny * tick} />
      ))}
      <text x={mitte.x + nx * 8 / z} y={mitte.y + ny * 8 / z}
        textAnchor="middle" dominantBaseline="middle" fill="#334155"
        stroke="#ffffff" strokeWidth={3.5 / z} paintOrder="stroke"
        fontSize={11 / z} fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, monospace">
        {mass.label}
      </text>
    </g>
  );
}

// Punkt 5 — der Fangmarker. Jeder Fangtyp hat eine eigene Form, damit man ohne
// Lesen erkennt, woran man fängt; der Kurztext benennt ihn zusätzlich.
// Die Koordinate kommt aus demselben Objekt, das den Punkt setzt — dadurch kann
// die Anzeige nie neben dem Klick liegen.
function SnapMarker({ marker }) {
  if (!marker) return null;
  const { x, y, form, farbe, label } = marker;
  const r = 7;
  const glyph = {
    circle:    <circle cx={x} cy={y} r={r} fill="none" stroke={farbe} strokeWidth="2.2" />,
    square:    <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="none" stroke={farbe} strokeWidth="2.2" />,
    cross:     <g stroke={farbe} strokeWidth="2.2" strokeLinecap="round">
                 <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
                 <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
               </g>,
    triangle:  <polygon points={`${x},${y - r} ${x + r},${y + r} ${x - r},${y + r}`} fill="none" stroke={farbe} strokeWidth="2.2" />,
    angle:     <polyline points={`${x - r},${y - r} ${x - r},${y + r} ${x + r},${y + r}`} fill="none" stroke={farbe} strokeWidth="2.2" />,
    hourglass: <polygon points={`${x - r},${y - r} ${x + r},${y - r} ${x - r},${y + r} ${x + r},${y + r}`} fill="none" stroke={farbe} strokeWidth="2.2" />,
    dot:       <circle cx={x} cy={y} r="2.6" fill={farbe} />,
  }[form] || <circle cx={x} cy={y} r={r} fill="none" stroke={farbe} strokeWidth="2.2" />;
  return (
    <g pointerEvents="none">
      {glyph}
      {label && (
        <text x={x + r + 5} y={y - r - 3} fill={farbe} fontSize="11" fontWeight="700">{label}</text>
      )}
    </g>
  );
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
  { titel: 'Erzeuger', items: [
    { paletteId:'erzeuger-sole-wasser', type:'erzeuger', label:'Sole/Wasser-WP', desc:'Quellen- und Abgabekreis', preset:{ generator_type:'ews_wp' } },
    { paletteId:'erzeuger-luft-wasser-aussen', type:'erzeuger', label:'Luft/Wasser-WP – aussen', desc:'Monoblock, Standard-WP-Symbol', preset:{ generator_type:'lwwp', lwwp_bauart:'aussenaufstellung' } },
    { paletteId:'erzeuger-luft-wasser-innen', type:'erzeuger', label:'Luft/Wasser-WP – innen', desc:'Monoblock, Standard-WP-Symbol', preset:{ generator_type:'lwwp', lwwp_bauart:'innenaufstellung' } },
    { paletteId:'erzeuger-luft-wasser-split', type:'erzeuger', label:'Luft/Wasser-WP – Splitgerät', desc:'Aussen Verflüssiger · innen Verdampfer', preset:{ generator_type:'lwwp', lwwp_bauart:'split' } },
    { paletteId:'erzeuger-wasser-wasser', type:'erzeuger', label:'Wasser/Wasser-WP', desc:'Quellen- und Abgabekreis', preset:{ generator_type:'wasser_wp' } },
    { paletteId:'erzeuger-co2', type:'erzeuger', label:'CO₂-Wärmepumpe', desc:'Wärmepumpe', preset:{ generator_type:'co2_wp' } },
    { paletteId:'erzeuger-holz', type:'erzeuger', label:'Holz-/Pelletheizung', desc:'SIA-Symbol mit Solid-Quadrat', preset:{ generator_type:'holz' } },
    { type: 'erdsonden',  label: 'Erdsondenfeld',       desc: 'Dynamischer Soleverteiler mit Duplexsonden' },
    { type: 'pwt',        label: 'Plattentauscher / Fernwärme', desc: 'Wärmeübergabe mit zwei getrennten Kreisen' },
  ]},
  { titel: 'Speicher', items: [
    { type: 'speicher',   label: 'Speicher',            desc: 'Inhalt wird direkt im Symbol angezeigt' },
    { type: 'bww',        label: 'BWW-Speicher',        desc: 'Warmwasser rot · Kaltwasser grün gestrichelt' },
  ]},
  { titel: 'Verteilung', items: [
    { type: 'verteiler',  label: 'Verteiler',           desc: 'VL/RL-Balken, wählbare Abgänge' },
    { type: 'gruppe',     label: 'Verbrauchergruppe',   desc: 'CAD-Strang: Pumpe, Einspritz, Q/VL/RL' },
    { type: 'heizkoerper', label: 'Heizkörper',         desc: 'Grüne, skalierbare Fläche oder kompakter Schema-Abgang' },
    { type: 'luftheizapparat', label: 'Luftheizapparat', desc: 'Register mit Lüfter; VL/RL auf derselben Seite' },
    { type: 'lufterhitzer', label: 'Lufterhitzer',      desc: 'Register mit Luftstrom quer hindurch' },
    { type: 'lufterhitzer_gruppe', label: 'Lufterhitzer-Gruppe', desc: 'CAD-Strang: Klappe, Regelventil, Register, STAD' },
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
    { type: 'waermezaehler_cad', label: 'Wärmezähler (CAD)', desc: 'Volumenmessteil, Fühler und Rechenwerk' },
    { type: 'temperatur', label: 'Temperaturfühler',    desc: 'nur Symbol' },
  ]},
  { titel: 'Verbindungen', items: [
    { type: 'anschluss',  label: 'Anschluss-Marker',    desc: 'Ersetzt lange Leitung — Buchstabe koppeln' },
  ]},
  { titel: 'Beschriftung', items: [
    { type: 'label',      label: 'Textblock',           desc: 'Freier Text — verschiebbar, Doppelklick zum Bearbeiten' },
    { type: 'concrete_area',  label: 'Betonfläche',     desc: 'Kreuzschraffur, skalierbar — reine Zeichnung' },
    { type: 'interface_line', label: 'Systemgrenze',    desc: 'Schwarze Linie, solid/gestrichelt, mit Text' },
  ]},
];
const STD_PALETTE = PALETTE_GRUPPEN.flatMap(g => g.items);
const paletteItem = kennung => STD_PALETTE.find(item => (item.paletteId || item.type) === kennung);
const paletteNodeType = kennung => paletteItem(kennung)?.type || kennung;

const newId = () => `n_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

// Die vier Modify-Befehle (§74) und ihr Befehlszustand. Kopieren ist der
// einzige Dauerbefehl — die Mehrfachkopie ist genau das, was ihn ausmacht.
const TRANSFORM_MODUS = { kopieren:COPY, spiegeln:MIRROR, drehen:ROTATE, reihe:ARRAY };

// Automatischer Vorschlag für den Plankopf/Schemanamen eines NEUEN Schemas —
// Projektname + heutiges Datum. Bleibt im Namensfeld frei überschreibbar.
const standardSchemaName = (projekt) =>
  `${projekt || 'Projekt'} — Anlagenschema ${new Date().toLocaleDateString('de-CH')}`;

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
const lufterhitzerSchaltungVon = (d) => (['einspritz', 'beimisch', 'drossel'].includes(d?.schaltung) ? d.schaltung : 'drossel');

// ── Leitungs-Panel (Klick auf eine Leitung, PHYSIK §10) ───────
// Zeigt die automatisch gewählte Dimension (DN + Pa/m aus Dominics Tabelle)
// und lässt die Länge eintragen → Δp = Pa/m · Länge / 1000.
function LeitungPanel({
  edge, leitungResults, onUpdateEdge, onUpdateLayer, onDelete,
  segmentIndex = null, onMoveSegment, onLabel, onLabelReset,
}) {
  const lg = leitungResults[edge.id];
  const layer = layerVonEdge(edge);
  const [dxCm, setDxCm] = useState('');
  const [dyCm, setDyCm] = useState('');
  useEffect(() => {
    setDxCm('');
    setDyCm('');
  }, [edge.id, segmentIndex]);
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
      <div style={{ marginBottom:10 }}>
        <label style={lbl}>Teilstück verschieben</label>
        {Number.isInteger(segmentIndex) ? (
          <>
            <div style={{ fontSize:9, color:'#475569', marginBottom:6 }}>
              Teilstück {segmentIndex + 1} ist in der Zeichnung violett markiert.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              <div><label style={lbl}>ΔX [cm]</label><input type="number" step="1" style={inp} value={dxCm} onChange={e=>setDxCm(e.target.value)} placeholder="0"/></div>
              <div><label style={lbl}>ΔY [cm]</label><input type="number" step="1" style={inp} value={dyCm} onChange={e=>setDyCm(e.target.value)} placeholder="0"/></div>
            </div>
            <button type="button" style={{ ...btnBlue, width:'100%', marginTop:6 }}
              disabled={!Number(dxCm) && !Number(dyCm)}
              onClick={() => {
                onMoveSegment?.(edge.id, segmentIndex, Number(dxCm) || 0, Number(dyCm) || 0);
                setDxCm(''); setDyCm('');
              }}>
              Teilstück exakt verschieben
            </button>
          </>
        ) : (
          <div style={{ fontSize:9, color:'#64748b', lineHeight:1.45 }}>
            Zuerst ein Teilstück der Leitung anklicken. Danach frei ziehen oder den Versatz hier in cm eingeben.
          </div>
        )}
      </div>
      <Div />
      {/* Beschriftung (DN/m′) — im Plan steht sie oft im Weg. Sie lässt sich
          direkt in der Zeichnung ziehen; hier sind Ausblenden und Zurücksetzen
          erreichbar, damit eine ausgeblendete Beschriftung auffindbar bleibt. */}
      <div style={{ marginBottom:10 }}>
        <label style={lbl}>Beschriftung (DN · m′)</label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          <button type="button" style={{ ...btnBlue, background:edge.data?.label_hidden ? '#0f766e' : '#475569' }}
            onClick={() => onLabel?.(edge.id, { label_hidden:!edge.data?.label_hidden })}>
            {edge.data?.label_hidden ? 'Einblenden' : 'Ausblenden'}
          </button>
          <button type="button" style={{ ...btnBlue, background:'#475569' }}
            disabled={!edge.data?.label_offset?.x && !edge.data?.label_offset?.y}
            onClick={() => onLabelReset?.(edge.id)}>
            In die Mitte
          </button>
        </div>
        <div style={{ fontSize:9, color:'#64748b', lineHeight:1.45, marginTop:5 }}>
          Beschriftung in der Zeichnung greifen und frei versetzen (Shift rastert).
          Doppelklick stellt sie zurück, Entf blendet sie aus.
        </div>
      </div>
      <Div />
      <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b' }}>
        <b style={{ color:'#334155' }}>Leitungsführung:</b> Das gewählte Teilstück frei ziehen; der Versatz wird in cm angezeigt. Einzelne Eckpunkte lassen sich ebenfalls frei auf dem Raster verschieben. Doppelklick setzt einen Eckpunkt. Rechtsklick auf einen Endgriff → «Linie weiterziehen».
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

function ErzeugerTypFelder({ data, onSet }) {
  const aktuell = generatorType(data.generator_type);
  return (
    <>
      <label style={lbl}>Erzeugerart</label>
      <div style={{ ...inp, background:'#f8fafc', color:'#334155', fontWeight:600 }}>
        {aktuell?.label || data.typ || 'Wärmeerzeuger'}
      </div>
      <div style={{ marginTop:3, fontSize:9, color:'#64748b' }}>
        Die Erzeugerart wird durch das gewählte Bauteil festgelegt. Zum Ersetzen ein anderes Erzeuger-Bauteil einsetzen.
      </div>
      {data.generator_type === 'lwwp' && (
        <>
          <label style={lbl}>Bauart Luft/Wasser-WP</label>
          <div style={{ ...inp, background:'#f8fafc', color:'#334155' }}>
            {LWWP_BAUARTEN.find(item => item.value === (data.lwwp_bauart || 'aussenaufstellung'))?.label}
          </div>
          <div style={{ marginTop:3, fontSize:9, color:'#64748b' }}>
            Die Bauart wird als eigenes Bauteil in der Palette gewählt.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <div><label style={lbl}>Aussenluft [°C]</label>
              <input type="number" style={inp} value={data.aussenluft_temp ?? ''}
                onChange={event => onSet('aussenluft_temp', event.target.value)} placeholder="-8"/></div>
            <div><label style={lbl}>Fortluft [°C]</label>
              <input type="number" style={inp} value={data.fortluft_temp ?? ''}
                onChange={event => onSet('fortluft_temp', event.target.value)} placeholder="-12"/></div>
          </div>
        </>
      )}
    </>
  );
}

// ── Typenschild: Fabrikat, Typ, DN ──────────────────────────────────────────
// Dieselben Felder stehen im Datenkästchen am Bauteil und im PDF-Export
// (backend/app/export/bauteil_infos.py). Die eingebauten Bauteile einer
// Verbrauchergruppe verwenden dieselben Felder mit Präfix (`pumpe_fabrikat` …).
const TYPENSCHILD_FELDER = [['Fabrikat', 'fabrikat', 'text'], ['Typ', 'typ', 'text'], ['DN', 'dn', 'number']];
// Armaturen ohne eigene Auslegung — sie brauchen trotzdem ein Typenschild.
const ARMATUREN = new Set(['shutoff', 'stad', 'checkvalve', 'sicherheitsventil', 'waermezaehler_cad']);

function Typenschild({ d, set, praefix = '' }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 62px', gap:6, marginBottom:7 }}>
      {TYPENSCHILD_FELDER.map(([label, key, typ]) => (
        <div key={key}>
          <label style={lbl}>{label}</label>
          <input type={typ} style={inp} value={d[praefix + key] ?? ''}
            onChange={e => set(praefix + key, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function DatenblockSchalter({ node, onUpdate }) {
  // Nur Bauteile mit Nummer haben überhaupt einen Block.
  if (node?.data?.nr == null) return null;
  const versteckt = node.data?.caption_hidden === true;
  return (
    <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:11, color:'#334155',
      marginTop:8, cursor:'pointer' }}>
      <input type="checkbox" checked={!versteckt}
        onChange={event => onUpdate('caption_hidden', !event.target.checked)} />
      Datenblock anzeigen
    </label>
  );
}

function PropertiesPanel({ node, nodeFlows, verteilerResults, gruppeResults, ventilResults, pumpenResults, expansionResults, anschlussWarnungen, anschlussResults, pwtResults, heatpumpResults, speicherResults, erdsondenResults, bwwResults, onUpdate, onDelete, onSetAbgaenge, navigate, drawingConfig, onDrawingConfig }) {
  // Punkt 13 — nichts ausgewählt heisst nicht „nichts zu zeigen": dann gehören
  // hierher die Eigenschaften der ANSICHT, wie in Revit.
  if (!node) return (
    <div style={{ padding: 14, fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
      <PT>Zeichenansicht</PT>
      {drawingConfig && onDrawingConfig && (
        <div style={{ display:'grid', gap:9 }}>
          <div>
            <label style={lbl}>Raster</label>
            <select style={inp} value={drawingConfig.grid_size}
              onChange={e => onDrawingConfig('grid_size', Number(e.target.value))}>
              {GRID_OPTIONEN.map(size => <option key={size} value={size}>{size} mm</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fangtoleranz</label>
            <select style={inp} value={drawingConfig.snap_tolerance}
              onChange={e => onDrawingConfig('snap_tolerance', Number(e.target.value))}>
              {TOLERANZ_OPTIONEN.map(t => <option key={t} value={t}>{t} mm</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Eckenradius</label>
            <input type="number" min="0" max="40" style={inp} value={drawingConfig.corner_radius}
              onChange={e => onDrawingConfig('corner_radius', Number(e.target.value))} />
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:11 }}>
            <input type="checkbox" checked={drawingConfig.ortho !== false}
              onChange={e => onDrawingConfig('ortho', e.target.checked)} />
            Orthogonal zeichnen (ORTHO)
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:11 }}>
            <input type="checkbox" checked={drawingConfig.object_snap !== false}
              onChange={e => onDrawingConfig('object_snap', e.target.checked)} />
            Objektfang (SNAP)
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:11 }}>
            <input type="checkbox" checked={drawingConfig.raster_sichtbar === true}
              onChange={e => onDrawingConfig('raster_sichtbar', e.target.checked)} />
            Raster anzeigen (Fang bleibt aktiv)
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:11 }}>
            <input type="checkbox" checked={drawingConfig.auto_return === true}
              onChange={e => onDrawingConfig('auto_return', e.target.checked)} />
            Rücklauf automatisch mitzeichnen
          </label>
        </div>
      )}
      <div style={{ marginTop: 14, fontSize: 10, color:'#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
        Ein Bauteil oder eine Leitung auswählen, um deren Eigenschaften hier zu
        bearbeiten. <b>Doppelklick</b> auf ein Bauteil öffnet die Auslegung.
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
        <select style={sel} value={d.typ||''} onChange={e=>{
          const s=WAERMEABGABE.find(x=>x.label===e.target.value);
          set('typ',e.target.value); if(s){set('vl_temp',s.vl);set('rl_temp',s.rl);}
        }}>
          <option value="">— wählen —</option>
          {WAERMEABGABE.map(x=><option key={x.label}>{x.label}</option>)}
        </select>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:6}}>
          <div><label style={{...lbl,color:'#ef4444'}}>VL [°C]</label>
            <input type="number" style={inpVl} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
          <div><label style={{...lbl,color:'#3b82f6'}}>RL [°C]</label>
            <input type="number" style={inpRl} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
        </div>
        {gr?.q_kw_quelle === 'lufterhitzer_untergruppen' ? (
          <>
            {ro('Leistung Q (automatische Summe)', gr.q_kw, 'kW', true)}
            <div style={{ fontSize:9, color:'#0369a1', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'6px 8px', marginTop:3 }}>
              Aus {gr.untergruppen_anzahl} angeschlossenen Lufterhitzergruppe(n) summiert.
              Die manuelle Gruppenleistung bleibt gespeichert und gilt wieder, sobald der separate Anschluss deaktiviert oder keine Untergruppe verbunden ist.
            </div>
          </>
        ) : fld('Leistung Q','q_kw','z.B. 8.5','kW')}
        {fld('Druckverlust Ast','dp_kpa','z.B. 20','kPa')}
        {vl>0&&rl>0&&dt<=0&&<div style={warnSt}>⚠ VL muss grösser als RL sein</div>}
        <label style={lbl}>Schaltung</label>
        <select style={sel} value={schaltungVon(d)} onChange={e=>set('schaltung',e.target.value)}>
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
              <div style={miniSt}>Keine Einspritzung — primär = sekundär.</div>
            )}
            {gr.pumpe?.dp_kpa != null && ro('Pumpe Förderhöhe', `${gr.pumpe.dp_kpa.toFixed(1)} kPa = ${gr.pumpe.mws.toFixed(2)} mWS`, '')}
            {gr.ventil?.pv != null && ro('Ventil kvs / Autorität', `${gr.ventil.kvs_eff} / ${gr.ventil.pv.toFixed(1)} %`, '')}
            <div style={miniSt}>Pumpe + Ventil auslegen: <b>Doppelklick</b> auf den Strang.</div>
          </>
        ) : (
          <div style={warnSt}>Q, VL und RL eingeben — das Backend rechnet automatisch.</div>
        )}
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── LUFTERHITZERGRUPPE ──
  if (node.type === 'lufterhitzer_gruppe') {
    const gr = gruppeResults?.[node.id];
    const schaltung = lufterhitzerSchaltungVon(d);
    return (
      <div style={panelSt}>
        <PT>Lufterhitzergruppe</PT>
        {fld('Anlagennummer / Bezeichnung','anlage_nr','z.B. LE 3 — Halle Nord','','text')}
        {fld('Leistung Q','q_kw','z.B. 12','kW')}
        {fld('Druckverlust geregelter Ast ohne Regelventil','dp_kpa','z.B. 20','kPa')}
        <label style={lbl}>Schaltung</label>
        <select style={sel} value={schaltung} onChange={e=>set('schaltung',e.target.value)}>
          {SCHALTUNGSARTEN.map(s=><option key={s.wert} value={s.wert}>{s.name}</option>)}
        </select>
        <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>
          {SCHALTUNGSARTEN.find(s=>s.wert===schaltung)?.hinweis}
        </div>
        <label style={{ display:'flex', gap:5, alignItems:'center', cursor:'pointer', fontSize:11, color:'#374151', marginTop:8 }}>
          <input type="checkbox" checked={!!d.hat_wz} onChange={e=>set('hat_wz',e.target.checked)}/>
          Wärmezähler im Rücklauf mit VL-/RL-Fühler
        </label>
        {gr?.vl != null && ro('Übernommene Temperaturen', `${gr.vl} / ${gr.rl} °C`, '')}
        {gr?.m_sek != null && <ResultBox v={gr.m_sek} label="V' Lufterhitzer" unit="m³/h" />}
        {gr?.pumpe?.dp_kpa != null && ro('Pumpe Förderhöhe', `${gr.pumpe.dp_kpa.toFixed(1)} kPa = ${gr.pumpe.mws.toFixed(2)} mWS`, '')}
        {gr?.ventil?.pv != null && ro('Ventil kvs / Autorität', `${gr.ventil.kvs_eff} / ${gr.ventil.pv.toFixed(1)} %`, '')}
        {!gr?.m_sek && <div style={warnSt}>Hauptgruppe verbinden und Leistung eingeben.</div>}
        <div style={miniSt}>Detaillierte Auslegung: <b>Doppelklick</b> auf die Gruppe.</div>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
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
        <select style={sel} value={d.system||''} onChange={e=>{
          const s=WAERMEABGABE.find(x=>x.label===e.target.value);
          set('system',e.target.value); if(s){set('vl_temp',s.vl);set('rl_temp',s.rl);}
        }}>
          <option value="">— wählen —</option>
          {WAERMEABGABE.map(x=><option key={x.label}>{x.label}</option>)}
        </select>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:6}}>
          <div><label style={{...lbl,color:'#ef4444'}}>VL [°C]</label>
            <input type="number" style={inpVl} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
          <div><label style={{...lbl,color:'#3b82f6'}}>RL [°C]</label>
            <input type="number" style={inpRl} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
        </div>
        {fld('Leistung Q','q_kw','z.B. 8.5','kW')}
        {vl>0&&rl>0&&dt<=0&&<div style={warnSt}>⚠ VL muss grösser als RL sein</div>}
        <ResultBox v={calc} label="Berechneter Volumenstrom" unit="m³/h" />
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── 2WV / 3WM — kvs + Ventilautorität kommen vom Backend ──
  if (node.type === 'valve2' || node.type === 'valve3') {
    const ver = ventilResults?.[node.id];
    const umschaltend = node.type === 'valve3' && (d.funktion || 'mischend') === 'umschaltend';
    return (
      <div style={panelSt}>
        <PT>{node.type === 'valve2' ? '2-Wege Regelventil'
          : umschaltend ? '3-Weg-Umschaltventil' : '3-Wege Mischventil'}</PT>
        {fld('Bezeichnung','label','','','text')}
        <Typenschild d={d} set={set}/>
        {node.type === 'valve3' && <>
          <label style={lbl}>Funktion</label>
          <select style={sel} value={d.funktion||'mischend'}
            onChange={e=>set('funktion',e.target.value)}>
            <option value="mischend">Mischend — regelt eine Temperatur</option>
            <option value="umschaltend">Umschaltend — zwei Stellungen (BWW-Vorrang)</option>
          </select>
          <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b', marginTop:4, marginBottom:6 }}>
            {umschaltend
              ? 'Zwischen Wärmepumpe und technischem Speicher heisst umschaltend: entweder Brauchwarmwasser oder Verbrauchergruppen. Die Wärmepumpe zeigt dann beide Betriebsfälle getrennt; die Lasten werden nicht addiert.'
              : 'Ein mischendes Ventil regelt eine Temperatur und wird über kvs und Autorität ausgelegt.'}
          </div>
        </>}
        {v ? ro("V' (aus Leitung)",v,'m³/h',true) : <div style={warnSt}>In eine Leitung mit Durchfluss setzen</div>}
        {umschaltend ? (
          <div style={{ fontSize:10, color:'#0369a1', background:'#f0f9ff', border:'1px solid #7dd3fc', borderRadius:6, padding:'6px 8px' }}>
            Ein Umschaltventil wird nicht gedrosselt — es bekommt deshalb kein kvs.
            Die Betriebsfälle stehen bei der Wärmepumpe.
          </div>
        ) : <>
          {fld('Δpvar (variable Anlage)','dp_var','z.B. 26','kPa')}
          {ver?.kvs_theor != null ? <>
            {ro('KVS theoretisch', ver.kvs_theor, 'm³/h·bar½')}
            <label style={lbl}>KVS gewählt (Norm-Reihe)</label>
            <select style={sel} value={d.kvs_eff||ver.kvs_vorschlag||''} onChange={e=>set('kvs_eff',e.target.value)}>
              {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===ver.kvs_vorschlag?' ← Vorschlag':''}</option>)}
            </select>
            <PvBox pv={ver.pv} v={ver.v} kvs_eff={ver.kvs_eff}/>
          </> : <div style={miniSt}>Δpvar eingeben — das Backend rechnet kvs + Autorität.</div>}
        </>}
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── PUMPE (Hauptpumpe) — Förderhöhe = gemeinsamer Teil + ungünstigster Ast ──
  if (node.type === 'pump') {
    const pr = pumpenResults?.[node.id];
    // Solepumpe: Betriebspunkt kommt vollständig aus dem Erdsondenfeld.
    // Volumenstrom und Förderhöhe genügen für die Fabrikatswahl.
    if (pr?.ist_solepumpe) {
      return (
        <div style={panelSt}>
          <PT>Solepumpe (Quellenkreis)</PT>
          {fld('Bezeichnung','label','Solepumpe','','text')}
          <Typenschild d={d} set={set}/>
          {ro("Fördervolumen V'", pr.v, 'm³/h', pr.v != null)}
          {ro('Förderhöhe', pr.foerderhoehe_mws, 'mWs', pr.foerderhoehe_mws != null)}
          {pr.foerderhoehe_kpa != null && ro('Förderhöhe', pr.foerderhoehe_kpa, 'kPa')}
          {pr.foerderhoehe_mws != null && (
            <div style={{fontSize:10,color:'#0369a1',background:'#f0f9ff',border:'1px solid #7dd3fc',borderRadius:6,padding:'6px 8px',marginTop:4}}>
              Leitungen {pr.dp_leitungen_mws ?? '—'} + Verteiler {pr.dp_verteiler_mws ?? '—'} + Wärmepumpe {pr.dp_wp_mws ?? '—'} mWs.
              Aus dem Erdsondenfeld übernommen — dort ändern, nicht hier.
            </div>
          )}
          {pr.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
          <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
        </div>
      );
    }
    return (
      <div style={panelSt}>
        <PT>Pumpe</PT>
        {fld('Bezeichnung','label','','','text')}
        <Typenschild d={d} set={set}/>
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
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── WÄRMEZÄHLER — übernimmt den Durchfluss der Leitung ──
  if (node.type === 'waermezaehler') {
    return (
      <div style={panelSt}>
        <PT>Wärmezähler</PT>
        {fld('Bezeichnung','label','','','text')}
        <Typenschild d={d} set={set}/>
        {v ? ro('Durchfluss (aus Leitung)', v, 'm³/h', true)
           : <div style={warnSt}>In eine Leitung mit Durchfluss setzen — der Zähler übernimmt automatisch.</div>}
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
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
        {!xr && <div style={miniSt}>Alle vier Werte eingeben — das Backend rechnet nach EN 12828 (PHYSIK §8).</div>}
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── ERZEUGER / WÄRMEPUMPE ──
  // Die Kennwerte beider Kreise rechnet das Backend (heatpump_results). Hier
  // stehen nur Eingaben und Anzeige — nichts wird im Frontend gerechnet.
  if (node.type === 'erzeuger') {
    const hp = heatpumpResults?.[node.id];
    const wp = istWaermepumpe(d.generator_type);
    const quelleMitMedium = hatSoleOderWasserkreis(d.generator_type);
    return (
      <div style={panelSt}>
        <PT>Wärmeerzeuger</PT>
        <ErzeugerTypFelder data={d} onSet={set}/>
        {fld('Bezeichnung','label','WE','','text')}
        {fld('Fabrikat / Typ','typ','optional','','text')}
        {fld('Nennleistung','leistung_kw','','kW')}
        {fld('VL Temperatur','vl_temp','','°C')}
        {fld('RL Temperatur','rl_temp','','°C')}
        {wp && <>
          <Div/>
          <div style={{ fontSize:9, color:'#94a3b8', marginBottom:6 }}>
            ENERGIEBILANZ — ohne COP oder elektrische Leistung bleibt die
            Umwelt-/Quellenleistung bewusst leer.
          </div>
          {fld('COP','cop','z.B. 4.0','')}
          {fld('Elektrische Leistung','p_el_kw','hat Vorrang vor COP','kW')}
        </>}
        {quelleMitMedium && <>
          {fld('Sole-VL (zur WP)','sole_vl','','°C')}
          {fld('Sole-RL (zur Quelle)','sole_rl','','°C')}
          {fld('c·ρ Sole','sole_ce','leer = aus Erdsondenfeld','kWh/m³K')}
        </>}
        {hp?.betriebsfaelle && <>
          <Div/>
          <div style={{ fontSize:9, color:'#94a3b8', marginBottom:6 }}>
            BWW-BETRIEBSPUNKT — bei höherer Vorlauftemperatur gilt ein anderer COP.
          </div>
          {fld('BWW-Vorlauf','bww_vl_temp','z.B. 55','°C')}
          {fld('BWW-Rücklauf','bww_rl_temp','z.B. 45','°C')}
          {fld('COP bei BWW-Temperatur','bww_cop','z.B. 2.6','')}
          {fld('Verfügbare Leistung bei BWW','bww_leistung_kw','leer = Nennleistung','kW')}
        </>}
        {hp && <>
          <Div/>
          {ro('Heizleistung', hp.q_heat_kw, 'kW')}
          {ro('ΔT Heizkreis', hp.heating_dt, 'K')}
          {ro("V' Heizkreis", hp.heating_flow_m3h, 'm³/h', true)}
          {wp && <>
            {ro('Elektrische Leistung', hp.p_el_kw, 'kW')}
            {ro('Quellenleistung', hp.q_source_kw, 'kW')}
          </>}
          {hp.source_flow_m3h != null && <>
            {ro('ΔT Solekreis', hp.source_dt, 'K')}
            {ro("V' Solekreis", hp.source_flow_m3h, 'm³/h', true)}
          </>}
          {hp.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
        </>}
        {hp?.betriebsfaelle && (
          <>
            <Div/>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>
              Betriebsfälle (Umschaltventil)
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead><tr style={{ color:'#94a3b8' }}>
                <th style={{ textAlign:'left', padding:'2px 0' }}>Fall</th>
                <th style={{ textAlign:'right' }}>Q</th><th style={{ textAlign:'right' }}>COP</th>
                <th style={{ textAlign:'right' }}>Quelle</th><th style={{ textAlign:'right' }}>V' Sole</th>
              </tr></thead>
              <tbody>
                {hp.betriebsfaelle.faelle.map(f=>{
                  const mass = f.key === hp.betriebsfaelle.massgebend;
                  return (
                    <tr key={f.key} style={{ borderTop:'1px solid #f1f5f9', fontWeight: mass?700:400,
                      color: mass?'#15803d':'#475569' }}>
                      <td style={{ padding:'3px 0' }}>{f.titel}{mass?' ◄':''}</td>
                      <td style={{ textAlign:'right' }}>{f.q_heiz_kw ?? '—'}</td>
                      <td style={{ textAlign:'right' }}>{f.cop ?? '—'}</td>
                      <td style={{ textAlign:'right' }}>{f.q_source_kw ?? '—'}</td>
                      <td style={{ textAlign:'right' }}>{f.solevolumenstrom_m3h ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b', marginTop:4 }}>
              Das Umschaltventil lässt nur einen Fall gleichzeitig zu. Massgebend für Erdsonden
              und Solekreis ist der mit der grösseren Quellenleistung — die Lasten werden nicht addiert.
            </div>
          </>
        )}
        <button style={btnBlue} onClick={()=>navigate('/rechner/ravel')}>→ RAVEL Wirtschaftlichkeit</button>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── SPEICHER ──
  if (node.type === 'speicher') {
    const sr = speicherResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>Technischer Speicher</PT>
        {fld('Bezeichnung','label','Speicher','','text')}
        {fld('Gewählter Speicherinhalt','speicher_liter','z.B. 800','L')}
        {sr?.speichervolumen_l != null && <>
          {ro('Auslegungsvorschlag', sr.speichervolumen_l, 'L', true)}
          {ro('Temperatur oben', sr.speicher_oben_c, '°C')}
          {ro('Temperatur unten', sr.speicher_unten_c, '°C')}
          <div style={{ fontSize:9, color:'#64748b', marginBottom:7 }}>
            {sr.leistung_kw} kW ({sr.leistungsquelle}) · {sr.ueberbrueckung_min} min · ΔT {Number(sr.speicher_oben_c - sr.speicher_unten_c).toFixed(1)} K
          </div>
        </>}
        {sr?.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
        <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 7px' }}>
          Automatik: Erzeugerleistung, sonst Summe der Verbrauchergruppen; oben höchste Gruppen-VL + 2 K, unten gerechneter Misch-Rücklauf. Im Doppelklick lassen sich die Eingaben kontrolliert überschreiben.
        </div>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  if (node.type === 'bww') {
    const br = bwwResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>BWW-Speicher</PT>
        {fld('Bezeichnung','label','BWW','','text')}
        {br?.anschlussleistung_kw != null && <>
          <Div/>
          {ro('Personen', br.personen, 'P')}
          {ro('Berechnetes Speichervolumen', br.speichervolumen_l, 'L', true)}
          {ro('Erforderliche Ladeleistung', br.anschlussleistung_kw, 'kW', true)}
          <div style={{ fontSize:9, lineHeight:1.5, color:br.register_vorschlag==='aussen'?'#9a3412':'#166534',
            background:br.register_vorschlag==='aussen'?'#fff7ed':'#f0fdf4',
            border:`1px solid ${br.register_vorschlag==='aussen'?'#fed7aa':'#bbf7d0'}`,
            borderRadius:6, padding:'6px 8px', marginTop:5 }}>
            <b>Registervorschlag:</b> {br.register_vorschlag_text}
          </div>
        </>}
        {br?.leistung_ausreichend === false && (
          <div style={{ ...warnSt, background:'#fef2f2', borderColor:'#fecaca', color:'#b91c1c' }}>
            ⚠ Wärmepumpenleistung reicht für den gewählten Ladebetrieb nicht.
          </div>
        )}
        <div style={{ fontSize:10, lineHeight:1.55, color:'#475569', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'8px 9px', marginTop:8 }}>
          <b>Doppelklick auf den Speicher</b> öffnet Belegungsdaten, Auslegung,
          Wärmepumpenabgleich, Diagramme und den vollständigen Rechenweg.
        </div>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── ERDSONDENFELD ──
  if (node.type === 'erdsonden') {
    const anzahl = Math.max(1, Math.min(24, parseInt(d.sonden_anzahl) || 5));
    const er = erdsondenResults?.[node.id];
    return (
      <div style={panelSt}>
        <PT>Erdsondenfeld</PT>
        {fld('Bezeichnung','label','Erdsondenfeld','','text')}
        <label style={lbl}>Anzahl Duplexsonden</label>
        <select style={sel} value={anzahl}
          onChange={e=>onUpdate(node.id, 'sonden_anzahl', parseInt(e.target.value))}>
          {Array.from({ length:24 }, (_, i) => i + 1).map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        {fld('Sondenlänge','sonden_laenge_m','z.B. 180','m')}
        {fld('Spezifische Entzugsleistung','entzugsleistung_w_m','standortbezogen','W/m')}
        {er?.erforderlich_gesamt_m != null && <>
          {ro('Erforderliche Gesamtbohrmeter', er.erforderlich_gesamt_m, 'm', er.ausreichend)}
          {ro('Erforderlich je Sonde', er.erforderlich_pro_sonde_m, 'm')}
          {ro('Gewählte Gesamtbohrmeter', er.ist_gesamt_m, 'm', er.ausreichend)}
        </>}
        {er?.gesamtinhalt_l != null && ro('Soleinhalt Feld', er.gesamtinhalt_l, 'L')}
        {er?.glykolbedarf_kg != null && ro('Glykolbedarf', er.glykolbedarf_kg, 'kg')}
        {er?.druckverlust?.foerderhoehe_mws != null && <>
          {ro('Förderhöhe Solepumpe', er.druckverlust.foerderhoehe_mws, 'mWs')}
          {ro('Fördervolumen', er.druckverlust.foerdervolumen_m3_h, 'm³/h')}
          {ro('Strömung in der Sonde', er.druckverlust.sonde_stroemungsart, '', er.druckverlust.sonde_turbulent)}
        </>}
        {er?.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
        <div style={{ fontSize:9, lineHeight:1.5, color:'#64748b', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 7px' }}>
          Die Quellenleistung kommt automatisch von der Wärmepumpe. Die spezifische Entzugsleistung ist bewusst eine sichtbare Projektangabe; es wird kein standortunabhängiger Pauschalwert eingesetzt.
        </div>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
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
        <select style={sel} value={parseInt(d.abgaenge)||4} onChange={e=>onSetAbgaenge(node.id, parseInt(e.target.value))}>
          {[2,3,4,5,6,7,8].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        {fld('Abstand VL–RL Balken','hoehe','700 (Standard für neue Verteiler)','px')}
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
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
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
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
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
        <div style={miniSt}>
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
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── TEXTBLOCK ──
  if (node.type === 'label') {
    return (
      <div style={panelSt}>
        <PT>Textblock</PT>
        <div style={{ marginBottom: 7 }}>
          <label style={lbl}>Text</label>
          <textarea rows={4} value={d.label ?? ''} onChange={e=>set('label', e.target.value)}
            style={{ ...inp, resize:'vertical', lineHeight:1.4 }} placeholder="Freier Text …" />
        </div>
        {fld('Schriftgrösse','fontSize','12','px')}
        <div style={{ fontSize:10, color:'#94a3b8', lineHeight:1.5 }}>
          Direkt auf der Leinwand: Doppelklick zum Bearbeiten, ziehen zum Verschieben. Ausgewählten Textblock mit ⌘C/⌘V kopieren.
        </div>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  if (node.type === 'concrete_area') {
    return (
      <div style={panelSt}>
        <PT>Betonfläche</PT>
        <label style={lbl}>Schraffur-Skalierung</label>
        <input type="range" min="3" max="60" step="1"
          value={Math.max(3, Math.min(60, Number(d.hatch_scale) || 8))}
          onChange={event => set('hatch_scale', Number(event.target.value))}
          style={{ width:'100%', accentColor:'#64748b' }} />
        <input type="number" min="3" max="60" step="1" style={inp}
          value={Math.max(3, Math.min(60, Number(d.hatch_scale) || 8))}
          onChange={event => set('hatch_scale', Math.max(3, Math.min(60, Number(event.target.value) || 8)))} />
        <div style={{ marginTop:5, fontSize:9, color:'#64748b' }}>
          Kleiner Wert = dichtere Schraffur. Die Einstellung wird identisch in den Vektorplot übernommen.
        </div>
        <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
      </div>
    );
  }

  // ── DEFAULT ──
  return (
    <div style={panelSt}>
      <PT>{TITLES[node.type] || node.type}</PT>
      {fld('Bezeichnung','label','','','text')}
      {ARMATUREN.has(node.type) && <>
        <Typenschild d={d} set={set}/>
        {v ? ro("V' (aus Leitung)", v, 'm³/h', true) : null}
      </>}
      <DatenblockSchalter node={node} onUpdate={onUpdate} /><Div/><DelBtn onClick={()=>onDelete(node.id)}/>
    </div>
  );
}

// ── Auslegungs-Modal (Doppelklick auf ein Bauteil) ───────────
const TITLES = {
  gruppe: 'Verbrauchergruppe', heizkreis: 'Heizkreis', heizkoerper:'Heizkörper', luftheizapparat:'Luftheizapparat', valve2: '2-Wege Regelventil',
  valve3: '3-Wege Mischventil', pump: 'Pumpe', erzeuger: 'Wärmeerzeuger',
  verteiler: 'Verteiler', speicher: 'Speicher', erdsonden: 'Erdsondenfeld',
  waermezaehler: 'Wärmezähler', expansion: 'Expansionsgefäss',
  bww: 'Brauchwarmwasser-Speicher', shutoff: 'Kugelhahn / Absperrventil',
  stad: 'STAD-Strangregulierventil', temperatur: 'Temperaturfühler',
  sicherheitsventil: 'Sicherheitsventil', pwt: 'Plattentauscher (PWT)',
  checkvalve: 'Rückschlagventil', anschluss: 'Anschluss-Marker',
  waermezaehler_cad: 'Wärmezähler', lufterhitzer: 'Lufterhitzer',
  lufterhitzer_gruppe: 'Lufterhitzer-Gruppe',
};

function BigVal({ label, value, unit = '', sub = '', color = '#1d4ed8' }) {
  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 14px' }}>
      <div style={hinweisSt}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'monospace' }}>
        {value != null && value !== '' ? `${value}${unit ? ' ' + unit : ''}` : '—'}
      </div>
      {sub && <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function BwwDiagramm({ titel, daten, ladefunktion = false }) {
  if (!daten?.length) return null;
  return (
    <div style={{ border:'1px solid #e2e8f0', borderRadius:10, background:'#fff', padding:'12px 12px 8px' }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#334155', marginBottom:8 }}>{titel}</div>
      <div style={{ width:'100%', height:270 }}>
        <ResponsiveContainer>
          <ComposedChart data={daten} margin={{ top:8, right:12, bottom:6, left:2 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="stunde" tick={{ fontSize:10 }}
              label={{ value:'Tageszeit [h]', position:'insideBottom', offset:-2, fontSize:10 }}/>
            <YAxis yAxisId="volumen" tick={{ fontSize:10 }} width={48} unit=" L"/>
            <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)} L`, name]}
              labelFormatter={value => `${value}:00 Uhr`}/>
            <Legend wrapperStyle={{ fontSize:10, paddingTop:8 }}/>
            <Bar yAxisId="volumen" dataKey="stundenvolumen_l" name="Stundenspitze"
              fill="#3b82f6" radius={[2,2,0,0]}/>
            <Line yAxisId="volumen" dataKey="kumuliert_l" name="Stundenspitze aufsummiert"
              stroke="#dc2626" strokeWidth={2.5} dot={false}/>
            {ladefunktion && (
              <Line yAxisId="volumen" dataKey="ladekurve_l" name="Ladekurve (+10 %)"
                stroke="#84a832" strokeWidth={2.5} dot={false}/>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AuslegungModal({ node, v, gr, vr, ver, pr, xr, sr, er, br, onUpdate, onClose, navigate }) {
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
      <div style={stapel}>
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
              <select style={sel} value={schaltung} onChange={e=>set('schaltung',e.target.value)}>
                {SCHALTUNGSARTEN.map(s=><option key={s.wert} value={s.wert}>{s.name}</option>)}
              </select>
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:3 }}>{SCHALTUNGSARTEN.find(s=>s.wert===schaltung)?.hinweis}</div></div>
            <div><label style={lbl}>Typ (Wärmeabgabe)</label>
              <select style={sel} value={d.typ||''} onChange={e=>{
                const s=WAERMEABGABE.find(x=>x.label===e.target.value);
                set('typ',e.target.value); if(s){set('vl_temp',s.vl);set('rl_temp',s.rl);}
              }}>
                <option value="">— wählen —</option>
                {WAERMEABGABE.map(x=><option key={x.label}>{x.label}</option>)}
              </select></div>
            <div style={gitter3eng}>
              <div><label style={lbl}>VL [°C]</label><input type="number" style={inpVl} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
              <div><label style={lbl}>RL [°C]</label><input type="number" style={inpRl} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
              <div><label style={lbl}>Q [kW]</label><input type="number" style={inp} value={d.q_kw??''} onChange={e=>set('q_kw',e.target.value)} placeholder="8.5"/></div>
            </div>
            <div><label style={lbl}>Druckverlust Ast [kPa] — für den ungünstigsten Ast am Verteiler</label>
              <input type="number" style={inp} value={d.dp_kpa??''} onChange={e=>set('dp_kpa',e.target.value)} placeholder="20"/></div>
            <div style={gitter2}>
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
            {d.hat_wz && <Typenschild d={d} set={set} praefix="wz_"/>}
          </>
        )}

        {aktTab === 'pumpe' && (
          <>
            <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{d.label ? `${d.label} — ` : ''}Pumpe (Sekundärkreis, V' = {gr?.m_sek!=null?Number(gr.m_sek).toFixed(3):'—'} m³/h)</div>
            <Typenschild d={d} set={set} praefix="pumpe_"/>
            <div style={gitter3eng}>
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
            <Typenschild d={d} set={set} praefix="ventil_"/>
            <div><label style={lbl}>Druckverlust geregelter Ast ohne Regelventil [kPa]</label>
              <input type="number" style={inp} value={d.dp_kpa??''} onChange={e=>set('dp_kpa',e.target.value)} placeholder="20"/></div>
            {gr?.ventil ? (
              <>
                <div style={gitter2}>
                  <BigVal label="kvs theoretisch" value={Number(gr.ventil.kvs_theor).toFixed(3)} color="#1e293b"/>
                  <BigVal label="kvs Vorschlag" value={gr.ventil.kvs_vorschlag} color="#1d4ed8" sub="nächstgrösser, Norm-Reihe"/>
                </div>
                <div><label style={lbl}>kvs gewählt</label>
                  <select style={sel} value={d.ventil_kvs_eff||gr.ventil.kvs_vorschlag||''} onChange={e=>set('ventil_kvs_eff',e.target.value)}>
                    {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===gr.ventil.kvs_vorschlag?'  ← Vorschlag':''}</option>)}
                  </select></div>
                <PvBox pv={gr.ventil.pv} v={gr.ventil.v} kvs_eff={gr.ventil.kvs_eff}/>
              </>
            ) : (
              <div style={warnSt}>Druckverlust Ast eingeben — dann rechnet das Backend kvs + Ventilautorität automatisch aus dem Gruppen-Volumenstrom.</div>
            )}
          </>
        )}
      </div>
    );
  } else if (node.type === 'lufterhitzer_gruppe') {
    // Untergruppe am Anschlussmarker: VL/RL kommen von der Hauptgruppe, nur
    // Leistung und Druckverlust werden hier eingegeben (Dominic 2026-08-05).
    body = (
      <div style={stapel}>
        <div><label style={lbl}>Schaltung</label>
          <select style={sel} value={lufterhitzerSchaltungVon(d)} onChange={e=>set('schaltung',e.target.value)}>
            {SCHALTUNGSARTEN.map(s=><option key={s.wert} value={s.wert}>{s.name}</option>)}
          </select></div>
        <div><label style={lbl}>Anlagennummer / Bezeichnung</label>
          <input type="text" style={inp} value={d.anlage_nr??''} onChange={e=>set('anlage_nr',e.target.value)} placeholder="z.B. LE 3 — Halle Nord"/></div>
        <div style={gitter2eng}>
          <div><label style={lbl}>Leistung Q [kW]</label>
            <input type="number" style={inp} value={d.q_kw??''} onChange={e=>set('q_kw',e.target.value)} placeholder="12"/></div>
          <div><label style={lbl}>Druckverlust geregelter Ast ohne Regelventil [kPa]</label>
            <input type="number" style={inp} value={d.dp_kpa??''} onChange={e=>set('dp_kpa',e.target.value)} placeholder="20"/></div>
        </div>

        {gr?.vl != null
          ? <div style={{ fontSize:11, color:'#475569', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px' }}>
              VL/RL <b>{gr.vl} / {gr.rl} °C</b> — übernommen von {gr.quelle || 'der Hauptgruppe'} über den Anschlussmarker.
            </div>
          : <div style={warnSt}>Noch keine Hauptgruppe verbunden. Anschlussmarker setzen und mit der Lufterhitzer-Verbrauchergruppe koppeln — dann kommen VL/RL von dort.</div>}

        <div style={gitter2}>
          <BigVal label="V' Lufterhitzer" value={gr?.m_sek!=null?Number(gr.m_sek).toFixed(3):null} unit="m³/h" color="#15803d"
            sub={gr?.dt_sek!=null?`ΔT = ${gr.dt_sek} K`:''}/>
          <BigVal label="Ventil kvs" value={gr?.ventil?.kvs_eff??null} unit=""
            sub={gr?.ventil?.pv!=null?`Ventilautorität Pv = ${gr.ventil.pv.toFixed(1)} %`:'Druckverlust Ast eingeben'}/>
        </div>

        {gr?.pumpe && <BigVal label="Umwälzpumpe" value={gr.pumpe.dp_kpa!=null?gr.pumpe.dp_kpa.toFixed(1):null} unit="kPa"
          sub={gr.pumpe.dp_kpa!=null?`${gr.pumpe.mws.toFixed(2)} mWS · V' ${Number(gr.pumpe.v??0).toFixed(3)} m³/h`:'Rohrlänge/Apparate bei der Verbrauchergruppe ergänzen'}/>}

        {/* Typenschilder der eingebauten Bauteile — sie stehen im Datenkästchen
            am Bauteil und im PDF-Export. */}
        {gr?.pumpe && <div><div style={{ fontSize:11, fontWeight:700, color:'#1e293b', marginBottom:4 }}>Umwälzpumpe</div>
          <Typenschild d={d} set={set} praefix="pumpe_"/></div>}
        <div><div style={{ fontSize:11, fontWeight:700, color:'#1e293b', marginBottom:4 }}>Regelventil</div>
          <Typenschild d={d} set={set} praefix="ventil_"/></div>
        <label style={{ display:'flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:12, color:'#374151' }}>
          <input type="checkbox" checked={!!d.hat_wz} onChange={e=>set('hat_wz',e.target.checked)}/>
          Wärmezähler im Rücklauf
        </label>
        {d.hat_wz && <Typenschild d={d} set={set} praefix="wz_"/>}
      </div>
    );
  } else if (node.type === 'verteiler') {
    body = vr ? (
      <div style={stapel}>
        <div style={gitter2}>
          <BigVal label="VL Verteiler" value={vr.vl_vt!=null?vr.vl_vt.toFixed(1):null} unit="°C" color="#dc2626" sub="höchste Gruppen-VL (PHYSIK §4)"/>
          <BigVal label="RL Misch" value={vr.rl_misch!=null?vr.rl_misch.toFixed(1):null} unit="°C" color="#2563eb" sub="mengengewichtet über Primär-Flüsse"/>
        </div>
        <div style={gitter2}>
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
  } else if (node.type === 'heizkreis' || node.type === 'heizkoerper' || node.type === 'luftheizapparat') {
    const vl=parseFloat(d.vl_temp), rl=parseFloat(d.rl_temp);
    const dt=vl-rl, calc = v ?? null; // V' kommt vom Backend
    body = (
      <div style={stapel}>
        {node.type === 'heizkoerper' && <div><label style={lbl}>Darstellung</label>
          <select style={sel} value={d.darstellung || 'flaeche'} onChange={e=>set('darstellung', e.target.value)}>
            <option value="flaeche">Grüne Fläche (frei skalierbar)</option>
            <option value="schema">Kompakter Schema-Abgang</option>
          </select></div>}
        <div style={gitter2}>
          <div><label style={lbl}>Vorlauf [°C]</label>
            <input type="number" style={inpVl} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)} placeholder="35"/></div>
          <div><label style={lbl}>Rücklauf [°C]</label>
            <input type="number" style={inpRl} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)} placeholder="28"/></div>
        </div>
        <div><label style={lbl}>Leistung Q [kW]</label>
          <input type="number" style={inp} value={d.q_kw??''} onChange={e=>set('q_kw',e.target.value)} placeholder="8.5"/></div>
        {node.type !== 'heizkreis' && <Typenschild d={d} set={set} />}
        <BigVal label="Volumenstrom V'" value={calc!=null?calc.toFixed(4):null} unit="m³/h" color="#15803d"
          sub={calc!=null?`V' = Q / (1.163 · ΔT),  ΔT = ${dt} K  →  ${(calc*1000).toFixed(0)} l/h`:'Vorlauf, Rücklauf und Leistung eingeben'}/>
      </div>
    );
  } else if (node.type === 'valve2' || node.type === 'valve3') {
    const umschaltend = node.type === 'valve3' && (d.funktion || 'mischend') === 'umschaltend';
    body = umschaltend ? (
      <div style={stapel}>
        <div><label style={lbl}>Funktion</label>
          <select style={sel} value={d.funktion||'mischend'} onChange={e=>set('funktion',e.target.value)}>
            <option value="mischend">Mischend — regelt eine Temperatur</option>
            <option value="umschaltend">Umschaltend — zwei Stellungen (BWW-Vorrang)</option>
          </select></div>
        <BigVal label="Durchfluss V' (aus der Leitung)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"/>
        <div style={{ fontSize:11, lineHeight:1.6, color:'#334155' }}>
          Ein Umschaltventil kennt zwei Stellungen und drosselt nicht. Es bekommt deshalb
          weder Δpvar noch kvs noch eine Ventilautorität. Zwischen Wärmepumpe und technischem
          Speicher heisst das: <b>entweder Brauchwarmwasser oder Verbrauchergruppen</b>.
          Die beiden Betriebsfälle stehen bei der Wärmepumpe.
        </div>
      </div>
    ) : (
      <div style={stapel}>
        {node.type === 'valve3' && (
          <div><label style={lbl}>Funktion</label>
            <select style={sel} value={d.funktion||'mischend'} onChange={e=>set('funktion',e.target.value)}>
              <option value="mischend">Mischend — regelt eine Temperatur</option>
              <option value="umschaltend">Umschaltend — zwei Stellungen (BWW-Vorrang)</option>
            </select></div>
        )}
        <BigVal label="Durchfluss V' (aus der Leitung)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"
          sub={v?'kommt automatisch aus dem Schema':'Bauteil in eine Leitung mit Durchfluss setzen'}/>
        <div><label style={lbl}>Δpvar — Druckabfall variabler Anlagenteil [kPa]</label>
          <input type="number" style={inp} value={d.dp_var??''} onChange={e=>set('dp_var',e.target.value)} placeholder="26"/></div>
        {ver?.kvs_theor != null ? <>
          <div style={gitter2}>
            <BigVal label="kvs theoretisch" value={Number(ver.kvs_theor).toFixed(3)} color="#1e293b"/>
            <BigVal label="kvs Vorschlag" value={ver.kvs_vorschlag} color="#1d4ed8" sub="nächstgrösser, Norm-Reihe"/>
          </div>
          <div><label style={lbl}>kvs gewählt</label>
            <select style={sel} value={d.kvs_eff||ver.kvs_vorschlag||''} onChange={e=>set('kvs_eff',e.target.value)}>
              {KVS_REIHE.map(k=><option key={k} value={k}>{k}{k===ver.kvs_vorschlag?'  ← Vorschlag':''}</option>)}
            </select></div>
          <PvBox pv={ver.pv} v={ver.v} kvs_eff={ver.kvs_eff}/>
        </> : <div style={warnSt}>Δpvar eingeben — dann rechnet das Backend die kvs-Auslegung.</div>}
      </div>
    );
  } else if (node.type === 'pump') {
    body = pr?.ist_solepumpe ? (
      <div style={stapel}>
        <div style={gitter2}>
          <BigVal label="Fördervolumen" value={pr.v!=null?pr.v.toFixed(3):null} unit="m³/h" color="#15803d"
            sub="aus dem Solevolumenstrom der Wärmepumpe"/>
          <BigVal label="Förderhöhe" value={pr.foerderhoehe_mws!=null?pr.foerderhoehe_mws.toFixed(2):null} unit="mWs" color="#7c3aed"
            sub={pr.foerderhoehe_kpa!=null?`= ${pr.foerderhoehe_kpa.toFixed(1)} kPa`:'Erdsondenfeld vervollständigen'}/>
        </div>
        <div style={{ fontSize:11, color:'#334155' }}>
          Zusammensetzung: Leitungen <b>{pr.dp_leitungen_mws ?? '—'}</b> + Verteiler <b>{pr.dp_verteiler_mws ?? '—'}</b>
          {' '}+ Wärmepumpe <b>{pr.dp_wp_mws ?? '—'}</b> mWs.
        </div>
        <div style={hinweisSt}>
          Beides kommt aus dem Erdsondenfeld im Quellenkreis; dort sind Rohre, Längen und
          Wärmeträger hinterlegt. Mit Fördervolumen und Förderhöhe lässt sich die Umwälzpumpe
          direkt im Fabrikatskatalog auswählen.
        </div>
        {pr.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
      </div>
    ) : (
      <div style={stapel}>
        <BigVal label="Förder-Volumenstrom V' (aus der Leitung)" value={v?v.toFixed(4):null} unit="m³/h" color="#15803d"/>
        <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>Δp gemeinsamer Teil (Rohr + Apparate)</div>
        <div style={gitter3eng}>
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
      <div style={stapel}>
        <BigVal label="Durchfluss (aus der Leitung übernommen)" value={v?v.toFixed(4):null} unit="m³/h" color="#0f766e"
          sub="Der Wärmezähler übernimmt automatisch den Durchfluss der Leitung, in der er sitzt."/>
        <div style={gitter2eng}>
          <div><label style={lbl}>Typ</label><input style={inp} value={d.typ??''} onChange={e=>set('typ',e.target.value)} placeholder="z.B. Ultraschall"/></div>
          <div><label style={lbl}>Fabrikat</label><input style={inp} value={d.fabrikat??''} onChange={e=>set('fabrikat',e.target.value)} placeholder=""/></div>
        </div>
      </div>
    );
  } else if (node.type === 'expansion') {
    const ews = d.medium === 'ews';
    body = (
      <div style={stapel}>
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
        <div style={gitter2eng}>
          <div><label style={lbl}>Vsys bekannt? (überschreibt Tabelle) [l]</label><input type="number" style={inp} value={d.anlageinhalt_l??''} onChange={e=>set('anlageinhalt_l',e.target.value)} placeholder="optional"/></div>
          <div><label style={lbl}>Speicherinhalt Vsto [l]</label><input type="number" style={inp} value={d.speicher_l??''} onChange={e=>set('speicher_l',e.target.value)} placeholder="optional"/></div>
          <div><label style={lbl}>Medium</label>
            <select style={sel} value={d.medium||'heizungswasser'} onChange={e=>set('medium',e.target.value)}>
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
            <div style={gitter2}>
              <BigVal label="Nennvolumen VN,min" value={xr.vn_l.toFixed(1)} unit="l" color="#15803d"/>
              <BigVal label="Vorschlag Norm-Grösse" value={xr.vorschlag_l} unit="l" color="#1d4ed8" sub="nächstgrösser"/>
            </div>
            <div style={hinweisSt}>
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
    const wp = istWaermepumpe(d.generator_type);
    const quelleMitMedium = hatSoleOderWasserkreis(d.generator_type);
    body = (
      <div style={{ display:'grid', gap:10 }}>
        <ErzeugerTypFelder data={d} onSet={set}/>
        <div><label style={lbl}>Fabrikat / Typ (frei)</label><input style={inp} value={d.typ??''} onChange={e=>set('typ',e.target.value)} placeholder="optional"/></div>
        <div style={gitter3eng}>
          <div><label style={lbl}>Leistung [kW]</label><input type="number" style={inp} value={d.leistung_kw??''} onChange={e=>set('leistung_kw',e.target.value)}/></div>
          <div><label style={lbl}>VL [°C]</label><input type="number" style={inp} value={d.vl_temp??''} onChange={e=>set('vl_temp',e.target.value)}/></div>
          <div><label style={lbl}>RL [°C]</label><input type="number" style={inp} value={d.rl_temp??''} onChange={e=>set('rl_temp',e.target.value)}/></div>
        </div>
        {/* Quellenseite — nur bei Wärmepumpen. Q_source = Q_heat − P_el; ohne
            COP/P_el bleibt sie leer statt der Heizleistung gleichgesetzt. */}
        {wp && <>
          <div style={gitter2eng}>
            <div><label style={lbl}>COP</label><input type="number" style={inp} value={d.cop??''} onChange={e=>set('cop',e.target.value)} placeholder="z.B. 4.0"/></div>
            <div><label style={lbl}>P_el [kW]</label><input type="number" style={inp} value={d.p_el_kw??''} onChange={e=>set('p_el_kw',e.target.value)} placeholder="hat Vorrang"/></div>
          </div>
          <div style={gitter2eng}>
            <div><label style={lbl}>BWW-Leistung am Betriebspunkt [kW]</label><input type="number" min="0" style={inp} value={d.bww_leistung_kw??''} onChange={e=>set('bww_leistung_kw',e.target.value)} placeholder="leer = Nennleistung"/></div>
            <div style={{ fontSize:10, color:'#64748b', alignSelf:'end', paddingBottom:6 }}>
              Wird beim BWW-Speicher gegen die erforderliche Anschlussleistung geprüft.
            </div>
          </div>
        </>}
        {quelleMitMedium && <>
          <div style={gitter3eng}>
            <div><label style={lbl}>Sole-VL [°C]</label><input type="number" style={inp} value={d.sole_vl??''} onChange={e=>set('sole_vl',e.target.value)}/></div>
            <div><label style={lbl}>Sole-RL [°C]</label><input type="number" style={inp} value={d.sole_rl??''} onChange={e=>set('sole_rl',e.target.value)}/></div>
            <div><label style={lbl}>c·ρ Sole</label><input type="number" style={inp} value={d.sole_ce??''} onChange={e=>set('sole_ce',e.target.value)} placeholder="1.163"/></div>
          </div>
        </>}
        <button style={btnBlue} onClick={()=>navigate('/rechner/ravel')}>→ RAVEL Wirtschaftlichkeit</button>
      </div>
    );
  } else if (node.type === 'speicher') {
    body = (
      <div style={{ display:'grid', gap:10 }}>
        <div><label style={lbl}>Gewählter Speicherinhalt [L]</label>
          <input type="number" min="0" style={inp} value={d.speicher_liter??''} onChange={e=>set('speicher_liter',e.target.value)} placeholder="z.B. 800"/></div>
        <div style={gitter2}>
          <div><label style={lbl}>Überbrückungszeit [min]</label><input type="number" min="1" style={inp} value={d.ueberbrueckung_min??15} onChange={e=>set('ueberbrueckung_min',e.target.value)}/></div>
          <div><label style={lbl}>Überdeckung [K]</label><input type="number" min="0" style={inp} value={d.speicher_ueberdeckung_k??2} onChange={e=>set('speicher_ueberdeckung_k',e.target.value)}/></div>
          <div><label style={lbl}>Leistung manuell [kW]</label><input type="number" min="0" style={inp} value={d.auslegung_leistung_kw??''} onChange={e=>set('auslegung_leistung_kw',e.target.value)} placeholder="leer = automatisch"/></div>
          <div><label style={lbl}>Max. VL manuell [°C]</label><input type="number" style={inp} value={d.auslegung_vorlauf_c??''} onChange={e=>set('auslegung_vorlauf_c',e.target.value)} placeholder="leer = automatisch"/></div>
          <div><label style={lbl}>RL manuell [°C]</label><input type="number" style={inp} value={d.auslegung_ruecklauf_c??''} onChange={e=>set('auslegung_ruecklauf_c',e.target.value)} placeholder="leer = automatisch"/></div>
        </div>
        <div style={gitter3}>
          <BigVal label="Vorschlag" value={sr?.speichervolumen_l} unit="L" color="#15803d" sub={`${sr?.leistung_kw ?? '—'} kW · ${sr?.leistungsquelle ?? '—'}`}/>
          <BigVal label="Oben" value={sr?.speicher_oben_c} unit="°C" color="#dc2626" sub="max. VL + Überdeckung"/>
          <BigVal label="Unten" value={sr?.speicher_unten_c} unit="°C" color="#2563eb" sub="Misch-Rücklauf"/>
        </div>
        {sr?.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
        <div style={hinweisSt}>
          Der Vorschlag überschreibt den gewählten Speicher nicht automatisch. Berechnet wird im Backend aus Leistung × Zeit / (c × ΔT × ρ).
        </div>
      </div>
    );
  } else if (node.type === 'bww') {
    const wohnungen = wohnungenAusDaten(d);
    const setWohnungen = (zeilen) => set('bww_wohnungen', zeilen);
    const bwwTabs = [['wohnungen','Wohnungen'], ['auslegung','Auslegung'], ['diagramme','Diagramme'], ['rechenweg','Rechenweg']];
    const bwwTab = bwwTabs.some(([k]) => k === tab) ? tab : 'wohnungen';
    const rechenweg = br?.rechenweg || [];
    body = (
      <div style={stapel}>
        <div style={{ display:'flex', gap:2, borderBottom:'2px solid #f1f5f9' }}>
          {bwwTabs.map(([k,t]) => (
            <button key={k} onClick={()=>setTab(k)}
              style={{ padding:'7px 18px', fontSize:12, fontWeight:600, cursor:'pointer', background:'none', border:'none',
                borderBottom: bwwTab===k?'2.5px solid #dc2626':'2.5px solid transparent',
                color: bwwTab===k?'#dc2626':'#64748b', marginBottom:-2 }}>
              {t}
            </button>
          ))}
        </div>

        {bwwTab === 'wohnungen' && <>
          <div style={{ fontSize:11, color:'#475569' }}>
            Pro Wohnung wird die Standardbelegung aus der Nutzfläche berechnet. Die Bezeichnung
            bleibt frei, damit sie deinem Projekt entspricht.
          </div>
          <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 90px 34px', gap:8,
              padding:'7px 10px', background:'#f8fafc', fontSize:10, fontWeight:700, color:'#64748b' }}>
              <span>Wohnung</span><span>Nutzfläche A<sub>NF</sub> [m²]</span><span>Personen</span><span/>
            </div>
            {wohnungen.map((wohnung, index) => {
              const berechnet = br?.wohnungen?.find(w => w.id === wohnung.id)?.personen;
              return (
                <div key={wohnung.id} style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 90px 34px', gap:8,
                  alignItems:'center', padding:'7px 10px', borderTop:index?'1px solid #f1f5f9':'none' }}>
                  <input style={inp} value={wohnung.name}
                    onChange={e=>setWohnungen(wohnungAendern(wohnungen, wohnung.id, 'name', e.target.value))}/>
                  <input type="number" min="1" style={inp} value={wohnung.flaeche_m2}
                    onChange={e=>setWohnungen(wohnungAendern(wohnungen, wohnung.id, 'flaeche_m2', e.target.value))}
                    placeholder="z.B. 85"/>
                  <span style={{ textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#1e293b' }}>
                    {berechnet != null ? Number(berechnet).toFixed(2) : '—'} P
                  </span>
                  <button type="button" title="Wohnung entfernen"
                    onClick={()=>setWohnungen(wohnungEntfernen(wohnungen, wohnung.id))}
                    style={{ border:0, background:'transparent', color:'#94a3b8', cursor:'pointer', padding:4 }}>
                    <Trash2 size={15}/>
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={()=>setWohnungen(wohnungHinzufuegen(wohnungen))}
            style={{ ...btnBlue, width:'auto', justifySelf:'start', padding:'7px 14px', marginTop:0 }}>
            + Wohnung hinzufügen
          </button>
          <div style={gitter3}>
            <BigVal label="Wohnungen" value={br?.wohnungen?.length || 0} color="#475569"/>
            <BigVal label="Personen total" value={br?.personen} unit="P" color="#1d4ed8"/>
            <BigVal label="Nutzwarmwasser" value={br?.nutzwarmwasserbedarf_l_d} unit="L/d" color="#0f766e"/>
          </div>
          <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8 }}>
            <label style={lbl}>Alternative Direktangabe Personen [P]</label>
            <input type="number" min="0" style={{...inp,maxWidth:220}} value={d.bww_personen??''}
              onChange={e=>set('bww_personen',e.target.value)} placeholder="nur ohne Wohnungsflächen"/>
          </div>
        </>}

        {bwwTab === 'auslegung' && <>
          <div style={gitter3}>
            <div><label style={lbl}>Gebäudeart / Bezugseinheit</label>
              <select style={inp} value={d.bww_bezugseinheit||'mfh_allgemein'} onChange={e=>set('bww_bezugseinheit',e.target.value)}>
                {BWW_BEZUGSEINHEITEN.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}
              </select></div>
            <div><label style={lbl}>Warmhaltesystem</label>
              <select style={inp} value={d.bww_warmhaltesystem||'zirkulation'} onChange={e=>set('bww_warmhaltesystem',e.target.value)}>
                <option value="zirkulation">Zirkulation (1.50)</option>
                <option value="warmhalteband">Warmhalteband (1.35)</option>
              </select></div>
            <div><label style={lbl}>Speicherkonfiguration</label>
              <select style={inp} value={d.bww_speicherkonfiguration||'aussen'} onChange={e=>set('bww_speicherkonfiguration',e.target.value)}>
                <option value="aussen">Aussenliegender Wärmetauscher (1.10)</option>
                <option value="innen">Innenliegender Wärmetauscher (1.25)</option>
              </select>
              {br?.register_vorschlag_text && (
                <div style={{ fontSize:9, lineHeight:1.45, color:br.register_vorschlag==='aussen'?'#9a3412':'#166534', marginTop:4 }}>
                  Vorschlag bei Grenze {br.register_grenze_kw} kW: {br.register_vorschlag_text}
                </div>
              )}</div>
            <div><label style={lbl}>Ladezyklen pro Tag</label><input type="number" min="1" step="1" style={inp} value={d.bww_ladezyklen??2} onChange={e=>set('bww_ladezyklen',e.target.value)}/></div>
            <div><label style={lbl}>Zeit eines Ladezyklus [h]</label><input type="number" min="0.1" step="0.1" style={inp} value={d.bww_ladezeit_h??2} onChange={e=>set('bww_ladezeit_h',e.target.value)}/></div>
            <div><label style={lbl}>Temperaturerhöhung Δθ [K]</label><input type="number" min="1" style={inp} value={d.bww_delta_theta_k??50} onChange={e=>set('bww_delta_theta_k',e.target.value)}/></div>
            <div><label style={lbl}>Wirkungsgrad Wärmeübertragung</label><input type="number" min="0.01" max="1" step="0.01" style={inp} value={d.bww_wirkungsgrad??0.95} onChange={e=>set('bww_wirkungsgrad',e.target.value)}/></div>
            <div><label style={lbl}>Gewählter Speicher zum Vergleich [L]</label><input type="number" min="0" style={inp} value={d.speicher_liter??''} onChange={e=>set('speicher_liter',e.target.value)} placeholder="optional"/></div>
            <div><label style={lbl}>Ladeleistung manuell [kW]</label><input type="number" min="0" style={inp} value={d.bww_ladeleistung_kw??''} onChange={e=>set('bww_ladeleistung_kw',e.target.value)} placeholder="leer = automatisch"/></div>
          </div>

          <SubTitel>Speicher und Wärmetauscher</SubTitel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10 }}>
            <BigVal label="Steuervolumen" value={br?.steuervolumen_l} unit="L" color="#0369a1"/>
            <BigVal label="Spitzendeckung" value={br?.spitzendeckungsvolumen_l} unit="L" color="#7c3aed"/>
            <BigVal label="Bereitschaft" value={br?.bereitschaftsvolumen_l} unit="L" color="#0f766e"/>
            <BigVal label="Speichervolumen" value={br?.speichervolumen_l} unit="L" color="#15803d"
              sub={`${br?.speicherkonfiguration || 'Konfiguration'} · f ${br?.faktor_speicherkonfiguration ?? '—'}`}/>
            <BigVal label="Anschlussleistung" value={br?.anschlussleistung_kw} unit="kW" color="#dc2626"/>
          </div>

          <SubTitel>Abgleich Wärmepumpe</SubTitel>
          <div style={gitter3}>
            <BigVal label="BWW benötigt" value={br?.anschlussleistung_kw} unit="kW" color="#dc2626"/>
            <BigVal label="Wärmepumpe verfügbar" value={br?.waermepumpenleistung_kw} unit="kW"
              color={br?.leistung_ausreichend===false?'#dc2626':'#15803d'} sub={br?.waermepumpenleistung_quelle}/>
            <BigVal label="Leistungsreserve" value={br?.leistungsreserve_kw} unit="kW"
              color={br?.leistung_ausreichend===false?'#dc2626':'#15803d'}/>
          </div>
          {br?.leistung_ausreichend === false && (
            <div style={{ ...warnSt, fontSize:11, background:'#fef2f2', borderColor:'#fecaca', color:'#b91c1c' }}>
              <b>Wärmepumpe zu klein für diesen Ladebetrieb.</b>
              {br.ladezeit_min_fuer_wp_h != null && <> Ladezeit auf mindestens <b>{br.ladezeit_min_fuer_wp_h} h</b> erhöhen.</>}
              {br.ladezyklen_min_fuer_wp != null && <> Alternativ mindestens <b>{br.ladezyklen_min_fuer_wp} Ladezyklen/Tag</b>;
                der Speichervorschlag sinkt dann auf <b>{br.speichervolumen_bei_zyklen_l} L</b>.</>}
            </div>
          )}
          {br?.warnungen?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
        </>}

        {bwwTab === 'diagramme' && <>
          <div style={{ fontSize:11, color:'#475569' }}>
            Die Stundenprofile und Summenlinien stammen aus der geprüften Excel-Vorlage.
            Die Literwerte reagieren direkt auf das berechnete Speichervolumen.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <BwwDiagramm titel="Summenliniendiagramm Montag bis Freitag" daten={br?.diagramme?.werktag}/>
            <BwwDiagramm titel="Summenliniendiagramm Samstag/Sonntag" daten={br?.diagramme?.wochenende}/>
          </div>
          <BwwDiagramm titel="Ladefunktion Montag bis Freitag" daten={br?.diagramme?.ladefunktion} ladefunktion/>
        </>}

        {bwwTab === 'rechenweg' && (
          rechenweg.length ? (
            <div style={stapel}>
              {gruppiert(rechenweg).map(([gruppe, schritte])=><div key={gruppe}>
                <SubTitel>{gruppe}</SubTitel>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, marginTop:4 }}><tbody>
                  {schritte.map((s,i)=><tr key={i} style={{ borderTop:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'6px 8px 6px 0', fontWeight:700, color:'#1e293b', whiteSpace:'nowrap', width:130, verticalAlign:'top' }}>{s.groesse}</td>
                    <td style={{ padding:'6px 8px', color:'#334155', verticalAlign:'top' }}>
                      <div style={{ fontSize:15, overflowX:'auto', overflowY:'hidden' }}><MathFormula latex={s.formel_latex} fallback={s.formel}/></div>
                      <div style={{ display:'flex', gap:5, alignItems:'center', color:'#64748b', marginTop:3, overflowX:'auto', overflowY:'hidden' }}>
                        <span>=</span><MathFormula latex={s.eingesetzt_latex} fallback={s.eingesetzt}/>
                      </div>
                    </td>
                    <td style={{ padding:'6px 0 6px 8px', textAlign:'right', fontWeight:700, whiteSpace:'nowrap', verticalAlign:'top' }}>{s.ergebnis}</td>
                  </tr>)}
                </tbody></table>
              </div>)}
              <div style={hinweisSt}>
                Grundlage: bereitgestellte Excel-Berechnung. Ergebnisse und derselbe Rechenweg werden im Export ausgegeben.
              </div>
            </div>
          ) : <div style={{ fontSize:12, color:'#94a3b8' }}>Wohnungsflächen oder Personenzahl eingeben, damit der Rechenweg entsteht.</div>
        )}
      </div>
    );
  } else if (node.type === 'erdsonden') {
    const anzahl = Math.max(1, Math.min(24, parseInt(d.sonden_anzahl) || 5));
    const laenge = parseFloat(d.sonden_laenge_m);
    const dv = er?.druckverlust;
    const ewsRechenweg = [
      ...(er?.rechenweg || []).map(schritt => ({
        ...schritt,
        gruppe: '0 Bohrmeterauslegung',
      })),
      ...(dv?.rechenweg || []),
    ];
    const ewsTabs = [['bohrmeter','Bohrmeter'], ['solekreis','Solekreis'], ['rechenweg','Rechenweg']];
    const ewsTab = ewsTabs.some(([k]) => k === tab) ? tab : 'bohrmeter';
    body = (
      <div style={{ display:'grid', gap:10 }}>
        <div style={{ display:'flex', gap:2, borderBottom:'2px solid #f1f5f9' }}>
          {ewsTabs.map(([k,t]) => (
            <button key={k} onClick={()=>setTab(k)}
              style={{ padding:'7px 18px', fontSize:12, fontWeight:600, cursor:'pointer', background:'none', border:'none',
                borderBottom: ewsTab===k?'2.5px solid #dc2626':'2.5px solid transparent',
                color: ewsTab===k?'#dc2626':'#64748b', marginBottom:-2 }}>
              {t}
            </button>
          ))}
        </div>

        {ewsTab === 'bohrmeter' && <>
          <div style={gitter3}>
            <div><label style={lbl}>Anzahl Duplexsonden</label>
              <select style={sel} value={anzahl}
                onChange={e=>set('sonden_anzahl', parseInt(e.target.value))}>
                {Array.from({ length:24 }, (_, i) => i + 1).map(k=><option key={k} value={k}>{k}</option>)}
              </select></div>
            <div><label style={lbl}>Sondenlänge (Bohrtiefe) [m]</label>
              <input type="number" min="1" style={inp} value={d.sonden_laenge_m??''}
                onChange={e=>set('sonden_laenge_m',e.target.value)} placeholder="z.B. 220"/></div>
            <div><label style={lbl}>Sondenbauart</label>
              <select style={inp} value={d.sonden_bauart??'duplex'} onChange={e=>set('sonden_bauart',e.target.value)}>
                <option value="duplex">Duplex (2 U-Rohre)</option>
                <option value="einfach">Einfach-U (1 U-Rohr)</option>
              </select></div>
            <div><label style={lbl}>Quellenleistung manuell [kW]</label><input type="number" min="0" style={inp} value={d.quellenleistung_kw??''} onChange={e=>set('quellenleistung_kw',e.target.value)} placeholder="leer = Wärmepumpe"/></div>
            <div><label style={lbl}>Spezifische Entzugsleistung [W/m]</label><input type="number" min="1" style={inp} value={d.entzugsleistung_w_m??''} onChange={e=>set('entzugsleistung_w_m',e.target.value)} placeholder="standortbezogen"/></div>
            <div><label style={lbl}>Sicherheitsfaktor</label><input type="number" min="1" step="0.01" style={inp} value={d.sonden_sicherheitsfaktor??1.1} onChange={e=>set('sonden_sicherheitsfaktor',e.target.value)}/></div>
          </div>
          <div style={gitter2}>
            <BigVal label="Duplexsonden" value={anzahl} color="#4f46e5" sub="je zwei U-Rohre"/>
            <BigVal label="Gesamtbohrmeter"
              value={Number.isFinite(laenge) && laenge > 0 ? Math.round(anzahl * laenge).toLocaleString('de-CH') : null}
              unit="m" color="#7c3aed" sub="Anzahl × Sondenlänge"/>
          </div>
          <div style={gitter3}>
            <BigVal label="Erforderlich" value={er?.erforderlich_gesamt_m} unit="m" color={er?.ausreichend===false?'#dc2626':'#15803d'} sub={`${er?.quellenleistung_kw ?? '—'} kW · ${er?.leistungsquelle ?? 'keine Quelle'}`}/>
            <BigVal label="Soleinhalt" value={er?.gesamtinhalt_l} unit="L" color="#0369a1" sub="Duplexrohre + Zusatz"/>
            <BigVal label="Glykol" value={er?.glykolbedarf_kg} unit="kg" color="#a16207" sub={`${er?.glykol_konzentration_pct ?? '—'} %`}/>
          </div>
          <div style={hinweisSt}>
            Die Bohrmeterberechnung ist eine transparente Planungshilfe. Standort-, Bewilligungsdaten und EED-Nachweis bleiben extern zu prüfen.
          </div>
        </>}

        {ewsTab === 'solekreis' && <>
          <SubTitel>Rohre der drei Teilstücke</SubTitel>
          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1.4fr 1fr', gap:10 }}>
            <div><label style={lbl}>Erdwärmesonde</label>
              <select style={inp} value={d.sole_rohr_sonde??'pe32x2.9'} onChange={e=>set('sole_rohr_sonde',e.target.value)}>
                {SOLE_ROHRE.filter(r=>r.sonde).map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
              </select></div>
            <div><label style={lbl}>Inhalt WP + Expansion [L]</label><input type="number" min="0" style={inp} value={d.sole_zusatzinhalt_l??''} onChange={e=>set('sole_zusatzinhalt_l',e.target.value)} placeholder="z.B. 5"/></div>
            <div><label style={lbl}>Rohr Zuleitung Sonde–Verteiler</label>
              <select style={inp} value={d.sole_rohr_zuleitung_verteiler??'pe50x4.7'} onChange={e=>set('sole_rohr_zuleitung_verteiler',e.target.value)}>
                {SOLE_ROHRE.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
              </select></div>
            <div><label style={lbl}>Kritischer Weg [m einfach]</label><input type="number" min="0" style={inp} value={d.sole_zuleitung_verteiler_m??''} onChange={e=>set('sole_zuleitung_verteiler_m',e.target.value)} placeholder="z.B. 30"/></div>
            <div><label style={lbl}>Alle Anschlussrohre [m VL+RL]</label><input type="number" min="0" style={inp} value={d.sole_zuleitung_verteiler_gesamt_vl_rl_m??''} onChange={e=>set('sole_zuleitung_verteiler_gesamt_vl_rl_m',e.target.value)} placeholder="für Füllinhalt"/></div>
            <div><label style={lbl}>Rohr Zuleitung Verteiler–WP</label>
              <select style={inp} value={d.sole_rohr_zuleitung_wp??'pe50x4.7'} onChange={e=>set('sole_rohr_zuleitung_wp',e.target.value)}>
                {SOLE_ROHRE.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
              </select></div>
            <div><label style={lbl}>Länge [m]</label><input type="number" min="0" style={inp} value={d.sole_zuleitung_wp_m??''} onChange={e=>set('sole_zuleitung_wp_m',e.target.value)} placeholder="z.B. 16"/></div>
            <div><label style={lbl}>Rohrrauheit [mm]</label><input type="number" min="0.001" step="0.001" style={inp} value={d.sole_rauheit_mm??0.015} onChange={e=>set('sole_rauheit_mm',e.target.value)}/></div>
            <div><label style={lbl}>Zeta Verteiler</label><input type="number" min="0" step="0.1" style={inp} value={d.sole_zeta_verteiler??12} onChange={e=>set('sole_zeta_verteiler',e.target.value)}/></div>
          </div>

          {dv?.druckstufe && (
            <div style={dv.druckstufe.ausreichend === false ? { ...warnSt, fontSize:11 }
              : { fontSize:11, color:'#15803d', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'5px 8px' }}>
              <b>Nenndruckstufe:</b> Sondentiefe {dv.druckstufe.tiefe_m} m liegt im Bereich {dv.druckstufe.bereich} →
              {' '}SIA 384/6:2021 verlangt <b>{dv.druckstufe.pn ?? '—'}</b>
              {dv.druckstufe.max_ueberdruck_bar ? ` (${dv.druckstufe.max_ueberdruck_bar} bar am Sondenfuss, inkl. 3 bar Betriebsdruck)` : ''}.
              {' '}Gewähltes Rohr: <b>{dv.druckstufe.gewaehlt_pn ?? '—'}</b>
              {dv.druckstufe.ausreichend === false ? ' — reicht nicht.' : dv.druckstufe.ausreichend ? ' — genügt.' : ''}
            </div>
          )}

          <SubTitel>Angaben aus dem Wärmepumpen-Datenblatt</SubTitel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Solevolumenstrom [m³/h]</label><input type="number" min="0" step="0.01" style={inp} value={d.sole_volumenstrom_m3h??''} onChange={e=>set('sole_volumenstrom_m3h',e.target.value)} placeholder="Datenblatt"/></div>
            <div><label style={lbl}>Sole-ΔT [K] (Ersatz)</label><input type="number" min="0" step="0.1" style={inp} value={d.sole_dt_k??''} onChange={e=>set('sole_dt_k',e.target.value)} placeholder="nur ohne Volumenstrom"/></div>
            <div><label style={lbl}>Druckverlust Verdampfer [mWs]</label><input type="number" min="0" step="0.01" style={inp} value={d.sole_dp_wp_mws??''} onChange={e=>set('sole_dp_wp_mws',e.target.value)} placeholder="Datenblatt"/></div>
            <div><label style={lbl}>Anzahl Verteiler</label><input type="number" min="0" style={inp} value={d.sole_verteiler_anzahl??1} onChange={e=>set('sole_verteiler_anzahl',e.target.value)}/></div>
          </div>

          <SubTitel>Wärmeträger primärseitig</SubTitel>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:10 }}>
            <div><label style={lbl}>Produkt und Konzentration</label>
              <select style={inp} value={d.sole_traeger??'antifrogen_n_25'} onChange={e=>set('sole_traeger',e.target.value)}>
                {SOLE_TRAEGER.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
              </select></div>
            <div><label style={lbl}>Glykolanteil [%]</label><input type="number" min="0" max="100" style={inp} value={d.glykol_pct??''} onChange={e=>set('glykol_pct',e.target.value)} placeholder={String(dv?.konzentration_pct ?? '')}/></div>
            <div><label style={lbl}>Dichte [kg/m³]</label><input type="number" min="1" style={inp} value={d.sole_dichte_kg_m3??''} onChange={e=>set('sole_dichte_kg_m3',e.target.value)} placeholder={String(dv?.dichte_kg_m3 ?? '')}/></div>
            <div><label style={lbl}>cp [kJ/kgK]</label><input type="number" min="0.1" step="0.01" style={inp} value={d.sole_cp_kj_kgk??''} onChange={e=>set('sole_cp_kj_kgk',e.target.value)} placeholder={String(dv?.cp_kj_kgk ?? '')}/></div>
            <div><label style={lbl}>kin. Zähigkeit [mm²/s]</label><input type="number" min="0.1" step="0.01" style={inp} value={d.sole_viskositaet_mm2_s??''} onChange={e=>set('sole_viskositaet_mm2_s',e.target.value)} placeholder={String(dv?.viskositaet_mm2_s ?? '')}/></div>
          </div>
          <div style={{ fontSize:10, color:'#64748b' }}>
            Dichte, Zähigkeit und Frostschutzgrenze stammen 1:1 aus den Zellkommentaren von <b>Erdsonden.xlsx</b>.
            Die spezifische Wärmekapazität steht dort nicht und ist ein Richtwert; sie wird nur gebraucht, wenn der
            Volumenstrom aus Quellenleistung und Sole-ΔT bestimmt wird. Leer lassen heisst: Wert des gewählten Produkts.
          </div>

          {dv?.teilstuecke?.length > 0 && <>
            <SubTitel>Strömung je Teilstück</SubTitel>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead><tr style={{ color:'#64748b', textAlign:'right' }}>
                  <th style={{ ...thSt, textAlign:'left' }}>Teilstück</th>
                  <th style={thSt}>Ø innen</th><th style={thSt}>L</th><th style={thSt}>w</th>
                  <th style={thSt}>Re</th><th style={{ ...thSt, textAlign:'left' }}>Strömungsart</th>
                  <th style={thSt}>λ</th><th style={thSt}>Δp</th>
                </tr></thead>
                <tbody>
                  {dv.teilstuecke.map((t,i)=>(
                    <tr key={i} style={{ borderTop:'1px solid #f1f5f9' }}>
                      <td style={{ ...tdSt, textAlign:'left' }}>{t.name}</td>
                      <td style={tdSt}>{t.innen_d_mm} mm</td>
                      <td style={tdSt}>{t.laenge_m} m</td>
                      <td style={tdSt}>{Number(t.geschwindigkeit_m_s).toFixed(3)} m/s</td>
                      <td style={tdSt}>{Number(t.reynolds).toLocaleString('de-CH')}</td>
                      <td style={{ ...tdSt, textAlign:'left', fontWeight:600,
                        color: i===0 && t.stroemungsart==='Laminar' ? '#dc2626' : '#334155' }}>{t.stroemungsart}</td>
                      <td style={tdSt}>{t.lambda ?? '—'}</td>
                      <td style={tdSt}>{t.druckverlust_mws ?? '—'} mWs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
            <BigVal label="Füllinhalt total" value={dv?.inhalt_total_l} unit="L" color="#0369a1"
              sub={`Sonden ${dv?.inhalt_sonden_l ?? '—'} L`}/>
            <BigVal label="Wärmeträger" value={dv?.waermetraeger_l} unit="L" color="#a16207"
              sub={`volumetrisch ${dv?.konzentrat_volumetrisch_l ?? '—'} L`}/>
            <BigVal label="Förderhöhe" value={dv?.foerderhoehe_mws} unit="mWs" color="#7c3aed"
              sub={`Leitungen ${dv?.druckverlust_leitungen_mws ?? '—'} + WP ${dv?.druckverlust_wp_mws ?? '—'}`}/>
            <BigVal label="Fördervolumen" value={dv?.foerdervolumen_m3_h} unit="m³/h"
              color={dv?.sonde_turbulent === false ? '#dc2626' : '#15803d'}
              sub={dv?.volumenstrom_quelle ?? 'Volumenstrom fehlt'}/>
          </div>
        </>}

        {ewsTab === 'rechenweg' && (
          ewsRechenweg.length > 0 ? (
            <div style={stapel}>
              {gruppiert(ewsRechenweg).map(([gruppe, schritte])=>(
                <div key={gruppe}>
                  <SubTitel>{gruppe.replace(/^\d+\s/, '')}</SubTitel>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, marginTop:4 }}>
                    <tbody>
                      {schritte.map((s,i)=>(
                        <tr key={i} style={{ borderTop:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'4px 8px 4px 0', fontWeight:700, color:'#1e293b', whiteSpace:'nowrap', verticalAlign:'top', width:90 }}>{s.groesse}</td>
                          <td style={{ padding:'4px 8px', color:'#334155', verticalAlign:'top' }}>
                            <div style={{ fontSize:13, overflowX:'auto', padding:'2px 0' }}>
                              <MathFormula latex={s.formel_latex} fallback={s.formel}/>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'#64748b', marginTop:2, overflowX:'auto' }}>
                              <span aria-hidden="true">=</span>
                              <MathFormula latex={s.eingesetzt_latex} fallback={s.eingesetzt}/>
                            </div>
                          </td>
                          <td style={{ padding:'4px 0 4px 8px', textAlign:'right', fontWeight:700, color:'#0f172a', whiteSpace:'nowrap', verticalAlign:'top' }}>{s.ergebnis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div style={hinweisSt}>
                Derselbe Rechenweg erscheint im PDF-Export. Die Berechnung ist eine Planungshilfe und ersetzt
                die Prüfung durch den verantwortlichen Fachplaner nicht.
              </div>
            </div>
          ) : (
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              Sobald Rohre, Längen und Volumenstrom vollständig sind, steht hier jeder Rechenschritt mit Formel und eingesetzten Werten.
            </div>
          )
        )}

        {er?.warnings?.map((w,i)=><div key={i} style={warnSt}>⚠ {w}</div>)}
      </div>
    );
  } else {
    body = <div style={{ fontSize:12, color:'#94a3b8' }}>Für dieses Bauteil ist in Phase 1 noch keine Auslegung hinterlegt.</div>;
  }

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e=>e.stopPropagation()}
        style={['erdsonden','bww'].includes(node.type) ? { ...modalCard, width:'min(1180px, 96vw)' } : modalCard}>
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
// Wiederkehrende Layouts als Konstanten: ein Stil-Objekt im JSX wird bei jedem
// Render neu erzeugt und macht jeden Vergleich der Kindkomponente wertlos.
const sel = { ...inp, cursor:'pointer' };
const inpVl = { ...inp, borderColor:'#fca5a5' };
const inpRl = { ...inp, borderColor:'#93c5fd' };
const stapel = { display:'grid', gap:12 };
const gitter2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 };
const gitter3 = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 };
const gitter2eng = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 };
const gitter3eng = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 };
const hinweisSt = { fontSize:11, color:'#64748b' };
const miniSt = { fontSize:9, color:'#94a3b8', marginTop:4 };
// Gebäudearten SIA 385/2. Spiegel von backend/app/calculations/bww_sia385.py;
// gerechnet wird im Backend, hier stehen nur die Beschriftungen.
const BWW_BEZUGSEINHEITEN = [
  { key:'efh_einfach', label:'EFH einfacher Standard (40/50)' },
  { key:'efh_mittel', label:'EFH mittlerer Standard (45/60)' },
  { key:'efh_gehoben', label:'EFH gehobener Standard (55/70)' },
  { key:'ew_einfach', label:'Eigentumswohnung einfacher Standard (40/50)' },
  { key:'ew_mittel', label:'Eigentumswohnung mittlerer Standard (45/60)' },
  { key:'ew_gehoben', label:'Eigentumswohnung gehobener Standard (55/70)' },
  { key:'mfh_allgemein', label:'MFH allgemeiner Wohnungsbau (35/45)' },
  { key:'mfh_gehoben', label:'MFH gehobener Wohnungsbau (45/60)' },
];

const thSt = { fontSize:10, fontWeight:600, padding:'4px 6px', textAlign:'right', whiteSpace:'nowrap' };
const tdSt = { padding:'4px 6px', textAlign:'right', whiteSpace:'nowrap', color:'#334155' };

// Rechenweg nach Gruppen bündeln, Reihenfolge wie vom Backend geliefert.
function gruppiert(schritte) {
  const gruppen = [];
  for (const s of schritte) {
    const name = s.gruppe || 'Rechenweg';
    const treffer = gruppen.find(([g]) => g === name);
    if (treffer) treffer[1].push(s);
    else gruppen.push([name, [s]]);
  }
  return gruppen;
}

function SubTitel({ children }) {
  return (
    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
      color:'#94a3b8', marginTop:4, borderBottom:'1px solid #f1f5f9', paddingBottom:3 }}>
      {children}
    </div>
  );
}
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
  // Ohne Autorität gibt es nichts anzuzeigen. Früher lief die Komponente hier
  // in pv.toFixed() und riss den ganzen Editor mit (weisse Seite).
  if (typeof pv !== 'number' || !Number.isFinite(pv)) return null;
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
  const { screenToFlowPosition, getInternalNode, getZoom, fitView, setCenter } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeGeometryVersion = useStore(state => {
    let signature = '';
    state.nodeLookup.forEach(node => {
      const position = node.internals?.positionAbsolute || node.position || {};
      signature += `${node.id}:${position.x || 0}:${position.y || 0}:${node.measured?.width || 0}:${node.measured?.height || 0}|`;
    });
    return signature;
  });
  // Zoom für die Statusleiste (Punkt 15) — live aus dem Viewport, nicht gemerkt.
  const zoomAnzeige = useStore(state => state.transform[2]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected]     = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedEdgePoint, setSelectedEdgePoint] = useState(null);
  const [selectedGripPoints, setSelectedGripPoints] = useState([]);
  const selectedGripPointsRef = useRef([]);
  const [selectedEdgeSegment, setSelectedEdgeSegment] = useState(null); // { edgeId, segmentIndex }
  const [selectedSegments, setSelectedSegments] = useState([]); // mehrere { edgeId, segmentIndex }
  const [activeLayerId, setActiveLayerId] = useState('heizung_vl');
  const [layerVisibility, setLayerVisibility] = useState(DEFAULT_LAYER_VISIBILITY);
  const [showLayers, setShowLayers] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [paletteGroupsOpen, setPaletteGroupsOpen] = useState(() => ({
    Erzeuger:true,
    Speicher:true,
    Verteilung:true,
  }));
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [drawingConfig, setDrawingConfig] = useState(DEFAULT_DRAWING_CONFIG);
  // Persönliche Tastenbelegung (pro Benutzer gespeichert, nicht am Projekt).
  // Der Ref hält sie ausserhalb des Renderzyklus bereit, weil das Laden eines
  // Schemas sie sofort über die Schemawerte legen muss.
  const eigeneShortcutsRef = useRef({});
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [shortcutFehler, setShortcutFehler] = useState('');
  // Firmenweite Schema-Vorlagen (Standardschaltungen).
  const [vorlagen, setVorlagen] = useState([]);
  const [vorlageDialogOpen, setVorlageDialogOpen] = useState(false);
  const [vorlageName, setVorlageName] = useState('');
  const [vorlageBeschreibung, setVorlageBeschreibung] = useState('');
  const [vorlageSaving, setVorlageSaving] = useState(false);
  const [vorlageFehler, setVorlageFehler] = useState('');
  const [leitungsEntwurf, setLeitungsEntwurf] = useState(null);
  // EIN zentraler Befehlszustand (`schema/editorMode.js`). `modify` ist der
  // Grundzustand; ESC führt aus jedem Befehl dorthin zurück. Die beiden Booleans
  // `zeichenModus`/`dauerLeitung` werden daraus ABGELEITET und bleiben nur als
  // Lesehilfe für den bestehenden Code — die Wahrheit steht im Modus.
  const [editorMode, setEditorMode] = useState(initialMode);
  const editorModeRef = useRef(HOME);
  const zeichenModus = zeichnetLeitung(editorMode);
  const dauerLeitung = zeichenModus && editorMode.persistent;
  const istGrundzustand = istModify(editorMode);
  // Welches Bauteil ist gerade „geladen"? Treibt Palette-Hervorhebung und Vorschau.
  const platzierTyp = istBefehl(editorMode, PLACE) ? editorMode.payload?.nodeType : null;
  const zeichenModusRef = useRef(false);
  const dauerLeitungRef = useRef(false);
  // ORTHO wie im CAD: umschaltbarer Zustand, kein fest verdrahtetes Verhalten.
  // Shift kehrt ihn temporär um (siehe `cadConstraints.aktiverConstraint`).
  const [orthoAn, setOrthoAn] = useState(true);
  const orthoAnRef = useRef(true);
  // Objektfang gesamthaft abschaltbar (CAD-Statusleiste). Das Raster bleibt.
  const [snapAn, setSnapAn] = useState(true);
  const snapAnRef = useRef(true);
  // Punkt 16 — Space hält temporär das Pan-Werkzeug. Solange es gedrückt ist,
  // darf kein Punkt gesetzt und nichts ausgewählt werden.
  const [spacePan, setSpacePan] = useState(false);
  const spacePanRef = useRef(false);
  // Auswahlfenster: EINE Betriebsart — nur vollständig umschlossene Elemente.
  // Die aus dem CAD bekannte Richtungslogik (rechts→links wählt auch berührte)
  // liess sich nicht verlässlich umsetzen: React Flow übernimmt eine mitten im
  // Ziehen geänderte Betriebsart nicht mehr für die laufende Auswahl. Halb
  // funktionierend wäre schlimmer als eingeschränkt, darum bewusst fest.
  const selectionMode = SelectionMode.Full;
  // Punkt 2 — Weltkoordinate der Platzierungsvorschau. Sie ist die EINZIGE
  // Quelle für die Anzeige UND für den Klick, damit das Bauteil genau dort
  // landet, wo der Geist steht.
  const [platzierVorschau, setPlatzierVorschau] = useState(null);
  const platzierVorschauRef = useRef(null);
  // Punkt 25 — der Leitungsabschnitt, der beim Klick geteilt würde. Treibt die
  // Hervorhebung; `null` heisst „freies Platzieren".
  const [inlineTreffer, setInlineTreffer] = useState(null);
  // Rückmeldung des Ausrichten-Befehls (Schritt oder Verweigerungsgrund).
  const [ausrichtenHinweis, setAusrichtenHinweis] = useState(null);
  // Numerische Direkteingabe während des Zeichnens: Puffer der getippten Länge.
  // Solange er nicht null ist, dürfen KEINE Shortcuts feuern.
  const [laengenPuffer, setLaengenPuffer] = useState(null);
  const laengenPufferRef = useRef(null);
  const [winkelPuffer, setWinkelPuffer] = useState(null);
  const winkelPufferRef = useRef(null);
  const [dynamikFeld, setDynamikFeld] = useState('length');
  // Underlay: Hintergrund-Plan zum Nachzeichnen (§ Editor #5). Firmenweit im
  // Projekt gespeichert, aber getrennt vom Autosave des Graphen geladen.
  const [underlay, setUnderlay] = useState(null);
  const [underlayBusy, setUnderlayBusy] = useState(false);
  const [showUnderlayPanel, setShowUnderlayPanel] = useState(false);
  const underlayInputRef = useRef(null);
  const underlayPatchTimer = useRef(null);
  const underlayDrag = useRef(null);
  const [leitungsCursor, setLeitungsCursor] = useState(null);
  const [leitungsSnap, setLeitungsSnap] = useState(null);
  const [leitungsGuides, setLeitungsGuides] = useState([]);
  const [aufgenommeneFangpunkte, setAufgenommeneFangpunkte] = useState([]);
  const aufgenommeneFangpunkteRef = useRef([]);
  const fangHoverRef = useRef(null);
  const [fangOverride, setFangOverride] = useState(null);
  const fangOverrideRef = useRef(null);
  const [segmentVerschiebung, setSegmentVerschiebung] = useState(null);
  const [griffMass, setGriffMass] = useState(null); // Mass beim Ziehen eines Eck-/Endpunkts
  const [endpointMenu, setEndpointMenu] = useState(null); // { x, y, edgeId, side }
  const [edgeMenu, setEdgeMenu] = useState(null); // { x, y, edgeId, point }
  const [gripMenu, setGripMenu] = useState(null);
  const gripMenuTimer = useRef(null);
  const [paneMenu, setPaneMenu] = useState(null);
  const [befehlszeile, setBefehlszeile] = useState('');
  const [befehlszeileAktiv, setBefehlszeileAktiv] = useState(false);
  const [letzteBefehle, setLetzteBefehle] = useState([]);
  const letzteBefehleRef = useRef([]);
  const wiederholeLetztenRef = useRef(() => false);
  const [markierteEdgeIds, setMarkierteEdgeIds] = useState([]);
  // ── Modify-Befehle mit Basispunkt (§74) ──────────────────────────────────
  // Kopieren, Spiegeln, Drehen und Reihe sind EIN Zustand, weil sie denselben
  // Ablauf haben: Auswahl → Basispunkt → Zielpunkt. Vier getrennte Zustände
  // würden dieselbe Klickfolge viermal beschreiben und dabei auseinanderlaufen.
  //
  //   art          COPY | MIRROR | ROTATE | ARRAY
  //   snapshot     eingefrorene Auswahl für die Kopien (unabhängig vom Graphen)
  //   umfang       { nodeIds, edgeIds } für die Befehle, die an Ort wirken
  //   basis        erster gesetzter Punkt (Basispunkt bzw. erster Achspunkt)
  //   cursor       aktueller, bereits gefangener Punkt — was der Klick anwendet
  //   achse        zweiter Achspunkt beim Spiegeln
  //   abstand      Versatz der ersten Kopie einer Reihe
  //   puffer       getippte Zahl (Winkel beim Drehen, Anzahl bei der Reihe)
  const [transformBefehl, setTransformBefehl] = useState(null);
  const transformBefehlRef = useRef(null);
  transformBefehlRef.current = transformBefehl;
  // Rückfrage vor dem Neunummerieren: { gesamt, aenderungen }. Nummern wandern
  // erst auf ausdrückliche Bestätigung — sie stehen auch in bereits
  // exportierten Plänen (§83).
  const [neuNummerieren, setNeuNummerieren] = useState(null);
  // Basis- und Zielpunkt werden an EINER Stelle gesetzt: im Capture-Lauf der
  // Zeichenfläche (`cadHandlePointerDown`). Der läuft vor Auswahl, Griffen und
  // React Flow, und damit gehört der Klick immer dem laufenden Befehl — egal,
  // ob er auf leerer Fläche, auf einer Leitung oder genau auf einem Griff
  // liegt. Gerade dort liegt er meistens, dafür gibt es ja den Objektfang.
  //
  // Der Verweis ist nötig, weil der Capture-Lauf früher definiert wird als der
  // Befehl selbst.
  const transformKlickRef = useRef(null);
  // ── Notiz-Stecknadeln (Dominic 2026-07-31) ──────────────────────────────
  // Ein Journaleintrag kann an einer Stelle im Schema hängen. Der Editor zeigt
  // die Nadeln seines Schemas, setzt neue und öffnet den Eintrag direkt hier —
  // geschrieben und gelesen wird derselbe Eintrag wie in der Dokumentation.
  const [notizen, setNotizen] = useState([]);
  const [nadelModus, setNadelModus] = useState(false);
  const [offeneNotiz, setOffeneNotiz] = useState(null);  // { id, titel, text, neu }
  const nadelModusRef = useRef(false);
  nadelModusRef.current = nadelModus;

  // Beschriftung (DN/m'), die gerade angewählt ist — Entf blendet genau sie aus.
  const [selectedLabelEdgeId, setSelectedLabelEdgeId] = useState(null);
  // Laufender Verschieben-Befehl: { ziele, basis, cursor }. Die Auswahl steht
  // beim Start fest, damit ein Klick auf die Fläche sie nicht abwählt.
  const [verschiebung, setVerschiebung] = useState(null);
  const verschiebungRef = useRef(null);
  verschiebungRef.current = verschiebung;
  // Mit Lücke trennen (BREAK): { edgeId, erster } — der zweite Klick trennt.
  const [luecke, setLuecke] = useState(null);
  const lueckeRef = useRef(null);
  lueckeRef.current = luecke;
  // Dehnen (STRETCH): erst das Fenster, dann Basis- und Zielpunkt.
  const [dehnen, setDehnen] = useState(null);   // { ecke1, ecke2, basis, cursor }
  const dehnenRef = useRef(null);
  dehnenRef.current = dehnen;
  const [befehlHinweis, setBefehlHinweis] = useState(null);
  const [schemaName, setSchemaName] = useState('Schema');
  const [projectName, setProjectName] = useState('');
  const [schemaId, setSchemaId]     = useState(null);
  const [loaded, setLoaded]         = useState(false);
  const [saveState, setSaveState]   = useState('idle'); // idle | saving | saved | error
  const [exportState, setExportState] = useState('idle'); // idle | loading
  const [revisionenOpen, setRevisionenOpen] = useState(false);
  const [revisionen, setRevisionen] = useState([]);
  const [revisionenLoading, setRevisionenLoading] = useState(false);
  const [revisionDetailId, setRevisionDetailId] = useState(null);
  const [standDialogOpen, setStandDialogOpen] = useState(false);
  const [standBezeichnung, setStandBezeichnung] = useState('');
  const [standNotiz, setStandNotiz] = useState('');
  const [standSaving, setStandSaving] = useState(false);
  const [standFehler, setStandFehler] = useState('');
  const [restoreId, setRestoreId] = useState(null);
  const [auslegung, setAuslegung]   = useState(null);   // Bauteil für Doppelklick-Auslegung
  // Legende standardmässig sichtbar (Dominic 2026-07-20) — die Bauteil-Kästchen
  // sollen automatisch da sein. Wer sie schliesst, dem bleibt sie zu (gemerkt).
  const [showLegende, setShowLegende] = useState(() => {
    try { return localStorage.getItem('hc_showLegende') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('hc_showLegende', showLegende ? '1' : '0'); } catch { /* localStorage evtl. blockiert */ }
  }, [showLegende]);
  const [showWarnungen, setShowWarnungen] = useState(false);
  const [schaltungswahl, setSchaltungswahl] = useState(null); // {nodeId, x, y} — Menü nach Gruppe-Drop
  const leitungsEntwurfRef = useRef(null);
  const leitungsCursorRef = useRef(null);
  const leitungsCursorFrame = useRef(null);

  useEffect(() => { leitungsEntwurfRef.current = leitungsEntwurf; }, [leitungsEntwurf]);
  useEffect(() => {
    editorModeRef.current = editorMode;
    zeichenModusRef.current = zeichnetLeitung(editorMode);
    dauerLeitungRef.current = zeichnetLeitung(editorMode) && editorMode.persistent;
  }, [editorMode]);
  useEffect(() => { orthoAnRef.current = orthoAn; }, [orthoAn]);
  useEffect(() => { snapAnRef.current = snapAn; }, [snapAn]);
  useEffect(() => { spacePanRef.current = spacePan; }, [spacePan]);
  useEffect(() => { platzierVorschauRef.current = platzierVorschau; }, [platzierVorschau]);
  useEffect(() => { laengenPufferRef.current = laengenPuffer; }, [laengenPuffer]);
  useEffect(() => { winkelPufferRef.current = winkelPuffer; }, [winkelPuffer]);
  useEffect(() => { leitungsCursorRef.current = leitungsCursor; }, [leitungsCursor]);
  useEffect(() => { aufgenommeneFangpunkteRef.current = aufgenommeneFangpunkte; }, [aufgenommeneFangpunkte]);
  useEffect(() => { fangOverrideRef.current = fangOverride; }, [fangOverride]);
  useEffect(() => { letzteBefehleRef.current = letzteBefehle; }, [letzteBefehle]);
  useEffect(() => { selectedGripPointsRef.current = selectedGripPoints; }, [selectedGripPoints]);
  useEffect(() => {
    if (istModify(editorMode)) return;
    setLetzteBefehle(verlauf => befehlMerken(verlauf, editorMode));
  }, [editorMode]);

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
            // Die Systemklasse ist Teil der Hydraulik, nicht nur Darstellung:
            // Bei freien Anschlusszonen erkennt das Backend darüber, ob eine
            // WP-Leitung Quellen- oder Abgabekreis ist.
            data:e.data ? {
              laenge_m:e.data.laenge_m,
              layer_id:e.data.layer_id || layer.id,
            } : { layer_id:layer.id },
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
  const heatpumpResults = hydraulik.heatpump_results || EMPTY_OBJECT;
  const speicherResults = hydraulik.speicher_results || EMPTY_OBJECT;
  const erdsondenResults = hydraulik.erdsonden_results || EMPTY_OBJECT;
  const bwwResults = hydraulik.bww_results || EMPTY_OBJECT;
  // Kennwerte fürs Datenkästchen am Bauteil — fertig aus dem Backend, damit im
  // Editor dieselben Zeilen stehen wie im PDF-Export (app/export/bauteil_infos).
  const nodeInfos = hydraulik.node_infos || EMPTY_OBJECT;
  const alleWarnungen = hydraulik.warnungen || EMPTY_ARRAY;

  const editorGraphAnwenden = useCallback((graph) => {
    const geladen = graphFuerEditor(graph);
    // Zeichnungseinstellungen kommen aus dem Schema, die Tastenbelegung aus den
    // persönlichen Einstellungen: sie gehört dem Planer, nicht dem Projekt.
    // Ohne diesen Vorrang würde ein fremdes Schema die eigenen Tasten umstellen.
    setDrawingConfig({ ...geladen.drawingConfig, ...eigeneShortcutsRef.current });
    // Genau EINMAL einpassen, mit Deckel bei 1:1. Ein Schema mit einem einzigen
    // Bauteil soll nicht auf 400 % aufgezogen werden.
    if (geladen.nodes.length) {
      requestAnimationFrame(() => {
        fitView({ padding:0.25, duration:0, minZoom:0.2, maxZoom:1 });
      });
    }
    setOrthoAn(geladen.drawingConfig.ortho !== false);
    setSnapAn(geladen.drawingConfig.object_snap !== false);
    setNodes(geladen.nodes);
    setEdges(geladen.edges);
    const active = LEITUNGS_LAYER.find(layer => layer.id === geladen.layerConfig?.active_layer_id);
    setActiveLayerId(active?.id || 'heizung_vl');
    setLayerVisibility({
      ...DEFAULT_LAYER_VISIBILITY,
      ...(geladen.layerConfig?.visibility || {}),
    });
    setSelected(null);
    setSelectedEdgeId(null);
    setMarkierteEdgeIds([]);
    letzteHydraulikSignatur.current = '';
  }, [setEdges, setNodes]);

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
        // Plankopf automatisch vorbelegen: neuer Schemaname = Projektname + Datum
        // (kontrolliert überschreibbar, CLAUDE.md Regel 7). Bestehende Schemas
        // behalten ihren gespeicherten Namen.
        const s = start.schema || await createSchema(projectId, { name: standardSchemaName(start.project?.name), graph: { nodes: [], edges: [] } });
        setSchemaId(s.id);
        setSchemaName(s.name || 'Schema');
        editorGraphAnwenden(s.graph);
        // Underlay getrennt laden (grosses Bild-Blob nicht Teil des Graphen).
        getSchemaUnderlay(s.id).then(u => setUnderlay(u || null)).catch(() => {});
      } catch (e) {
        console.error('Schema konnte nicht geladen werden', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [editorGraphAnwenden, projectId]);

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

  // ── Underlay: Hintergrund-Plan (§ Editor #5) ──
  const underlayHochladen = useCallback(async (file) => {
    if (!file || !schemaId) return;
    setUnderlayBusy(true);
    try {
      const basis = await dateiZuUnderlay(file);           // {mime,data,name,w,h}
      const gespeichert = await setSchemaUnderlay(schemaId, {
        ...basis, x:0, y:0, scale:1, opacity:0.6, locked:false,
      });
      setUnderlay(gespeichert);
      setShowUnderlayPanel(true);
    } catch (e) {
      console.error('Underlay konnte nicht geladen werden', e);
      window.alert('Plan konnte nicht geladen werden. Unterstützt werden PDF, PNG und JPG (max. ~9 MB).');
    } finally {
      setUnderlayBusy(false);
    }
  }, [schemaId]);

  // Lage/Deckkraft/Sperre ändern: lokal sofort, Persistenz gebündelt (PATCH ohne
  // das Bild erneut zu senden). So bleibt das Ziehen flüssig.
  const underlayTransform = useCallback((patch) => {
    setUnderlay(current => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (schemaId) {
        clearTimeout(underlayPatchTimer.current);
        const nurLage = { x:next.x, y:next.y, scale:next.scale, opacity:next.opacity, locked:next.locked };
        underlayPatchTimer.current = setTimeout(() => {
          patchSchemaUnderlay(schemaId, nurLage).catch(() => {});
        }, 400);
      }
      return next;
    });
  }, [schemaId]);

  const underlayEntfernen = useCallback(async () => {
    if (!schemaId) return;
    clearTimeout(underlayPatchTimer.current);
    await deleteSchemaUnderlay(schemaId).catch(() => {});
    setUnderlay(null);
    setShowUnderlayPanel(false);
  }, [schemaId]);

  const underlayDragStart = useCallback((event) => {
    if (!underlay || underlay.locked) return;
    event.stopPropagation();
    const start = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    underlayDrag.current = { dx:start.x - underlay.x, dy:start.y - underlay.y };
    const move = (ev) => {
      if (!underlayDrag.current) return;
      const p = screenToFlowPosition({ x:ev.clientX, y:ev.clientY });
      underlayTransform({ x:p.x - underlayDrag.current.dx, y:p.y - underlayDrag.current.dy });
    };
    const up = () => {
      underlayDrag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [underlay, screenToFlowPosition, underlayTransform]);

  // Undo-History
  const snapshots = useRef([]);
  // Gegenstapel für das Wiederherstellen. Jede neue Änderung verwirft ihn — sonst
  // würde ein Wiederherstellen auf einen Ast führen, den es nicht mehr gibt.
  const wiederStapel = useRef([]);
  const snap = useCallback(() => {
    snapshots.current = [...snapshots.current.slice(-30), {
      n: JSON.parse(JSON.stringify(nodes)),
      e: JSON.parse(JSON.stringify(edges)),
    }];
    wiederStapel.current = [];
  }, [nodes, edges]);
  // BEFUND aus dem Browsertest: eine Bauteilverschiebung liess sich nicht
  // zurücknehmen. `snap()` legt VOR jeder Änderung den Zustand ab, wie er vorher
  // war. Das Rückgängigmachen muss also genau diesen abgelegten Zustand
  // wiederherstellen. Vorher wurde er verworfen (`pop`) und stattdessen der
  // Eintrag DAVOR gesetzt — also ein Schritt zu weit — und bei nur einem
  // Eintrag brach die Funktion ganz ab. Dadurch war die erste Änderung nach dem
  // Laden nie rücknehmbar.
  //
  // Nodes und Kanten liegen im selben Schnappschuss; eine Verschiebung samt
  // mitgezogener Leitungsgeometrie ist damit EINE Undo-Operation.
  const undo = useCallback(() => {
    const vorher = snapshots.current.pop();
    if (!vorher) return;
    // Den aktuellen Stand auf den Gegenstapel legen, damit er wiederherstellbar
    // bleibt. `snap()` darf hier NICHT verwendet werden — es würde den
    // Gegenstapel gleich wieder leeren.
    wiederStapel.current = [...wiederStapel.current.slice(-30), {
      n: JSON.parse(JSON.stringify(nodesRef.current)),
      e: JSON.parse(JSON.stringify(edgesRef.current)),
    }];
    setNodes(vorher.n);
    setEdges(vorher.e);
    setSelected(null);
    setSelectedEdgeId(null);
  }, [setNodes, setEdges]);

  // Wiederherstellen (Strg/Cmd + Shift + Z). Spiegelbildlich zum Zurücknehmen:
  // der wiederhergestellte Stand wird selbst wieder rücknehmbar.
  const redo = useCallback(() => {
    const naechster = wiederStapel.current.pop();
    if (!naechster) return;
    snapshots.current = [...snapshots.current.slice(-30), {
      n: JSON.parse(JSON.stringify(nodesRef.current)),
      e: JSON.parse(JSON.stringify(edgesRef.current)),
    }];
    setNodes(naechster.n);
    setEdges(naechster.e);
    setSelected(null);
    setSelectedEdgeId(null);
  }, [setNodes, setEdges]);

  // ── Persönliche Tastenbelegung ────────────────────────────────────────────
  // Sie kommt vom Server und überschreibt die Belegung aus dem Schema. Eine
  // leere Taste heisst «dieser Befehl hat keine» — sie darf nicht auf den
  // Standard zurückfallen, sonst entstünde genau die Doppelbelegung, die der
  // Server gerade aufgelöst hat.
  const shortcutsAnwenden = useCallback((satz) => {
    const eintraege = Object.entries(satz?.shortcuts || {});
    if (!eintraege.length) return;
    const shortcuts = Object.fromEntries(eintraege.map(([feld, taste]) => [feld, taste || '']));
    eigeneShortcutsRef.current = shortcuts;
    setDrawingConfig(current => ({ ...current, ...shortcuts }));
  }, []);

  React.useEffect(() => {
    // Schlägt das Laden fehl (alter Server, offline), bleibt die Standard-
    // belegung stehen — der Editor ist trotzdem vollständig bedienbar.
    getUserSettings().then(shortcutsAnwenden).catch(() => {});
  }, [shortcutsAnwenden]);

  const shortcutSetzen = useCallback((feld, wert) => {
    const taste = String(wert || '').trim().slice(-1).toLowerCase();
    const naechste = { ...eigeneShortcutsRef.current, [feld]:taste };
    setShortcutFehler('');
    // Optimistisch anzeigen, damit die Eingabe nicht springt; die Wahrheit
    // (Konfliktauflösung) kommt gleich darauf vom Server zurück.
    setDrawingConfig(current => ({ ...current, [feld]:taste }));
    saveUserSettings({ shortcuts:naechste })
      .then(shortcutsAnwenden)
      .catch(() => setShortcutFehler('Die Belegung konnte nicht gespeichert werden.'));
  }, [shortcutsAnwenden]);

  const shortcutsZuruecksetzen = useCallback(() => {
    setShortcutFehler('');
    saveUserSettings({ shortcuts:{} })
      .then(shortcutsAnwenden)
      .catch(() => setShortcutFehler('Die Belegung konnte nicht zurückgesetzt werden.'));
  }, [shortcutsAnwenden]);

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
      /* Kein Hover-Effekt an den Anschlüssen (Dominic 2026-07-31): das
         Aufpoppen beim Darüberfahren war Unruhe ohne Nutzen — und es
         verschob den gemessenen Mittelpunkt des Anschlusses. */
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
      .hc-pdf-capture .hc-underlay,
      .hc-pdf-capture .react-flow__attribution { display:none !important; }
    `;
    if (!document.getElementById('hc-flow-anim')) document.head.appendChild(s);
    return () => document.getElementById('hc-flow-anim')?.remove();
  }, []);

  // Bauteil auf das Raster ausrichten (an Ebene ausrichten).
  const alignNode = useCallback((id) => {
    snap();
    setNodes(ns => ns.map(x => x.id === id
      ? { ...x, position: rasterPunkt(x.position || { x:0, y:0 }, drawingConfig.grid_size) }
      : x));
  }, [setNodes, snap, drawingConfig.grid_size]);

  const clipboard = useRef(null);
  const befehlsfolge = useRef('');
  const befehlsfolgeTimer = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const edgePointDrag = useRef(null);
  const edgeSegmentDrag = useRef(null);
  const labelDrag = useRef(null);
  const edgePointFrame = useRef(null);
  const edgeEndpointDrag = useRef(null);
  const deleteEdgeRef = useRef(null);
  const deleteNodeRef = useRef(null);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  // Die Befehlsstarter dürfen nicht bei jeder Auswahl neu entstehen — sonst
  // hängt die halbe Tastaturbehandlung daran.
  const selectedEdgeIdRef = useRef(null);
  selectedEdgeIdRef.current = selectedEdgeId;

  const activeLayer = LEITUNGS_LAYER.find(layer => layer.id === activeLayerId) || LEITUNGS_LAYER[0];
  const connectionLineRenderer = useCallback((props) => <ConstrainedConnectionLine {...props}
    shift={shiftPressed} ortho={orthoAn} polar={drawingConfig.polar_snap}
    polarWinkel={drawingConfig.polar_angle} />,
  [drawingConfig.polar_angle, drawingConfig.polar_snap, shiftPressed, orthoAn]);
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

  // Die Leitungen eines Bauteils nach einer Drehung/Spiegelung neu zuordnen.
  //
  // Dreht man ein Bauteil um 180°, wandert der Anschluss, der oben lag, nach
  // unten. Die Leitung bliebe daran hängen und müsste unter dem Bauteil
  // durchlaufen — sie käme von unten statt von oben (Dominic 2026-07-31).
  // Richtig ist: die Leitung, die von oben kommt, hängt danach an dem
  // Anschluss, der jetzt oben liegt.
  //
  // Bei geometrisch gleichwertigen Armaturen (Pumpe, Absperrventil, …) gilt die
  // schärfere Regel: die Leitung hängt immer an dem Anschluss, der ihrer
  // Anfahrt entspricht — auch an einem bisher freien. Bei Bauteilen mit
  // bedeutungstragenden Anschlüssen bleibt es beim reinen Tausch, sonst würde
  // eine Drehung Vorlauf und Rücklauf vertauschen.
  //
  // Die Regel selbst ist rein und getestet (`nodes/anschlussSeite.js`); hier
  // werden nur die Anfahrten gemessen und das Ergebnis eingetragen.
  const leitungenNeuZuordnen = useCallback((id, rotation, mirrored) => {
    const internal = getInternalNode(id);
    const handles = [
      ...(internal?.internals?.handleBounds?.source || []),
      ...(internal?.internals?.handleBounds?.target || []),
    ]
      .filter(handle => handle?.id && handle?.position)
      .map(handle => ({ id:handle.id, position:String(handle.position).toLowerCase() }));
    if (!handles.length) return;

    // Die Anfahrt kommt aus der GEZEICHNETEN Geometrie: dem ersten Eckpunkt der
    // Leitung, sonst ihrem anderen Ende. Die berechnete Route taugt hier nicht —
    // ihr Anschluss-Eckpunkt richtet sich nach der alten Seite.
    const anschluesse = [];
    for (const edge of edgesRef.current) {
      for (const ende of ['source', 'target']) {
        if (edge[ende] !== id) continue;
        const handleId = ende === 'source' ? edge.sourceHandle : edge.targetHandle;
        if (!handleId) continue;
        const punkte = Array.isArray(edge.data?.points) ? edge.data.points : [];
        const anderesEnde = handlePosition(
          ende === 'source' ? edge.target : edge.source,
          ende === 'source' ? edge.targetHandle : edge.sourceHandle,
        );
        const punkt = handlePosition(id, handleId);
        // Der erste Stützpunkt liegt oft genau auf dem Anschluss; er sagt dann
        // nichts über die Anfahrtsrichtung. Deshalb den ersten Punkt nehmen,
        // der wirklich woanders liegt — sonst das andere Leitungsende.
        const reihe = ende === 'source' ? punkte : [...punkte].reverse();
        const nachbar = reihe.find(p => p && punkt
          && Math.hypot((p.x || 0) - punkt.x, (p.y || 0) - punkt.y) > 0.5) || anderesEnde;
        const anfahrt = anfahrtsSeite(punkt, nachbar);
        if (anfahrt) anschluesse.push({ edgeId:edge.id, ende, handleId, anfahrt });
      }
    }
    if (!anschluesse.length) return;

    const typ = nodesRef.current.find(node => node.id === id)?.type;
    const regel = GLEICHWERTIGE_ANSCHLUESSE.has(typ) ? besteAnschluesse : anschluesseNachDrehung;
    const wechsel = regel(handles, anschluesse, rotation, mirrored);
    if (!wechsel.length) return;
    const proEdge = new Map(wechsel.map(w => [`${w.edgeId}:${w.ende}`, w.handleId]));
    setEdges(items => items.map(edge => {
      const neuerSource = proEdge.get(`${edge.id}:source`);
      const neuerTarget = proEdge.get(`${edge.id}:target`);
      if (!neuerSource && !neuerTarget) return edge;
      return {
        ...edge,
        ...(neuerSource ? { sourceHandle:neuerSource } : {}),
        ...(neuerTarget ? { targetHandle:neuerTarget } : {}),
      };
    }));
  }, [getInternalNode, handlePosition, setEdges]);

  // 90°-Drehung des gewählten Bauteils (nur Armaturen; Anschlüsse drehen mit).
  const rotateNode = useCallback((id) => {
    const node = nodesRef.current.find(item => item.id === id);
    if (!node || !ROTATABLE.has(node.type)) return;
    snap();
    const rotation = ((node.data?.rotation || 0) + 90) % 360;
    setNodes(ns => ns.map(x => x.id === id ? { ...x, data: { ...x.data, rotation } } : x));
    leitungenNeuZuordnen(id, rotation, Boolean(node.data?.mirrored));
    // Nach dem Neuzeichnen der Drehung erneut vermessen — zwei Frames, damit die
    // Handle-Bounds zuverlässig NACH dem Layout stimmen (sonst bleibt der
    // Fangpunkt teilweise auf der alten Position stehen).
    requestAnimationFrame(() => requestAnimationFrame(() => updateNodeInternals(id)));
  }, [leitungenNeuZuordnen, setNodes, snap, updateNodeInternals]);

  // Bauteil horizontal spiegeln (Feedback Dominic). Wie beim Drehen müssen die
  // Handle-Bounds nach der Transformation neu vermessen werden.
  const mirrorNode = useCallback((id) => {
    const node = nodesRef.current.find(item => item.id === id);
    if (!node || !ROTATABLE.has(node.type)) return;
    snap();
    const mirrored = !node.data?.mirrored;
    setNodes(ns => ns.map(x => x.id === id ? { ...x, data: { ...x.data, mirrored } } : x));
    leitungenNeuZuordnen(id, node.data?.rotation || 0, mirrored);
    requestAnimationFrame(() => requestAnimationFrame(() => updateNodeInternals(id)));
  }, [leitungenNeuZuordnen, setNodes, snap, updateNodeInternals]);

  // Punkt 20 — Geometrie nach einem Edit normalisieren. Nullsegmente und
  // funktionslose kollineare Ecken werden nicht gespeichert. Läuft am Ende eines
  // Drags: während des Ziehens darf ein Punkt kurz kollinear liegen, ohne unter
  // der Hand zu verschwinden.
  const leitungNormalisieren = useCallback((edgeId) => {
    setEdges(items => items.map(item => {
      if (item.id !== edgeId) return item;
      const punkte = Array.isArray(item.data?.points) ? item.data.points : null;
      if (!punkte?.length) return item;
      const start = handlePosition(item.source, item.sourceHandle);
      const end = handlePosition(item.target, item.targetHandle);
      const bereinigt = routeBereinigen(punkte, { start, end, toleranz:0.5 });
      if (bereinigt.length === punkte.length
        && bereinigt.every((p, i) => p.x === punkte[i].x && p.y === punkte[i].y)) return item;
      return { ...item, data:{ ...(item.data || {}), cad_polyline:true, points:bereinigt } };
    }));
  }, [handlePosition, setEdges]);

  const routePunkte = useCallback((edge) => {
    const start = handlePosition(edge.source, edge.sourceHandle);
    const end = handlePosition(edge.target, edge.targetHandle);
    if (!start || !end) return [];
    const sourceNode = nodesRef.current.find(node => node.id === edge.source);
    const targetNode = nodesRef.current.find(node => node.id === edge.target);
    const sourceSide = sourceNode?.type === 'junction' ? null : handleAusrichtung(edge.source, edge.sourceHandle);
    const targetSide = targetNode?.type === 'junction' ? null : handleAusrichtung(edge.target, edge.targetHandle);
    return adaptivePolyline(
      start,
      end,
      edge.data?.points || [],
      sourceSide,
      targetSide,
      edge.data?.cad_diagonal === true,
    );
  }, [handleAusrichtung, handlePosition]);

  // Bauteil per Pfeiltaste verschieben (Shift = grosser Schritt). Das ist
  // geometrisch dieselbe Operation wie Drag-and-drop: endpunktnahe Waypoints
  // werden auf ihrer bisherigen Achse mitgeführt, damit kein schräges
  // Anschlusssegment entsteht.
  const nudgeNode = useCallback((id, dx, dy) => {
    snap();
    const achsen = {};
    edgesRef.current.forEach(edge => {
      const wp = edge.data?.points;
      if (!Array.isArray(wp) || !wp.length) return;
      const sourceBewegt = edge.source === id;
      const targetBewegt = edge.target === id;
      if (!sourceBewegt && !targetBewegt) return;
      const eintrag = {};
      if (sourceBewegt) {
        const start = handlePosition(edge.source, edge.sourceHandle);
        const startAchse = segmentAchse(start, wp[0]);
        if (start && startAchse) {
          eintrag.startAchse = startAchse;
          eintrag.start = { x:start.x + dx, y:start.y + dy };
        }
      }
      if (targetBewegt) {
        const end = handlePosition(edge.target, edge.targetHandle);
        const endAchse = segmentAchse(wp[wp.length - 1], end);
        if (end && endAchse) {
          eintrag.endAchse = endAchse;
          eintrag.end = { x:end.x + dx, y:end.y + dy };
        }
      }
      if (eintrag.startAchse || eintrag.endAchse) achsen[edge.id] = eintrag;
    });
    if (Object.keys(achsen).length) {
      setEdges(items => items.map(edge => {
        const a = achsen[edge.id];
        const wp = edge.data?.points;
        if (!a || !Array.isArray(wp) || !wp.length) return edge;
        const neu = mitgezogeneWaypoints(wp, a);
        return { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:neu } };
      }));
    }
    setNodes(ns => ns.map(x => x.id === id
      ? { ...x, position: { x:(x.position?.x || 0) + dx, y:(x.position?.y || 0) + dy } }
      : x));
  }, [handlePosition, setEdges, setNodes, snap]);

  // Orthogonales Mitziehen (§ Editor #1). Der Leitungsendpunkt folgt dem Anschluss
  // bereits live (nodeGeometryVersion); damit das endpunktnahe Segment nicht
  // diagonal abknickt, merken wir uns beim Anfassen dessen Achse und führen den
  // Stützpunkt beim Loslassen orthogonal nach. Bewusst diagonale Segmente
  // bleiben unangetastet. Nur Leitungen MIT Stützpunkten sind betroffen — ohne
  // Stützpunkt wird der Knick ohnehin bei jedem Frame frisch orthogonal berechnet.
  const nodeDragAchsen = useRef({});
  const nodeDragBewegte = useRef([]);
  const onNodeDragStart = useCallback((_event, node, dragNodes) => {
    snap();
    const bewegte = new Set((dragNodes?.length ? dragNodes : [node]).map(n => n.id));
    nodeDragBewegte.current = [...bewegte];
    const achsen = {};
    edgesRef.current.forEach(edge => {
      const wp = edge.data?.points;
      if (!Array.isArray(wp) || !wp.length) return;
      const sourceBewegt = bewegte.has(edge.source);
      const targetBewegt = bewegte.has(edge.target);
      if (!sourceBewegt && !targetBewegt) return;
      const eintrag = {};
      if (sourceBewegt) {
        const start = handlePosition(edge.source, edge.sourceHandle);
        if (start) eintrag.startAchse = segmentAchse(start, wp[0]);
      }
      if (targetBewegt) {
        const end = handlePosition(edge.target, edge.targetHandle);
        if (end) eintrag.endAchse = segmentAchse(wp[wp.length - 1], end);
      }
      if (eintrag.startAchse || eintrag.endAchse) achsen[edge.id] = eintrag;
    });
    nodeDragAchsen.current = achsen;
  }, [snap, handlePosition]);

  const onNodeDragStop = useCallback(() => {
    const achsen = nodeDragAchsen.current;
    const bewegte = nodeDragBewegte.current;
    nodeDragAchsen.current = {};
    nodeDragBewegte.current = [];
    if (Object.keys(achsen).length) {
      setEdges(items => items.map(edge => {
        const a = achsen[edge.id];
        const wp = edge.data?.points;
        if (!a || !Array.isArray(wp) || !wp.length) return edge;
        const start = a.startAchse ? handlePosition(edge.source, edge.sourceHandle) : null;
        const end = a.endAchse ? handlePosition(edge.target, edge.targetHandle) : null;
        const neu = mitgezogeneWaypoints(wp, { start, end, startAchse: a.startAchse, endAchse: a.endAchse });
        return { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:neu } };
      }));
    }
    // Eine verschobene Armatur nimmt den Anschluss, der jetzt zur Leitung
    // passt. Sonst liefe die Leitung nach dem Verschieben hinter dem Bauteil
    // durch — im Editor kaum sichtbar, im Export sofort.
    bewegte.forEach(id => {
      const node = nodesRef.current.find(item => item.id === id);
      if (!node || !GLEICHWERTIGE_ANSCHLUESSE.has(node.type)) return;
      leitungenNeuZuordnen(id, node.data?.rotation || 0, Boolean(node.data?.mirrored));
    });
  }, [handlePosition, leitungenNeuZuordnen, setEdges]);

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

  const naechsterSenkrechtFang = useCallback((origin, cursor, layerId, radius = 18, excludedEdgeIds = new Set()) => {
    if (!origin) return null;
    let best = null;
    edgesRef.current.forEach(edge => {
      if (excludedEdgeIds.has(edge.id) || layerVonEdge(edge).id !== layerId) return;
      const route = routePunkte(edge);
      for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex += 1) {
        const hit = senkrechterFang(origin, cursor, route[segmentIndex], route[segmentIndex + 1], radius);
        if (hit && (!best || hit.distanz < best.distanz)) {
          best = { ...hit, edge, route, segmentIndex, position:{ x:hit.x, y:hit.y }, type:'perpendicular', fangArt:'perpendicular' };
        }
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

  // Mittelpunkt eines geraden Leitungssegments.
  const naechsterMittelpunkt = useCallback((point, radius = 14, excludedEdgeIds = new Set()) => {
    let best = null;
    edgesRef.current.forEach(edge => {
      if (excludedEdgeIds.has(edge.id)) return;
      if (layerVisibility[layerVonEdge(edge).id] === false) return;
      const route = routePunkte(edge);
      for (let i = 0; i < route.length - 1; i += 1) {
        const a = route[i];
        const b = route[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 2) continue;
        const mitte = { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 };
        const distanz = Math.hypot(point.x - mitte.x, point.y - mitte.y);
        if (distanz <= radius && (!best || distanz < best.distanz)) {
          // `route`, `segmentIndex` und `t` sind das, was `leitungTeilen`
          // braucht — dadurch ist ein Mittelpunktfang topologisch dasselbe wie
          // ein Fang auf die Leitung, nur genauer benannt.
          best = { ...mitte, distanz, edgeId:edge.id, position:mitte,
                   edge, route, segmentIndex:i, t:0.5 };
        }
      }
    });
    return best;
  }, [layerVisibility, routePunkte]);

  // Punkt 24/25 — bestehender Polylinien-Eckpunkt. Ein Eckpunkt ist heute nur
  // ein Stützpunkt in `data.points` und kein Graph-Knoten. Wird ein Leitungsende
  // bewusst darauf gelegt, muss die getroffene Leitung dort geteilt werden,
  // damit eine echte hydraulische Junction entsteht statt zweier Linien, die
  // sich nur optisch berühren.
  const naechsterEckpunkt = useCallback((point, radius = 12, excludedEdgeIds = new Set()) => {
    let best = null;
    edgesRef.current.forEach(edge => {
      if (excludedEdgeIds.has(edge.id)) return;
      if (layerVisibility[layerVonEdge(edge).id] === false) return;
      const route = routePunkte(edge);
      for (let i = 1; i < route.length - 1; i += 1) {
        const ecke = route[i];
        const distanz = Math.hypot(point.x - ecke.x, point.y - ecke.y);
        if (distanz <= radius && (!best || distanz < best.distanz)) {
          best = { x:ecke.x, y:ecke.y, distanz, edgeId:edge.id, position:{ x:ecke.x, y:ecke.y },
                   edge, route, cornerIndex:i, segmentIndex:i - 1, t:1 };
        }
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

  // Ein Fang „auf der Leitung" — dazu gehört auch der Mittelpunkt. Beide teilen
  // die getroffene Leitung und erzeugen eine echte Verbindung. Der Unterschied
  // liegt nur in der Beschriftung des Markers.
  const istLeitungsfang = (hit) => ['line', 'midpoint', 'corner', 'perpendicular'].includes(hit?.type);

  const leitungTeilen = useCallback((hit, junctionId, layerId) => {
    const host = hit.edge;
    const junctionPoint = { x:hit.x, y:hit.y };
    // Geteilte, getestete Kernlogik (§3/§13): erhält bestehende Waypoints und
    // teilt die Länge proportional. Identisches Verhalten wie bisher.
    // Ein Eckpunkt ist bereits Teil der Route — er darf danach nicht doppelt
    // in einem der beiden Teilstücke stehen (§25).
    const { before, after, firstShare } = Number.isInteger(hit.cornerIndex)
      ? splitRouteAtCorner(hit.route, hit.cornerIndex)
      : splitRouteAtPoint(hit.route, hit.segmentIndex, junctionPoint);
    const oldLength = Number.parseFloat(host.data?.laenge_m);
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

  // Punkt 28 — an derselben Stelle darf nur EIN Topologie-Anker liegen. Sonst
  // entstehen zwei Junctions auf identischer Koordinate: optisch ein Punkt,
  // hydraulisch zwei getrennte Netze.
  const bestehendeJunction = useCallback((punkt, toleranz = 6) => {
    if (!punkt) return null;
    const treffer = nodesRef.current.find(node => node.type === 'junction'
      && node.data?.cad_anchor
      && Math.hypot((node.position?.x ?? 0) - punkt.x, (node.position?.y ?? 0) - punkt.y) <= toleranz);
    return treffer?.id || null;
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
      style:{ stroke:returnLayer.color, strokeWidth:2.5 },
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

  // Der laufende Leitungsentwurf wird an genau EINER Stelle verworfen — egal
  // ob durch Abbruch (ESC, Rechtsklick, anderer Befehl) oder nach dem
  // Abschluss. Der Entwurf lebt nur im Zustand; solange er nicht abgeschlossen
  // ist, existiert im Graphen weder Anker noch Kante. Ein Abbruch kann deshalb
  // nichts hinterlassen.
  const entwurfVerwerfen = useCallback(() => {
    leitungsEntwurfRef.current = null;
    leitungsCursorRef.current = null;
    setLeitungsEntwurf(null);
    setLeitungsCursor(null);
    setLeitungsSnap(null);
    setLeitungsGuides([]);
    setAufgenommeneFangpunkte([]);
    setLaengenPuffer(null);
    setWinkelPuffer(null);
    setDynamikFeld('length');
    setFangOverride(null);
  }, []);

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
    setAufgenommeneFangpunkte([]);
    setLaengenPuffer(null);
    setWinkelPuffer(null);
    setDynamikFeld('length');
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
    setFangOverride(null);
    const layer = LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer;
    const startPoint = draft.startEndpoint
      ? handlePosition(draft.startEndpoint.nodeId, draft.startEndpoint.handleId)
      : draft.startPoint;
    const anchor = letzterEntwurfsPunkt(draft) || startPoint;
    const endPoint = snapHit
      ? { x:snapHit.x, y:snapHit.y }
      : constrainPoint(anchor, rawPoint, {
        ortho:orthoAnRef.current, shift, grid:drawingConfig.grid_size,
        polar:drawingConfig.polar_snap, polarWinkel:drawingConfig.polar_angle,
      });
    if (!startPoint || Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) < 2) return;
    const finalPoints = [...(draft.points || [])];
    // Ein exakter Fangpunkt darf keine zufällige leichte Schräge erzeugen.
    // Deshalb erhält jeder Fangtyp eine orthogonale Ecke; nur eine bewusst
    // gezeichnete Schräge (mindestens 30° zur nächsten Achse) bleibt direkt.
    const connectionCorner = snapHit && !istBewussteDiagonale(anchor, endPoint)
      ? orthogonalerAnschlussEckpunkt(anchor, endPoint, snapHit.handlePosition)
      : null;
    if (connectionCorner) finalPoints.push(connectionCorner);
    const direkteDiagonale = finalPoints.length === 0
      && !connectionCorner
      && (istBewussteDiagonale(startPoint, endPoint)
        || (drawingConfig.polar_snap
          && Math.abs(endPoint.x - startPoint.x) > 0.5
          && Math.abs(endPoint.y - startPoint.y) > 0.5));

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
        style:{ ...(existing.style || {}), stroke:layer.color, strokeWidth:2.5 },
      };

      if (istLeitungsfang(snapHit)) {
        const [first, second] = leitungTeilen(snapHit, finalAnchorId, layer.id);
        setEdges(items => [
          ...items.filter(item => item.id !== existing.id && item.id !== snapHit.edge.id),
          first, second, extended,
        ]);
      } else {
        setEdges(items => items.map(item => item.id === existing.id ? extended : item));
      }

      entwurfVerwerfen();
      setSelectedEdgeId(existing.id);
      // Befehl fertig: Dauerbefehl bleibt aktiv, sonst zurück nach modify.
      setEditorMode(finishCommand(editorModeRef.current));
      return;
    }

    // Selbst-Anschluss verhindern: Start und Ende am selben Bauteil. Bei der
    // grossflächigen Anschlusszone sonst leicht versehentlich ausgelöst.
    if (draft.startEndpoint?.nodeId && snapHit?.type === 'port'
        && snapHit.nodeId === draft.startEndpoint.nodeId) {
      entwurfVerwerfen();
      return;
    }

    const createdNodes = [];
    // Liegt am Start- oder Endpunkt schon ein Anker, wird dieser benutzt statt
    // ein zweiter daneben gelegt (§28).
    const sourceVorhanden = draft.startEndpoint ? null : bestehendeJunction(startPoint);
    const targetVorhanden = snapHit?.type === 'port' ? null : bestehendeJunction(endPoint);
    const sourceAnchorId = draft.startEndpoint ? null : (sourceVorhanden || newId());
    const targetAnchorId = snapHit?.type === 'port' ? null : (targetVorhanden || newId());
    if (sourceAnchorId && !sourceVorhanden) createdNodes.push(cadAnker(sourceAnchorId, startPoint, layer));
    if (targetAnchorId && !targetVorhanden) createdNodes.push(cadAnker(targetAnchorId, endPoint, layer));

    const edgeId = newId();
    const sourceSide = draft.startEndpoint
      ? handleAusrichtung(draft.startEndpoint.nodeId, draft.startEndpoint.handleId)
      : null;
    const targetSide = snapHit?.type === 'port' ? snapHit.handlePosition : null;
    const polylinePoints = adaptivePolyline(
      startPoint, endPoint, finalPoints, sourceSide, targetSide, direkteDiagonale,
    ).slice(1, -1);
    // EINZIGE Edge-Quelle: validiert Selbstanschluss/Null-Länge/Duplikat/Layer.
    let edge = createHydraulicEdge({
      id: edgeId,
      source: draft.startEndpoint?.nodeId || sourceAnchorId,
      sourceHandle: draft.startEndpoint?.handleId || 'center-source',
      target: snapHit?.type === 'port' ? snapHit.nodeId : targetAnchorId,
      targetHandle: snapHit?.type === 'port' ? snapHit.handleId : 'center-target',
      layerId: layer.id, layerColor: layer.color,
      points: polylinePoints, cornerRadius: drawingConfig.corner_radius,
      startPoint, endPoint,
      cadDiagonal:direkteDiagonale,
    }, edgesRef.current);
    if (!edge) {
      // Ungültige Leitung (z. B. Selbstanschluss) → Zeichnen sauber beenden.
      entwurfVerwerfen();
      setEditorMode(finishCommand(editorModeRef.current));
      return;
    }
    const returnPair = ruecklaufPaarErstellen(edge, startPoint, endPoint);
    if (returnPair) {
      edge = returnPair.primaryEdge;
      createdNodes.push(...returnPair.createdNodes);
    }
    if (createdNodes.length) setNodes(items => [...items, ...createdNodes]);
    const pairedEdges = returnPair ? [returnPair.returnEdge] : [];

    if (istLeitungsfang(snapHit)) {
      const [first, second] = leitungTeilen(snapHit, targetAnchorId, layer.id);
      setEdges(items => [...items.filter(item => item.id !== snapHit.edge.id), first, second, edge, ...pairedEdges]);
    } else {
      setEdges(items => [...items, edge, ...pairedEdges]);
    }

    entwurfVerwerfen();
    setSelectedEdgeId(edgeId);
    // Nach Abschluss beenden — ausser der dauerhafte Leitungsmodus ist aktiv.
    setEditorMode(finishCommand(editorModeRef.current));
  }, [activeLayer, bestehendeJunction, cadAnker, drawingConfig, entwurfVerwerfen, handleAusrichtung, handlePosition, letzterEntwurfsPunkt, leitungTeilen, routePunkte, ruecklaufPaarErstellen, setEdges, setNodes, snap]);

  // Doppelklick, zweiter Klick auf denselben Punkt und ✓ beenden eine frei
  // gezeichnete Leitung am LETZTEN bewusst geklickten Eckpunkt. Die aktuelle
  // Cursorvorschau wird nicht gespeichert. Der letzte Punkt wird vor dem
  // Abschluss aus den Zwischenpunkten genommen, weil er nun zum echten
  // Leitungsende wird. Ob ein Dauerbefehl aktiv bleibt, entscheidet allein
  // `finishCommand` im Abschluss — ESC ist kein Abschluss, sondern Abbruch.
  const entwurfAmLetztenPunktAbschliessen = useCallback(() => {
    const draft = leitungsEntwurfRef.current;
    const abschluss = entwurfFuerAbschluss(draft);
    if (!abschluss) return false;
    leitungsEntwurfRef.current = abschluss.draft;
    setLeitungsEntwurf(abschluss.draft);
    leitungsEntwurfAbschliessen(abschluss.endPoint, null, false);
    return true;
  }, [leitungsEntwurfAbschliessen]);

  const cadKlick = useCallback((event, nurBeiAnschluss = false) => {
    // Nur die linke Taste zeichnet. Mittlere Taste = Pan, rechte = abschliessen.
    if (event.button != null && event.button !== 0) return true;
    if (spacePanRef.current) return true;          // Space hält das Pan-Werkzeug
    event.preventDefault();
    event.stopPropagation();
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const draft = leitungsEntwurfRef.current;
    // Beim Doppelklick setzt nur der erste Klick den letzten bewussten Punkt.
    // Der zweite beendet; er darf wegen einer minimalen Mausbewegung kein
    // zusätzliches Mini-Teilstück mehr erzeugen.
    if (draft && event.detail >= 2) {
      entwurfAmLetztenPunktAbschliessen();
      return true;
    }
    const layer = draft
      ? LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer
      : activeLayer;
    const zoom = Math.max(getZoom(), 0.2);
    // SNAP aus (Statusleiste): nur Raster und Richtungs-Constraint, kein Objektfang.
    const fangAktiv = snapAnRef.current;
    const nur = fangOverrideRef.current;
    if (nur) {
      fangOverrideRef.current = null;
      setFangOverride(null);
    }
    const erlaubt = (typ) => !nur || nur === typ;
    const portHit = fangAktiv && erlaubt('port') ? naechsterBauteilAnschluss(raw, null, layer.role, 28 / zoom) : null;
    const endpointHit = (!fangAktiv || portHit || !erlaubt('endpoint')) ? null : naechsterFreierLeitungsEndpunkt(raw, layer.id, 16 / zoom, draft?.extendEdgeId);

    if (!draft) {
      if (nurBeiAnschluss && !portHit && !endpointHit) return true;
      const startHit = portHit || endpointHit;
      const startPoint = startHit?.position || rasterPunkt(raw, drawingConfig.grid_size);
      leitungsEntwurfStarten(startPoint, startHit ? { nodeId:startHit.nodeId, handleId:startHit.handleId } : null);
      return true;
    }
    if (portHit) {
      leitungsEntwurfAbschliessen(portHit.position, { ...portHit, ...portHit.position, type:'port', fangArt:'port' }, event.shiftKey || shiftPressed);
      return true;
    }
    if (endpointHit) {
      leitungsEntwurfAbschliessen(endpointHit.position, { ...endpointHit, ...endpointHit.position, type:'port', fangArt:'endpoint' }, event.shiftKey || shiftPressed);
      return true;
    }
    if (nurBeiAnschluss) return true;
    const excludedEdges = draft.extendEdgeId ? new Set([draft.extendEdgeId]) : new Set();
    // Eckpunkt vor Mittelpunkt und Leitung: er ist der genaueste Punkt und der
    // einzige, den der Planer bewusst gesetzt hat.
    const eckHit = fangAktiv && erlaubt('corner') ? naechsterEckpunkt(raw, 12 / zoom, excludedEdges) : null;
    if (eckHit) {
      leitungsEntwurfAbschliessen(eckHit.position, { ...eckHit, type:'corner' }, event.shiftKey || shiftPressed);
      return true;
    }
    const midHit = fangAktiv && erlaubt('midpoint') ? naechsterMittelpunkt(raw, 14 / zoom, excludedEdges) : null;
    if (midHit) {
      leitungsEntwurfAbschliessen(midHit.position, { ...midHit, type:'midpoint' }, event.shiftKey || shiftPressed);
      return true;
    }
    const previous = letzterEntwurfsPunkt(draft);
    const perpendicularHit = fangAktiv && erlaubt('perpendicular')
      ? naechsterSenkrechtFang(previous, raw, layer.id, 18 / zoom, excludedEdges)
      : null;
    if (perpendicularHit) {
      leitungsEntwurfAbschliessen(perpendicularHit.position, perpendicularHit, event.shiftKey || shiftPressed);
      return true;
    }
    const lineHit = fangAktiv && erlaubt('nearest') ? naechsteLeitung(raw, layer.id, 22 / zoom, excludedEdges) : null;
    if (lineHit) {
      const hit = tStueckHit(previous, raw, { ...lineHit, type:'line' });
      leitungsEntwurfAbschliessen(hit, hit, event.shiftKey || shiftPressed);
      return true;
    }
    const spur = fangAktiv ? fangspurPunkt(raw, [
      ...aufgenommeneFangpunkteRef.current,
      ...(previous ? [{ ...previous, kind:'draft' }] : []),
    ], drawingConfig.snap_tolerance / zoom) : null;
    const point = constrainPoint(previous, spur?.point || rasterPunkt(raw, drawingConfig.grid_size), {
      ortho:orthoAnRef.current,
      shift:event.shiftKey || shiftPressed,
      grid:drawingConfig.grid_size,
      polar:drawingConfig.polar_snap,
      polarWinkel:drawingConfig.polar_angle,
    });
    // Ein zweiter Klick auf denselben Punkt beendet die Leitung — dieselbe
    // Bewegung, die ein Doppelklick auslöst. Der Punkt liegt bereits im
    // Entwurf; der Abschluss nimmt ihn heraus und macht ihn zum Leitungsende,
    // statt ein Nullsegment anzuhängen.
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= 0.5) {
      entwurfAmLetztenPunktAbschliessen();
      return true;
    }
    const next = { ...draft, points:[...(draft.points || []), point] };
    leitungsEntwurfRef.current = next;
    setLeitungsEntwurf(next);
    setFangOverride(null);
    return true;
  }, [activeLayer, drawingConfig, entwurfAmLetztenPunktAbschliessen, getZoom, letzterEntwurfsPunkt, leitungsEntwurfAbschliessen, leitungsEntwurfStarten, naechsteLeitung, naechsterBauteilAnschluss, naechsterEckpunkt, naechsterFreierLeitungsEndpunkt, naechsterMittelpunkt, naechsterSenkrechtFang, screenToFlowPosition, shiftPressed]);

  // Doppelklick beendet die laufende Leitung. Der zweite Klick des Doppelklicks
  // schliesst sie meist schon über die Punktgleichheit oben ab; landet er durch
  // eine kleine Mausbewegung auf einem anderen Rasterpunkt, greift dieser
  // Handler — der Doppelklick beendet dann immer.
  const canvasDoppelklick = useCallback((event) => {
    if (!leitungsEntwurfRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    entwurfAmLetztenPunktAbschliessen();
  }, [entwurfAmLetztenPunktAbschliessen]);

  const cadHandlePointerDown = useCallback((event) => {
    if (event.button !== 0 || spacePanRef.current) return;
    // Läuft Kopieren, Spiegeln, Drehen oder Reihe, setzt dieser Druck ihren
    // nächsten Punkt — vor allem anderen.
    if (transformBefehlRef.current) { transformKlickRef.current?.(event); return; }
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
    // Ein Klick direkt auf einen Anschluss ist eindeutig — er startet den
    // Leitungsbefehl gleich mit, statt vorher L zu verlangen. Auf der freien
    // Fläche bleibt die Sperre bestehen (siehe `canStartHydraulicLine`).
    if (!canStartHydraulicLine(zeichenModusRef.current, Boolean(draft), true)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!draft) {
      // Der Befehl muss auch im Zustand stehen, sonst zeigt die Statusleiste
      // weiter „Modify", während schon eine Leitung am Cursor hängt.
      if (!zeichenModusRef.current) {
        setEditorMode(mode => startCommand(DRAW_PIPE, { persistent:mode.persistent }));
      }
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

  // Punkt 17/18 — Prüfsonde für Browsertests. Hält die letzte Fangentscheidung
  // fest, damit ein Test „Marker == gewählter Fang == gesetzter Punkt == Port"
  // wirklich vergleichen kann statt nur die Existenz eines Elements zu sehen.
  // Nur im Entwicklungsmodus; in der Produktion existiert sie nicht.
  const fangProtokoll = useCallback((quelle, typ, punkt, extra = {}) => {
    if (!import.meta.env.DEV) return;
    const eintrag = { quelle, typ, x:punkt?.x ?? null, y:punkt?.y ?? null, ...extra, t:Date.now() };
    window.__hcSnap = eintrag;
    (window.__hcSnapVerlauf ||= []).push(eintrag);
    if (window.__hcSnapVerlauf.length > 400) window.__hcSnapVerlauf.shift();
  }, []);

  const cadCursorAktualisieren = useCallback((event) => {
    const draft = leitungsEntwurfRef.current;
    if (!draft) return;
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    if (leitungsCursorFrame.current) cancelAnimationFrame(leitungsCursorFrame.current);
    leitungsCursorFrame.current = requestAnimationFrame(() => {
      const layer = LEITUNGS_LAYER.find(item => item.id === draft.layerId) || activeLayer;
      const zoom = Math.max(getZoom(), 0.2);
      const fangAktiv = snapAnRef.current;
      const nur = fangOverrideRef.current;
      const erlaubt = (typ) => !nur || nur === typ;
      if (fangAktiv) {
        const radius = 12 / zoom;
        const kandidat = objektFangpunkte.reduce((beste, punkt) => {
          const distanz = Math.hypot(raw.x - punkt.x, raw.y - punkt.y);
          return distanz <= radius && (!beste || distanz < beste.distanz)
            ? { ...punkt, distanz } : beste;
        }, null);
        const key = kandidat ? `${kandidat.kind}:${kandidat.nodeId || kandidat.edgeId || ''}:${kandidat.x}:${kandidat.y}` : null;
        if (!key) fangHoverRef.current = null;
        else if (fangHoverRef.current?.key !== key) fangHoverRef.current = { key, seit:performance.now(), punkt:kandidat };
        else if (performance.now() - fangHoverRef.current.seit >= 320) {
          const punkt = fangHoverRef.current.punkt;
          setAufgenommeneFangpunkte(aktuell => aktuell.some(item => item.key === key)
            ? aktuell : [...aktuell.slice(-1), { ...punkt, key }]);
        }
      } else {
        fangHoverRef.current = null;
        setAufgenommeneFangpunkte([]);
      }
      const portHit = fangAktiv && erlaubt('port') ? naechsterBauteilAnschluss(raw, null, layer.role, 28 / zoom) : null;
      if (portHit) {
        leitungsCursorRef.current = portHit.position;
        setLeitungsCursor(portHit.position);
        setLeitungsSnap({ ...portHit, ...portHit.position, type:'port', fangArt:'port' });
        fangProtokoll('cursor', 'port', portHit.position,
          { nodeId:portHit.nodeId, handleId:portHit.handleId, distanz:portHit.distance });
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
      const endpointHit = fangAktiv && erlaubt('endpoint') ? naechsterFreierLeitungsEndpunkt(raw, layer.id, 16 / zoom, draft.extendEdgeId) : null;
      if (endpointHit) {
        leitungsCursorRef.current = endpointHit.position;
        setLeitungsCursor(endpointHit.position);
        setLeitungsSnap({ ...endpointHit, ...endpointHit.position, type:'port', fangArt:'endpoint' });
        setLeitungsGuides([]);
        fangProtokoll('cursor', 'endpoint', endpointHit.position, { edgeId:endpointHit.edgeId });
        return;
      }
      const excludedEdges = draft.extendEdgeId ? new Set([draft.extendEdgeId]) : new Set();
      const eckHit = fangAktiv && erlaubt('corner') ? naechsterEckpunkt(raw, 12 / zoom, excludedEdges) : null;
      if (eckHit) {
        leitungsCursorRef.current = eckHit.position;
        setLeitungsCursor(eckHit.position);
        setLeitungsSnap({ ...eckHit, type:'corner' });
        setLeitungsGuides([]);
        fangProtokoll('cursor', 'corner', eckHit.position, { edgeId:eckHit.edgeId });
        return;
      }
      const midHit = fangAktiv && erlaubt('midpoint') ? naechsterMittelpunkt(raw, 14 / zoom, excludedEdges) : null;
      if (midHit) {
        leitungsCursorRef.current = midHit.position;
        setLeitungsCursor(midHit.position);
        setLeitungsSnap({ ...midHit, type:'midpoint' });
        setLeitungsGuides([]);
        fangProtokoll('cursor', 'midpoint', midHit.position, { edgeId:midHit.edgeId });
        return;
      }
      const previous = letzterEntwurfsPunkt(draft);
      const perpendicularHit = fangAktiv && erlaubt('perpendicular')
        ? naechsterSenkrechtFang(previous, raw, layer.id, 18 / zoom, excludedEdges)
        : null;
      if (perpendicularHit) {
        const point = perpendicularHit.position;
        leitungsCursorRef.current = point;
        setLeitungsCursor(point);
        setLeitungsSnap(perpendicularHit);
        const orthogonal = previous && (Math.abs(previous.x - point.x) < 0.5 || Math.abs(previous.y - point.y) < 0.5);
        setLeitungsGuides(orthogonal ? [{
          x1:previous.x, y1:previous.y, x2:point.x, y2:point.y, snapType:'perpendicular',
        }] : []);
        fangProtokoll('cursor', 'perpendicular', point, { edgeId:perpendicularHit.edge?.id });
        return;
      }
      const lineHit = fangAktiv && erlaubt('nearest') ? naechsteLeitung(raw, layer.id, 22 / zoom, excludedEdges) : null;
      if (lineHit) {
        const hit = tStueckHit(previous, raw, { ...lineHit, type:'line' });
        const point = { x:hit.x, y:hit.y };
        leitungsCursorRef.current = point;
        setLeitungsCursor(point);
        setLeitungsSnap(hit);
        setLeitungsGuides([]);
        fangProtokoll('cursor', 'nearest', point, { edgeId:hit.edge?.id });
        return;
      }
      const spur = fangAktiv ? fangspurPunkt(raw, [
        ...aufgenommeneFangpunkteRef.current,
        ...(previous ? [{ ...previous, kind:'draft' }] : []),
      ], drawingConfig.snap_tolerance / zoom) : null;
      const point = constrainPoint(previous, spur?.point || rasterPunkt(raw, drawingConfig.grid_size), {
        ortho:orthoAnRef.current,
        shift:event.shiftKey || shiftPressed,
        grid:drawingConfig.grid_size,
        polar:drawingConfig.polar_snap,
        polarWinkel:drawingConfig.polar_angle,
      });
      leitungsCursorRef.current = point;
      setLeitungsCursor(point);
      setLeitungsSnap(null);
      setLeitungsGuides(guidesAmPunkt(spur?.guides, point));
      fangProtokoll('cursor', lineHit ? 'nearest' : 'grid', point);
    });
  }, [activeLayer, fangProtokoll, drawingConfig.grid_size, drawingConfig.polar_angle, drawingConfig.polar_snap, drawingConfig.snap_tolerance, getZoom, letzterEntwurfsPunkt, naechsteLeitung, naechsterBauteilAnschluss, naechsterEckpunkt, naechsterFreierLeitungsEndpunkt, naechsterMittelpunkt, naechsterSenkrechtFang, objektFangpunkte, screenToFlowPosition, shiftPressed]);

  const cadEntwurfRoute = (() => {
    if (!leitungsEntwurf) return [];
    const start = leitungsEntwurf.startEndpoint
      ? handlePosition(leitungsEntwurf.startEndpoint.nodeId, leitungsEntwurf.startEndpoint.handleId)
      : leitungsEntwurf.startPoint;
    const previous = leitungsEntwurf.points.at(-1) || start;
    const dynamischeVorschau = drawingConfig.dynamic_input && leitungsCursor
      ? punktAusDynamischerEingabe(previous, leitungsCursor, {
        laenge:laengenPuffer,
        winkel:winkelPuffer,
        ortho:orthoAn,
        shift:shiftPressed,
        polar:drawingConfig.polar_snap,
        polarWinkel:drawingConfig.polar_angle,
      })
      : null;
    const preview = leitungsSnap
      ? { x:leitungsSnap.x, y:leitungsSnap.y }
      : (dynamischeVorschau || leitungsCursor || null);
    if (!start || !preview) return [];
    const connectionCorner = leitungsSnap && !istBewussteDiagonale(previous, preview)
      ? orthogonalerAnschlussEckpunkt(previous, preview, leitungsSnap.handlePosition)
      : null;
    const sourceSide = leitungsEntwurf.startEndpoint
      ? handleAusrichtung(leitungsEntwurf.startEndpoint.nodeId, leitungsEntwurf.startEndpoint.handleId)
      : null;
    const targetSide = leitungsSnap?.type === 'port' ? leitungsSnap.handlePosition : null;
    const direkteDiagonale = !(leitungsEntwurf.points || []).length
      && !connectionCorner
      && (istBewussteDiagonale(start, preview)
        || (drawingConfig.polar_snap
          && Math.abs(preview.x - start.x) > 0.5
          && Math.abs(preview.y - start.y) > 0.5));
    return adaptivePolyline(
      start,
      preview,
      [...leitungsEntwurf.points, ...(connectionCorner ? [connectionCorner] : [])],
      sourceSide,
      targetSide,
      direkteDiagonale,
    );
  })();

  // Punkt 7 — temporäres Mass des laufenden Segments. Kommt aus GENAU der
  // Vorschauroute, die auch gezeichnet wird; es kann also nie eine andere Länge
  // anzeigen als die, die beim Klick entsteht.
  const cadMass = useMemo(() => {
    if (cadEntwurfRoute.length < 2) return null;
    const a = cadEntwurfRoute.at(-2);
    const b = cadEntwurfRoute.at(-1);
    // Abstand in SCREEN-Pixeln denken und in Weltmass umrechnen, sonst klebt die
    // Masslinie beim Reinzoomen auf der Leitung und fliegt beim Rauszoomen weg.
    const abstand = 22 / Math.max(zoomAnzeige, 0.05);
    const anker = massAnker(a, b, abstand);
    if (!anker?.laenge) return null;
    const label = drawingConfig.polar_snap
      ? `${massLabel(segmentLaenge(a, b))} · ${winkelLabel(richtungsWinkelGrad(a, b))}`
      : segmentMassLabel(a, b);
    return { ...anker, a, b, label };
  }, [cadEntwurfRoute, drawingConfig.polar_snap, zoomAnzeige]);

  const dynamikAnzeige = useMemo(() => {
    if (!drawingConfig.dynamic_input || !leitungsEntwurf || !leitungsCursor || !cadMass) return null;
    const winkel = richtungsWinkelGrad(cadMass.a, cadMass.b);
    return {
      x:leitungsCursor.x,
      y:leitungsCursor.y,
      laenge:laengenPuffer !== null ? laengenPuffer : String(Math.round(segmentLaenge(cadMass.a, cadMass.b))),
      winkel:winkelPuffer !== null ? winkelPuffer : String(Math.round((winkel ?? 0) * 10) / 10),
      feld:dynamikFeld,
      prompt:befehlsPrompt(editorMode, { hasDraft:Boolean(leitungsEntwurf) }),
    };
  }, [cadMass, drawingConfig.dynamic_input, dynamikFeld, editorMode, laengenPuffer, leitungsCursor, leitungsEntwurf, winkelPuffer]);

  // Punkt 5 — den intern gefundenen Fang auf einen CAD-Fangtyp abbilden. Das ist
  // die EINZIGE Stelle, an der die Darstellung entsteht; Koordinate und Marker
  // stammen aus demselben `leitungsSnap`/`leitungsCursor`.
  const snapMarker = useMemo(() => {
    if (!leitungsEntwurf) return null;
    if (leitungsSnap) {
      // Ein Port-Treffer mit Bauteil ist ein Anschluss, einer ohne (freier
      // Leitungsanfang) ein Endpunkt. Auf einer Leitung liegt der Fang zwischen
      // zwei Punkten — im CAD „Nearest".
      // `fangArt` wird an der Fangquelle gesetzt. Vorher wurde hier aus
      // `handleId` geraten — ein freies Leitungsende trägt aber ebenfalls eine
      // handleId (die seines Ankers) und wurde dadurch als „Anschluss"
      // beschriftet, obwohl intern ein Endpunkt gefangen war.
      const typ = leitungsSnap.fangArt === 'endpoint'
        ? ENDPOINT
        : leitungsSnap.fangArt === 'port'
          ? PORT
          : leitungsSnap.type === 'corner'
            ? CORNER
            : leitungsSnap.type === 'midpoint'
              ? MIDPOINT
              : leitungsSnap.type === 'perpendicular'
                ? PERPENDICULAR
              : leitungsSnap.type === 'line'
                ? NEAREST
                : ENDPOINT;
      return { ...fangStil(typ), typ, x:leitungsSnap.x, y:leitungsSnap.y };
    }
    if (!snapAn || !leitungsCursor) return null;
    const stil = fangStil(GRID);
    return { ...stil, typ:GRID, label:null, x:leitungsCursor.x, y:leitungsCursor.y };
  }, [leitungsCursor, leitungsEntwurf, leitungsSnap, snapAn]);

  // Punkt 8 — getippte Länge übernehmen. Die Richtung kommt aus der aktuellen
  // Vorschau, die Länge aus der Tastatur: exakt wie in Revit/AutoCAD.
  const laengeAnwenden = useCallback((buffer, angleBuffer = winkelPufferRef.current) => {
    const laenge = laengeAusBuffer(buffer);
    const winkel = angleBuffer !== null && angleBuffer !== '' ? Number.parseFloat(angleBuffer) : null;
    const draft = leitungsEntwurfRef.current;
    setLaengenPuffer(null);
    setWinkelPuffer(null);
    if ((!laenge && !Number.isFinite(winkel)) || !draft) return;
    const origin = letzterEntwurfsPunkt(draft);
    const richtung = leitungsCursorRef.current;
    const ziel = punktAusDynamischerEingabe(origin, richtung, {
      laenge,
      winkel,
      ortho:orthoAnRef.current,
      shift:shiftPressed,
      polar:drawingConfig.polar_snap,
      polarWinkel:drawingConfig.polar_angle,
    });
    // Ohne brauchbare Richtung wird nichts erfunden — der Entwurf bleibt offen.
    if (!ziel) return;
    const next = { ...draft, points:[...(draft.points || []), ziel] };
    leitungsEntwurfRef.current = next;
    setLeitungsEntwurf(next);
    leitungsCursorRef.current = ziel;
    setLeitungsCursor(ziel);
    setLeitungsSnap(null);
    setLeitungsGuides([]);
  }, [drawingConfig.polar_angle, drawingConfig.polar_snap, letzterEntwurfsPunkt, shiftPressed]);

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
    const point = constrainPoint(origin, best, {
      ortho:orthoAnRef.current,
      shift:event.shiftKey,
      grid:drawingConfig.grid_size,
    });
    basePoints.splice(best.segmentIndex, 0, point);
    setSelectedEdgePoint({ edgeId, pointIndex:best.segmentIndex });
    setEdges(items => items.map(item => item.id === edgeId
      ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points:basePoints } }
      : item));
  }, [drawingConfig.grid_size, routePunkte, screenToFlowPosition, setEdges, snap]);

  const punktEntfernen = useCallback((edgeId, pointIndex) => {
    snap();
    setSelectedEdgePoint(null);
    setEdges(items => items.map(item => {
      if (item.id !== edgeId) return item;
      const points = routePunkte(item).slice(1, -1).filter((_, index) => index !== pointIndex);
      return { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } };
    }));
  }, [routePunkte, setEdges, snap]);

  const griffPunktWaehlen = useCallback((event, edgeId, pointIndex) => {
    const griff = { edgeId, pointIndex };
    const erweitert = event?.shiftKey || event?.metaKey || event?.ctrlKey;
    setSelectedGripPoints(aktuell => {
      const vorhanden = aktuell.some(item => item.edgeId === edgeId && item.pointIndex === pointIndex);
      if (!erweitert) return [griff];
      return vorhanden
        ? aktuell.filter(item => item.edgeId !== edgeId || item.pointIndex !== pointIndex)
        : [...aktuell, griff];
    });
    setSelectedEdgePoint(griff);
  }, []);

  const punktDragStart = useCallback((event, edgeId, pointIndex) => {
    event.preventDefault();
    snap();
    const geklickt = { edgeId, pointIndex };
    const erweitert = event.shiftKey || event.metaKey || event.ctrlKey;
    const vorhanden = selectedGripPointsRef.current.some(item => item.edgeId === edgeId && item.pointIndex === pointIndex);
    const auswahl = erweitert
      ? (vorhanden ? selectedGripPointsRef.current : [...selectedGripPointsRef.current, geklickt])
      : (vorhanden && selectedGripPointsRef.current.length > 1 ? selectedGripPointsRef.current : [geklickt]);
    selectedGripPointsRef.current = auswahl;
    setSelectedGripPoints(auswahl);
    setSelectedEdgePoint(geklickt);
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    const points = route.slice(1, -1);
    const routeIndex = pointIndex + 1;
    edgePointDrag.current = {
      edgeId,
      pointIndex,
      route,
      origin:route[routeIndex - 1],
      pointer:screenToFlowPosition({ x:event.clientX, y:event.clientY }),
      multi:auswahl,
      routes:new Map([...new Set(auswahl.map(item => item.edgeId))].map(id => {
        const item = edgesRef.current.find(edgeItem => edgeItem.id === id);
        return [id, item ? routePunkte(item) : []];
      })),
    };
    setGriffMass(null);
    setEdges(items => items.map(item => item.id === edgeId
      ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } }
      : item));
  }, [routePunkte, screenToFlowPosition, setEdges, snap]);

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
    const frei = (nodeId) => {
      const node = nodesRef.current.find(item => item.id === nodeId);
      const grad = edgesRef.current.filter(item => item.source === nodeId || item.target === nodeId).length;
      return node?.type === 'junction' && node.data?.cad_anchor && grad === 1;
    };
    const startFrei = best.segmentIndex === 0 && frei(edge.source);
    const endFrei = best.segmentIndex === route.length - 2 && frei(edge.target);
    const vorbereitet = segmentZumVerschieben(route, best.segmentIndex, { startFrei, endFrei });
    if (!vorbereitet) return;
    setSelectedEdgeId(edgeId);
    setSelectedEdgeSegment({ edgeId, segmentIndex:best.segmentIndex });
    setSelectedEdgePoint(null);
    setSegmentVerschiebung({ edgeId, segmentIndex:best.segmentIndex, delta:{ x:0, y:0 }, active:true });
    edgeSegmentDrag.current = {
      edgeId,
      pointer:raw,
      segmentIndex:best.segmentIndex,
      sourceNodeId:startFrei ? edge.source : null,
      targetNodeId:endFrei ? edge.target : null,
      sourcePosition:startFrei ? { ...route[0] } : null,
      targetPosition:endFrei ? { ...route.at(-1) } : null,
      ...vorbereitet,
    };
  }, [routePunkte, screenToFlowPosition, snap]);

  const segmentNumerischVerschieben = useCallback((edgeId, segmentIndex, dxCm, dyCm) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge || !Number.isInteger(segmentIndex)) return;
    const route = routePunkte(edge);
    const frei = (nodeId) => {
      const node = nodesRef.current.find(item => item.id === nodeId);
      return node?.type === 'junction' && node.data?.cad_anchor
        && edgesRef.current.filter(item => item.source === nodeId || item.target === nodeId).length === 1;
    };
    const startFrei = segmentIndex === 0 && frei(edge.source);
    const endFrei = segmentIndex === route.length - 2 && frei(edge.target);
    const vorbereitet = segmentZumVerschieben(route, segmentIndex, { startFrei, endFrei });
    if (!vorbereitet) return;
    const delta = { x:(Number(dxCm) || 0) * 10, y:(Number(dyCm) || 0) * 10 };
    if (!delta.x && !delta.y) return;
    snap();
    const points = segmentVerschieben(
      vorbereitet.points, vorbereitet.pointIndexes, vorbereitet.orientation, delta,
      { grid:1, direction:vorbereitet.direction, axisLocked:true },
    );
    const bewegt = segmentVerschiebungDelta(vorbereitet.orientation, delta,
      { grid:1, direction:vorbereitet.direction, axisLocked:true });
    if (vorbereitet.moveStart || vorbereitet.moveEnd) {
      setNodes(items => items.map(node => {
        if (vorbereitet.moveStart && node.id === edge.source) return { ...node, position:{ x:route[0].x + bewegt.x, y:route[0].y + bewegt.y } };
        if (vorbereitet.moveEnd && node.id === edge.target) return { ...node, position:{ x:route.at(-1).x + bewegt.x, y:route.at(-1).y + bewegt.y } };
        return node;
      }));
    }
    setEdges(items => items.map(item => item.id === edgeId
      ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } }
      : item));
    setSegmentVerschiebung({ edgeId, segmentIndex, delta, active:false });
  }, [routePunkte, setEdges, setNodes, snap]);

  useEffect(() => {
    const move = (event) => {
      const drag = edgeSegmentDrag.current;
      if (!drag) return;
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      // Punkt 11 — Segment parallel verschieben; die Nachbarsegmente verlängern
      // sich dadurch von selbst. Rechnung in `schema/cadEdit.js` (getestet).
      const nextPoints = segmentVerschieben(
        drag.points, drag.pointIndexes, drag.orientation,
        { x:raw.x - drag.pointer.x, y:raw.y - drag.pointer.y },
        { grid:drawingConfig.grid_size, direction:drag.direction, axisLocked:true },
      );
      const delta = segmentVerschiebungDelta(drag.orientation,
        { x:raw.x - drag.pointer.x, y:raw.y - drag.pointer.y },
        { grid:drawingConfig.grid_size, direction:drag.direction, axisLocked:true });
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setEdges(items => items.map(item => item.id === drag.edgeId
          ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points:nextPoints } }
          : item));
        if (drag.moveStart || drag.moveEnd) {
          setNodes(items => items.map(node => {
            if (drag.moveStart && node.id === drag.sourceNodeId) return { ...node, position:{ x:drag.sourcePosition.x + delta.x, y:drag.sourcePosition.y + delta.y } };
            if (drag.moveEnd && node.id === drag.targetNodeId) return { ...node, position:{ x:drag.targetPosition.x + delta.x, y:drag.targetPosition.y + delta.y } };
            return node;
          }));
        }
        setSegmentVerschiebung({ edgeId:drag.edgeId, segmentIndex:drag.segmentIndex, delta, active:true });
      });
    };
    const up = () => {
      const beendet = edgeSegmentDrag.current;
      edgeSegmentDrag.current = null;
      setSegmentVerschiebung(current => current ? { ...current, active:false } : current);
      if (beendet?.edgeId) leitungNormalisieren(beendet.edgeId);
    };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drawingConfig.grid_size, leitungNormalisieren, screenToFlowPosition, setEdges, setNodes]);

  useEffect(() => {
    const move = (event) => {
      const drag = edgePointDrag.current;
      if (!drag) return;
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      if (drag.multi?.length > 1) {
        const delta = {
          x:Math.round((raw.x - drag.pointer.x) / drawingConfig.grid_size) * drawingConfig.grid_size,
          y:Math.round((raw.y - drag.pointer.y) / drawingConfig.grid_size) * drawingConfig.grid_size,
        };
        if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
        edgePointFrame.current = requestAnimationFrame(() => {
          setEdges(items => items.map(item => {
            const original = drag.routes.get(item.id);
            if (!original?.length) return item;
            const indexe = new Set(drag.multi.filter(griff => griff.edgeId === item.id).map(griff => griff.pointIndex));
            const points = original.slice(1, -1).map((punkt, index) => indexe.has(index)
              ? { x:punkt.x + delta.x, y:punkt.y + delta.y } : punkt);
            return { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } };
          }));
        });
        return;
      }
      // Dieselbe Regel wie beim Zeichnen: achsnah exakt 0/90°, erst eine
      // bewusste Abweichung ab 30° bleibt schräg. Der Bezugspunkt bleibt für
      // den ganzen Drag stabil und wandert nicht mit dem bereits gesetzten
      // Zwischenzustand mit.
      const ergebnis = eckpunktWeiterziehen(
        drag.route, drag.pointIndex + 1, raw, { grid:drawingConfig.grid_size },
      );
      if (!ergebnis) return;
      const point = ergebnis.point;
      const massA = istBewussteDiagonale(drag.origin, point) ? drag.origin : null;
      const massB = massA ? point : null;
      setGriffMass(massA && massB ? {
        a:massA, b:massB,
        laenge:Math.hypot(massB.x - massA.x, massB.y - massA.y),
        label:segmentMassLabel(massA, massB),
      } : null);
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setEdges(items => items.map(item => {
          if (item.id !== drag.edgeId) return item;
          return { ...item, data:{ ...(item.data || {}), points:ergebnis.points } };
        }));
      });
    };
    const up = () => {
      const beendet = edgePointDrag.current;
      edgePointDrag.current = null;
      setGriffMass(null);
      if (beendet?.multi?.length > 1) {
        [...new Set(beendet.multi.map(item => item.edgeId))].forEach(leitungNormalisieren);
      } else if (beendet?.edgeId) leitungNormalisieren(beendet.edgeId);
    };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
    };
  }, [drawingConfig.grid_size, leitungNormalisieren, screenToFlowPosition, setEdges]);

  // ── Leitungsbeschriftung (DN / m') ──────────────────────────────────────
  // Sie gehört zur Leitung, steht im Plan aber oft im Weg. Darum: greifen und
  // frei versetzen, ausblenden, zurücksetzen. Alles landet in `edge.data` und
  // damit im Speicherstand UND im PDF-Export.
  const beschriftungSetzen = useCallback((edgeId, aenderung) => {
    snap();
    setEdges(items => items.map(edge => edge.id === edgeId
      ? { ...edge, data:{ ...(edge.data || {}), ...aenderung } }
      : edge));
  }, [setEdges, snap]);

  const labelZuruecksetzen = useCallback((edgeId) => {
    beschriftungSetzen(edgeId, { label_offset:{ x:0, y:0 }, label_hidden:false });
  }, [beschriftungSetzen]);

  const labelDragStart = useCallback((event, edgeId) => {
    event.preventDefault();
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    snap();
    setSelectedLabelEdgeId(edgeId);
    setSelectedEdgeId(edgeId);
    setSelected(null);
    labelDrag.current = {
      edgeId,
      start:screenToFlowPosition({ x:event.clientX, y:event.clientY }),
      versatz:labelVersatz(edge.data),
    };
  }, [screenToFlowPosition, snap]);

  useEffect(() => {
    const move = (event) => {
      const drag = labelDrag.current;
      if (!drag) return;
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      // Beschriftungen sind Anschriften, keine Geometrie: sie laufen frei mit
      // dem Cursor. Shift rastert sie fürs saubere Ausrichten mehrerer Labels.
      const versatz = labelVerschoben(drag.versatz,
        { x:raw.x - drag.start.x, y:raw.y - drag.start.y },
        { grid:event.shiftKey ? drawingConfig.grid_size : 0 });
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setEdges(items => items.map(edge => edge.id === drag.edgeId
          ? { ...edge, data:{ ...(edge.data || {}), label_offset:versatz } }
          : edge));
      });
    };
    const up = () => { labelDrag.current = null; };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drawingConfig.grid_size, screenToFlowPosition, setEdges]);

  // ── Verschieben (CAD-MOVE, Dominic 2026-07-31) ───────────────────────────
  // Auswahl treffen, Taste drücken, Basispunkt klicken, Zielpunkt klicken. Die
  // Richtung fängt achsnah orthogonal; Shift gibt sie frei — dieselbe
  // Regel wie beim Zeichnen. Verschoben wird, was beim Start ausgewählt war.
  // ── Stecknadeln: laden, setzen, verschieben, öffnen ─────────────────────
  const notizenLaden = useCallback(async () => {
    if (!projectId || !schemaId) return;
    try {
      const daten = await getProjectNotes(projectId, { schema_id:schemaId });
      setNotizen(daten.notizen || []);
    } catch { /* Journal ist nicht kritisch fürs Zeichnen */ }
  }, [projectId, schemaId]);

  useEffect(() => { notizenLaden(); }, [notizenLaden]);

  // Aus der Dokumentation heraus verlinkt: ?notiz=<id> zeigt genau diese Nadel.
  useEffect(() => {
    const gesucht = Number(new URLSearchParams(window.location.search).get('notiz'));
    if (!gesucht || !notizen.length) return;
    const treffer = notizen.find(item => item.id === gesucht);
    if (!treffer?.pin) return;
    setCenter(treffer.pin.x, treffer.pin.y, { zoom:Math.max(getZoom(), 0.8), duration:500 });
    setOffeneNotiz({ id:treffer.id, titel:treffer.titel, text:treffer.text });
  }, [notizen, getZoom, setCenter]);

  const nadelSetzen = useCallback(async (weltPunkt, nodeId = null) => {
    if (!projectId || !schemaId) return;
    try {
      const neu = await createProjectNote(projectId, {
        kind:'notiz', titel:'', text:'',
        pin:{ schema_id:schemaId, x:weltPunkt.x, y:weltPunkt.y, node_id:nodeId },
      });
      setNotizen(liste => [neu, ...liste]);
      setOffeneNotiz({ id:neu.id, titel:'', text:'', neu:true });
    } catch { alert('Notiz konnte nicht angelegt werden.'); }
    setNadelModus(false);
  }, [projectId, schemaId]);

  const notizSpeichern = useCallback(async (noteId, felder) => {
    try {
      const neu = await updateProjectNote(projectId, noteId, felder);
      setNotizen(liste => liste.map(item => (item.id === noteId ? neu : item)));
      return neu;
    } catch { alert('Notiz konnte nicht gespeichert werden.'); return null; }
  }, [projectId]);

  const nadelEntfernen = useCallback(async (noteId) => {
    const neu = await notizSpeichern(noteId, { pin_entfernen:true });
    if (neu) setNotizen(liste => liste.filter(item => item.id !== noteId));
    setOffeneNotiz(null);
  }, [notizSpeichern]);

  // Nadel im Bild verschieben — dieselbe Geste wie bei allem anderen im Editor.
  const nadelDragStart = useCallback((event, noteId) => {
    event.preventDefault();
    event.stopPropagation();
    const bewegen = (ev) => {
      const punkt = screenToFlowPosition({ x:ev.clientX, y:ev.clientY });
      setNotizen(liste => liste.map(item => (item.id === noteId
        ? { ...item, pin:{ ...item.pin, x:punkt.x, y:punkt.y } }
        : item)));
    };
    const beenden = (ev) => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', beenden);
      const punkt = screenToFlowPosition({ x:ev.clientX, y:ev.clientY });
      notizSpeichern(noteId, { pin:{ schema_id:schemaId, x:punkt.x, y:punkt.y } });
    };
    window.addEventListener('pointermove', bewegen);
    window.addEventListener('pointerup', beenden);
  }, [notizSpeichern, schemaId, screenToFlowPosition]);

  const verschiebeZiele = useCallback((ganzeLeitung = false) => {
    if (selected) return { nodeId:selected.id, beschreibung:'Bauteil' };
    if (markierteEdgeIds.length) {
      return { edgeIds:markierteEdgeIds, beschreibung:`${markierteEdgeIds.length} Leitungen` };
    }
    if (!ganzeLeitung && selectedEdgeSegment?.edgeId === selectedEdgeId && selectedEdgeId) {
      return {
        edgeId:selectedEdgeId,
        segmentIndex:selectedEdgeSegment.segmentIndex,
        beschreibung:`Teilstück ${selectedEdgeSegment.segmentIndex + 1}`,
      };
    }
    if (selectedEdgeId) return { edgeIds:[selectedEdgeId], beschreibung:'ganze Leitung' };
    return null;
  }, [markierteEdgeIds, selected, selectedEdgeId, selectedEdgeSegment]);

  const leitungenVerschieben = useCallback((edgeIds, delta) => {
    const ids = new Set(edgeIds);
    const betroffen = edgesRef.current.filter(edge => ids.has(edge.id));
    if (!betroffen.length) return;
    // Ein freies Ende wandert nur mit, wenn ALLE dort hängenden Leitungen
    // mitverschoben werden — sonst würde eine unbeteiligte Leitung verzerrt.
    const frei = (nodeId) => {
      const node = nodesRef.current.find(item => item.id === nodeId);
      if (node?.type !== 'junction') return false;
      return edgesRef.current
        .filter(edge => edge.source === nodeId || edge.target === nodeId)
        .every(edge => ids.has(edge.id));
    };
    const neuePunkte = new Map();
    const neueAnker = new Map();
    betroffen.forEach(edge => {
      const ergebnis = leitungVerschieben(routePunkte(edge), delta, {
        startFrei:frei(edge.source), endFrei:frei(edge.target),
      });
      if (!ergebnis) return;
      neuePunkte.set(edge.id, ergebnis.points);
      if (ergebnis.start) neueAnker.set(edge.source, ergebnis.start);
      if (ergebnis.end) neueAnker.set(edge.target, ergebnis.end);
    });
    if (!neuePunkte.size) return;
    snap();
    setNodes(items => items.map(node => (neueAnker.has(node.id)
      ? { ...node, position:neueAnker.get(node.id) }
      : node)));
    setEdges(items => items.map(edge => (neuePunkte.has(edge.id)
      ? { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:neuePunkte.get(edge.id) } }
      : edge)));
  }, [routePunkte, setEdges, setNodes, snap]);

  const zieleVerschieben = useCallback((ziele, delta) => {
    if (!ziele || (!delta.x && !delta.y)) return;
    // Jede Variante ruft die bestehende, getestete Operation — der Befehl selbst
    // rechnet keine eigene Geometrie.
    if (ziele.nodeId) { nudgeNode(ziele.nodeId, delta.x, delta.y); return; }
    if (Number.isInteger(ziele.segmentIndex)) {
      segmentNumerischVerschieben(ziele.edgeId, ziele.segmentIndex, delta.x / 10, delta.y / 10);
      return;
    }
    leitungenVerschieben(ziele.edgeIds || [], delta);
  }, [leitungenVerschieben, nudgeNode, segmentNumerischVerschieben]);

  const verschiebenStarten = useCallback((ganzeLeitung = false) => {
    const ziele = verschiebeZiele(ganzeLeitung);
    if (!ziele) return false;
    setEndpointMenu(null);
    setEdgeMenu(null);
    setLeitungsGuides([]);
    setVerschiebung({ ziele, basis:null, cursor:null });
    setEditorMode(startCommand(MOVE));
    return true;
  }, [verschiebeZiele]);

  // ── Befehlsstarter ────────────────────────────────────────────────────────
  // Werkzeugleiste und Tastatur gehen denselben Weg. Zwei Kopien desselben
  // Befehls würden früher oder später auseinanderlaufen — und dann tut der
  // Knopf etwas anderes als die Taste.
  const leitungBefehl = useCallback(() => {
    // Drei Stufen an EINEM Befehl: aus → einmalig → dauerhaft → aus.
    setEditorMode(mode => (zeichnetLeitung(mode)
      ? (mode.persistent ? escapeMode(mode) : startCommand(DRAW_PIPE, { persistent:true }))
      : startCommand(DRAW_PIPE, { persistent:false })));
  }, []);

  const trennenStarten = useCallback(() => {
    if (!selectedEdgeIdRef.current) {
      setBefehlHinweis('Zuerst die Leitung anklicken, die getrennt werden soll.');
      return;
    }
    setBefehlHinweis(null);
    setLuecke({ edgeId:selectedEdgeIdRef.current, erster:null });
    setEditorMode(startCommand(BREAK));
  }, []);

  const dehnenStarten = useCallback(() => {
    setBefehlHinweis(null);
    setDehnen({ ecke1:null, ecke2:null, basis:null, cursor:null });
    setEditorMode(startCommand(STRETCH));
  }, []);

  const ausrichtenUmschalten = useCallback(() => {
    setAusrichtenHinweis(null);
    setEditorMode(mode => toggleCommand(mode, ALIGN));
  }, []);

  // ── Mit Lücke trennen (AutoCAD BREAK) ────────────────────────────────────
  // Zwei Punkte auf derselben Leitung; das Stück dazwischen fällt weg. Das
  // trennt AUCH die hydraulische Verbindung — beide Teile enden danach an einem
  // freien Anker. Genau das ist der Zweck des Befehls, darum sagt es der
  // Hinweis auch ausdrücklich.
  const lueckeTrennen = useCallback((edgeId, trefferA, trefferB) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    if (!edge) return;
    const route = routePunkte(edge);
    const ergebnis = leitungMitLueckeTrennen(route, trefferA, trefferB);
    if (ergebnis.fehler) { setBefehlHinweis(ergebnis.fehler); return; }
    const layer = layerVonEdge(edge);
    const ankerA = newId();
    const ankerB = newId();
    const zweiteId = newId();
    snap();
    setNodes(items => [
      ...items,
      cadAnker(ankerA, ergebnis.erste.at(-1), layer),
      cadAnker(ankerB, ergebnis.zweite[0], layer),
    ]);
    setEdges(items => items.flatMap(item => {
      if (item.id !== edgeId) return [item];
      const daten = { ...(item.data || {}), cad_polyline:true, polyline_version:1 };
      // Die eingetragene Länge stimmt nach dem Trennen nicht mehr; sie wird
      // entfernt statt stillschweigend halbiert (keine erfundene Zahl).
      delete daten.laenge_m;
      delete daten.paired_edge_id;
      return [
        { ...item, target:ankerA, targetHandle:'center-target', selected:false,
          data:{ ...daten, points:ergebnis.erste.slice(1, -1) } },
        { ...item, id:zweiteId, source:ankerB, sourceHandle:'center-source', selected:false,
          data:{ ...daten, points:ergebnis.zweite.slice(1, -1) } },
      ];
    }));
    setBefehlHinweis(null);
    setLuecke(null);
    setSelectedEdgeId(null);
    setSelectedEdgeSegment(null);
    setEditorMode(finishCommand(editorModeRef.current));
  }, [cadAnker, routePunkte, setEdges, setNodes, snap]);

  const lueckeKlick = useCallback((event) => {
    const aktuell = lueckeRef.current;
    if (!aktuell) return false;
    if (event.button != null && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const welt = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const edge = edgesRef.current.find(item => item.id === aktuell.edgeId);
    if (!edge) { setLuecke(null); return true; }
    const route = routePunkte(edge);
    let treffer = null;
    for (let index = 0; index < route.length - 1; index += 1) {
      const hit = projektionAufSegment(welt, route[index], route[index + 1]);
      if (hit && (!treffer || hit.distance < treffer.distance)) {
        treffer = { segmentIndex:index, x:hit.x, y:hit.y, distance:hit.distance };
      }
    }
    if (!treffer) {
      setBefehlHinweis('Punkt liegt nicht auf der gewählten Leitung.');
      return true;
    }
    if (!aktuell.erster) {
      setBefehlHinweis(null);
      setLuecke({ ...aktuell, erster:treffer });
      return true;
    }
    lueckeTrennen(aktuell.edgeId, aktuell.erster, treffer);
    return true;
  }, [lueckeTrennen, routePunkte, screenToFlowPosition]);

  // Eine hydraulische Leitung durch null, eine oder mehrere Rest-Routen
  // ersetzen. Neue offene Enden werden echte Junctions; ursprüngliche
  // Bauteilanschlüsse bleiben an den äusseren Reststücken erhalten.
  const leitungDurchRoutenErsetzen = useCallback((edge, routes, basisEdges, basisNodes) => {
    const original = routePunkte(edge);
    const layer = layerVonEdge(edge);
    const gleich = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
    const neueNodes = [];
    const neueEdges = [];
    const daten = { ...(edge.data || {}) };
    delete daten.laenge_m;
    delete daten.paired_edge_id;
    delete daten.auto_paired;
    delete daten.auto_pair_open;
    delete daten._routePoints;
    delete daten._routeStart;
    delete daten._routeEnd;
    routes.forEach((route, index) => {
      if (!Array.isArray(route) || route.length < 2) return;
      const amStart = gleich(route[0], original[0]);
      const amEnde = gleich(route.at(-1), original.at(-1));
      const source = amStart ? edge.source : newId();
      const target = amEnde ? edge.target : newId();
      if (!amStart) neueNodes.push(cadAnker(source, route[0], layer));
      if (!amEnde) neueNodes.push(cadAnker(target, route.at(-1), layer));
      const erstellt = createHydraulicEdge({
        id:index === 0 ? edge.id : newId(),
        source, sourceHandle:amStart ? edge.sourceHandle : 'center-source',
        target, targetHandle:amEnde ? edge.targetHandle : 'center-target',
        layerId:layer.id, layerColor:layer.color,
        points:route.slice(1, -1), cornerRadius:drawingConfig.corner_radius,
      }, [...basisEdges, ...neueEdges]);
      if (erstellt) neueEdges.push({ ...erstellt, selected:false,
        data:{ ...(erstellt.data || {}), ...daten, cad_polyline:true, polyline_version:1,
          points:route.slice(1, -1) } });
    });
    const naechsteEdges = [
      ...basisEdges.filter(item => item.id !== edge.id).map(item => {
        if (item.data?.paired_edge_id !== edge.id) return item;
        const data = { ...(item.data || {}) }; delete data.paired_edge_id;
        return { ...item, data };
      }),
      ...neueEdges,
    ];
    const benutzt = new Set(naechsteEdges.flatMap(item => [item.source, item.target]));
    const naechsteNodes = [...basisNodes, ...neueNodes]
      .filter(node => node.type !== 'junction' || benutzt.has(node.id));
    return { nodes:naechsteNodes, edges:naechsteEdges };
  }, [cadAnker, drawingConfig.corner_radius, routePunkte]);

  const eckeVerbindenAnwenden = useCallback((ersteAuswahl, zweiteAuswahl) => {
    if (!ersteAuswahl || !zweiteAuswahl) return { fehler:'Zwei Teilstücke erforderlich.' };
    if (ersteAuswahl.edgeId === zweiteAuswahl.edgeId) {
      return { fehler:'TR braucht zwei verschiedene Leitungen.' };
    }
    const ersteEdge = edgesRef.current.find(edge => edge.id === ersteAuswahl.edgeId);
    const zweiteEdge = edgesRef.current.find(edge => edge.id === zweiteAuswahl.edgeId);
    if (!ersteEdge || !zweiteEdge) return { fehler:'Eine gewählte Leitung existiert nicht mehr.' };
    if (layerVonEdge(ersteEdge).id !== layerVonEdge(zweiteEdge).id) {
      return { fehler:'TR verbindet nur Leitungen auf demselben Layer.' };
    }

    const freieSeiten = (edge) => {
      const frei = [];
      const pruefen = (nodeId, seite) => {
        const node = nodesRef.current.find(item => item.id === nodeId);
        const grad = edgesRef.current.filter(item => item.source === nodeId || item.target === nodeId).length;
        if (node?.type === 'junction' && grad === 1) frei.push(seite);
      };
      pruefen(edge.source, 'start');
      pruefen(edge.target, 'end');
      return frei;
    };

    const routeA = routePunkte(ersteEdge);
    const routeB = routePunkte(zweiteEdge);
    const ergebnis = leitungenMitEckeVerbinden(
      routeA, ersteAuswahl.segmentIndex, routeB, zweiteAuswahl.segmentIndex,
      { erlaubteSeitenA:freieSeiten(ersteEdge), erlaubteSeitenB:freieSeiten(zweiteEdge) },
    );
    if (ergebnis.fehler) return ergebnis;

    const endNode = (edge, seite) => (seite === 'start' ? edge.source : edge.target);
    const gemeinsamerNodeId = endNode(ersteEdge, ergebnis.erste.seite);
    const entfallenderNodeId = endNode(zweiteEdge, ergebnis.zweite.seite);
    if (gemeinsamerNodeId === entfallenderNodeId) {
      return { fehler:'Die Leitungen sind an diesem Ende bereits verbunden.' };
    }

    const geaenderteIds = new Set([ersteEdge.id, zweiteEdge.id]);
    const datenFuerRoute = (edge, route) => {
      const points = routeBereinigen(route.slice(1, -1), {
        start:route[0],
        end:route.at(-1),
      });
      const data = {
        ...(edge.data || {}),
        cad_polyline:true,
        polyline_version:1,
        points,
      };
      delete data.laenge_m;
      delete data.paired_edge_id;
      delete data.auto_paired;
      delete data.auto_pair_open;
      delete data._routePoints;
      delete data._routeStart;
      delete data._routeEnd;
      if (route.length === 2 && istBewussteDiagonale(route[0], route[1])) data.cad_diagonal = true;
      else delete data.cad_diagonal;
      return data;
    };
    const anEcke = (edge, seite, route) => ({
      ...edge,
      ...(seite === 'start'
        ? { source:gemeinsamerNodeId, sourceHandle:'center-source' }
        : { target:gemeinsamerNodeId, targetHandle:'center-target' }),
      selected:false,
      data:datenFuerRoute(edge, route),
    });

    snap();
    setNodes(items => items
      .filter(node => node.id !== entfallenderNodeId)
      .map(node => node.id === gemeinsamerNodeId
        ? { ...node, position:{ x:ergebnis.ecke.x, y:ergebnis.ecke.y } }
        : node));
    setEdges(items => items.map(edge => {
      if (edge.id === ersteEdge.id) return anEcke(edge, ergebnis.erste.seite, ergebnis.erste.route);
      if (edge.id === zweiteEdge.id) return anEcke(edge, ergebnis.zweite.seite, ergebnis.zweite.route);
      if (!geaenderteIds.has(edge.data?.paired_edge_id)) return edge;
      const data = { ...(edge.data || {}) };
      delete data.paired_edge_id;
      delete data.auto_paired;
      delete data.auto_pair_open;
      return { ...edge, data };
    }));
    setSelectedEdgeId(null);
    setSelectedEdgeSegment(null);
    setSelectedSegments([]);
    setEditorMode(startCommand(CONNECT_CORNER, { persistent:true }));
    setBefehlHinweis('TR · Ecke verbunden · erste Leitung für die nächste Ecke wählen · ESC beendet.');
    return { ...ergebnis, ok:true };
  }, [routePunkte, setEdges, setNodes, snap]);

  const eckeVerbindenStarten = useCallback(() => {
    setLuecke(null);
    const auswahl = selectedSegments.filter((item, index, alle) =>
      alle.findIndex(candidate => candidate.edgeId === item.edgeId
        && candidate.segmentIndex === item.segmentIndex) === index);
    if (auswahl.length > 2) {
      setBefehlHinweis('TR · Bitte genau zwei Teilstücke wählen.');
      return;
    }
    if (auswahl.length === 2) {
      const ergebnis = eckeVerbindenAnwenden(auswahl[0], auswahl[1]);
      if (ergebnis.fehler) {
        setEditorMode(startCommand(CONNECT_CORNER, { persistent:true, payload:{ erste:auswahl[0] } }));
        setSelectedSegments([auswahl[0]]);
        setBefehlHinweis(`TR · ${ergebnis.fehler} Zweite Leitung erneut wählen.`);
      }
      return;
    }
    const erste = auswahl[0] || null;
    setEditorMode(startCommand(CONNECT_CORNER, {
      persistent:true,
      payload:erste ? { erste } : null,
    }));
    setBefehlHinweis(erste
      ? 'TR · Erste Leitung gewählt · zweite Leitung anklicken · ESC beendet.'
      : 'TR · Erste Leitung anklicken · danach zweite Leitung · ESC beendet.');
  }, [eckeVerbindenAnwenden, selectedSegments]);

  const eckeVerbindenKlick = useCallback((event) => {
    if (!istBefehl(editorModeRef.current, CONNECT_CORNER)) return false;
    if (event.button != null && event.button !== 0) return true;
    event.preventDefault();
    event.stopPropagation();
    const welt = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const treffer = naechsteSichtbareLeitung(welt, 24 / Math.max(getZoom(), 0.2));
    if (!treffer) {
      setBefehlHinweis('TR · Kein Teilstück getroffen — direkt auf eine Leitung klicken.');
      return true;
    }
    const auswahl = { edgeId:treffer.edge.id, segmentIndex:treffer.segmentIndex };
    const erste = editorModeRef.current?.payload?.erste;
    if (!erste) {
      setSelectedEdgeId(treffer.edge.id);
      setSelectedEdgeSegment(auswahl);
      setSelectedSegments([auswahl]);
      setEditorMode(startCommand(CONNECT_CORNER, { persistent:true, payload:{ erste:auswahl } }));
      setBefehlHinweis('TR · Erste Leitung gewählt · zweite Leitung anklicken · ESC beendet.');
      return true;
    }
    if (erste.edgeId === auswahl.edgeId && erste.segmentIndex === auswahl.segmentIndex) {
      setBefehlHinweis('TR · Zweite Leitung muss ein anderes Teilstück sein.');
      return true;
    }
    const ergebnis = eckeVerbindenAnwenden(erste, auswahl);
    if (ergebnis.fehler) {
      setBefehlHinweis(`TR · ${ergebnis.fehler} Zweite Leitung erneut wählen.`);
      setSelectedSegments([erste]);
    }
    return true;
  }, [eckeVerbindenAnwenden, getZoom, naechsteSichtbareLeitung, screenToFlowPosition]);

  // ── Leitungen ändern: Versatz, Stutzen, Dehnen bis Kante, Verbinden ──────
  // (Issue #72)
  //
  // Alle vier folgen demselben Muster wie „Ecke verbinden": der Fortschritt
  // liegt in der Nutzlast des Befehlszustands, nicht in eigenen Booleans. ESC
  // und Rechtsklick führen dadurch ohne Sonderbehandlung nach `modify` zurück,
  // und jede ausgeführte Änderung ist genau EIN `snap()` — also ein Undo-Schritt.

  // Geometriedaten, die nach einer Formänderung nicht mehr stimmen. Eine
  // falsche Länge ist schlimmer als keine: sie wanderte sonst unbemerkt in
  // Kostenschätzung und Export.
  const geometrieDaten = useCallback((edge) => {
    const data = { ...(edge.data || {}), cad_polyline:true, polyline_version:1 };
    delete data.laenge_m;
    delete data.paired_edge_id;
    delete data.auto_paired;
    delete data.auto_pair_open;
    delete data._routePoints;
    delete data._routeStart;
    delete data._routeEnd;
    return data;
  }, []);

  const befehlLeitungsTreffer = useCallback((event) => {
    const welt = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const treffer = naechsteSichtbareLeitung(welt, 24 / Math.max(getZoom(), 0.2));
    return treffer ? { ...treffer, welt } : null;
  }, [getZoom, naechsteSichtbareLeitung, screenToFlowPosition]);

  const istFreierKnoten = useCallback((nodeId) =>
    nodesRef.current.find(node => node.id === nodeId)?.type === 'junction', []);

  // ── Versatz (AutoCAD OFFSET) ─────────────────────────────────────────────
  // Ein Klick genügt: er sagt zugleich, WELCHE Leitung versetzt wird und auf
  // welche SEITE. Die Quelle bleibt unverändert — es entsteht eine zweite
  // Leitung mit eigenen Ankern.
  const versatzAnwenden = useCallback((treffer, abstand, zielLayerWunsch) => {
    const edge = treffer.edge;
    const route = treffer.route;
    const quellLayer = layerVonEdge(edge);
    const seite = versatzSeite(
      route[treffer.segmentIndex], route[treffer.segmentIndex + 1], treffer.welt,
    );
    const ergebnis = routeVersetzen(route, abstand, { seite });
    if (ergebnis.fehler) return ergebnis;

    // Vorgabe ist der Rücklauf zum Vorlauf: ein Versatz dient fast immer dazu,
    // den Partner mitzuzeichnen. Ohne RL-Partner (Trinkwasser, Allgemein)
    // bleibt die Kopie auf dem Layer der Quelle.
    const zielLayer = zielLayerWunsch || ruecklaufLayerVon(quellLayer) || quellLayer;
    const sourceId = newId();
    const targetId = newId();
    const neu = createHydraulicEdge({
      id:newId(),
      source:sourceId, sourceHandle:'center-source',
      target:targetId, targetHandle:'center-target',
      layerId:zielLayer.id, layerColor:zielLayer.color,
      points:ergebnis.route.slice(1, -1),
      cornerRadius:drawingConfig.corner_radius,
      startPoint:ergebnis.route[0], endPoint:ergebnis.route.at(-1),
    }, edgesRef.current);
    if (!neu) return { fehler:'Die versetzte Leitung wäre nicht gültig.' };

    snap();
    setNodes(items => [
      ...items,
      cadAnker(sourceId, ergebnis.route[0], zielLayer),
      cadAnker(targetId, ergebnis.route.at(-1), zielLayer),
    ]);
    setEdges(items => [...items, {
      ...neu,
      // Fachdaten der Quelle (DN, Medium, Dämmung) erben; `neu.data` setzt
      // danach Layer und Farbe der KOPIE — sonst behielte sie die der Quelle.
      data:{ ...geometrieDaten(edge), ...(neu.data || {}), points:ergebnis.route.slice(1, -1) },
    }]);
    return { ok:true, layer:zielLayer };
  }, [cadAnker, drawingConfig.corner_radius, geometrieDaten, setEdges, setNodes, snap]);

  const versatzStarten = useCallback(() => {
    setLuecke(null);
    if (istBefehl(editorModeRef.current, OFFSET)) {
      setEditorMode(escapeMode(editorModeRef.current));
      setBefehlHinweis(null);
      return;
    }
    setEditorMode(startCommand(OFFSET, {
      persistent:true, payload:{ abstand:VERSATZ_STANDARD, puffer:'' },
    }));
    setBefehlHinweis(versatzHinweis(VERSATZ_STANDARD));
  }, []);

  const versatzKlick = useCallback((event) => {
    if (!istBefehl(editorModeRef.current, OFFSET)) return false;
    if (event.button != null && event.button !== 0) return true;
    event.preventDefault();
    event.stopPropagation();
    const abstand = editorModeRef.current?.payload?.abstand ?? VERSATZ_STANDARD;
    const treffer = befehlLeitungsTreffer(event);
    if (!treffer) {
      setBefehlHinweis('Versatz · Keine Leitung getroffen — direkt auf die Leitung klicken.');
      return true;
    }
    const ergebnis = versatzAnwenden(treffer, abstand, event.shiftKey ? activeLayer : null);
    setBefehlHinweis(ergebnis.fehler
      ? `Versatz · ${ergebnis.fehler}`
      : `Versatz · ${ergebnis.layer.label} im Abstand ${abstand} mm erstellt · `
        + 'nächste Leitung anklicken · ESC beendet.');
    return true;
  }, [activeLayer, befehlLeitungsTreffer, versatzAnwenden]);

  // ── Stutzen (AutoCAD TRIM) und Dehnen bis Kante (AutoCAD EXTEND) ─────────
  // Zwei Befehle, eine Bedienung: erst die Begrenzung wählen, dann auf die
  // Leitung klicken. Shift schaltet im laufenden Befehl auf den jeweils anderen
  // um — das ist die CAD-Konvention und spart das Umschalten in der Leiste.
  const stutzenAnwenden = useCallback((ziel, grenzEdgeId) => {
    const grenzEdge = edgesRef.current.find(item => item.id === grenzEdgeId);
    if (!grenzEdge) return { fehler:'Die Begrenzung existiert nicht mehr.' };
    if (grenzEdge.id === ziel.edge.id) return { fehler:'Eine Leitung kann sich nicht selbst begrenzen.' };
    const ergebnis = leitungTrimmen(ziel.route, routePunkte(grenzEdge), {
      segmentIndex:ziel.segmentIndex, x:ziel.x, y:ziel.y,
    });
    if (ergebnis.fehler) return ergebnis;
    snap();
    const naechste = leitungDurchRoutenErsetzen(
      ziel.edge, ergebnis.routen, edgesRef.current, nodesRef.current,
    );
    setNodes(naechste.nodes);
    setEdges(naechste.edges);
    setSelectedEdgeId(null);
    setSelectedEdgeSegment(null);
    setSelectedSegments([]);
    return { ok:true, reste:ergebnis.routen.length };
  }, [leitungDurchRoutenErsetzen, routePunkte, setEdges, setNodes, snap]);

  const bisKanteDehnenAnwenden = useCallback((ziel, grenzEdgeId) => {
    const grenzEdge = edgesRef.current.find(item => item.id === grenzEdgeId);
    if (!grenzEdge) return { fehler:'Die Begrenzung existiert nicht mehr.' };
    if (grenzEdge.id === ziel.edge.id) return { fehler:'Eine Leitung kann sich nicht an sich selbst verlängern.' };
    const grenzLayer = layerVonEdge(grenzEdge);
    // Ein T-Stück zwischen zwei Layern wäre hydraulisch falsch (Vorlauf auf
    // Rücklauf). Dieselbe Sperre wie bei „Ecke verbinden".
    if (layerVonEdge(ziel.edge).id !== grenzLayer.id) {
      return { fehler:'Dehnen verbindet nur Leitungen auf demselben Layer.' };
    }
    const route = ziel.route;
    // Verlängert wird das Ende, bei dem geklickt wurde — die CAD-Regel.
    const seite = Math.hypot(ziel.x - route[0].x, ziel.y - route[0].y)
      <= Math.hypot(ziel.x - route.at(-1).x, ziel.y - route.at(-1).y) ? 'source' : 'target';
    const ankerId = seite === 'source' ? ziel.edge.source : ziel.edge.target;
    const grad = edgesRef.current.filter(
      item => item.source === ankerId || item.target === ankerId).length;
    if (!istFreierKnoten(ankerId) || grad !== 1) {
      return { fehler:'Dieses Leitungsende hängt an einem Bauteil oder einer Abzweigung und darf nicht wandern.' };
    }

    const grenzRoute = routePunkte(grenzEdge);
    const ergebnis = routeBisKanteDehnen(route, seite, grenzRoute);
    if (ergebnis.fehler) return ergebnis;

    // Trifft die Verlängerung genau auf ein Ende der Begrenzung, entstünde beim
    // Teilen ein Stück ohne Länge. Dafür gibt es den passenden Befehl bereits.
    const amEnde = [grenzRoute[0], grenzRoute.at(-1)].some(punkt =>
      Math.hypot(punkt.x - ergebnis.punkt.x, punkt.y - ergebnis.punkt.y) < 1);
    if (amEnde) {
      return { fehler:'Der Treffpunkt liegt auf einem Leitungsende — dort ist „Ecke verbinden" (TR) der richtige Befehl.' };
    }

    // Am Treffpunkt entsteht eine echte T-Verbindung: die Begrenzung wird dort
    // geteilt, und beide Hälften hängen am selben Knoten wie das verlängerte
    // Ende. Ohne das läge die Leitung nur optisch an.
    const [ersteHaelfte, zweiteHaelfte] = leitungTeilen({
      edge:grenzEdge, route:grenzRoute,
      segmentIndex:ergebnis.grenzSegmentIndex,
      x:ergebnis.punkt.x, y:ergebnis.punkt.y,
    }, ankerId, grenzLayer.id);

    snap();
    setNodes(items => items.map(node => (node.id === ankerId
      ? { ...node, position:{ x:ergebnis.punkt.x, y:ergebnis.punkt.y } }
      : node)));
    setEdges(items => items.flatMap(item => {
      if (item.id === ziel.edge.id) {
        return [{ ...item, selected:false,
          data:{ ...geometrieDaten(item), points:ergebnis.route.slice(1, -1) } }];
      }
      if (item.id === grenzEdge.id) return [ersteHaelfte, zweiteHaelfte];
      return [item];
    }));
    setSelectedEdgeId(null);
    setSelectedEdgeSegment(null);
    setSelectedSegments([]);
    return { ok:true };
  }, [geometrieDaten, istFreierKnoten, leitungTeilen, routePunkte, setEdges, setNodes, snap]);

  // Einstieg für beide Befehle. `alsDehnen` sagt, was der Grundfall ist; Shift
  // dreht ihn im laufenden Befehl um.
  const grenzBefehlStarten = useCallback((alsDehnen) => {
    setLuecke(null);
    const typ = alsDehnen ? EXTEND : TRIM;
    const name = alsDehnen ? 'Dehnen bis Kante' : 'Stutzen';
    if (istBefehl(editorModeRef.current, typ)) {
      setEditorMode(escapeMode(editorModeRef.current));
      setBefehlHinweis(null);
      return;
    }
    // Ein bereits gewähltes Teilstück ist die Begrenzung — dann fehlt nur noch
    // der Klick auf die Leitung.
    const vorwahl = selectedEdgeSegment || selectedSegments[0] || null;
    setEditorMode(startCommand(typ, {
      persistent:true, payload:{ grenzEdgeId:vorwahl?.edgeId || null },
    }));
    setBefehlHinweis(vorwahl?.edgeId
      ? `${name} · Begrenzung steht · jetzt die Leitung anklicken · Shift schaltet auf ${alsDehnen ? 'Stutzen' : 'Dehnen'} · ESC beendet.`
      : `${name} · Zuerst die Begrenzungsleitung anklicken · ESC beendet.`);
  }, [selectedEdgeSegment, selectedSegments]);

  const grenzBefehlKlick = useCallback((event) => {
    const mode = editorModeRef.current;
    const imTrimmen = istBefehl(mode, TRIM);
    const imDehnen = istBefehl(mode, EXTEND);
    if (!imTrimmen && !imDehnen) return false;
    if (event.button != null && event.button !== 0) return true;
    event.preventDefault();
    event.stopPropagation();
    // Shift kehrt die Wirkung um, ohne den Befehl zu verlassen (CAD-Konvention).
    const dehnen = event.shiftKey ? !imDehnen : imDehnen;
    const name = dehnen ? 'Dehnen bis Kante' : 'Stutzen';
    const typ = imDehnen ? EXTEND : TRIM;
    const treffer = befehlLeitungsTreffer(event);
    if (!treffer) {
      setBefehlHinweis(`${name} · Keine Leitung getroffen — direkt auf eine Leitung klicken.`);
      return true;
    }
    const grenzEdgeId = mode?.payload?.grenzEdgeId;
    if (!grenzEdgeId) {
      setSelectedEdgeId(treffer.edge.id);
      setSelectedEdgeSegment({ edgeId:treffer.edge.id, segmentIndex:treffer.segmentIndex });
      setEditorMode(startCommand(typ, { persistent:true, payload:{ grenzEdgeId:treffer.edge.id } }));
      setBefehlHinweis(`${name} · Begrenzung gewählt · jetzt die Leitung anklicken, ${
        dehnen ? 'die verlängert werden soll' : 'auf das Stück, das weg soll'} · ESC beendet.`);
      return true;
    }
    const ergebnis = dehnen
      ? bisKanteDehnenAnwenden(treffer, grenzEdgeId)
      : stutzenAnwenden(treffer, grenzEdgeId);
    if (ergebnis.fehler) {
      setBefehlHinweis(`${name} · ${ergebnis.fehler}`);
      return true;
    }
    // Die Begrenzung bleibt stehen: mehrere Leitungen an derselben Kante
    // nacheinander zu bearbeiten ist der Normalfall.
    setEditorMode(startCommand(typ, { persistent:true, payload:{ grenzEdgeId } }));
    setBefehlHinweis(`${name} · erledigt · nächste Leitung anklicken · `
      + `Shift schaltet auf ${dehnen ? 'Stutzen' : 'Dehnen'} · ESC beendet.`);
    return true;
  }, [befehlLeitungsTreffer, bisKanteDehnenAnwenden, stutzenAnwenden]);

  // ── Verbinden (AutoCAD JOIN) ─────────────────────────────────────────────
  // Zwei aneinanderstossende Teilstücke werden eine Leitung. Der Anker
  // dazwischen verschwindet, sobald er nichts mehr trägt.
  const verbindenAnwenden = useCallback((ersteAuswahl, zweiteAuswahl) => {
    if (!ersteAuswahl || !zweiteAuswahl) return { fehler:'Zwei Teilstücke erforderlich.' };
    if (ersteAuswahl.edgeId === zweiteAuswahl.edgeId) {
      return { fehler:'Verbinden braucht zwei verschiedene Leitungen.' };
    }
    const edgeA = edgesRef.current.find(item => item.id === ersteAuswahl.edgeId);
    const edgeB = edgesRef.current.find(item => item.id === zweiteAuswahl.edgeId);
    if (!edgeA || !edgeB) return { fehler:'Eine gewählte Leitung existiert nicht mehr.' };
    if (layerVonEdge(edgeA).id !== layerVonEdge(edgeB).id) {
      return { fehler:'Verbinden geht nur innerhalb desselben Layers.' };
    }

    const ergebnis = routenVerbinden(routePunkte(edgeA), routePunkte(edgeB));
    if (ergebnis.fehler) return ergebnis;

    const ende = (edge, seite) => (seite === 'start'
      ? { node:edge.source, handle:edge.sourceHandle, rolle:'source' }
      : { node:edge.target, handle:edge.targetHandle, rolle:'target' });
    const stossA = ende(edgeA, ergebnis.seiteA);
    const stossB = ende(edgeB, ergebnis.seiteB);
    const freiA = ende(edgeA, ergebnis.seiteA === 'start' ? 'end' : 'start');
    const freiB = ende(edgeB, ergebnis.seiteB === 'start' ? 'end' : 'start');

    // Ein Bauteil TRENNT zwei Leitungen, es verbindet sie nicht. Würde hier
    // zusammengeführt, verschwände die Pumpe zwischen den beiden Stücken.
    if (!istFreierKnoten(stossA.node) || !istFreierKnoten(stossB.node)) {
      return { fehler:'An dieser Stelle sitzt ein Bauteil — es trennt die beiden Leitungen.' };
    }
    const stossKnoten = new Set([stossA.node, stossB.node]);
    const fremd = edgesRef.current.some(item => item.id !== edgeA.id && item.id !== edgeB.id
      && (stossKnoten.has(item.source) || stossKnoten.has(item.target)));
    if (fremd) return { fehler:'An diesem Punkt hängt eine weitere Leitung — er trägt eine Abzweigung.' };

    const start = ergebnis.beginntBei === 'a' ? freiA : freiB;
    const schluss = ergebnis.beginntBei === 'a' ? freiB : freiA;
    if (stossKnoten.has(start.node) || stossKnoten.has(schluss.node)) {
      return { fehler:'Die beiden Leitungen bilden einen Ring.' };
    }
    // Wechselt ein Ende die Rolle (aus einem Ziel wird eine Quelle), geht das
    // nur an einem freien Anker — der trägt beide Anschlüsse. An einem Bauteil
    // müsste dafür der Port gewechselt werden, und das wäre geraten.
    const alsQuelle = (punkt) => (punkt.rolle === 'source'
      ? { node:punkt.node, handle:punkt.handle }
      : (istFreierKnoten(punkt.node) ? { node:punkt.node, handle:'center-source' } : null));
    const alsZiel = (punkt) => (punkt.rolle === 'target'
      ? { node:punkt.node, handle:punkt.handle }
      : (istFreierKnoten(punkt.node) ? { node:punkt.node, handle:'center-target' } : null));
    const quelle = alsQuelle(start);
    const ziel = alsZiel(schluss);
    if (!quelle || !ziel) {
      return { fehler:'Die Leitungen laufen gegeneinander; dafür müsste ein Bauteilanschluss die Seite wechseln.' };
    }
    if (quelle.node === ziel.node) return { fehler:'Die verbundene Leitung würde auf sich selbst zeigen.' };

    const points = routeBereinigen(ergebnis.route.slice(1, -1), {
      start:ergebnis.route[0], end:ergebnis.route.at(-1),
    });
    snap();
    setEdges(items => items.flatMap(item => {
      if (item.id === edgeB.id) return [];
      if (item.id === edgeA.id) {
        return [{
          ...item,
          source:quelle.node, sourceHandle:quelle.handle,
          target:ziel.node, targetHandle:ziel.handle,
          selected:false,
          data:{ ...geometrieDaten(item), points },
        }];
      }
      if (item.data?.paired_edge_id !== edgeA.id && item.data?.paired_edge_id !== edgeB.id) return [item];
      const data = { ...(item.data || {}) };
      delete data.paired_edge_id;
      delete data.auto_paired;
      delete data.auto_pair_open;
      return [{ ...item, data }];
    }));
    // Der Anker zwischen den Teilstücken trägt jetzt nichts mehr.
    setNodes(items => items.filter(node => !stossKnoten.has(node.id)));
    setSelectedEdgeId(null);
    setSelectedEdgeSegment(null);
    setSelectedSegments([]);
    return { ok:true };
  }, [geometrieDaten, istFreierKnoten, routePunkte, setEdges, setNodes, snap]);

  const verbindenStarten = useCallback(() => {
    setLuecke(null);
    if (istBefehl(editorModeRef.current, JOIN)) {
      setEditorMode(escapeMode(editorModeRef.current));
      setBefehlHinweis(null);
      return;
    }
    const auswahl = selectedSegments.filter((item, index, alle) =>
      alle.findIndex(kandidat => kandidat.edgeId === item.edgeId) === index);
    if (auswahl.length === 2) {
      const ergebnis = verbindenAnwenden(auswahl[0], auswahl[1]);
      setEditorMode(startCommand(JOIN, { persistent:true, payload:null }));
      setBefehlHinweis(ergebnis.fehler
        ? `Verbinden · ${ergebnis.fehler} Erste Leitung erneut wählen.`
        : 'Verbinden · erledigt · nächste erste Leitung anklicken · ESC beendet.');
      return;
    }
    const erste = auswahl[0] || null;
    setEditorMode(startCommand(JOIN, { persistent:true, payload:erste ? { erste } : null }));
    setBefehlHinweis(erste
      ? 'Verbinden · Erste Leitung gewählt · zweite Leitung anklicken · ESC beendet.'
      : 'Verbinden · Erste Leitung anklicken · danach die zweite · ESC beendet.');
  }, [selectedSegments, verbindenAnwenden]);

  const verbindenKlick = useCallback((event) => {
    if (!istBefehl(editorModeRef.current, JOIN)) return false;
    if (event.button != null && event.button !== 0) return true;
    event.preventDefault();
    event.stopPropagation();
    const treffer = befehlLeitungsTreffer(event);
    if (!treffer) {
      setBefehlHinweis('Verbinden · Keine Leitung getroffen — direkt auf eine Leitung klicken.');
      return true;
    }
    const auswahl = { edgeId:treffer.edge.id, segmentIndex:treffer.segmentIndex };
    const erste = editorModeRef.current?.payload?.erste;
    if (!erste) {
      setSelectedEdgeId(treffer.edge.id);
      setSelectedEdgeSegment(auswahl);
      setSelectedSegments([auswahl]);
      setEditorMode(startCommand(JOIN, { persistent:true, payload:{ erste:auswahl } }));
      setBefehlHinweis('Verbinden · Erste Leitung gewählt · zweite Leitung anklicken · ESC beendet.');
      return true;
    }
    const ergebnis = verbindenAnwenden(erste, auswahl);
    setEditorMode(startCommand(JOIN, {
      persistent:true, payload:ergebnis.fehler ? { erste } : null,
    }));
    setBefehlHinweis(ergebnis.fehler
      ? `Verbinden · ${ergebnis.fehler} Zweite Leitung erneut wählen.`
      : 'Verbinden · erledigt · nächste erste Leitung anklicken · ESC beendet.');
    return true;
  }, [befehlLeitungsTreffer, verbindenAnwenden]);

  // Gemessene Bauteilgrösse. Gespiegelt und gedreht wird um die MITTE, React
  // Flow speichert aber die linke obere Ecke — ohne die Grösse würde ein
  // Bauteil beim Spiegeln um seine halbe Breite davonwandern.
  const nodeGroesse = useCallback((id) => {
    const internal = getInternalNode(id);
    return {
      width:internal?.measured?.width || 0,
      height:internal?.measured?.height || 0,
    };
  }, [getInternalNode]);

  /**
   * Die aktuelle Auswahl als unabhängiger Schnappschuss.
   *
   * Das ist die EINE Stelle, an der «was ist gewählt?» beantwortet wird —
   * Zwischenablage, Kopieren, Spiegeln und Reihe holen sich alle hier ihre
   * Auswahl. Enthalten sind Bauteile, ganze Leitungen und einzeln gewählte
   * Teilstücke; `sourceRef`/`targetRef` merken sich, welche Leitungsenden an
   * einem MITKOPIERTEN Bauteil hängen. Alles andere endet später an einem
   * eigenen freien Anker — daher kann keine Kopie am Original hängen bleiben.
   *
   * `ganzeLeitungen` hebt eine Teilstückauswahl auf die ganze Leitung an — die
   * Shift-Regel des Verschieben-Befehls, damit alle Modify-Befehle gleich
   * bedient werden. Spiegeln und Drehen setzen sie immer.
   */
  const auswahlSnapshot = useCallback(({ ganzeLeitungen = false } = {}) => {
    const knoten = nodesRef.current.filter(node => node.selected && node.type !== 'junction');
    if (!knoten.length && selected) {
      const einzeln = nodesRef.current.find(node => node.id === selected.id);
      if (einzeln && einzeln.type !== 'junction') knoten.push(einzeln);
    }
    const knotenIds = new Set(knoten.map(node => node.id));
    const gewaehlteTeile = selectedSegments.length ? selectedSegments
      : selectedEdgeSegment ? [selectedEdgeSegment] : [];
    const ganzeIds = new Set([
      ...markierteEdgeIds,
      ...edgesRef.current.filter(edge => edge.selected).map(edge => edge.id),
      ...(ganzeLeitungen ? gewaehlteTeile.map(item => item.edgeId) : []),
      // Ohne Teilstückauswahl zählt die angeklickte Leitung als Ganzes.
      ...((ganzeLeitungen || !gewaehlteTeile.length) && selectedEdgeId ? [selectedEdgeId] : []),
    ]);
    const teile = ganzeLeitungen ? [] : gewaehlteTeile;
    const routen = [];
    edgesRef.current.forEach(edge => {
      const route = routePunkte(edge);
      if (ganzeIds.has(edge.id)) {
        routen.push({ edge, route, whole:true,
          sourceRef:knotenIds.has(edge.source) ? edge.source : null,
          targetRef:knotenIds.has(edge.target) ? edge.target : null });
        return;
      }
      teile.filter(item => item.edgeId === edge.id).forEach(item => {
        const a = route[item.segmentIndex], b = route[item.segmentIndex + 1];
        if (!a || !b) return;
        routen.push({ edge, route:[a, b], whole:false,
          sourceRef:item.segmentIndex === 0 && knotenIds.has(edge.source) ? edge.source : null,
          targetRef:item.segmentIndex === route.length - 2 && knotenIds.has(edge.target) ? edge.target : null });
      });
    });
    if (!knoten.length && !routen.length) return null;
    return {
      kind:'selection',
      nodes:knoten.map(node => ({ ...kopierbarerKnoten(node), groesse:nodeGroesse(node.id) })),
      routes:routen.map(item => ({ ...item, edge:JSON.parse(JSON.stringify(item.edge)),
        route:item.route.map(point => ({ x:point.x, y:point.y })) })),
    };
  }, [markierteEdgeIds, nodeGroesse, routePunkte, selected, selectedEdgeId, selectedEdgeSegment, selectedSegments]);

  /**
   * Einen Schnappschuss als unabhängige Kopien einsetzen — eine Kopie je
   * Abbildung. Die Reihe gibt mehrere Abbildungen mit, alle anderen genau eine.
   *
   * Unabhängig heisst hier drei Dinge, und alle drei entstehen genau hier:
   *   • jede Kopie bekommt neue IDs für Bauteile, Leitungen UND Anker;
   *   • jedes Leitungsende, das nicht an einem mitkopierten Bauteil hängt,
   *     endet an einem EIGENEN freien Anker — nie am Anschluss des Originals;
   *   • Paarungs- und Berechnungsverweise des Originals fallen weg.
   * Damit kann keine Geisterverbindung entstehen (Prüfmuster `e2e/copy.mjs`).
   *
   * Alles landet in EINEM Zustandswechsel — die ganze Aktion ist ein Undo-Schritt.
   */
  const snapshotKopieren = useCallback((src, abbildungen) => {
    if (!src || !abbildungen?.length) return null;
    // Der Bauplan ist rein und getestet (`cadTransform.kopierPlan`); hier
    // entstehen daraus nur die React-Flow-Objekte.
    const plan = kopierPlan(src, abbildungen, {
      neueId:newId,
      ersteNummer:naechsteNr(nodesRef.current),
      nummeriert:node => NUMMERIERT.includes(node.type),
      drehbar:node => ROTATABLE.has(node.type),
    });
    if (!plan.nodes.length && !plan.edges.length) return null;
    snap();
    const quellNode = new Map(src.nodes.map(node => [node.id, node]));
    const quellEdge = new Map(src.routes.map(item => [item.edge.id, item]));
    const neueNodes = plan.nodes.map(eintrag => {
      const quelle = quellNode.get(eintrag.quelle);
      const neu = eingefuegterKnoten(quelle, eintrag.id, { nummer:eintrag.nr, versatz:0 });
      delete neu.groesse;
      // Nur drehbare Bauteile tragen eine Lage. Ein Textblock bekommt keine
      // Spiegelung eingetragen — er soll auch im Spiegelbild lesbar bleiben.
      return ROTATABLE.has(quelle.type)
        ? { ...neu, position:eintrag.position,
            data:{ ...neu.data, rotation:eintrag.rotation, mirrored:eintrag.mirrored } }
        : { ...neu, position:eintrag.position };
    });
    const neueEdges = [];
    const ankerNodes = [];
    const layerFuer = new Map();
    plan.edges.forEach(eintrag => {
      const quelle = quellEdge.get(eintrag.quelle);
      if (!quelle) return;
      const layer = layerVonEdge(quelle.edge);
      if (eintrag.eigenerSource) layerFuer.set(eintrag.source, layer);
      if (eintrag.eigenerTarget) layerFuer.set(eintrag.target, layer);
      const data = { ...(quelle.edge.data || {}) };
      ['_routePoints','_routeStart','_routeEnd','paired_edge_id','auto_paired','auto_pair_open'].forEach(key => delete data[key]);
      // Eine manuell eingetragene Länge gehört zur ganzen Ursprungsleitung;
      // bei einer Segmentkopie wäre sie fachlich falsch.
      if (!eintrag.whole) delete data.laenge_m;
      const edge = createHydraulicEdge({
        id:eintrag.id, source:eintrag.source,
        sourceHandle:eintrag.eigenerSource ? 'center-source' : quelle.edge.sourceHandle,
        target:eintrag.target,
        targetHandle:eintrag.eigenerTarget ? 'center-target' : quelle.edge.targetHandle,
        layerId:layer.id, layerColor:layer.color, points:eintrag.route.slice(1, -1),
        cornerRadius:drawingConfig.corner_radius,
      }, [...edgesRef.current, ...neueEdges]);
      if (edge) neueEdges.push({ ...edge, selected:true,
        data:{ ...(edge.data || {}), ...data, points:eintrag.route.slice(1, -1) } });
    });
    plan.anker.forEach(eintrag => {
      const layer = layerFuer.get(eintrag.id);
      if (layer) ankerNodes.push(cadAnker(eintrag.id, eintrag.punkt, layer));
    });
    setNodes([...nodesRef.current.map(node => ({ ...node, selected:false })), ...neueNodes, ...ankerNodes]);
    setEdges([...edgesRef.current.map(edge => ({ ...edge, selected:false })), ...neueEdges]);
    setSelected(neueNodes.at(-1) || null);
    setSelectedEdgeId(neueEdges.at(-1)?.id || null);
    setSelectedSegments([]);
    setMarkierteEdgeIds([]);
    return { nodes:neueNodes, edges:neueEdges, anker:ankerNodes };
  }, [cadAnker, drawingConfig.corner_radius, setEdges, setNodes, snap]);

  /**
   * Die Auswahl AN ORT abbilden — für Drehen und für «Spiegeln, Original
   * ersetzen». Anders als beim Kopieren behalten Bauteile und Leitungen ihre
   * IDs; nur so bleiben ihre hydraulischen Anschlüsse und ihre Nummern
   * erhalten. Ein Anschluss an ein NICHT gewähltes Bauteil bleibt stehen und
   * bekommt einen Stützpunkt an der abgebildeten Stelle — dieselbe Regel wie
   * beim Verschieben.
   */
  const auswahlAbbilden = useCallback((abbildung, snapshot = null) => {
    // Beim Befehlsstart eingefrorene Auswahl bevorzugen — sonst könnte sich die
    // Auswahl zwischen Basispunkt und Abschluss unbemerkt verändert haben.
    const src = snapshot || auswahlSnapshot({ ganzeLeitungen:true });
    if (!src) return false;
    const bewegteNodes = new Set(src.nodes.map(node => node.id));
    // Gespiegelt und gedreht wird immer die GANZE Leitung: ein einzelnes
    // Teilstück an Ort zu kippen würde die Route zerreissen statt sie zu
    // verändern.
    const edgeIds = new Set(src.routes.map(item => item.edge.id));
    if (!bewegteNodes.size && !edgeIds.size) return false;
    // Ein Ende folgt der Abbildung, wenn es ohnehin mitwandert: weil sein
    // Bauteil gewählt ist, oder weil an seinem freien Anker ausschliesslich
    // gewählte Leitungen hängen.
    const folgt = (nodeId) => {
      if (bewegteNodes.has(nodeId)) return true;
      const node = nodesRef.current.find(item => item.id === nodeId);
      if (node?.type !== 'junction') return false;
      return edgesRef.current
        .filter(edge => edge.source === nodeId || edge.target === nodeId)
        .every(edge => edgeIds.has(edge.id));
    };
    const neuePunkte = new Map();
    const neueAnker = new Map();
    edgesRef.current.filter(edge => edgeIds.has(edge.id)).forEach(edge => {
      const startFolgt = folgt(edge.source);
      const endFolgt = folgt(edge.target);
      const ergebnis = routeAbgebildet(routePunkte(edge), abbildung, {
        startFrei:startFolgt, endFrei:endFolgt,
      });
      if (!ergebnis) return;
      neuePunkte.set(edge.id, ergebnis.points);
      // Nur freie Anker tragen ihre Position selbst; ein Bauteilanschluss folgt
      // schon dadurch, dass sich das Bauteil bewegt.
      const anker = (nodeId, punkt) => {
        if (!punkt) return;
        if (nodesRef.current.find(item => item.id === nodeId)?.type === 'junction') {
          neueAnker.set(nodeId, punkt);
        }
      };
      anker(edge.source, ergebnis.start);
      anker(edge.target, ergebnis.end);
    });
    if (!neuePunkte.size && !bewegteNodes.size) return false;
    const lagen = new Map(src.nodes.map(node => [node.id, {
      drehbar:ROTATABLE.has(node.type),
      position:bauteilPosition(node.position, node.groesse, abbildung),
      ...bauteilLage(node.data, abbildung, { drehbar:ROTATABLE.has(node.type) }),
    }]));
    snap();
    setNodes(items => items.map(node => {
      if (lagen.has(node.id)) {
        const { position, rotation, mirrored, drehbar } = lagen.get(node.id);
        // Text-, Beschriftungs- und Flächenblöcke wandern nur an ihren neuen
        // Platz. Sie bekommen keine Drehung und keine Spiegelung eingetragen —
        // sonst stünden sie seitenverkehrt und wären nicht mehr lesbar.
        return drehbar
          ? { ...node, position, data:{ ...(node.data || {}), rotation, mirrored } }
          : { ...node, position };
      }
      return neueAnker.has(node.id) ? { ...node, position:neueAnker.get(node.id) } : node;
    }));
    setEdges(items => items.map(edge => (neuePunkte.has(edge.id)
      ? { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:neuePunkte.get(edge.id) } }
      : edge)));
    // Anschlüsse eines gedrehten oder gespiegelten Bauteils neu zuordnen und
    // die Handle-Bounds nachmessen — dieselbe Nachbehandlung wie bei der
    // 90°-Schnelldrehung.
    src.nodes.filter(node => ROTATABLE.has(node.type)).forEach(node => {
      const lage = lagen.get(node.id);
      leitungenNeuZuordnen(node.id, lage.rotation, lage.mirrored);
    });
    const messen = [...lagen.keys()];
    requestAnimationFrame(() => requestAnimationFrame(() => messen.forEach(id => updateNodeInternals(id))));
    return true;
  }, [auswahlSnapshot, leitungenNeuZuordnen, routePunkte, setEdges, setNodes, snap, updateNodeInternals]);

  const auswahlKopieren = useCallback(() => {
    const src = auswahlSnapshot();
    if (!src) return false;
    clipboard.current = src;
    return true;
  }, [auswahlSnapshot]);

  const auswahlEinfuegen = useCallback(() => {
    const src = clipboard.current;
    if (!src) return false;
    // Alte Einzelknoten-Snapshots bleiben abwärtskompatibel.
    if (src.kind !== 'selection') {
      snap();
      const nummer = NUMMERIERT.includes(src.type) ? naechsteNr(nodesRef.current) : null;
      const neu = eingefuegterKnoten(src, newId(), { nummer });
      setNodes(items => [...items.map(node => ({ ...node, selected:false })), neu]);
      clipboard.current = kopierbarerKnoten(neu);
      setSelected(neu);
      setSelectedEdgeId(null);
      return true;
    }
    const versatz = { x:24, y:24 };
    if (!snapshotKopieren(src, [verschiebungsAbbildung(versatz)])) return false;
    // Nächstes Einfügen setzt dieselbe Auswahl nochmals um 24 Einheiten weiter.
    clipboard.current = {
      ...src,
      nodes:src.nodes.map(node => ({ ...node, position:{ x:(node.position?.x || 0) + versatz.x, y:(node.position?.y || 0) + versatz.y } })),
      routes:src.routes.map(item => ({ ...item, route:item.route.map(point => ({ x:point.x + versatz.x, y:point.y + versatz.y })) })),
    };
    return true;
  }, [setNodes, snap, snapshotKopieren]);

  // ── Kopieren, Spiegeln, Drehen, Reihe (§74) ──────────────────────────────
  //
  // Vier Befehle, ein Ablauf: Auswahl → Basispunkt → Zielpunkt. Der Basispunkt
  // ist dabei kein Detail, sondern der Kern — man kopiert «von dieser Ecke auf
  // jene Ecke» und trifft damit genau, ohne zu zielen. Darum fängt hier jeder
  // der beiden Punkte auf Objekte, nicht nur aufs Raster.

  /**
   * Objektfang für einen frei gesetzten Punkt eines Modify-Befehls.
   *
   * Anders als beim Zeichnen gibt es weder Layer noch Vorgängerpunkt: gefangen
   * wird, was am nächsten liegt — Bauteilanschluss, Leitungsende, Eckpunkt oder
   * Mittelpunkt, sonst das Raster. Punkt UND Marker kommen aus `fangErgebnis`,
   * also aus einer Quelle: der gesetzte Punkt ist immer der angezeigte Punkt.
   */
  const befehlsFang = useCallback((raw, { basis = null, shift = false } = {}) => {
    const zoom = Math.max(getZoom(), 0.2);
    const kandidaten = [];
    if (snapAnRef.current) {
      const radius = 24 / zoom;
      objektFangpunkte.forEach(punkt => {
        const distanz = Math.hypot(raw.x - punkt.x, raw.y - punkt.y);
        if (distanz > radius) return;
        kandidaten.push({ typ:punkt.kind === 'handle' ? PORT : ENDPOINT, x:punkt.x, y:punkt.y, distanz });
      });
      const ecke = naechsterEckpunkt(raw, 14 / zoom);
      if (ecke) kandidaten.push({ typ:CORNER, x:ecke.x, y:ecke.y, distanz:ecke.distanz });
      const mitte = naechsterMittelpunkt(raw, 16 / zoom);
      if (mitte) kandidaten.push({ typ:MIDPOINT, x:mitte.x, y:mitte.y, distanz:mitte.distanz });
    }
    // Ohne Objekttreffer gilt beim zweiten Punkt dieselbe Richtungsregel wie
    // beim Zeichnen: achsnah orthogonal, Shift kehrt sie um.
    const fallback = basis
      ? constrainPoint(basis, raw, { ortho:orthoAnRef.current, shift, grid:drawingConfig.grid_size })
      : rasterPunkt(raw, drawingConfig.grid_size);
    // Der Rastermarker bleibt aus: er würde bei jeder Mausbewegung mitlaufen und
    // vom eigentlichen Hinweis ablenken — «hier fängt etwas Bestimmtes».
    return fangErgebnis(kandidaten, fallback, { zeigeRaster:false })
      || { point:fallback, typ:GRID, marker:null };
  }, [drawingConfig.grid_size, getZoom, naechsterEckpunkt, naechsterMittelpunkt, objektFangpunkte]);

  const transformBeenden = useCallback(() => {
    setTransformBefehl(null);
    setBefehlHinweis(null);
    setEditorMode(escapeMode(editorModeRef.current));
  }, []);

  /**
   * Einen der vier Befehle starten. Die Auswahl wird dabei EINGEFROREN — ein
   * Klick auf die Zeichenfläche darf sie nicht mehr abwählen, sonst liefe der
   * Befehl ins Leere.
   */
  const transformStarten = useCallback((art, { ganzeLeitungen = false } = {}) => {
    // Spiegeln und Drehen wirken auf ganze Leitungen: ein einzelnes Teilstück
    // an Ort zu kippen würde die Route zerreissen statt sie zu verändern.
    const ganz = ganzeLeitungen || art === 'spiegeln' || art === 'drehen';
    const snapshot = auswahlSnapshot({ ganzeLeitungen:ganz });
    if (!snapshot) {
      setBefehlHinweis('Zuerst Bauteile oder Leitungen auswählen.');
      return false;
    }
    const anzahlTeile = snapshot.nodes.length + snapshot.routes.length;
    setEndpointMenu(null);
    setEdgeMenu(null);
    setLeitungsGuides([]);
    setBefehlHinweis(null);
    setVerschiebung(null);
    setTransformBefehl({
      art, snapshot, ganzeLeitungen:ganz,
      beschreibung:`${anzahlTeile} ${anzahlTeile === 1 ? 'Element' : 'Elemente'}`,
      basis:null, cursor:null, achse:null, abstand:null, puffer:null, marker:null,
    });
    setEditorMode(startCommand(TRANSFORM_MODUS[art], { persistent:art === 'kopieren' }));
    return true;
  }, [auswahlSnapshot]);

  /** Reihe anwenden: Anzahl inklusive Original, Abstand aus Basis → Ziel. */
  const reiheAnwenden = useCallback((befehl, anzahl) => {
    const abbildungen = reihenAbbildungen(anzahl, befehl.abstand);
    if (!abbildungen.length) {
      setBefehlHinweis('Reihe · Anzahl ab 2 und ein Abstand ungleich null nötig.');
      return;
    }
    snapshotKopieren(befehl.snapshot, abbildungen);
    transformBeenden();
  }, [snapshotKopieren, transformBeenden]);

  /** Drehen anwenden: die Auswahl dreht an Ort um den Basispunkt. */
  const drehenAnwenden = useCallback((befehl, winkel) => {
    if (!Number.isFinite(winkel) || !(winkel % 360)) {
      setBefehlHinweis('Drehen · Ein Winkel von 0° verändert nichts.');
      return;
    }
    auswahlAbbilden(drehung(befehl.basis, winkel), befehl.snapshot);
    transformBeenden();
  }, [auswahlAbbilden, transformBeenden]);

  /** Spiegeln anwenden — mit oder ohne das Original. */
  const spiegelnAnwenden = useCallback((befehl, originalBehalten) => {
    const abbildung = spiegelung(befehl.basis, befehl.achse);
    if (originalBehalten) snapshotKopieren(befehl.snapshot, [abbildung]);
    else auswahlAbbilden(abbildung, befehl.snapshot);
    transformBeenden();
  }, [auswahlAbbilden, snapshotKopieren, transformBeenden]);

  /**
   * Ein Klick auf die Zeichenfläche während eines der vier Befehle.
   * Rückgabe `true` heisst: der Klick gehörte dem Befehl und ist erledigt.
   */
  const transformKlick = useCallback((event) => {
    const befehl = transformBefehlRef.current;
    if (!befehl) return false;
    if (event.button != null && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    // Ein Mausdruck erzeugt mehrere Ereignisse (pointerdown, pointerup, click).
    // Den Punkt setzt ausschliesslich der Capture-Lauf auf `pointerdown`; alle
    // späteren gehören demselben Druck und werden nur noch verschluckt, damit
    // sie weder einen zweiten Punkt setzen noch die Auswahl ändern.
    if (event.type !== 'pointerdown') return true;
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const { point } = befehlsFang(raw, { basis:befehl.basis, shift:event.shiftKey });
    if (!befehl.basis) {
      setTransformBefehl({ ...befehl, basis:point, cursor:point });
      return true;
    }
    if (befehl.art === 'kopieren') {
      // Mehrfachkopie: der Basispunkt bleibt stehen, jeder weitere Klick legt
      // eine weitere Kopie ab. Beendet wird mit ESC oder Rechtsklick.
      snapshotKopieren(befehl.snapshot, [verschiebungsAbbildung({
        x:point.x - befehl.basis.x, y:point.y - befehl.basis.y,
      })]);
      return true;
    }
    if (befehl.art === 'reihe') {
      setTransformBefehl({ ...befehl, abstand:{ x:point.x - befehl.basis.x, y:point.y - befehl.basis.y },
        cursor:point, puffer:'3' });
      return true;
    }
    if (befehl.art === 'drehen') {
      drehenAnwenden(befehl, winkelZwischen(befehl.basis, point));
      return true;
    }
    if (befehl.art === 'spiegeln' && !befehl.achse) {
      // Zweiter Achspunkt. Auf demselben Punkt gibt es keine Achse.
      if (Math.hypot(point.x - befehl.basis.x, point.y - befehl.basis.y) <= 2) return true;
      setTransformBefehl({ ...befehl, achse:point, cursor:point });
      return true;
    }
    return true;
  }, [befehlsFang, drehenAnwenden, screenToFlowPosition, snapshotKopieren]);
  transformKlickRef.current = transformKlick;

  // ── Neu nummerieren (§83) ────────────────────────────────────────────────
  //
  // Die Nummer ist sonst die Reihenfolge, in der jemand die Bauteile gesetzt
  // hat. Dieser Befehl vergibt sie in Leserichtung neu — und NUR dieser
  // Befehl. Eine laufende Automatik würde die Nummern eines freigegebenen
  // Standes still verändern; ein exportiertes PDF trüge dann andere Nummern
  // als dasselbe Schema beim nächsten Öffnen (Projektregel 8).

  // ── Beschriftungsblöcke (§58) ────────────────────────────────────────────
  //
  // Der Block trägt eine EIGENE Lage im Schema (`caption_pos`) statt eines
  // Versatzes zum Bauteil. Nur so bleibt er liegen, wenn das Bauteil wandert,
  // und nur so hält eine ausgerichtete Flucht mehrerer Blöcke.

  /**
   * Bauteile mit Rechteck — sie spannen den Rahmen der Blockreihe auf.
   *
   * Gemessen wird am gezeichneten Element, nicht am React-Flow-Store: dessen
   * `measured` war beim Platzieren nachweislich leer, und die gedachte Linie
   * lag dann auf Höhe der Bauteiloberkanten statt darunter. Der DOM zeigt, was
   * der Planer sieht — inklusive Drehung und von Hand gezogener Grösse.
   */
  const blockBauteile = useCallback(() => {
    const flaeche = document.querySelector('.react-flow');
    const viewport = document.querySelector('.react-flow__viewport');
    if (!flaeche || !viewport) return [];
    const m = new DOMMatrix(getComputedStyle(viewport).transform);
    const rahmen = flaeche.getBoundingClientRect();
    const zoom = m.a || 1;
    return Array.from(document.querySelectorAll('.react-flow__node'))
      .filter(element => !element.className.includes('react-flow__node-junction')
        && !element.className.includes('react-flow__node-label'))
      .map(element => {
        const r = element.getBoundingClientRect();
        return {
          x:(r.left - rahmen.left - m.e) / zoom,
          y:(r.top - rahmen.top - m.f) / zoom,
          breite:r.width / zoom,
          hoehe:r.height / zoom,
        };
      });
  }, []);

  /** Die schon belegten Blocklagen. */
  const blockLagen = useCallback((liste) => liste
    .map(node => node.data?.caption_pos)
    .filter(Boolean), []);

  /**
   * Altbestand einmalig auf die eigene Lage überführen.
   *
   * Die Umrechnung braucht die Bauteilgrösse, und die kennt erst React Flow
   * nach dem Zeichnen — deshalb hängt das hier an `nodeGeometryVersion` und
   * nicht an `graphMigration`, das schon vor der Messung läuft. Die Regel
   * selbst ist rein und getestet (`schema/datenblock.js`).
   *
   * Bewusst OHNE `snap()`: das ist keine Bearbeitung des Planers, sondern eine
   * Formatumstellung. Sie darf seinen Undo-Verlauf nicht belegen.
   */
  useEffect(() => {
    if (!loaded) return;
    const offen = nodesRef.current.filter(brauchtMigration);
    if (!offen.length) return;
    // Ohne Messung keine Umrechnung — lieber später als an falscher Stelle.
    const messbar = offen.filter(node => (nodeGroesse(node.id).height || 0) > 0);
    if (!messbar.length) return;
    const neueDaten = new Map(messbar.map(node => [node.id, migrierteDaten(node, nodeGroesse(node.id))]));
    setNodes(items => items.map(node => (neueDaten.has(node.id)
      ? { ...node, data:neueDaten.get(node.id) }
      : node)));
  }, [loaded, nodeGeometryVersion, nodeGroesse, setNodes]);

  /**
   * Alle Blöcke gemeinsam ein- oder ausblenden.
   *
   * Der Schalter schreibt `caption_hidden` an jedes Bauteil, statt eine eigene
   * globale Einstellung einzuführen. Grund: der PDF-Export liest die
   * Zeichenkonfiguration gar nicht — eine globale Einstellung käme dort nie an,
   * und Editor und Export zeigten Verschiedenes.
   */
  const alleBloeckeSetzen = useCallback((versteckt) => {
    const betroffen = nodesRef.current.filter(node => node.data?.nr != null);
    if (!betroffen.length) return false;
    snap();
    const ids = new Set(betroffen.map(node => node.id));
    setNodes(items => items.map(node => (ids.has(node.id)
      ? { ...node, data:{ ...(node.data || {}), caption_hidden:versteckt } }
      : node)));
    return true;
  }, [setNodes, snap]);

  /** Sind gerade alle Blöcke ausgeblendet? */
  const alleBloeckeVersteckt = nodes.length > 0
    && nodes.filter(node => node.data?.nr != null).every(node => !blockSichtbar(node.data));

  /**
   * Nummerierbare Bauteile mit ihrer Lage und Höhe.
   *
   * Die Höhe kommt zuerst aus dem Node selbst (`measured`, das React Flow dort
   * hinterlegt) und erst danach aus dem internen Store. Der Store war im
   * Browsertest direkt nach dem Laden noch leer; die Bandtoleranz wurde dadurch
   * 0 und eine sichtbar gerade Zeile zerfiel. Fehlt beides, springt im reinen
   * Modul `ERSATZ_HOEHE` ein.
   */
  const nummerierbareBauteile = useCallback(() => nodesRef.current
    .filter(node => NUMMERIERT.includes(node.type))
    .map(node => ({
      id:node.id,
      x:node.position?.x || 0,
      y:node.position?.y || 0,
      hoehe:node.measured?.height || node.height || nodeGroesse(node.id).height || 0,
      nr:node.data?.nr,
    })), [nodeGroesse]);

  const neuNummerierenAnwenden = useCallback(() => {
    const nummern = neueNummern(nummerierbareBauteile());
    if (!nummern.length) return false;
    const zuweisung = new Map(nummern.map(eintrag => [eintrag.id, eintrag.nr]));
    snap();
    setNodes(items => items.map(node => (zuweisung.has(node.id)
      ? { ...node, data:{ ...(node.data || {}), nr:zuweisung.get(node.id) } }
      : node)));
    return true;
  }, [nummerierbareBauteile, setNodes, snap]);

  /**
   * Nachfragen, bevor Nummern wandern.
   *
   * Die Zahl im Hinweis ist bewusst die der ÄNDERUNGEN, nicht die der
   * Bauteile: Sie beantwortet die Frage, die der Planer wirklich hat — bringt
   * mir das etwas, oder stimmt schon alles?
   */
  const neuNummerierenFragen = useCallback(() => {
    const nummern = neueNummern(nummerierbareBauteile());
    if (!nummern.length) {
      setBefehlHinweis('Neu nummerieren · Es gibt keine nummerierten Bauteile.');
      return;
    }
    setNeuNummerieren({ gesamt:nummern.length, aenderungen:anzahlAenderungen(nummern) });
  }, [nummerierbareBauteile]);

  const auswahlLoeschen = useCallback(() => {
    const knotenIds = new Set(nodesRef.current.filter(node => node.selected).map(node => node.id));
    if (selected) knotenIds.add(selected.id);
    const roheGanzeIds = [
      ...markierteEdgeIds,
      ...edgesRef.current.filter(edge => edge.selected).map(edge => edge.id),
    ];
    const teile = selectedSegments.length ? selectedSegments
      : selectedEdgeSegment ? [selectedEdgeSegment] : [];
    const normalisiert = loeschAuswahl(roheGanzeIds, teile);
    const ganzeIds = new Set(normalisiert.ganzeEdgeIds);
    if (!knotenIds.size && !ganzeIds.size && !normalisiert.segmente.length) return false;
    snap();
    let nextEdges = edgesRef.current.filter(edge => !ganzeIds.has(edge.id)
      && !knotenIds.has(edge.source) && !knotenIds.has(edge.target));
    let nextNodes = nodesRef.current.filter(node => !knotenIds.has(node.id));
    const gruppiert = new Map();
    normalisiert.segmente.forEach(item => {
      if (!gruppiert.has(item.edgeId)) gruppiert.set(item.edgeId, []);
      gruppiert.get(item.edgeId).push(item.segmentIndex);
    });
    gruppiert.forEach((indexes, edgeId) => {
      const edge = nextEdges.find(item => item.id === edgeId);
      if (!edge) return;
      const routes = routeSegmenteEntfernen(routePunkte(edge), indexes);
      const ersetzt = leitungDurchRoutenErsetzen(edge, routes, nextEdges, nextNodes);
      nextEdges = ersetzt.edges;
      nextNodes = ersetzt.nodes;
    });
    const benutzt = new Set(nextEdges.flatMap(edge => [edge.source, edge.target]));
    nextNodes = nextNodes.filter(node => node.type !== 'junction' || benutzt.has(node.id));
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelected(null); setSelectedEdgeId(null); setSelectedEdgePoint(null);
    setSelectedEdgeSegment(null); setSelectedSegments([]); setMarkierteEdgeIds([]);
    return true;
  }, [leitungDurchRoutenErsetzen, markierteEdgeIds, routePunkte, selected, selectedEdgeSegment, selectedSegments, setEdges, setNodes, snap]);

  const eckpunktTeilen = useCallback((edgeId, pointIndex) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    const route = edge ? routePunkte(edge) : [];
    const routeIndex = pointIndex + 1;
    if (!edge || routeIndex <= 0 || routeIndex >= route.length - 1) return;
    const layer = layerVonEdge(edge);
    const junctionId = newId();
    const zweiteId = newId();
    const data = { ...(edge.data || {}) };
    delete data.laenge_m; delete data.paired_edge_id;
    snap();
    const erste = {
      ...edge, target:junctionId, targetHandle:'center-target', selected:false,
      data:{ ...data, cad_polyline:true, points:route.slice(1, routeIndex) },
    };
    const zweite = createHydraulicEdge({
      id:zweiteId, source:junctionId, sourceHandle:'center-source',
      target:edge.target, targetHandle:edge.targetHandle,
      layerId:layer.id, layerColor:layer.color,
      points:route.slice(routeIndex + 1, -1), cornerRadius:drawingConfig.corner_radius,
      startPoint:route[routeIndex], endPoint:route.at(-1),
    }, edgesRef.current.filter(item => item.id !== edgeId));
    if (!zweite) return;
    setNodes(items => [...items, cadAnker(junctionId, route[routeIndex], layer)]);
    setEdges(items => [...items.filter(item => item.id !== edgeId), erste, {
      ...zweite, data:{ ...data, ...(zweite.data || {}), points:route.slice(routeIndex + 1, -1) },
    }]);
    setSelectedEdgePoint(null); setSelectedGripPoints([]);
  }, [cadAnker, drawingConfig.corner_radius, routePunkte, setEdges, setNodes, snap]);

  const segmentLaengeSetzen = useCallback((edgeId, segmentIndex) => {
    const edge = edgesRef.current.find(item => item.id === edgeId);
    const route = edge ? routePunkte(edge) : [];
    const a = route[segmentIndex];
    const b = route[segmentIndex + 1];
    if (!a || !b) return;
    const aktuell = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    const eingabe = window.prompt('Teilstücklänge in mm', String(aktuell));
    if (eingabe === null) return;
    const laenge = Number.parseFloat(String(eingabe).replace(',', '.'));
    if (!(laenge > 0)) { setBefehlHinweis('Die Länge muss grösser als 0 mm sein.'); return; }
    const norm = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ziel = { x:a.x + (b.x - a.x) / norm * laenge, y:a.y + (b.y - a.y) / norm * laenge };
    snap();
    if (segmentIndex + 1 === route.length - 1) {
      const node = nodesRef.current.find(item => item.id === edge.target);
      const grad = edgesRef.current.filter(item => item.source === edge.target || item.target === edge.target).length;
      if (node?.type === 'junction' && node.data?.cad_anchor && grad === 1) {
        setNodes(items => items.map(item => item.id === edge.target ? { ...item, position:ziel } : item));
      } else {
        setEdges(items => items.map(item => item.id === edgeId
          ? { ...item, data:{ ...(item.data || {}), points:[...route.slice(1, -1), ziel] } } : item));
      }
    } else {
      const points = route.slice(1, -1);
      points[segmentIndex] = ziel;
      setEdges(items => items.map(item => item.id === edgeId
        ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points } } : item));
    }
  }, [routePunkte, setEdges, setNodes, snap]);

  // ── Dehnen (AutoCAD STRETCH) ─────────────────────────────────────────────
  // Fenster aufziehen, Basispunkt, Zielpunkt: was im Fenster liegt, wandert;
  // der Rest bleibt stehen. Dadurch werden Leitungen länger statt versetzt.
  const dehnenAnwenden = useCallback((fenster, delta) => {
    if (!delta.x && !delta.y) return;
    // Bauteile und freie Enden im Fenster wandern mit; ihre Leitungen folgen
    // ohnehin den Anschlüssen.
    const bewegteNodes = nodesRef.current.filter(node => {
      const punkt = node.type === 'junction'
        ? node.position
        : { x:(node.position?.x || 0) + 20, y:(node.position?.y || 0) + 20 };
      return punkt && punkt.x >= fenster.x1 && punkt.x <= fenster.x2
        && punkt.y >= fenster.y1 && punkt.y <= fenster.y2;
    }).map(node => node.id);
    const bewegteIds = new Set(bewegteNodes);

    const neuePunkte = new Map();
    edgesRef.current.forEach(edge => {
      const route = routePunkte(edge);
      if (route.length < 2) return;
      // Ein Ende, dessen Node ohnehin mitwandert, muss hier nicht zusätzlich
      // gedehnt werden — sonst bewegt es sich doppelt.
      const ergebnis = routeDehnen(route, fenster, delta, {
        startFest:true, endFest:true,
      });
      if (ergebnis.bewegt > 0) neuePunkte.set(edge.id, ergebnis.route.slice(1, -1));
    });

    if (!bewegteIds.size && !neuePunkte.size) {
      setBefehlHinweis('Im Fenster liegt nichts Dehnbares.');
      return;
    }
    snap();
    if (bewegteIds.size) {
      setNodes(items => items.map(node => (bewegteIds.has(node.id)
        ? { ...node, position:{ x:(node.position?.x || 0) + delta.x, y:(node.position?.y || 0) + delta.y } }
        : node)));
    }
    if (neuePunkte.size) {
      setEdges(items => items.map(edge => (neuePunkte.has(edge.id)
        ? { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:neuePunkte.get(edge.id) } }
        : edge)));
    }
    setBefehlHinweis(null);
  }, [routePunkte, setEdges, setNodes, snap]);

  const dehnenKlick = useCallback((event) => {
    const aktuell = dehnenRef.current;
    if (!aktuell) return false;
    if (event.button != null && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const punkt = rasterPunkt(raw, drawingConfig.grid_size);
    if (!aktuell.ecke1) { setDehnen({ ...aktuell, ecke1:punkt, cursor:punkt }); return true; }
    if (!aktuell.ecke2) { setDehnen({ ...aktuell, ecke2:punkt, cursor:punkt }); return true; }
    if (!aktuell.basis) { setDehnen({ ...aktuell, basis:punkt, cursor:punkt }); return true; }
    const ziel = constrainPoint(aktuell.basis, raw, {
      ortho:orthoAnRef.current, shift:event.shiftKey, grid:drawingConfig.grid_size,
    });
    dehnenAnwenden(fensterAus(aktuell.ecke1, aktuell.ecke2), {
      x:ziel.x - aktuell.basis.x, y:ziel.y - aktuell.basis.y,
    });
    setDehnen(null);
    setEditorMode(finishCommand(editorModeRef.current));
    return true;
  }, [dehnenAnwenden, drawingConfig.grid_size, screenToFlowPosition]);

  const verschiebenKlick = useCallback((event) => {
    const aktuell = verschiebungRef.current;
    if (!aktuell) return false;
    if (event.button != null && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    if (!aktuell.basis) {
      const basis = rasterPunkt(raw, drawingConfig.grid_size);
      setVerschiebung({ ...aktuell, basis, cursor:basis });
      return true;
    }
    const ziel = constrainPoint(aktuell.basis, raw, {
      ortho:orthoAnRef.current, shift:event.shiftKey, grid:drawingConfig.grid_size,
    });
    zieleVerschieben(aktuell.ziele, { x:ziel.x - aktuell.basis.x, y:ziel.y - aktuell.basis.y });
    setVerschiebung(null);
    setEditorMode(finishCommand(editorModeRef.current));
    return true;
  }, [drawingConfig.grid_size, screenToFlowPosition, zieleVerschieben]);

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
    edgeEndpointDrag.current = {
      edgeId, side, anchorId, layerId:layer.id, role:layer.role,
      route, basis:point,
    };
    setGriffMass(null);
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
    // Rechtsklick beendet einen laufenden Modify-Befehl — auch über einer
    // Leitung, sonst gäbe es aus der Mehrfachkopie dort keinen Ausstieg.
    if (transformBefehlRef.current) { event.preventDefault(); transformBeenden(); return; }
    setEndpointMenu(null);
    setSelectedEdgeId(edgeId);
    setSelected(null);
    setEdgeMenu({
      x:event.clientX,
      y:event.clientY,
      edgeId,
      point:screenToFlowPosition({ x:event.clientX, y:event.clientY }),
    });
  }, [screenToFlowPosition, transformBeenden]);

  const griffMenuOeffnen = useCallback((event, griff, sofort = false) => {
    if (gripMenuTimer.current) clearTimeout(gripMenuTimer.current);
    const menu = { ...griff, x:event.clientX, y:event.clientY };
    if (sofort) setGripMenu(menu);
    else gripMenuTimer.current = setTimeout(() => setGripMenu(menu), 420);
  }, []);
  const griffHover = useCallback((event, griff) => griffMenuOeffnen(event, griff, false), [griffMenuOeffnen]);
  const griffVerlassen = useCallback(() => {
    if (gripMenuTimer.current) clearTimeout(gripMenuTimer.current);
  }, []);
  const griffContextMenu = useCallback((event, griff) => {
    setEndpointMenu(null); setEdgeMenu(null);
    griffMenuOeffnen(event, griff, true);
  }, [griffMenuOeffnen]);

  useEffect(() => {
    const punktFuerEvent = (event, drag) => {
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      const ergebnis = endpunktWeiterziehen(drag.route, drag.side, raw, {
        grid:drawingConfig.grid_size,
        // Der 30°-Schwellwert ist hier die ausdrückliche Freigabe. Ein
        // versehentlich gedrücktes Shift darf das Randsegment nicht verbiegen.
        shift:false,
      });
      return ergebnis ? { ...ergebnis, raw } : null;
    };
    const move = (event) => {
      const drag = edgeEndpointDrag.current;
      if (!drag) return;
      const ergebnis = punktFuerEvent(event, drag);
      if (!ergebnis) return;
      const point = ergebnis.endpoint;
      setGriffMass({
        a:ergebnis.basis, b:point,
        laenge:Math.hypot(point.x - ergebnis.basis.x, point.y - ergebnis.basis.y),
        label:segmentMassLabel(ergebnis.basis, point),
      });
      if (edgePointFrame.current) cancelAnimationFrame(edgePointFrame.current);
      edgePointFrame.current = requestAnimationFrame(() => {
        setNodes(items => items.map(node => node.id === drag.anchorId ? { ...node, position:point } : node));
        setEdges(items => items.map(edge => edge.id === drag.edgeId
          ? { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:ergebnis.points } }
          : edge));
      });
    };
    const up = (event) => {
      const drag = edgeEndpointDrag.current;
      if (!drag) return;
      edgeEndpointDrag.current = null;
      setGriffMass(null);
      const ergebnis = punktFuerEvent(event, drag);
      if (!ergebnis) return;
      let point = ergebnis.endpoint;
      let finalPoints = ergebnis.points;
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
          const data = { ...(nextEdge.data || {}), cad_polyline:true, points:finalPoints };
          if (edge.data?.auto_paired) data.auto_pair_open = otherNode?.type === 'junction' && otherDegree <= 1;
          return { ...nextEdge, data };
        }));
        setNodes(items => items.filter(node => node.id !== drag.anchorId));
        return;
      }
      const rawLineHit = naechsteLeitung(point, drag.layerId, 22 / zoom, new Set([drag.edgeId]));
      const lineHit = rawLineHit ? tStueckHit(drag.basis, ergebnis.raw, { ...rawLineHit, type:'line' }) : null;
      if (lineHit) {
        const korrigiert = endpunktWeiterziehen(drag.route, drag.side, lineHit, { grid:1, shift:false });
        if (korrigiert) {
          point = korrigiert.endpoint;
          finalPoints = korrigiert.points;
        }
        const [first, second] = leitungTeilen(lineHit, drag.anchorId, drag.layerId);
        setNodes(items => items.map(node => node.id === drag.anchorId
          ? { ...node, position:point }
          : node));
        setEdges(items => {
          const draggedEdge = items.find(edge => edge.id === drag.edgeId);
          const otherNodeId = drag.side === 'source' ? draggedEdge?.target : draggedEdge?.source;
          const otherNode = nodesRef.current.find(node => node.id === otherNodeId);
          const otherDegree = items.filter(edge => edge.source === otherNodeId || edge.target === otherNodeId).length;
          const base = items
            .filter(edge => edge.id !== lineHit.edge.id)
            .map(edge => {
              if (edge.id !== drag.edgeId) return edge;
              const data = { ...(edge.data || {}), cad_polyline:true, points:finalPoints };
              if (edge.data?.auto_paired) data.auto_pair_open = otherNode?.type === 'junction' && otherDegree <= 1;
              return { ...edge, data };
            });
          return [...base, first, second];
        });
        return;
      }
      setNodes(items => items.map(node => node.id === drag.anchorId ? { ...node, position:point } : node));
      setEdges(items => items.map(edge => edge.id === drag.edgeId
        ? { ...edge, data:{ ...(edge.data || {}), cad_polyline:true, points:finalPoints } }
        : edge));
    };
    window.addEventListener('pointermove', move, { passive:true });
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drawingConfig.grid_size, getZoom, leitungTeilen, naechsteLeitung, naechsterBauteilAnschluss, screenToFlowPosition, setEdges, setNodes]);

  const befehlsEintraege = useMemo(() => [
    { id:DRAW_PIPE, type:DRAW_PIPE, taste:drawingConfig.shortcut_line, name:'Leitung zeichnen' },
    { id:`${DRAW_PIPE}-polyline`, type:DRAW_PIPE, taste:drawingConfig.shortcut_polyline, name:'Polylinie zeichnen' },
    { id:MOVE, type:MOVE, taste:drawingConfig.shortcut_move, name:'Verschieben' },
    { id:ALIGN, type:ALIGN, taste:drawingConfig.shortcut_align, name:'Ausrichten' },
    { id:BREAK, type:BREAK, taste:drawingConfig.shortcut_break, name:'Mit Lücke trennen' },
    { id:STRETCH, type:STRETCH, taste:drawingConfig.shortcut_stretch, name:'Dehnen' },
    { id:CONNECT_CORNER, type:CONNECT_CORNER, taste:'tr', name:'Ecke verbinden' },
    { id:'rotate', taste:drawingConfig.shortcut_rotate, name:'Drehen' },
    { id:'mirror-node', taste:drawingConfig.shortcut_mirror, name:'Spiegeln' },
  ], [drawingConfig]);

  const befehlAusfuehren = useCallback((befehl) => {
    const id = befehl?.type || befehl?.id;
    if (!id) return false;
    setPaneMenu(null); setBefehlszeile(''); setBefehlszeileAktiv(false);
    if (id === DRAW_PIPE) {
      setSelected(null); setSelectedEdgeId(null);
      setEditorMode(startCommand(DRAW_PIPE));
      return true;
    }
    if (id === MOVE) { verschiebenStarten(false); return true; }
    if (id === ALIGN) { ausrichtenUmschalten(); return true; }
    if (id === BREAK) { trennenStarten(); return true; }
    if (id === STRETCH) { dehnenStarten(); return true; }
    if (id === CONNECT_CORNER) { eckeVerbindenStarten(); return true; }
    if (id === PLACE && befehl.payload?.nodeType) {
      setEditorMode(startCommand(PLACE, { payload:befehl.payload }));
      return true;
    }
    if (id === 'rotate' && selected && ROTATABLE.has(selected.type)) { rotateNode(selected.id); return true; }
    if (id === 'mirror-node' && selected && ROTATABLE.has(selected.type)) { mirrorNode(selected.id); return true; }
    setBefehlHinweis('Für diesen Befehl zuerst ein passendes Element wählen.');
    return false;
  }, [ausrichtenUmschalten, dehnenStarten, eckeVerbindenStarten, mirrorNode, rotateNode, selected, trennenStarten, verschiebenStarten]);

  wiederholeLetztenRef.current = () => {
    const mode = letztenBefehlWiederholen(letzteBefehleRef.current);
    return mode ? befehlAusfuehren({ ...mode, id:mode.type }) : false;
  };

  const spaceTapRef = useRef(0);

  // Punkt 16 — Space hält das Pan-Werkzeug, wie in vielen CAD- und
  // Grafikprogrammen. Bewusst ein eigener Effekt: der Zustand hängt an keydown
  // UND keyup, und Space darf die Seite nicht scrollen.
  useEffect(() => {
    const tippt = () => {
      const tag = document.activeElement?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || document.activeElement?.isContentEditable;
    };
    const down = (ev) => {
      if (ev.code !== 'Space' || ev.repeat || tippt()) return;
      ev.preventDefault();
      spaceTapRef.current = performance.now();
      setSpacePan(true);
    };
    const up = (ev) => {
      if (ev.code !== 'Space') return;
      setSpacePan(false);
      if (spaceTapRef.current && performance.now() - spaceTapRef.current < 180
          && istModify(editorModeRef.current)) wiederholeLetztenRef.current();
      spaceTapRef.current = 0;
    };
    // Verlässt das Fenster den Fokus, bleibt Space sonst gedrückt „hängen".
    const verlassen = () => setSpacePan(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', verlassen);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', verlassen);
    };
  }, []);

  // Keyboard-Shortcuts: Zeichenwerkzeuge sind konfigurierbar; V/R wechseln
  // weiterhin schnell den Heizungs-Layer, D dreht ein Bauteil.
  React.useEffect(() => {
    const handler = (ev) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement?.isContentEditable) return;

      // ESC gehört immer dem laufenden CAD-Befehl — auch während gerade eine
      // Zahl editiert wird. Der vollständige Entwurf verschwindet spurlos.
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        entwurfVerwerfen();
        setLaengenPuffer(null); setWinkelPuffer(null); setDynamikFeld('length');
        setVerschiebung(null); setLuecke(null); setDehnen(null); setBefehlHinweis(null);
        setPaneMenu(null); setGripMenu(null);
        if (befehlsfolgeTimer.current) clearTimeout(befehlsfolgeTimer.current);
        befehlsfolge.current = '';
        platzierVorschauRef.current = null;
        setPlatzierVorschau(null); setInlineTreffer(null); setTransformBefehl(null);
        setNeuNummerieren(null);
        setEndpointMenu(null); setEdgeMenu(null); setAusrichtenHinweis(null);
        setEditorMode(escapeMode(editorModeRef.current));
        return;
      }

      if (leitungsEntwurfRef.current && drawingConfig.dynamic_input && ev.key === 'Tab') {
        ev.preventDefault();
        setDynamikFeld(feld => {
          const next = feld === 'length' ? 'angle' : 'length';
          if (next === 'length' && laengenPufferRef.current === null) setLaengenPuffer('');
          if (next === 'angle' && winkelPufferRef.current === null) setWinkelPuffer('');
          return next;
        });
        return;
      }

      // ── Numerische Direkteingabe (Punkt 8) ──────────────────────────────
      // Läuft eine Längeneingabe, gehört die Tastatur AUSSCHLIESSLICH ihr.
      // Sonst würde eine getippte Zahl nebenbei einen Befehl auslösen.
      if ((laengenPufferRef.current !== null || winkelPufferRef.current !== null) && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault();
        const istWinkel = dynamikFeld === 'angle';
        const aktuell = istWinkel ? (winkelPufferRef.current || '') : (laengenPufferRef.current || '');
        const { buffer, action } = laengeTaste(aktuell, ev.key);
        if (action === 'abbrechen') {
          if (istWinkel) setWinkelPuffer(null); else setLaengenPuffer(null);
          return;
        }
        if (action === 'anwenden') {
          laengeAnwenden(istWinkel ? laengenPufferRef.current : buffer,
            istWinkel ? buffer : winkelPufferRef.current);
          return;
        }
        if (istWinkel) setWinkelPuffer(buffer); else setLaengenPuffer(buffer);
        return;
      }
      // Eine Ziffer während des Zeichnens ERÖFFNET die Längeneingabe.
      if (leitungsEntwurfRef.current && !ev.metaKey && !ev.ctrlKey && /^[0-9]$/.test(ev.key)) {
        ev.preventDefault();
        if (drawingConfig.dynamic_input && dynamikFeld === 'angle') setWinkelPuffer(ev.key);
        else setLaengenPuffer(ev.key);
        return;
      }

      // ── Eingaben der Modify-Befehle (§74) ───────────────────────────────
      // Läuft einer der vier Befehle und wartet auf eine Zahl oder eine
      // Entscheidung, gehört die Tastatur AUSSCHLIESSLICH ihm — sonst würde
      // eine getippte «3» nebenbei einen anderen Befehl auslösen.
      {
        const befehl = transformBefehlRef.current;
        if (befehl && !ev.metaKey && !ev.ctrlKey && ev.key !== 'Escape') {
          // Spiegeln: am Ende die Frage nach dem Original.
          if (befehl.art === 'spiegeln' && befehl.achse) {
            if (['j', 'J', 'Enter'].includes(ev.key)) { ev.preventDefault(); spiegelnAnwenden(befehl, true); return; }
            if (['n', 'N'].includes(ev.key)) { ev.preventDefault(); spiegelnAnwenden(befehl, false); return; }
            return;
          }
          // Drehen: getippter Winkel statt Mausrichtung.
          const wartetAufZahl = (befehl.art === 'drehen' && befehl.basis)
            || (befehl.art === 'reihe' && befehl.abstand);
          if (wartetAufZahl && (befehl.puffer !== null || /^[0-9]$/.test(ev.key))) {
            ev.preventDefault();
            const { buffer, action } = laengeTaste(befehl.puffer ?? '', ev.key);
            if (action === 'abbrechen' && !buffer) { setTransformBefehl({ ...befehl, puffer:null }); return; }
            if (action === 'anwenden') {
              if (befehl.art === 'drehen') drehenAnwenden(befehl, winkelAusBuffer(buffer));
              else reiheAnwenden(befehl, anzahlAusBuffer(buffer));
              return;
            }
            setTransformBefehl({ ...befehl, puffer:buffer });
            return;
          }
        }
      }

      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        // Shift kehrt die Richtung um — dieselbe Gewohnheit wie in Revit/CAD.
        if (ev.shiftKey) redo(); else undo();
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'y' || ev.key === 'Y')) {
        ev.preventDefault(); redo();
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'c' || ev.key === 'C')) {
        if (auswahlKopieren()) ev.preventDefault();
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'v' || ev.key === 'V') && clipboard.current) {
        ev.preventDefault();
        auswahlEinfuegen();
      }
      if (!ev.metaKey && !ev.ctrlKey) {
        const key = ev.key.toLowerCase();
        // Im Versatz-Befehl gehört die Zifferntastatur dem Abstand. Sie darf
        // dort keinen anderen Befehl auslösen — dieselbe Regel wie bei der
        // Längeneingabe während des Zeichnens.
        if (istBefehl(editorModeRef.current, OFFSET)
            && (/^[0-9]$/.test(ev.key) || ev.key === 'Backspace')) {
          ev.preventDefault();
          const { buffer } = laengeTaste(String(editorModeRef.current.payload?.puffer || ''), ev.key);
          const abstand = Number(buffer) > 0 ? Number(buffer) : VERSATZ_STANDARD;
          setEditorMode(startCommand(OFFSET, { persistent:true, payload:{ abstand, puffer:buffer } }));
          setBefehlHinweis(versatzHinweis(abstand));
          return;
        }
        // Klassischer zweistelliger CAD-Befehl: T, dann R. Ein einzelnes R
        // bleibt dadurch weiterhin die schnelle Rücklauf-Layerwahl.
        if (befehlsfolge.current === 't' && key === 'r') {
          ev.preventDefault();
          befehlsfolge.current = '';
          if (befehlsfolgeTimer.current) clearTimeout(befehlsfolgeTimer.current);
          eckeVerbindenStarten();
          return;
        }
        if (key === 't' && !ev.repeat) {
          ev.preventDefault();
          befehlsfolge.current = 't';
          setBefehlHinweis('T … R für Ecke verbinden');
          if (befehlsfolgeTimer.current) clearTimeout(befehlsfolgeTimer.current);
          befehlsfolgeTimer.current = setTimeout(() => {
            befehlsfolge.current = '';
            setBefehlHinweis(null);
          }, 1200);
          return;
        }
        befehlsfolge.current = '';
        if (key === drawingConfig.shortcut_line || key === drawingConfig.shortcut_polyline) {
          ev.preventDefault();
          setSelected(null);
          setSelectedEdgeId(null);
          setEndpointMenu(null);
          setEditorMode(startCommand(DRAW_PIPE));   // Leitungsbefehl starten
          return;
        }
        // Ausrichten (Punkt 33/34): dieselbe frei belegbare Taste wie bisher.
        // Ohne Shift richtet sie LEITUNGSSEGMENTE aus, mit Shift wie bisher das
        // gewählte Bauteil aufs Raster — ein Befehl, eine Taste.
        if (key === drawingConfig.shortcut_align && !ev.shiftKey) {
          ev.preventDefault();
          ausrichtenUmschalten();
          return;
        }
        if (ev.key === 'Enter' && leitungsEntwurfRef.current && leitungsCursorRef.current) {
          ev.preventDefault();
          leitungsEntwurfAbschliessen(leitungsCursorRef.current, leitungsSnap, ev.shiftKey || shiftPressed);
          return;
        }
        if (ev.key === 'Enter' && istModify(editorModeRef.current)) {
          if (wiederholeLetztenRef.current()) ev.preventDefault();
          return;
        }
        // Tab erweitert die Auswahl: ein Klick wählt nur das Teilstück, Tab
        // nimmt den ganzen zusammenhängenden Strang dazu. Nochmal Tab führt
        // zurück aufs Teilstück.
        if (ev.key === 'Tab' && !leitungsEntwurfRef.current && selectedEdgeId) {
          ev.preventDefault();
          setMarkierteEdgeIds(markierteEdgeIds.length
            ? []
            : leitungsSystem(edgesRef.current, nodesRef.current, selectedEdgeId));
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
        // Mit Lücke trennen (BREAK): braucht eine gewählte Leitung.
        if (key === drawingConfig.shortcut_break) {
          ev.preventDefault();
          trennenStarten();
          return;
        }
        // Dehnen (STRETCH): Fenster, Basispunkt, Zielpunkt.
        if (key === drawingConfig.shortcut_stretch) {
          ev.preventDefault();
          dehnenStarten();
          return;
        }
        // ── Basispunkt-Befehle (§74) ──────────────────────────────────────
        // Sie stehen VOR den frei belegbaren Tasten: die prüfen kein Shift, und
        // `E` gehört ohne Shift dem Dehnen bis Kante aus #72. Mit Shift ist es
        // die Reihe. Spiegeln und Drehen liegen aus demselben Grund auf Shift
        // neben ihrer Bauteil-Schnellfunktion.
        if (ev.shiftKey && key === 'e') {
          ev.preventDefault();
          transformStarten('reihe', { ganzeLeitungen:true });
          return;
        }
        if (ev.shiftKey && key === drawingConfig.shortcut_mirror) {
          ev.preventDefault();
          transformStarten('spiegeln');
          return;
        }
        if (ev.shiftKey && key === drawingConfig.shortcut_rotate) {
          ev.preventDefault();
          transformStarten('drehen');
          return;
        }
        // C wie COPY — fest verdrahtet wie das zweistellige TR, damit in der
        // frei belegbaren Liste keine Doppelbelegung entstehen kann.
        if (key === 'c') {
          ev.preventDefault();
          transformStarten('kopieren', { ganzeLeitungen:ev.shiftKey });
          return;
        }
        // ── Leitungen ändern (#72) ────────────────────────────────────────
        // Vier eigene, frei belegbare Tasten. `TR` bleibt unangetastet die
        // Ecke-verbinden-Folge; Stutzen hat darum eine eigene Taste.
        if (key === drawingConfig.shortcut_offset) {
          ev.preventDefault();
          versatzStarten();
          return;
        }
        if (key === drawingConfig.shortcut_trim) {
          ev.preventDefault();
          grenzBefehlStarten(false);
          return;
        }
        if (key === drawingConfig.shortcut_extend) {
          ev.preventDefault();
          grenzBefehlStarten(true);
          return;
        }
        if (key === drawingConfig.shortcut_join) {
          ev.preventDefault();
          verbindenStarten();
          return;
        }
        // Verschieben (CAD-MOVE): frei belegbare Taste. Mit Shift wandert die
        // GANZE Leitung statt nur des angeklickten Teilstücks.
        if (key === drawingConfig.shortcut_move) {
          ev.preventDefault();
          verschiebenStarten(ev.shiftKey);
          return;
        }
        // Layer-Schnellwahl. Die frei belegbaren Befehlstasten haben Vorrang —
        // wer «v» auf Verschieben legt, bekommt Verschieben (Rückgabe oben).
        if (ev.key === 'v' || ev.key === 'V') layerWaehlen('heizung_vl');
        if (ev.key === 'r' || ev.key === 'R') layerWaehlen('heizung_rl');
        if (ev.key === 'b' || ev.key === 'B') layerWaehlen('neutral');
        // Frei belegbare Bauteil-Befehle (Drehen / Spiegeln / Ausrichten).
        if (selected) {
          if (key === drawingConfig.shortcut_rotate && ROTATABLE.has(selected.type)) { ev.preventDefault(); rotateNode(selected.id); }
          else if (key === drawingConfig.shortcut_mirror && ROTATABLE.has(selected.type)) { ev.preventDefault(); mirrorNode(selected.id); }
          else if (key === drawingConfig.shortcut_align && ev.shiftKey) { ev.preventDefault(); alignNode(selected.id); }
        }
        // Verschieben per Pfeiltaste (Shift = grosser Schritt).
        if (selected && ev.key.startsWith('Arrow')) {
          ev.preventDefault();
          const schritt = (ev.shiftKey ? 5 : 1) * drawingConfig.grid_size;
          const dx = ev.key === 'ArrowLeft' ? -schritt : ev.key === 'ArrowRight' ? schritt : 0;
          const dy = ev.key === 'ArrowUp' ? -schritt : ev.key === 'ArrowDown' ? schritt : 0;
          if (dx || dy) nudgeNode(selected.id, dx, dy);
        }
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          // Eine angewählte Beschriftung wird ausgeblendet, nicht die Leitung
          // gelöscht. Rückgängig über das Leitungspanel oder Cmd+Z.
          if (selectedLabelEdgeId) {
            ev.preventDefault();
            beschriftungSetzen(selectedLabelEdgeId, { label_hidden:true });
            setSelectedLabelEdgeId(null);
          }
          else if (selectedEdgePoint) {
            ev.preventDefault();
            punktEntfernen(selectedEdgePoint.edgeId, selectedEdgePoint.pointIndex);
          }
          else if (auswahlLoeschen()) ev.preventDefault();
          else if (selected) { snap(); deleteNodeRef.current?.(selected.id); }
          else if (selectedEdgeId) { deleteEdgeRef.current?.(selectedEdgeId); }
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [undo, redo, selected, selectedEdgeId, selectedEdgePoint, selectedLabelEdgeId, markierteEdgeIds, beschriftungSetzen, punktEntfernen, snap, rotateNode, mirrorNode, alignNode, nudgeNode, layerWaehlen, leitungsEntwurfAbschliessen, leitungsSnap, shiftPressed, endpointMenu, edgeMenu, drawingConfig, dynamikFeld, setNodes, laengeAnwenden, entwurfVerwerfen, verschiebenStarten, ausrichtenUmschalten, trennenStarten, eckeVerbindenStarten, dehnenStarten, versatzStarten, grenzBefehlStarten, verbindenStarten, auswahlKopieren, auswahlEinfuegen, auswahlLoeschen, transformStarten, drehenAnwenden, reiheAnwenden, spiegelnAnwenden]);

  // Berechnete Werte (Backend) in die Node-Daten spiegeln — nur für die Anzeige.
  // Verteiler-Rahmen: nur die Balken sind greifbar (dragHandle), die Lücke
  // dazwischen lässt Klicks durch (pointerEvents none) und liegt hinter den
  // Strängen (zIndex -10) — so lassen sich Gruppen zwischen die Balken stellen.
  const displayNodes = useMemo(() => nodes.map(raw => {
    // Kennwerte fürs Datenkästchen: fertig aus dem Backend (node_infos), damit
    // Editor und PDF-Export dieselben Werte am Bauteil zeigen.
    const infos = nodeInfos[raw.id];
    const n = infos ? { ...raw, data:{ ...raw.data, _calc:{ ...(raw.data?._calc || {}), kennwerte:infos } } } : raw;
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
        data: c ? { ...n.data, _calc: { ...(n.data?._calc || {}), ...c } } : n.data,
      };
    }
    if (n.type === 'gruppe' || n.type === 'heizkreis' || n.type === 'heizkoerper' || n.type === 'luftheizapparat' || n.type === 'lufterhitzer_gruppe') {
      return { ...n, data: { ...n.data, _calc: { ...(n.data?._calc || {}), ...(gruppeResults[n.id] || {}), v: nodeFlows[n.id] } } };
    }
    if (n.type === 'waermezaehler') {
      return { ...n, data: { ...n.data, _calc: { ...(n.data?._calc || {}), v: nodeFlows[n.id] } } };
    }
    if (n.type === 'expansion') {
      const c = expansionResults[n.id];
      return c ? { ...n, data: { ...n.data, _calc: { ...(n.data?._calc || {}), ...c } } } : n;
    }
    if (n.type === 'speicher') {
      const c = speicherResults[n.id];
      return c ? { ...n, data: { ...n.data, _calc: { ...(n.data?._calc || {}), ...c } } } : n;
    }
    if (n.type === 'erdsonden') {
      const c = erdsondenResults[n.id];
      return c ? { ...n, data: { ...n.data, _calc: { ...(n.data?._calc || {}), ...c } } } : n;
    }
    if (n.type === 'bww') {
      const c = bwwResults[n.id];
      return c ? { ...n, data: { ...n.data, _calc: { ...(n.data?._calc || {}), ...c } } } : n;
    }
    return n;
  }), [nodes, nodeInfos, verteilerResults, gruppeResults, nodeFlows, expansionResults, speicherResults, erdsondenResults, bwwResults]);

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
          werte = `${sn} · ${c.q_kw ?? d.q_kw ?? '—'} kW · ${d.vl_temp ?? '—'}/${d.rl_temp ?? '—'} °C · sek ${fx(c.m_sek)} / prim ${fx(c.m_prim)} m³/h${c.q_kw_quelle === 'lufterhitzer_untergruppen' ? ` · Summe aus ${c.untergruppen_anzahl} Lufterhitzern` : ''}${d.dp_kpa ? ` · Δp ${d.dp_kpa} kPa` : ''}${d.hat_wz ? ' · WZ' : ''}${c.pumpe?.dp_kpa != null ? ` · ${bez} Pumpe ${c.pumpe.dp_kpa.toFixed(1)} kPa` : ''}${c.ventil?.pv != null ? ` · ${bez} Ventil kvs ${c.ventil.kvs_eff} (Pv ${c.ventil.pv.toFixed(1)}%)` : ''}`;
        } else if (n.type === 'lufterhitzer_gruppe') {
          const c = gruppeResults[n.id] || {};
          werte = `${d.q_kw ?? '—'} kW · VL/RL ${c.vl ?? '—'}/${c.rl ?? '—'} °C · V' ${fx(c.m_sek)} m³/h${c.ventil?.kvs_eff != null ? ` · kvs ${c.ventil.kvs_eff}` : ''}`;
        } else if (n.type === 'heizkreis' || n.type === 'heizkoerper' || n.type === 'luftheizapparat') {
          werte = `${d.q_kw ?? '—'} kW · ${d.vl_temp ?? '—'}/${d.rl_temp ?? '—'} °C · V' ${fx(nodeFlows[n.id])} m³/h`;
        } else if (n.type === 'verteiler') {
          const c = verteilerResults[n.id] || {};
          werte = `VL ${fx(c.vl_vt, 1)} / RL ${fx(c.rl_misch, 1)} °C · Σ ${fx(c.q_total, 2)} kW · ${fx(c.m_prim_total)} m³/h${c.dp_max_ast != null ? ` · Δp Ast ${c.dp_max_ast_nr}: ${c.dp_max_ast} kPa` : ''}`;
        } else if (n.type === 'pump') {
          const p = pumpenResults[n.id] || {};
          werte = `V' ${fx(p.v ?? nodeFlows[n.id])} m³/h${p.foerderhoehe_kpa != null ? ` · Förderhöhe ${p.foerderhoehe_kpa.toFixed(1)} kPa${p.dp_ast_kpa ? ` (gemeinsam ${p.dp_gemeinsam_kpa ?? 0} + Ast ${p.dp_ast_kpa})` : ''}` : ''}`;
        } else if (n.type === 'valve2' || n.type === 'valve3') {
          const ve = ventilResults[n.id];
          const umschalt = n.type === 'valve3' && (n.data?.funktion || 'mischend') === 'umschaltend';
          werte = `V' ${fx(nodeFlows[n.id])} m³/h${umschalt ? ' · Umschaltventil (BWW-Vorrang)' : ''}`
            + (ve?.pv != null ? ` · kvs ${ve.kvs_eff} · Pv ${ve.pv.toFixed(1)} %` : '');
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

  // Beim Klick auf ein einzelnes Teilstück werden nur nahe Bauteile vermasst.
  // 500 mm hält die Anzeige lokal; die drei nächsten Treffer vermeiden einen
  // Zahlenwald in dichten Schemata. Gemessen wird zur echten, von React Flow
  // ermittelten Bauteilbox und nicht zur Node-Position oben links.
  const segmentAbstandsMasse = useMemo(() => {
    void nodeGeometryVersion;
    if (!selectedEdgeSegment) return [];
    const edge = edges.find(item => item.id === selectedEdgeSegment.edgeId);
    if (!edge) return [];
    const route = routePunkte(edge);
    const a = route[selectedEdgeSegment.segmentIndex];
    const b = route[selectedEdgeSegment.segmentIndex + 1];
    if (!a || !b) return [];
    return nodes
      .filter(node => !node.hidden && !['junction', 'label', 'concrete_area', 'interface_line'].includes(node.type))
      .map(node => {
        const internal = getInternalNode(node.id);
        const position = internal?.internals?.positionAbsolute || node.position;
        const width = internal?.measured?.width || Number(node.style?.width) || 0;
        const height = internal?.measured?.height || Number(node.style?.height) || 0;
        const mass = abstandSegmentZuRechteck(a, b, { x:position?.x, y:position?.y, width, height });
        return mass && mass.distance > 1 && mass.distance <= 500
          ? { ...mass, nodeId:node.id, label:massLabel(mass.distance) }
          : null;
      })
      .filter(Boolean)
      .sort((links, rechts) => links.distance - rechts.distance)
      .slice(0, 3);
  }, [edges, getInternalNode, nodeGeometryVersion, nodes, routePunkte, selectedEdgeSegment]);

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
      selected:Boolean(edge.selected) || selectedEdgeId === edge.id,
      hidden: layerVisibility[layer.id] === false,
      data: {
        ...(edge.data || {}),
        cad_polyline:true,
        _routePoints:effectiveRoute.slice(1, -1),
        // Auch die ENDEN kommen aus der berechneten Route. React Flow leitet
        // seine eigenen Endpunkte aus der deklarierten Handle-Seite ab — und
        // die dreht bei einem gedrehten Bauteil nicht mit. Bei einem quer
        // liegenden 3-Weg-Ventil landeten die beiden Enden der Flussachse
        // dadurch ein paar Pixel über- und untereinander statt auf einer Höhe
        // (Dominic 2026-07-31). Der Editor misst den Anschluss selbst; diese
        // Messung ist die Wahrheit, nicht die Deklaration.
        _routeStart:effectiveRoute[0],
        _routeEnd:effectiveRoute.at(-1),
        _groupSelected:markierteEdgeIds.includes(edge.id),
        _layerRole:layer.role,
        _dashed:layer.dashed,
        _onAddPoint:punktHinzufuegen,
        _onRemovePoint:punktEntfernen,
        _onSelectPoint:griffPunktWaehlen,
        _selectedPointIndex:selectedEdgePoint?.edgeId === edge.id ? selectedEdgePoint.pointIndex : null,
        _selectedGripPointIndexes:selectedGripPoints.filter(item => item.edgeId === edge.id).map(item => item.pointIndex),
        _selectedSegmentIndex:selectedEdgeSegment?.edgeId === edge.id ? selectedEdgeSegment.segmentIndex : null,
        _selectedSegmentIndexes:selectedSegments
          .filter(item => item.edgeId === edge.id).map(item => item.segmentIndex),
        _onPointPointerDown:punktDragStart,
        _onSegmentPointerDown:segmentDragStart,
        _onEndpointPointerDown:endpointDragStart,
        _onEndpointContextMenu:endpointContextMenu,
        _onGripHover:griffHover,
        _onGripLeave:griffVerlassen,
        _onGripContextMenu:griffContextMenu,
        _onContextMenu:edgeContextMenu,
        // Beschriftung: ziehen, zurücksetzen, ausblenden (Rechtsklick → Menü).
        _onLabelPointerDown:labelDragStart,
        _onLabelContextMenu:edgeContextMenu,
        _onLabelReset:labelZuruecksetzen,
        _labelSelected:selectedLabelEdgeId === edge.id,
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
  }, [edges, edgeContextMenu, edgeFlows, endpointContextMenu, endpointDragStart, griffContextMenu, griffHover, griffPunktWaehlen, griffVerlassen, junctionDegrees, labelDragStart, labelZuruecksetzen, layerVisibility, leitungResults, markierteEdgeIds, nodeGeometryVersion, punktDragStart, punktEntfernen, punktHinzufuegen, routePunkte, segmentDragStart, selectedEdgeId, selectedEdgePoint, selectedEdgeSegment, selectedSegments, selectedGripPoints, selectedLabelEdgeId]);

  const loadSchema = (key) => {
    const s = SCHALTUNGEN[key];
    setNodes(s.nodes.map(n=>({...n})));
    setEdges(s.edges.map(e=>({
      ...e,
      data:{ ...(e.data || {}), cad_polyline:true, polyline_version:1, corner_radius:drawingConfig.corner_radius },
    })));
    setSelected(null);
  };

  // ── Firmenweite Schema-Vorlagen ───────────────────────────────────────────
  // Eine Vorlage ist eine Kopie des Graphen zum Zeitpunkt des Speicherns. Sie
  // ersetzt beim Laden den Zeichnungsinhalt — als EINE Rückgängig-Aktion, damit
  // ein versehentliches Laden nicht die halbe Arbeit kostet.
  const vorlagenLaden = useCallback(() => {
    getSchemaTemplates().then(setVorlagen).catch(() => setVorlagen([]));
  }, []);

  React.useEffect(() => { vorlagenLaden(); }, [vorlagenLaden]);

  const vorlageAnwenden = useCallback(async (templateId) => {
    setVorlageFehler('');
    try {
      const vorlage = await getSchemaTemplate(templateId);
      const graph = vorlage?.graph || {};
      const geladen = graphFuerEditor(graph);
      snap();
      setNodes(geladen.nodes);
      setEdges(geladen.edges);
      setSelected(null);
      setSelectedEdgeId(null);
      requestAnimationFrame(() => fitView({ padding:0.25, duration:0, minZoom:0.2, maxZoom:1 }));
    } catch {
      setVorlageFehler('Die Vorlage konnte nicht geladen werden.');
    }
  }, [fitView, setEdges, setNodes, snap]);

  const vorlageSpeichern = useCallback(async (event) => {
    event.preventDefault();
    const name = vorlageName.trim();
    if (!name || !nodesRef.current.length) return;
    setVorlageSaving(true);
    setVorlageFehler('');
    try {
      // Der aktuelle Stand aus dem Editor, nicht der zuletzt gespeicherte —
      // sonst würde eine gerade gezeichnete Schaltung nicht in der Vorlage sein.
      const graph = graphFuerSpeicherung(
        nodesRef.current,
        edgesRef.current,
        { active_layer_id:activeLayerId, visibility:layerVisibility },
        drawingConfig,
      );
      await createSchemaTemplate({ name, beschreibung:vorlageBeschreibung.trim(), graph });
      setVorlageName('');
      setVorlageBeschreibung('');
      setVorlageDialogOpen(false);
      vorlagenLaden();
    } catch (fehler) {
      setVorlageFehler(fehler?.response?.data?.detail || 'Die Vorlage konnte nicht gespeichert werden.');
    } finally {
      setVorlageSaving(false);
    }
  }, [activeLayerId, drawingConfig, layerVisibility, vorlageBeschreibung, vorlageName, vorlagenLaden]);

  const vorlageEntfernen = useCallback(async (templateId) => {
    setVorlageFehler('');
    try {
      await deleteSchemaTemplate(templateId);
      vorlagenLaden();
    } catch (fehler) {
      setVorlageFehler(fehler?.response?.status === 403
        ? 'Nur die Erstellerin oder ein Firmenadmin darf diese Vorlage löschen.'
        : 'Die Vorlage konnte nicht gelöscht werden.');
    }
  }, [vorlagenLaden]);

  const downloadPdf = async (inhalt) => {
    if (!schemaId) return;
    setExportState('loading');
    try {
      // Der Plot erhält exakt die im Editor sichtbare, bereits aufgelöste
      // Polylinie. So zeichnet das Backend keine abweichende Ersatzroute.
      const exportEdges = edges.map(edge => ({
        ...edge,
        data:{
          ...(edge.data || {}),
          cad_polyline:true,
          // Vollständige, im Browser vermessene Route inkl. beider Handles.
          // Das Backend darf diese Exportgeometrie nicht erneut herleiten.
          export_route:routePunkte(edge),
        },
      }));
      // Dasselbe für die Bauteile: Box und Anschlusspunkte kommen aus der
      // Messung im Browser, damit das Backend keine zweite Geometrie herleitet.
      const graph = graphFuerSpeicherung(
        nodesMitExportGeometrie(nodes, getInternalNode),
        exportEdges,
        { active_layer_id:activeLayerId, visibility:layerVisibility },
        drawingConfig,
      );
      const res = await api.post(`/api/v1/schemas/${schemaId}/pdf`, {
        inhalt,
        graph,
      }, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] || `Schema_${inhalt}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF-Export fehlgeschlagen', error);
      alert(error?.response?.data?.detail || 'PDF konnte nicht erstellt werden. Bitte Schema und Verbindung prüfen.');
    } finally {
      setExportState('idle');
    }
  };

  // React-Flow-Drag-to-connect ist bewusst DEAKTIVIERT (keine zufälligen
  // Leitungen). Handles dienen nur als Fang-/Zielpunkte des expliziten
  // Zeichenmodus. Neue hydraulische Leitungen entstehen ausschliesslich über
  // den CAD-Klick-Pfad und createHydraulicEdge(). Deshalb kein onConnect/
  // onConnectStart/onConnectEnd mehr.

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  // EINE Stelle, an der ein Bauteil entsteht (Punkt 2). Vorher hing die ganze
  // Erzeugung inklusive Inline-Einfügen in `onDrop` — dadurch war Drag&Drop der
  // einzige Weg, und der `PLACE`-Befehl blieb toter Code. Jetzt rufen Drop UND
  // Klick-Platzierung dieselbe Funktion, sodass beide Wege identisch verhalten.
  const bauteilPlatzieren = useCallback((raw, weltPosition, screenPunkt = null) => {
    // Lage des neuen Datenblocks VOR dem Zustandswechsel bestimmen. Innerhalb
    // des `setNodes`-Updaters trägt die Bauteilliste noch keine gemessenen
    // Höhen; die gedachte Linie läge dann zu hoch und der Block ragte in die
    // Zeichnung.
    const blockLageFuerNeues = naechsteBlockLage(
      blockBauteile(), blockLagen(nodesRef.current));
    if (!raw) return null;
    snap();
    const pos = weltPosition;
    const p = paletteItem(raw);
    const nodeType = p?.type || raw;
    const id = newId();
    const fangRadius = 30 / Math.max(getZoom(), 0.2);
    const lineHit = isInlineInsertable(nodeType) ? naechsteSichtbareLeitung(pos, fangRadius) : null;
    // Abzweig-Bauteil (§18): hängt mit EINEM Anschluss an der Leitung. Es liegt
    // nicht im Hauptstrom, sondern an einer echten Junction daneben.
    const branchDef = isBranchInsertable(nodeType) ? branchAnschluss(nodeType) : null;
    const branchHit = branchDef ? naechsteSichtbareLeitung(pos, fangRadius) : null;
    // Für die Seite des Abzweigs zählt der echte Cursor, nicht der bereits auf
    // die Leitung gefangene Landepunkt — sonst zeigt der Stich immer nach oben.
    const cursorWelt = screenPunkt ? screenToFlowPosition(screenPunkt) : pos;
    const branchZiel = branchHit ? branchAnschlussPunkt(branchHit, cursorWelt) : null;
    const branchLayer = branchHit ? layerVonEdge(branchHit.edge) : null;
    const branchJunctionId = branchHit ? newId() : null;
    const nodePosition = branchZiel
      ? { x:branchZiel.x - branchDef.x * branchDef.w, y:branchZiel.y - branchDef.y * branchDef.h }
      : lineHit ? inlineNodePosition(nodeType, { x:lineHit.x, y:lineHit.y }) : pos;

    // Ausrichtung des Bauteils an der Leitung (§5): die Flussachse (top/bottom)
    // soll mit der Leitung fluchten. Waagrechte Leitung → Bauteil 90° drehen.
    let inlineRotation = 0;
    let entryHandle = 'top';    // verbindet mit host.source (Vorstück)
    let exitHandle = 'bottom';  // verbindet mit host.target (Reststück)
    if (lineHit) {
      const a = lineHit.route[lineHit.segmentIndex];
      const b = lineHit.route[lineHit.segmentIndex + 1];
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const forward = horizontal ? b.x >= a.x : b.y >= a.y;
      inlineRotation = horizontal ? 90 : 0;
      // Bauteil hat immer die realen Achsenanschlüsse top/bottom; welcher zum
      // Vor- bzw. Reststück zeigt, ergibt sich aus Richtung und Drehung.
      if (!horizontal) {
        entryHandle = forward ? 'top' : 'bottom';
        exitHandle = forward ? 'bottom' : 'top';
      } else {
        // 90°: top liegt visuell rechts, bottom links.
        entryHandle = forward ? 'bottom' : 'top';
        exitHandle = forward ? 'top' : 'bottom';
      }
    }

    setNodes(ns => {
      const extra = nodeType === 'verteiler' ? { abgaenge: 4, hoehe: 700 }
        : nodeType === 'erdsonden' ? { sonden_anzahl: 5, sonden_laenge_m: 180 }
        : nodeType === 'gruppe' ? { schaltung: 'einspritz' }
        : nodeType === 'lufterhitzer_gruppe' ? { schaltung: 'drossel' }
        : nodeType === 'heizkoerper' ? { darstellung:'flaeche', system:'Heizkörper', vl_temp:50, rl_temp:40 }
        : nodeType === 'luftheizapparat' ? { system:'Lufterhitzer', vl_temp:60, rl_temp:45 }
        : nodeType === 'anschluss' ? { buchstabe: naechsterBuchstabe(ns) }
        : nodeType === 'label' ? { label: 'Text', fontSize: 12 }
        : nodeType === 'concrete_area' ? { label: '', hatch_scale:8 }
        : nodeType === 'interface_line' ? { label: 'SYSTEMGRENZE', dashed: false }
        : {};
      // Skalierbare Annotationen brauchen eine Startgrösse; die Betonfläche liegt
      // hinter den Bauteilen (niedriger zIndex).
      const annoStyle = nodeType === 'concrete_area' ? { style: { width: 220, height: 130 }, zIndex: -1 }
        : nodeType === 'heizkoerper' ? { style:{ width:160, height:64 } }
        : nodeType === 'interface_line' ? { style: { width: 200, height: 24 } }
        : {};
      const bauteil = {
        id, type: nodeType, position: nodePosition, ...annoStyle,
        data: { label: p?.label || nodeType, ...extra, ...(p?.preset || {}),
          ...(inlineRotation ? { rotation: inlineRotation } : {}),
          ...(NUMMERIERT.includes(nodeType)
            ? { nr: naechsteNr(ns), caption_pos: blockLageFuerNeues }
            : {}) },
      };
      // Der Abzweigpunkt ist ein echter Topologie-Knoten, kein optischer Punkt.
      return branchJunctionId
        ? [...ns, cadAnker(branchJunctionId, { x:branchHit.x, y:branchHit.y }, branchLayer), bauteil]
        : [...ns, bauteil];
    });

    // ── Abzweig: A ─●─ B, darunter das Bauteil (§19) ──
    if (branchJunctionId) {
      const [first, second] = leitungTeilen(branchHit, branchJunctionId, branchLayer.id);
      const stich = createHydraulicEdge({
        id: newId(),
        source: branchJunctionId, sourceHandle: 'center-source',
        target: id, targetHandle: branchDef.port,
        layerId: branchLayer.id, layerColor: branchLayer.color,
        points: [], cornerRadius: drawingConfig.corner_radius,
      }, edgesRef.current);
      setEdges(items => [
        ...items.filter(edge => edge.id !== branchHit.edge.id),
        first, second, ...(stich ? [stich] : []),
      ]);
      return id;
    }
    if (lineHit) {
      const host = lineHit.edge;
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
    // Verbraucher- und Lufterhitzergruppe: direkt nach dem Setzen die Schaltung wählen
    if ((nodeType === 'gruppe' || nodeType === 'lufterhitzer_gruppe') && screenPunkt) {
      setSchaltungswahl({ nodeId: id, nodeType, x: screenPunkt.x, y: screenPunkt.y });
    }
    return id;
  }, [blockBauteile, blockLagen, cadAnker, drawingConfig.corner_radius, getZoom, leitungTeilen, naechsteSichtbareLeitung, screenToFlowPosition, setEdges, setNodes, snap]);

  // Drag&Drop bleibt erhalten — es ist jetzt nur einer von zwei Wegen.
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    bauteilPlatzieren(raw, screenToFlowPosition({ x:e.clientX, y:e.clientY }), { x:e.clientX, y:e.clientY });
  }, [bauteilPlatzieren, screenToFlowPosition]);

  // Punkt 2 — Bibliothek anklicken statt ziehen. Der Befehl bleibt aktiv, solange
  // er als Dauerbefehl gewählt wurde; sonst ist nach dem Setzen wieder `modify`.
  const platzierenStarten = useCallback((typ, { persistent = false } = {}) => {
    setSelected(null);
    setSelectedEdgeId(null);
    setSelectedEdgePoint(null);
    setEndpointMenu(null);
    setEdgeMenu(null);
    // Ein laufender Leitungsentwurf wird verworfen — zwei Befehle gleichzeitig
    // gibt es nicht.
    entwurfVerwerfen();
    setLaengenPuffer(null);
    setEditorMode(startCommand(PLACE, { persistent, payload:{ nodeType:typ } }));
  }, [entwurfVerwerfen]);

  // Klick im Platzierungsbefehl. Die Weltkoordinate ist DIESELBE, die die
  // Vorschau anzeigt — sonst würde das Bauteil neben dem Geist landen.
  const platzierenKlick = useCallback((event) => {
    if (event.button !== 0 || spacePanRef.current) return false;
    const typ = editorModeRef.current?.payload?.nodeType;
    if (!typ) return false;
    event.preventDefault();
    event.stopPropagation();
    const punkt = platzierVorschauRef.current
      || rasterPunkt(screenToFlowPosition({ x:event.clientX, y:event.clientY }), drawingConfig.grid_size);
    bauteilPlatzieren(typ, punkt, { x:event.clientX, y:event.clientY });
    setInlineTreffer(null);
    setEditorMode(finishCommand(editorModeRef.current));
    return true;
  }, [bauteilPlatzieren, drawingConfig.grid_size, screenToFlowPosition]);

  const onNodeClick = useCallback((event, node) => {
    // Im Platzierungsbefehl setzt ein Klick ein Bauteil — auch wenn unter dem
    // Cursor schon eines liegt. Sonst „verschluckt" das vorhandene Bauteil den
    // Klick und der Planer glaubt, der Befehl sei kaputt.
    if (istBefehl(editorModeRef.current, PLACE)) { platzierenKlick(event); return; }
    // Nadel am Bauteil: der Eintrag merkt sich zusätzlich, an welchem.
    if (nadelModusRef.current) {
      event.preventDefault();
      event.stopPropagation();
      nadelSetzen(screenToFlowPosition({ x:event.clientX, y:event.clientY }), node.id);
      return;
    }
    if (eckeVerbindenKlick(event)) return;
    // Im Verschieben-Befehl setzt jeder Klick einen Punkt — auch auf einem
    // Bauteil. Sonst liesse sich der Basispunkt nie an ein Bauteil legen.
    if (dehnenKlick(event)) return;
    if (verschiebenKlick(event)) return;
    if (transformKlick(event)) return;
    // Im Zeichenmodus oder bei aktivem Entwurf: Klick auf ein Bauteil startet/
    // führt die Leitung an dessen Anschluss (nur bei Anschluss-Treffer).
    if (leitungsEntwurfRef.current || zeichenModusRef.current) {
      cadKlick(event, !zeichenModusRef.current && !leitungsEntwurfRef.current);
      return;
    }
    setEndpointMenu(null);
    const addieren = event.metaKey || event.ctrlKey;
    const entfernen = event.shiftKey;
    setNodes(items => items.map(item => ({ ...item,
      selected:entfernen && item.id === node.id ? false
        : addieren ? (item.id === node.id ? !item.selected : Boolean(item.selected))
          : item.id === node.id,
    })));
    if (entfernen) setSelected(current => current?.id === node.id ? null : current);
    else setSelected(node);
    if (!addieren && !entfernen) {
      setEdges(items => items.map(item => ({ ...item, selected:false })));
      setSelectedEdgeId(null);
      setSelectedEdgePoint(null);
      setSelectedEdgeSegment(null);
      setSelectedSegments([]);
    }
    setSelectedLabelEdgeId(null);
    setInspectorOpen(true);
  }, [cadKlick, platzierenKlick, verschiebenKlick, transformKlick, nadelSetzen, screenToFlowPosition, dehnenKlick, eckeVerbindenKlick, setEdges, setNodes]);
  const onNodeDoubleClick = useCallback((_, node) => {
    if (node.type === 'label') return; // Textblock: Doppelklick editiert inline
    if (!leitungsEntwurfRef.current) setAuslegung(node);
  }, []);
  // ── Ausrichten (Punkt 34–39) ──
  // Zwei Klicks: erst die Referenz, dann das Segment, das parallel bzw. auf
  // dieselbe Flucht soll. Die Geometrie rechnet `segmentAusrichten` (getestet);
  // hier wird nur ausgewählt, geschützt und gespeichert.
  const ausrichtenKlick = useCallback((event) => {
    if (event.button != null && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const welt = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    const treffer = naechsteSichtbareLeitung(welt, 24 / Math.max(getZoom(), 0.2));
    if (!treffer) {
      setAusrichtenHinweis('Kein Segment getroffen — direkt auf eine Leitung klicken.');
      return true;
    }
    const referenz = editorModeRef.current?.payload;
    if (!referenz) {
      setEditorMode(startCommand(ALIGN, { payload:{
        edgeId:treffer.edge.id, segmentIndex:treffer.segmentIndex,
        a:treffer.route[treffer.segmentIndex], b:treffer.route[treffer.segmentIndex + 1],
      } }));
      setAusrichtenHinweis(null);
      return true;
    }
    if (referenz.edgeId === treffer.edge.id && referenz.segmentIndex === treffer.segmentIndex) {
      setAusrichtenHinweis('Referenz und Ziel sind dasselbe Segment.');
      return true;
    }
    const ziel = edgesRef.current.find(item => item.id === treffer.edge.id);
    if (!ziel) return true;
    const route = routePunkte(ziel);
    const knoten = (id) => nodesRef.current.find(node => node.id === id);
    // Ein Ende an einem echten Bauteil ist fest; ein freies Ende hängt an einem
    // CAD-Anker und darf mitwandern (Punkt 37).
    const fest = {
      start:knoten(ziel.source)?.type !== 'junction',
      end:knoten(ziel.target)?.type !== 'junction',
    };
    const ergebnis = segmentAusrichten(route, treffer.segmentIndex,
      { a:referenz.a, b:referenz.b }, { fest, klick:welt });
    if (ergebnis.fehler) {
      setAusrichtenHinweis(ergebnis.fehler);
      return true;
    }
    snap();   // gesamte Ausrichtung = EINE Undo-Aktion
    const neu = ergebnis.route;
    const startBewegt = Math.hypot(neu[0].x - route[0].x, neu[0].y - route[0].y) > 0.01;
    const endeBewegt = Math.hypot(neu.at(-1).x - route.at(-1).x, neu.at(-1).y - route.at(-1).y) > 0.01;
    if (startBewegt || endeBewegt) {
      setNodes(items => items.map(node => {
        if (startBewegt && node.id === ziel.source && node.type === 'junction') return { ...node, position:{ x:neu[0].x, y:neu[0].y } };
        if (endeBewegt && node.id === ziel.target && node.type === 'junction') return { ...node, position:{ x:neu.at(-1).x, y:neu.at(-1).y } };
        return node;
      }));
    }
    setEdges(items => items.map(item => item.id === ziel.id
      ? { ...item, data:{ ...(item.data || {}), cad_polyline:true, points:neu.slice(1, -1) } }
      : item));
    setAusrichtenHinweis(null);
    setEditorMode(finishCommand({ ...editorModeRef.current, payload:null }));
    return true;
  }, [getZoom, naechsteSichtbareLeitung, routePunkte, screenToFlowPosition, setEdges, setNodes, snap]);

  const onEdgeClick = useCallback((event, edge) => {
    if (eckeVerbindenKlick(event)) return;
    // Leitungen ändern (#72): diese Befehle brauchen den Punkt AUF der Leitung
    // und dürfen deshalb nicht bei der Auswahl hängen bleiben.
    if (versatzKlick(event)) return;
    if (grenzBefehlKlick(event)) return;
    if (verbindenKlick(event)) return;
    if (istBefehl(editorModeRef.current, ALIGN)) { ausrichtenKlick(event); return; }
    // Der Trennbefehl braucht die Punkte AUF der Leitung — der Klick darf
    // deshalb nicht bei der Auswahl hängen bleiben.
    if (lueckeKlick(event)) return;
    if (dehnenKlick(event)) return;
    if (verschiebenKlick(event)) return;
    // Basis- und Zielpunkt liegen meist AUF einem Objekt — genau darum gibt es
    // den Objektfang. Der Klick gehört deshalb dem Befehl, nicht der Auswahl.
    if (transformKlick(event)) return;
    // Im Platzierungsbefehl setzt ein Klick auf eine Leitung das Bauteil — und
    // teilt sie dabei. Ohne das würde die Leitung den Klick verschlucken,
    // obwohl die Vorschau „in Leitung einsetzen" anzeigt.
    if (istBefehl(editorModeRef.current, PLACE)) { platzierenKlick(event); return; }
    if (leitungsEntwurfRef.current) { cadKlick(event); return; }
    setEndpointMenu(null);
    setEdgeMenu(null);
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) setMarkierteEdgeIds([]);
    setSelectedEdgeId(edge.id);
    setSelectedEdgePoint(current => current?.edgeId === edge.id ? current : null);
    const route = routePunkte(edge);
    const welt = screenToFlowPosition({ x:event.clientX, y:event.clientY });
    let segment = null;
    for (let index = 0; index < route.length - 1; index += 1) {
      const hit = projektionAufSegment(welt, route[index], route[index + 1]);
      if (hit && (!segment || hit.distance < segment.distance)) segment = { ...hit, segmentIndex:index };
    }
    const teil = segment ? { edgeId:edge.id, segmentIndex:segment.segmentIndex } : null;
    if (teil) {
      const key = `${teil.edgeId}:${teil.segmentIndex}`;
      const schonGewaehlt = selectedSegments.some(item => `${item.edgeId}:${item.segmentIndex}` === key);
      setSelectedSegments(items => {
        if (event.shiftKey) return items.filter(item => `${item.edgeId}:${item.segmentIndex}` !== key);
        if (event.metaKey || event.ctrlKey) {
          return items.some(item => `${item.edgeId}:${item.segmentIndex}` === key)
            ? items.filter(item => `${item.edgeId}:${item.segmentIndex}` !== key)
            : [...items, teil];
        }
        return [teil];
      });
      setSelectedEdgeSegment(event.shiftKey || ((event.metaKey || event.ctrlKey) && schonGewaehlt) ? null : teil);
      // Ein Segmentklick ist keine Auswahl der ganzen React-Flow-Edge. Eine
      // Rahmenauswahl kann weiterhin vollständige Leitungen markieren.
      setEdges(items => items.map(item => item.id === edge.id ? { ...item, selected:false } : item));
    }
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
      setNodes(items => items.map(item => ({ ...item, selected:false })));
      setSelected(null);
    }
    setSelectedLabelEdgeId(null);
    setInspectorOpen(true);
  }, [ausrichtenKlick, cadKlick, platzierenKlick, routePunkte, screenToFlowPosition, verschiebenKlick, transformKlick, lueckeKlick, dehnenKlick, eckeVerbindenKlick, versatzKlick, grenzBefehlKlick, verbindenKlick, selectedSegments, setEdges, setNodes]);

  const onPaneClick = useCallback((event) => {
    // Pan darf die Auswahl nicht anfassen (Punkt 16). Ohne diese Prüfung würde
    // ein Space-Pan die aktuelle Auswahl beim Loslassen abwählen.
    if (spacePanRef.current) return;
    if (istBefehl(editorModeRef.current, PLACE)) { platzierenKlick(event); return; }
    // Nadel-Modus: der Klick setzt die Stecknadel und öffnet den Eintrag.
    if (nadelModusRef.current) {
      event.preventDefault();
      nadelSetzen(screenToFlowPosition({ x:event.clientX, y:event.clientY }));
      return;
    }
    if (dehnenKlick(event)) return;
    if (lueckeKlick(event)) return;
    if (verschiebenKlick(event)) return;
    if (transformKlick(event)) return;
    if (eckeVerbindenKlick(event)) return;
    // Leitungen ändern (#72). Auch ein Klick daneben bleibt im Befehl und
    // meldet, dass keine Leitung getroffen wurde — er wählt nichts ab.
    if (versatzKlick(event)) return;
    if (grenzBefehlKlick(event)) return;
    if (verbindenKlick(event)) return;
    if (leitungsEntwurfRef.current) { cadKlick(event); return; }
    setEndpointMenu(null);
    setEdgeMenu(null);
    // Eine NEUE Leitung startet ausschliesslich im expliziten Zeichenmodus.
    // Ausserhalb davon deselektiert ein Pane-Klick nur — er zeichnet nie.
    if (canStartHydraulicLine(zeichenModusRef.current, false)) {
      cadKlick(event);
      return;
    }
    setSelected(null);
    setSelectedEdgeId(null);
    setSelectedEdgePoint(null);
    setSelectedEdgeSegment(null);
    setSelectedSegments([]);
    setNodes(items => items.map(item => item.selected ? { ...item, selected:false } : item));
    setEdges(items => items.map(item => item.selected ? { ...item, selected:false } : item));
    setSelectedLabelEdgeId(null);
    setMarkierteEdgeIds([]);
  }, [cadKlick, screenToFlowPosition, platzierenKlick, verschiebenKlick, transformKlick, nadelSetzen, dehnenKlick, lueckeKlick, eckeVerbindenKlick, versatzKlick, grenzBefehlKlick, verbindenKlick, setEdges, setNodes]);

  const canvasMouseMove = useCallback((event) => {
    // Platzierungsvorschau folgt dem Cursor — mit Raster und Ausrichtungslinien.
    if (istBefehl(editorModeRef.current, PLACE)) {
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      const zoom = Math.max(getZoom(), 0.2);
      const typ = paletteNodeType(editorModeRef.current?.payload?.nodeType);
      // Liegt der Cursor über einer Leitung UND darf dieses Bauteil eingesetzt
      // werden, ist der Landepunkt der Leitungstreffer — nicht der Rasterpunkt.
      const abzweig = isBranchInsertable(typ);
      const treffer = (isInlineInsertable(typ) || abzweig)
        ? naechsteSichtbareLeitung(raw, 30 / zoom)
        : null;
      if (treffer) {
        const punkt = { x:treffer.x, y:treffer.y };
        platzierVorschauRef.current = punkt;
        setPlatzierVorschau(punkt);
        setInlineTreffer({
          punkt,
          edgeId:treffer.edge.id,
          a:treffer.route[treffer.segmentIndex],
          b:treffer.route[treffer.segmentIndex + 1],
          // Abzweig statt Einsetzen: die Vorschau zeigt den Stich zum Bauteil,
          // damit vor dem Klick sichtbar ist, was entsteht (§18).
          abzweig: abzweig ? branchAnschlussPunkt(treffer, raw) : null,
        });
        setLeitungsGuides([]);
        return;
      }
      const alignment = objektAusrichtung(raw, snapAnRef.current ? objektFangpunkte : [],
        drawingConfig.snap_tolerance / zoom, drawingConfig.grid_size);
      platzierVorschauRef.current = alignment.point;
      setPlatzierVorschau(alignment.point);
      setInlineTreffer(null);
      setLeitungsGuides(alignment.guides);
      return;
    }
    // Verschieben: der Vorschaupfeil hängt am gefangenen Zielpunkt — angezeigt
    // wird exakt der Vektor, den der nächste Klick anwendet.
    if (dehnenRef.current) {
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      const aktuell = dehnenRef.current;
      const cursor = aktuell.basis
        ? constrainPoint(aktuell.basis, raw, {
          ortho:orthoAnRef.current, shift:event.shiftKey, grid:drawingConfig.grid_size })
        : rasterPunkt(raw, drawingConfig.grid_size);
      setDehnen(current => (current ? { ...current, cursor } : current));
      return;
    }
    if (verschiebungRef.current?.basis) {
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      const cursor = constrainPoint(verschiebungRef.current.basis, raw, {
        ortho:orthoAnRef.current, shift:event.shiftKey, grid:drawingConfig.grid_size,
      });
      setVerschiebung(current => (current?.basis ? { ...current, cursor } : current));
      return;
    }
    // Kopieren, Spiegeln, Drehen, Reihe: die Vorschau hängt am gefangenen
    // Punkt — gezeigt wird exakt das, was der nächste Klick anwendet.
    if (transformBefehlRef.current) {
      const befehl = transformBefehlRef.current;
      // Wartet der Befehl auf eine getippte Zahl, ist der Zielpunkt bereits
      // gesetzt — die Maus darf ihn dann nicht mehr verschieben.
      if (befehl.abstand || (befehl.art === 'spiegeln' && befehl.achse)) return;
      const raw = screenToFlowPosition({ x:event.clientX, y:event.clientY });
      const { point, marker } = befehlsFang(raw, { basis:befehl.basis, shift:event.shiftKey });
      setTransformBefehl(current => (current ? { ...current, cursor:point, marker } : current));
      return;
    }
    cadCursorAktualisieren(event);
  }, [befehlsFang, cadCursorAktualisieren, drawingConfig.grid_size, drawingConfig.snap_tolerance, getZoom,
      naechsteSichtbareLeitung, objektFangpunkte, screenToFlowPosition]);
  const onPaneContextMenu = useCallback((event) => {
    // Der Rechtsklick öffnet das Befehlsmenü (#78). Läuft ein Befehl, steht
    // dort «Abbrechen» — auch für Versatz, Stutzen, Dehnen bis Kante und
    // Verbinden (#72), denn `active` prüft den Befehlszustand allgemein.
    event.preventDefault();
    event.stopPropagation();
    // Läuft eine Mehrfachkopie, ist der Rechtsklick ihr vorgesehener Ausstieg
    // (§74) und nicht der Weg ins Kontextmenü — sonst müsste man mitten im
    // Befehl erst noch «Abbrechen» treffen.
    if (transformBefehlRef.current) { transformBeenden(); return; }
    setEndpointMenu(null); setEdgeMenu(null); setGripMenu(null);
    setPaneMenu({
      x:event.clientX, y:event.clientY,
      active:!istModify(editorModeRef.current),
      snapOverride:Boolean(event.shiftKey),
      mode:{ ...editorModeRef.current },
    });
  }, [transformBeenden]);
  // Ist überhaupt etwas gewählt? Dieselbe Frage stellen inzwischen sechs
  // Werkzeuge — einmal beantwortet statt sechsmal dieselbe lange Bedingung.
  const hatAuswahl = Boolean(selected) || Boolean(selectedEdgeId)
    || selectedSegments.length > 0 || markierteEdgeIds.length > 0
    || nodes.some(node => node.selected) || edges.some(edge => edge.selected);
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
    const incident = edgesRef.current.filter(edge => edge.source === id || edge.target === id);

    // §6 — Inline-Reconnect: genau ZWEI hydraulische Nachbarn auf demselben Layer
    // → die beiden Leitungen wieder zu EINER verschmelzen (A ─ P ─ B → A ─── B),
    // der Bauteilort bleibt als Stützpunkt erhalten. Nur bei eindeutiger Topologie;
    // bei Abzweigungen oder gemischten Layern wird nichts geraten (dann Standard-
    // Löschen aller inzidenten Leitungen).
    let mergedEdge = null;
    if (incident.length === 2) {
      const [e1, e2] = incident;
      const gleicherLayer = e1.data?.layer_id && e1.data.layer_id === e2.data?.layer_id;
      const beideFlow = e1.type === 'flow' && e2.type === 'flow';
      const keinePaarung = !e1.data?.auto_paired && !e2.data?.auto_paired;
      if (gleicherLayer && beideFlow && keinePaarung) {
        const rc = reconnectThroughNode(e1, e2, id, routePunkte);
        if (rc) {
          const len1 = Number.parseFloat(e1.data?.laenge_m);
          const len2 = Number.parseFloat(e2.data?.laenge_m);
          const laenge = Number.isFinite(len1) && Number.isFinite(len2)
            ? { laenge_m:Number((len1 + len2).toFixed(2)) } : {};
          const data = { ...(e1.data || {}), cad_polyline:true, points:rc.points, ...laenge };
          delete data.paired_edge_id;
          delete data.auto_paired;
          delete data.auto_pair_open;
          mergedEdge = {
            ...e1, id:newId(), selected:false,
            source:rc.source, sourceHandle:rc.sourceHandle,
            target:rc.target, targetHandle:rc.targetHandle,
            data,
          };
        }
      }
    }

    const remaining = edgesRef.current.filter(edge => edge.source !== id && edge.target !== id);
    const withMerged = mergedEdge ? [...remaining, mergedEdge] : remaining;
    const usedNodes = new Set(withMerged.flatMap(edge => [edge.source, edge.target]));
    setNodes(ns => ns.filter(node => node.id !== id && (node.type !== 'junction' || usedNodes.has(node.id))));
    setEdges(withMerged);
    setSelected(null);
  };
  deleteEdgeRef.current = deleteEdge;
  deleteNodeRef.current = deleteNode;

  const revisionenLaden = async () => {
    if (!schemaId) return;
    setRevisionenLoading(true);
    setStandFehler('');
    try {
      setRevisionen(await listSchemaRevisions(schemaId));
    } catch {
      setStandFehler('Die gespeicherten Stände konnten nicht geladen werden.');
    } finally {
      setRevisionenLoading(false);
    }
  };

  const revisionenOeffnen = async () => {
    setRevisionenOpen(true);
    await revisionenLaden();
  };

  const standSpeichern = async (event) => {
    event?.preventDefault();
    if (!schemaId || standSaving) return;
    setStandSaving(true);
    setStandFehler('');
    try {
      const graph = graphFuerSpeicherung(
        nodes,
        edges,
        { active_layer_id:activeLayerId, visibility:layerVisibility },
        drawingConfig,
      );
      const revision = await createSchemaRevision(schemaId, {
        bezeichnung:standBezeichnung.trim() || null,
        notiz:standNotiz.trim() || null,
        schema_name:schemaName,
        graph,
      });
      setRevisionen(items => [revision, ...items.filter(item => item.id !== revision.id)]);
      setStandBezeichnung('');
      setStandNotiz('');
      setStandDialogOpen(false);
      setSaveState('saved');
    } catch {
      setStandFehler('Der Stand konnte nicht gespeichert werden. Bitte nochmals versuchen.');
    } finally {
      setStandSaving(false);
    }
  };

  const standWiederherstellen = async (revision) => {
    if (!schemaId || restoreId) return;
    const label = revision.bezeichnung || `Stand ${revision.version_nr}`;
    if (!window.confirm(`${label} als aktuellen Arbeitsstand laden? Der jetzige Arbeitsstand bleibt nur erhalten, wenn du ihn vorher als Stand speicherst.`)) return;
    setRestoreId(revision.id);
    setStandFehler('');
    try {
      const schema = await restoreSchemaRevision(schemaId, revision.id);
      editorGraphAnwenden(schema.graph);
      setSchemaName(schema.name || 'Schema');
      setRevisionenOpen(false);
      setSaveState('saved');
    } catch {
      setStandFehler('Der gewählte Stand konnte nicht wiederhergestellt werden.');
    } finally {
      setRestoreId(null);
    }
  };

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
          <button onClick={redo} className="hc-icon-button" title="Wiederherstellen (⌘/Ctrl + Shift + Z)">
            <Redo2 size={17} />
          </button>
          {/* Speichern und Nachschauen sind eine Sache: ein Knopf, zwei Wege.
              Der laufende Stand wird ohnehin automatisch gespeichert — dafür
              steht die Anzeige links. */}
          <ToolbarMenu label="Stände" icon={SaveIcon}>
            <button disabled={!schemaId}
              onClick={event=>{ setStandFehler(''); setStandDialogOpen(true); closeToolbarMenu(event); }}
              style={{ ...menuActionStyle, opacity:schemaId ? 1 : .45 }}>
              <SaveIcon size={14} /> Stand speichern …
            </button>
            <button disabled={!schemaId}
              onClick={event=>{ revisionenOeffnen(); closeToolbarMenu(event); }}
              style={{ ...menuActionStyle, opacity:schemaId ? 1 : .45 }}>
              <History size={14} /> Gespeicherte Stände und Änderungen
            </button>
          </ToolbarMenu>
          <ToolbarMenu label={exportState === 'loading' ? 'PDF wird erstellt …' : 'Exportieren'} icon={Download} primary align="right">
            {[['schema','Schema als PDF'],['berechnungen','Berechnungen als PDF'],['beides','Schema + Berechnungen']].map(([key,text])=>(
              <button key={key} disabled={!schemaId || exportState === 'loading'} onClick={event=>{ downloadPdf(key); closeToolbarMenu(event); }}
                style={{ ...menuActionStyle, opacity:schemaId && exportState !== 'loading' ? 1 : .45 }}>
                <Download size={14} /> {text}
              </button>
            ))}
          </ToolbarMenu>
        </div>
      </header>

      <nav className="hc-editor-toolbar" aria-label="Schema-Werkzeuge">
        <div className={`hc-drawing-state${istGrundzustand ? '' : ' is-active'}`}
          title={istGrundzustand
            ? 'Grundzustand: auswählen und bearbeiten. L startet den Leitungsbefehl.'
            : 'Befehl aktiv — Esc führt zurück in den Grundzustand.'}>
          <span className="hc-drawing-state__icon">{istGrundzustand ? <Check size={13} /> : '⌁'}</span>
          <span>{istGrundzustand
            ? 'Modify — auswählen'
            : leitungsEntwurf ? 'Leitung wird gezeichnet' : `${modeLabel(editorMode)} — Klick setzt Punkt`}</span>
        </div>

        <ToolbarMenu label="Vorlagen" icon={LayoutTemplate} badge={vorlagen.length}>
          {/* Eigene Vorlagen zuerst: sie sind die Standardschaltungen der Firma
              und werden häufiger gebraucht als die mitgelieferten Beispiele. */}
          {vorlagen.length > 0 && (
            <div style={{ padding:'2px 8px 4px', fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Unsere Vorlagen
            </div>
          )}
          {vorlagen.map(vorlage => (
            <div key={vorlage.id} style={{ display:'flex', alignItems:'center', gap:2 }}>
              <button onClick={event=>{ vorlageAnwenden(vorlage.id); closeToolbarMenu(event); }}
                style={{ ...menuActionStyle, flex:1 }}
                title={vorlage.beschreibung || `${vorlage.node_count} Bauteile · ${vorlage.edge_count} Leitungen`}>
                <LayoutTemplate size={14} /> {vorlage.name}
              </button>
              <button onClick={()=>vorlageEntfernen(vorlage.id)} title="Vorlage löschen"
                style={{ ...menuActionStyle, width:26, padding:0, justifyContent:'center', color:'#94a3b8' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button onClick={event=>{ setVorlageFehler(''); setVorlageDialogOpen(true); closeToolbarMenu(event); }}
            disabled={!nodes.length}
            style={{ ...menuActionStyle, color:'#4f46e5', opacity:nodes.length ? 1 : .45,
              borderTop:'1px solid #f1f5f9', paddingTop:8, marginTop:2 }}>
            <SaveIcon size={14} /> Dieses Schema als Vorlage speichern …
          </button>
          <div style={{ padding:'8px 8px 2px', fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', borderTop:'1px solid #f1f5f9', marginTop:4 }}>
            Beispielschaltungen
          </div>
          {Object.entries(SCHALTUNGEN).map(([key, schema])=>(
            <button key={key} onClick={event=>{ loadSchema(key); closeToolbarMenu(event); }} style={menuActionStyle}>
              <LayoutTemplate size={14} /> {schema.name}
            </button>
          ))}
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
          <button onClick={event=>{ setShowUnderlayPanel(value=>!value); closeToolbarMenu(event); }} style={menuActionStyle}>
            <ImageIcon size={14} /> {showUnderlayPanel ? 'Plan-Underlay schliessen' : 'Plan-Underlay …'}
          </button>
        </ToolbarMenu>

        <ToolbarMenu label="Einstellungen" icon={Settings2}>
          <div style={{ width:270, padding:6 }}>
            <label style={{ display:'grid', gridTemplateColumns:'88px 1fr 42px', alignItems:'center', gap:7, marginBottom:10, fontSize:10, color:'#475569' }}>
              Bogenradius
              <input type="range" min="0" max="40" step="1" value={drawingConfig.corner_radius} onChange={event=>drawingConfigAktualisieren('corner_radius', event.target.value)} />
              <input type="number" min="0" max="40" value={drawingConfig.corner_radius} onChange={event=>drawingConfigAktualisieren('corner_radius', event.target.value)} style={{ width:42, border:'1px solid #cbd5e1', borderRadius:5, padding:3, fontSize:10 }}/>
            </label>
            {/* mm-Raster und Auto-Rücklauf standen hier ein zweites Mal — sie
                liegen in der Statusleiste bzw. neben der Layerwahl, also dort,
                wo man sie beim Zeichnen braucht. */}
            <label style={{ display:'grid', gridTemplateColumns:'88px 1fr', alignItems:'center', gap:7, marginBottom:10, fontSize:10, color:'#475569' }}>
              Fangtoleranz
              <select value={drawingConfig.snap_tolerance} onChange={event=>drawingConfigAktualisieren('snap_tolerance', event.target.value)} style={{ border:'1px solid #cbd5e1', borderRadius:5, padding:4, background:'white', fontSize:10 }}>
                {TOLERANZ_OPTIONEN.map(mm => <option key={mm} value={mm}>{mm} mm{mm === 4 ? ' · exakt' : mm === 20 ? ' · grosszügig' : ''}</option>)}
              </select>
            </label>
            {/* Die Tastenbelegung ist persönlich und liegt darum nicht mehr
                hier, sondern hinter dem Zahnrad — sie gehört dem Planer, nicht
                dem Schema. */}
            <button onClick={event=>{ setShortcutDialogOpen(true); closeToolbarMenu(event); }}
              style={{ ...menuActionStyle, paddingLeft:0, borderTop:'1px solid #f1f5f9', paddingTop:8, marginTop:2 }}>
              <Settings size={14} /> Meine Tastenbelegung …
            </button>
            <button onClick={event=>{
              setDrawingConfig({ ...DEFAULT_DRAWING_CONFIG, ...eigeneShortcutsRef.current });
              setOrthoAn(DEFAULT_DRAWING_CONFIG.ortho);
              setSnapAn(DEFAULT_DRAWING_CONFIG.object_snap);
              setEdges(items => items.map(edge => ({ ...edge, data:{ ...(edge.data || {}), corner_radius:DEFAULT_DRAWING_CONFIG.corner_radius } })));
              closeToolbarMenu(event);
            }} style={{ ...menuActionStyle, marginTop:2, paddingLeft:0, color:'#4f46e5' }}>
              Zeichnung auf Standard zurücksetzen
            </button>
          </div>
        </ToolbarMenu>

        {/* Zahnrad: benutzerdefinierte Einstellungen, pro Benutzer gespeichert. */}
        <button onClick={()=>setShortcutDialogOpen(true)} className="hc-icon-button"
          title="Benutzerdefinierte Einstellungen — meine Tastenbelegung">
          <Settings size={16} />
        </button>

        <button onClick={()=>{ setShowWarnungen(value=>!value); setShowLegende(false); }}
          className={`hc-warning-button${alleWarnungen.length ? ' has-warnings' : ''}`}>
          <AlertTriangle size={14} />
          <span>{alleWarnungen.length ? `${alleWarnungen.length} Warnungen` : 'Keine Warnungen'}</span>
        </button>

        {/* Die Werkzeuge stehen nicht mehr hier, sondern in der senkrechten
            Leiste am Canvasrand (`hc-toolrail`). In der Kopfzeile bleibt, was
            das Projekt betrifft: Vorlagen, Ansicht, Einstellungen, Warnungen,
            Layer. */}
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
          {paletteOpen && <div className="hc-palette-body">{PALETTE_GRUPPEN.map(group=>{
            const open = paletteGroupsOpen[group.titel] === true;
            return <div key={group.titel} className="hc-palette-group">
              <button onClick={()=>setPaletteGroupsOpen(current=>({ ...current, [group.titel]:!open }))}
                className={`hc-palette-group__trigger${open ? ' is-open' : ''}`}>
                {group.titel}<ChevronDown size={14} />
              </button>
              {open && <div className="hc-palette-group__items">
                {group.items.map(item=>{ const kennung = item.paletteId || item.type; return <div key={kennung} draggable
                  onDragStart={event=>{ event.dataTransfer.setData('application/reactflow',kennung); event.dataTransfer.effectAllowed='move'; }}
                  onClick={event=>platzierenStarten(kennung, { persistent:event.shiftKey })}
                  title={`${item.label} — klicken, dann auf die Zeichenfläche klicken. Shift-Klick: mehrere setzen.`}
                  className={`hc-palette-item${platzierTyp === kennung ? ' is-armed' : ''}`}>
                  <span className="hc-palette-item__grip">⠿</span>
                  <span>
                    <strong>{item.label}</strong>
                    {item.desc && <small>{item.desc}</small>}
                  </span>
                </div>;})}
              </div>}
            </div>;
          })}</div>}
          {!paletteOpen && <button onClick={()=>setPaletteOpen(true)} title="Bauteilpalette öffnen" className="hc-collapsed-label">Bauteile</button>}
        </aside>

        {/* Canvas */}
        <main className="hc-canvas-wrap" onPointerDownCapture={cadHandlePointerDown}
          onPointerMove={canvasMouseMove} onDoubleClick={canvasDoppelklick}>
          {/* ── Werkzeugleiste am Canvasrand ────────────────────────────────
              Alle Zeichenbefehle an einer Stelle, senkrecht, nur Symbole. Vier
              davon (Drehen, Spiegeln, Ausrichten, Trennen, Dehnen) gab es
              bisher nur als Taste — wer sie nicht auswendig kannte, wusste
              nicht, dass es sie gibt. Der aktive Befehl ist hervorgehoben, die
              Taste steht im Tooltip, und ein Werkzeug ohne passende Auswahl ist
              abgeblendet statt still wirkungslos. */}
          <div className="hc-toolrail" role="toolbar" aria-label="Werkzeuge">
            {[
              { id:'leitung', Icon:Spline, name:'Leitung zeichnen',
                taste:drawingConfig.shortcut_line,
                hinweis:'Nochmal klicken hält den Befehl nach jeder Leitung aktiv.',
                aktiv:zeichenModus, dauer:dauerLeitung, aktion:leitungBefehl },
              { id:'verschieben', Icon:Move, name:'Verschieben',
                taste:drawingConfig.shortcut_move,
                hinweis:'Auswahl treffen, Startpunkt und Zielpunkt klicken. Shift verschiebt die ganze Leitung.',
                aktiv:Boolean(verschiebung),
                gesperrt:!verschiebung && !selected && !selectedEdgeId && !markierteEdgeIds.length,
                aktion:() => (verschiebung
                  ? (setVerschiebung(null), setEditorMode(escapeMode(editorModeRef.current)))
                  : verschiebenStarten(false)) },
              { id:'drehen', Icon:RotateCw, name:'Bauteil drehen',
                taste:drawingConfig.shortcut_rotate,
                hinweis:'Dreht das gewählte Bauteil um 90°.',
                gesperrt:!selected || !ROTATABLE.has(selected.type),
                aktion:() => selected && rotateNode(selected.id) },
              { id:'spiegeln', Icon:FlipHorizontal2, name:'Bauteil spiegeln',
                taste:drawingConfig.shortcut_mirror,
                hinweis:'Spiegelt das gewählte Bauteil waagrecht.',
                gesperrt:!selected || !ROTATABLE.has(selected.type),
                aktion:() => selected && mirrorNode(selected.id) },
              // ── Modify-Befehle mit Basispunkt (§74) ───────────────────────
              { id:'kopieren-basis', Icon:CopyPlus, name:'Kopieren (Basispunkt)', taste:'C',
                hinweis:'Auswahl treffen, Basispunkt und Zielpunkt klicken. Bleibt aktiv: jeder weitere Klick legt eine Kopie ab, ESC oder Rechtsklick beendet.',
                aktiv:transformBefehl?.art === 'kopieren',
                gesperrt:!transformBefehl && !hatAuswahl,
                dauer:true,
                aktion:() => (transformBefehl?.art === 'kopieren' ? transformBeenden() : transformStarten('kopieren')) },
              { id:'spiegeln-achse', Icon:FlipHorizontal2, name:'An Achse spiegeln', taste:'⇧S',
                hinweis:'Zwei Achspunkte klicken; am Schluss die Frage, ob das Original bleibt. Wirkt auf ganze Leitungen und Bauteile.',
                aktiv:transformBefehl?.art === 'spiegeln',
                gesperrt:!transformBefehl && !hatAuswahl,
                aktion:() => (transformBefehl?.art === 'spiegeln' ? transformBeenden() : transformStarten('spiegeln')) },
              { id:'drehen-basis', Icon:RotateCcw, name:'Drehen (Basispunkt)', taste:'⇧D',
                hinweis:'Basispunkt klicken, dann den Winkel mit der Maus zeigen oder eintippen.',
                aktiv:transformBefehl?.art === 'drehen',
                gesperrt:!transformBefehl && !hatAuswahl,
                aktion:() => (transformBefehl?.art === 'drehen' ? transformBeenden() : transformStarten('drehen')) },
              { id:'reihe', Icon:Grid2x2, name:'Lineare Reihe', taste:'⇧E',
                hinweis:'Basispunkt und Zielpunkt geben den Abstand, danach die Anzahl eintippen (Original zählt mit). Ohne Shift gehört E dem Dehnen bis Kante.',
                aktiv:transformBefehl?.art === 'reihe',
                gesperrt:!transformBefehl && !hatAuswahl,
                aktion:() => (transformBefehl?.art === 'reihe' ? transformBeenden() : transformStarten('reihe')) },
              { id:'ausrichten', Icon:AlignHorizontalJustifyCenter, name:'Ausrichten',
                taste:drawingConfig.shortcut_align,
                hinweis:'Referenzsegment wählen, dann das Segment, das auf dieselbe Flucht soll.',
                aktiv:istBefehl(editorMode, ALIGN), aktion:ausrichtenUmschalten },
              { id:'trennen', Icon:Scissors, name:'Mit Lücke trennen',
                taste:drawingConfig.shortcut_break,
                hinweis:'Zwei Punkte auf der Leitung; das Stück dazwischen fällt weg. Trennt auch die hydraulische Verbindung.',
                aktiv:Boolean(luecke), gesperrt:!selectedEdgeId && !luecke, aktion:trennenStarten },
              { id:'ecke-verbinden', Icon:CornerDownRight, name:'Ecke verbinden', taste:'TR',
                hinweis:'Zwei Leitungs-Teilstücke wählen; ihre freien Enden werden bis zur gemeinsamen Ecke verlängert oder gekürzt.',
                aktiv:istBefehl(editorMode, CONNECT_CORNER), dauer:true, aktion:eckeVerbindenStarten },
              // ── Leitungen ändern (#72) ───────────────────────────────────
              { id:'versatz', Icon:CopyPlus, name:'Versatz',
                taste:drawingConfig.shortcut_offset,
                hinweis:'Auf die Leitung klicken, auf der Seite, wo die parallele Kopie hin soll. Ziffern ändern den Abstand; Vorgabe ist der Rücklauf-Layer zum Vorlauf, Shift nimmt den aktiven Layer.',
                aktiv:istBefehl(editorMode, OFFSET), dauer:true, aktion:versatzStarten },
              { id:'stutzen', Icon:Slice, name:'Stutzen',
                taste:drawingConfig.shortcut_trim,
                hinweis:'Erst die Begrenzungsleitung, dann auf das Stück klicken, das weg soll. Shift schaltet auf Dehnen um.',
                aktiv:istBefehl(editorMode, TRIM), dauer:true, aktion:() => grenzBefehlStarten(false) },
              { id:'dehnen-kante', Icon:MoveRight, name:'Dehnen bis Kante',
                taste:drawingConfig.shortcut_extend,
                hinweis:'Erst die Begrenzungsleitung, dann das Leitungsende, das bis dorthin verlängert wird. Shift schaltet auf Stutzen um.',
                aktiv:istBefehl(editorMode, EXTEND), dauer:true, aktion:() => grenzBefehlStarten(true) },
              { id:'verbinden', Icon:Link2, name:'Verbinden',
                taste:drawingConfig.shortcut_join,
                hinweis:'Zwei aneinanderstossende Teilstücke werden eine Leitung; der Anker dazwischen verschwindet.',
                aktiv:istBefehl(editorMode, JOIN), dauer:true, aktion:verbindenStarten },
              { id:'kopieren', Icon:Copy, name:'Auswahl kopieren', taste:'⌘C',
                hinweis:'Kopiert alle gewählten Bauteile, Leitungen und Teilstücke in die Zwischenablage.',
                gesperrt:!hatAuswahl, aktion:auswahlKopieren },
              { id:'auswahl-loeschen', Icon:Trash2, name:'Auswahl löschen', taste:'DEL',
                hinweis:'Löscht alle gewählten Bauteile, Leitungen und Teilstücke in einer Aktion.',
                gesperrt:!hatAuswahl, aktion:auswahlLoeschen },
              { id:'dehnen', Icon:MoveHorizontal, name:'Dehnen',
                taste:drawingConfig.shortcut_stretch,
                hinweis:'Fenster aufziehen, Basispunkt, Zielpunkt. Was im Fenster liegt, wandert mit.',
                aktiv:Boolean(dehnen), aktion:dehnenStarten },
              { id:'bloecke-sicht', Icon:alleBloeckeVersteckt ? EyeOff : Eye,
                name:alleBloeckeVersteckt ? 'Alle Datenblöcke einblenden' : 'Alle Datenblöcke ausblenden',
                hinweis:'Blendet die Beschriftungsblöcke aller Bauteile gemeinsam ein oder aus. Ein einzelner Block lässt sich im Bauteilpanel schalten.',
                aktiv:alleBloeckeVersteckt,
                gesperrt:!nodes.some(node => node.data?.nr != null),
                aktion:() => alleBloeckeSetzen(!alleBloeckeVersteckt) },
              { id:'neu-nummerieren', Icon:ListOrdered, name:'Neu nummerieren',
                hinweis:'Vergibt alle Bauteilnummern in Leserichtung neu — oben nach unten, links nach rechts. Fragt vorher nach und ist ein einziger Undo-Schritt.',
                aktiv:Boolean(neuNummerieren),
                gesperrt:!nodes.some(node => NUMMERIERT.includes(node.type)),
                aktion:() => (neuNummerieren ? setNeuNummerieren(null) : neuNummerierenFragen()) },
              { id:'notiz', Icon:MapPin, name:'Notiz-Stecknadel',
                hinweis:'Danach auf die Stelle im Schema klicken. Der Eintrag landet im Projektjournal.',
                aktiv:nadelModus, gesperrt:!schemaId, marke:notizen.length,
                aktion:() => setNadelModus(value => !value) },
            ].map(werkzeug => (
              <button key={werkzeug.id} type="button" onClick={werkzeug.aktion}
                disabled={werkzeug.gesperrt}
                aria-pressed={Boolean(werkzeug.aktiv)}
                data-werkzeug={werkzeug.id}
                className={`hc-toolrail__button${werkzeug.aktiv ? ' is-active' : ''}${werkzeug.dauer ? ' is-persistent' : ''}`}
                title={`${werkzeug.name}${werkzeug.taste ? ` (Taste ${String(werkzeug.taste).toUpperCase()})` : ''}\n${werkzeug.hinweis}`}>
                <werkzeug.Icon size={17} />
                {werkzeug.taste && <span className="hc-toolrail__key">{String(werkzeug.taste).toUpperCase()}</span>}
                {werkzeug.marke > 0 && <span className="hc-toolrail__badge">{werkzeug.marke}</span>}
              </button>
            ))}
          </div>
          <ReactFlow
            nodes={displayNodes} edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={connectionLineRenderer}
            connectionLineStyle={{ stroke:activeLayer.color, strokeWidth:2.5 }}
            paneClickDistance={6}
            nodeClickDistance={6}
            snapToGrid snapGrid={[drawingConfig.grid_size,drawingConfig.grid_size]}
            nodesDraggable={istGrundzustand}
            nodesConnectable={false}
            // Punkt 16 — CAD-Maus: mittlere Taste ist IMMER Pan, Space+links ist
            // temporäres Pan. Vorher waren `panOnDrag` (links = schieben) und
            // `selectionOnDrag` (links = Auswahlrechteck) gleichzeitig aktiv; was
            // die linke Taste tat, war damit nicht vorhersehbar.
            panOnDrag={spacePan ? [0, 1] : [1]}
            // Auswahlrechteck nur im Grundzustand und nur ohne Space — während
            // Zeichnen, Platzieren oder Pan darf kein Rechteck aufziehen.
            selectionOnDrag={istGrundzustand && !spacePan}
            selectionMode={selectionMode}
            selectionKeyCode={null}
            multiSelectionKeyCode={['Meta', 'Control']}
            // Löschen macht der Editor selbst (mit Undo-Schnappschuss und
            // Aufräumen der Anker). React Flow soll NICHT zusätzlich löschen.
            deleteKeyCode={null}
            // Mausrad zoomt auf die Cursorposition (React-Flow-Standard); das
            // Zoomen per Doppelklick ist im CAD unerwartet und bleibt aus.
            zoomOnDoubleClick={false}
            defaultEdgeOptions={{ type:'flow', style:{ strokeWidth:2.5 } }}
            // Weiter reinzoomen können, damit das Schema gross und detailliert
            // dargestellt werden kann; für grosse Anlagen auch weiter raus.
            minZoom={0.2}
            maxZoom={4}
            className={`hc-hydraulik-flow${spacePan ? ' hc-flow--pan' : istGrundzustand ? '' : ' hc-flow--draw'}`
              + ((zeichenModus || leitungsEntwurf) ? ' hc-flow--pipe' : '')}
          >
            {/* CAD-Optik (§ Editor #4): Millimeterpapier — feine Minor-Punkte am
                Raster (bleiben beim Rauszoomen ruhig) plus kräftigere Major-Linien
                alle 5 Rastereinheiten für die Orientierung. Standardmässig aus:
                beurteilt wird das Schema auf leerem Grund, so wie es im PDF
                steht. Der Rasterfang läuft unabhängig davon weiter. */}
            {drawingConfig.raster_sichtbar && (
              <>
                <Background id="hc-minor" variant={BackgroundVariant.Dots} gap={drawingConfig.grid_size}
                  size={1} color="#cbd5e1"/>
                <Background id="hc-major" variant={BackgroundVariant.Lines} gap={drawingConfig.grid_size * 5}
                  color="#dbe3ec" lineWidth={1}/>
              </>
            )}
            {/* Underlay (§ Editor #5): unter Bauteilen/Leitungen, über dem Raster.
                Interaktiv (ziehbar) nur wenn entsperrt und nicht im Zeichenmodus —
                sonst rein visuell, damit es das Zeichnen nie blockiert. */}
            {underlay && (
              <ViewportPortal>
                <img src={underlay.data} alt="" draggable={false} className="hc-underlay"
                  onPointerDown={underlayDragStart}
                  style={{
                    position:'absolute', left:underlay.x, top:underlay.y,
                    width:underlay.w * underlay.scale, height:underlay.h * underlay.scale,
                    opacity:underlay.opacity, zIndex:-1, userSelect:'none',
                    pointerEvents:(!underlay.locked && !zeichenModus && !leitungsEntwurf) ? 'auto' : 'none',
                    cursor:(!underlay.locked && !zeichenModus && !leitungsEntwurf) ? 'move' : 'default',
                    outline:(!underlay.locked && !zeichenModus && !leitungsEntwurf) ? '1px dashed #6366f1' : 'none',
                  }} />
              </ViewportPortal>
            )}
            <Controls/>
            {showMiniMap && <MiniMap zoomable pannable nodeStrokeWidth={3}/>}
            {istBefehl(editorMode, ALIGN) && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:ausrichtenHinweis ? '#b91c1c' : '#0f766e', color:'white', fontSize:10, fontWeight:700,
                  boxShadow:'0 6px 16px rgba(15,118,110,.28)' }}>
                  {ausrichtenHinweis
                    || (editorMode.payload
                      ? 'Ausrichten · Segment zum Ausrichten wählen'
                      : 'Ausrichten · Referenzsegment wählen')}
                </div>
              </Panel>
            )}
            {(luecke || dehnen || befehlHinweis) && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:befehlHinweis ? '#b91c1c' : '#0f766e', color:'white', fontSize:10, fontWeight:700,
                  boxShadow:'0 6px 16px rgba(15,118,110,.28)' }}>
                  {befehlHinweis
                    || (luecke && (luecke.erster
                      ? 'Mit Lücke trennen · zweiten Punkt auf der Leitung klicken (trennt die hydraulische Verbindung)'
                      : 'Mit Lücke trennen · ersten Punkt auf der Leitung klicken'))
                    || (dehnen && (!dehnen.ecke1 ? 'Dehnen · erste Fensterecke klicken'
                      : !dehnen.ecke2 ? 'Dehnen · zweite Fensterecke klicken'
                      : !dehnen.basis ? 'Dehnen · Basispunkt klicken'
                      : 'Dehnen · Zielpunkt klicken (Shift kehrt den Fang um)'))}
                </div>
              </Panel>
            )}
            {verschiebung && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:'#5b21b6', color:'white', fontSize:10, fontWeight:700, boxShadow:'0 6px 16px rgba(91,33,182,.28)' }}>
                  {verschiebung.basis
                    ? `Verschieben · ${verschiebung.ziele.beschreibung} — Zielpunkt klicken (Shift kehrt den Fang um)`
                    : `Verschieben · ${verschiebung.ziele.beschreibung} — Startpunkt klicken`}
                </div>
              </Panel>
            )}
            {/* Kopieren, Spiegeln, Drehen, Reihe (§74): der Ablauf steht immer
                da, damit niemand raten muss, welcher Klick als Nächstes kommt.
                Die Spiegelfrage ist der einzige Schritt mit Knöpfen — sie ist
                eine Entscheidung, kein Punkt auf der Zeichenfläche. */}
            {/* Neu nummerieren (§83): erst die Rückfrage, dann die Aktion. Die
                Nummer steht auch in bereits exportierten Plänen — sie darf
                nicht auf einen Knopfdruck ohne Bestätigung wandern. */}
            {neuNummerieren && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:'#5b21b6', color:'white', fontSize:10, fontWeight:700, boxShadow:'0 6px 16px rgba(91,33,182,.28)' }}>
                  <span>
                    {neuNummerieren.aenderungen === 0
                      ? `Neu nummerieren · ${neuNummerieren.gesamt} Bauteile stehen bereits in Leserichtung`
                      : `Neu nummerieren · ${neuNummerieren.aenderungen} von ${neuNummerieren.gesamt} Bauteilen bekommen eine andere Nummer`}
                  </span>
                  <span style={{ display:'flex', gap:6 }}>
                    <button type="button" data-werkzeug="neu-nummerieren-ausfuehren"
                      onClick={() => { neuNummerierenAnwenden(); setNeuNummerieren(null); }}
                      disabled={neuNummerieren.aenderungen === 0}
                      style={{ background:'white', color:'#5b21b6', border:'none', borderRadius:12,
                        padding:'3px 10px', fontSize:10, fontWeight:700,
                        cursor:neuNummerieren.aenderungen === 0 ? 'default' : 'pointer',
                        opacity:neuNummerieren.aenderungen === 0 ? 0.5 : 1 }}>
                      Ausführen
                    </button>
                    <button type="button" onClick={() => setNeuNummerieren(null)}
                      style={{ background:'rgba(255,255,255,.18)', color:'white', border:'1px solid rgba(255,255,255,.5)',
                        borderRadius:12, padding:'3px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                      Abbrechen
                    </button>
                  </span>
                </div>
              </Panel>
            )}
            {transformBefehl && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:'#5b21b6', color:'white', fontSize:10, fontWeight:700, boxShadow:'0 6px 16px rgba(91,33,182,.28)' }}>
                  <span>
                    {transformBefehl.art === 'kopieren' && (transformBefehl.basis
                      ? `Kopieren · ${transformBefehl.beschreibung} — Zielpunkt klicken · weitere Klicks = weitere Kopien · ESC oder Rechtsklick beendet`
                      : `Kopieren · ${transformBefehl.beschreibung} — Basispunkt klicken`)}
                    {transformBefehl.art === 'spiegeln' && (!transformBefehl.basis
                      ? `Spiegeln · ${transformBefehl.beschreibung} — ersten Achspunkt klicken`
                      : !transformBefehl.achse
                        ? 'Spiegeln · zweiten Achspunkt klicken'
                        : 'Spiegeln · Original behalten?')}
                    {transformBefehl.art === 'drehen' && (!transformBefehl.basis
                      ? `Drehen · ${transformBefehl.beschreibung} — Basispunkt klicken`
                      : transformBefehl.puffer !== null
                        ? `Drehen · Winkel ${transformBefehl.puffer}° · Enter übernimmt`
                        : 'Drehen · Winkel mit der Maus zeigen und klicken — oder eintippen')}
                    {transformBefehl.art === 'reihe' && (!transformBefehl.basis
                      ? `Reihe · ${transformBefehl.beschreibung} — Basispunkt klicken`
                      : !transformBefehl.abstand
                        ? 'Reihe · Zielpunkt der ersten Kopie klicken (das ist der Abstand)'
                        : `Reihe · Anzahl ${transformBefehl.puffer || ''} (mit Original) · Enter übernimmt`)}
                  </span>
                  {transformBefehl.art === 'spiegeln' && transformBefehl.achse && (
                    <span style={{ display:'flex', gap:6 }}>
                      <button type="button" onClick={() => spiegelnAnwenden(transformBefehl, true)}
                        style={{ background:'white', color:'#5b21b6', border:'none', borderRadius:12,
                          padding:'3px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        Behalten (J)
                      </button>
                      <button type="button" onClick={() => spiegelnAnwenden(transformBefehl, false)}
                        style={{ background:'rgba(255,255,255,.18)', color:'white', border:'1px solid rgba(255,255,255,.5)',
                          borderRadius:12, padding:'3px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        Ersetzen (N)
                      </button>
                    </span>
                  )}
                </div>
              </Panel>
            )}
            {segmentVerschiebung?.active && (
              <Panel position="top-center">
                <div style={{ marginTop:46, padding:'7px 12px', borderRadius:18, background:'#5b21b6', color:'white', fontSize:10, fontWeight:700, boxShadow:'0 6px 16px rgba(91,33,182,.25)' }}>
                  Teilstück {segmentVerschiebung.segmentIndex + 1} · Δ {verschiebungLabel(segmentVerschiebung.delta)}
                </div>
              </Panel>
            )}
            {leitungsEntwurf && (
              <Panel position="top-center">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, padding:'7px 12px', borderRadius:18,
                  background:'#4f46e5', color:'white', fontSize:10, fontWeight:700, boxShadow:'0 6px 16px rgba(79,70,229,.28)' }}>
                  {leitungsSnap?.fangArt === 'port'
                    ? 'Am Bauteil einrasten'
                    : leitungsSnap?.fangArt === 'endpoint'
                      ? 'An Leitungsende anschliessen'
                    : leitungsSnap?.type === 'corner'
                      ? 'T-Stück am Eckpunkt erstellen'
                    : ['line', 'midpoint'].includes(leitungsSnap?.type)
                      ? 'T-Verbindung erstellen'
                      : leitungsEntwurf.extendEdgeId
                        ? 'Linie weiterziehen · Klick = neuer Eckpunkt · Doppelklick = fertig · Esc = abbrechen'
                        : 'Leitung zeichnen · Klick = Eckpunkt · Doppelklick = fertig · Esc = abbrechen'}
                  <button onClick={entwurfAmLetztenPunktAbschliessen}
                    disabled={!leitungsEntwurf.points?.length}
                    style={{ width:22, height:22, borderRadius:11, border:0, background:'rgba(255,255,255,.2)', color:'white', cursor:'pointer', fontWeight:800 }}
                    title="Am letzten Eckpunkt abschliessen (Doppelklick)">✓</button>
                </div>
              </Panel>
            )}
            <ViewportPortal>
              <svg width="1" height="1" style={{ position:'absolute', left:0, top:0, overflow:'visible', pointerEvents:'none' }}>
                {cadEntwurfRoute.length >= 2 && (
                  <path d={roundedPolylinePath(cadEntwurfRoute, drawingConfig.corner_radius)} fill="none"
                    stroke={(LEITUNGS_LAYER.find(layer => layer.id === leitungsEntwurf?.layerId) || activeLayer).color}
                    strokeWidth="2.5" strokeDasharray="12 7" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {leitungsGuides.map((guide, index) => (
                  <g key={`guide-${index}`}>
                    <line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2}
                      stroke="#22c55e" strokeWidth="1.5" strokeDasharray="7 5" opacity="0.95" />
                    <circle cx={guide.x1} cy={guide.y1} r="4" fill="#f0fdf4" stroke="#16a34a" strokeWidth="1.5" />
                  </g>
                ))}
                {/* Punkt 5 — sichtbarer Fang. Form UND Text sagen, woran gefangen
                    wird; die Koordinate ist dieselbe, die der Klick setzt. */}
                {snapMarker && <SnapMarker marker={snapMarker} />}
                {/* Punkt 2 — Platzierungsvorschau. Kein echter Node: ein Geist mit
                    Handles würde React Flow durchscheinen lassen und könnte
                    versehentlich im Graphen landen. */}
                {/* Punkt 25 — der Abschnitt, der beim Klick geteilt wird. Ohne
                    diese Rückmeldung wüsste der Planer nicht, ob er ein Bauteil
                    frei setzt oder in eine bestehende Leitung einbaut. */}
                {platzierTyp && inlineTreffer && (
                  <g pointerEvents="none">
                    <line x1={inlineTreffer.a.x} y1={inlineTreffer.a.y}
                      x2={inlineTreffer.b.x} y2={inlineTreffer.b.y}
                      stroke="#4f46e5" strokeWidth={9 / zoomAnzeige} opacity="0.28"
                      strokeLinecap="round" />
                    {/* Die zwei künftigen Teilstücke bekommen eine Trennmarke am
                        Einsetzpunkt. */}
                    <line
                      x1={inlineTreffer.punkt.x - (inlineTreffer.b.y - inlineTreffer.a.y === 0 ? 0 : 10 / zoomAnzeige)}
                      y1={inlineTreffer.punkt.y - (inlineTreffer.b.y - inlineTreffer.a.y === 0 ? 10 / zoomAnzeige : 0)}
                      x2={inlineTreffer.punkt.x + (inlineTreffer.b.y - inlineTreffer.a.y === 0 ? 0 : 10 / zoomAnzeige)}
                      y2={inlineTreffer.punkt.y + (inlineTreffer.b.y - inlineTreffer.a.y === 0 ? 10 / zoomAnzeige : 0)}
                      stroke="#4f46e5" strokeWidth={2 / zoomAnzeige} />
                    {inlineTreffer.abzweig && (
                      <>
                        <line x1={inlineTreffer.punkt.x} y1={inlineTreffer.punkt.y}
                          x2={inlineTreffer.abzweig.x} y2={inlineTreffer.abzweig.y}
                          stroke="#4f46e5" strokeWidth={3 / zoomAnzeige} strokeDasharray={`${6 / zoomAnzeige},${4 / zoomAnzeige}`} />
                        <circle cx={inlineTreffer.punkt.x} cy={inlineTreffer.punkt.y}
                          r={5 / zoomAnzeige} fill="#4f46e5" />
                      </>
                    )}
                    <text x={inlineTreffer.punkt.x + 16 / zoomAnzeige}
                      y={inlineTreffer.punkt.y - 14 / zoomAnzeige}
                      fill="#4338ca" fontSize={11 / zoomAnzeige} fontWeight="700"
                      stroke="#ffffff" strokeWidth={3 / zoomAnzeige}
                      strokeLinejoin="round" paintOrder="stroke">
                      {inlineTreffer.abzweig ? 'Abzweig an Leitung' : 'in Leitung einsetzen'}
                    </text>
                  </g>
                )}
                {platzierTyp && platzierVorschau && (
                  <g pointerEvents="none" opacity="0.5">
                    <rect x={platzierVorschau.x - 20 / zoomAnzeige} y={platzierVorschau.y - 20 / zoomAnzeige}
                      width={40 / zoomAnzeige} height={40 / zoomAnzeige} rx={3 / zoomAnzeige}
                      fill="rgba(79,70,229,0.10)" stroke="#4f46e5"
                      strokeWidth={1.5 / zoomAnzeige} strokeDasharray={`${5 / zoomAnzeige} ${3 / zoomAnzeige}`} />
                    <line x1={platzierVorschau.x - 9 / zoomAnzeige} y1={platzierVorschau.y}
                      x2={platzierVorschau.x + 9 / zoomAnzeige} y2={platzierVorschau.y}
                      stroke="#4f46e5" strokeWidth={1.2 / zoomAnzeige} />
                    <line x1={platzierVorschau.x} y1={platzierVorschau.y - 9 / zoomAnzeige}
                      x2={platzierVorschau.x} y2={platzierVorschau.y + 9 / zoomAnzeige}
                      stroke="#4f46e5" strokeWidth={1.2 / zoomAnzeige} />
                  </g>
                )}
                {/* Punkt 7 — temporäres Mass des laufenden Segments. */}
                {cadMass && <CadMass mass={cadMass} zoom={zoomAnzeige} />}
                {griffMass && <CadMass mass={griffMass} zoom={zoomAnzeige} />}
                {segmentAbstandsMasse.map(mass => (
                  <CadDirektMass key={`${selectedEdgeSegment?.edgeId}-${selectedEdgeSegment?.segmentIndex}-${mass.nodeId}`}
                    mass={mass} zoom={zoomAnzeige} />
                ))}
                {/* Punkt 6 — getippte Länge direkt am Segmentende. Bewusst im
                    Viewport und nicht am Bildschirmrand: beim Zeichnen schaut
                    niemand nach unten in eine Leiste. */}
                {dynamikAnzeige && (
                  <g pointerEvents="none">
                    <rect x={dynamikAnzeige.x + 14 / zoomAnzeige} y={dynamikAnzeige.y - 54 / zoomAnzeige}
                      width={178 / zoomAnzeige} height={48 / zoomAnzeige} rx={5 / zoomAnzeige}
                      fill="#0f172af2" />
                    {[
                      ['length', dynamikAnzeige.laenge || '0', 'mm', 20],
                      ['angle', dynamikAnzeige.winkel || '0', '°', 104],
                    ].map(([feld, wert, einheit, offset]) => (
                      <g key={feld}>
                        <rect x={dynamikAnzeige.x + offset / zoomAnzeige} y={dynamikAnzeige.y - 48 / zoomAnzeige}
                          width={76 / zoomAnzeige} height={22 / zoomAnzeige} rx={3 / zoomAnzeige}
                          fill={dynamikAnzeige.feld === feld ? '#4338ca' : '#1e293b'}
                          stroke={dynamikAnzeige.feld === feld ? '#a5b4fc' : '#475569'} strokeWidth={1 / zoomAnzeige} />
                        <text x={dynamikAnzeige.x + (offset + 6) / zoomAnzeige} y={dynamikAnzeige.y - 33 / zoomAnzeige}
                          fill="#f8fafc" fontSize={11 / zoomAnzeige} fontWeight="700"
                          fontFamily="ui-monospace, SFMono-Regular, monospace">{wert}</text>
                        <text x={dynamikAnzeige.x + (offset + 69) / zoomAnzeige} y={dynamikAnzeige.y - 33 / zoomAnzeige}
                          textAnchor="end" fill="#cbd5e1" fontSize={8 / zoomAnzeige}>{einheit}</text>
                      </g>
                    ))}
                    <text x={dynamikAnzeige.x + 20 / zoomAnzeige} y={dynamikAnzeige.y - 12 / zoomAnzeige}
                      fill="#cbd5e1" fontSize={8 / zoomAnzeige} fontWeight="600">
                      {dynamikAnzeige.prompt} · Tab wechselt Feld
                    </text>
                  </g>
                )}
                {/* Kopieren, Spiegeln, Drehen, Reihe (§74): Basispunkt, der
                    gefangene Zielpunkt und dazwischen das, was der nächste
                    Klick bewirkt. Angezeigt wird ausschliesslich der bereits
                    gefangene Punkt — Anzeige und Klick sind dieselbe Zahl. */}
                {transformBefehl?.basis && (
                  <g pointerEvents="none">
                    <circle cx={transformBefehl.basis.x} cy={transformBefehl.basis.y}
                      r={5 / zoomAnzeige} fill="white" stroke="#7c3aed" strokeWidth={2 / zoomAnzeige} />
                    {transformBefehl.cursor && (
                      <line x1={transformBefehl.basis.x} y1={transformBefehl.basis.y}
                        x2={(transformBefehl.achse || transformBefehl.cursor).x}
                        y2={(transformBefehl.achse || transformBefehl.cursor).y}
                        stroke="#7c3aed" strokeWidth={2 / zoomAnzeige}
                        strokeDasharray={`${9 / zoomAnzeige} ${6 / zoomAnzeige}`} />
                    )}
                    {transformBefehl.cursor && (
                      <text x={transformBefehl.cursor.x + 12 / zoomAnzeige}
                        y={transformBefehl.cursor.y - 12 / zoomAnzeige}
                        fill="#7c3aed" fontSize={11 / zoomAnzeige} fontWeight="700"
                        stroke="#ffffff" strokeWidth={3 / zoomAnzeige}
                        strokeLinejoin="round" paintOrder="stroke">
                        {transformBefehl.art === 'drehen'
                          ? `${Math.round(Number(transformBefehl.puffer ?? winkelZwischen(transformBefehl.basis, transformBefehl.cursor)) || 0)}°`
                          : verschiebungLabel({
                            x:transformBefehl.cursor.x - transformBefehl.basis.x,
                            y:transformBefehl.cursor.y - transformBefehl.basis.y,
                          })}
                      </text>
                    )}
                  </g>
                )}
                {transformBefehl?.marker && (
                  <circle cx={transformBefehl.marker.x} cy={transformBefehl.marker.y}
                    r={6 / zoomAnzeige} fill="none" pointerEvents="none"
                    stroke={transformBefehl.marker.farbe} strokeWidth={2 / zoomAnzeige} />
                )}
                {/* Mit Lücke trennen: der bereits gesetzte erste Punkt. */}
                {luecke?.erster && (
                  <g pointerEvents="none">
                    <circle cx={luecke.erster.x} cy={luecke.erster.y} r={5 / zoomAnzeige}
                      fill="white" stroke="#0f766e" strokeWidth={2 / zoomAnzeige} />
                    <line x1={luecke.erster.x} y1={luecke.erster.y - 11 / zoomAnzeige}
                      x2={luecke.erster.x} y2={luecke.erster.y + 11 / zoomAnzeige}
                      stroke="#0f766e" strokeWidth={1.5 / zoomAnzeige} />
                  </g>
                )}
                {/* Dehnen: Auswahlfenster und Verschiebevektor. */}
                {dehnen?.ecke1 && (
                  <g pointerEvents="none">
                    <rect
                      x={Math.min(dehnen.ecke1.x, (dehnen.ecke2 || dehnen.cursor || dehnen.ecke1).x)}
                      y={Math.min(dehnen.ecke1.y, (dehnen.ecke2 || dehnen.cursor || dehnen.ecke1).y)}
                      width={Math.abs((dehnen.ecke2 || dehnen.cursor || dehnen.ecke1).x - dehnen.ecke1.x)}
                      height={Math.abs((dehnen.ecke2 || dehnen.cursor || dehnen.ecke1).y - dehnen.ecke1.y)}
                      fill="rgba(15,118,110,0.10)" stroke="#0f766e"
                      strokeWidth={1.5 / zoomAnzeige}
                      strokeDasharray={`${6 / zoomAnzeige} ${4 / zoomAnzeige}`} />
                    {dehnen.basis && dehnen.cursor && (
                      <>
                        <line x1={dehnen.basis.x} y1={dehnen.basis.y}
                          x2={dehnen.cursor.x} y2={dehnen.cursor.y}
                          stroke="#0f766e" strokeWidth={2 / zoomAnzeige}
                          strokeDasharray={`${9 / zoomAnzeige} ${6 / zoomAnzeige}`} />
                        <text x={dehnen.cursor.x + 12 / zoomAnzeige} y={dehnen.cursor.y - 12 / zoomAnzeige}
                          fill="#0f766e" fontSize={11 / zoomAnzeige} fontWeight="700"
                          stroke="#ffffff" strokeWidth={3 / zoomAnzeige}
                          strokeLinejoin="round" paintOrder="stroke">
                          {verschiebungLabel({ x:dehnen.cursor.x - dehnen.basis.x, y:dehnen.cursor.y - dehnen.basis.y })}
                        </text>
                      </>
                    )}
                  </g>
                )}
                {/* Notiz-Stecknadeln: sitzen in Weltkoordinaten, zeigen beim
                    Überfahren den Titel und öffnen den Journaleintrag. */}
                {notizen.filter(item => item.pin).map(item => (
                  <g key={`nadel-${item.id}`} style={{ cursor:'pointer', pointerEvents:'all' }}
                    onPointerDown={(event) => { if (event.button === 0) nadelDragStart(event, item.id); }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOffeneNotiz({ id:item.id, titel:item.titel, text:item.text });
                    }}>
                    <title>{item.titel || 'Notiz ohne Titel'}</title>
                    {/* Klassische Nadelform: Kopf oben, Spitze auf dem Punkt. */}
                    <path
                      d={`M ${item.pin.x} ${item.pin.y}
                          l ${-9 / zoomAnzeige} ${-13 / zoomAnzeige}
                          a ${9 / zoomAnzeige} ${9 / zoomAnzeige} 0 1 1 ${18 / zoomAnzeige} 0 Z`}
                      fill={item.erledigt ? '#94a3b8' : '#e11d48'}
                      stroke="#ffffff" strokeWidth={1.6 / zoomAnzeige} strokeLinejoin="round" />
                    <circle cx={item.pin.x} cy={item.pin.y - 19 / zoomAnzeige}
                      r={3.4 / zoomAnzeige} fill="#ffffff" />
                    {offeneNotiz?.id === item.id && (
                      <circle cx={item.pin.x} cy={item.pin.y - 19 / zoomAnzeige}
                        r={15 / zoomAnzeige} fill="none" stroke="#e11d48"
                        strokeWidth={2 / zoomAnzeige} opacity="0.5" />
                    )}
                  </g>
                ))}
                {/* Verschieben: Basispunkt, gefangener Zielpunkt und die Strecke
                    dazwischen — angezeigt wird genau der Vektor, den der Klick
                    anwendet. */}
                {verschiebung?.basis && (
                  <g pointerEvents="none">
                    <circle cx={verschiebung.basis.x} cy={verschiebung.basis.y}
                      r={5 / zoomAnzeige} fill="white" stroke="#5b21b6" strokeWidth={2 / zoomAnzeige} />
                    {verschiebung.cursor && (
                      <>
                        <line x1={verschiebung.basis.x} y1={verschiebung.basis.y}
                          x2={verschiebung.cursor.x} y2={verschiebung.cursor.y}
                          stroke="#5b21b6" strokeWidth={2 / zoomAnzeige}
                          strokeDasharray={`${9 / zoomAnzeige} ${6 / zoomAnzeige}`} />
                        <circle cx={verschiebung.cursor.x} cy={verschiebung.cursor.y}
                          r={4 / zoomAnzeige} fill="#5b21b6" />
                        <text x={verschiebung.cursor.x + 12 / zoomAnzeige}
                          y={verschiebung.cursor.y - 12 / zoomAnzeige}
                          fill="#5b21b6" fontSize={11 / zoomAnzeige} fontWeight="700"
                          stroke="#ffffff" strokeWidth={3 / zoomAnzeige}
                          strokeLinejoin="round" paintOrder="stroke">
                          {verschiebungLabel({
                            x:verschiebung.cursor.x - verschiebung.basis.x,
                            y:verschiebung.cursor.y - verschiebung.basis.y,
                          })}
                        </text>
                      </>
                    )}
                  </g>
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

          {/* Underlay-Bedienfeld (§ Editor #5) */}
          <input ref={underlayInputRef} type="file" accept="application/pdf,image/*" style={{ display:'none' }}
            onChange={event=>{ const f = event.target.files?.[0]; event.target.value = ''; if (f) underlayHochladen(f); }} />
          {showUnderlayPanel && (
            <div style={{ position:'absolute', top:12, left:12, width:250, background:'white', border:'1px solid #e2e8f0', borderRadius:10, boxShadow:'0 10px 28px rgba(15,23,42,0.16)', zIndex:25, padding:'10px 12px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <strong style={{ fontSize:11, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}>
                  <ImageIcon size={14} /> Plan-Underlay
                </strong>
                <button onClick={()=>setShowUnderlayPanel(false)} title="Schliessen" style={{ border:0, background:'transparent', cursor:'pointer', color:'#94a3b8' }}><X size={15} /></button>
              </div>
              {underlayBusy ? (
                <div style={{ fontSize:11, color:'#4f46e5', padding:'8px 0' }}>Plan wird verarbeitet …</div>
              ) : !underlay ? (
                <>
                  <button onClick={()=>underlayInputRef.current?.click()} style={{ width:'100%', padding:8, background:'#4f46e5', color:'white', border:0, borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    Plan oder Bild laden
                  </button>
                  <div style={{ fontSize:9.5, color:'#94a3b8', marginTop:7, lineHeight:1.4 }}>
                    PDF (erste Seite), PNG oder JPG. Firmenweit im Projekt gespeichert — dient nur als Vorlage zum Nachzeichnen und fliesst nicht in die Berechnung ein.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:10, color:'#475569', marginBottom:8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={underlay.name || ''}>{underlay.name || 'Plan'}</div>
                  <label style={{ display:'grid', gridTemplateColumns:'62px 1fr 34px', alignItems:'center', gap:6, marginBottom:8, fontSize:10, color:'#475569' }}>
                    Deckkraft
                    <input type="range" min="5" max="100" step="1" value={Math.round(underlay.opacity * 100)}
                      onChange={event=>underlayTransform({ opacity:Math.max(0.05, Number(event.target.value) / 100) })} />
                    <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{Math.round(underlay.opacity * 100)}%</span>
                  </label>
                  <label style={{ display:'grid', gridTemplateColumns:'62px 1fr 34px', alignItems:'center', gap:6, marginBottom:10, fontSize:10, color:'#475569' }}>
                    Grösse
                    <input type="range" min="10" max="300" step="1" value={Math.round(underlay.scale * 100)}
                      onChange={event=>underlayTransform({ scale:Math.max(0.02, Number(event.target.value) / 100) })} />
                    <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{Math.round(underlay.scale * 100)}%</span>
                  </label>
                  <button onClick={()=>underlayTransform({ locked:!underlay.locked })}
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:7, borderRadius:7, fontSize:10, fontWeight:700, cursor:'pointer',
                      border:`1px solid ${underlay.locked ? '#cbd5e1' : '#a5b4fc'}`, background:underlay.locked ? 'white' : '#eef2ff', color:underlay.locked ? '#475569' : '#4338ca' }}>
                    {underlay.locked ? <><Lock size={13} /> Gesperrt — zum Positionieren tippen</> : <><Unlock size={13} /> Positionieren (in Zeichnung ziehen)</>}
                  </button>
                  <div style={{ display:'flex', gap:6, marginTop:8 }}>
                    <button onClick={()=>underlayInputRef.current?.click()} style={{ flex:1, padding:6, border:'1px solid #e2e8f0', borderRadius:6, background:'white', fontSize:10, cursor:'pointer', color:'#475569' }}>Ersetzen</button>
                    <button onClick={underlayEntfernen} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:6, border:'1px solid #fca5a5', borderRadius:6, background:'#fef2f2', fontSize:10, cursor:'pointer', color:'#dc2626' }}><Trash2 size={12} /> Entfernen</button>
                  </div>
                </>
              )}
            </div>
          )}

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

          {/* Punkt 8 — numerische Direkteingabe als Canvas-Overlay, nicht als
              Formularfeld rechts. Erscheint nur, während tatsächlich getippt wird. */}

          {/* Punkt 15 — Statusleiste. Der aktive Modus steht immer hier. */}
          <div className="hc-statusbar">
            <span className={`hc-statusbar__mode${istGrundzustand ? '' : ' is-command'}`}
              title={istGrundzustand
                ? 'Grundzustand: auswählen und bearbeiten'
                : 'Befehl aktiv — Esc führt zurück'}>
              {modeLabel(editorMode)}
              {platzierTyp ? `: ${paletteItem(platzierTyp)?.label || platzierTyp}` : ''}
              {editorMode.persistent ? ' · Dauer' : ''}
            </span>
            <button type="button"
              onClick={() => setOrthoAn(v => {
                const next = !v;
                setDrawingConfig(c => ({ ...c, ortho:next, ...(next ? { polar_snap:false } : {}) }));
                return next;
              })}
              className={`hc-statusbar__toggle${orthoAn ? ' is-on' : ''}`}
              title="Achsnah orthogonal; bewusste Schräge ab 30° (Shift gibt frei)">ORTHO</button>
            <button type="button"
              onClick={() => {
                const next = !drawingConfig.polar_snap;
                setDrawingConfig(c => ({ ...c, polar_snap:next, ...(next ? { ortho:false } : {}) }));
                if (next) setOrthoAn(false);
              }}
              className={`hc-statusbar__toggle${drawingConfig.polar_snap ? ' is-on' : ''}`}
              title="Polarfang auf ein festes Winkelraster">POLAR</button>
            {drawingConfig.polar_snap && (
              <select value={drawingConfig.polar_angle} aria-label="Polarwinkel"
                onChange={event=>setDrawingConfig(c => ({ ...c, polar_angle:Number(event.target.value) }))}
                className="hc-statusbar__polar-angle">
                {POLAR_WINKEL.map(winkel => <option key={winkel} value={winkel}>{winkel}°</option>)}
              </select>
            )}
            <button type="button"
              onClick={() => setSnapAn(v => { setDrawingConfig(c => ({ ...c, object_snap:!v })); return !v; })}
              className={`hc-statusbar__toggle${snapAn ? ' is-on' : ''}`}
              title="Objektfang auf Anschlüsse, Endpunkte und Leitungen">SNAP</button>
            <button type="button"
              onClick={() => setDrawingConfig(c => ({ ...c, dynamic_input:!c.dynamic_input }))}
              className={`hc-statusbar__toggle${drawingConfig.dynamic_input ? ' is-on' : ''}`}
              title="Dynamische Eingabe für Länge und Winkel am Cursor">DYN</button>
            {/* Sichtbarkeit und Weite stehen nebeneinander: das Raster fängt
                weiter, auch wenn man es nicht sieht. */}
            <button type="button"
              onClick={() => setDrawingConfig(c => ({ ...c, raster_sichtbar:!c.raster_sichtbar }))}
              className={`hc-statusbar__toggle${drawingConfig.raster_sichtbar ? ' is-on' : ''}`}
              title="Raster anzeigen (der Rasterfang bleibt davon unberührt)">RASTER</button>
            <label className="hc-statusbar__raster">
              Raster
              <select value={drawingConfig.grid_size} aria-label="Rasterweite"
                onChange={e => setDrawingConfig(c => ({ ...c, grid_size:Number(e.target.value) }))}>
                {GRID_OPTIONEN.map(size => <option key={size} value={size}>{size} mm</option>)}
              </select>
            </label>
            <span className="hc-statusbar__system" style={{ color:activeLayer.color }}>
              ● {activeLayer.label}
            </span>
            <div className="hc-commandline">
              <input value={befehlszeile}
                aria-label="Befehlszeile"
                placeholder={befehlsPrompt(editorMode, {
                  hasDraft:Boolean(leitungsEntwurf),
                  hasBase:Boolean(verschiebung?.basis || transformBefehl?.basis),
                  hasStart:Boolean(transformBefehl?.basis), hasFirst:Boolean(luecke?.erster),
                  hasSpacing:Boolean(transformBefehl?.abstand),
                })}
                onFocus={()=>setBefehlszeileAktiv(true)}
                onBlur={()=>setTimeout(()=>setBefehlszeileAktiv(false), 120)}
                onChange={event=>setBefehlszeile(event.target.value)}
                onKeyDown={event=>{
                  if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur(); setBefehlszeile(''); return; }
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  const treffer = befehlsVorschlaege(befehlszeile, befehlsEintraege)[0];
                  if (treffer) befehlAusfuehren(treffer);
                  else if (!befehlszeile.trim()) wiederholeLetztenRef.current();
                }} />
              {befehlszeileAktiv && (
                <div className="hc-commandline__suggestions">
                  {befehlsVorschlaege(befehlszeile, befehlsEintraege).slice(0, 5).map(item => (
                    <button key={item.id} type="button" onPointerDown={event=>event.preventDefault()}
                      onClick={()=>befehlAusfuehren(item)}>
                      <kbd>{String(item.taste).toUpperCase()}</kbd><span>{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {laengenPuffer !== null
              ? <span className="hc-statusbar__mass is-input">{laengenPuffer || '0'} mm ⌫</span>
              : cadMass && <span className="hc-statusbar__mass">{cadMass.label}</span>}
            {/* Auswahlstufe: ein Klick trifft das Teilstück, Tab den Strang. */}
            {selectedEdgeId && (
              <span className="hc-statusbar__hint">
                {markierteEdgeIds.length > 1
                  ? `Leitungssystem · ${markierteEdgeIds.length} Leitungen · Tab zurück`
                  : 'Teilstück · Tab wählt das System'}
              </span>
            )}
            {spacePan && <span className="hc-statusbar__hint">Pan (Space)</span>}
            <span className="hc-statusbar__zoom">{Math.round(zoomAnzeige * 100)} %</span>
          </div>
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
              <LeitungPanel edge={selectedEdge} leitungResults={leitungResults}
                segmentIndex={selectedEdgeSegment?.edgeId === selectedEdge.id ? selectedEdgeSegment.segmentIndex : null}
                onMoveSegment={segmentNumerischVerschieben}
                onLabel={beschriftungSetzen} onLabelReset={labelZuruecksetzen}
                onUpdateEdge={updateEdgeData} onUpdateLayer={updateEdgeLayer} onDelete={deleteEdge} />
            ) : (
              <PropertiesPanel node={selectedNode} nodeFlows={nodeFlows} verteilerResults={verteilerResults} gruppeResults={gruppeResults} ventilResults={ventilResults} pumpenResults={pumpenResults} expansionResults={expansionResults} anschlussWarnungen={anschlussWarnungen} anschlussResults={anschlussResults} pwtResults={pwtResults} heatpumpResults={heatpumpResults} speicherResults={speicherResults} erdsondenResults={erdsondenResults} bwwResults={bwwResults} onUpdate={updateNode} onDelete={deleteNode} onSetAbgaenge={setAbgaenge} navigate={navigate}
                drawingConfig={drawingConfig} onDrawingConfig={drawingConfigAktualisieren}/>
            )}
          </aside>
        )}
      </div>

      {/* Schema als Vorlage speichern. Die Vorlage ist eine Kopie: ändert sich
          dieses Projekt später, bleibt die Standardschaltung, wie sie war. */}
      {vorlageDialogOpen && (
        <div className="hc-revision-overlay" onPointerDown={()=>!vorlageSaving && setVorlageDialogOpen(false)}>
          <form className="hc-stand-dialog" onSubmit={vorlageSpeichern} onPointerDown={event=>event.stopPropagation()}>
            <div className="hc-revision-panel__header">
              <div>
                <span>Wiederverwenden</span>
                <strong>Als Vorlage speichern</strong>
              </div>
              <button type="button" className="hc-icon-button" onClick={()=>setVorlageDialogOpen(false)} disabled={vorlageSaving}>
                <X size={17} />
              </button>
            </div>
            <p className="hc-stand-dialog__intro">
              Die Vorlage steht der ganzen Firma zur Verfügung und ist eine Kopie
              des jetzigen Standes. Spätere Änderungen an diesem Projekt lassen
              sie unberührt.
            </p>
            <label className="hc-stand-field">
              <span>Name</span>
              <input autoFocus maxLength={120} value={vorlageName}
                onChange={event=>setVorlageName(event.target.value)}
                placeholder="Zum Beispiel: EWS-WP mit zwei Heizgruppen" />
            </label>
            <label className="hc-stand-field">
              <span>Beschreibung <small>optional</small></span>
              <textarea maxLength={500} rows={3} value={vorlageBeschreibung}
                onChange={event=>setVorlageBeschreibung(event.target.value)}
                placeholder="Wofür eignet sich diese Schaltung?" />
            </label>
            {vorlageFehler && <div className="hc-revision-error">{vorlageFehler}</div>}
            <div className="hc-stand-dialog__facts">
              <span>{nodes.length} Bauteile</span>
              <span>{edges.length} Leitungen</span>
            </div>
            <div className="hc-stand-dialog__actions">
              <button type="button" onClick={()=>setVorlageDialogOpen(false)} disabled={vorlageSaving}>Abbrechen</button>
              <button type="submit" className="is-primary" disabled={vorlageSaving || !vorlageName.trim() || !nodes.length}>
                <SaveIcon size={15} /> {vorlageSaving ? 'Wird gespeichert …' : 'Vorlage speichern'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Benutzerdefinierte Einstellungen: die Tastenbelegung gehört dem
          Planer, nicht dem Projekt. Sie wird pro Benutzer gespeichert und gilt
          in jedem Schema, das er öffnet. */}
      {shortcutDialogOpen && (
        <div className="hc-revision-overlay" onPointerDown={()=>setShortcutDialogOpen(false)}>
          <div className="hc-stand-dialog" onPointerDown={event=>event.stopPropagation()}>
            <div className="hc-revision-panel__header">
              <div>
                <span>Benutzerdefiniert</span>
                <strong>Meine Tastenbelegung</strong>
              </div>
              <button type="button" className="hc-icon-button" onClick={()=>setShortcutDialogOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <p className="hc-stand-dialog__intro">
              Gilt für dich in jedem Schema und wird sofort gespeichert. Ziffern
              bleiben der Längeneingabe vorbehalten, <strong>T</strong> der Folge
              <strong>TR</strong> für „Ecke verbinden". Vergibst du eine Taste
              doppelt, behält sie der zuletzt geänderte Befehl — der andere
              bleibt frei und kann neu belegt werden.
            </p>
            <div className="hc-shortcut-grid">
              {[
                ['shortcut_line', 'Leitung starten'],
                ['shortcut_polyline', 'Polylinie starten'],
                ['shortcut_rotate', 'Bauteil drehen (Shift: um Basispunkt)'],
                ['shortcut_mirror', 'Bauteil spiegeln (Shift: an Achse)'],
                ['shortcut_align', 'Ausrichten (Shift: Bauteil aufs Raster)'],
                ['shortcut_move', 'Verschieben (Shift: ganze Leitung)'],
                ['shortcut_break', 'Mit Lücke trennen'],
                ['shortcut_stretch', 'Dehnen'],
                ['shortcut_offset', 'Versatz'],
                ['shortcut_trim', 'Stutzen (Shift: dehnen)'],
                ['shortcut_extend', 'Dehnen bis Kante (Shift: stutzen)'],
                ['shortcut_join', 'Verbinden'],
              ].map(([feld, label]) => (
                <React.Fragment key={feld}>
                  <label htmlFor={`sc-${feld}`}>{label}</label>
                  <input id={`sc-${feld}`} maxLength="1" value={drawingConfig[feld] || ''}
                    onFocus={event=>event.currentTarget.select()}
                    placeholder="—"
                    onChange={event=>shortcutSetzen(feld, event.target.value)} />
                </React.Fragment>
              ))}
            </div>
            {shortcutFehler && <div className="hc-revision-error">{shortcutFehler}</div>}
            <div className="hc-stand-dialog__actions">
              <button type="button" onClick={shortcutsZuruecksetzen}>Standardbelegung</button>
              <button type="button" className="is-primary" onClick={()=>setShortcutDialogOpen(false)}>Fertig</button>
            </div>
          </div>
        </div>
      )}

      {standDialogOpen && (
        <div className="hc-revision-overlay" onPointerDown={()=>!standSaving && setStandDialogOpen(false)}>
          <form className="hc-stand-dialog" onSubmit={standSpeichern} onPointerDown={event=>event.stopPropagation()}>
            <div className="hc-revision-panel__header">
              <div>
                <span>Nachvollziehbarkeit</span>
                <strong>Schema-Stand speichern</strong>
              </div>
              <button type="button" className="hc-icon-button" onClick={()=>setStandDialogOpen(false)} disabled={standSaving}>
                <X size={17} />
              </button>
            </div>
            <p className="hc-stand-dialog__intro">
              Geometrie, Eigenschaften und die serverseitig neu berechneten Hydraulikwerte werden gemeinsam eingefroren.
            </p>
            <label className="hc-stand-field">
              <span>Bezeichnung <small>optional</small></span>
              <input autoFocus maxLength={120} value={standBezeichnung}
                onChange={event=>setStandBezeichnung(event.target.value)}
                placeholder={`Zum Beispiel: Vorprojekt ${revisionen.length + 1}`} />
            </label>
            <label className="hc-stand-field">
              <span>Notiz <small>optional</small></span>
              <textarea maxLength={1000} rows={4} value={standNotiz}
                onChange={event=>setStandNotiz(event.target.value)}
                placeholder="Was wurde fachlich geändert oder geprüft?" />
            </label>
            {standFehler && <div className="hc-revision-error">{standFehler}</div>}
            <div className="hc-stand-dialog__facts">
              <span>{nodes.length} Bauteile</span>
              <span>{edges.length} Leitungen</span>
              <span>Berechnung hydraulik-v1</span>
            </div>
            <div className="hc-stand-dialog__actions">
              <button type="button" onClick={()=>setStandDialogOpen(false)} disabled={standSaving}>Abbrechen</button>
              <button type="submit" className="is-primary" disabled={standSaving || !schemaId}>
                <SaveIcon size={15} /> {standSaving ? 'Stand wird gespeichert …' : 'Stand verbindlich speichern'}
              </button>
            </div>
          </form>
        </div>
      )}

      {revisionenOpen && (
        <div className="hc-revision-overlay is-drawer" onPointerDown={()=>setRevisionenOpen(false)}>
          <aside className="hc-revision-panel" onPointerDown={event=>event.stopPropagation()}>
            <div className="hc-revision-panel__header">
              <div>
                <span>Schema-Historie</span>
                <strong>Gespeicherte Stände</strong>
              </div>
              <button className="hc-icon-button" onClick={()=>setRevisionenOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="hc-revision-panel__actions">
              <button onClick={()=>{ setStandFehler(''); setRevisionenOpen(false); setStandDialogOpen(true); }}>
                <SaveIcon size={14} /> Neuen Stand speichern
              </button>
              <button onClick={revisionenLaden} disabled={revisionenLoading}>
                <History size={14} /> Aktualisieren
              </button>
            </div>
            {standFehler && <div className="hc-revision-error">{standFehler}</div>}
            <div className="hc-revision-list">
              {revisionenLoading && <div className="hc-revision-empty">Stände werden geladen …</div>}
              {!revisionenLoading && revisionen.length === 0 && (
                <div className="hc-revision-empty">
                  <History size={24} />
                  <strong>Noch kein fester Stand</strong>
                  <span>Autosave schützt die laufende Arbeit. Ein gespeicherter Stand friert zusätzlich Graph, Berechnung und Bearbeiter ein.</span>
                </div>
              )}
              {!revisionenLoading && revisionen.map(revision => {
                const summary = revision.diff?.zusammenfassung || {};
                const changes = [
                  ['+', summary.bauteile_hinzugefuegt, 'Bauteile'],
                  ['−', summary.bauteile_entfernt, 'Bauteile'],
                  ['↔', summary.bauteile_geaendert, 'Bauteile'],
                  ['+', summary.leitungen_hinzugefuegt, 'Leitungen'],
                  ['−', summary.leitungen_entfernt, 'Leitungen'],
                  ['↔', summary.leitungen_geaendert, 'Leitungen'],
                ].filter(([, count])=>count);
                return (
                  <article key={revision.id} className="hc-revision-card">
                    <div className="hc-revision-card__top">
                      <div>
                        <span>Stand {revision.version_nr}</span>
                        <strong>{revision.bezeichnung || `Schema-Stand ${revision.version_nr}`}</strong>
                      </div>
                      <time>{new Intl.DateTimeFormat('de-CH', { dateStyle:'short', timeStyle:'short' }).format(new Date(revision.created_at))}</time>
                    </div>
                    <div className="hc-revision-card__meta">
                      <span>{revision.created_by_name || 'Unbekannter Bearbeiter'}</span>
                      <span>{revision.node_count} Bauteile</span>
                      <span>{revision.edge_count} Leitungen</span>
                    </div>
                    {revision.notiz && <p>{revision.notiz}</p>}
                    <div className="hc-revision-card__diff">
                      {changes.length
                        ? changes.map(([symbol, count, label], index)=>(
                          <span key={`${symbol}-${label}-${index}`} className={`is-${symbol==='+'?'added':symbol==='−'?'removed':'changed'}`}>
                            {symbol}{count} {label}
                          </span>
                        ))
                        : <span>Keine Änderung zum vorherigen Stand</span>}
                    </div>
                    <button className="hc-revision-card__details-toggle"
                      onClick={()=>setRevisionDetailId(current=>current === revision.id ? null : revision.id)}>
                      {revisionDetailId === revision.id ? 'Änderungsdetails ausblenden' : 'Änderungsdetails anzeigen'}
                    </button>
                    {revisionDetailId === revision.id && (
                      <div className="hc-revision-card__details">
                        {(revision.diff?.bauteile?.hinzugefuegt || []).map(item=>(
                          <div key={`add-${item.id}`}><b>Hinzugefügt</b><span>{item.name}</span></div>
                        ))}
                        {(revision.diff?.bauteile?.entfernt || []).map(item=>(
                          <div key={`remove-${item.id}`}><b>Entfernt</b><span>{item.name}</span></div>
                        ))}
                        {(revision.diff?.bauteile?.geaendert || []).map(item=>(
                          <div key={`change-${item.id}`}>
                            <b>Geändert</b>
                            <span>{item.name}: {(item.felder || []).map(field=>field === 'position' ? 'Position' : field.replace('data.', '')).join(', ')}</span>
                          </div>
                        ))}
                        {!!revision.diff?.zusammenfassung?.leitungen_hinzugefuegt && (
                          <div><b>Leitungen</b><span>{revision.diff.zusammenfassung.leitungen_hinzugefuegt} hinzugefügt</span></div>
                        )}
                        {!!revision.diff?.zusammenfassung?.leitungen_entfernt && (
                          <div><b>Leitungen</b><span>{revision.diff.zusammenfassung.leitungen_entfernt} entfernt</span></div>
                        )}
                        {!!revision.diff?.zusammenfassung?.leitungen_geaendert && (
                          <div><b>Leitungen</b><span>{revision.diff.zusammenfassung.leitungen_geaendert} geometrisch oder fachlich geändert</span></div>
                        )}
                        {!changes.length && <span>Dieser Stand entspricht dem vorherigen Stand.</span>}
                      </div>
                    )}
                    <button className="hc-revision-card__restore" onClick={()=>standWiederherstellen(revision)}
                      disabled={restoreId === revision.id}>
                      <RotateCcw size={14} />
                      {restoreId === revision.id ? 'Wird geladen …' : 'Als Arbeitsstand wiederherstellen'}
                    </button>
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Notizfenster zur Stecknadel. Bewusst schlank: Titel, Text, erledigt.
          Alles Weitere (Fälligkeit, Art, Verlauf) steht in der Dokumentation. */}
      {offeneNotiz && (() => {
        const eintrag = notizen.find(item => item.id === offeneNotiz.id);
        return (
          <div onPointerDown={() => setOffeneNotiz(null)} style={{ position:'fixed', inset:0, zIndex:3700 }}>
            <div onPointerDown={event => event.stopPropagation()}
              style={{ position:'fixed', right:24, bottom:24, width:330, background:'white',
                border:'1px solid #cbd5e1', borderRadius:12, padding:14,
                boxShadow:'0 18px 40px rgba(15,23,42,.26)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <span style={{ fontSize:14 }}>📍</span>
                <strong style={{ fontSize:11, color:'#0f172a' }}>Notiz am Schema</strong>
                <button onClick={() => setOffeneNotiz(null)}
                  style={{ marginLeft:'auto', border:0, background:'transparent', cursor:'pointer', color:'#94a3b8', fontSize:16 }}>×</button>
              </div>
              <input autoFocus value={offeneNotiz.titel}
                onChange={event => setOffeneNotiz(current => ({ ...current, titel:event.target.value }))}
                placeholder="Titel, z.B. «Ventil prüfen»"
                style={{ width:'100%', border:'1px solid #cbd5e1', borderRadius:7, padding:'7px 9px', fontSize:12, marginBottom:6 }} />
              <textarea value={offeneNotiz.text}
                onChange={event => setOffeneNotiz(current => ({ ...current, text:event.target.value }))}
                placeholder="Was ist hier zu tun oder zu beachten?"
                style={{ width:'100%', minHeight:84, border:'1px solid #cbd5e1', borderRadius:7, padding:'7px 9px', fontSize:12, resize:'vertical' }} />
              {eintrag && (
                <div style={{ marginTop:7, fontSize:9.5, color:'#94a3b8', lineHeight:1.5 }}>
                  <b style={{ color:'#64748b' }}>{eintrag.autor_name || 'Unbekannt'}</b> hat den Eintrag erstellt
                  {eintrag.bearbeitet_at && (
                    <> · zuletzt bearbeitet von <b style={{ color:'#64748b' }}>{eintrag.bearbeitet_von_name}</b>
                    {' '}am {new Intl.DateTimeFormat('de-CH', { dateStyle:'short', timeStyle:'short' }).format(new Date(eintrag.bearbeitet_at))}</>
                  )}
                </div>
              )}
              <div style={{ display:'flex', gap:6, marginTop:10 }}>
                <button onClick={async () => {
                  await notizSpeichern(offeneNotiz.id, { titel:offeneNotiz.titel, text:offeneNotiz.text });
                  setOffeneNotiz(null);
                }} style={{ flex:1, padding:'7px 10px', border:0, borderRadius:7, background:'#4f46e5', color:'white', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  Speichern
                </button>
                <button onClick={() => nadelEntfernen(offeneNotiz.id)}
                  title="Nur die Nadel entfernen — der Eintrag bleibt in der Dokumentation"
                  style={{ padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:7, background:'white', fontSize:11, fontWeight:700, color:'#64748b', cursor:'pointer' }}>
                  Nadel lösen
                </button>
              </div>
              <Link to={`/projekte/${projectId}/dokumentation`}
                style={{ display:'block', marginTop:8, fontSize:10, color:'#4f46e5', textDecoration:'none' }}>
                In der Dokumentation öffnen →
              </Link>
            </div>
          </div>
        );
      })()}

      {gripMenu && (() => {
        const typenLabel = { endpoint:'Endpunkt', corner:'Eckpunkt', segment:'Segmentmitte' };
        const aktionen = griffAktionen(gripMenu.typ);
        const eintraege = gripMenu.typ === 'endpoint' ? [
          ['↗', 'Strecken', 'Neuen Zielpunkt angeben', () => leitungWeiterziehen(gripMenu.edgeId, gripMenu.side)],
          ['⌁', 'Leitung weiterziehen', 'Weitere Eckpunkte setzen', () => leitungWeiterziehen(gripMenu.edgeId, gripMenu.side)],
          ['◎', 'An Bauteil anschliessen', 'Zielanschluss mit SNAP wählen', () => leitungWeiterziehen(gripMenu.edgeId, gripMenu.side)],
        ] : gripMenu.typ === 'corner' ? [
          ['↗', 'Strecken', 'Griff ziehen; Shift/Cmd erweitert die Auswahl', () => {
            setSelectedEdgeId(gripMenu.edgeId); setSelectedEdgePoint({ edgeId:gripMenu.edgeId, pointIndex:gripMenu.pointIndex });
            setSelectedGripPoints([{ edgeId:gripMenu.edgeId, pointIndex:gripMenu.pointIndex }]);
          }],
          ['−', 'Ecke entfernen', 'Nachbarsegmente direkt verbinden', () => punktEntfernen(gripMenu.edgeId, gripMenu.pointIndex)],
          ['÷', 'Ecke hier teilen', 'Zwei Leitungen mit gemeinsamem Anker', () => eckpunktTeilen(gripMenu.edgeId, gripMenu.pointIndex)],
        ] : [
          ['↕', 'Segment versetzen', 'Diamantgriff parallel ziehen', () => {
            setSelectedEdgeId(gripMenu.edgeId); setSelectedEdgeSegment({ edgeId:gripMenu.edgeId, segmentIndex:gripMenu.segmentIndex });
          }],
          ['＋', 'Ecke einfügen', 'Stützpunkt in der Segmentmitte', () => {
            const edge = edgesRef.current.find(item => item.id === gripMenu.edgeId);
            const route = edge ? routePunkte(edge) : [];
            const a = route[gripMenu.segmentIndex], b = route[gripMenu.segmentIndex + 1];
            if (!a || !b) return;
            snap();
            const points = route.slice(1, -1);
            points.splice(gripMenu.segmentIndex, 0, { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 });
            setEdges(items => items.map(item => item.id === gripMenu.edgeId ? { ...item, data:{ ...(item.data || {}), points } } : item));
          }],
          ['↔', 'Länge setzen', 'Exakte Teilstücklänge in mm', () => segmentLaengeSetzen(gripMenu.edgeId, gripMenu.segmentIndex)],
        ];
        return (
          <div onPointerDown={()=>setGripMenu(null)} style={{ position:'fixed', inset:0, zIndex:3700 }}>
            <div onPointerDown={event=>event.stopPropagation()}
              style={{ position:'fixed', left:Math.min(gripMenu.x, window.innerWidth - 235), top:Math.min(gripMenu.y, window.innerHeight - 235), width:220,
                padding:6, borderRadius:10, background:'white', border:'1px solid #cbd5e1', boxShadow:'0 16px 36px rgba(15,23,42,.24)' }}>
              <div style={{ padding:'4px 8px 6px', fontSize:9, fontWeight:800, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'.06em' }}>
                {typenLabel[gripMenu.typ]} · {aktionen.length} Möglichkeiten
              </div>
              {eintraege.map(([icon, title, sub, action]) => (
                <button key={title} type="button" onClick={()=>{ action(); setGripMenu(null); }}
                  style={{ width:'100%', display:'grid', gridTemplateColumns:'25px 1fr', gap:5, padding:'7px 8px', border:0, borderRadius:7, background:'transparent', textAlign:'left', cursor:'pointer', color:'#334155' }}>
                  <span style={{ fontSize:15 }}>{icon}</span>
                  <span style={{ fontSize:10.5, fontWeight:750 }}>{title}<span style={{ display:'block', marginTop:1, fontSize:8, fontWeight:500, color:'#94a3b8' }}>{sub}</span></span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {paneMenu && (
        <div onPointerDown={()=>setPaneMenu(null)} style={{ position:'fixed', inset:0, zIndex:3650 }}>
          <div onPointerDown={event=>event.stopPropagation()}
            style={{ position:'fixed', left:Math.min(paneMenu.x, window.innerWidth - 240), top:Math.min(paneMenu.y, window.innerHeight - 260),
              width:225, padding:6, borderRadius:10, background:'white', border:'1px solid #cbd5e1', boxShadow:'0 16px 36px rgba(15,23,42,.24)' }}>
            <div style={{ padding:'4px 8px 6px', fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>
              {paneMenu.active ? modeLabel(paneMenu.mode) : 'Befehle'}
            </div>
            {(paneMenu.snapOverride ? [
              ['○', 'Nur Anschluss', 'Gilt für den nächsten Klick', () => setFangOverride('port')],
              ['□', 'Nur Endpunkt', 'Gilt für den nächsten Klick', () => setFangOverride('endpoint')],
              ['△', 'Nur Mittelpunkt', 'Gilt für den nächsten Klick', () => setFangOverride('midpoint')],
              ['∟', 'Nur Senkrecht', 'Gilt für den nächsten Klick', () => setFangOverride('perpendicular')],
              ['⌛', 'Nur auf Leitung', 'Gilt für den nächsten Klick', () => setFangOverride('nearest')],
            ] : paneMenu.active ? [
              ...(leitungsEntwurfRef.current?.points?.length ? [[
                '✓', 'Fertig', 'Entspricht Enter', () => entwurfAmLetztenPunktAbschliessen(),
              ], [
                '↶', 'Letzten Punkt zurück', 'Entspricht Backspace', () => {
                  const draft = leitungsEntwurfRef.current;
                  if (!draft?.points?.length) return;
                  const next = { ...draft, points:draft.points.slice(0, -1) };
                  leitungsEntwurfRef.current = next; setLeitungsEntwurf(next);
                },
              ]] : []),
              ['×', 'Abbrechen', 'Entspricht ESC', () => {
                entwurfVerwerfen(); setVerschiebung(null); setLuecke(null); setDehnen(null);
                // Auch der Hinweistext der Befehle aus #72 gehört zum Abbruch —
                // sonst bliebe «Stutzen · …» stehen, obwohl nichts mehr läuft.
                setBefehlHinweis(null);
                setTransformBefehl(null); setNeuNummerieren(null);
                setEditorMode(escapeMode(editorModeRef.current));
              }],
            ] : [
              ['↵', 'Letzten Befehl wiederholen', letzteBefehle[0] ? modeLabel(letzteBefehle[0]) : 'Noch kein Befehl', () => wiederholeLetztenRef.current()],
              ...letzteBefehle.map(item => ['⌁', modeLabel(item), 'Erneut starten', () => befehlAusfuehren({ ...item, id:item.type })]),
            ]).map(([icon, title, sub, action], index) => (
              <button key={`${title}-${index}`} type="button" onClick={()=>{ action(); setPaneMenu(null); }}
                style={{ width:'100%', display:'grid', gridTemplateColumns:'25px 1fr', gap:5, padding:'7px 8px', border:0, borderRadius:7, background:'transparent', textAlign:'left', cursor:'pointer', color:title==='Abbrechen'?'#b91c1c':'#334155' }}>
                <span style={{ fontSize:15 }}>{icon}</span>
                <span style={{ fontSize:10.5, fontWeight:750 }}>{title}<span style={{ display:'block', marginTop:1, fontSize:8, fontWeight:500, color:'#94a3b8' }}>{sub}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

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
              // Die drei Modify-Befehle wirken auf die AUSWAHL, nicht nur auf
              // die angeklickte Leitung — der Rechtsklick wählt sie deshalb
              // zuerst aus und startet dann denselben Befehl wie Taste und
              // Werkzeugleiste.
              ['⧉', 'Kopieren (Basispunkt)', 'Basispunkt und Zielpunkt · bleibt für weitere Kopien aktiv',
                () => { setSelectedEdgeId(edgeMenu.edgeId); transformStarten('kopieren', { ganzeLeitungen:true }); }],
              ['◇', 'An Spiegelachse spiegeln', 'Zwei Achspunkte · Original behalten oder ersetzen',
                () => { setSelectedEdgeId(edgeMenu.edgeId); transformStarten('spiegeln'); }],
              ['↻', 'Drehen (Basispunkt)', 'Basispunkt, dann Winkel zeigen oder eintippen',
                () => { setSelectedEdgeId(edgeMenu.edgeId); transformStarten('drehen'); }],
              ['⋯', 'Lineare Reihe', 'Abstand über zwei Punkte, danach die Anzahl',
                () => { setSelectedEdgeId(edgeMenu.edgeId); transformStarten('reihe', { ganzeLeitungen:true }); }],
              // Beschriftung: dieselben zwei Befehle wie im Leitungspanel, hier
              // direkt dort, wo der Planer mit der rechten Maustaste hinzeigt.
              ...(edgesRef.current.find(item=>item.id===edgeMenu.edgeId)?.data?.label_hidden
                ? [['👁', 'Beschriftung einblenden', 'DN und m′ wieder anzeigen',
                  () => beschriftungSetzen(edgeMenu.edgeId, { label_hidden:false })]]
                : [['⃠', 'Beschriftung ausblenden', 'DN und m′ an dieser Leitung verbergen',
                  () => beschriftungSetzen(edgeMenu.edgeId, { label_hidden:true })]]),
              ['⌖', 'Beschriftung zurücksetzen', 'Wieder in die Streckenmitte stellen',
                () => labelZuruecksetzen(edgeMenu.edgeId)],
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
          sr={speicherResults[auslegungNode.id]}
          er={erdsondenResults[auslegungNode.id]}
          br={bwwResults[auslegungNode.id]}
          onUpdate={updateNode}
          onClose={() => setAuslegung(null)}
          navigate={navigate}
        />
      )}

      {/* Schaltungswahl direkt nach dem Ablegen einer Verbraucher- oder Lufterhitzergruppe */}
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
