import { BaseEdge, EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';

// Orthogonale CAD-Leitung mit greifbarem Mittelsegment (Pflichtenheft §10):
// - senkrecht/waagrecht dominante Führung (V-H-V bzw. H-V-H)
// - der Griff in der Mitte verschiebt das Mittelsegment (edge.data.mid),
//   wird mit dem Schema gespeichert und gilt auch im PDF-Export.
export function FlowEdge({
  id, sourceX, sourceY, targetX, targetY,
  style = {}, label, selected, data,
}) {
  const { setEdges, screenToFlowPosition } = useReactFlow();

  const isVL = style.stroke === '#ef4444';
  const isRL = style.stroke === '#3b82f6';

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const vertikal = Math.abs(dy) >= Math.abs(dx);
  // NIE schräge Linien (CAD-Regel): nur exakt fluchtende Punkte geben eine
  // gerade Leitung, alles andere wird orthogonal (V-H-V bzw. H-V-H) geführt.
  const gerade = vertikal ? Math.abs(dx) < 0.5 : Math.abs(dy) < 0.5;

  let edgePath, midX, midY, richtung;
  if (gerade) {
    edgePath = vertikal
      ? `M ${sourceX} ${sourceY} V ${targetY}`
      : `M ${sourceX} ${sourceY} H ${targetX}`;
    midX = (sourceX + targetX) / 2;
    midY = (sourceY + targetY) / 2;
    richtung = null; // gerade Leitung: nichts zu verschieben
  } else if (vertikal) {
    midY = data?.mid ?? (sourceY + targetY) / 2;
    midX = (sourceX + targetX) / 2;
    edgePath = `M ${sourceX} ${sourceY} V ${midY} H ${targetX} V ${targetY}`;
    richtung = 'y';
  } else {
    midX = data?.mid ?? (sourceX + targetX) / 2;
    midY = (sourceY + targetY) / 2;
    edgePath = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`;
    richtung = 'x';
  }

  // Mittelsegment packen und verschieben — rastet aufs 10-px-Raster
  // (weniger Updates → ruhigeres Ziehen, fluchtet mit dem Canvas-Raster)
  const startDrag = useCallback((e) => {
    if (!richtung) return;
    e.stopPropagation();
    e.preventDefault();
    let letzter = null;
    const move = (ev) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const wert = Math.round((richtung === 'y' ? p.y : p.x) / 10) * 10;
      if (wert === letzter) return;
      letzter = wert;
      setEdges(es => es.map(ed => ed.id === id ? { ...ed, data: { ...ed.data, mid: wert } } : ed));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [richtung, id, screenToFlowPosition, setEdges]);

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

      {/* Breiter unsichtbarer Klick-Bereich */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        style={{ cursor: 'pointer' }} />

      {/* Massenstrom-Label — leicht über dem Mittelsegment */}
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -130%) translate(${midX}px,${midY}px)`,
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

      {/* Griff: Mittelsegment verschieben (nur bei versetzten Leitungen) */}
      {richtung && (
        <EdgeLabelRenderer>
          <div
            title={richtung === 'y' ? 'Segment rauf/runter schieben' : 'Segment links/rechts schieben'}
            onPointerDown={startDrag}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)`,
              width: 14, height: 14, borderRadius: 4,
              background: 'white',
              border: `2.5px solid ${isVL ? '#ef4444' : isRL ? '#3b82f6' : '#475569'}`,
              cursor: richtung === 'y' ? 'ns-resize' : 'ew-resize',
              opacity: selected ? 1 : 0.45,   // Fangpunkt ist immer leicht sichtbar
              transition: 'opacity 0.15s',
              pointerEvents: 'all',
              zIndex: 10,
            }}
            className="hc-edge-mid"
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const EDGE_TYPES = { flow: FlowEdge };
