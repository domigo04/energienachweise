// SIA 410 Hydraulik-Symbole

// Kreis (weiss) + Durchmesserlinie + gefülltes Dreieck (Flussrichtung nach
// unten). Ohne Motor-Kasten (Dominic-Feedback: brauchen wir nicht).
export function SymPump() {
  return (
    <svg viewBox="0 0 44 44" width="24" height="24">
      <line x1="22" y1="0" x2="22" y2="4" stroke="#1e293b" strokeWidth="1.6" />
      <line x1="22" y1="40" x2="22" y2="44" stroke="#1e293b" strokeWidth="1.6" />
      <circle cx="22" cy="22" r="18" fill="white" stroke="#1e293b" strokeWidth="1.6" />
      <line x1="4" y1="22" x2="40" y2="22" stroke="#1e293b" strokeWidth="1.4" />
      <polygon points="4,22 40,22 22,38" fill="#1e293b" />
    </svg>
  );
}

// ── 2-Wege Regelventil (Vorlage «2-Weg Ventil.svg») ───────────
// Doppeldreieck (senkrecht) + schwarzer Knoten + oranger Antriebs-
// kasten (Σ) links. Die hydraulische Flussachse liegt exakt in der Mitte.
export function SymValve2V() {
  return (
    <svg viewBox="0 0 100 100" width="34" height="24">
      <line x1="50" y1="0" x2="50" y2="8" stroke="#1e293b" strokeWidth="2.6" />
      <line x1="50" y1="92" x2="50" y2="100" stroke="#1e293b" strokeWidth="2.6" />
      <rect x="4" y="36" width="26" height="28" fill="#ffd34d" stroke="#ff9f00" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M10 43 H23 L15 50 L23 57 H10" fill="none" stroke="#ff9f00" strokeWidth="2.4" strokeLinejoin="round" />
      <line x1="30" y1="50" x2="39" y2="50" stroke="#ff9f00" strokeWidth="2.4" strokeLinecap="round" />
      <polygon points="36,8 64,8 50,50" fill="white" stroke="#1e293b" strokeWidth="2.4" strokeLinejoin="round" />
      <polygon points="36,92 64,92 50,50" fill="white" stroke="#1e293b" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="6" fill="#1e293b" />
    </svg>
  );
}

// ── 3-Wege Mischventil (Vorlage «3-Weg-Ventil.svg») ───────────
// wie 2-Weg + dritter Anschluss rechts + X im Antriebskasten.
// Die Hauptachse liegt mittig, das dritte Tor exakt rechts.
export function SymValve3() {
  return (
    <svg viewBox="0 0 100 100" width="38" height="24">
      <line x1="50" y1="0" x2="50" y2="8" stroke="#1e293b" strokeWidth="2.6" />
      <line x1="50" y1="92" x2="50" y2="100" stroke="#1e293b" strokeWidth="2.6" />
      <line x1="92" y1="50" x2="100" y2="50" stroke="#1e293b" strokeWidth="2.6" />
      <rect x="4" y="36" width="26" height="28" fill="#ffd34d" stroke="#ff9f00" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M4 36 L30 64 M30 36 L4 64" stroke="#ff9f00" strokeWidth="2" />
      <line x1="30" y1="50" x2="39" y2="50" stroke="#ff9f00" strokeWidth="2.4" strokeLinecap="round" />
      <polygon points="36,8 64,8 50,50" fill="white" stroke="#1e293b" strokeWidth="2.4" strokeLinejoin="round" />
      <polygon points="36,92 64,92 50,50" fill="white" stroke="#1e293b" strokeWidth="2.4" strokeLinejoin="round" />
      <polygon points="50,50 92,34 92,66" fill="white" stroke="#1e293b" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="6" fill="#1e293b" />
    </svg>
  );
}

// ── STAD-Strangregulierventil (Vorlage «STAD.svg») ────────────
// Sanduhr zwischen zwei Balken + Messkreis + Pfeil nach oben.
export function SymSTAD() {
  return (
    <svg viewBox="0 0 60 135" width="12" height="28">
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
    <svg viewBox="10 6 90 66" width="26" height="19">
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
    <svg viewBox="0 0 199 167" width="40" height="34">
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
    <svg viewBox="0 0 472 342" width="47" height="34">
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
    <svg viewBox="0 0 44 80" width="16" height="28">
      <line x1="22" y1="0" x2="22" y2="16" stroke="#1e293b" strokeWidth="2.4" />
      <polygon points="10,16 34,16 22,43" fill="white" stroke="#1e293b" strokeWidth="2.4" strokeLinejoin="round" />
      <line x1="8" y1="43" x2="36" y2="43" stroke="#1e293b" strokeWidth="2.8" />
      <line x1="22" y1="43" x2="22" y2="80" stroke="#1e293b" strokeWidth="2.4" />
    </svg>
  );
}

// Absperrventil / Kugelhahn (Vorlage «Kugelhahn.svg») — gleiches Stellglied
// wie die Regelventile (Doppeldreieck + grosser schwarzer Knoten), aber ohne
// Antriebskasten. Flussachse senkrecht durch x=104 (mittig).
export function SymShutoff() {
  return (
    <svg viewBox="78 6 52 118" width="14" height="28">
      <line x1="104" y1="6" x2="104" y2="14" stroke="#1e293b" strokeWidth="3" />
      <polygon points="79,14 130,14 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <polygon points="79,116 130,116 104,65" fill="white" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="104" cy="65" r="13" fill="#000" />
      <line x1="104" y1="116" x2="104" y2="124" stroke="#1e293b" strokeWidth="3" />
    </svg>
  );
}

const generatorAria = {
  ews_wp: 'Sole/Wasser-Wärmepumpe',
  lwwp: 'Luft/Wasser-Wärmepumpe mit Aussenluft und Fortluft',
  wasser_wp: 'Wasser/Wasser-Wärmepumpe',
  co2_wp: 'CO₂-Wärmepumpe',
  fernwaerme: 'Fernwärmeübergabe',
  gas: 'Gaskessel',
  oel: 'Ölkessel',
  holz: 'Holz- oder Pelletkessel',
  elektro: 'Elektroheizung',
  hybrid: 'Hybrid-Wärmeerzeuger',
  sonstige: 'Wärmeerzeuger',
};

function SymLuftWasserWP({ bauart }) {
  if (bauart !== 'split') return <SymWaermepumpe generatorType="lwwp"/>;
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img"
      aria-label={generatorAria.lwwp}>
      <rect x="8" y="30" width="78" height="142" fill="#e5e7eb" stroke="#111827" strokeWidth="3"/>
      <rect x="114" y="30" width="78" height="142" fill="#e5e7eb" stroke="#111827" strokeWidth="3"/>
      <circle cx="47" cy="77" r="23" fill="white" stroke="#111827" strokeWidth="2"/>
      <path d="M47 55 L53 74 L71 77 L53 82 L47 101 L42 82 L24 77 L42 72 Z"
        fill="#bae6fd" stroke="#111827" strokeWidth="1.4"/>
      <path d="M86 101 H114" fill="none" stroke="#f97316" strokeWidth="3" strokeDasharray="7 5"/>
      <text x="47" y="137" textAnchor="middle" fontSize="11" fontWeight="700">VERFL.</text>
      <text x="153" y="90" textAnchor="middle" fontSize="11" fontWeight="700">VERD.</text>
      <text x="153" y="110" textAnchor="middle" fontSize="10">INNEN</text>
      <text x="100" y="202" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700">L/W-WP SPLIT</text>
    </svg>
  );
}

function SymWaermepumpe({ generatorType }) {
  const code = {
    ews_wp:'S/W-WP',
    lwwp:'L/W-WP',
    wasser_wp:'W/W-WP',
    co2_wp:'CO₂-WP',
  }[generatorType] || 'WP';
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img"
      aria-label={generatorAria[generatorType] || 'Wärmepumpe'}>
      <g fill="none" stroke="#111827" strokeWidth="2.5" strokeLinejoin="round">
        <rect x="8" y="8" width="184" height="204" fill="#e5e7eb" strokeWidth="3" />

        <rect x="20" y="20" width="60" height="180" fill="#f3f4f6" />
        <line x1="20" y1="20" x2="80" y2="200" />
        <rect x="120" y="20" width="60" height="180" fill="#f3f4f6" />
        <line x1="180" y1="20" x2="120" y2="200" />

        {/* Verdichter: zwei gegenläufige Kennlinien mit sichtbarer Trennung. */}
        <circle cx="100" cy="55" r="26" fill="#e5e7eb" />
        <path d="M80 68 Q91 61 96.5 57.5" strokeLinecap="round" />
        <path d="M103.5 52.5 Q109 49 120 42" strokeLinecap="round" />
        <path d="M80 42 Q91 49 96.5 52.5" strokeLinecap="round" />
        <path d="M103.5 57.5 Q109 61 120 68" strokeLinecap="round" />

        {/* Kleiner und tiefer als in der Rohvorlage, damit das Symbol Luft hat. */}
        <path d="M78 184 L100 195 L78 206 Z" fill="#f9fafb" />
        <path d="M122 184 L100 195 L122 206 Z" fill="#f9fafb" />
      </g>
      <g fontFamily="Arial, sans-serif" fontSize="16" fontWeight="700" fill="#111827">
        <text x="32" y="38">V</text>
        <text x="148" y="38">K</text>
        <text x="100" y="164" textAnchor="middle">{code}</text>
      </g>
    </svg>
  );
}

function SymKessel({ generatorType }) {
  if (generatorType === 'holz') {
    return (
      <svg viewBox="0 0 200 220" width="104" height="114" role="img"
        aria-label={generatorAria.holz}>
        <rect x="8" y="8" width="184" height="204" fill="white" stroke="#111827" strokeWidth="3"/>
        {/* SIA-Kennzeichen Holz: ausgefülltes Quadrat unten mittig. */}
        <rect x="84" y="164" width="32" height="32" fill="#111827"/>
      </svg>
    );
  }
  const fuel = { gas:'GAS', oel:'ÖL', holz:'HOLZ' }[generatorType] || 'KESSEL';
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img"
      aria-label={generatorAria[generatorType]}>
      <rect x="22" y="14" width="156" height="192" rx="8" fill="#fff7ed" stroke="#111827" strokeWidth="3"/>
      <rect x="39" y="32" width="122" height="34" rx="3" fill="#f8fafc" stroke="#111827" strokeWidth="2"/>
      <text x="100" y="55" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="700" fill="#111827">{fuel}</text>
      <path d="M101 177 C67 164 65 134 89 111 C88 130 101 130 107 103 C135 127 143 158 119 177 C114 160 101 151 92 164 C90 170 94 175 101 177Z"
        fill="#fb923c" stroke="#9a3412" strokeWidth="2.5"/>
    </svg>
  );
}

function SymFernwaerme() {
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img" aria-label={generatorAria.fernwaerme}>
      <rect x="12" y="12" width="176" height="196" rx="4" fill="#f8fafc" stroke="#111827" strokeWidth="3"/>
      <path d="M100 42 L155 103 L100 164 L45 103 Z" fill="white" stroke="#111827" strokeWidth="3"/>
      <path d="M100 42 V164" stroke="#111827" strokeWidth="2.5"/>
      <text x="71" y="99" textAnchor="middle" fontSize="18" fontWeight="700" fill="#dc2626">+</text>
      <text x="129" y="99" textAnchor="middle" fontSize="18" fontWeight="700" fill="#2563eb">−</text>
      <text x="100" y="191" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700" fill="#111827">FERNWÄRME</text>
    </svg>
  );
}

function SymElektro() {
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img" aria-label={generatorAria.elektro}>
      <rect x="22" y="14" width="156" height="192" rx="8" fill="#fefce8" stroke="#111827" strokeWidth="3"/>
      <path d="M111 37 L67 118 H99 L87 183 L139 91 H106 Z" fill="#facc15" stroke="#854d0e" strokeWidth="3" strokeLinejoin="round"/>
      <text x="100" y="196" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700" fill="#111827">ELEKTRO</text>
    </svg>
  );
}

function SymHybrid() {
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img" aria-label={generatorAria.hybrid}>
      <rect x="10" y="12" width="180" height="196" rx="6" fill="#f8fafc" stroke="#111827" strokeWidth="3"/>
      <line x1="100" y1="27" x2="100" y2="180" stroke="#64748b" strokeWidth="2" strokeDasharray="7 5"/>
      <circle cx="57" cy="87" r="30" fill="#e0f2fe" stroke="#111827" strokeWidth="2.5"/>
      <path d="M36 99 Q50 88 55 84 M60 80 Q67 74 78 66 M36 66 Q50 77 55 81 M60 85 Q67 91 78 99"
        fill="none" stroke="#111827" strokeWidth="2"/>
      <path d="M144 129 C119 116 122 91 139 76 C138 91 149 90 153 67 C176 90 177 117 160 129 C157 113 144 107 137 118 C137 123 139 127 144 129Z"
        fill="#fb923c" stroke="#9a3412" strokeWidth="2.3"/>
      <text x="100" y="195" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700" fill="#111827">HYBRID</text>
    </svg>
  );
}

function SymGenerisch() {
  return (
    <svg viewBox="0 0 200 220" width="104" height="114" role="img" aria-label={generatorAria.sonstige}>
      <rect x="15" y="15" width="170" height="190" rx="7" fill="#f8fafc" stroke="#111827" strokeWidth="3"/>
      <circle cx="100" cy="91" r="41" fill="white" stroke="#64748b" strokeWidth="2.5"/>
      <text x="100" y="101" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="27" fontWeight="700" fill="#334155">WE</text>
      <text x="100" y="181" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700" fill="#64748b">ERZEUGER</text>
    </svg>
  );
}

export function SymWE({ generatorType, lwwpBauart }) {
  if (generatorType === 'lwwp') return <SymLuftWasserWP bauart={lwwpBauart}/>;
  if (['ews_wp', 'wasser_wp', 'co2_wp'].includes(generatorType)) {
    return <SymWaermepumpe generatorType={generatorType}/>;
  }
  if (generatorType === 'fernwaerme') return <SymFernwaerme/>;
  if (['gas', 'oel', 'holz'].includes(generatorType)) return <SymKessel generatorType={generatorType}/>;
  if (generatorType === 'elektro') return <SymElektro/>;
  if (generatorType === 'hybrid') return <SymHybrid/>;
  // Bestandsschemas ohne strukturierten Typ behalten das bisherige WP-Symbol.
  if (!generatorType) return <SymWaermepumpe generatorType="ews_wp"/>;
  return <SymGenerisch/>;
}

export function SymVerbraucher() {
  return (
    <svg viewBox="0 0 64 46" width="64" height="46">
      <rect x="2" y="2" width="60" height="42" rx="3" fill="#fff7ed" stroke="#f97316" strokeWidth="1.8" />
      <path d="M10,23 L20,13 L30,23 L40,13 L50,23" fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function SymSpeicher({ liter }) {
  const wert = Number(liter);
  const literText = Number.isFinite(wert) && wert > 0
    ? `${Math.round(wert).toLocaleString('de-CH')} L`
    : '… L';
  return (
    <svg viewBox="0 0 140 290" width="72" height="149" role="img" aria-label={`Speicher ${literText}`}>
      {/* Behälter ohne Anschlussleitungen; die Ports kommen aus React Flow. */}
      <path d="M65 4 L75 14 M75 4 L65 14" fill="none" stroke="#111827" strokeWidth="2" />
      <path d="M20 45 A50 25 0 0 1 120 45 L120 245 A50 25 0 0 1 20 245 Z"
        fill="#e5e7eb" stroke="#111827" strokeWidth="3" />
      <line x1="20" y1="45" x2="120" y2="45" stroke="#111827" strokeWidth="3" />

      <text x="70" y="78" textAnchor="middle" fontSize="16" fontWeight="700"
        fontFamily="Arial, sans-serif" fill="#111827">{literText}</text>

      {/* Temperaturfühler oben und unten. */}
      <g fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(65 116)">
          <circle r="7" />
          <path d="M-13 13 L14 -14 M14 -14 L7 -12 M14 -14 L12 -7" />
        </g>
        <g transform="translate(65 196)">
          <circle r="7" />
          <path d="M-13 13 L14 -14 M14 -14 L7 -12 M14 -14 L12 -7" />
        </g>
      </g>
    </svg>
  );
}

export function SymBwwSpeicher({ liter }) {
  const wert = Number(liter);
  const literText = Number.isFinite(wert) && wert > 0
    ? `${Math.round(wert).toLocaleString('de-CH')} L`
    : '… L';
  return (
    <svg viewBox="0 0 140 290" width="72" height="149" role="img" aria-label={`BWW-Speicher ${literText}`}>
      <path d="M65 4 L75 14 M75 4 L65 14" fill="none" stroke="#111827" strokeWidth="2" />
      <path d="M20 45 A50 25 0 0 1 120 45 L120 245 A50 25 0 0 1 20 245 Z"
        fill="#e5e7eb" stroke="#111827" strokeWidth="3" />
      <line x1="20" y1="45" x2="120" y2="45" stroke="#111827" strokeWidth="3" />
      <text x="70" y="78" textAnchor="middle" fontSize="16" fontWeight="700">{literText}</text>
      <text x="70" y="151" textAnchor="middle" fontSize="15" fontWeight="700">BWW</text>
      <g fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(65 116)"><circle r="7" /><path d="M-13 13 L14 -14 M14 -14 L7 -12 M14 -14 L12 -7" /></g>
        <g transform="translate(65 196)"><circle r="7" /><path d="M-13 13 L14 -14 M14 -14 L7 -12 M14 -14 L12 -7" /></g>
      </g>
      {/* Trinkwarmwasser oben rot; Trinkkaltwasser unten grün gestrichelt. */}
      <path d="M70 45 V2 M65 9 L70 2 L75 9" fill="none" stroke="#ef4444" strokeWidth="3" />
      <path d="M70 245 V288 M65 281 L70 288 L75 281" fill="none" stroke="#16a34a"
        strokeWidth="3" strokeDasharray="7 5" />
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
