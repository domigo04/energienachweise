import { memo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, NodeResizer, ViewportPortal } from '@xyflow/react';
import { datenblockAusrichten, fangPunkte } from '../../../pages/hc/schema/datenblockAusrichten';
import {
  SymPump, SymValve2V, SymValve3, SymCheckValve,
  SymShutoff, SymWE, SymVerbraucher, SymSpeicher, SymBwwSpeicher, SymBypass,
  SymSTAD, SymTemperatur, SymSicherheitsventil, SymPWT,
  SymLufterhitzer, SymLuftheizapparat, SymAbsperrklappe, SymEntleerung, SymEntleerhahn,
  SymWaermezaehlerCad,
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
      width: 8, height: 8, borderRadius: 2,
      background: '#475569', border: '1px solid white',
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
  // Der Punkt liegt MIT SEINER MITTE auf der angegebenen Stelle. React Flow
  // zentriert von sich aus nur eine Achse (`translate(-50%, 0)` bzw.
  // `translate(0, -50%)`); die Leitung endete dadurch eine halbe Punktbreite
  // neben der gezeichneten Linie.
  transform: 'translate(-50%, -50%)',
};

// Die Anschlusszone liegt auf der gezeichneten Aussenkante des Bauteils, nicht
// auf dem unsichtbaren Node-Rechteck (Dominic 2026-08-06: der Anschluss gehört
// auf die schwarze Linie). `rahmen` gibt diese Kante in Prozent der Node-Fläche
// an; ohne Angabe ist es das Node-Rechteck selbst.
const VOLLE_FLAECHE = { links: 0, rechts: 100, oben: 0, unten: 100 };
const aufKante = (rahmen, achse, prozent) => (achse === 'x'
  ? rahmen.links + (prozent / 100) * (rahmen.rechts - rahmen.links)
  : rahmen.oben + (prozent / 100) * (rahmen.unten - rahmen.oben));

function ZoneHandles({ prefix, rahmen = VOLLE_FLAECHE }) {
  const x = (p) => `${aufKante(rahmen, 'x', p)}%`;
  const y = (p) => `${aufKante(rahmen, 'y', p)}%`;
  const kante = {
    position: 'absolute',
    left: `${rahmen.links}%`, top: `${rahmen.oben}%`,
    width: `${rahmen.rechts - rahmen.links}%`, height: `${rahmen.unten - rahmen.oben}%`,
  };
  return (
    <>
      <div className="hc-zone-frame" aria-hidden="true"
        style={rahmen === VOLLE_FLAECHE ? undefined : { ...kante, inset: 'auto' }} />
      {ZONE_PCT.map(p => <Handle key={`${prefix}-t-${p}`} type="source" position={Position.Top}    id={`${prefix}-t-${p}`} style={{ ...zoneDot, top: y(0), left: x(p) }} />)}
      {ZONE_PCT.map(p => <Handle key={`${prefix}-b-${p}`} type="source" position={Position.Bottom} id={`${prefix}-b-${p}`} style={{ ...zoneDot, top: y(100), left: x(p), bottom: 'auto' }} />)}
      {ZONE_PCT.map(p => <Handle key={`${prefix}-l-${p}`} type="source" position={Position.Left}   id={`${prefix}-l-${p}`} style={{ ...zoneDot, left: x(0), top: y(p) }} />)}
      {ZONE_PCT.map(p => <Handle key={`${prefix}-r-${p}`} type="source" position={Position.Right}  id={`${prefix}-r-${p}`} style={{ ...zoneDot, left: x(100), top: y(p), right: 'auto' }} />)}
    </>
  );
}

// Anschluss, dessen MITTE auf einem Punkt des Symbols liegt. Für Bauteile, bei
// denen die Anschlussstelle Teil der Zeichnung ist (Speicher, Plattentauscher)
// — dort zählt der Punkt auf der Linie, nicht der Rand der Node-Box.
const HK = (pos, id, links, oben, bg) => (
  <Handle
    type="source"
    position={pos}
    id={id}
    style={{
      position: 'absolute', left: `${links}%`, top: `${oben}%`,
      transform: 'translate(-50%, -50%)',
      width: 9, height: 9, borderRadius: 2,
      background: bg || '#475569', border: '1px solid white',
      boxShadow: '0 0 0 1px #cbd5e1',
      zIndex: 10,
    }}
  />
);

// ── Speicher und BWW-Speicher: Anschlusspunkte auf dem Behälterumriss ────────
// Der Behälter ist in beiden Symbolen dasselbe Bild (viewBox 140×290):
// Mantel x = 20…120, Schulter oben y = 45, unten y = 245, Kuppeln je 25 hoch.
// Daraus die Prozentwerte; Editor und Export (schema_svg.py::handle_pos)
// verwenden dieselben Zahlen.
export const SPEICHER_RAHMEN = { links: 14.3, rechts: 85.7, oben: 15.5, unten: 84.5 };
export const SPEICHER_PORTS = {
  'top-l': [30, 8.4], 'top-r': [70, 8.4],
  'bot-l': [30, 91.6], 'bot-r': [70, 91.6],
  left: [14.3, 50], right: [85.7, 50],
  // Trinkwasser: die Pfeilspitzen enden am Bauteilrand.
  warmwasser: [50, 0], kaltwasser: [50, 100],
};

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
      {H(Position.Top,    'top',    { top: -3, left:'50%' }, 'hc-pump-handle')}
      {H(Position.Bottom, 'bottom', { bottom: -3, left:'50%' }, 'hc-pump-handle')}
      <SymPump />
      <Label text={data.label} />
    </div>
  );
}

// ── 2-Wege Regelventil (Flussachse rechts, Antrieb links → 75%) ──
export function Valve2Node({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -3,    left: '50%', background: '#1e293b' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left: '50%', background: '#1e293b' })}
      <SymValve2V />
      <Label text={data.label} color="#1e293b" />
    </div>
  );
}

// ── 3-Wege Mischventil (Flussachse ~63%, 3. Tor rechts) ──────
export function Valve3Node({ data, selected: sel }) {
  return (
    <div style={{ ...wrap(sel), position: 'relative' }}>
      {H(Position.Top,    'top',    { top: -3,    left: '50%', background: '#1e293b' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left: '50%', background: '#1e293b' })}
      {H(Position.Right,  'right',  { right: -3,  top: '50%', background: '#1e293b' })}
      <SymValve3 />
      <Label text={data.label} color="#1e293b" />
    </div>
  );
}

// ── Rückschlagventil ─────────────────────────────────────────
export function CheckValveNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -3, left:'50%' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left:'50%' })}
      <SymCheckValve />
      <Label text={data.label} />
    </div>
  );
}

// ── Absperrventil ─────────────────────────────────────────────
export function ShutoffNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -3, left:'50%' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left:'50%' })}
      <SymShutoff />
      <Label text={data.label} />
    </div>
  );
}

// ── STAD-Strangregulierventil (nur Symbol + Fabrikat) ────────
export function StadNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -3, left:'50%' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left:'50%' })}
      <SymSTAD />
      <Label text={data.label || 'STAD'} />
    </div>
  );
}

// ── Temperaturfühler (nur Symbol) ────────────────────────────
export function TemperaturNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Left,   'left',   { left: -3, top: '55%' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left: '38%' })}
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
// Die vier Tore liegen auf den Seitenmitten der Raute — also genau auf der
// schwarzen Linie des Symbols (Rautenecken 205/48, 356/191, 205/334, 54/191 in
// der viewBox 472×342). Links = Primär (oben EIN/VL, unten AUS/RL),
// rechts = Sekundär (oben AUS warm, unten EIN kalt).
export const PWT_PORTS = {
  left: [27.4, 34.9], top: [59.4, 34.9],
  bottom: [27.4, 76.8], right: [59.4, 76.8],
};

export function PwtNode({ selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {HK(Position.Left,   'left',   ...PWT_PORTS.left,   '#ef4444')}
      {HK(Position.Bottom, 'bottom', ...PWT_PORTS.bottom, '#3b82f6')}
      {HK(Position.Top,    'top',    ...PWT_PORTS.top,    '#ef4444')}
      {HK(Position.Right,  'right',  ...PWT_PORTS.right,  '#3b82f6')}
      <SymPWT />
    </div>
  );
}

// ── Lufterhitzer: Register mit Luftstrom quer hindurch ───────
// Wasser tritt oben ein und unten aus; beide Anschlüsse liegen auf der
// Registerachse bei 45 % der Symbolbreite (der Luftpfeil ragt rechts weiter
// hinaus als links, deshalb nicht 50 %).
export function LufterhitzerNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -3,    left: '45%', background: '#ef4444' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left: '45%', background: '#3b82f6' })}
      <SymLufterhitzer />
      <Label text={data.label || 'Lufterhitzer'} />
    </div>
  );
}

// ── Luftheizapparat: Register ohne Luftstrompfeil, VL/RL links ──────────────
export function LuftheizapparatNode({ data, selected: sel }) {
  return (
    <div style={{ ...wrap(sel), position:'relative' }}>
      {H(Position.Left, 'vl', { left:-5, top:'34%', background:'#ef4444' })}
      {H(Position.Left, 'rl', { left:-5, top:'66%', background:'#3b82f6' })}
      <SymLuftheizapparat />
      <Label text={data.label || 'Luftheizapparat'} />
    </div>
  );
}

// ── Lufterhitzer-Gruppe: senkrechter CAD-Strang ──────────────
// Drossel-, Einspritz- und Beimischschaltung teilen dieselbe dünne CAD-Optik.
// Die Armaturen sind Teil des Gruppensymbols und decken die Strangleitung ab.
// Geometrie muss mit backend/app/export/schema_svg.py übereinstimmen!
export function LufterhitzerGruppeNode({ data, selected: sel }) {
  const W = 150, H = 560, cx = 75;
  const schaltung = ['einspritz', 'beimisch', 'drossel'].includes(data.schaltung) ? data.schaltung : 'drossel';
  // Registerbreite so gewählt, dass der Luftpfeil rechts noch in die Node-Box
  // passt; die Registerachse (45 % der Symbolbreite) liegt dabei auf cx.
  const REG_W = 136, REG_X = cx - REG_W * 0.45;
  const REGISTER_OBEN = 210, REGISTER_UNTEN = REGISTER_OBEN + REG_W * 152 / 366;

  const hSt = (top, bg) => ({
    position: 'absolute', top, left: cx,
    width: 12, height: 12, borderRadius: 2,
    background: bg, border: '2px solid white',
    boxShadow: `0 0 0 1px ${bg}`,
    transform: 'translate(-50%, -50%)',
  });

  // Dieselben Symbolkomponenten wie bei einzeln platzierten Bauteilen — damit
  // bleiben Proportionen und spätere Symbolkorrekturen an genau einer Stelle.
  const Thermometer = ({ cy }) => (
    <g transform={`translate(${cx - 8.1} ${cy - 8.6})`}><SymTemperatur /></g>
  );
  const Entleerung = ({ cy }) => (
    <g transform={`translate(${cx - 1.2} ${cy - 4.8})`}><SymEntleerung /></g>
  );
  const Entleerhahn = ({ cy }) => (
    <g transform={`translate(${cx - 1.2} ${cy - 4.5})`}><SymEntleerhahn /></g>
  );
  const Kugelhahn = ({ cy }) => (
    <g transform={`translate(${cx - 17.5} ${cy - 14})`}><SymShutoff /></g>
  );
  const Pumpe = ({ cy }) => (
    <g transform={`translate(${cx - 17} ${cy - 17})`}><SymPump /></g>
  );
  const Ventil2 = ({ cy }) => (
    <g transform={`translate(${cx + 17.5} ${cy - 14}) scale(-1 1)`}><SymValve2V /></g>
  );
  const Ventil3 = ({ cy }) => (
    <g transform={`translate(${cx + 19} ${cy - 14}) scale(-1 1)`}><SymValve3 /></g>
  );

  const c = data._calc || {};
  const zahl = (v, n = 2) => (v == null ? null : Number(v).toFixed(n));
  const zeilen = [
    data.anlage_nr || null,
    data.q_kw != null && data.q_kw !== '' ? `${data.q_kw} kW` : null,
    c.m_sek != null ? `V' ${zahl(c.m_sek, 3)} m³/h` : null,
    c.ventil?.kvs_eff != null ? `kvs ${c.ventil.kvs_eff}` : null,
  ].filter(Boolean);

  const wzY = schaltung === 'einspritz' ? 460 : schaltung === 'beimisch' ? 445 : 425;
  const vlWzFuehlerY = 54;
  const bypassOben = schaltung === 'beimisch' ? 72 : 76;
  const bypassUnten = schaltung === 'beimisch' ? 370 : 365;

  return (
    <div style={{ width: W, height: H, position: 'relative', cursor: 'grab' }}>
      <Handle type="source" position={Position.Top} id="vl" style={hSt(0, '#ef4444')} />
      <Handle type="source" position={Position.Bottom} id="rl" style={hSt(H, '#3b82f6')} />

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {sel && <rect x="1" y="1" width={W - 2} height={H - 2} rx="8" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,4" />}

        {/* Signalleitungen und Bypass zuerst: Register, Rohre und Symbole liegen
            im Vordergrund und unterbrechen sie an Kreuzungen optisch. */}
        {data.hat_wz && (
          <path d={`M ${cx + 12} ${vlWzFuehlerY} H 116 V ${wzY + 21} H ${cx + 23}`}
            fill="none" stroke="#f08c2e" strokeWidth="0.85"
            strokeDasharray="4 2 1 2" strokeLinecap="round" />
        )}
        {schaltung !== 'drossel' && (
          <>
            <path d={schaltung === 'beimisch'
              ? `M ${cx - 17} ${bypassOben} H 24 V ${bypassUnten} H ${cx}`
              : `M ${cx} ${bypassOben} H 24 V ${bypassUnten} H ${cx}`}
              fill="none" stroke="#3b82f6" strokeWidth="1.2" strokeDasharray="6 4" />
            <circle cx={schaltung === 'beimisch' ? cx - 17 : cx} cy={bypassOben} r="2.8" fill="#3b82f6" />
            <circle cx={cx} cy={bypassUnten} r="2.8" fill="#3b82f6" />
            {c.m_bypass > 0 && (
              <text x="18" y={(bypassOben + bypassUnten) / 2}
                transform={`rotate(-90 18 ${(bypassOben + bypassUnten) / 2})`}
                textAnchor="middle" fontSize="7.5" fill="#3b82f6" fontFamily="monospace">
                {`Bypass ${Number(c.m_bypass).toFixed(3)} m³/h`}
              </text>
            )}
          </>
        )}

        {/* Dünne hydraulische Strangleitung. */}
        <line x1={cx} y1="0" x2={cx} y2={REGISTER_OBEN} stroke="#ef4444" strokeWidth="1.8" />
        <line x1={cx} y1={REGISTER_UNTEN} x2={cx} y2={H} stroke="#3b82f6" strokeWidth="1.8" strokeDasharray="8,5" />

        {/* Anlagennummer und Kennwerte — rechts oben, wo der Strang frei ist. */}
        {zeilen.map((t, i) => (
          <text key={i} x="98" y={12 + i * 12} fontSize="8.5" fill="#1e293b"
            fontFamily="monospace">{t}</text>
        ))}

        {/* Gemeinsame Absperrung direkt am Vorlauf. */}
        <g transform={`translate(${cx - 8} 14)`}><SymAbsperrklappe /></g>

        {schaltung === 'drossel' && (
          <>
            <Entleerhahn cy={58} />
            <Ventil2 cy={92} />
            <Thermometer cy={145} />
            <Kugelhahn cy={184} />
          </>
        )}
        {schaltung === 'einspritz' && (
          <>
            <Pumpe cy={112} />
            <Thermometer cy={157} />
            <Kugelhahn cy={184} />
          </>
        )}
        {schaltung === 'beimisch' && (
          <>
            <Ventil3 cy={72} />
            <Pumpe cy={116} />
            <Thermometer cy={154} />
            <Kugelhahn cy={184} />
          </>
        )}

        <g transform={`translate(${REG_X} ${REGISTER_OBEN})`}><SymLufterhitzer width={REG_W} /></g>

        {/* Direkt nach dem Register: Absperrung, kleiner MSR-Fühler,
            danach das gut lesbare Thermometer. */}
        <Kugelhahn cy={292} />
        <g stroke="#f08c2e" strokeWidth="1" strokeLinecap="round" fill="none">
          <line x1={cx - 5} y1="318" x2={cx + 10} y2="318" />
          <circle cx={cx + 14} cy="318" r="4" fill="white" />
        </g>
        <text x={cx + 14} y="320.5" textAnchor="middle" fontSize="6" fill="#f08c2e"
          fontFamily="Arial, sans-serif">T</text>

        {/* Zweites Thermometer immer nach dem Lufterhitzer. */}
        <Thermometer cy={342} />

        {schaltung === 'drossel' && <Entleerung cy={380} />}
        {schaltung === 'einspritz' && (
          <>
            <Entleerung cy={bypassUnten} />
            <Kugelhahn cy={395} />
            <Ventil2 cy={430} />
          </>
        )}
        {schaltung === 'beimisch' && (
          <>
            <Entleerung cy={bypassUnten} />
            <Kugelhahn cy={400} />
          </>
        )}

        {data.hat_wz && (
          <>
            {/* Schwarzer Vorlauffühler; der Rücklauffühler ist Bestandteil des
                Wärmezähler-Symbols. */}
            <line x1={cx} y1={vlWzFuehlerY} x2={cx + 8} y2={vlWzFuehlerY} stroke="#1e293b" strokeWidth="1" />
            <circle cx={cx + 12} cy={vlWzFuehlerY} r="3" fill="white" stroke="#1e293b" strokeWidth="1" />
            <g transform={`translate(${cx - 9.6} ${wzY})`}><SymWaermezaehlerCad /></g>
          </>
        )}
        <g transform={`translate(${cx - 6} ${schaltung === 'drossel' ? 500 : schaltung === 'beimisch' ? 510 : 520})`}><SymSTAD /></g>
        {schaltung === 'drossel' && <Entleerhahn cy={540} />}
      </svg>
      <Label text={data.label} />
    </div>
  );
}

// ── Wärmezähler CAD: Volumenmessteil, Fühler und Rechenwerk ──
// Rohrachse bei 30 % der Symbolbreite — Rechenwerk und Signalleitungen liegen
// rechts daneben.
export function WaermezaehlerCadNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      {H(Position.Top,    'top',    { top: -3,    left: '30%' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left: '30%' })}
      <SymWaermezaehlerCad />
      <Label text={data.label || 'WZ'} />
    </div>
  );
}

// ── Wärmeerzeuger (WE): VL oben, RL unten ────────────────────
// Vier fachlich unterscheidbare Anschlüsse: rechts die Heizungsseite, links die
// Quellenseite (Sole). Die Bedeutung hängt am Anschluss, nicht an der Strichfarbe
// — das Backend liest sie über die Handle-ID (hydraulik.py::WP_PORT_ROLLEN).
// Die alten IDs vl/rl/left/right und die Anschlusszone bleiben unverändert
// bestehen, damit kein gespeichertes Schema seine Leitungen verliert.
export function ErzeugerNode({ data, selected: sel }) {
  return (
    <div style={wrap(sel)}>
      <ZoneHandles prefix="wz" />
      {H(Position.Top,    'vl',    { top: -6, background: '#ef4444' })}
      {H(Position.Bottom, 'rl',    { bottom: -6, background: '#3b82f6' })}
      {H(Position.Left,   'left',  { left: -6 })}
      {H(Position.Right,  'right', { right: -6 })}
      {H(Position.Right,  'heating_flow',   { right: -6, top: '32%', background: '#ef4444' })}
      {H(Position.Right,  'heating_return', { right: -6, top: '68%', background: '#3b82f6' })}
      {H(Position.Left,   'source_flow',    { left: -6,  top: '32%', background: '#eab308' })}
      {H(Position.Left,   'source_return',  { left: -6,  top: '68%', background: '#16a34a' })}
      <SymWE generatorType={data.generator_type} lwwpBauart={data.lwwp_bauart} />
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

// ── Heizkörper: frei skalierbare Fläche oder kompakter Schema-Abgang ───────
// Beide Darstellungen sind dasselbe hydraulische Bauteil. Dadurch kann der
// Planer vom grünen Grundriss-Rechteck auf ein kompaktes Symbol wechseln, ohne
// Anschlüsse oder Berechnungsdaten zu verlieren.
export function HeizkoerperNode({ data, selected: sel }) {
  const schema = data.darstellung === 'schema';
  const border = sel ? '#3b82f6' : '#15803d';
  return (
    <div style={{
      width:'100%', height:'100%', minWidth:70, minHeight:38, position:'relative',
      boxSizing:'border-box', border:`2px solid ${border}`, borderRadius:2,
      background:schema ? 'white' : 'rgba(34,197,94,0.24)',
      boxShadow:sel ? '0 0 0 2px #bfdbfe' : 'none', cursor:'grab',
    }}>
      <NodeResizer isVisible={sel} minWidth={70} minHeight={38} color="#3b82f6" />
      {H(Position.Left, 'vl', { left:-6, top:'34%', background:'#ef4444' })}
      {H(Position.Left, 'rl', { left:-6, top:'66%', background:'#3b82f6' })}
      {schema ? (
        <svg width="100%" height="100%" viewBox="0 0 120 60" preserveAspectRatio="none" aria-label="Heizkörper Schema-Abgang">
          <g fill="none" stroke="#15803d" strokeWidth="2">
            <rect x="29" y="8" width="82" height="44" fill="#dcfce7" />
            {[42,55,68,81,94].map(x => <line key={x} x1={x} y1="12" x2={x} y2="48" />)}
            <line x1="0" y1="20" x2="29" y2="20" stroke="#ef4444" />
            <line x1="0" y1="40" x2="29" y2="40" stroke="#3b82f6" />
          </g>
        </svg>
      ) : (
        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
          color:'#166534', fontSize:10, fontWeight:700, userSelect:'none' }}>
          {data.label || 'Heizkörper'}
        </div>
      )}
    </div>
  );
}

// ── Speicher ──────────────────────────────────────────────────
export function SpeicherNode({ data, selected: sel }) {
  const c = data._calc || {};
  const liter = data.speicher_liter || c.speichervolumen_l;
  return (
    <div style={wrap(sel)}>
      <ZoneHandles prefix="sz" rahmen={SPEICHER_RAHMEN} />
      {HK(Position.Top,    'top-l', ...SPEICHER_PORTS['top-l'], '#ef4444')}
      {HK(Position.Top,    'top-r', ...SPEICHER_PORTS['top-r'], '#ef4444')}
      {HK(Position.Bottom, 'bot-l', ...SPEICHER_PORTS['bot-l'], '#3b82f6')}
      {HK(Position.Bottom, 'bot-r', ...SPEICHER_PORTS['bot-r'], '#3b82f6')}
      {HK(Position.Left,   'left',  ...SPEICHER_PORTS.left)}
      {HK(Position.Right,  'right', ...SPEICHER_PORTS.right)}
      <SymSpeicher liter={liter} obenC={c.speicher_oben_c} untenC={c.speicher_unten_c} />
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
  const c = data._calc || {};
  const statusText = c.erforderlich_gesamt_m != null
    ? `erf. ${Math.round(c.erforderlich_gesamt_m).toLocaleString('de-CH')} m${c.ausreichend === false ? ' — zu kurz' : ''}`
    : null;
  const sole = '#eab308';
  const farbe = (dashed) => dashed ? '#16a34a' : sole;
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
          stroke="#16a34a" strokeWidth="1.7" strokeDasharray="7 4" />
        {statusText && <text x={W / 2} y="106" textAnchor="middle" fontSize="9" fontWeight="700"
          fontFamily="Arial, sans-serif" fill={c.ausreichend === false ? '#dc2626' : '#15803d'}>{statusText}</text>}

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
              fill="none" stroke="#16a34a" strokeWidth="1.9"
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
  const effektiveLeistung = c.q_kw ?? data.q_kw;
  const einspritz = !!c.einspritz;
  // Schaltungsart (PHYSIK §6): einspritz = 2WV + Bypass ÜBER dem Ventil ·
  // beimisch = 3WV + Bypass in den dritten Anschluss · drossel = nur Ventil
  const schaltung = ['einspritz', 'beimisch', 'drossel'].includes(data.schaltung) ? data.schaltung : 'einspritz';
  const hatPumpe = schaltung !== 'drossel' && data.hat_pumpe !== false;
  const hatVentil = data.hat_ventil !== false;
  // Dominic 2026-08-05: gleiche Abstände wie die Lufterhitzergruppe (150×560).
  // Die Geometrie war auf 400 px Höhe gezeichnet; `sy` streckt nur die
  // Abstände — die Symbole behalten ihre eigene Grösse.
  const W = 150, H = 560, cx = 75;
  const sy = (v) => +(v * H / 400).toFixed(1);
  const kg = (v) => (v == null ? '—' : `${Math.round(v * 1000).toLocaleString('de-CH')} kg/h`);

  const hSt = (top, bg) => ({
    position: 'absolute', top, left: cx,
    width: 12, height: 12, borderRadius: 2,
    background: bg, border: '2px solid white',
    boxShadow: `0 0 0 1px ${bg}`,
    transform: 'translate(-50%, -50%)',
  });

  // Dieselben Symbolkomponenten wie bei einzeln platzierten Bauteilen. Damit
  // bleiben Proportionen und spätere Symbolkorrekturen an genau einer Stelle.
  const Absperr = ({ cyMid }) => (
    <g transform={`translate(${cx - 17.5} ${cyMid - 14})`}><SymShutoff /></g>
  );
  const Thermometer = ({ cy }) => (
    <g transform={`translate(${cx - 8.1} ${cy - 8.6})`}><SymTemperatur /></g>
  );

  return (
    <div style={{ width: W, height: H, position: 'relative', cursor: 'grab' }}>
      <Handle type="source" position={Position.Top} id="vl" style={hSt(0, '#ef4444')} />
      <Handle type="source" position={Position.Bottom} id="rl" style={hSt(H, '#3b82f6')} />

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {sel && <rect x="1" y="1" width={W - 2} height={H - 2} rx="8" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,4" />}
        {/* Strangleitung: oben VL (primär), unten RL */}
        <line x1={cx} y1="0" x2={cx} y2={sy(145)} stroke="#ef4444" strokeWidth="2" />
        <line x1={cx} y1={sy(255)} x2={cx} y2={H} stroke="#3b82f6" strokeWidth="2" />
        {/* Primär-Fluss am Strangkopf */}
        <text x={cx + 8} y="12" fontSize="9" fill="#1e293b" fontFamily="monospace">{`m': ${kg(c.m_prim)}`}</text>
        {/* Anschluss-Marker für separate Gruppe — beim roten Rechteck, auf Höhe
            des Wärmeabgabe-Typs; koppelt über den Buchstaben (PHYSIK §9) */}
        {data.hat_anschluss && (
          <g transform={`translate(0 ${sy(200) - 200})`}>
            <line x1="104" y1="192" x2="132" y2="192" stroke="#ef4444" strokeWidth="2.2" />
            <polygon points="132,188 139,192 132,196" fill="#ef4444" />
            <line x1="132" y1="208" x2="104" y2="208" stroke="#3b82f6" strokeWidth="2.2" />
            <polygon points="104,204 97,208 104,212" fill="#3b82f6" />
            <circle cx="122" cy="200" r="11" fill="white" stroke="#1e293b" strokeWidth="1.6" />
            <text x="122" y="204" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1e293b">{data.anschluss_buchstabe || 'A'}</text>
          </g>
        )}
        {/* Absperrventil oben */}
        <Absperr cyMid={sy(30)} />
        {/* Pumpe — identisch zum einzeln platzierbaren Symbol. */}
        {hatPumpe && <g transform={`translate(${cx - 17} ${sy(64) - 17})`}><SymPump /></g>}
        <Thermometer cy={sy(98)} />
        {/* Wärmezähler (SIA 410): Rechteck mit Diagonale, halb schwarz —
            plus je ein Fühler im VL und RL ausserhalb der Bypass-Schleife */}
        {data.hat_wz && (
          <>
            <rect x={cx - 8} y={sy(110) - 6} width="16" height="12" fill="white" stroke="#1e293b" strokeWidth="1.6" />
            <polygon points={`${cx - 8},${sy(110) + 6} ${cx + 8},${sy(110) + 6} ${cx + 8},${sy(110) - 6}`} fill="#1e293b" />
            {[sy(16), sy(352)].map(fy => (
              <g key={fy}>
                <line x1={cx} y1={fy} x2={cx + 9} y2={fy} stroke="#1e293b" strokeWidth="1.4" />
                <circle cx={cx + 12.5} cy={fy} r="3.5" fill="white" stroke="#1e293b" strokeWidth="1.4" />
              </g>
            ))}
          </>
        )}
        {/* Rotes Rechteck mit gedrehtem Text (wie im CAD) */}
        <rect x="55" y={sy(145)} width="40" height={sy(255) - sy(145)} fill="white" stroke="#ef4444" strokeWidth="1.8" />
        <text transform={`translate(63 ${sy(202)}) rotate(-90)`} textAnchor="middle" fontSize="9" fontWeight="700" fill="#ef4444" fontFamily="monospace">
          {data.label || 'Verbrauchergruppe'}
        </text>
        <text transform={`translate(75 ${sy(202)}) rotate(-90)`} textAnchor="middle" fontSize="8.5" fill="#ef4444" fontFamily="monospace">
          {`${effektiveLeistung ?? '—'} kW · VL/RL ${data.vl_temp ?? '—'}/${data.rl_temp ?? '—'} °C`}
        </text>
        <text transform={`translate(87 ${sy(202)}) rotate(-90)`} textAnchor="middle" fontSize="8.5" fill="#ef4444" fontFamily="monospace">
          {`m': ${kg(c.m_sek)}`}
        </text>
        {/* STAD — identisch zum einzeln platzierbaren Symbol. */}
        <g transform={`translate(${cx - 6} ${sy(303) - 14})`}><SymSTAD /></g>
        <Thermometer cy={sy(320)} />
        {/* Ventil unten — identisch zu den einzeln platzierbaren Symbolen. */}
        {hatVentil && (
          <>
            {schaltung === 'beimisch'
              ? <g transform={`translate(${cx + 19} ${sy(338) - 14}) scale(-1 1)`}><SymValve3 /></g>
              : <g transform={`translate(${cx - 17.5} ${sy(338) - 14})`}><SymValve2V /></g>}
            {c.ventil && (
              <text x={cx + 34} y={sy(338) + 4} fontSize="8" fill="#1e293b" fontFamily="monospace">kvs {c.ventil.kvs_eff}</text>
            )}
          </>
        )}
        {/* Absperrventil unten */}
        <Absperr cyMid={sy(368)} />
        {/* Bypass gehört zur Schaltung (Drossel hat keinen):
            Einspritz → mündet ÜBER dem 2WV · Beimisch → in den 3WV-Anschluss */}
        {schaltung !== 'drossel' && (
          <>
            <path
              d={schaltung === 'einspritz'
                ? `M ${cx} ${sy(44)} H 22 V ${sy(320)} H ${cx}`
                : `M ${cx} ${sy(44)} H 22 V ${sy(338)} H ${cx - 19}`}
              fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeDasharray="6,4" />
            <circle cx={cx} cy={sy(44)} r="3.5" fill="#3b82f6" />
            {schaltung === 'einspritz' && <circle cx={cx} cy={sy(320)} r="3.5" fill="#3b82f6" />}
            {c.m_bypass > 0 && (
              <text x="16" y={sy(210)} transform={`rotate(-90 16 ${sy(210)})`} textAnchor="middle" fontSize="8" fill="#3b82f6" fontFamily="monospace">
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
      {H(Position.Top,    'top',    { top: -3, left:'50%' })}
      {H(Position.Bottom, 'bottom', { bottom: -3, left:'50%' })}
      <svg viewBox="0 0 48 48" width="26" height="26">
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
      {H(Position.Bottom, 'bottom', { bottom: -3, left: '48.8%' })}
      {/* Die frühere blaue gestrichelte Leitung unter dem Behälter war reine
          Dekoration und lag ausserdem unter dem echten Anschluss — das sah aus
          wie eine Leitung, war aber keine. Stattdessen endet das Symbol jetzt
          mit einem kurzen, runden Anschlussstutzen genau dort, wo der Handle
          sitzt: Marker == Handle == Snapkoordinate (§14/§15). */}
      <svg viewBox="0 0 248 344" width="38" height="53">
        <g fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path fill="#d9d9d9" d="M54 33 C54 15 84 1 121 1 C158 1 188 15 188 33 L188 297 C188 315 158 329 121 329 C84 329 54 315 54 297 Z" />
          <line x1="54" y1="33" x2="188" y2="33" />
          <path d="M54 166 H102 C103 155 109 148 121 148 C133 148 139 155 140 166 H188" />
          <line x1="115" y1="158" x2="127" y2="158" />
          <line x1="54" y1="300" x2="188" y2="300" />
        </g>
        <line x1="121" y1="329" x2="121" y2="341" stroke="#1e293b" strokeWidth="7" strokeLinecap="round" />
      </svg>
      <Label text={c.vorschlag_l ? `EGF ${c.vorschlag_l} l` : (data.label || 'EGF')} />
    </div>
  );
}

// ── Brauchwarmwasser-Speicher: wie Speicher, aber GRÜN ───────
export function BwwNode({ data, selected: sel }) {
  const c = data._calc || {};
  const liter = c.speichervolumen_l ?? c.bereitschaftsvolumen_l ?? data.speicher_liter;
  const aussenregister = (c.register_bauart || data.bww_speicherkonfiguration || 'aussen') === 'aussen';
  return (
    <div style={{ ...wrap(sel), overflow:'visible' }}>
      <ZoneHandles prefix="sz" rahmen={SPEICHER_RAHMEN} />
      {HK(Position.Top,    'top-l', ...SPEICHER_PORTS['top-l'], '#ef4444')}
      {HK(Position.Top,    'top-r', ...SPEICHER_PORTS['top-r'], '#ef4444')}
      {HK(Position.Bottom, 'bot-l', ...SPEICHER_PORTS['bot-l'], '#3b82f6')}
      {HK(Position.Bottom, 'bot-r', ...SPEICHER_PORTS['bot-r'], '#3b82f6')}
      {HK(Position.Left,   'left',  ...SPEICHER_PORTS.left)}
      {HK(Position.Right,  'right', ...SPEICHER_PORTS.right)}
      {/* Trinkwarmwasser oben am roten Pfeil, Trinkkaltwasser unten am grünen. */}
      {HK(Position.Top,    'warmwasser', ...SPEICHER_PORTS.warmwasser, '#ef4444')}
      {HK(Position.Bottom, 'kaltwasser', ...SPEICHER_PORTS.kaltwasser, '#16a34a')}
      {aussenregister && (
        <div title="Aussenliegendes Register mit Plattentauscher" style={{
          position:'absolute', left:-54, top:51, width:47, height:34, zIndex:2,
          background:'white', borderRadius:3,
        }}>
          <div style={{ position:'absolute', left:41, top:7, width:16, borderTop:'2px solid #ef4444' }}/>
          <div style={{ position:'absolute', left:41, top:25, width:16, borderTop:'2px dashed #3b82f6' }}/>
          {/* Beiwerk im Speichersymbol, deshalb im alten Kleinmass (#65 ersetzt
              dieses Kästchen durch ein echtes Bauteil). */}
          <SymPWT width={47} />
          <div style={{ position:'absolute', left:8, top:34, fontSize:7, fontWeight:700, color:'#475569' }}>PWT</div>
        </div>
      )}
      <SymBwwSpeicher liter={liter} />
      {c.leistung_ausreichend === false && (
        <div title="BWW-Ladeleistung höher als Wärmepumpenleistung"
          style={{ position:'absolute', right:-11, top:18, width:20, height:20, borderRadius:'50%',
            display:'grid', placeItems:'center', background:'#fef2f2', border:'1px solid #ef4444',
            color:'#dc2626', fontSize:12, fontWeight:800, zIndex:4 }}>!</div>
      )}
      <Label text={c.anschlussleistung_kw != null
        ? `${data.label || 'BWW'} · ${c.anschlussleistung_kw} kW`
        : (data.label || 'BWW')} />
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

// ── Reine Zeichnungs-Annotationen (ohne hydraulische Bedeutung) ─────────────
// Werden NICHT im ProjectContext gezählt (schema_mengen kennt diese Typen nicht).

// Betonfläche: frei skalierbares Rechteck mit Kreuzschraffur, transparente
// Grundfläche, liegt hinter den Bauteilen. Nur Darstellung.
export function ConcreteAreaNode({ id, data, selected: sel }) {
  const scale = Math.max(3, Math.min(60, Number(data?.hatch_scale) || 8));
  const patternId = `hc-crosshatch-${String(id || 'area').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', boxSizing: 'border-box',
      border: `1px ${sel ? 'solid #3b82f6' : 'dashed #94a3b8'}` }}>
      <NodeResizer isVisible={sel} minWidth={40} minHeight={40} color="#3b82f6" />
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <pattern id={patternId} width={scale} height={scale} patternUnits="userSpaceOnUse">
            <path d={`M0 0 L${scale} ${scale} M${scale} 0 L0 ${scale}`} stroke="#94a3b8" strokeWidth="0.6" opacity="0.55" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

// Systemgrenze / Schnittstelle: frei platzierbare schwarze Linie, solide oder
// gestrichelt, mit optionalem Text. Strikt getrennt von hydraulischen Leitungen.
export function InterfaceLineNode({ id, data, selected: sel }) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const dashed = Boolean(data.dashed);
  const text = data.label ?? '';
  const setData = (patch) => setNodes(ns => ns.map(n => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  return (
    <div style={{ width: '100%', height: '100%', minWidth: 60, position: 'relative',
      display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <NodeResizer isVisible={sel} minWidth={60} minHeight={16} color="#0f172a" />
      {(text || editing) && (
        <div onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#0f172a', textAlign: 'center', marginBottom: 3, cursor: 'text' }}>
          {editing ? (
            <input autoFocus className="nodrag nowheel" defaultValue={text}
              onBlur={(e) => { setEditing(false); setData({ label: e.target.value }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); setData({ label: e.target.value }); } if (e.key === 'Escape') setEditing(false); }}
              style={{ font: 'inherit', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', width: '100%' }} />
          ) : text}
        </div>
      )}
      <div onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} #0f172a`, width: '100%', cursor: 'grab' }} />
      {sel && (
        <button type="button" className="nodrag"
          onClick={(e) => { e.stopPropagation(); setData({ dashed: !dashed }); }}
          style={{ position: 'absolute', top: -22, right: 0, fontSize: 9, fontWeight: 700,
            border: '1px solid #cbd5e1', borderRadius: 4, background: 'white', padding: '1px 5px', cursor: 'pointer', color: '#334155' }}>
          {dashed ? 'gestrichelt' : 'solid'}
        </button>
      )}
    </div>
  );
}

// ── Bauteil-Nummern (Pflichtenheft §10: Nummerierung + Legende) ──────
// Jedes nummerierbare Bauteil bekommt ein rotes Badge (data.nr) oben rechts.
// eslint-disable-next-line react-refresh/only-export-components
export const NUMMERIERT = ['gruppe', 'heizkreis', 'heizkoerper', 'luftheizapparat', 'pump', 'valve2', 'valve3', 'checkvalve', 'shutoff', 'erzeuger', 'speicher', 'erdsonden', 'verteiler', 'waermezaehler', 'expansion', 'bww', 'stad', 'sicherheitsventil', 'pwt', 'lufterhitzer', 'lufterhitzer_gruppe', 'waermezaehler_cad'];
const KOMPAKTE_BAUTEILE = new Set([
  'pump', 'valve2', 'valve3', 'checkvalve', 'shutoff', 'stad',
  'waermezaehler', 'expansion', 'sicherheitsventil', 'pwt', 'lufterhitzer', 'luftheizapparat',
  'waermezaehler_cad',
]);

// Eine gemeinsame Grundbreite statt einer Breite je Inhalt (Dominic
// 2026-08-06): Pumpe, Ventil, Verbrauchergruppe und die übrigen gewöhnlichen
// Bauteile landen alle auf demselben Mass und stehen dadurch ruhig
// nebeneinander. Wer wirklich lange Angaben hat — der Wärmeerzeuger mit
// «Sole/Wasser-WP (Erdsonden)» — darf breiter werden; enger wird keiner.
// Dieselben Grenzen zeichnet der PDF-Export (schema_svg.py).
const DATENBLOCK_MIN_BREITE = 120;
const DATENBLOCK_MAX_BREITE = 210;
// Fangradius für das Ausrichten, in Bildschirmpixeln bei 100 % — er wird beim
// Ziehen durch den Zoom geteilt, damit er sich immer gleich anfühlt.
const DATENBLOCK_FANG = 7;

// eslint-disable-next-line no-unused-vars
function mitNr(Comp) {
  function MitNr(props) {
    const nr = props.data?.nr;
    const kompakt = KOMPAKTE_BAUTEILE.has(props.type);
    const skaliert = props.type === 'heizkoerper';
    const { setNodes, getZoom, screenToFlowPosition } = useReactFlow();
    const captionDrag = useRef(null);
    const captionRef = useRef(null);
    // Fangpunkte und Hilfslinien des laufenden Ziehens. Nur der Block, der
    // gerade bewegt wird, hält diesen Zustand — die anderen zeichnen nichts.
    const [fang, setFang] = useState(null);
    // Gedreht wird nur das Symbol (siehe NODE_TYPES: mitRotation liegt INNEN).
    // Nummer und Beschriftung stehen darüber und drehen bewusst nicht mit:
    // sie sollen bei jeder Bauteillage an derselben Stelle und lesbar bleiben
    // (Dominic 2026-08-05). Genauso zeichnet sie der PDF-Export.
    const caption = props.data?.label || {
      erzeuger:'Wärmeerzeuger', erdsonden:'Erdsondenfeld', speicher:'Speicher',
      bww:'BWW-Speicher', verteiler:'Verteiler', gruppe:'Verbrauchergruppe',
      heizkreis:'Heizkreis', heizkoerper:'Heizkörper', luftheizapparat:'Luftheizapparat', pump:'Pumpe', valve2:'2-Weg-Ventil',
      valve3:'3-Weg-Ventil', checkvalve:'Rückschlagventil', shutoff:'Absperrventil',
      stad:'STAD', waermezaehler:'Wärmezähler', expansion:'Expansionsgefäss',
      sicherheitsventil:'Sicherheitsventil', pwt:'Plattentauscher',
      lufterhitzer:'Lufterhitzer', lufterhitzer_gruppe:'Lufterhitzer-Gruppe',
      waermezaehler_cad:'Wärmezähler',
    }[props.type] || 'Bauteil';
    // Abschnitte: [{titel, zeilen:[{name,wert}]}]. Ein Einzelbauteil hat genau
    // einen Abschnitt ohne Titel, eine Verbrauchergruppe je eingebautem Gerät
    // einen eigenen (Pumpe, Regelventil, Wärmezähler).
    const abschnitte = Array.isArray(props.data?._calc?.kennwerte) ? props.data._calc.kennwerte : [];
    // Ein Datenblock in Weltkoordinaten. Gemessen wird der echte Kasten am
    // Bildschirm — dadurch stimmen Fang und Anzeige immer mit dem überein, was
    // der Planer sieht, auch bei Zoom und verschobener Ansicht.
    const blockMessen = (element) => {
      const r = element.getBoundingClientRect();
      // Ohne `snapToGrid:false` rundet React Flow die gemessenen Ecken aufs
      // Zeichenraster — der Block würde dann an ein gerastertes Zerrbild
      // seiner Nachbarn fangen statt an deren echte Kanten.
      const roh = { snapToGrid:false };
      const links = screenToFlowPosition({ x:r.left, y:r.top }, roh);
      const rechts = screenToFlowPosition({ x:r.right, y:r.bottom }, roh);
      return { x:links.x, y:links.y, breite:rechts.x - links.x, hoehe:rechts.y - links.y };
    };
    const captionPointerDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const eigener = captionRef.current;
      captionDrag.current = {
        x:event.clientX,
        y:event.clientY,
        offsetX:Number(props.data?.caption_offset_x) || 0,
        offsetY:Number(props.data?.caption_offset_y) || 0,
        // Die anderen Blöcke stehen während des Ziehens still; sie werden
        // einmal beim Anfassen gemessen statt bei jeder Mausbewegung.
        rechteck:eigener ? blockMessen(eigener) : null,
        andere:Array.from(document.querySelectorAll('.hc-datenblock'))
          .filter(element => element !== eigener)
          .map(blockMessen),
      };
      const move = (moveEvent) => {
        const drag = captionDrag.current;
        if (!drag) return;
        const zoom = Math.max(getZoom(), 0.05);
        // Beschriftung und Nummer liegen ausserhalb der Drehung (siehe
        // NODE_TYPES): die Maus bewegt sie direkt, ohne Umrechnung.
        const dx = (moveEvent.clientX - drag.x) / zoom;
        const dy = (moveEvent.clientY - drag.y) / zoom;
        // Alt hält den Fang an — sonst käme man an eine Flucht nie knapp heran.
        const bewegt = drag.rechteck
          ? { ...drag.rechteck, x:drag.rechteck.x + dx, y:drag.rechteck.y + dy }
          : null;
        const gefangen = bewegt && !moveEvent.altKey
          ? datenblockAusrichten(bewegt, drag.andere, DATENBLOCK_FANG / zoom)
          : { dx:0, dy:0, linien:[] };
        const nextX = drag.offsetX + dx + gefangen.dx;
        const nextY = drag.offsetY + dy + gefangen.dy;
        setNodes(nodes => nodes.map(node => node.id === props.id
          ? { ...node, data:{ ...node.data, caption_offset_x:nextX, caption_offset_y:nextY } }
          : node));
        setFang(bewegt ? {
          linien:gefangen.linien,
          punkte:fangPunkte({ ...bewegt, x:bewegt.x + gefangen.dx, y:bewegt.y + gefangen.dy }),
          zoom,
        } : null);
      };
      const up = () => {
        captionDrag.current = null;
        setFang(null);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return (
      <div style={{ position:'relative', display:skaliert ? 'block' : 'inline-block',
        ...(skaliert ? { width:'100%', height:'100%' } : {}) }}>
        <Comp {...props} />
        {nr != null && (
          <div style={{
            position: 'absolute', top: kompakt ? -6 : -9, right: kompakt ? -6 : -9,
            minWidth: kompakt ? 14 : 20, height: kompakt ? 13 : 17,
            borderRadius: 9, background: 'white', border: `${kompakt ? 1 : 1.5}px solid #dc2626`,
            color: '#dc2626', fontSize: kompakt ? 7 : 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: kompakt ? '0 3px' : '0 4px', zIndex: 20, pointerEvents: 'none',
          }}>{nr}</div>
        )}
        {nr != null && (
          <div className="nodrag nopan hc-datenblock"
            ref={captionRef}
            onPointerDown={captionPointerDown}
            title="Datenblock verschieben — rastet an den anderen Blöcken ein (Alt hält den Fang an)"
            style={{
              position:'absolute', top:'100%', left:'50%',
              transform:`translate(calc(-50% + ${Number(props.data?.caption_offset_x) || 0}px), ${10 + (Number(props.data?.caption_offset_y) || 0)}px)`,
              minWidth:DATENBLOCK_MIN_BREITE, maxWidth:DATENBLOCK_MAX_BREITE,
              boxSizing:'border-box', padding:'3px 7px',
              border:'1px solid #94a3b8', borderRadius:3, background:'white',
              color:'#334155', fontSize:9, lineHeight:1.2, textAlign:'center',
              whiteSpace:'nowrap', cursor:'move', zIndex:18,
            }}>
            <div style={{ fontWeight:700 }}>{caption}</div>
            {/* Kennwerte kommen fertig aus dem Backend (node_infos) — dieselbe
                Quelle zeichnet das Kästchen im PDF-Export. */}
            {abschnitte.map((abschnitt, a) => (
              <div key={a}>
                {abschnitt.titel
                  ? <div style={{ fontWeight:700, textAlign:'left', marginTop:4 }}>{abschnitt.titel}</div>
                  : null}
                <table style={{ borderTop:a === 0 ? '1px solid #cbd5e1' : 'none', marginTop:2,
                  width:'100%', borderCollapse:'collapse', fontSize:8 }}>
                  <tbody>
                    {(abschnitt.zeilen || []).map((k, i) => (
                      <tr key={i}>
                        <td style={{ color:'#64748b', textAlign:'left', paddingRight:6 }}>{k.name}</td>
                        <td style={{ color:'#0f172a', textAlign:'right' }}>{k.wert}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        {/* Fangpunkte und Hilfslinien liegen in Weltkoordinaten über der
            ganzen Zeichnung, nicht im Bauteil — sonst würden sie am Rand des
            Bauteils abgeschnitten. */}
        {fang && (
          <ViewportPortal>
            <svg width="1" height="1" role="presentation"
              style={{ position:'absolute', left:0, top:0, overflow:'visible', pointerEvents:'none', zIndex:19 }}>
              {fang.linien.map((linie, i) => (
                <line key={i}
                  x1={linie.achse === 'x' ? linie.wert : linie.von}
                  y1={linie.achse === 'x' ? linie.von : linie.wert}
                  x2={linie.achse === 'x' ? linie.wert : linie.bis}
                  y2={linie.achse === 'x' ? linie.bis : linie.wert}
                  stroke="#22c55e" strokeWidth={1.4 / fang.zoom}
                  strokeDasharray={`${7 / fang.zoom} ${5 / fang.zoom}`} />
              ))}
              {fang.punkte.map((punkt, i) => (
                <rect key={i} x={punkt.x - 2.5 / fang.zoom} y={punkt.y - 2.5 / fang.zoom}
                  width={5 / fang.zoom} height={5 / fang.zoom}
                  fill="white" stroke="#16a34a" strokeWidth={1.2 / fang.zoom} />
              ))}
            </svg>
          </ViewportPortal>
        )}
      </div>
    );
  }
  return MitNr;
}

const BASIS_TYPES = {
  gruppe:      GruppeNode,
  lufterhitzer:        LufterhitzerNode,
  luftheizapparat:     LuftheizapparatNode,
  lufterhitzer_gruppe: LufterhitzerGruppeNode,
  heizkreis:   HeizkreisNode,
  heizkoerper: HeizkoerperNode,
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
  waermezaehler_cad: WaermezaehlerCadNode,
  expansion:   ExpansionNode,
  bww:         BwwNode,
  label:       LabelNode,
  concrete_area:  ConcreteAreaNode,
  interface_line: InterfaceLineNode,
};

// ── Drehung um 90° (data.rotation) ───────────────────────────────────────────
export const ROTATABLE = new Set([
  'pump', 'valve2', 'valve3', 'checkvalve', 'shutoff',
  'stad', 'temperatur', 'sicherheitsventil', 'pwt', 'lufterhitzer', 'luftheizapparat', 'heizkoerper',
  'waermezaehler', 'waermezaehler_cad', 'erzeuger', 'verbraucher', 'speicher', 'bww',
  'expansion', 'anschluss',
]);

// Gedreht wird das Bauteilzeichen samt seinem Auswahlrahmen — der Rahmen ist
// Teil des Symbols (siehe `wrap`) und liegt dadurch immer so wie das Zeichen.
// Nummer und Datenblock liegen eine Schicht darüber (`mitNr` umschliesst
// `mitRotation`) und drehen bewusst NICHT mit: sie sollen bei jeder Bauteillage
// an derselben Stelle und lesbar bleiben (Dominic 2026-08-05). Genauso zeichnet
// sie der PDF-Export.
// eslint-disable-next-line no-unused-vars
function mitRotation(Comp) {
  function MitRotation(props) {
    const rot = props.data?.rotation || 0;
    const mirrored = Boolean(props.data?.mirrored);
    if (!rot && !mirrored) return <Comp {...props} />;
    const skaliert = props.type === 'heizkoerper';
    // Reihenfolge rotate() scaleX(-1): erst spiegeln, dann drehen — passend zur
    // Seiten-Korrektur in anschlussSeite (spiegelSeite vor rotiereSeite).
    return (
      <div style={{ transform:`rotate(${rot}deg) scaleX(${mirrored ? -1 : 1})`, transformOrigin:'center center',
        display:skaliert ? 'block' : 'inline-block', ...(skaliert ? { width:'100%', height:'100%' } : {}) }}>
        <Comp {...props} />
      </div>
    );
  }
  return MitRotation;
}

// eslint-disable-next-line react-refresh/only-export-components
export const NODE_TYPES = Object.fromEntries(
  Object.entries(BASIS_TYPES).map(([k, C]) => {
    // Erst drehen, dann nummerieren: die Drehung umschliesst nur das Symbol.
    // Nummer und Beschriftung liegen darüber und bleiben dadurch immer an
    // derselben Stelle und aufrecht lesbar — im Editor wie im PDF-Export.
    let W = ROTATABLE.has(k) ? mitRotation(C) : C;
    if (NUMMERIERT.includes(k)) W = mitNr(W);
    // React Flow gibt jedem Bauteil bei jeder Änderung am Graphen neue Props.
    // Ohne memo zeichnet sich beim Verschieben eines Bauteils das ganze Schema
    // neu, ebenso beim Öffnen eines Menüs. Die Bauteile rendern ausschliesslich
    // aus ihren Props (Node-Daten werden nie in place geändert, sondern immer
    // ersetzt), der flache Vergleich ist deshalb vollständig.
    return [k, memo(W)];
  })
);
