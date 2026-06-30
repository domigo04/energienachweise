// SIA 410 Hydraulik-Symbole

export function SymPump() {
  // Schwarzer Kreis, weiss ausgefüllt, schwarzes Dreieck nach oben
  return (
    <svg viewBox="0 0 44 44" width="44" height="44">
      <circle cx="22" cy="22" r="18" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <polygon points="13,31 31,31 22,11" fill="#1e293b" />
    </svg>
  );
}

// ── 2-Wege Regelventil VERTIKAL ───────────────────────────────
// Oben-Dreieck: Spitze nach unten (Eingang oben)
// Unten-Dreieck: Spitze nach oben (Ausgang unten)
// Motor: Quadrat rechts mit "M"
export function SymValve2V() {
  return (
    <svg viewBox="0 0 64 62" width="64" height="62">
      {/* Oberes Dreieck — Basis oben, Spitze nach unten */}
      <polygon
        points="6,4 42,4 24,26"
        fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinejoin="round"
      />
      {/* Unteres Dreieck — Basis unten, Spitze nach oben */}
      <polygon
        points="6,58 42,58 24,36"
        fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinejoin="round"
      />
      {/* Motor-Stiel: vom Mittelpunkt (24,31) nach rechts */}
      <line x1="42" y1="31" x2="50" y2="31" stroke="#1d4ed8" strokeWidth="1.8" />
      {/* Motor-Box */}
      <rect x="50" y="22" width="14" height="18" rx="2"
        fill="white" stroke="#1d4ed8" strokeWidth="1.8" />
      <text x="57" y="34" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1d4ed8">M</text>
    </svg>
  );
}

// ── 3-Wege Mischventil ───────────────────────────────────────
// 3 Tore (Dreiecke), alle Spitzen treffen sich im Zentrum
// Port A:  linkes Dreieck  (Basis links,  Spitze → Mitte)
// Port B:  rechtes Dreieck (Basis rechts, Spitze → Mitte)
// Port AB: unteres Dreieck (Basis unten,  Spitze → Mitte)
// Motor: Quadrat oben mit "M"
export function SymValve3() {
  // 3 GEFÜLLTE schwarze Dreiecke, Spitzen treffen sich exakt in der Mitte
  const cx = 33, cy = 40;
  return (
    <svg viewBox="0 0 66 84" width="66" height="84">
      {/* Linkes Dreieck – Basis links, Spitze Mitte */}
      <polygon points={`2,27 2,53 ${cx},${cy}`} fill="#1e293b"/>
      {/* Rechtes Dreieck – Basis rechts, Spitze Mitte */}
      <polygon points={`64,27 64,53 ${cx},${cy}`} fill="#1e293b"/>
      {/* Unteres Dreieck – Basis unten, Spitze Mitte */}
      <polygon points={`19,76 47,76 ${cx},${cy}`} fill="#1e293b"/>
      {/* Zentrum-Punkt – macht Berührung sauber */}
      <circle cx={cx} cy={cy} r={3.5} fill="#1e293b"/>
      {/* Port-Linien */}
      <line x1="0" y1={cy} x2="2" y2={cy} stroke="#1e293b" strokeWidth="2.5"/>
      <line x1="64" y1={cy} x2="66" y2={cy} stroke="#1e293b" strokeWidth="2.5"/>
      <line x1={cx} y1="76" x2={cx} y2="84" stroke="#1e293b" strokeWidth="2.5"/>
      {/* Motor-Stiel */}
      <line x1={cx} y1="27" x2={cx} y2="16" stroke="#1e293b" strokeWidth="1.8"/>
      <rect x={cx-10} y="4" width="20" height="13" rx="2" fill="white" stroke="#1e293b" strokeWidth="1.8"/>
      <text x={cx} y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1e293b">M</text>
    </svg>
  );
}

export function SymCheckValve() {
  return (
    <svg viewBox="0 0 44 44" width="44" height="44">
      {/* Dreieck: Spitze nach unten (Durchflussrichtung ↓) */}
      <polygon points="10,6 34,6 22,30" fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinejoin="round" />
      {/* Sperrlinie */}
      <line x1="8" y1="30" x2="36" y2="30" stroke="#1e293b" strokeWidth="2.5" />
    </svg>
  );
}

export function SymShutoff() {
  return (
    <svg viewBox="0 0 44 44" width="44" height="44">
      {/* Oben gefüllt */}
      <polygon points="10,6 34,6 22,22" fill="#1e293b" />
      {/* Unten gefüllt */}
      <polygon points="10,38 34,38 22,22" fill="#1e293b" />
    </svg>
  );
}

export function SymWE() {
  return (
    <svg viewBox="0 0 64 46" width="64" height="46">
      <rect x="2" y="2" width="60" height="42" rx="3" fill="white" stroke="#1e293b" strokeWidth="2" />
      <text x="32" y="28" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1e293b">WE</text>
    </svg>
  );
}

export function SymVerbraucher() {
  return (
    <svg viewBox="0 0 64 46" width="64" height="46">
      <rect x="2" y="2" width="60" height="42" rx="3" fill="#fff7ed" stroke="#f97316" strokeWidth="1.8" />
      <path d="M10,23 L20,13 L30,23 L40,13 L50,23" fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function SymSpeicher() {
  // Grösser + Rot
  return (
    <svg viewBox="0 0 56 100" width="56" height="100">
      {/* Zylinder-Körper */}
      <rect x="3" y="3" width="50" height="94" rx="6" fill="#fef2f2" stroke="#dc2626" strokeWidth="2.5" />
      {/* Füll-Linien */}
      <line x1="3" y1="35" x2="53" y2="35" stroke="#fca5a5" strokeWidth="1.2" strokeDasharray="5,3" />
      <line x1="3" y1="65" x2="53" y2="65" stroke="#fca5a5" strokeWidth="1.2" strokeDasharray="5,3" />
      {/* Wasserstand-Füllung */}
      <rect x="4" y="66" width="48" height="30" rx="4" fill="rgba(252,165,165,0.25)" />
      {/* SP Label */}
      <text x="28" y="54" textAnchor="middle" fontSize="13" fontWeight="700" fill="#dc2626">SP</text>
      {/* Anschluss-Stutzen oben VL */}
      <rect x="20" y="0" width="16" height="6" rx="2" fill="#ef4444" />
      {/* Anschluss-Stutzen unten RL */}
      <rect x="20" y="94" width="16" height="6" rx="2" fill="#3b82f6" />
    </svg>
  );
}

export function SymBypass() {
  return (
    <svg viewBox="0 0 30 30" width="30" height="30">
      <circle cx="15" cy="15" r="6" fill="#1e293b" />
      <circle cx="15" cy="15" r="10" fill="none" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,2" />
    </svg>
  );
}

export function SymVerteiler() {
  // Zwei Balken: VL oben (rot) + RL unten (blau), je 4 Stutzen oben + 1 links
  const BRANCH_X = [36, 83, 130, 177];
  return (
    <svg viewBox="0 0 200 78" width="200" height="78">
      {/* VL Verteiler – oben */}
      <rect x="2" y="4" width="196" height="28" rx="4" fill="#fee2e2" stroke="#ef4444" strokeWidth="2.5"/>
      <text x="100" y="22" textAnchor="middle" fontSize="10" fontWeight="700" fill="#dc2626">VL Verteiler</text>
      {BRANCH_X.map(x => <rect key={`vs${x}`} x={x-5} y="0" width="10" height="6" rx="2" fill="#ef4444"/>)}
      <rect x="0" y="11" width="6" height="10" rx="2" fill="#ef4444"/>

      {/* RL Sammler – unten */}
      <rect x="2" y="46" width="196" height="28" rx="4" fill="#dbeafe" stroke="#3b82f6" strokeWidth="2.5"/>
      <text x="100" y="64" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1d4ed8">RL Sammler</text>
      {BRANCH_X.map(x => <rect key={`rs${x}`} x={x-5} y="42" width="10" height="6" rx="2" fill="#3b82f6"/>)}
      <rect x="0" y="53" width="6" height="10" rx="2" fill="#3b82f6"/>
    </svg>
  );
}
