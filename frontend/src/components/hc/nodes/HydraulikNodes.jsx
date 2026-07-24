import { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import {
  SymPump, SymValve2V, SymValve3, SymCheckValve,
  SymShutoff, SymWE, SymVerbraucher, SymSpeicher, SymBypass,
  SymSTAD, SymTemperatur, SymSicherheitsventil, SymPWT,
} from './symbols';

// Alle Handles als "source" + ConnectionMode.Loose → jeder mit jedem verbindbar
// Grössere Handles für einfacheres Verbinden
const H = (pos, id, style = {}, className = '') => (
  <Handle
    type="source"
    position={pos}
    id={id}
    className={className}
    style={{
      width: 14, height: 14, borderRadius: 3,
      background: '#475569', border: '2px solid white',
      boxShadow: '0 0 0 1px #cbd5e1',
      zIndex: 10,
      ...style,
    }}
  />
);

// Anschlusszone (Dominic 2026-07-20): dichte, dezente Handles rund um das
// Bauteil, damit sich eine Leitung ÜBERALL am Rand anschliessen kann — WP und
// Speicher können so 2–6+ Anschlüsse an frei gewählten Stellen haben, ohne
// feste Punkte. IDs sind NEUTRAL (kein vl/rl-Präfix) → jede Leitung dockt an;
// ob VL oder RL entscheidet der Zeichen-Layer/die Strichfarbe, nicht das Handle
// (siehe backend/app/calculations/hydraulik.py::_stroke). Die bestehenden
// benannten Handles (vl/rl/left/right …) bleiben für Altschemas erhalten.
// Anschlusszone als EINE ruhige Zone statt vieler Punkte (Dominic-Feedback):
// ein dezenter gestrichelter Rahmen zeigt „hier kann überall angeschlossen
// werden"; auf Hover wird er deutlich. Die eigentlichen Anschlusspunkte bleiben
// funktional erhalten (Leitung dockt an frei gewählten Stellen an), sind aber
// unsichtbar — so wirkt das Bauteil aufgeräumt und lädt nicht zum versehentlichen
// Ziehen von Leitungen ein. IDs bleiben NEUTRAL (VL/RL kommt aus dem Layer).
const ZONE_PCT = [12, 28, 44, 60, 76, 90];
const zoneDot = {
  width: 12, height: 12, borderRadius: 2,
  background: 'transparent', border: 'none', opacity: 0,
  zIndex: 4,
};
function ZoneHandles({ prefix }) {
  return (
    <>
      <div className="hc-zone-frame" aria-hidden="true" />
      {ZONE_PCT.map(p => <Handle key={`${prefix}-t-${p}`} type="source" position={Position.Top}    id={`${prefix}-t-${p}`} style={{ ...zoneDot, top: -5, left: `${p}%` }} />)}
      {ZONE_PCT.map(p => <Handle key={`${prefix}-b-${p}`} type="source" position={Position.Bottom} id={`${prefix}-b-${p}`} style={{ ...zoneDot, bottom: -5, left: `${p}%` }} />)}
      {ZONE_PCT.map(p => <Handle key={`${prefix}-l-${p}`} type="source" position={Position.Left}   id={`${prefix}-l-${p}`} style={{ ...zoneDot, left: -5, top: `${p}%` }} />)}
      {ZONE_PCT.map(p => <Handle key={`${prefix}-r-${p}`} type="source" position={Position.Right}  id={`${prefix}-r-${p}`} style={{ ...zoneDot, right: -5, top: `${p}%` }} />)}
    </>
  );
}

const selBorder = (sel) => sel ? '2px solid #3b82f6' : '2px solid transparent';
const wrap = (sel) => ({
  background: 'transparent',
  border: selBorder(sel),
  borderRadius: 6,
  padding: 0,   // kein Innenabstand → Fangpunkt-Prozente treffen exakt die Symbol-Mitte
  display: 'inline-block',
  position: 'relative',
});

// Bauteil-Namen unter dem Symbol entfernt (Dominic-Feedback): das Bauteil wird
// übers Symbol + die Nummer (Legende) erkannt — kein Text-Untertitel nötig.
function Label() {
  return null;
}

// ── Pumpe ─────────────────────────────────────────────────────
export function PumpNode({ data, selected: sel }) {
  // Genau zwei Anschlüsse auf der Pumpenachse; bei einer Drehung wandern sie
  // zusammen mit dem Symbol.
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -4 }, 'hc-pump-handle')}
      {H(Position.Bottom, 'bottom', { bottom: -4 }, 'hc-pump-handle')}
      <SymPump />
      <Label text={data.label} />
    </div>
  );
}

// ── 2-Wege Regelventil (Flussachse rechts, Antrieb links → 75%) ──
export function Valve2Node({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6,    left: '75%', background: '#1e293b' })}
      {H(Position.Bottom, 'bottom', { bottom: -6, left: '75%', background: '#1e293b' })}
      <SymValve2V />
      <Label text={data.label} color="#1e293b" />
    </div>
  );
}

// ── 3-Wege Mischventil (Flussachse ~63%, 3. Tor rechts) ──────
export function Valve3Node({ data, selected: sel }) {
  return (
    <div style={{ ...wrap(sel), position: 'relative' }}>
      {H(Position.Top,    'top',    { top: -6,    left: '63%', background: '#1e293b' })}
      {H(Position.Bottom, 'bottom', { bottom: -6, left: '63%', background: '#1e293b' })}
      {H(Position.Right,  'right',  { right: -6,   top: '51%',  background: '#1e293b' })}
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

// ── STAD-Strangregulierventil (nur Symbol + Fabrikat) ────────
export function StadNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6 })}
      {H(Position.Bottom, 'bottom', { bottom: -6 })}
      <SymSTAD />
      <Label text={data.label || 'STAD'} />
    </div>
  );
}

// ── Temperaturfühler (nur Symbol) ────────────────────────────
export function TemperaturNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Left,   'left',   { left: -6, top: '55%' })}
      {H(Position.Bottom, 'bottom', { bottom: -6, left: '38%' })}
      <SymTemperatur />
      <Label text={data.label} />
    </div>
  );
}

// ── Sicherheitsventil — ein Fangpunkt am roten Knoten (keine Leitung mehr) ───
export function SicherheitsventilNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Left, 'an', { left: '12%', top: '61%', background: '#ef4444' })}
      <SymSicherheitsventil />
      <Label text={data.label || 'SV'} />
    </div>
  );
}

// ── Plattenwärmetauscher PWT (4 Tore an den Rauten-Ecken) ────
export function PwtNode({ selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {/* Mitte der 4 Rauten-Seiten, oben/unten symmetrisch. Links = Primär
          (oben EIN/VL, unten AUS/RL), rechts = Sekundär (oben AUS warm, unten EIN kalt). */}
      {H(Position.Left,   'left',   { left: '27%', top: '35%', background: '#ef4444' })}
      {H(Position.Bottom, 'bottom', { left: '27%', top: '77%', background: '#3b82f6' })}
      {H(Position.Top,    'top',    { left: '59%', top: '35%', background: '#ef4444' })}
      {H(Position.Right,  'right',  { left: '59%', top: '77%', background: '#3b82f6' })}
      <SymPWT />
    </div>
  );
}

// ── Wärmeerzeuger (WE): VL oben, RL unten ────────────────────
export function ErzeugerNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      <ZoneHandles prefix="wz" />
      {H(Position.Top,    'vl',    { top: -6, background: '#ef4444' })}
      {H(Position.Bottom, 'rl',    { bottom: -6, background: '#3b82f6' })}
      {H(Position.Left,   'left',  { left: -6 })}
      {H(Position.Right,  'right', { right: -6 })}
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
      <ZoneHandles prefix="sz" />
      {H(Position.Top,    'top-l',  { top: -6,    left: '30%', background:'#ef4444' })}
      {H(Position.Top,    'top-r',  { top: -6,    left: '70%', background:'#ef4444' })}
      {H(Position.Bottom, 'bot-l',  { bottom: -6, left: '30%', background:'#3b82f6' })}
      {H(Position.Bottom, 'bot-r',  { bottom: -6, left: '70%', background:'#3b82f6' })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <SymSpeicher liter={data.speicher_liter} />
      <Label text={data.label || 'Speicher'} />
    </div>
  );
}

// ── Erdsondenfeld mit dynamischem Soleverteiler ─────────────────────────────
// Eine Duplexsonde besitzt zwei U-Rohre. Im Schema werden deshalb pro Sonde
// zwei durchgezogene Vorlauf-Schenkel und zwei gestrichelte Rücklauf-Schenkel
// dargestellt. Die Sondenlänge ist eine Eigenschaft, aber bewusst kein
// geometrischer Massstab: Auch 300 m tiefe Sonden bleiben im Schema kompakt.
const erdsondenAnzahl = (data = {}) =>
  Math.max(1, Math.min(24, parseInt(data.sonden_anzahl) || 5));

const erdsondenBreite = (data = {}) => 52 + erdsondenAnzahl(data) * 58;
const ERDSONDEN_HOEHE = 286;

export function ErdsondenNode({ data, selected: sel }) {
  const n = erdsondenAnzahl(data);
  const W = erdsondenBreite(data);
  const H = ERDSONDEN_HOEHE;
  const xs = Array.from({ length: n }, (_, i) => 52 + i * 58);
  const laenge = Number(data.sonden_laenge_m);
  const laengeText = Number.isFinite(laenge) && laenge > 0
    ? ` à ${Math.round(laenge).toLocaleString('de-CH')} m`
    : '';
  const sole = '#4f46e5';
  const farbe = (dashed) => dashed ? '#7c3aed' : sole;
  const rightHandle = (top, id, dashed = false) => (
    <Handle
      type="source"
      position={Position.Right}
      id={id}
      style={{
        right: -6, top,
        width: 12, height: 12, borderRadius: 2,
        background: farbe(dashed),
        border: '2px solid white',
        boxShadow: `0 0 0 1px ${farbe(dashed)}`,
        transform: 'translate(50%, -50%)',
        zIndex: 10,
      }}
    />
  );
  const verticalHandle = (position, left, id, dashed = false) => (
    <Handle
      type="source"
      position={position}
      id={id}
      style={{
        [position === Position.Top ? 'top' : 'bottom']: -6,
        left,
        width: 12, height: 12, borderRadius: 2,
        background: farbe(dashed),
        border: '2px solid white',
        boxShadow: `0 0 0 1px ${farbe(dashed)}`,
        zIndex: 10,
      }}
    />
  );

  return (
    <div style={{
      width: W, height: H, position: 'relative', cursor: 'grab',
      border: sel ? '2px solid #3b82f6' : '2px solid transparent',
      borderRadius: 7, boxSizing: 'content-box',
    }}>
      {rightHandle(55, 'sole-vl')}
      {rightHandle(85, 'sole-rl', true)}
      {verticalHandle(Position.Top, '42%', 'sole-vl-top')}
      {verticalHandle(Position.Top, '58%', 'sole-rl-top', true)}
      {verticalHandle(Position.Bottom, '42%', 'sole-vl-bottom')}
      {verticalHandle(Position.Bottom, '58%', 'sole-rl-bottom', true)}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}
        role="img" aria-label={`${n} Duplex-Erdsonden${laengeText}`}>
        {/* Bezeichnung wie in der CAD-Vorlage. */}
        <rect x={W / 2 - 82} y="2" width="164" height="24" rx="2"
          fill="white" stroke={sole} strokeWidth="1.5" />
        <text x={W / 2} y="18" textAnchor="middle" fontSize="11"
          fontFamily="Arial, sans-serif" fill="#3730a3">
          {n} Duplex-Erdsonden{laengeText}
        </text>

        {/* Verteilerkasten mit zwei klaren Sammelbalken wie in der CAD-Vorlage. */}
        <rect x="8" y="34" width={W - 16} height="78" fill="white"
          stroke="#1f2937" strokeWidth="1.4" />
        <rect x="22" y="48" width={W - 44} height="14" fill="white"
          stroke={sole} strokeWidth="1.8" />
        <rect x="34" y="78" width={W - 68} height="14" fill="white"
          stroke="#7c3aed" strokeWidth="1.7" strokeDasharray="7 4" />

        {xs.map((x, index) => (
          <g key={index}>
            {/* Schlichte Anschlussmarken; Armaturen gehören nicht ins Bauteilsymbol. */}
            <path d={`M ${x - 9} 38 l 6 6 m 0 -6 l -6 6 M ${x + 9} 68 l 6 6 m 0 -6 l -6 6`}
              fill="none" stroke="#312e81" strokeWidth="1.1" strokeLinecap="round" />

            {/* Duplex: ein durchgezogenes und ein gestricheltes U-Rohr je Sonde. */}
            <path d={`M ${x - 9} 62 V 118 H ${x - 17} V 258
              Q ${x - 17} 274 ${x - 11} 274
              Q ${x - 5} 274 ${x - 5} 258 V 118 H ${x - 9}`}
              fill="none" stroke={sole} strokeWidth="1.9" strokeLinejoin="round" />
            <path d={`M ${x + 9} 92 V 122 H ${x + 3} V 258
              Q ${x + 3} 274 ${x + 9} 274
              Q ${x + 15} 274 ${x + 15} 258 V 122 H ${x + 9}`}
              fill="none" stroke="#7c3aed" strokeWidth="1.9"
              strokeDasharray="7 4" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
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
  // Schaltungsart (PHYSIK §6): einspritz = 2WV + Bypass ÜBER dem Ventil ·
  // beimisch = 3WV + Bypass in den dritten Anschluss · drossel = nur Ventil
  const schaltung = ['einspritz', 'beimisch', 'drossel'].includes(data.schaltung) ? data.schaltung : 'einspritz';
  const hatPumpe = schaltung !== 'drossel' && data.hat_pumpe !== false;
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

  // Absperrventil-Symbol (Kugelhahn-Vorlage): weiss gefüllte Dreiecke + kleiner
  // unausgefüllter Kreis am Treffpunkt (nicht mehr schwarz gefüllt).
  const Absperr = ({ cyMid }) => (
    <>
      <polygon points={`${cx - 9},${cyMid - 9} ${cx + 9},${cyMid - 9} ${cx},${cyMid}`} fill="white" stroke="#1e293b" strokeWidth="1.6" />
      <polygon points={`${cx - 9},${cyMid + 9} ${cx + 9},${cyMid + 9} ${cx},${cyMid}`} fill="white" stroke="#1e293b" strokeWidth="1.6" />
      <circle cx={cx} cy={cyMid} r="3" fill="#1e293b" />
    </>
  );

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
        {/* Anschluss-Marker für separate Gruppe — beim roten Rechteck, auf Höhe
            des Wärmeabgabe-Typs; koppelt über den Buchstaben (PHYSIK §9) */}
        {data.hat_anschluss && (
          <g>
            <line x1="104" y1="192" x2="132" y2="192" stroke="#ef4444" strokeWidth="2.2" />
            <polygon points="132,188 139,192 132,196" fill="#ef4444" />
            <line x1="132" y1="208" x2="104" y2="208" stroke="#3b82f6" strokeWidth="2.2" />
            <polygon points="104,204 97,208 104,212" fill="#3b82f6" />
            <circle cx="122" cy="200" r="11" fill="white" stroke="#1e293b" strokeWidth="1.6" />
            <text x="122" y="204" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1e293b">{data.anschluss_buchstabe || 'A'}</text>
          </g>
        )}
        {/* Absperrventil oben */}
        <Absperr cyMid={30} />
        {/* Pumpe — Kreis + Durchmesserlinie + Dreieck nach unten (Flussrichtung) */}
        {hatPumpe && (
          <>
            <circle cx={cx} cy="64" r="15" fill="white" stroke="#1e293b" strokeWidth="2.2" />
            <line x1={cx - 15} y1="64" x2={cx + 15} y2="64" stroke="#1e293b" strokeWidth="1.8" />
            <polygon points={`${cx - 15},64 ${cx + 15},64 ${cx},79`} fill="#1e293b" />
          </>
        )}
        {/* Thermometer */}
        <circle cx={cx} cy="98" r="6" fill="white" stroke="#1e293b" strokeWidth="1.4" />
        <text x={cx} y="101" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1e293b">T</text>
        {/* Wärmezähler (SIA 410): Rechteck mit Diagonale, halb schwarz —
            plus je ein Fühler im VL und RL ausserhalb der Bypass-Schleife */}
        {data.hat_wz && (
          <>
            <rect x={cx - 8} y="104" width="16" height="12" fill="white" stroke="#1e293b" strokeWidth="1.6" />
            <polygon points={`${cx - 8},116 ${cx + 8},116 ${cx + 8},104`} fill="#1e293b" />
            {[16, 352].map(fy => (
              <g key={fy}>
                <line x1={cx} y1={fy} x2={cx + 9} y2={fy} stroke="#1e293b" strokeWidth="1.4" />
                <circle cx={cx + 12.5} cy={fy} r="3.5" fill="white" stroke="#1e293b" strokeWidth="1.4" />
              </g>
            ))}
          </>
        )}
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
        <Absperr cyMid={303} />
        <line x1={cx + 9} y1="294" x2={cx + 20} y2="288" stroke="#1e293b" strokeWidth="1.6" />
        {/* Thermometer */}
        <circle cx={cx + 24} cy="320" r="6" fill="white" stroke="#1e293b" strokeWidth="1.4" />
        <text x={cx + 24} y="323" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1e293b">T</text>
        {/* Ventil unten: 2-Weg (Einspritz/Drossel) oder 3-Weg (Beimisch) —
            weiss gefüllt + Kreis am Treffpunkt (Vorlage «2-Wege Ventil») */}
        {hatVentil && (
          <>
            <polygon points={`${cx - 9},330 ${cx + 9},330 ${cx},338`} fill="white" stroke="#1e293b" strokeWidth="1.6" />
            <polygon points={`${cx - 9},346 ${cx + 9},346 ${cx},338`} fill="white" stroke="#1e293b" strokeWidth="1.6" />
            {schaltung === 'beimisch' && (
              <polygon points={`${cx - 18},330 ${cx - 18},346 ${cx},338`} fill="white" stroke="#1e293b" strokeWidth="1.6" />
            )}
            <circle cx={cx} cy="338" r="2.2" fill="white" stroke="#1e293b" strokeWidth="1.2" />
            <rect x={cx + 12} y="331" width="14" height="14" rx="2" fill={einspritz ? '#f97316' : '#94a3b8'} />
            <text x={cx + 19} y="341" textAnchor="middle" fontSize="8" fontWeight="700" fill="white">M</text>
            {c.ventil && (
              <text x={cx + 30} y="341" fontSize="8" fill="#1e293b" fontFamily="monospace">kvs {c.ventil.kvs_eff}</text>
            )}
          </>
        )}
        {/* Absperrventil unten */}
        <Absperr cyMid={368} />
        {/* Bypass gehört zur Schaltung (Drossel hat keinen):
            Einspritz → mündet ÜBER dem 2WV · Beimisch → in den 3WV-Anschluss */}
        {schaltung !== 'drossel' && (
          <>
            <path
              d={schaltung === 'einspritz' ? `M ${cx} 44 H 22 V 320 H ${cx}` : `M ${cx} 44 H 22 V 338 H ${cx - 18}`}
              fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeDasharray="6,4" />
            <circle cx={cx} cy="44" r="3.5" fill="#3b82f6" />
            {schaltung === 'einspritz' && <circle cx={cx} cy="320" r="3.5" fill="#3b82f6" />}
            {c.m_bypass > 0 && (
              <text x="16" y="210" transform="rotate(-90 16 210)" textAnchor="middle" fontSize="8" fill="#3b82f6" fontFamily="monospace">
                {`Bypass ${Number(c.m_bypass).toFixed(3)} m³/h`}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

// ── Wärmezähler: übernimmt den Durchfluss seiner Leitung ─────
export function WaermezaehlerNode({ data, selected: sel }) {
  const v = data._calc?.v;
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -6 })}
      {H(Position.Bottom, 'bottom', { bottom: -6 })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <svg viewBox="0 0 48 48" width="48" height="48">
        <line x1="24" y1="0" x2="24" y2="8" stroke="#1e293b" strokeWidth="3" />
        <line x1="24" y1="40" x2="24" y2="48" stroke="#1e293b" strokeWidth="3" />
        <circle cx="24" cy="24" r="16" fill="white" stroke="#0f766e" strokeWidth="2.5" />
        <text x="24" y="28" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f766e">WZ</text>
      </svg>
      <Label text={v != null ? `${Number(v).toFixed(3)} m³/h` : (data.label || 'WZ')} color="#0f766e" />
    </div>
  );
}

// ── Expansionsgefäss (Membran-Ausdehnungsgefäss, PHYSIK §8) ──
// Stehender Zylinder mit rundem Kopf, orangem Sicherheitsventil-Nippel oben,
// zwei Standfüssen — Anschluss unten (nicht oben, Dominic-Feedback).
// Exakte Dominic-Vorlage («Behälter ohne Beschriftung, ohne Füsse, unten
// rund»): Kapsel-Körper mit zwei Bund-Linien + mittigem Höcker/Schraube.
// Anschluss unten (Dominic-Feedback) — Stutzen unterhalb des Körpers.
export function ExpansionNode({ data, selected: sel }) {
  const c = data._calc || {};
  return (
    <div style={wrap(sel)}>
      {H(Position.Bottom, 'bottom', { bottom: -6, left: '48.8%' })}
      <svg viewBox="0 0 248 408" width="76" height="125">
        <g fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path fill="#d9d9d9" d="M54 33 C54 15 84 1 121 1 C158 1 188 15 188 33 L188 297 C188 315 158 329 121 329 C84 329 54 315 54 297 Z" />
          <line x1="54" y1="33" x2="188" y2="33" />
          <path d="M54 166 H102 C103 155 109 148 121 148 C133 148 139 155 140 166 H188" />
          <line x1="115" y1="158" x2="127" y2="158" />
          <line x1="54" y1="300" x2="188" y2="300" />
        </g>
        <line x1="121" y1="329" x2="121" y2="400" stroke="#3b82f6" strokeWidth="6" strokeDasharray="10,8" />
      </svg>
      <Label text={c.vorschlag_l ? `EGF ${c.vorschlag_l} l` : (data.label || 'EGF')} />
    </div>
  );
}

// ── Brauchwarmwasser-Speicher: wie Speicher, aber GRÜN ───────
export function BwwNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top-l',  { top: -6,    left: '30%' })}
      {H(Position.Top,    'top-r',  { top: -6,    left: '70%' })}
      {H(Position.Bottom, 'bot-l',  { bottom: -6, left: '30%' })}
      {H(Position.Bottom, 'bot-r',  { bottom: -6, left: '70%' })}
      {H(Position.Left,   'left',   { left: -6 })}
      {H(Position.Right,  'right',  { right: -6 })}
      <svg viewBox="0 0 56 100" width="56" height="100">
        <rect x="3" y="3" width="50" height="94" rx="6" fill="#f0fdf4" stroke="#16a34a" strokeWidth="2.5" />
        <line x1="3" y1="35" x2="53" y2="35" stroke="#86efac" strokeWidth="1.2" strokeDasharray="5,3" />
        <line x1="3" y1="65" x2="53" y2="65" stroke="#86efac" strokeWidth="1.2" strokeDasharray="5,3" />
        <text x="28" y="54" textAnchor="middle" fontSize="11" fontWeight="700" fill="#15803d">BWW</text>
      </svg>
      <Label text={data.label || 'BWW'} color="#15803d" />
    </div>
  );
}

// ── Anschluss-Marker (PHYSIK §9) ──────────────────────────────
// Ersetzt eine lang quer durchs Schema gezeichnete Leitung: roter Pfeil
// (VL raus) + blauer Pfeil (RL rein), gemeinsamer Buchstabe. Zwei Marker mit
// demselben Buchstaben werden vom Backend virtuell verbunden — Fluss und
// Temperatur werden durchgereicht, als wäre eine echte Leitung gezeichnet.
export function AnschlussNode({ data, selected: sel }) {
  return (
    <div style={{
      width: 70, height: 40, position: 'relative', cursor: 'grab',
      border: sel ? '2px solid #3b82f6' : '2px solid transparent', borderRadius: 6,
    }}>
      {/* Anschlüsse vorne rechts (nicht beim Buchstaben) */}
      <Handle type="source" position={Position.Right} id="vl"
        style={{ right: -6, top: '28%', background: '#ef4444', width: 12, height: 12, borderRadius: 2, border: '2px solid white', boxShadow: '0 0 0 1px #ef4444' }} />
      <Handle type="source" position={Position.Right} id="rl"
        style={{ right: -6, top: '72%', background: '#3b82f6', width: 12, height: 12, borderRadius: 2, border: '2px solid white', boxShadow: '0 0 0 1px #3b82f6' }} />
      <svg viewBox="0 0 70 40" width="70" height="40">
        <circle cx="12" cy="20" r="11" fill="white" stroke="#1e293b" strokeWidth="1.6" />
        <text x="12" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">{data.buchstabe || '?'}</text>
        <line x1="26" y1="11" x2="60" y2="11" stroke="#ef4444" strokeWidth="2.5" />
        <polygon points="60,7 67,11 60,15" fill="#ef4444" />
        <line x1="60" y1="29" x2="26" y2="29" stroke="#3b82f6" strokeWidth="2.5" />
        <polygon points="26,25 19,29 26,33" fill="#3b82f6" />
      </svg>
    </div>
  );
}

// ── Unsichtbarer Topologie-Anker ─────────────────────────────────────────────
// Freie Polylinien und echte T-Verbindungen brauchen im gespeicherten Graphen
// weiterhin einen Node. Im Editor ist dieser aber kein Bauteil: sichtbar und
// bearbeitbar sind nur die Leitungsgriffe der CAD-Ebene.
export function JunctionNode() {
  const hs = {
    left: 0, top: 0, width: 1, height: 1, minWidth: 0, minHeight: 0,
    background: 'transparent', border: 'none', opacity: 0, pointerEvents: 'none',
    transform: 'none',
  };
  return (
    <div style={{ width: 1, height: 1, position: 'relative', pointerEvents: 'none', opacity: 0 }}>
      {['left', 'right', 'top', 'bottom', 'center-source'].map(id => (
        <Handle key={id} className="hc-junction-handle" type="source" position={Position.Left} id={id} style={hs} />
      ))}
      <Handle className="hc-junction-handle" type="target" position={Position.Left} id="center-target" style={hs} />
    </div>
  );
}

// ── Text-Label ────────────────────────────────────────────────
// Freier Textblock (Dominic 2026-07-20): verschiebbar (React-Flow-Node) UND
// direkt editierbar per Doppelklick. Bearbeitung schreibt über den React-Flow-
// Store (useReactFlow → derselbe useNodesState-Store des Editors), damit Autosave
// und Undo den Text ganz normal mitbekommen.
export function LabelNode({ id, data, selected: sel }) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const text = data.label ?? 'Text';
  const fontSize = Number(data.fontSize) || 12;
  const commit = (val) => {
    setEditing(false);
    setNodes(ns => ns.map(n => (n.id === id ? { ...n, data: { ...n.data, label: val } } : n)));
  };
  return (
    <div
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        fontSize, color: '#1e293b', lineHeight: 1.35, whiteSpace: 'pre-wrap',
        background: sel ? 'rgba(59,130,246,0.06)' : 'transparent',
        border: `1px ${sel ? 'solid #3b82f6' : 'dashed rgba(148,163,184,0.5)'}`,
        borderRadius: 4, padding: '3px 6px', minWidth: 44, maxWidth: 340,
        cursor: editing ? 'text' : 'grab',
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          className="nodrag nowheel"
          defaultValue={text}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(e.target.value);
          }}
          style={{
            font: 'inherit', color: 'inherit', lineHeight: 'inherit',
            border: 'none', outline: 'none', background: 'transparent',
            resize: 'both', width: '100%', minWidth: 140, minHeight: fontSize + 6,
          }}
        />
      ) : (text || 'Text')}
    </div>
  );
}

// ── Bauteil-Nummern (Pflichtenheft §10: Nummerierung + Legende) ──────
// Jedes nummerierbare Bauteil bekommt ein rotes Badge (data.nr) oben rechts.
// eslint-disable-next-line react-refresh/only-export-components
export const NUMMERIERT = ['gruppe', 'heizkreis', 'pump', 'valve2', 'valve3', 'checkvalve', 'shutoff', 'erzeuger', 'speicher', 'erdsonden', 'verteiler', 'waermezaehler', 'expansion', 'bww', 'stad', 'sicherheitsventil', 'pwt'];

// eslint-disable-next-line no-unused-vars
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
  stad:        StadNode,
  temperatur:  TemperaturNode,
  sicherheitsventil: SicherheitsventilNode,
  pwt:         PwtNode,
  junction:    JunctionNode,
  erzeuger:    ErzeugerNode,
  verbraucher: VerbraucherNode,
  speicher:    SpeicherNode,
  erdsonden:   ErdsondenNode,
  anschluss:   AnschlussNode,
  verteiler:   VerteilerNode,
  waermezaehler: WaermezaehlerNode,
  expansion:   ExpansionNode,
  bww:         BwwNode,
  label:       LabelNode,
};

// ── Drehung um 90° (data.rotation) ───────────────────────────────────────────
export const ROTATABLE = new Set([
  'pump', 'valve2', 'valve3', 'checkvalve', 'shutoff',
  'stad', 'temperatur', 'sicherheitsventil', 'pwt',
  'waermezaehler', 'erzeuger', 'verbraucher', 'speicher', 'bww',
  'expansion', 'anschluss',
]);

// eslint-disable-next-line no-unused-vars
function mitRotation(Comp) {
  function MitRotation(props) {
    const rot = props.data?.rotation || 0;
    const mirrored = Boolean(props.data?.mirrored);
    if (!rot && !mirrored) return <Comp {...props} />;
    // Reihenfolge rotate() scaleX(-1): erst spiegeln, dann drehen — passend zur
    // Seiten-Korrektur in anschlussSeite (spiegelSeite vor rotiereSeite).
    return (
      <div style={{ transform: `rotate(${rot}deg) scaleX(${mirrored ? -1 : 1})`, transformOrigin: 'center center', display: 'inline-block' }}>
        <Comp {...props} />
      </div>
    );
  }
  return MitRotation;
}

// eslint-disable-next-line react-refresh/only-export-components
export const NODE_TYPES = Object.fromEntries(
  Object.entries(BASIS_TYPES).map(([k, C]) => {
    let W = ROTATABLE.has(k) ? mitRotation(C) : C;
    if (NUMMERIERT.includes(k)) W = mitNr(W);   // Nr-Badge liegt ausserhalb der Drehung
    return [k, W];
  })
);
