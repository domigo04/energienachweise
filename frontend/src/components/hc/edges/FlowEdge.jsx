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
  const isCadPolyline = data.cad_polyline || waypoints.length > 0;
  const edgePath = isCadPolyline ? polylinePath(vertices) : smooth[0];
  const labelPoint = isCadPolyline ? halfwayPoint(vertices) : { x: smooth[1], y: smooth[2] };
  const dash = data._dashed || isRL ? '10 7' : undefined;
  const color = style.stroke || '#334155';

  return (
    <>
      <BaseEdge id={id} path={edgePath}
        style={{ ...style, strokeWidth: 4.5, strokeDasharray: dash, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }} />

      {selected && <path d={edgePath} fill="none" stroke="#0f172a" strokeWidth={9} opacity={0.11} pointerEvents="none" />}

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        style={{ cursor: 'crosshair', pointerEvents: 'stroke' }}
        onDoubleClick={(event) => { event.stopPropagation(); data._onAddPoint?.(event, id); }} />

      {/* Echte CAD-Stützpunkte: Doppelklick auf die Leitung fügt einen ein.
          Beim Ziehen mit Shift übernimmt der Editor den 0°/45°/90°-Fang. */}
      {selected && waypoints.map((point, index) => (
        <circle key={`${id}-point-${index}`} cx={point.x} cy={point.y} r={6.5}
          fill="white" stroke={color} strokeWidth={2.5}
          style={{ pointerEvents: 'all', cursor: 'move' }}
          onPointerDown={(event) => { event.stopPropagation(); data._onPointPointerDown?.(event, id, index); }}
          onDoubleClick={(event) => { event.stopPropagation(); data._onRemovePoint?.(id, index); }} />
      ))}

      {/* Wie im React-Flow-Probeeditor: freie/verbundene Enden werden direkt
          an der Leitung gegriffen. Die internen Junction-Nodes bleiben unsichtbar. */}
      {selected && [
        ['source', sourceX, sourceY],
        ['target', targetX, targetY],
      ].map(([side, x, y]) => (
        <circle key={`${id}-${side}`} cx={x} cy={y} r={8}
          fill="white" stroke={color} strokeWidth={3.5}
          style={{ pointerEvents: 'all', cursor: 'crosshair' }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button === 0) data._onEndpointPointerDown?.(event, id, side);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data._onEndpointContextMenu?.(event, id, side);
          }} />
      ))}

      {/* Nur echte T-Verbindungen erhalten einen kleinen Verbindungspunkt.
          Freie Enden erzeugen keine dauerhaft sichtbaren Junction-Symbole. */}
      {data._sourceJunctionDegree >= 3 && <circle cx={sourceX} cy={sourceY} r={4.5} fill={color} pointerEvents="none" />}
      {data._targetJunctionDegree >= 3 && <circle cx={targetX} cy={targetY} r={4.5} fill={color} pointerEvents="none" />}

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
