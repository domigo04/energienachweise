// SIA 410 Hydraulik-Symbole

// Kreis (weiss) + Durchmesserlinie + gefülltes Dreieck (Flussrichtung nach
// unten). Ohne Motor-Kasten (Dominic-Feedback: brauchen wir nicht).
export function SymPump() {
  return (
    <svg viewBox="0 0 44 44" width="40" height="40">
      <circle cx="22" cy="22" r="18" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <line x1="4" y1="22" x2="40" y2="22" stroke="#1e293b" strokeWidth="2" />
      <polygon points="4,22 40,22 22,38" fill="#1e293b" />
    </svg>
  );
}

// ── 2-Wege Regelventil (Vorlage «2-Weg Ventil.svg») ───────────
// Doppeldreieck (senkrecht) + schwarzer Knoten + oranger Antriebs-
// kasten (Σ) links. Flussachse senkrecht durch x=104 (Fraction 0.75).
export function SymValve2V() {
  return (
    <svg viewBox="8 6 128 116" width="44" height="40">
      <rect x="15" y="40" width="50" height="50" fill="#ffd34d" stroke="#ff9f00" strokeWidth="3" strokeLinejoin="round" />
      <path d="M29 54 H50 L37 65 L50 76 H29" fill="none" stroke="#ff9f00" strokeWidth="3" strokeLinejoin="round" />
      <line x1="65" y1="65" x2="90" y2="65" stroke="#ff9f00" strokeWidth="4" strokeLinecap="round" />
      <polygon points="79,14 130,14 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <polygon points="79,116 130,116 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="104" cy="65" r="12" fill="#000" />
    </svg>
  );
}

// ── 3-Wege Mischventil (Vorlage «3-Weg-Ventil.svg») ───────────
// wie 2-Weg + dritter Anschluss rechts + X im Antriebskasten.
// Flussachse senkrecht durch x=104 (Fraction ~0.63), 3. Tor rechts.
export function SymValve3() {
  return (
    <svg viewBox="8 6 152 116" width="52" height="40">
      <rect x="15" y="40" width="50" height="50" fill="#ffd34d" stroke="#ff9f00" strokeWidth="3" strokeLinejoin="round" />
      <path d="M15 40 L65 90" stroke="#ff9f00" strokeWidth="3" />
      <path d="M65 40 L15 90" stroke="#ff9f00" strokeWidth="3" />
      <path d="M29 54 H50 L37 65 L50 76 H29" fill="none" stroke="#ff9f00" strokeWidth="3" strokeLinejoin="round" />
      <line x1="65" y1="65" x2="90" y2="65" stroke="#ff9f00" strokeWidth="4" strokeLinecap="round" />
      <polygon points="79,14 130,14 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <polygon points="79,116 130,116 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <polygon points="116,65 156,41 156,89" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="104" cy="65" r="12" fill="#000" />
    </svg>
  );
}

// ── STAD-Strangregulierventil (Vorlage «STAD.svg») ────────────
// Sanduhr zwischen zwei Balken + Messkreis + Pfeil nach oben.
export function SymSTAD() {
  return (
    <svg viewBox="0 0 60 135" width="18" height="41">
      <g fill="none" stroke="#1e293b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="11" x2="50" y2="11" />
        <path d="M12 11 L50 105" />
        <path d="M50 11 L12 105" />
        <line x1="12" y1="105" x2="50" y2="105" />
        <circle cx="31" cy="91" r="6" />
        <path d="M18 125 L31 112 L44 125" />
        <line x1="31" y1="112" x2="31" y2="133" />
      </g>
    </svg>
  );
}

// ── Temperaturfühler (Vorlage «Temperaturanzeige.svg») ────────
// Kreis + Diagonalpfeil + T. (Blaue RL-Leitung zeichnet der Strang selbst.)
export function SymTemperatur() {
  return (
    <svg viewBox="10 6 90 66" width="52" height="38">
      <g fill="none" stroke="#1e293b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="38" cy="36" r="12" />
        <line x1="18" y1="56" x2="56" y2="18" />
        <polygon points="56,18 48,20 54,26" fill="#1e293b" stroke="none" />
      </g>
      <text x="60" y="51" fontFamily="Arial, sans-serif" fontSize="18" fill="#1e293b">T</text>
    </svg>
  );
}

// ── Sicherheitsventil (Vorlage «Sicherheitsventil.svg») ───────
// Ventil-Dreiecke + Feder oben + rote Anbindung + brauner Kontakt rechts unten.
// Anschluss unten (rote Linie x=24).
export function SymSicherheitsventil() {
  return (
    <svg viewBox="0 0 199 167" width="80" height="67">
      <g fill="none" stroke="#ff0000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="24" y1="102" x2="104" y2="102" />
        <line x1="104" y1="102" x2="104" y2="47" />
        <line x1="104" y1="47" x2="168" y2="47" />
        <line x1="168" y1="47" x2="168" y2="77" />
      </g>
      <circle cx="24" cy="102" r="8" fill="#ff0000" stroke="#000" strokeWidth="2" />
      <path d="M98 14 L111 18 L98 22 L111 26 L98 30 L111 34 L104 39" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M104 47 L136 31 L136 63 Z" fill="#fff" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
      <path d="M88 79 L120 79 L104 47 Z" fill="#fff" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="104" cy="47" r="9" fill="#000" />
      <g fill="none" stroke="#8b4a12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M143 151 L143 102" />
        <path d="M143 102 L155 102" />
        <path d="M155 102 L155 119" />
        <path d="M155 119 L168 119" />
        <path d="M168 119 L168 102" />
        <path d="M168 102 L178 88" />
        <path d="M168 102 L159 88" />
      </g>
    </svg>
  );
}

// ── Plattenwärmetauscher PWT (Vorlage «PWT.svg») ──────────────
// Raute mit innerer Trennlinie + parallele Kontur, +/− und EIN/AUS.
export function SymPWT() {
  return (
    <svg viewBox="0 0 472 342" width="94" height="68">
      <g fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M205 48 L356 191 L205 334 L54 191 Z" />
        <line x1="205" y1="48" x2="205" y2="334" />
      </g>
      <g fontFamily="Arial, sans-serif" fontSize="34" fill="#000">
        <text x="164" y="135">+</text>
        <text x="220" y="135">−</text>
      </g>
      <g fontFamily="Arial, sans-serif" fontSize="34" fill="#000">
        <text x="8" y="98">EIN</text>
        <text x="350" y="98">AUS</text>
        <text x="6" y="302">AUS</text>
        <text x="352" y="302">EIN</text>
      </g>
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

// Absperrventil / Kugelhahn (Vorlage «Kugelhahn.svg») — gleiches Stellglied
// wie die Regelventile (Doppeldreieck + grosser schwarzer Knoten), aber ohne
// Antriebskasten. Flussachse senkrecht durch x=104 (mittig).
export function SymShutoff() {
  return (
    <svg viewBox="78 10 52 112" width="19" height="41">
      <polygon points="79,14 130,14 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <polygon points="79,116 130,116 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="104" cy="65" r="13" fill="#000" />
    </svg>
  );
}

export function SymWE() {
  // Grösser (Dominic-Feedback); VL-Anschluss oben, RL unten
  return (
    <svg viewBox="0 0 88 68" width="88" height="68">
      <rect x="2" y="2" width="84" height="64" rx="4" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      <text x="44" y="41" textAnchor="middle" fontSize="17" fontWeight="700" fill="#1e293b">WP</text>
      <rect x="36" y="0" width="16" height="5" rx="2" fill="#ef4444" />
      <rect x="36" y="63" width="16" height="5" rx="2" fill="#3b82f6" />
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
      <text x="28" y="54" textAnchor="middle" fontSize="13" fontWeight="700" fill="#dc2626">TS</text>
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
