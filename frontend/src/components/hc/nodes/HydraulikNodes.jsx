import { Handle, Position } from '@xyflow/react';
import {
  SymPump, SymValve2V, SymValve3, SymCheckValve,
  SymShutoff, SymWE, SymVerbraucher, SymSpeicher, SymBypass, SymVerteiler,
} from './symbols';

// Alle Handles als "source" + ConnectionMode.Loose → jeder mit jedem verbindbar
// Grössere Handles für einfacheres Verbinden
const H = (pos, id, style = {}) => (
  <Handle
    type="source"
    position={pos}
    id={id}
    style={{
      width: 14, height: 14, borderRadius: 3,
      background: '#475569', border: '2px solid white',
      boxShadow: '0 0 0 1px #cbd5e1',
      zIndex: 10,
      ...style,
    }}
  />
);

const selBorder = (sel) => sel ? '2px solid #3b82f6' : '2px solid transparent';
const wrap = (sel) => ({
  background: 'transparent',
  border: selBorder(sel),
  borderRadius: 6,
  padding: 2,
  display: 'inline-block',
  position: 'relative',
});

function Label({ text, color = '#475569' }) {
  if (!text) return null;
  return (
    <div style={{ fontSize: 9, textAlign: 'center', color, marginTop: 2, whiteSpace: 'nowrap' }}>
      {text}
    </div>
  );
}

// ── Pumpe ─────────────────────────────────────────────────────
export function PumpNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6 })}
      {H(Position.Bottom, 'bottom', { bottom: -6 })}
      <SymPump />
      <Label text={data.label} />
    </div>
  );
}

// ── 2-Wege Regelventil (vertikal) ────────────────────────────
export function Valve2Node({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6,    background: '#1d4ed8' })}
      {H(Position.Bottom, 'bottom', { bottom: -6, background: '#1d4ed8' })}
      <SymValve2V />
      <Label text={data.label} color="#1d4ed8" />
    </div>
  );
}

// ── 3-Wege Mischventil ───────────────────────────────────────
// Handles: links=A, rechts=B, unten=AB, plus grosser Mittel-Handle
export function Valve3Node({ data, selected: sel }) {
  // SVG 66x84: Zentrum bei (33, 40) → ~50% breite, ~48% höhe
  return (
    <div style={{ ...wrap(sel), position: 'relative' }}>
      {/* Port A – links */}
      {H(Position.Left,   'left',   { left: -7,    top: '48%', background: '#1e293b' })}
      {/* Port B – rechts */}
      {H(Position.Right,  'right',  { right: -7,   top: '48%', background: '#1e293b' })}
      {/* Port AB – unten */}
      {H(Position.Bottom, 'bottom', { bottom: -7,  background: '#1e293b' })}
      {/* Grosser transparenter Mittel-Handle für einfaches Verbinden */}
      <Handle type="source" position={Position.Top} id="center"
        style={{ top: '44%', left: '50%', width: 22, height: 22, borderRadius: '50%', background: 'transparent', border: '2px dashed rgba(124,58,237,0.4)', transform: 'translate(-50%,-50%)', cursor: 'crosshair' }} />
      <SymValve3 />
      <Label text={data.label} color="#1e293b" />
    </div>
  );
}

// ── Rückschlagventil ─────────────────────────────────────────
export function CheckValveNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6 })}
      {H(Position.Bottom, 'bottom', { bottom: -6 })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <SymCheckValve />
      <Label text={data.label} />
    </div>
  );
}

// ── Absperrventil ─────────────────────────────────────────────
export function ShutoffNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6 })}
      {H(Position.Bottom, 'bottom', { bottom: -6 })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <SymShutoff />
      <Label text={data.label} />
    </div>
  );
}

// ── Wärmeerzeuger (WE) ───────────────────────────────────────
export function ErzeugerNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6 })}
      {H(Position.Bottom, 'bottom', { bottom: -6 })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      {H(Position.Right,  'vl',     { right: -6, top: '25%', bottom: 'auto', background: '#ef4444' })}
      {H(Position.Right,  'rl',     { right: -6, top: '75%', bottom: 'auto', background: '#3b82f6' })}
      <SymWE />
      <Label text={data.label} />
    </div>
  );
}

// ── Verbraucher (legacy, keep for compat) ────────────────────
export function VerbraucherNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6,    background: '#ef4444' })}
      {H(Position.Bottom, 'bottom', { bottom: -6, background: '#3b82f6' })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <SymVerbraucher />
      <Label text={data.label || 'Heizkreis'} color="#c2410c" />
    </div>
  );
}

// ── Heizkreis: grüner Kreis, VL links, RL rechts ─────────────
export function HeizkreisNode({ data, selected: sel }) {
  const vl  = parseFloat(data.vl_temp);
  const rl  = parseFloat(data.rl_temp);
  const q   = parseFloat(data.q_kw);
  const dt  = vl - rl;
  const v   = (!isNaN(vl) && !isNaN(rl) && !isNaN(q) && dt > 0)
    ? (q / (1.163 * dt)).toFixed(4)
    : null;

  return (
    <div style={{
      width: 74, height: 74, borderRadius: '50%',
      background: 'rgba(187,247,208,0.45)',
      border: `2.5px solid ${sel ? '#3b82f6' : '#16a34a'}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', cursor: 'grab',
      boxShadow: sel ? '0 0 0 2px #93c5fd' : 'none',
    }}>
      {/* VL links (rot) */}
      <Handle type="source" position={Position.Left} id="vl"
        style={{ left: -6, top: '38%', background: '#ef4444', width: 10, height: 10, borderRadius: 2, border: '1.5px solid white' }} />
      {/* RL rechts (blau) */}
      <Handle type="source" position={Position.Right} id="rl"
        style={{ right: -6, top: '38%', background: '#3b82f6', width: 10, height: 10, borderRadius: 2, border: '1.5px solid white' }} />
      {/* Extra handles top/bottom für Flexibilität */}
      {H(Position.Top,    'top',    { top: -6, background: '#64748b' })}
      {H(Position.Bottom, 'bottom', { bottom: -6, background: '#64748b' })}

      <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', textAlign: 'center', lineHeight: 1.2, userSelect: 'none' }}>
        {data.label || 'HK'}
      </div>
      {data.q_kw && (
        <div style={{ fontSize: 8, color: '#16a34a', marginTop: 1 }}>{data.q_kw} kW</div>
      )}
      {v && (
        <div style={{ fontSize: 7, color: '#166534', marginTop: 1 }}>{v} m³/h</div>
      )}
      {/* VL/RL labels */}
      <div style={{ position: 'absolute', left: -22, top: '28%', fontSize: 7, color: '#ef4444', fontWeight: 700 }}>VL</div>
      <div style={{ position: 'absolute', right: -18, top: '28%', fontSize: 7, color: '#3b82f6', fontWeight: 700 }}>RL</div>
    </div>
  );
}

// ── Speicher ──────────────────────────────────────────────────
export function SpeicherNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top-l',  { top: -6,    left: '30%' })}
      {H(Position.Top,    'top-r',  { top: -6,    left: '70%' })}
      {H(Position.Bottom, 'bot-l',  { bottom: -6, left: '30%' })}
      {H(Position.Bottom, 'bot-r',  { bottom: -6, left: '70%' })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <SymSpeicher />
      <Label text={data.label || 'Speicher'} />
    </div>
  );
}

// ── Verteiler ─────────────────────────────────────────────────
// ── Verteiler/Sammler: zwei Balken, je 4 Anschlüsse oben + 1 links ──
// VL Verteiler oben (rot), RL Sammler unten (blau)
// SVG 200×78 → node = 200px breit, 78px hoch
export function VerteilerNode({ data, selected: sel }) {
  // Positionen der 4 Abgänge im SVG: x = 36, 83, 130, 177
  const VL_Y = 18;  // Mitte VL-Balken (y 4–32)
  const RL_Y = 60;  // Mitte RL-Balken (y 46–74)
  const BX = [36, 83, 130, 177]; // Branch x-Positionen

  const hStyle = (top, left, bg) => ({
    position: 'absolute',
    top, left,
    width: 12, height: 12, borderRadius: 2,
    background: bg,
    border: '2px solid white',
    boxShadow: `0 0 0 1px ${bg}`,
    transform: 'translate(-50%, -50%)',
  });

  return (
    <div style={{
      width: 200, height: 78,
      position: 'relative',
      border: sel ? '2px solid #3b82f6' : '2px solid transparent',
      borderRadius: 6,
    }}>
      {/* VL Hauptanschluss links */}
      <Handle type="source" position={Position.Left} id="vl-main"
        style={hStyle(VL_Y, -6, '#ef4444')} />

      {/* VL Abgänge oben (4x) — an den Stutzen-Positionen */}
      {BX.map((x, i) => (
        <Handle key={`vl${i}`} type="source" position={Position.Top} id={`vl-${i+1}`}
          style={hStyle(-6, x, '#ef4444')} />
      ))}

      {/* RL Hauptanschluss links */}
      <Handle type="source" position={Position.Left} id="rl-main"
        style={hStyle(RL_Y, -6, '#3b82f6')} />

      {/* RL Abgänge – versetzt (+12px) damit sie nicht genau über VL sind */}
      {BX.map((x, i) => (
        <Handle key={`rl${i}`} type="source" position={Position.Top} id={`rl-${i+1}`}
          style={hStyle(40, x + 12, '#3b82f6')} />
      ))}

      <SymVerteiler />
    </div>
  );
}

// ── T-Stück — echtes T mit 3 Anschlüssen ─────────────────────
export function JunctionNode({ selected: sel }) {
  return (
    <div style={{
      width: 46, height: 46, position: 'relative', cursor: 'grab',
      border: sel ? '2px solid #3b82f6' : '2px solid transparent',
      borderRadius: 4,
    }}>
      {/* Links */}
      <Handle type="source" position={Position.Left}   id="left"
        style={{ left: -7, top: '65%', width: 14, height: 14, borderRadius: 2, background: '#1e293b', border: '2px solid white' }} />
      {/* Rechts */}
      <Handle type="source" position={Position.Right}  id="right"
        style={{ right: -7, top: '65%', width: 14, height: 14, borderRadius: 2, background: '#1e293b', border: '2px solid white' }} />
      {/* Oben (Abzweigung) */}
      <Handle type="source" position={Position.Top}    id="top"
        style={{ top: -7, left: '50%', transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: 2, background: '#1e293b', border: '2px solid white' }} />
      {/* T-Stück SVG */}
      <svg viewBox="0 0 46 46" width="46" height="46">
        {/* Horizontales Rohr */}
        <line x1="0" y1="32" x2="46" y2="32" stroke="#1e293b" strokeWidth="7" strokeLinecap="round"/>
        {/* Vertikale Abzweigung nach oben */}
        <line x1="23" y1="32" x2="23" y2="4" stroke="#1e293b" strokeWidth="7" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── Text-Label ────────────────────────────────────────────────
export function LabelNode({ data }) {
  return (
    <div style={{
      fontSize: 10, color: '#64748b', background: 'transparent',
      border: 'none', maxWidth: 150, userSelect: 'none', pointerEvents: 'none',
    }}>
      {data.label}
    </div>
  );
}

export const NODE_TYPES = {
  heizkreis:   HeizkreisNode,
  pump:        PumpNode,
  valve2:      Valve2Node,
  valve3:      Valve3Node,
  checkvalve:  CheckValveNode,
  shutoff:     ShutoffNode,
  junction:    JunctionNode,
  erzeuger:    ErzeugerNode,
  verbraucher: VerbraucherNode,
  speicher:    SpeicherNode,
  verteiler:   VerteilerNode,
  label:       LabelNode,
};
