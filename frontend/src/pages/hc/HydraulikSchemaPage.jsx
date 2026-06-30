import React, { useRef, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// SIA 410 Symbole als React/SVG-Komponenten
const VL = "#ef4444";
const RL = "#3b82f6";
const PIPE_W = 2.5;

function Pipe({ x1, y1, x2, y2, col = VL, w = PIPE_W }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={w} strokeLinecap="round" />;
}

function Arrow({ x, y, dir = "right", col }) {
  const pts = {
    right: `${x - 5},${y - 4} ${x + 4},${y} ${x - 5},${y + 4}`,
    left:  `${x + 5},${y - 4} ${x - 4},${y} ${x + 5},${y + 4}`,
    down:  `${x - 4},${y - 5} ${x},${y + 4} ${x + 4},${y - 5}`,
    up:    `${x - 4},${y + 5} ${x},${y - 4} ${x + 4},${y + 5}`,
  };
  return <polygon points={pts[dir]} fill={col} opacity="0.75" />;
}

// Pumpe (SIA 410: Kreis mit Flügel)
function Pump({ x, y, col = "#374151", onClick, tooltip }) {
  return (
    <g onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }} className="hc-sym">
      <title>{tooltip}</title>
      <circle cx={x} cy={y} r={12} fill="white" stroke={col} strokeWidth={2} />
      <polygon points={`${x - 7},${y} ${x + 5},${y - 6} ${x + 5},${y + 6}`} fill={col} />
      <line x1={x - 10} y1={y} x2={x + 10} y2={y} stroke={col} strokeWidth={1.2} opacity={0.25} />
      {onClick && <circle cx={x} cy={y} r={14} fill="transparent" stroke={col} strokeWidth={1} strokeDasharray="3,2" opacity={0.4} />}
    </g>
  );
}

// 2-Wege Regelventil (Fliege/Schmetterling)
function Valve2({ x, y, col = "#1d4ed8", onClick, tooltip }) {
  return (
    <g onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }} className="hc-sym">
      <title>{tooltip}</title>
      <polygon points={`${x - 11},${y - 9} ${x},${y} ${x - 11},${y + 9}`} fill="none" stroke={col} strokeWidth={1.8} />
      <polygon points={`${x + 11},${y - 9} ${x},${y} ${x + 11},${y + 9}`} fill="none" stroke={col} strokeWidth={1.8} />
      <line x1={x} y1={y - 9} x2={x} y2={y - 17} stroke={col} strokeWidth={1.5} />
      <rect x={x - 5} y={y - 23} width={10} height={6} rx={1} fill={col} opacity={0.75} />
      {onClick && <rect x={x - 14} y={y - 25} width={28} height={37} fill="transparent" />}
    </g>
  );
}

// 3-Wege Mischventil (Dreieck mit 3 Ports)
function Valve3Mix({ x, y, col = "#7c3aed", onClick, tooltip }) {
  return (
    <g onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }} className="hc-sym">
      <title>{tooltip}</title>
      <polygon points={`${x - 12},${y - 9} ${x + 12},${y - 9} ${x},${y + 9}`} fill="none" stroke={col} strokeWidth={1.8} />
      <line x1={x - 18} y1={y - 9} x2={x - 12} y2={y - 9} stroke={col} strokeWidth={1.5} />
      <line x1={x + 12} y1={y - 9} x2={x + 18} y2={y - 9} stroke={col} strokeWidth={1.5} />
      <line x1={x} y1={y + 9} x2={x} y2={y + 16} stroke={col} strokeWidth={1.5} />
      <line x1={x} y1={y - 9} x2={x} y2={y - 18} stroke={col} strokeWidth={1.5} />
      <rect x={x - 5} y={y - 24} width={10} height={6} rx={1} fill={col} opacity={0.75} />
      <text x={x - 22} y={y - 4} textAnchor="middle" fontSize={8} fill={col}>A</text>
      <text x={x + 22} y={y - 4} textAnchor="middle" fontSize={8} fill={col}>B</text>
      <text x={x + 10} y={y + 16} textAnchor="start" fontSize={7} fill={col}>AB</text>
      {onClick && <rect x={x - 22} y={y - 26} width={44} height={46} fill="transparent" />}
    </g>
  );
}

// Rückschlagventil
function CheckValve({ x, y, col = "#374151", tooltip }) {
  return (
    <g>
      <title>{tooltip || "Rückschlagventil"}</title>
      <polygon points={`${x - 9},${y - 8} ${x + 5},${y} ${x - 9},${y + 8}`} fill="none" stroke={col} strokeWidth={1.8} />
      <line x1={x + 5} y1={y - 10} x2={x + 5} y2={y + 10} stroke={col} strokeWidth={2} />
    </g>
  );
}

// Erzeuger-Box
function Erzeuger({ x, y, label = "Erzeuger", tooltip }) {
  return (
    <g>
      <title>{tooltip || label}</title>
      <rect x={x - 28} y={y - 18} width={56} height={36} rx={5} fill="#fff7ed" stroke="#dc2626" strokeWidth={1.5} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#dc2626">{label}</text>
    </g>
  );
}

// Heizfläche
function Heizflaeche({ x, y, label = "Heizkreis", tooltip }) {
  const pts = [[x - 22, y - 8], [x - 10, y - 8], [x - 10, y + 4], [x + 2, y + 4],
               [x + 2, y - 8], [x + 14, y - 8], [x + 14, y + 4], [x + 22, y + 4]];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  return (
    <g>
      <title>{tooltip || label}</title>
      <rect x={x - 30} y={y - 20} width={60} height={40} rx={5} fill="#fef9f0" stroke="#f97316" strokeWidth={1.5} />
      <path d={d} fill="none" stroke="#f97316" strokeWidth={1.5} />
      <text x={x} y={y + 28} textAnchor="middle" fontSize={9} fill="#c2410c">{label}</text>
    </g>
  );
}

// ── Schaltungen ─────────────────────────────────────────────

function BeimischSchema({ onVentil, onPumpe }) {
  const MX = 270, MY = 108, EX = 80, EY = 85, HX = 510, PX = 270, PY = 168;
  return (
    <>
      {/* Pipes */}
      <Pipe x1={EX + 28} y1={EY - 8} x2={MX - 18} y2={MY - 9} col={VL} />
      <Arrow x={EX + 80} y={EY - 8} dir="right" col={VL} />
      <Pipe x1={MX} y1={MY + 16} x2={PX} y2={PY - 12} col={VL} />
      <Pipe x1={PX} y1={PY + 12} x2={PX} y2={PY + 38} col={VL} />
      <Pipe x1={PX} y1={PY + 38} x2={HX - 30} y2={PY + 38} col={VL} />
      <Arrow x={PX + 70} y={PY + 38} dir="right" col={VL} />
      {/* RL Heizkreis */}
      <Pipe x1={HX + 30} y1={PY + 58} x2={HX + 30} y2={PY + 85} col={RL} />
      <Pipe x1={HX + 30} y1={PY + 85} x2={MX} y2={PY + 85} col={RL} />
      <Arrow x={MX + 70} y={PY + 85} dir="left" col={RL} />
      {/* RL Beimischung hoch zum 3WM Port B */}
      <Pipe x1={MX} y1={PY + 85} x2={MX} y2={MY + 9} col={RL} />
      <Arrow x={MX} y={MY + 55} dir="up" col={RL} />
      {/* RL Primär zurück zu Erzeuger */}
      <Pipe x1={MX + 18} y1={MY - 9} x2={EX + 28} y2={EY + 8} col={RL} />
      <Arrow x={MX - 30} y={MY - 4} dir="left" col={RL} />

      {/* Komponenten */}
      <Erzeuger x={EX} y={EY} label="Erzeuger" />
      <Valve3Mix x={MX} y={MY} onClick={onVentil} tooltip="3-Wege Mischventil — klicken: Ventilauslegung" />
      <Pump x={PX} y={PY} onClick={onPumpe} tooltip="Sekundärpumpe — klicken: Druckverlust berechnen" />
      <Heizflaeche x={HX} y={PY + 38} label="Heizkreis" />

      {/* Beschriftung */}
      <text x={EX + 80} y={EY - 18} textAnchor="middle" fontSize={9} fill={VL}>VL Primär</text>
      <text x={PX + 80} y={PY + 28} textAnchor="middle" fontSize={9} fill={VL}>VL sek.</text>
      <text x={MX + 90} y={PY + 78} textAnchor="middle" fontSize={9} fill={RL}>RL sek. (Beimischung)</text>
      <text x={MX - 50} y={MY + 2} fontSize={8} fill="#7c3aed">← RL Beimisch</text>

      {/* Infobox */}
      <rect x={350} y={248} width={245} height={38} rx={5} fill="#f0fdf4" stroke="#86efac" strokeWidth={1} />
      <text x={472} y={263} textAnchor="middle" fontSize={9} fill="#166534">Regelt Sekundärtemperatur durch Beimischung</text>
      <text x={472} y={279} textAnchor="middle" fontSize={9} fill="#166534">Erzeuger läuft mit konst. Temperatur • Standard in CH</text>
    </>
  );
}

function EinspritzSchema({ onPumpe }) {
  const EX = 70, EY = 85, IX = 240, SY = 210;
  return (
    <>
      {/* Primär VL oben */}
      <Pipe x1={EX + 28} y1={EY - 8} x2={560} y2={EY - 8} col={VL} />
      <Arrow x={200} y={EY - 8} dir="right" col={VL} />
      <Arrow x={390} y={EY - 8} dir="right" col={VL} />
      {/* Primär RL unten */}
      <Pipe x1={EX + 28} y1={EY + 8} x2={560} y2={EY + 8} col={RL} />
      <Arrow x={390} y={EY + 8} dir="left" col={RL} />
      <Arrow x={200} y={EY + 8} dir="left" col={RL} />
      {/* Kurzschluss rechts */}
      <path d={`M560,${EY - 8} Q575,${EY - 8} 575,${EY} Q575,${EY + 8} 560,${EY + 8}`} fill="none" stroke={RL} strokeWidth={PIPE_W} strokeLinecap="round" />

      {/* Einspritzzweig: VL primär nach unten */}
      <Pipe x1={IX} y1={EY + 8} x2={IX} y2={155} col={VL} />
      <Arrow x={IX} y={EY + 40} dir="down" col={VL} />
      {/* Sekundärkreis */}
      <Pipe x1={IX} y1={180} x2={IX} y2={SY} col={VL} />
      <Pipe x1={IX} y1={SY} x2={480} y2={SY} col={VL} />
      <Arrow x={330} y={SY} dir="right" col={VL} />
      {/* RL sekundär */}
      <Pipe x1={480} y1={SY + 20} x2={480} y2={SY + 55} col={RL} />
      <Pipe x1={480} y1={SY + 55} x2={IX} y2={SY + 55} col={RL} />
      <Arrow x={360} y={SY + 55} dir="left" col={RL} />
      {/* RL mündet in Primär RL */}
      <Pipe x1={IX} y1={SY + 55} x2={IX} y2={EY + 8} col={RL} />
      <Arrow x={IX} y={SY + 20} dir="up" col={RL} />
      <circle cx={IX} cy={EY + 8} r={4} fill="#f59e0b" />

      <Erzeuger x={EX} y={EY} label="Erzeuger" />
      <Pump x={IX} y={167} col="#374151" onClick={onPumpe} tooltip="Einspritzpumpe — klicken: Druckverlust" />
      <CheckValve x={IX} y={195} tooltip="Rückschlagventil — verhindert Rückströmung" />
      <Heizflaeche x={480} y={SY} label="Heizkreis" />

      <text x={250} y={EY - 18} textAnchor="middle" fontSize={9} fill={VL}>VL Primär (durchgehend)</text>
      <text x={250} y={EY + 22} textAnchor="middle" fontSize={9} fill={RL}>RL Primär</text>
      <text x={IX + 12} y={148} fontSize={8} fill="#374151">P inj.</text>
      <text x={IX - 35} y={EY + 5} fontSize={8} fill="#f59e0b">Einmisch</text>
      <text x={330} y={SY - 10} textAnchor="middle" fontSize={9} fill={VL}>VL sek. (eingespeist)</text>
      <text x={330} y={SY + 68} textAnchor="middle" fontSize={9} fill={RL}>RL sek.</text>

      <rect x={290} y={255} width={260} height={30} rx={5} fill="#eff6ff" stroke="#93c5fd" strokeWidth={1} />
      <text x={420} y={268} textAnchor="middle" fontSize={9} fill="#1e40af">Einspritz: kleine Pumpe, Primär läuft konstant</text>
      <text x={420} y={280} textAnchor="middle" fontSize={9} fill="#1e40af">Geeignet für niedrige sek. Temperaturen</text>
    </>
  );
}

function DrosselSchema({ onVentil, onPumpe }) {
  const EX = 80, EY = 130, PX = 185, VX = 335, HX = 490;
  return (
    <>
      <Pipe x1={EX + 28} y1={EY} x2={PX - 12} y2={EY} col={VL} />
      <Pipe x1={PX + 12} y1={EY} x2={VX - 11} y2={EY} col={VL} />
      <Arrow x={255} y={EY} dir="right" col={VL} />
      <Pipe x1={VX + 11} y1={EY} x2={HX - 30} y2={EY} col={VL} />
      <Arrow x={415} y={EY} dir="right" col={VL} />
      {/* RL */}
      <Pipe x1={HX + 30} y1={EY + 20} x2={HX + 30} y2={EY + 65} col={RL} />
      <Pipe x1={HX + 30} y1={EY + 65} x2={EX} y2={EY + 65} col={RL} />
      <Arrow x={320} y={EY + 65} dir="left" col={RL} />
      <Pipe x1={EX} y1={EY + 65} x2={EX} y2={EY + 18} col={RL} />
      <Arrow x={EX} y={EY + 40} dir="up" col={RL} />

      <Erzeuger x={EX} y={EY} label="Erzeuger" />
      <Pump x={PX} y={EY} onClick={onPumpe} tooltip="Umwälzpumpe — klicken: Druckverlust" />
      <Valve2 x={VX} y={EY} onClick={onVentil} tooltip="2-Wege Regelventil — klicken: Ventilauslegung (M3)" />
      <Heizflaeche x={HX} y={EY} label="Heizfläche" />

      <text x={255} y={EY - 10} textAnchor="middle" fontSize={9} fill={VL}>VL (gedrosselt)</text>
      <text x={320} y={EY + 78} textAnchor="middle" fontSize={9} fill={RL}>RL</text>

      <rect x={130} y={222} width={350} height={52} rx={6} fill="#fefce8" stroke="#fde047" strokeWidth={1} />
      <text x={305} y={237} textAnchor="middle" fontSize={9} fill="#854d0e">Einsatz: kleiner Verbraucher · einfache Regelung</text>
      <text x={305} y={252} textAnchor="middle" fontSize={9} fill="#92400e">⚠ Ventilautorität 30–80% sicherstellen (→ M3 Ventilauslegung)</text>
      <text x={305} y={267} textAnchor="middle" fontSize={9} fill="#92400e">Keine Entkopplung Primär/Sekundär</text>
    </>
  );
}

// ── Hauptseite ───────────────────────────────────────────────

const SCHEMAS = [
  {
    id: "beimisch",
    label: "Beimischung",
    short: "3-Wege Mischventil regelt Sekundärtemperatur",
    color: "#7c3aed",
  },
  {
    id: "einspritz",
    label: "Einspritzung",
    short: "Einspritzpumpe schleust Primärwasser ein",
    color: "#0891b2",
  },
  {
    id: "drossel",
    label: "Drossel",
    short: "2-Wege Ventil drosselt den Durchfluss direkt",
    color: "#1d4ed8",
  },
];

export default function HydraulikSchemaPage() {
  const [active, setActive] = useState("beimisch");
  const navigate = useNavigate();

  const goVentil = () => navigate("/heizungscockpit/rechner/ventil");
  const goDruck  = () => navigate("/heizungscockpit/rechner/druckverlust");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
        <Link to="/heizungscockpit" style={{ color: "#2563eb" }}>Heizungscockpit</Link>
        {" / "}Hydraulische Schaltungen
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
        Hydraulische Schaltungen
      </h1>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
        SIA 410 Symbole · Klick auf Ventil oder Pumpe öffnet das Berechnungsmodul
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {SCHEMAS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "1.5px solid",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: active === s.id ? s.color : "white",
              color: active === s.id ? "white" : s.color,
              borderColor: s.color,
              transition: "all .15s",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Schema SVG */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <svg width="100%" viewBox="0 0 620 300" style={{ display: "block", maxHeight: 300 }}>
          <style>{`.hc-sym:hover { opacity: 0.75; }`}</style>

          {/* Titel */}
          <text x="310" y="20" textAnchor="middle" fontSize={11} fontWeight={700} fill="#1e293b">
            {SCHEMAS.find(s => s.id === active)?.label.toUpperCase()} — {SCHEMAS.find(s => s.id === active)?.short}
          </text>

          {active === "beimisch"  && <BeimischSchema  onVentil={goVentil} onPumpe={goDruck} />}
          {active === "einspritz" && <EinspritzSchema onPumpe={goDruck} />}
          {active === "drossel"   && <DrosselSchema   onVentil={goVentil} onPumpe={goDruck} />}
        </svg>
      </div>

      {/* Legende */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 11, color: "#475569" }}>
        <strong style={{ color: "#1e293b" }}>SIA 410 Legende:</strong>
        {[
          { sym: <svg width={20} height={20}><circle cx={10} cy={10} r={8} fill="none" stroke="#374151" strokeWidth={1.8}/><polygon points="5,10 13,6 13,14" fill="#374151"/></svg>, label: "Pumpe (P)" },
          { sym: <svg width={22} height={20}><polygon points="3,3 11,10 3,17" fill="none" stroke="#1d4ed8" strokeWidth={1.8}/><polygon points="19,3 11,10 19,17" fill="none" stroke="#1d4ed8" strokeWidth={1.8}/></svg>, label: "2WV Regelventil" },
          { sym: <svg width={26} height={22}><polygon points="13,3 24,19 2,19" fill="none" stroke="#7c3aed" strokeWidth={1.8}/></svg>, label: "3WM Mischventil" },
          { sym: <svg width={22} height={20}><polygon points="3,10 13,3 13,17" fill="none" stroke="#374151" strokeWidth={1.8}/><line x1={13} y1={3} x2={13} y2={17} stroke="#374151" strokeWidth={2}/></svg>, label: "Rückschlagventil" },
        ].map((l, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>{l.sym}{l.label}</span>
        ))}
        <span style={{ marginLeft: "auto", color: "#2563eb" }}>
          💡 Klick auf <strong>Ventil</strong> → M3 · Klick auf <strong>Pumpe</strong> → M4
        </span>
      </div>
    </div>
  );
}
