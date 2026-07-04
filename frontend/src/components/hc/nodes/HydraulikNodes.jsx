import { Handle, Position } from '@xyflow/react';
import {
  SymPump, SymValve2V, SymValve3, SymCheckValve,
  SymShutoff, SymWE, SymVerbraucher, SymSpeicher, SymBypass,
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
// V' kommt vom Backend (data._calc) — hier wird nicht gerechnet.
export function HeizkreisNode({ data, selected: sel }) {
  const v = data._calc?.v != null ? Number(data._calc.v).toFixed(4) : null;

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

// ── Verteiler-Rahmen (volles CAD-Layout, Pflichtenheft §10) ──────────
// VL-Balken OBEN über die ganze Breite, RL-Balken UNTEN — die Gruppen-
// Stränge hängen dazwischen. Anzahl Abgänge wählbar (data.abgaenge, 2–8).
// Summen (aus Backend, data._calc) stehen direkt auf den Balken.
// Geometrie muss mit backend/app/export/schema_svg.py übereinstimmen!
export function VerteilerNode({ data, selected: sel }) {
  const n = Math.max(2, Math.min(8, parseInt(data.abgaenge) || 4));
  const S = 170, X0 = 120, BAR = 26;
  // Abstand zwischen den Balken einstellbar (data.hoehe, 460–1200, Standard 560)
  const LUECKE = Math.max(460, Math.min(1200, parseFloat(data.hoehe) || 560));
  const H = 2 * BAR + LUECKE;
  const W = X0 + n * S;
  const BX = Array.from({ length: n }, (_, i) => X0 + 85 + i * S);
  const c = data._calc || {};
  const fmt = (x, d = 1) => (x == null ? '—' : Number(x).toFixed(d));

  const hStyle = (top, left, bg) => ({
    position: 'absolute', top, left,
    width: 12, height: 12, borderRadius: 2,
    background: bg, border: '2px solid white',
    boxShadow: `0 0 0 1px ${bg}`,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'all',
  });

  const barSt = (top, bg) => ({
    position: 'absolute', top, left: 0, width: W, height: BAR,
    background: bg, borderRadius: 4,
    outline: sel ? '2.5px solid #1e293b' : 'none',
    pointerEvents: 'all', cursor: 'grab',
    display: 'flex', alignItems: 'center', gap: 16,
    color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: 11,
    padding: '0 10px', boxSizing: 'border-box', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ width: W, height: H, position: 'relative', pointerEvents: 'none' }}>
      {/* Führungslinien für die Stränge */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {BX.map((x, i) => (
          <line key={i} x1={x} y1={BAR} x2={x} y2={H - BAR} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4,7" />
        ))}
      </svg>

      {/* VL-Balken oben (nur die Balken sind greifbar → dragHandle .vt-bar) */}
      <div className="vt-bar" style={barSt(0, '#ef4444')}>
        <span>VL {fmt(c.vl_vt)} °C</span>
        <span>Σ {fmt(c.q_total, 2)} kW · {fmt(c.m_prim_total, 3)} m³/h</span>
      </div>
      {/* RL-Balken unten */}
      <div className="vt-bar" style={barSt(H - BAR, '#3b82f6')}>
        <span>RL {fmt(c.rl_misch)} °C · {fmt(c.m_prim_total, 3)} m³/h</span>
        {c.dp_max_ast != null && <span style={{ marginLeft: 'auto' }}>Δp Ast {c.dp_max_ast_nr}: {fmt(c.dp_max_ast)} kPa</span>}
      </div>
      {/* Abgang-Nummern auf dem VL-Balken */}
      {BX.map((x, i) => (
        <div key={`n${i}`} style={{ position: 'absolute', top: 6, left: x + 8, fontSize: 9, fontWeight: 700, color: 'white', fontFamily: 'monospace', pointerEvents: 'none' }}>{i + 1}</div>
      ))}

      {/* Hauptanschlüsse links */}
      <Handle type="source" position={Position.Left} id="vl-main" style={hStyle(BAR / 2, -6, '#ef4444')} />
      <Handle type="source" position={Position.Left} id="rl-main" style={hStyle(H - BAR / 2, -6, '#3b82f6')} />
      {/* Abgänge: VL unten am VL-Balken, RL oben am RL-Balken */}
      {BX.map((x, i) => (
        <Handle key={`vl${i}`} type="source" position={Position.Bottom} id={`vl-${i + 1}`} style={hStyle(BAR, x, '#ef4444')} />
      ))}
      {BX.map((x, i) => (
        <Handle key={`rl${i}`} type="source" position={Position.Top} id={`rl-${i + 1}`} style={hStyle(H - BAR, x, '#3b82f6')} />
      ))}
    </div>
  );
}

// ── Verbrauchergruppe: vertikaler CAD-Strang (Pflichtenheft §10) ─────
// Absperrventil → Pumpe → Thermometer → rotes Rechteck (gedrehter Text:
// Name, Q, VL/RL, m' sek) → STAD → Mischventil → Absperrventil.
// Einspritz/Bypass (PHYSIK §4) wird im Backend gerechnet — bei aktiver
// Einspritzung erscheint die gestrichelte blaue Bypass-Schleife.
// Geometrie muss mit backend/app/export/schema_svg.py übereinstimmen!
export function GruppeNode({ data, selected: sel }) {
  const c = data._calc || {};
  const einspritz = !!c.einspritz;
  const hatPumpe = data.hat_pumpe !== false;
  const hatVentil = data.hat_ventil !== false;
  const W = 150, H = 400, cx = 75;
  const kg = (v) => (v == null ? '—' : `${Math.round(v * 1000).toLocaleString('de-CH')} kg/h`);

  const hSt = (top, bg) => ({
    position: 'absolute', top, left: cx,
    width: 12, height: 12, borderRadius: 2,
    background: bg, border: '2px solid white',
    boxShadow: `0 0 0 1px ${bg}`,
    transform: 'translate(-50%, -50%)',
  });

  return (
    <div style={{ width: W, height: H, position: 'relative', cursor: 'grab' }}>
      <Handle type="source" position={Position.Top} id="vl" style={hSt(0, '#ef4444')} />
      <Handle type="source" position={Position.Bottom} id="rl" style={hSt(H, '#3b82f6')} />

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {sel && <rect x="1" y="1" width={W - 2} height={H - 2} rx="8" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,4" />}
        {/* Strangleitung: oben VL (primär), unten RL */}
        <line x1={cx} y1="0" x2={cx} y2="120" stroke="#ef4444" strokeWidth="2.5" />
        <line x1={cx} y1="285" x2={cx} y2={H} stroke="#3b82f6" strokeWidth="2.5" />
        {/* Primär-Fluss am Strangkopf */}
        <text x={cx + 8} y="12" fontSize="9" fill="#1e293b" fontFamily="monospace">{`m': ${kg(c.m_prim)}`}</text>
        {/* Absperrventil oben */}
        <polygon points={`${cx - 9},21 ${cx + 9},21 ${cx},30`} fill="#1e293b" />
        <polygon points={`${cx - 9},39 ${cx + 9},39 ${cx},30`} fill="#1e293b" />
        {/* Pumpe — Dreieck zeigt nach unten, zum roten Rechteck (Flussrichtung) */}
        {hatPumpe && (
          <>
            <circle cx={cx} cy="64" r="15" fill="white" stroke="#1e293b" strokeWidth="2.2" />
            <polygon points={`${cx - 8},57 ${cx + 8},57 ${cx},74`} fill="#1e293b" />
          </>
        )}
        {/* Thermometer */}
        <circle cx={cx} cy="98" r="6" fill="white" stroke="#1e293b" strokeWidth="1.4" />
        <text x={cx} y="101" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1e293b">T</text>
        {/* Rotes Rechteck mit gedrehtem Text (wie im CAD) */}
        <rect x="52" y="120" width="46" height="165" fill="white" stroke="#ef4444" strokeWidth="2" />
        <text transform="translate(63 202) rotate(-90)" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ef4444" fontFamily="monospace">
          {data.label || 'Verbrauchergruppe'}
        </text>
        <text transform="translate(75 202) rotate(-90)" textAnchor="middle" fontSize="8.5" fill="#ef4444" fontFamily="monospace">
          {`${data.q_kw ?? '—'} kW · VL/RL ${data.vl_temp ?? '—'}/${data.rl_temp ?? '—'} °C`}
        </text>
        <text transform="translate(87 202) rotate(-90)" textAnchor="middle" fontSize="8.5" fill="#ef4444" fontFamily="monospace">
          {`m': ${kg(c.m_sek)}`}
        </text>
        {/* STAD (Strangregulierventil) */}
        <polygon points={`${cx - 9},294 ${cx + 9},294 ${cx},303`} fill="#1e293b" />
        <polygon points={`${cx - 9},312 ${cx + 9},312 ${cx},303`} fill="#1e293b" />
        <line x1={cx + 9} y1="294" x2={cx + 20} y2="288" stroke="#1e293b" strokeWidth="1.6" />
        {/* Thermometer */}
        <circle cx={cx + 24} cy="320" r="6" fill="white" stroke="#1e293b" strokeWidth="1.4" />
        <text x={cx + 24} y="323" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1e293b">T</text>
        {/* 3-Weg-Mischventil (M orange = Einspritzung aktiv) */}
        {hatVentil && (
          <>
            <polygon points={`${cx - 9},330 ${cx + 9},330 ${cx},338`} fill="#1e293b" />
            <polygon points={`${cx - 9},346 ${cx + 9},346 ${cx},338`} fill="#1e293b" />
            <rect x={cx + 12} y="331" width="14" height="14" rx="2" fill={einspritz ? '#f97316' : '#94a3b8'} />
            <text x={cx + 19} y="341" textAnchor="middle" fontSize="8" fontWeight="700" fill="white">M</text>
            {c.ventil && (
              <text x={cx + 30} y="341" fontSize="8" fill="#1e293b" fontFamily="monospace">kvs {c.ventil.kvs_eff}</text>
            )}
          </>
        )}
        {/* Absperrventil unten */}
        <polygon points={`${cx - 9},359 ${cx + 9},359 ${cx},368`} fill="#1e293b" />
        <polygon points={`${cx - 9},377 ${cx + 9},377 ${cx},368`} fill="#1e293b" />
        {/* Bypass-Schleife bei aktiver Einspritzung */}
        {einspritz && (
          <>
            <path d={`M ${cx} 44 H 22 V 338 H ${cx - 9}`} fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeDasharray="6,4" />
            <circle cx={cx} cy="44" r="3.5" fill="#3b82f6" />
            <circle cx={cx} cy="338" r="3.5" fill="#3b82f6" />
            <text x="16" y="210" transform="rotate(-90 16 210)" textAnchor="middle" fontSize="8" fill="#3b82f6" fontFamily="monospace">
              {`Bypass ${c.m_bypass != null ? Number(c.m_bypass).toFixed(3) : '—'} m³/h`}
            </text>
          </>
        )}
      </svg>
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

// ── Bauteil-Nummern (Pflichtenheft §10: Nummerierung + Legende) ──────
// Jedes nummerierbare Bauteil bekommt ein rotes Badge (data.nr) oben rechts.
export const NUMMERIERT = ['gruppe', 'heizkreis', 'pump', 'valve2', 'valve3', 'checkvalve', 'shutoff', 'erzeuger', 'speicher', 'verteiler'];

function mitNr(Comp) {
  function MitNr(props) {
    const nr = props.data?.nr;
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <Comp {...props} />
        {nr != null && (
          <div style={{
            position: 'absolute', top: -9, right: -9, minWidth: 20, height: 17,
            borderRadius: 9, background: 'white', border: '1.5px solid #dc2626',
            color: '#dc2626', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', zIndex: 20, pointerEvents: 'none',
          }}>{nr}</div>
        )}
      </div>
    );
  }
  return MitNr;
}

const BASIS_TYPES = {
  gruppe:      GruppeNode,
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

export const NODE_TYPES = Object.fromEntries(
  Object.entries(BASIS_TYPES).map(([k, C]) => [k, NUMMERIERT.includes(k) ? mitNr(C) : C])
);
