import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

function polylinePath(points) {
  return points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}` : '';
}

function halfwayPoint(points) {
  if (points.length < 2) return points[0] || { x: 0, y: 0 };
  const parts = points.slice(1).map((point, index) => ({
    a: points[index], b: point,
    length: Math.hypot(point.x - points[index].x, point.y - points[index].y),
  }));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  let remaining = total / 2;
  for (const part of parts) {
    if (remaining <= part.length) {
      const ratio = part.length ? remaining / part.length : 0;
      return { x: part.a.x + (part.b.x - part.a.x) * ratio, y: part.a.y + (part.b.y - part.a.y) * ratio };
    }
    remaining -= part.length;
  }
  return points.at(-1);
}

// CAD-Leitung: automatische Smooth-Step-Führung oder frei bearbeitbare
// Polylinie. Rücklauf-Layer sind gestrichelt; Stützpunkte erscheinen nur bei
// Auswahl und bleiben Teil des gespeicherten Schema-Graphen.
export function FlowEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, label, data = {}, selected,
}) {
  const isVL = data._layerRole === 'vl' || style.stroke === '#ef4444';
  const isRL = data._layerRole === 'rl' || style.stroke === '#3b82f6';
  const waypoints = Array.isArray(data.points) ? data.points : [];
  const vertices = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
  const smooth = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  const edgePath = waypoints.length ? polylinePath(vertices) : smooth[0];
  const labelPoint = waypoints.length ? halfwayPoint(vertices) : { x: smooth[1], y: smooth[2] };
  const dash = data._dashed || isRL ? '6 4' : undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath}
        style={{ ...style, strokeWidth: isVL ? 2 : 1.6, strokeDasharray: dash, fill: 'none' }} />

      {selected && <path d={edgePath} fill="none" stroke="#0f172a" strokeWidth={9} opacity={0.11} pointerEvents="none" />}

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        style={{ cursor: 'crosshair', pointerEvents: 'stroke' }}
        onDoubleClick={(event) => { event.stopPropagation(); data._onAddPoint?.(event, id); }} />

      {/* Echte CAD-Stützpunkte: Doppelklick auf die Leitung fügt einen ein.
          Beim Ziehen mit Shift übernimmt der Editor den 0°/45°/90°-Fang. */}
      {selected && waypoints.map((point, index) => (
        <circle key={`${id}-point-${index}`} cx={point.x} cy={point.y} r={6.5}
          fill="white" stroke={style.stroke || '#334155'} strokeWidth={2.5}
          style={{ pointerEvents: 'all', cursor: 'move' }}
          onPointerDown={(event) => { event.stopPropagation(); data._onPointPointerDown?.(event, id, index); }}
          onDoubleClick={(event) => { event.stopPropagation(); data._onRemovePoint?.(id, index); }} />
      ))}

      {/* Leitungs-Label (DN + Massenstrom) — in der Streckenmitte */}
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -130%) translate(${labelPoint.x}px,${labelPoint.y}px)`,
            fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            color: isVL ? '#b91c1c' : isRL ? '#1d4ed8' : '#374151',
            background: 'rgba(255,255,255,0.92)', padding: '2px 5px', borderRadius: 3,
            border: `1px solid ${isVL ? '#fca5a5' : isRL ? '#93c5fd' : '#e2e8f0'}`,
            pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const EDGE_TYPES = { flow: FlowEdge };
