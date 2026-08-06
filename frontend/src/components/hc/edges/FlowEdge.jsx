import { BaseEdge, EdgeLabelRenderer, useStore } from '@xyflow/react';
import { roundedPolylinePath } from './geometry';
import { labelSichtbar, labelVersatz } from '../../../pages/hc/schema/cadEdit';

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
      : data.cad_diagonal
        ? []
        : automatischeEckpunkte(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition);
  // Endpunkte: der Editor misst den Anschluss selbst und liefert ihn mit. Nur
  // wo diese Messung fehlt (Export, Vorschau ohne Editor), gelten React Flows
  // eigene Werte — sie leiten den Endpunkt aus der DEKLARIERTEN Handle-Seite
  // ab, und die dreht bei einem gedrehten Bauteil nicht mit.
  const start = data._routeStart || { x: sourceX, y: sourceY };
  const end = data._routeEnd || { x: targetX, y: targetY };
  const vertices = [{ x: start.x, y: start.y }, ...waypoints, { x: end.x, y: end.y }];
  // Grips sollen auf dem Schirm immer gleich gross sein, egal wie stark gezoomt
  // ist. Darum die Radien durch den Zoom teilen: r_welt = r_screen / zoom.
  const zoom = Math.max(useStore((state) => state.transform[2]) || 1, 0.05);
  const gripR = 5.5 / zoom;          // Eckpunkt
  const endR = 6.5 / zoom;           // Endpunkt (etwas grösser, trägt die Hydraulik)
  const gripStroke = 1.8 / zoom;
  const endStroke = 2.4 / zoom;
  const cornerRadius = Math.max(0, Number(data.corner_radius ?? data._cornerRadius ?? 8) || 0);
  const edgePath = roundedPolylinePath(vertices, cornerRadius);
  const labelPoint = halfwayPoint(vertices);
  const labelOffset = labelVersatz(data);
  const labelAnker = { x: labelPoint.x + labelOffset.x, y: labelPoint.y + labelOffset.y };
  const dash = data._dashed || isRL ? '10 7' : undefined;
  const color = style.stroke || '#334155';

  return (
    <>
      <BaseEdge id={id} path={edgePath}
        style={{ ...style, strokeWidth: 2.5, strokeDasharray: dash, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }} />

      {selected && <path d={edgePath} fill="none" stroke="#0f172a" strokeWidth={7 / zoom + 2.5} opacity={0.11} pointerEvents="none" />}
      {data._groupSelected && !selected && <path d={edgePath} fill="none" stroke="#7c3aed" strokeWidth={7 / zoom + 2.5} opacity={0.18} pointerEvents="none" />}

      {(data._selectedSegmentIndexes || []).map(index => vertices[index + 1] ? (
        <line key={`${id}-selected-${index}`}
          x1={vertices[index].x} y1={vertices[index].y}
          x2={vertices[index + 1].x} y2={vertices[index + 1].y}
          stroke="#7c3aed" strokeWidth={4.5 / zoom} strokeLinecap="round"
          opacity="0.58" pointerEvents="none" />
      ) : null)}

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={14 / zoom}
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
        <circle key={`${id}-point-${index}`} cx={point.x} cy={point.y} r={gripR}
          fill={data._selectedPointIndex === index ? color : 'white'}
          stroke={data._selectedPointIndex === index ? '#0f172a' : color} strokeWidth={gripStroke}
          style={{ pointerEvents: 'all', cursor: 'move' }}
          onPointerDown={(event) => {
            event.stopPropagation();
            data._onSelectPoint?.(id, index);
            data._onPointPointerDown?.(event, id, index);
          }}
          onClick={(event) => {
            event.stopPropagation();
            data._onSelectPoint?.(id, index);
          }}
          onDoubleClick={(event) => { event.stopPropagation(); data._onRemovePoint?.(id, index); }} />
      ))}

      {/* Wie im React-Flow-Probeeditor: freie/verbundene Enden werden direkt
          an der Leitung gegriffen. Die internen Junction-Nodes bleiben unsichtbar. */}
      {selected && [
        ['source', sourceX, sourceY],
        ['target', targetX, targetY],
      ].map(([side, x, y]) => (
        <circle key={`${id}-${side}`} cx={x} cy={y} r={endR}
          fill="white" stroke={color} strokeWidth={endStroke}
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
      {data._sourceJunctionDegree >= 3 && <circle cx={sourceX} cy={sourceY} r={3.5 / zoom} fill={color} pointerEvents="none" />}
      {data._targetJunctionDegree >= 3 && <circle cx={targetX} cy={targetY} r={3.5 / zoom} fill={color} pointerEvents="none" />}

      {/* Leitungs-Label (DN + Massenstrom). Sitzt in der Streckenmitte, lässt
          sich aber mit der Maus an eine freie Stelle ziehen und ausblenden —
          im Plan steht die Zahl sonst regelmässig im Weg. Der Versatz gehört
          zur Leitung und wird mitgespeichert und mitexportiert. */}
      {label && labelSichtbar(data) && (
        <>
          {/* Hinweisstrich zur Leitung, sobald die Beschriftung versetzt ist —
              sonst wüsste im Plan niemand, zu welcher Leitung sie gehört. */}
          {Boolean(labelOffset.x || labelOffset.y) && (
            <line x1={labelPoint.x} y1={labelPoint.y} x2={labelAnker.x} y2={labelAnker.y}
              stroke={color} strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`}
              opacity="0.55" pointerEvents="none" />
          )}
          <EdgeLabelRenderer>
            <div
              title="Beschriftung ziehen · Doppelklick setzt sie zurück · Entf blendet sie aus"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                data._onLabelPointerDown?.(event, id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data._onLabelContextMenu?.(event, id);
              }}
              onDoubleClick={(event) => { event.stopPropagation(); data._onLabelReset?.(id); }}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -130%) translate(${labelAnker.x}px,${labelAnker.y}px)`,
                fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
                color: isVL ? '#b91c1c' : isRL ? '#1d4ed8' : '#374151',
                background: 'rgba(255,255,255,0.92)', padding: '2px 5px', borderRadius: 3,
                border: `1px solid ${data._labelSelected ? '#7c3aed' : isVL ? '#fca5a5' : isRL ? '#93c5fd' : '#e2e8f0'}`,
                boxShadow: data._labelSelected ? '0 0 0 2px rgba(124,58,237,.25)' : 'none',
                pointerEvents: 'all', cursor: 'move', userSelect: 'none', whiteSpace: 'nowrap',
              }}>
              {label}
            </div>
          </EdgeLabelRenderer>
        </>
      )}
    </>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const EDGE_TYPES = { flow: FlowEdge };
