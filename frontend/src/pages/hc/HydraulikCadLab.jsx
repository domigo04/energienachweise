import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import { ArrowLeft, Boxes, Check, GitCompareArrows, Hand, MousePointer2, Redo2, RotateCcw, Trash2, Undo2, Waypoints, ZoomIn, ZoomOut } from "lucide-react";
import { getProject } from "../../api/hcApi";

const GRID = 20;
const COLORS = { vl: "#ef4444", rl: "#3b82f6", neutral: "#334155" };
const snap = (value) => Math.round(value / GRID) * GRID;
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

// Retina rendert Canvas sonst mit vierfacher Pixelzahl. Für technische Linien
// ist 1:1 deutlich schneller und weiterhin scharf genug.
Konva.pixelRatio = 1;

const NODE_SPECS = {
  verteiler: {
    label: "Verteiler", width: 520, height: 230,
    ports: [
      { id: "vl-main", x: 0, y: 25, kind: "vl", side: "left" },
      { id: "rl-main", x: 0, y: 205, kind: "rl", side: "left" },
      ...[160, 300, 440].flatMap((x, i) => [
        { id: `vl-${i + 1}`, x, y: 50, kind: "vl", side: "bottom" },
        { id: `rl-${i + 1}`, x, y: 180, kind: "rl", side: "top" },
      ]),
    ],
  },
  gruppe: {
    label: "Hydraulikgruppe", width: 120, height: 280,
    ports: [
      { id: "vl", x: 60, y: 0, kind: "vl", side: "top" },
      { id: "rl", x: 60, y: 280, kind: "rl", side: "bottom" },
    ],
  },
  speicher: {
    label: "Speicher", width: 72, height: 125,
    ports: [
      { id: "top-l", x: 22, y: 0, kind: "vl", side: "top" },
      { id: "top-r", x: 50, y: 0, kind: "vl", side: "top" },
      { id: "bot-l", x: 22, y: 125, kind: "rl", side: "bottom" },
      { id: "bot-r", x: 50, y: 125, kind: "rl", side: "bottom" },
      { id: "left", x: 0, y: 62, kind: "neutral", side: "left" },
      { id: "right", x: 72, y: 62, kind: "neutral", side: "right" },
    ],
  },
};

function demoGraph() {
  const nodes = [
    { id: "cad_vt", type: "verteiler", x: 160, y: 80, label: "Verteiler 1" },
    { id: "cad_g1", type: "gruppe", x: 260, y: 390, label: "Hydraulikgruppe 1" },
    { id: "cad_g2", type: "gruppe", x: 460, y: 390, label: "Hydraulikgruppe 2" },
    { id: "cad_sp", type: "speicher", x: 800, y: 130, label: "Technischer Speicher" },
  ];
  const edges = [
    { id: "cad_e1", start: { nodeId: "cad_vt", portId: "vl-1" }, end: { nodeId: "cad_g1", portId: "vl" }, kind: "vl", mid: { y: 350 } },
    { id: "cad_e2", start: { nodeId: "cad_g1", portId: "rl" }, end: { nodeId: "cad_vt", portId: "rl-1" }, kind: "rl", mid: { y: 700 } },
    { id: "cad_e3", start: { nodeId: "cad_vt", portId: "vl-2" }, end: { nodeId: "cad_g2", portId: "vl" }, kind: "vl", mid: { y: 330 } },
    { id: "cad_e4", start: { nodeId: "cad_g2", portId: "rl" }, end: { nodeId: "cad_vt", portId: "rl-2" }, kind: "rl", mid: { y: 740 } },
  ];
  return { nodes, edges };
}

function portPosition(nodes, endpoint) {
  const node = nodes.find((item) => item.id === endpoint.nodeId);
  const port = node && NODE_SPECS[node.type].ports.find((item) => item.id === endpoint.portId);
  // Reihenfolge ist wichtig: erst Port-Metadaten, danach absolute Koordinaten.
  // Andernfalls überschreiben port.x/port.y die Canvas-Position des Bauteils.
  return node && port ? { ...port, x: node.x + port.x, y: node.y + port.y } : null;
}

function endpointPosition(nodes, endpoint) {
  if (endpoint?.nodeId) return portPosition(nodes, endpoint);
  return Number.isFinite(endpoint?.x) && Number.isFinite(endpoint?.y)
    ? { x: endpoint.x, y: endpoint.y, side: null, kind: endpoint.kind || "neutral" }
    : null;
}

function nearestPort(nodes, point, radius = 28) {
  let best = null;
  for (const node of nodes) {
    for (const port of NODE_SPECS[node.type].ports) {
      const position = { x: node.x + port.x, y: node.y + port.y };
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { distance, endpoint: { nodeId: node.id, portId: port.id }, port, position };
      }
    }
  }
  return best;
}

function routeForEdge(nodes, edge) {
  const start = endpointPosition(nodes, edge.start);
  const end = endpointPosition(nodes, edge.end);
  if (!start || !end) return null;
  if (Array.isArray(edge.points)) {
    return {
      start, end, horizontal: null, handle: null,
      points: [start.x, start.y, ...edge.points.flatMap((point) => [point.x, point.y]), end.x, end.y],
    };
  }
  const horizontal = ["left", "right"].includes(start.side);
  if (horizontal) {
    const midX = edge.mid?.x ?? (start.x + end.x) / 2;
    return { start, end, horizontal, handle: { x: midX, y: (start.y + end.y) / 2 }, points: [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y] };
  }
  const midY = edge.mid?.y ?? (start.y + end.y) / 2;
  return { start, end, horizontal, handle: { x: (start.x + end.x) / 2, y: midY }, points: [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y] };
}

function constrainedPoint(raw, anchor, orthogonal) {
  const point = { x: snap(raw.x), y: snap(raw.y) };
  if (!orthogonal || !anchor) return point;
  return Math.abs(point.x - anchor.x) >= Math.abs(point.y - anchor.y)
    ? { x: point.x, y: anchor.y }
    : { x: anchor.x, y: point.y };
}

function Grid({ view, size }) {
  const bounds = useMemo(() => {
    const x0 = Math.floor((-view.x / view.scale) / GRID) * GRID - GRID;
    const y0 = Math.floor((-view.y / view.scale) / GRID) * GRID - GRID;
    const x1 = x0 + size.width / view.scale + GRID * 2;
    const y1 = y0 + size.height / view.scale + GRID * 2;
    return { x0, y0, x1, y1 };
  }, [view, size]);
  const drawGrid = (major) => (context, shape) => {
    context.beginPath();
    for (let x = bounds.x0; x <= bounds.x1; x += GRID) {
      if ((x % 100 === 0) !== major) continue;
      context.moveTo(x, bounds.y0); context.lineTo(x, bounds.y1);
    }
    for (let y = bounds.y0; y <= bounds.y1; y += GRID) {
      if ((y % 100 === 0) !== major) continue;
      context.moveTo(bounds.x0, y); context.lineTo(bounds.x1, y);
    }
    context.fillStrokeShape(shape);
  };
  return <>
    <Shape sceneFunc={drawGrid(false)} stroke="#e8edf3" strokeWidth={0.55} listening={false} perfectDrawEnabled={false} />
    <Shape sceneFunc={drawGrid(true)} stroke="#cbd5e1" strokeWidth={1} listening={false} perfectDrawEnabled={false} />
  </>;
}

function SpeicherSymbol() {
  return (
    <Group listening={false}>
      {/* 1:1 aus dem bestehenden SymSpeicher auf Canvas übertragen */}
      <Rect x={3} y={3} width={66} height={119} cornerRadius={8} fill="#fef2f2" stroke="#dc2626" strokeWidth={2.5} />
      <Line points={[3, 43, 69, 43]} stroke="#fca5a5" strokeWidth={1.2} dash={[5, 3]} />
      <Line points={[3, 81, 69, 81]} stroke="#fca5a5" strokeWidth={1.2} dash={[5, 3]} />
      <Rect x={4} y={82} width={64} height={38} cornerRadius={5} fill="rgba(252,165,165,0.25)" />
      <Text x={0} y={53} width={72} text="TS" align="center" fontSize={16} fontStyle="bold" fill="#dc2626" />
      <Rect x={14} y={0} width={16} height={6} cornerRadius={2} fill={COLORS.vl} />
      <Rect x={42} y={0} width={16} height={6} cornerRadius={2} fill={COLORS.vl} />
      <Rect x={14} y={119} width={16} height={6} cornerRadius={2} fill={COLORS.rl} />
      <Rect x={42} y={119} width={16} height={6} cornerRadius={2} fill={COLORS.rl} />
    </Group>
  );
}

function VerteilerSymbol() {
  const branches = [160, 300, 440];
  return (
    <Group listening={false}>
      {branches.map((x) => <Line key={x} points={[x, 50, x, 180]} stroke="#d7dee8" strokeWidth={1.3} dash={[5, 7]} />)}
      <Rect x={0} y={0} width={520} height={50} cornerRadius={5} fill={COLORS.vl} />
      <Rect x={0} y={180} width={520} height={50} cornerRadius={5} fill={COLORS.rl} />
      <Text x={12} y={15} text="VL — Verteiler" fontSize={15} fontStyle="bold" fontFamily="monospace" fill="white" />
      <Text x={12} y={195} text="RL — Rücklauf" fontSize={15} fontStyle="bold" fontFamily="monospace" fill="white" />
      {branches.map((x, i) => <Text key={x} x={x + 8} y={16} text={`${i + 1}`} fontSize={12} fontStyle="bold" fill="white" />)}
    </Group>
  );
}

function HydraulikgruppeSymbol({ label }) {
  const cx = 60;
  const valve = (y) => (
    <Group y={y}>
      <Line points={[cx - 10, -9, cx + 10, -9, cx, 0]} closed fill="white" stroke="#1e293b" strokeWidth={1.5} />
      <Line points={[cx - 10, 9, cx + 10, 9, cx, 0]} closed fill="white" stroke="#1e293b" strokeWidth={1.5} />
      <Circle x={cx} y={0} radius={2.5} fill="#1e293b" />
    </Group>
  );
  return (
    <Group listening={false}>
      <Line points={[cx, 0, cx, 85]} stroke={COLORS.vl} strokeWidth={3} />
      <Line points={[cx, 205, cx, 280]} stroke={COLORS.rl} strokeWidth={3} />
      {valve(24)}
      <Circle x={cx} y={56} radius={15} fill="white" stroke="#1e293b" strokeWidth={2} />
      <Line points={[cx - 15, 56, cx + 15, 56]} stroke="#1e293b" strokeWidth={1.7} />
      <Line points={[cx - 15, 56, cx + 15, 56, cx, 71]} closed fill="#1e293b" />
      <Rect x={39} y={85} width={42} height={120} fill="white" stroke={COLORS.vl} strokeWidth={2} />
      <Text x={46} y={195} text={label || "Hydraulikgruppe"} rotation={-90} width={105} fontSize={10} fontStyle="bold" fill={COLORS.vl} />
      {valve(224)}
      <Line points={[cx, 38, 18, 38, 18, 240, cx, 240]} stroke={COLORS.rl} strokeWidth={2} dash={[6, 4]} />
      <Circle x={cx} y={38} radius={3.5} fill={COLORS.rl} />
      <Circle x={cx} y={240} radius={3.5} fill={COLORS.rl} />
      {valve(258)}
    </Group>
  );
}

function CadNode({ node, selected, tool, connectionStart, onSelect, onMoveStart, onMove, onMoveEnd, onPortDown, onPortUp }) {
  const spec = NODE_SPECS[node.type];
  return (
    <>
    <Group x={node.x} y={node.y} draggable={tool === "select"}
      onClick={(event) => { event.cancelBubble = true; onSelect(node.id); }}
      onTap={(event) => { event.cancelBubble = true; onSelect(node.id); }}
      onDragStart={onMoveStart}
      onDragMove={(event) => onMove(node.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onMoveEnd(node.id, snap(event.target.x()), snap(event.target.y()))}>
      {/* Pro Bauteil nur eine einzige Trefferfläche statt jedes SVG-Detail. */}
      <Rect width={spec.width} height={spec.height} fill="rgba(255,255,255,0.001)" />
      {selected && <Rect x={-10} y={-10} width={spec.width + 20} height={spec.height + 20} cornerRadius={8} stroke="#2563eb" strokeWidth={2} dash={[7, 4]} listening={false} />}
      {node.type === "verteiler" && <VerteilerSymbol />}
      {node.type === "gruppe" && <HydraulikgruppeSymbol label={node.label} />}
      {node.type === "speicher" && <SpeicherSymbol />}
      {node.type !== "gruppe" && <Text x={0} y={spec.height + 12} width={spec.width} text={node.label} align="center" fontSize={13} fill="#334155" />}
    </Group>
    {/* Eigene Interaktionsebene: Anschlussklicks können keinen Bauteil-Drag mehr starten. */}
    <Group x={node.x} y={node.y}>
      {spec.ports.map((port) => {
        const active = connectionStart?.nodeId === node.id && connectionStart?.portId === port.id;
        return <Circle key={port.id} x={port.x} y={port.y} radius={active ? 9 : 7} fill={COLORS[port.kind]} stroke="white" strokeWidth={2}
          hitStrokeWidth={14} shadowColor={COLORS[port.kind]} shadowBlur={active ? 10 : 0} cursor="crosshair"
          onMouseDown={(event) => { event.cancelBubble = true; onPortDown(node.id, port); }}
          onMouseUp={(event) => { event.cancelBubble = true; onPortUp(node.id, port); }}
          onTouchStart={(event) => { event.cancelBubble = true; onPortDown(node.id, port); }}
          onTouchEnd={(event) => { event.cancelBubble = true; onPortUp(node.id, port); }} />;
      })}
    </Group>
    </>
  );
}

export default function HydraulikCadLab() {
  const { id: projectId } = useParams();
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const connectionStartRef = useRef(null);
  const draftPointsRef = useRef([]);
  const nodeFrameRef = useRef(null);
  const pendingNodeMoveRef = useRef(null);
  const edgeFrameRef = useRef(null);
  const pendingEdgeMoveRef = useRef(null);
  const pointerFrameRef = useRef(null);
  const pendingPointerRef = useRef(null);
  const storageKey = `hc-cad-lab:v1:${projectId}`;
  const [projectName, setProjectName] = useState("Projekt");
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [tool, setTool] = useState("select");
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.9 });
  const [graph, setGraph] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || demoGraph(); } catch { return demoGraph(); }
  });
  const [selected, setSelected] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [connectionPointer, setConnectionPointer] = useState(null);
  const [draftPoints, setDraftPoints] = useState([]);
  const [orthogonal, setOrthogonal] = useState(false);
  const [lineKind, setLineKind] = useState("vl");
  const [extension, setExtension] = useState(null);
  const [liveNodePositions, setLiveNodePositions] = useState({});
  const [liveEdgeChanges, setLiveEdgeChanges] = useState({});

  useEffect(() => { getProject(projectId).then((project) => setProjectName(project.name)).catch(() => {}); }, [projectId]);
  // Während eines Drags niemals synchron serialisieren. Erst nach einer kurzen
  // Ruhephase wird der abgeschlossene Graph in den separaten Lab-Speicher geschrieben.
  useEffect(() => {
    const timer = setTimeout(() => localStorage.setItem(storageKey, JSON.stringify(graph)), 500);
    return () => clearTimeout(timer);
  }, [graph, storageKey]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => {
    if (nodeFrameRef.current) cancelAnimationFrame(nodeFrameRef.current);
    if (edgeFrameRef.current) cancelAnimationFrame(edgeFrameRef.current);
    if (pointerFrameRef.current) cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  const checkpoint = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-39), JSON.parse(JSON.stringify(graph))];
    redoRef.current = [];
  }, [graph]);
  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(JSON.parse(JSON.stringify(graph)));
    setGraph(previous); setSelected(null); connectionStartRef.current = null; setConnectionStart(null);
  }, [graph]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(JSON.parse(JSON.stringify(graph)));
    setGraph(next); setSelected(null); connectionStartRef.current = null; setConnectionStart(null);
  }, [graph]);

  useEffect(() => {
    const keydown = (event) => {
      const tag = document.activeElement?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if (event.key === "Backspace" && connectionStartRef.current) {
        event.preventDefault();
        const next = draftPointsRef.current.slice(0, -1); draftPointsRef.current = next; setDraftPoints(next); return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        checkpoint();
        setGraph((current) => selected.kind === "node"
          ? { nodes: current.nodes.filter((n) => n.id !== selected.id), edges: current.edges.filter((e) => e.start.nodeId !== selected.id && e.end.nodeId !== selected.id) }
          : { ...current, edges: current.edges.filter((e) => e.id !== selected.id) });
        setSelected(null);
      }
      if (event.key === "Escape") { connectionStartRef.current = null; draftPointsRef.current = []; setConnectionStart(null); setConnectionPointer(null); setDraftPoints([]); setExtension(null); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [checkpoint, redo, selected, undo]);

  const addNode = (type) => {
    checkpoint();
    const spec = NODE_SPECS[type];
    const x = snap((size.width / 2 - view.x) / view.scale - spec.width / 2);
    const y = snap((size.height / 2 - view.y) / view.scale - spec.height / 2);
    const node = { id: uid(type), type, x, y, label: spec.label };
    setGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelected({ kind: "node", id: node.id }); setTool("select");
  };
  const renderNodes = useMemo(() => graph.nodes.map((node) => liveNodePositions[node.id]
    ? { ...node, ...liveNodePositions[node.id] } : node), [graph.nodes, liveNodePositions]);
  const renderEdges = useMemo(() => graph.edges.map((edge) => liveEdgeChanges[edge.id]
    ? { ...edge, ...liveEdgeChanges[edge.id] } : edge), [graph.edges, liveEdgeChanges]);

  const moveNodeLive = (nodeId, x, y) => {
    pendingNodeMoveRef.current = { nodeId, x, y };
    if (nodeFrameRef.current) return;
    nodeFrameRef.current = requestAnimationFrame(() => {
      const pending = pendingNodeMoveRef.current;
      if (pending) setLiveNodePositions((current) => ({ ...current, [pending.nodeId]: { x: pending.x, y: pending.y } }));
      nodeFrameRef.current = null;
    });
  };
  const moveNodeEnd = (nodeId, x, y) => {
    if (nodeFrameRef.current) cancelAnimationFrame(nodeFrameRef.current);
    nodeFrameRef.current = null; pendingNodeMoveRef.current = null;
    setLiveNodePositions((current) => { const next = { ...current }; delete next[nodeId]; return next; });
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, x, y } : node) }));
  };

  const cancelConnection = () => {
    connectionStartRef.current = null; draftPointsRef.current = [];
    setConnectionStart(null); setConnectionPointer(null); setDraftPoints([]); setExtension(null);
  };
  const startConnection = (nodeId, port) => {
    const endpoint = { nodeId, portId: port.id, kind: port.kind, side: port.side };
    connectionStartRef.current = endpoint; setConnectionStart(endpoint);
    draftPointsRef.current = []; setDraftPoints([]); setExtension(null); setTool("line");
    const position = portPosition(renderNodes, endpoint);
    if (position) setConnectionPointer({ x: position.x, y: position.y });
  };
  const startFreeConnection = (raw) => {
    const point = constrainedPoint(raw, null, false);
    const endpoint = { ...point, kind: lineKind, side: null };
    connectionStartRef.current = endpoint; draftPointsRef.current = [];
    setConnectionStart(endpoint); setConnectionPointer(point); setDraftPoints([]); setExtension(null); setTool("line");
  };
  const commitConnection = (endEndpoint, endPort = null) => {
    const start = connectionStartRef.current;
    if (!start) return false;
    const endPosition = endpointPosition(renderNodes, endEndpoint);
    const last = draftPointsRef.current[draftPointsRef.current.length - 1] || endpointPosition(renderNodes, start);
    let points = [...draftPointsRef.current];
    if (orthogonal && endPosition && last && last.x !== endPosition.x && last.y !== endPosition.y) {
      points.push(endPort && ["top", "bottom"].includes(endPort.side)
        ? { x: endPosition.x, y: last.y }
        : { x: last.x, y: endPosition.y });
    }
    const clean = points.filter((point, index) => {
      const previous = index ? points[index - 1] : endpointPosition(renderNodes, start);
      return !previous || point.x !== previous.x || point.y !== previous.y;
    }).filter((point) => !endPosition || point.x !== endPosition.x || point.y !== endPosition.y);
    const startPosition = endpointPosition(renderNodes, start);
    if (!extension && startPosition && endPosition && clean.length === 0
      && startPosition.x === endPosition.x && startPosition.y === endPosition.y) return false;
    const storedStart = start.nodeId ? { nodeId: start.nodeId, portId: start.portId } : { x: start.x, y: start.y };
    const storedEnd = endEndpoint.nodeId ? { nodeId: endEndpoint.nodeId, portId: endEndpoint.portId } : { x: endEndpoint.x, y: endEndpoint.y };
    checkpoint();
    setGraph((current) => {
      if (!extension) return { ...current, edges: [...current.edges, {
        id: uid("leitung"), start: storedStart, end: storedEnd,
        kind: start.kind === "neutral" ? (endPort?.kind || lineKind) : (start.kind || lineKind), points: clean,
      }] };
      return { ...current, edges: current.edges.map((edge) => {
        if (edge.id !== extension.edgeId) return edge;
        const route = routeForEdge(current.nodes, edge);
        const basePoints = Array.isArray(edge.points) ? edge.points : (route?.points || [])
          .reduce((all, value, index, flat) => index % 2 ? [...all, { x: flat[index - 1], y: value }] : all, [])
          .slice(1, -1);
        const oldEndpoint = endpointPosition(current.nodes, extension.end === "start" ? edge.start : edge.end);
        if (extension.end === "start") {
          return { ...edge, start: storedEnd, points: [...clean].reverse().concat(oldEndpoint ? [oldEndpoint] : [], basePoints) };
        }
        return { ...edge, end: storedEnd, points: basePoints.concat(oldEndpoint ? [oldEndpoint] : [], clean) };
      }) };
    });
    cancelConnection(); return true;
  };
  const finishConnection = (nodeId, port) => {
    const start = connectionStartRef.current;
    if (!start || (start.nodeId === nodeId && start.portId === port.id)) return false;
    return commitConnection({ nodeId, portId: port.id }, port);
  };
  const portDown = (nodeId, port) => {
    if (!connectionStartRef.current) startConnection(nodeId, port);
    else finishConnection(nodeId, port); // zweiter Klick schliesst die Leitung
  };
  const portUp = (nodeId, port) => {
    finishConnection(nodeId, port); // Ziehen von Anschluss zu Anschluss
  };
  const addDraftPoint = () => {
    if (!connectionStartRef.current || !stageRef.current) return;
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;
    const raw = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    const origin = endpointPosition(renderNodes, connectionStartRef.current);
    const anchor = draftPointsRef.current[draftPointsRef.current.length - 1] || origin;
    const point = constrainedPoint(raw, anchor, orthogonal);
    if (!anchor || point.x !== anchor.x || point.y !== anchor.y) {
      const next = [...draftPointsRef.current, point]; draftPointsRef.current = next; setDraftPoints(next);
    }
  };
  const finishFreeConnection = () => {
    if (!connectionStartRef.current || !stageRef.current) return;
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;
    const raw = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    const anchor = draftPointsRef.current[draftPointsRef.current.length - 1] || endpointPosition(renderNodes, connectionStartRef.current);
    const endpoint = constrainedPoint(raw, anchor, orthogonal);
    commitConnection(endpoint);
  };
  const beginExtension = (edge, end) => {
    const endpoint = endpointPosition(renderNodes, end === "start" ? edge.start : edge.end);
    if (!endpoint) return;
    const start = { x: endpoint.x, y: endpoint.y, kind: edge.kind, side: endpoint.side };
    connectionStartRef.current = start; draftPointsRef.current = [];
    setConnectionStart(start); setConnectionPointer(start); setDraftPoints([]); setExtension({ edgeId: edge.id, end }); setTool("line");
  };
  useEffect(() => {
    const finishWithEnter = (event) => {
      if (event.key === "Enter" && connectionStartRef.current) { event.preventDefault(); finishFreeConnection(); }
    };
    window.addEventListener("keydown", finishWithEnter);
    return () => window.removeEventListener("keydown", finishWithEnter);
  }, [finishFreeConnection]);
  const updateEdgeMidLive = (edge, route, position) => {
    pendingEdgeMoveRef.current = { edgeId: edge.id, changes: { mid: route.horizontal ? { x: snap(position.x) } : { y: snap(position.y) } } };
    if (edgeFrameRef.current) return;
    edgeFrameRef.current = requestAnimationFrame(() => {
      const pending = pendingEdgeMoveRef.current;
      if (pending) setLiveEdgeChanges((current) => ({ ...current, [pending.edgeId]: pending.changes }));
      edgeFrameRef.current = null;
    });
  };
  const updateEdgePointLive = (edge, index, position) => {
    const points = (edge.points || []).map((point, pointIndex) => pointIndex === index
      ? { x: snap(position.x), y: snap(position.y) } : point);
    pendingEdgeMoveRef.current = { edgeId: edge.id, changes: { points } };
    if (edgeFrameRef.current) return;
    edgeFrameRef.current = requestAnimationFrame(() => {
      const pending = pendingEdgeMoveRef.current;
      if (pending) setLiveEdgeChanges((current) => ({ ...current, [pending.edgeId]: pending.changes }));
      edgeFrameRef.current = null;
    });
  };
  const updateEdgeEndpointLive = (edge, end, position) => {
    pendingEdgeMoveRef.current = { edgeId: edge.id, changes: { [end]: { x: snap(position.x), y: snap(position.y) } } };
    if (edgeFrameRef.current) return;
    edgeFrameRef.current = requestAnimationFrame(() => {
      const pending = pendingEdgeMoveRef.current;
      if (pending) setLiveEdgeChanges((current) => ({ ...current, [pending.edgeId]: pending.changes }));
      edgeFrameRef.current = null;
    });
  };
  const updateEdgeEndpointEnd = (edgeId, end, position) => {
    if (edgeFrameRef.current) cancelAnimationFrame(edgeFrameRef.current);
    edgeFrameRef.current = null; pendingEdgeMoveRef.current = null;
    const point = { x: snap(position.x), y: snap(position.y) };
    const match = nearestPort(renderNodes, point);
    const endpoint = match ? match.endpoint : point;
    setGraph((current) => ({ ...current, edges: current.edges.map((edge) => edge.id === edgeId ? { ...edge, [end]: endpoint } : edge) }));
    setLiveEdgeChanges((current) => { const next = { ...current }; delete next[edgeId]; return next; });
  };
  const updateEdgeMidEnd = (edgeId) => {
    if (edgeFrameRef.current) cancelAnimationFrame(edgeFrameRef.current);
    edgeFrameRef.current = null;
    const changes = pendingEdgeMoveRef.current?.edgeId === edgeId ? pendingEdgeMoveRef.current.changes : liveEdgeChanges[edgeId];
    pendingEdgeMoveRef.current = null;
    if (changes) setGraph((current) => ({ ...current, edges: current.edges.map((edge) => edge.id === edgeId ? { ...edge, ...changes } : edge) }));
    setLiveEdgeChanges((current) => { const next = { ...current }; delete next[edgeId]; return next; });
  };
  const updateSelectedLabel = (label) => setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => selected?.kind === "node" && node.id === selected.id ? { ...node, label } : node) }));
  const selectedNode = selected?.kind === "node" ? graph.nodes.find((node) => node.id === selected.id) : null;

  const zoomAtCenter = (factor) => setView((current) => ({ ...current, scale: Math.max(0.3, Math.min(2.2, current.scale * factor)) }));
  const onWheel = (event) => {
    event.evt.preventDefault();
    const pointer = stageRef.current.getPointerPosition();
    const oldScale = view.scale;
    const nextScale = Math.max(0.3, Math.min(2.2, oldScale * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
    const world = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale };
    setView({ scale: nextScale, x: pointer.x - world.x * nextScale, y: pointer.y - world.y * nextScale });
  };
  const trackConnectionPointer = () => {
    if (!connectionStartRef.current || !stageRef.current) return;
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;
    pendingPointerRef.current = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    if (pointerFrameRef.current) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      if (pendingPointerRef.current) setConnectionPointer(pendingPointerRef.current);
      pointerFrameRef.current = null;
    });
  };
  const connectionOrigin = connectionStart ? endpointPosition(renderNodes, connectionStart) : null;
  const previewPoints = connectionOrigin && connectionPointer ? (() => {
    const anchor = draftPoints[draftPoints.length - 1] || connectionOrigin;
    const pointer = constrainedPoint(connectionPointer, anchor, orthogonal);
    return [connectionOrigin.x, connectionOrigin.y, ...draftPoints.flatMap((point) => [point.x, point.y]), pointer.x, pointer.y];
  })() : null;
  const canvasClick = (event) => {
    if (event.target !== event.target.getStage()) return;
    if (connectionStartRef.current) { addDraftPoint(); return; }
    if (tool === "line" && stageRef.current) {
      const pointer = stageRef.current.getPointerPosition();
      if (pointer) startFreeConnection({ x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale });
      return;
    }
    setSelected(null);
  };
  const selectedEdge = selected?.kind === "edge" ? graph.edges.find((edge) => edge.id === selected.id) : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-800">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Link to={`/projekte/${projectId}`} className="btn-ghost"><ArrowLeft className="size-4" /> {projectName}</Link>
        <span className="hidden text-slate-200 sm:inline">|</span>
        <div className="flex items-center gap-2 font-bold"><Boxes className="size-4 text-brand-600" /> CAD-Lab</div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">Prototyp · separat gespeichert</span>
        <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700">bis 60 FPS</span>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost min-h-10" onClick={undo} title="Rückgängig"><Undo2 className="size-4" /></button>
          <button className="btn-ghost min-h-10" onClick={redo} title="Wiederholen"><Redo2 className="size-4" /></button>
          <Link to={`/projekte/${projectId}/schema-reactflow`} className="btn-secondary min-h-10"><GitCompareArrows className="size-4" /> <span className="hidden sm:inline">React Flow testen</span><span className="sm:hidden">RF</span></Link>
          <Link to={`/projekte/${projectId}/schema`} className="btn-secondary min-h-10"><GitCompareArrows className="size-4" /> <span className="hidden sm:inline">Mit altem Editor vergleichen</span><span className="sm:hidden">Alt</span></Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="z-10 w-48 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-sm sm:w-60">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Werkzeuge</div>
          <div className="grid grid-cols-3 gap-2">
            <button className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${tool === "select" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200"}`} onClick={() => setTool("select")}><MousePointer2 className="mx-auto mb-1 size-4" />Auswahl</button>
            <button className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${tool === "pan" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200"}`} onClick={() => setTool("pan")}><Hand className="mx-auto mb-1 size-4" />Verschieben</button>
            <button className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${tool === "line" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200"}`} onClick={() => setTool("line")}><Waypoints className="mx-auto mb-1 size-4" />Polylinie</button>
          </div>
          <button type="button" onClick={() => setOrthogonal((value) => !value)}
            className={`mt-2 flex min-h-10 w-full items-center justify-between rounded-lg border px-3 text-xs font-bold ${orthogonal ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
            Orthogonal-Modus <span>{orthogonal ? "Ein" : "Aus"}</span>
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[['vl', 'Vorlauf', COLORS.vl], ['rl', 'Rücklauf', COLORS.rl]].map(([kind, label, color]) => (
              <button key={kind} type="button" onClick={() => setLineKind(kind)}
                className={`min-h-10 rounded-lg border text-xs font-bold ${lineKind === kind ? "text-white" : "bg-white text-slate-600"}`}
                style={lineKind === kind ? { backgroundColor: color, borderColor: color } : { borderColor: '#e2e8f0' }}>
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Bauteile platzieren</div>
          <div className="space-y-2">
            {["verteiler", "gruppe", "speicher"].map((type) => <button key={type} onClick={() => addNode(type)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-xs font-bold transition hover:border-brand-300 hover:bg-brand-50">
              <span className={`size-3 rounded-sm ${type === "verteiler" ? "bg-gradient-to-b from-red-500 to-blue-500" : type === "gruppe" ? "bg-red-400" : "bg-red-100 ring-1 ring-red-400"}`} />
              {NODE_SPECS[type].label}
            </button>)}
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            <b className="text-slate-700">Polylinie zeichnen</b><br />Frei oder am Anschluss beginnen. Klick setzt Eckpunkte. Doppelklick, Enter oder Rechtsklick beendet. Rücktaste entfernt den letzten Punkt.
          </div>
          {connectionStart && <button className="mt-3 w-full rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700" onClick={cancelConnection}>Verbindung abbrechen · Esc</button>}
        </aside>

        <main ref={containerRef} className={`relative min-w-0 flex-1 overflow-hidden bg-[#f8fafc] ${tool === "line" ? "cursor-crosshair" : ""}`}>
          <Stage ref={stageRef} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
            draggable={tool === "pan"} onDragEnd={(event) => {
              if (event.target === event.target.getStage()) setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
            }}
            onWheel={onWheel} onMouseMove={trackConnectionPointer} onTouchMove={trackConnectionPointer}
            onMouseDown={(event) => { if (event.target === event.target.getStage() && !connectionStartRef.current) setSelected(null); }}
            onClick={canvasClick} onTap={canvasClick}
            onDblClick={(event) => { if (event.target === event.target.getStage() && connectionStartRef.current) finishFreeConnection(); }}
            onContextMenu={(event) => { event.evt.preventDefault(); if (connectionStartRef.current) finishFreeConnection(); }}
            onTouchStart={(event) => { if (event.target === event.target.getStage() && !connectionStartRef.current) setSelected(null); }}>
            <Layer listening={false}><Grid view={view} size={size} /></Layer>
            <Layer>
              {previewPoints && <Line points={previewPoints} stroke={COLORS[connectionStart.kind] || COLORS.neutral} strokeWidth={3} dash={[10, 6]} opacity={0.8} lineCap="round" lineJoin="round" listening={false} perfectDrawEnabled={false} />}
              {connectionStart && draftPoints.map((point, index) => <Circle key={`draft-${index}`} x={point.x} y={point.y} radius={5} fill="white" stroke={COLORS[connectionStart.kind] || COLORS.neutral} strokeWidth={2} listening={false} />)}
              {renderEdges.map((edge) => {
                const route = routeForEdge(renderNodes, edge);
                if (!route) return null;
                const isSelected = selected?.kind === "edge" && selected.id === edge.id;
                return <Group key={edge.id}>
                  <Line points={route.points} stroke={COLORS[edge.kind] || COLORS.neutral} strokeWidth={isSelected ? 5 : 3} lineCap="round" lineJoin="round" hitStrokeWidth={18}
                    perfectDrawEnabled={false}
                    onClick={(event) => { event.cancelBubble = true; setSelected({ kind: "edge", id: edge.id }); }}
                    onTap={(event) => { event.cancelBubble = true; setSelected({ kind: "edge", id: edge.id }); }} />
                  {isSelected && route.handle && <Circle x={route.handle.x} y={route.handle.y} radius={9} fill="white" stroke={COLORS[edge.kind]} strokeWidth={3} draggable
                    dragBoundFunc={(position) => route.horizontal ? { x: snap(position.x), y: route.handle.y } : { x: route.handle.x, y: snap(position.y) }}
                    onDragStart={checkpoint} onDragMove={(event) => updateEdgeMidLive(edge, route, event.target.position())}
                    onDragEnd={() => updateEdgeMidEnd(edge.id)} />}
                  {isSelected && edge.points?.map((point, index) => <Circle key={`${edge.id}-point-${index}`}
                    x={point.x} y={point.y} radius={8} fill="white" stroke={COLORS[edge.kind]} strokeWidth={2.5} draggable
                    dragBoundFunc={(position) => ({ x: snap(position.x), y: snap(position.y) })}
                    onDragStart={checkpoint} onDragMove={(event) => updateEdgePointLive(edge, index, event.target.position())}
                    onDragEnd={() => updateEdgeMidEnd(edge.id)} />)}
                  {isSelected && !edge.start?.nodeId && <Circle x={route.start.x} y={route.start.y} radius={10} fill="white" stroke={COLORS[edge.kind]} strokeWidth={3} draggable
                    onDragStart={checkpoint} onDragMove={(event) => updateEdgeEndpointLive(edge, "start", event.target.position())}
                    onDragEnd={(event) => updateEdgeEndpointEnd(edge.id, "start", event.target.position())}
                    onDblClick={() => beginExtension(edge, "start")} />}
                  {isSelected && !edge.end?.nodeId && <Circle x={route.end.x} y={route.end.y} radius={10} fill="white" stroke={COLORS[edge.kind]} strokeWidth={3} draggable
                    onDragStart={checkpoint} onDragMove={(event) => updateEdgeEndpointLive(edge, "end", event.target.position())}
                    onDragEnd={(event) => updateEdgeEndpointEnd(edge.id, "end", event.target.position())}
                    onDblClick={() => beginExtension(edge, "end")} />}
                </Group>;
              })}
              {renderNodes.map((node) => <CadNode key={node.id} node={node} tool={tool} selected={selected?.kind === "node" && selected.id === node.id}
                connectionStart={connectionStart} onSelect={(nodeId) => setSelected({ kind: "node", id: nodeId })}
                onMoveStart={checkpoint} onMove={moveNodeLive} onMoveEnd={moveNodeEnd}
                onPortDown={portDown} onPortUp={portUp} />)}
            </Layer>
          </Stage>

          <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            <button className="btn-ghost min-h-10 min-w-10" onClick={() => zoomAtCenter(1.15)}><ZoomIn className="size-4" /></button>
            <span className="w-12 text-center text-xs font-bold tabular-nums text-slate-500">{Math.round(view.scale * 100)}%</span>
            <button className="btn-ghost min-h-10 min-w-10" onClick={() => zoomAtCenter(0.85)}><ZoomOut className="size-4" /></button>
            <button className="btn-ghost min-h-10 min-w-10" onClick={() => setView({ x: 0, y: 0, scale: 0.9 })}><RotateCcw className="size-4" /></button>
          </div>

          {selected && <div className="absolute right-4 top-4 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">{selectedNode ? NODE_SPECS[selectedNode.type].label : "Leitung"}</div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700"><Check className="size-3" /> lokal gespeichert</span>
            </div>
            {selectedNode && <>
              <label className="label mt-3">Bezeichnung</label>
              <input className="input" value={selectedNode.label} onChange={(event) => updateSelectedLabel(event.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><div>X <b>{selectedNode.x}</b></div><div>Y <b>{selectedNode.y}</b></div></div>
            </>}
            {selectedEdge && <div className="mt-3 space-y-2">
              <div className="text-xs leading-relaxed text-slate-500">Freie Enden kannst du direkt ziehen. In der Nähe eines Anschlusses rasten sie automatisch ein.</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary min-h-10 justify-center text-xs" onClick={() => beginExtension(selectedEdge, "start")}>Anfang verlängern</button>
                <button type="button" className="btn-secondary min-h-10 justify-center text-xs" onClick={() => beginExtension(selectedEdge, "end")}>Ende verlängern</button>
              </div>
            </div>}
            <button className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }))}><Trash2 className="size-4" /> Entfernen</button>
          </div>}
        </main>
      </div>
    </div>
  );
}
