import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';

// CAD-Leitung: rechte Winkel (senkrecht/waagrecht), kein 45°. Fluchtet → gerade,
// sonst V-H-V (senkrecht-dominant) bzw. H-V-H (waagrecht-dominant).
function pfad(sourceX, sourceY, targetX, targetY) {
  const dx = targetX - sourceX, dy = targetY - sourceY;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < 0.5 || ady < 0.5) return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  if (ady >= adx) {
    const my = (sourceY + targetY) / 2;
    return `M ${sourceX} ${sourceY} V ${my} H ${targetX} V ${targetY}`;
  }
  const mx = (sourceX + targetX) / 2;
  return `M ${sourceX} ${sourceY} H ${mx} V ${targetY} H ${targetX}`;
}

export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, style = {}, label }) {
  const isVL = style.stroke === '#ef4444';
  const isRL = style.stroke === '#3b82f6';
  const edgePath = pfad(sourceX, sourceY, targetX, targetY);
  const midX = (sourceX + targetX) / 2, midY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge id={id} path={edgePath}
        style={{ ...style, strokeWidth: isVL ? 3 : 2.5, strokeDasharray: isRL ? '8 5' : undefined, fill: 'none' }} />

      {/* VL: weisser Licht-Puls */}
      {isVL && (
        <path d={edgePath} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeLinecap="round"
          strokeDasharray="18 9999" style={{ animation: 'hc-vl-pulse 2.2s linear infinite' }} pointerEvents="none" />
      )}

      {/* RL: gestrichelte Animation */}
      {isRL && (
        <path d={edgePath} fill="none" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="6 6"
          style={{ animation: 'hc-rl-flow 1.4s linear infinite' }} pointerEvents="none" />
      )}

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18} style={{ cursor: 'pointer' }} />

      {/* Leitungs-Label (DN + Massenstrom) — in der Streckenmitte */}
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -130%) translate(${midX}px,${midY}px)`,
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
