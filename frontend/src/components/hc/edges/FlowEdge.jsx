import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

// CAD-Leitung (Dominic-Feedback): dünn, rechte Winkel mit ganz kleinen runden
// Bögen, Rücklauf gestrichelt, keine Animation. Freies Zeichnen (Polylinie) +
// T-Stück-Snap kommen als nächster Schritt.
export function FlowEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, label,
}) {
  const isVL = style.stroke === '#ef4444';
  const isRL = style.stroke === '#3b82f6';
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath}
        style={{ ...style, strokeWidth: isVL ? 2 : 1.6, strokeDasharray: isRL ? '6 4' : undefined, fill: 'none' }} />

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }} />

      {/* Leitungs-Label (DN + Massenstrom) — in der Streckenmitte */}
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -130%) translate(${labelX}px,${labelY}px)`,
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

export const EDGE_TYPES = { flow: FlowEdge };
