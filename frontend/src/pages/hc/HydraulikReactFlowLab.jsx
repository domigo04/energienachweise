import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Box,
  Check,
  CircleGauge,
  Flame,
  GitBranch,
  Hand,
  Heater,
  MousePointer2,
  Network,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Waypoints,
} from "lucide-react";
import { getProject } from "../../api/hcApi";
import {
  SymCheckValve,
  SymPWT,
  SymPump,
  SymShutoff,
  SymSpeicher,
  SymValve2V,
  SymValve3,
  SymVerteiler,
  SymWE,
} from "../../components/hc/nodes/symbols";

const GRID = 20;
const COLORS = { vl: "#ef4444", rl: "#3b82f6", neutral: "#475569" };
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const snapPoint = (point) => ({
  x: Math.round(point.x / GRID) * GRID,
  y: Math.round(point.y / GRID) * GRID,
});

const NODE_SPECS = {
  verteiler: {
    label: "Verteiler",
    width: 200,
    height: 78,
    ports: [
      { id: "vl-main", x: 0, y: 16, kind: "vl", side: "left" },
      { id: "rl-main", x: 0, y: 58, kind: "rl", side: "left" },
      ...[36, 83, 130, 177].flatMap((x, index) => [
        { id: `vl-${index + 1}`, x, y: 0, kind: "vl", side: "top" },
        { id: `rl-${index + 1}`, x, y: 42, kind: "rl", side: "top" },
      ]),
    ],
  },
  gruppe: {
    label: "Hydraulikgruppe",
    width: 112,
    height: 250,
    ports: [
      { id: "vl", x: 56, y: 0, kind: "vl", side: "top" },
      { id: "rl", x: 56, y: 250, kind: "rl", side: "bottom" },
    ],
  },
  speicher: {
    label: "Speicher",
    width: 56,
    height: 100,
    ports: [
      { id: "oben", x: 17, y: 0, kind: "vl", side: "top" },
      { id: "oben-rechts", x: 39, y: 0, kind: "vl", side: "top" },
      { id: "unten", x: 17, y: 100, kind: "rl", side: "bottom" },
      { id: "unten-rechts", x: 39, y: 100, kind: "rl", side: "bottom" },
      { id: "links", x: 0, y: 50, kind: "neutral", side: "left" },
      { id: "rechts", x: 56, y: 50, kind: "neutral", side: "right" },
    ],
  },
  erzeuger: {
    label: "Wärmeerzeuger", width: 88, height: 68,
    ports: [
      { id: "vl", x: 44, y: 0, kind: "vl", side: "top" },
      { id: "rl", x: 44, y: 68, kind: "rl", side: "bottom" },
      { id: "links", x: 0, y: 34, kind: "neutral", side: "left" },
      { id: "rechts", x: 88, y: 34, kind: "neutral", side: "right" },
    ],
  },
  heizkreis: {
    label: "Heizkreis", width: 74, height: 74,
    ports: [
      { id: "vl", x: 0, y: 28, kind: "vl", side: "left" },
      { id: "rl", x: 74, y: 28, kind: "rl", side: "right" },
      { id: "oben", x: 37, y: 0, kind: "neutral", side: "top" },
      { id: "unten", x: 37, y: 74, kind: "neutral", side: "bottom" },
    ],
  },
  pumpe: {
    label: "Pumpe", width: 40, height: 40,
    ports: [
      { id: "oben", x: 20, y: 0, kind: "neutral", side: "top" },
      { id: "unten", x: 20, y: 40, kind: "neutral", side: "bottom" },
      { id: "links", x: 0, y: 20, kind: "neutral", side: "left" },
      { id: "rechts", x: 40, y: 20, kind: "neutral", side: "right" },
    ],
  },
  ventil2: {
    label: "2-Weg-Ventil", width: 44, height: 40,
    ports: [
      { id: "oben", x: 33, y: 0, kind: "neutral", side: "top" },
      { id: "unten", x: 33, y: 40, kind: "neutral", side: "bottom" },
    ],
  },
  ventil3: {
    label: "3-Weg-Ventil", width: 52, height: 40,
    ports: [
      { id: "oben", x: 33, y: 0, kind: "neutral", side: "top" },
      { id: "unten", x: 33, y: 40, kind: "neutral", side: "bottom" },
      { id: "rechts", x: 52, y: 20, kind: "neutral", side: "right" },
    ],
  },
  rueckschlag: {
    label: "Rückschlagventil", width: 44, height: 44,
    ports: [
      { id: "oben", x: 22, y: 0, kind: "neutral", side: "top" },
      { id: "unten", x: 22, y: 44, kind: "neutral", side: "bottom" },
      { id: "links", x: 0, y: 22, kind: "neutral", side: "left" },
      { id: "rechts", x: 44, y: 22, kind: "neutral", side: "right" },
    ],
  },
  absperrung: {
    label: "Absperrventil", width: 19, height: 41,
    ports: [
      { id: "oben", x: 9.5, y: 0, kind: "neutral", side: "top" },
      { id: "unten", x: 9.5, y: 41, kind: "neutral", side: "bottom" },
    ],
  },
  pwt: {
    label: "Plattenwärmetauscher", width: 94, height: 68,
    ports: [
      { id: "primaer-vl", x: 25, y: 0, kind: "vl", side: "top" },
      { id: "primaer-rl", x: 25, y: 68, kind: "rl", side: "bottom" },
      { id: "sekundaer-vl", x: 56, y: 0, kind: "vl", side: "top" },
      { id: "sekundaer-rl", x: 56, y: 68, kind: "rl", side: "bottom" },
    ],
  },
};

function initialModel() {
  return {
    nodes: [
      { id: "rf_vt", type: "cadComponent", position: { x: 180, y: 120 }, data: { kind: "verteiler", label: "Verteiler 1" } },
      { id: "rf_g1", type: "cadComponent", position: { x: 220, y: 350 }, data: { kind: "gruppe", label: "Hydraulikgruppe 1" } },
      { id: "rf_g2", type: "cadComponent", position: { x: 430, y: 350 }, data: { kind: "gruppe", label: "Hydraulikgruppe 2" } },
      { id: "rf_sp", type: "cadComponent", position: { x: 720, y: 140 }, data: { kind: "speicher", label: "Technischer Speicher" } },
    ],
    lines: [],
    junctions: [],
  };
}

function HydraulikgruppeSymbol() {
  return (
    <svg viewBox="0 0 112 250" width="112" height="250" aria-hidden="true">
      <line x1="56" y1="0" x2="56" y2="250" stroke="#ef4444" strokeWidth="5" />
      <circle cx="56" cy="54" r="22" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <path d="M35 54 H77 L56 73 Z" fill="#1e293b" />
      <path d="M38 118 L74 92 L74 144 Z" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <path d="M74 118 L38 92 L38 144 Z" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <circle cx="56" cy="118" r="8" fill="#1e293b" />
      <rect x="15" y="170" width="82" height="46" rx="6" fill="#fff7ed" stroke="#f97316" strokeWidth="2" />
      <path d="M25 193 L37 181 L49 193 L61 181 L73 193 L85 181" fill="none" stroke="#f97316" strokeWidth="2" />
      <rect x="49" y="0" width="14" height="7" rx="3" fill="#ef4444" />
      <rect x="49" y="243" width="14" height="7" rx="3" fill="#3b82f6" />
      <line x1="56" y1="216" x2="56" y2="250" stroke="#3b82f6" strokeWidth="5" />
    </svg>
  );
}

function HeizkreisSymbol({ label }) {
  return (
    <div className="flex size-[74px] flex-col items-center justify-center rounded-full border-[2.5px] border-green-600 bg-green-100/70 text-center shadow-sm">
      <Heater className="mb-1 size-5 text-green-700" />
      <span className="max-w-14 truncate text-[9px] font-extrabold leading-tight text-green-800">{label || "Heizkreis"}</span>
      <span className="absolute -left-5 top-[20px] text-[8px] font-extrabold text-red-600">VL</span>
      <span className="absolute -right-5 top-[20px] text-[8px] font-extrabold text-blue-600">RL</span>
    </div>
  );
}

const CadComponentNode = memo(function CadComponentNode({ id, data, selected }) {
  const spec = NODE_SPECS[data.kind];
  return (
    <div
      className={`relative rounded-lg bg-white/95 shadow-sm transition ${selected ? "ring-2 ring-brand-500 ring-offset-4" : ""}`}
      style={{ width: spec.width, height: spec.height }}
    >
      {data.kind === "verteiler" && <SymVerteiler />}
      {data.kind === "gruppe" && <HydraulikgruppeSymbol />}
      {data.kind === "speicher" && <SymSpeicher />}
      {data.kind === "erzeuger" && <SymWE />}
      {data.kind === "heizkreis" && <HeizkreisSymbol label={data.label} />}
      {data.kind === "pumpe" && <SymPump />}
      {data.kind === "ventil2" && <SymValve2V />}
      {data.kind === "ventil3" && <SymValve3 />}
      {data.kind === "rueckschlag" && <SymCheckValve />}
      {data.kind === "absperrung" && <SymShutoff />}
      {data.kind === "pwt" && <SymPWT />}
      {spec.ports.map((port) => {
        const portKey = `${id}:${port.id}`;
        const connected = data.connectedPorts?.has(portKey);
        const targeted = data.activePortKey === portKey;
        const color = COLORS[port.kind] || COLORS.neutral;
        return (
          <button
            key={port.id}
            type="button"
            title={`${port.kind === "vl" ? "Vorlauf" : port.kind === "rl" ? "Rücklauf" : "Anschluss"}${connected ? " · verbunden" : " · frei"}`}
            aria-label={`${data.label}: Anschluss ${port.id}`}
            className={`nodrag nopan absolute z-20 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full transition ${data.isDrawing || selected ? "bg-white/40" : "bg-transparent"}`}
            style={{ left: port.x, top: port.y }}
            onPointerDown={(event) => data.onPortPointerDown?.(event, id, port)}
            onPointerEnter={() => data.onPortPointerEnter?.(id, port)}
            onPointerLeave={() => data.onPortPointerLeave?.(id, port)}
          >
            {targeted && <span className="absolute inset-0 animate-pulse rounded-full border-[3px] border-emerald-500 bg-emerald-100/60" />}
            <span
              className={`absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md transition ${connected ? "ring-2 ring-slate-800 ring-offset-1" : "hover:scale-125"}`}
              style={{ background: color }}
            />
            {connected && <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />}
          </button>
        );
      })}
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
        {data.label}
      </div>
    </div>
  );
});

const NODE_TYPES = { cadComponent: CadComponentNode };

function endpointPosition(nodes, junctions, endpoint) {
  if (endpoint?.junctionId) {
    const junction = junctions.find((item) => item.id === endpoint.junctionId);
    return junction ? { x: junction.x, y: junction.y } : null;
  }
  if (endpoint?.nodeId) {
    const node = nodes.find((item) => item.id === endpoint.nodeId);
    const spec = node && NODE_SPECS[node.data.kind];
    const port = spec?.ports.find((item) => item.id === endpoint.portId);
    return node && port ? { x: node.position.x + port.x, y: node.position.y + port.y } : null;
  }
  return Number.isFinite(endpoint?.x) && Number.isFinite(endpoint?.y)
    ? { x: endpoint.x, y: endpoint.y }
    : null;
}

function endpointPort(nodes, endpoint) {
  if (!endpoint?.nodeId) return null;
  const node = nodes.find((item) => item.id === endpoint.nodeId);
  return node ? NODE_SPECS[node.data.kind]?.ports.find((port) => port.id === endpoint.portId) || null : null;
}

function orthogonalJoin(anchor, end, endPort) {
  if (!anchor || !end || anchor.x === end.x || anchor.y === end.y) return null;
  if (["top", "bottom"].includes(endPort?.side)) return { x: end.x, y: anchor.y };
  if (["left", "right"].includes(endPort?.side)) return { x: anchor.x, y: end.y };
  return Math.abs(end.x - anchor.x) >= Math.abs(end.y - anchor.y)
    ? { x: end.x, y: anchor.y }
    : { x: anchor.x, y: end.y };
}

function lineRoute(nodes, junctions, line) {
  const start = endpointPosition(nodes, junctions, line.start);
  const end = endpointPosition(nodes, junctions, line.end);
  if (!start || !end) return [];
  return [start, ...(line.points || []), end];
}

function nearestPort(nodes, point, radius = 22, excludedEndpoint = null, desiredKind = null) {
  let nearest = null;
  for (const node of nodes) {
    const spec = NODE_SPECS[node.data.kind];
    for (const port of spec.ports) {
      if (excludedEndpoint?.nodeId === node.id && excludedEndpoint?.portId === port.id) continue;
      if (desiredKind && port.kind !== "neutral" && port.kind !== desiredKind) continue;
      const position = { x: node.position.x + port.x, y: node.position.y + port.y };
      const distance = Math.hypot(point.x - position.x, point.y - position.y);
      if (distance <= radius && (!nearest || distance < nearest.distance)) {
        nearest = { distance, position, endpoint: { nodeId: node.id, portId: port.id }, kind: port.kind };
      }
    }
  }
  return nearest;
}

function projectOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return null;
  const rawT = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = { x: a.x + t * dx, y: a.y + t * dy };
  return { ...projected, t, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
}

function nearestLineMiddle(nodes, junctions, lines, point, excludedLineId, radius = 18) {
  let nearest = null;
  for (const line of lines) {
    if (line.id === excludedLineId) continue;
    const route = lineRoute(nodes, junctions, line);
    for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex += 1) {
      const hit = projectOnSegment(point, route[segmentIndex], route[segmentIndex + 1]);
      // Ein T-Stück darf nur in der Leitung entstehen, nie praktisch auf einem
      // vorhandenen Endpunkt. Kreuzende Leitungen werden hier nicht betrachtet.
      if (!hit || hit.t <= 0.06 || hit.t >= 0.94 || hit.distance > radius) continue;
      if (!nearest || hit.distance < nearest.distance) nearest = { ...hit, lineId: line.id, segmentIndex };
    }
  }
  return nearest;
}

function constrainedPoint(point, anchor, orthogonal) {
  const snapped = snapPoint(point);
  if (!orthogonal || !anchor) return snapped;
  return Math.abs(snapped.x - anchor.x) >= Math.abs(snapped.y - anchor.y)
    ? { x: snapped.x, y: anchor.y }
    : { x: anchor.x, y: snapped.y };
}

function pointsAttribute(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function loadModel(projectId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`hc-reactflow-cad:v1:${projectId}`));
    if (saved?.nodes && saved?.lines && saved?.junctions) return saved;
  } catch {
    // Defekte lokale Versuche dürfen das Lab nicht blockieren.
  }
  return initialModel();
}

function EditorInner() {
  const { id: projectId } = useParams();
  const initial = useMemo(() => loadModel(projectId), [projectId]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [lines, setLines] = useState(initial.lines);
  const [junctions, setJunctions] = useState(initial.junctions);
  const [projectName, setProjectName] = useState("Projekt");
  const [mode, setMode] = useState("select");
  const [lineKind, setLineKind] = useState("vl");
  const [orthogonal, setOrthogonal] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [snapPreview, setSnapPreview] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const { screenToFlowPosition, fitView, getZoom } = useReactFlow();
  const nodesRef = useRef(nodes);
  const linesRef = useRef(lines);
  const junctionsRef = useRef(junctions);
  const modeRef = useRef(mode);
  const draftRef = useRef(draft);
  const cursorRef = useRef(cursor);
  const orthogonalRef = useRef(orthogonal);
  const lineKindRef = useRef(lineKind);
  const dragRef = useRef(null);
  const portGestureRef = useRef(null);
  const frameRef = useRef(null);
  const cursorFrameRef = useRef(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { junctionsRef.current = junctions; }, [junctions]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { orthogonalRef.current = orthogonal; }, [orthogonal]);
  useEffect(() => { lineKindRef.current = lineKind; }, [lineKind]);

  useEffect(() => {
    getProject(projectId).then((project) => setProjectName(project.name)).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cleanNodes = nodes.map((node) => ({ ...node, data: { kind: node.data.kind, label: node.data.label } }));
      localStorage.setItem(`hc-reactflow-cad:v1:${projectId}`, JSON.stringify({ nodes: cleanNodes, lines, junctions }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [junctions, lines, nodes, projectId]);

  const snapshot = useCallback(() => ({
    nodes: nodesRef.current.map((node) => ({ ...node, position: { ...node.position }, data: { kind: node.data.kind, label: node.data.label } })),
    lines: structuredClone(linesRef.current),
    junctions: structuredClone(junctionsRef.current),
  }), []);

  const restore = useCallback((state) => {
    setNodes(state.nodes);
    setLines(state.lines);
    setJunctions(state.junctions);
    setSelectedLineId(null);
    setSelectedNodeId(null);
    setDraft(null);
  }, [setNodes]);

  const checkpoint = useCallback(() => {
    setUndoStack((items) => [...items.slice(-39), snapshot()]);
    setRedoStack([]);
  }, [snapshot]);

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((items) => [...items, snapshot()]);
    setUndoStack((items) => items.slice(0, -1));
    restore(previous);
  }, [restore, snapshot, undoStack]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((items) => [...items, snapshot()]);
    setRedoStack((items) => items.slice(0, -1));
    restore(next);
  }, [redoStack, restore, snapshot]);

  const pointerFlow = useCallback((event) => screenToFlowPosition({ x: event.clientX, y: event.clientY }), [screenToFlowPosition]);

  const lastDraftPoint = useCallback((activeDraft) => {
    if (!activeDraft) return null;
    return activeDraft.points.at(-1) || endpointPosition(nodesRef.current, junctionsRef.current, activeDraft.start);
  }, []);

  const beginDraft = useCallback((nextDraft, nextKind = nextDraft.kind) => {
    draftRef.current = nextDraft;
    modeRef.current = "line";
    lineKindRef.current = nextKind;
    setDraft(nextDraft);
    setMode("line");
    setLineKind(nextKind);
    setSelectedLineId(null);
    setSelectedNodeId(null);
  }, []);

  const finishDraft = useCallback((endpoint, junctionHit = null) => {
    const activeDraft = draftRef.current;
    const activeCursor = cursorRef.current;
    if (!activeDraft) return;
    const junction = junctionHit
      ? { id: uid("junction"), x: junctionHit.x, y: junctionHit.y, hostLineId: junctionHit.lineId }
      : null;
    const resolvedEnd = junction
      ? { junctionId: junction.id }
      : endpoint || (activeCursor ? { ...constrainedPoint(activeCursor, lastDraftPoint(activeDraft), orthogonalRef.current) } : null);
    if (!resolvedEnd) return;
    const endPosition = junction || endpointPosition(nodesRef.current, junctionsRef.current, resolvedEnd) || resolvedEnd;
    const anchor = lastDraftPoint(activeDraft);
    const endPort = endpointPort(nodesRef.current, resolvedEnd);
    const join = orthogonalRef.current ? orthogonalJoin(anchor, endPosition, endPort) : null;
    const finalPoints = join
      && (join.x !== anchor?.x || join.y !== anchor?.y)
      && (join.x !== endPosition.x || join.y !== endPosition.y)
      ? [...activeDraft.points, join]
      : activeDraft.points;
    checkpoint();
    if (junction) setJunctions((items) => [...items, junction]);
    setLines((items) => {
      let nextItems = junction ? items.map((line) => {
        if (line.id !== junctionHit.lineId) return line;
        const points = [...(line.points || [])];
        points.splice(junctionHit.segmentIndex, 0, { x: junction.x, y: junction.y, junctionId: junction.id });
        return { ...line, points };
      }) : items;
      if (activeDraft.extendLineId) {
        nextItems = nextItems.map((line) => {
        if (line.id !== activeDraft.extendLineId) return line;
        const oldPosition = endpointPosition(nodesRef.current, junctionsRef.current, activeDraft.start);
        if (activeDraft.extendSide === "end") {
            return { ...line, points: [...(line.points || []), oldPosition, ...finalPoints], end: resolvedEnd };
        }
          return { ...line, points: [...finalPoints].reverse().concat(oldPosition, line.points || []), start: resolvedEnd };
        });
      } else {
        nextItems = [...nextItems, { id: uid("line"), kind: activeDraft.kind, start: activeDraft.start, points: finalPoints, end: resolvedEnd }];
      }
      return nextItems;
    });
    draftRef.current = null;
    setDraft(null);
    modeRef.current = "select";
    setMode("select");
    setSnapPreview(null);
  }, [checkpoint, lastDraftPoint]);

  const finishDraftAtPoint = useCallback((rawPoint) => {
    const activeDraft = draftRef.current;
    if (!activeDraft) return;
    const radius = 28 / Math.max(getZoom(), 0.2);
    const portHit = nearestPort(nodesRef.current, rawPoint, radius, activeDraft.start, activeDraft.kind);
    if (portHit) {
      finishDraft(portHit.endpoint);
      return;
    }
    const lineHit = nearestLineMiddle(
      nodesRef.current,
      junctionsRef.current,
      linesRef.current,
      rawPoint,
      activeDraft.extendLineId,
      22 / Math.max(getZoom(), 0.2),
    );
    if (lineHit) {
      finishDraft(null, lineHit);
      return;
    }
    cursorRef.current = rawPoint;
    finishDraft();
  }, [finishDraft, getZoom]);

  const handlePaneClick = useCallback((event) => {
    if (mode !== "line") {
      setSelectedLineId(null);
      setSelectedNodeId(null);
      return;
    }
    const raw = pointerFlow(event);
    if (!draft) {
      const start = snapPoint(raw);
      beginDraft({ kind: lineKind, start, points: [], extendLineId: null, extendSide: null });
      setCursor(start);
      return;
    }
    if (snapPreview?.type === "port") {
      finishDraft(snapPreview.endpoint);
      return;
    }
    if (snapPreview?.type === "junction") {
      finishDraft(null, snapPreview);
      return;
    }
    const point = constrainedPoint(raw, lastDraftPoint(draft), orthogonal);
    setDraft((active) => ({ ...active, points: [...active.points, point] }));
  }, [beginDraft, draft, finishDraft, lastDraftPoint, lineKind, mode, orthogonal, pointerFlow, snapPreview]);

  const handlePortPointerDown = useCallback((event, nodeId, port) => {
    event.preventDefault();
    event.stopPropagation();
    const endpoint = { nodeId, portId: port.id };
    const kind = port.kind === "neutral" ? lineKindRef.current : port.kind;
    if (draftRef.current && port.kind !== "neutral" && port.kind !== draftRef.current.kind) return;
    if (modeRef.current !== "line") {
      beginDraft({ kind, start: endpoint, points: [], extendLineId: null, extendSide: null }, kind);
      portGestureRef.current = { x: event.clientX, y: event.clientY, moved: false };
      return;
    }
    if (!draftRef.current) {
      beginDraft({ kind, start: endpoint, points: [], extendLineId: null, extendSide: null }, kind);
      portGestureRef.current = { x: event.clientX, y: event.clientY, moved: false };
    } else {
      finishDraft(endpoint);
    }
  }, [beginDraft, finishDraft]);

  const handlePortPointerEnter = useCallback((nodeId, port) => {
    if (!draftRef.current) return;
    if (port.kind !== "neutral" && port.kind !== draftRef.current.kind) return;
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    setSnapPreview({
      x: node.position.x + port.x,
      y: node.position.y + port.y,
      type: "port",
      endpoint: { nodeId, portId: port.id },
    });
  }, []);

  const handlePortPointerLeave = useCallback((nodeId, port) => {
    setSnapPreview((current) => current?.type === "port"
      && current.endpoint.nodeId === nodeId
      && current.endpoint.portId === port.id ? null : current);
  }, []);

  const updateDraftPointer = useCallback((rawPoint) => {
    const activeDraft = draftRef.current;
    if (!activeDraft) return;
    if (cursorFrameRef.current) cancelAnimationFrame(cursorFrameRef.current);
    cursorFrameRef.current = requestAnimationFrame(() => {
      cursorRef.current = rawPoint;
      setCursor(rawPoint);
      const zoom = Math.max(getZoom(), 0.2);
      const portHit = nearestPort(nodesRef.current, rawPoint, 28 / zoom, activeDraft.start, activeDraft.kind);
      if (portHit) {
        setSnapPreview({ ...portHit.position, type: "port", endpoint: portHit.endpoint });
        return;
      }
      const lineHit = nearestLineMiddle(
        nodesRef.current,
        junctionsRef.current,
        linesRef.current,
        rawPoint,
        activeDraft.extendLineId,
        22 / zoom,
      );
      setSnapPreview(lineHit ? { ...lineHit, type: "junction" } : null);
    });
  }, [getZoom]);

  useEffect(() => {
    const handleGestureMove = (event) => {
      const gesture = portGestureRef.current;
      if (!gesture) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) gesture.moved = true;
      if (gesture.moved) updateDraftPointer(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    };
    const handleGestureUp = (event) => {
      const gesture = portGestureRef.current;
      if (!gesture) return;
      portGestureRef.current = null;
      if (gesture.moved) finishDraftAtPoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    };
    window.addEventListener("pointermove", handleGestureMove, { passive: true });
    window.addEventListener("pointerup", handleGestureUp);
    return () => {
      window.removeEventListener("pointermove", handleGestureMove);
      window.removeEventListener("pointerup", handleGestureUp);
    };
  }, [finishDraftAtPoint, screenToFlowPosition, updateDraftPointer]);

  const connectedPorts = useMemo(() => {
    const keys = new Set();
    lines.forEach((line) => {
      if (line.start?.nodeId) keys.add(`${line.start.nodeId}:${line.start.portId}`);
      if (line.end?.nodeId) keys.add(`${line.end.nodeId}:${line.end.portId}`);
    });
    return keys;
  }, [lines]);

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onPortPointerDown: handlePortPointerDown,
      onPortPointerEnter: handlePortPointerEnter,
      onPortPointerLeave: handlePortPointerLeave,
      connectedPorts,
      activePortKey: snapPreview?.type === "port" ? `${snapPreview.endpoint.nodeId}:${snapPreview.endpoint.portId}` : null,
      isDrawing: mode === "line",
    },
  })), [connectedPorts, handlePortPointerDown, handlePortPointerEnter, handlePortPointerLeave, mode, nodes, snapPreview]);

  const addComponent = useCallback((kind) => {
    checkpoint();
    const spec = NODE_SPECS[kind];
    setNodes((items) => [...items, {
      id: uid(`rf_${kind}`),
      type: "cadComponent",
      position: { x: 420 + items.length * 24, y: 180 + items.length * 18 },
      data: { kind, label: `${spec.label} ${items.filter((item) => item.data.kind === kind).length + 1}` },
    }]);
    setMode("select");
  }, [checkpoint, setNodes]);

  const finishEndpointDrop = useCallback((lineId, side, point) => {
    const zoom = Math.max(getZoom(), 0.2);
    const lineKindForSnap = linesRef.current.find((line) => line.id === lineId)?.kind;
    const portHit = nearestPort(nodesRef.current, point, 28 / zoom, null, lineKindForSnap);
    if (portHit) {
      setLines((items) => items.map((line) => line.id === lineId ? { ...line, [side]: portHit.endpoint } : line));
      setSnapPreview(null);
      return;
    }
    const lineHit = nearestLineMiddle(nodesRef.current, junctionsRef.current, linesRef.current, point, lineId, 22 / zoom);
    if (lineHit) {
      const junctionId = uid("junction");
      const junction = { id: junctionId, x: lineHit.x, y: lineHit.y, hostLineId: lineHit.lineId };
      setJunctions((items) => [...items, junction]);
      setLines((items) => items.map((line) => {
        if (line.id === lineHit.lineId) {
          const points = [...(line.points || [])];
          points.splice(lineHit.segmentIndex, 0, { x: lineHit.x, y: lineHit.y, junctionId });
          return { ...line, points };
        }
        return line.id === lineId ? { ...line, [side]: { junctionId } } : line;
      }));
      setSnapPreview(null);
      return;
    }
    setLines((items) => items.map((line) => line.id === lineId ? { ...line, [side]: snapPoint(point) } : line));
    setSnapPreview(null);
  }, [getZoom]);

  const beginHandleDrag = useCallback((event, lineId, handleType, index = null) => {
    event.preventDefault();
    event.stopPropagation();
    checkpoint();
    if (handleType === "start" || handleType === "end") {
      const line = linesRef.current.find((item) => item.id === lineId);
      const junctionId = line?.[handleType]?.junctionId;
      const junction = junctionId && junctionsRef.current.find((item) => item.id === junctionId);
      if (junction) {
        const stillUsed = linesRef.current.some((item) => item.id !== lineId
          && (item.start?.junctionId === junctionId || item.end?.junctionId === junctionId));
        setLines((items) => items.map((item) => {
          let next = item;
          if (item.id === lineId) next = { ...next, [handleType]: { x: junction.x, y: junction.y } };
          if (!stillUsed && (item.points || []).some((point) => point.junctionId === junctionId)) {
            next = { ...next, points: (next.points || []).filter((point) => point.junctionId !== junctionId) };
          }
          return next;
        }));
        if (!stillUsed) setJunctions((items) => items.filter((item) => item.id !== junctionId));
      }
    }
    dragRef.current = { lineId, handleType, index };
    setSelectedLineId(lineId);
  }, [checkpoint]);

  useEffect(() => {
    const handleMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = snapPoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        if (drag.handleType === "point") {
          const currentLine = linesRef.current.find((line) => line.id === drag.lineId);
          const junctionId = currentLine?.points?.[drag.index]?.junctionId;
          if (junctionId) {
            setJunctions((items) => items.map((item) => item.id === junctionId ? { ...item, x: point.x, y: point.y } : item));
          }
        }
        setLines((items) => items.map((line) => {
          if (line.id !== drag.lineId) return line;
          if (drag.handleType === "point") {
            const points = [...(line.points || [])];
            const previous = points[drag.index];
            points[drag.index] = { ...previous, x: point.x, y: point.y };
            return { ...line, points };
          }
          return { ...line, [drag.handleType]: point };
        }));
        if (drag.handleType === "start" || drag.handleType === "end") {
          const zoom = Math.max(getZoom(), 0.2);
          const lineKindForSnap = linesRef.current.find((line) => line.id === drag.lineId)?.kind;
          const portHit = nearestPort(nodesRef.current, point, 28 / zoom, null, lineKindForSnap);
          const lineHit = portHit ? null : nearestLineMiddle(nodesRef.current, junctionsRef.current, linesRef.current, point, drag.lineId, 22 / zoom);
          setSnapPreview(portHit ? { ...portHit.position, type: "port", endpoint: portHit.endpoint } : lineHit ? { ...lineHit, type: "junction" } : null);
        }
      });
    };
    const handleUp = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.handleType === "start" || drag.handleType === "end") {
        finishEndpointDrop(drag.lineId, drag.handleType, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }
    };
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (cursorFrameRef.current) cancelAnimationFrame(cursorFrameRef.current);
    };
  }, [finishEndpointDrop, getZoom, screenToFlowPosition]);

  const deleteSelectedLine = useCallback(() => {
    if (!selectedLineId) return;
    checkpoint();
    const usedJunctionIds = new Set();
    const remaining = linesRef.current.filter((line) => line.id !== selectedLineId);
    remaining.forEach((line) => {
      if (line.start?.junctionId) usedJunctionIds.add(line.start.junctionId);
      if (line.end?.junctionId) usedJunctionIds.add(line.end.junctionId);
    });
    const keptJunctions = junctionsRef.current.filter((junction) => usedJunctionIds.has(junction.id));
    const keptIds = new Set(keptJunctions.map((junction) => junction.id));
    setJunctions(keptJunctions);
    setLines(remaining.map((line) => ({ ...line, points: (line.points || []).filter((point) => !point.junctionId || keptIds.has(point.junctionId)) })));
    setSelectedLineId(null);
  }, [checkpoint, selectedLineId]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    checkpoint();
    const remaining = linesRef.current.filter((line) => line.start?.nodeId !== selectedNodeId && line.end?.nodeId !== selectedNodeId);
    const usedJunctionIds = new Set();
    remaining.forEach((line) => {
      if (line.start?.junctionId) usedJunctionIds.add(line.start.junctionId);
      if (line.end?.junctionId) usedJunctionIds.add(line.end.junctionId);
    });
    const keptJunctions = junctionsRef.current.filter((junction) => usedJunctionIds.has(junction.id));
    const keptIds = new Set(keptJunctions.map((junction) => junction.id));
    setNodes((items) => items.filter((node) => node.id !== selectedNodeId));
    setLines(remaining.map((line) => ({ ...line, points: (line.points || []).filter((point) => !point.junctionId || keptIds.has(point.junctionId)) })));
    setJunctions(keptJunctions);
    setSelectedNodeId(null);
  }, [checkpoint, selectedNodeId, setNodes]);

  const extendLine = useCallback((side) => {
    const line = lines.find((item) => item.id === selectedLineId);
    if (!line) return;
    beginDraft({ kind: line.kind, start: line[side], points: [], extendLineId: line.id, extendSide: side }, line.kind);
  }, [beginDraft, lines, selectedLineId]);

  const resetLab = useCallback(() => {
    if (!window.confirm("React-Flow-Versuch auf den Ausgangszustand zurücksetzen?")) return;
    checkpoint();
    restore(initialModel());
  }, [checkpoint, restore]);

  useEffect(() => {
    const handleKey = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Escape") {
        draftRef.current = null;
        modeRef.current = "select";
        setDraft(null);
        setMode("select");
        setSnapPreview(null);
      } else if (event.key === "Enter" && draft) {
        event.preventDefault();
        if (cursorRef.current) finishDraftAtPoint(cursorRef.current);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedLineId && !draft) {
        event.preventDefault();
        deleteSelectedLine();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeId && !draft) {
        event.preventDefault();
        deleteSelectedNode();
      } else if (event.key === "Backspace" && draft?.points.length) {
        event.preventDefault();
        setDraft((active) => ({ ...active, points: active.points.slice(0, -1) }));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deleteSelectedLine, deleteSelectedNode, draft, finishDraftAtPoint, redo, selectedLineId, selectedNodeId, undo]);

  const draftRoute = useMemo(() => {
    if (!draft) return [];
    const start = endpointPosition(nodes, junctions, draft.start);
    const anchor = draft.points.at(-1) || start;
    const preview = snapPreview
      ? { x: snapPreview.x, y: snapPreview.y }
      : cursor ? constrainedPoint(cursor, anchor, orthogonal) : null;
    const previewPort = snapPreview?.type === "port" ? endpointPort(nodes, snapPreview.endpoint) : null;
    const join = orthogonal && snapPreview ? orthogonalJoin(anchor, preview, previewPort) : null;
    return [start, ...draft.points, join, preview].filter((point, index, all) => point
      && (!index || point.x !== all[index - 1]?.x || point.y !== all[index - 1]?.y));
  }, [cursor, draft, junctions, nodes, orthogonal, snapPreview]);

  const selectedLine = lines.find((line) => line.id === selectedLineId);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedNodeConnections = selectedNodeId
    ? lines.filter((line) => line.start?.nodeId === selectedNodeId || line.end?.nodeId === selectedNodeId).length
    : 0;
  const nodeCount = nodes.length;

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="z-30 flex min-h-16 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-4">
        <Link to={`/projekte/${projectId}`} className="btn-ghost min-h-10 px-2" title="Zurück zum Projekt"><ArrowLeft className="size-5" /></Link>
        <div className="mr-auto min-w-0">
          <div className="truncate text-sm font-extrabold text-slate-900">{projectName}</div>
          <div className="text-[11px] font-semibold text-indigo-600">React-Flow-CAD · separater Versuch</div>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <ToolButton active={mode === "select"} title="Auswählen" onClick={() => { modeRef.current = "select"; draftRef.current = null; setMode("select"); setDraft(null); }} icon={MousePointer2} />
          <ToolButton active={mode === "pan"} title="Verschieben" onClick={() => { modeRef.current = "pan"; draftRef.current = null; setMode("pan"); setDraft(null); }} icon={Hand} />
          <ToolButton active={mode === "line"} title="Polylinie" onClick={() => { modeRef.current = "line"; setMode("line"); }} icon={Waypoints} />
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button onClick={() => { lineKindRef.current = "vl"; setLineKind("vl"); }} className={`min-h-9 rounded-lg px-3 text-xs font-extrabold ${lineKind === "vl" ? "bg-red-100 text-red-700" : "text-slate-500 hover:bg-slate-50"}`}>VL</button>
          <button onClick={() => { lineKindRef.current = "rl"; setLineKind("rl"); }} className={`min-h-9 rounded-lg px-3 text-xs font-extrabold ${lineKind === "rl" ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}>RL</button>
          <button onClick={() => setOrthogonal((value) => !value)} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${orthogonal ? "bg-indigo-100 text-indigo-700" : "text-slate-500"}`}>90°</button>
        </div>

        <div className="flex items-center gap-1">
          <ToolButton disabled={!undoStack.length} title="Rückgängig" onClick={undo} icon={Undo2} />
          <ToolButton disabled={!redoStack.length} title="Wiederholen" onClick={redo} icon={Redo2} />
          <ToolButton title="Ansicht einpassen" onClick={() => fitView({ padding: 0.18, duration: 350 })} icon={Network} />
          <ToolButton title="Versuch zurücksetzen" onClick={resetLab} icon={RotateCcw} />
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <aside className="absolute bottom-3 left-3 top-3 z-30 w-[184px] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:bottom-4 sm:left-4 sm:top-4 sm:w-[220px]">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Erzeugung & Verteilung</div>
          <ComponentButton icon={Flame} label="Wärmeerzeuger" onClick={() => addComponent("erzeuger")} />
          <ComponentButton icon={Network} label="Verteiler" onClick={() => addComponent("verteiler")} />
          <ComponentButton icon={GitBranch} label="Hydraulikgruppe" onClick={() => addComponent("gruppe")} />
          <ComponentButton icon={Box} label="Speicher" onClick={() => addComponent("speicher")} />
          <ComponentButton icon={Heater} label="Heizkreis" onClick={() => addComponent("heizkreis")} />
          <div className="my-3 border-t border-slate-100" />
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Armaturen</div>
          <ComponentButton icon={CircleGauge} label="Pumpe" onClick={() => addComponent("pumpe")} />
          <ComponentButton icon={SlidersHorizontal} label="2-Weg-Ventil" onClick={() => addComponent("ventil2")} />
          <ComponentButton icon={SlidersHorizontal} label="3-Weg-Ventil" onClick={() => addComponent("ventil3")} />
          <ComponentButton icon={SlidersHorizontal} label="Rückschlagventil" onClick={() => addComponent("rueckschlag")} />
          <ComponentButton icon={SlidersHorizontal} label="Absperrventil" onClick={() => addComponent("absperrung")} />
          <ComponentButton icon={Network} label="Plattenwärmetauscher" onClick={() => addComponent("pwt")} />
          <div className="my-3 border-t border-slate-100" />
          <div className="space-y-1 text-[11px] leading-relaxed text-slate-500">
            <div><b>Schnell verbinden:</b> Anschluss greifen, zum Ziel ziehen und loslassen.</div>
            <div><b>Freier Start:</b> Polylinie wählen und in die Fläche klicken.</div>
            <div><b>T-Stück:</b> Nur ein Leitungsende auf die Mitte einer Leitung ziehen.</div>
          </div>
        </aside>

        {selectedLine && (
          <aside className="absolute bottom-4 right-4 z-30 w-[260px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">{selectedLine.kind === "vl" ? "Vorlauf" : "Rücklauf"}-Leitung</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Anfang: {selectedLine.start?.nodeId ? "verbunden" : selectedLine.start?.junctionId ? "T-Stück" : "frei"} · Ende: {selectedLine.end?.nodeId ? "verbunden" : selectedLine.end?.junctionId ? "T-Stück" : "frei"}
                </div>
              </div>
              <button className="btn-ghost min-h-9 px-2 text-red-600" onClick={deleteSelectedLine} title="Leitung löschen"><Trash2 className="size-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-secondary min-h-10 justify-center text-xs" onClick={() => extendLine("start")}>Anfang verlängern</button>
              <button className="btn-secondary min-h-10 justify-center text-xs" onClick={() => extendLine("end")}>Ende verlängern</button>
            </div>
          </aside>
        )}

        {selectedNode && !selectedLine && (
          <aside className="absolute bottom-4 right-4 z-30 w-[280px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">{NODE_SPECS[selectedNode.data.kind]?.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{selectedNodeConnections} verbundene {selectedNodeConnections === 1 ? "Leitung" : "Leitungen"}</div>
              </div>
              <button className="btn-ghost min-h-9 px-2 text-red-600" onClick={deleteSelectedNode} title="Bauteil samt angeschlossenen Leitungen löschen"><Trash2 className="size-4" /></button>
            </div>
            <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Bezeichnung</label>
            <input
              className="input mt-1"
              value={selectedNode.data.label || ""}
              onFocus={checkpoint}
              onChange={(event) => setNodes((items) => items.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label: event.target.value } } : node))}
            />
            <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-800">
              Farbiger Punkt = frei · Punkt mit dunklem Ring = verbunden. Leitung am Endgriff wegziehen, um sie zu lösen oder neu einzurasten.
            </div>
          </aside>
        )}

        {draft && (
          <div className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg">
            <Waypoints className="size-4" /> {snapPreview?.type === "port" ? "Am Bauteilanschluss einrasten" : snapPreview?.type === "junction" ? "T-Verbindung erstellen" : "Leitung zeichnen · Klick = Punkt · Enter = fertig"}
            <button onClick={() => cursorRef.current && finishDraftAtPoint(cursorRef.current)} className="ml-1 rounded-full bg-white/20 p-1 hover:bg-white/30" title="Abschliessen"><Check className="size-4" /></button>
          </div>
        )}

        <ReactFlow
          nodes={displayNodes}
          edges={[]}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStart={checkpoint}
          onNodeClick={(event, node) => { event.stopPropagation(); setSelectedLineId(null); setSelectedNodeId(node.id); }}
          onPaneClick={handlePaneClick}
          onPaneMouseMove={(event) => {
            if (!draft) return;
            updateDraftPointer(pointerFlow(event));
          }}
          onPaneContextMenu={(event) => {
            if (!draft) return;
            event.preventDefault();
            finishDraftAtPoint(pointerFlow(event));
          }}
          onMoveStart={() => setSnapPreview(null)}
          panOnDrag={mode === "pan" || mode === "select"}
          nodesDraggable={mode === "select"}
          nodesConnectable={false}
          deleteKeyCode={null}
          elementsSelectable={mode === "select"}
          selectNodesOnDrag={false}
          snapToGrid
          snapGrid={[GRID, GRID]}
          minZoom={0.2}
          maxZoom={3}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          proOptions={{ hideAttribution: true }}
          className={mode === "line" ? "cursor-crosshair" : mode === "pan" ? "cursor-grab" : ""}
        >
          <Background gap={GRID} size={1} color="#cbd5e1" />
          <Controls position="bottom-left" showInteractive={false} />
          <ViewportPortal>
            <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" style={{ pointerEvents: "none" }}>
              {lines.map((line) => {
                const route = lineRoute(nodes, junctions, line);
                if (route.length < 2) return null;
                const selected = selectedLineId === line.id;
                return (
                  <g key={line.id}>
                    <polyline
                      points={pointsAttribute(route)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="22"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onPointerDown={(event) => { event.stopPropagation(); modeRef.current = "select"; setSelectedNodeId(null); setSelectedLineId(line.id); setMode("select"); }}
                    />
                    {selected && <polyline points={pointsAttribute(route)} fill="none" stroke="#0f172a" strokeWidth="10" opacity="0.14" strokeLinejoin="round" strokeLinecap="round" />}
                    <polyline points={pointsAttribute(route)} fill="none" stroke={COLORS[line.kind]} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
                    {selected && (line.points || []).map((point, index) => (
                      <circle
                        key={`${line.id}-p-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={point.junctionId ? 7 : 6}
                        fill={point.junctionId ? "#0f172a" : "white"}
                        stroke={COLORS[line.kind]}
                        strokeWidth="3"
                        style={{ pointerEvents: "all", cursor: "move" }}
                        onPointerDown={(event) => beginHandleDrag(event, line.id, "point", index)}
                      />
                    ))}
                    {selected && ["start", "end"].map((side) => {
                      const point = endpointPosition(nodes, junctions, line[side]);
                      return point && (
                        <circle
                          key={`${line.id}-${side}`}
                          cx={point.x}
                          cy={point.y}
                          r="8"
                          fill="white"
                          stroke={COLORS[line.kind]}
                          strokeWidth="4"
                          style={{ pointerEvents: "all", cursor: "crosshair" }}
                          onPointerDown={(event) => beginHandleDrag(event, line.id, side)}
                        />
                      );
                    })}
                  </g>
                );
              })}
              {draftRoute.length >= 2 && (
                <polyline points={pointsAttribute(draftRoute)} fill="none" stroke={COLORS[draft.kind]} strokeWidth="5" strokeDasharray="12 7" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {junctions.map((junction) => (
                <circle key={junction.id} cx={junction.x} cy={junction.y} r="6" fill="#0f172a" stroke="white" strokeWidth="2" />
              ))}
              {snapPreview && (
                <circle cx={snapPreview.x} cy={snapPreview.y} r="13" fill="none" stroke={snapPreview.type === "junction" ? "#7c3aed" : "#16a34a"} strokeWidth="4" strokeDasharray="5 3" />
              )}
            </svg>
          </ViewportPortal>
        </ReactFlow>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-[11px] font-semibold text-slate-500 shadow-sm sm:block">
          {nodeCount} Bauteile · {lines.length} Leitungen · {junctions.length} echte T-Verbindungen · lokal automatisch gespeichert
        </div>
      </div>

      <footer className="z-20 flex min-h-10 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 text-[11px] text-slate-500 sm:px-4">
        <span>React Flow = Kamera & Bauteile · eigene CAD-Ebene = freie Leitungen</span>
        <div className="flex items-center gap-3">
          <Link to={`/projekte/${projectId}/schema-cad`} className="font-bold text-slate-600 hover:text-brand-600">Konva vergleichen</Link>
          <Link to={`/projekte/${projectId}/schema`} className="font-bold text-slate-600 hover:text-brand-600">Alter Editor</Link>
        </div>
      </footer>
    </div>
  );
}

function ToolButton({ active = false, disabled = false, icon, title, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg transition ${active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"} disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {createElement(icon, { className: "size-4" })}
    </button>
  );
}

function ComponentButton({ icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="mb-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700">
      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100">{createElement(icon, { className: "size-4" })}</span>
      {label}
    </button>
  );
}

export default function HydraulikReactFlowLab() {
  return <ReactFlowProvider><EditorInner /></ReactFlowProvider>;
}
