import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { roundedPolylinePath } from './geometry';

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

function automatischeEckpunkte(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition) {
  if (Math.abs(sourceX - targetX) < 0.5 || Math.abs(sourceY - targetY) < 0.5) return [];
  const sourceHorizontal = ['left', 'right'].includes(String(sourcePosition).toLowerCase());
  const targetHorizontal = ['left', 'right'].includes(String(targetPosition).toLowerCase());
  if (sourceHorizontal && targetHorizontal) {
    const x = (sourceX + targetX) / 2;
    return [{ x, y:sourceY }, { x, y:targetY }];
  }
  if (!sourceHorizontal && !targetHorizontal) {
    const y = (sourceY + targetY) / 2;
    return [{ x:sourceX, y }, { x:targetX, y }];
  }
  return sourceHorizontal
    ? [{ x:targetX, y:sourceY }]
    : [{ x:sourceX, y:targetY }];
}

// Jede Schema-Leitung ist eine echte Polylinie. Der Editor liefert adaptive
// Eckpunkte, die beim Verschieben der angeschlossenen Bauteile neu projiziert
// werden; andere Ansichten erhalten mindestens eine orthogonale Fallback-Route.
export function FlowEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, label, data = {}, selected,
}) {
  const isVL = data._layerRole === 'vl' || style.stroke === '#ef4444';
  const isRL = data._layerRole === 'rl' || style.stroke === '#3b82f6';
  const hasEffectiveRoute = Array.isArray(data._routePoints);
  const storedWaypoints = Array.isArray(data.points) ? data.points : [];
  const waypoints = hasEffectiveRoute
    ? data._routePoints
    : storedWaypoints.length
      ? storedWaypoints
      : automatischeEckpunkte(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition);
  const vertices = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
  const cornerRadius = Math.max(0, Number(data.corner_radius ?? data._cornerRadius ?? 8) || 0);
  const edgePath = roundedPolylinePath(vertices, cornerRadius);
  const labelPoint = halfwayPoint(vertices);
  const dash = data._dashed || isRL ? '10 7' : undefined;
  const color = style.stroke || '#334155';

  return (
    <>
      <BaseEdge id={id} path={edgePath}
        style={{ ...style, strokeWidth: 4.5, strokeDasharray: dash, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }} />

      {selected && <path d={edgePath} fill="none" stroke="#0f172a" strokeWidth={9} opacity={0.11} pointerEvents="none" />}
      {data._groupSelected && !selected && <path d={edgePath} fill="none" stroke="#7c3aed" strokeWidth={9} opacity={0.18} pointerEvents="none" />}

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        style={{ cursor: selected ? 'grab' : 'pointer', pointerEvents: 'stroke' }}
        onPointerDown={(event) => {
          if (selected && event.button === 0) {
            event.stopPropagation();
            data._onSegmentPointerDown?.(event, id);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          data._onContextMenu?.(event, id);
        }}
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
