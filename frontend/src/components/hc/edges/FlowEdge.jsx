import { BaseEdge, getSmoothStepPath, EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { useState, useCallback } from 'react';

export function FlowEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style = {}, label, labelStyle, labelBgStyle, labelBgPadding,
  selected,
}) {
  const { setEdges } = useReactFlow();
  const [dragging, setDragging] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  const isVL = style.stroke === '#ef4444';
  const isRL = style.stroke === '#3b82f6';

  // Midpoint für den Zieh-Handle
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  // Linie in der Mitte verschieben: neuen Edge-Style setzen
  const onMidDrag = useCallback((e) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      {/* Basis-Leitung */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: isVL ? 3 : 2.5,
          strokeDasharray: isRL ? '8 5' : undefined,
          fill: 'none',
        }}
      />

      {/* VL: weisser Licht-Puls */}
      {isVL && (
        <path d={edgePath} fill="none"
          stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeLinecap="round"
          strokeDasharray="18 9999"
          style={{ animation: 'hc-vl-pulse 2.2s linear infinite' }}
          pointerEvents="none" />
      )}

      {/* RL: gestrichelte Animation */}
      {isRL && (
        <path d={edgePath} fill="none"
          stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="6 6"
          style={{ animation: 'hc-rl-flow 1.4s linear infinite' }}
          pointerEvents="none" />
      )}

      {/* Breiter unsichtbarer Klick-Bereich in der Mitte */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        style={{ cursor: 'pointer' }} />

      {/* Massenstrom-Label */}
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
            color: isVL ? '#b91c1c' : isRL ? '#1d4ed8' : '#374151',
            background: 'rgba(255,255,255,0.92)',
            padding: '2px 5px', borderRadius: 3,
            border: `1px solid ${isVL ? '#fca5a5' : isRL ? '#93c5fd' : '#e2e8f0'}`,
            pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Midpoint-Handle: Leitung in der Mitte ziehen */}
      <EdgeLabelRenderer>
        <div
          title="Leitung verschieben"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)`,
            width: 14, height: 14, borderRadius: '50%',
            background: selected ? (isVL ? '#ef4444' : isRL ? '#3b82f6' : '#475569') : 'rgba(255,255,255,0.7)',
            border: `2px solid ${isVL ? '#ef4444' : isRL ? '#3b82f6' : '#475569'}`,
            cursor: 'grab',
            opacity: selected ? 1 : 0,
            transition: 'opacity 0.15s',
            pointerEvents: 'all',
            zIndex: 10,
          }}
          className="hc-edge-mid"
        />
      </EdgeLabelRenderer>
    </>
  );
}

export const EDGE_TYPES = { flow: FlowEdge };
