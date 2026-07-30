// Fachsymbole in Icon-Grösse für Listen und Kacheln.
//
// Dieselbe Bildsprache wie im Schema-Editor (`components/hc/nodes/symbols.jsx`),
// aber auf das Nötigste reduziert: keine Beschriftung, keine Füllung, Strich in
// `currentColor`. Dadurch verhalten sie sich wie die lucide-Icons daneben und
// erben Farbe und Grösse aus der Umgebung.
const basis = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

// Plattenwärmetauscher: Quadrat auf der Ecke, senkrechter Strich als System-
// trennung, links Plus und rechts Minus für die beiden Seiten — wie `SymPWT`.
export function IconWaermetauscher({ className }) {
  return (
    <svg {...basis} className={className}>
      <path d="M12 2.8 20.2 12 12 21.2 3.8 12Z" />
      <path d="M12 2.8v18.4" />
      <path d="M6.6 12h2.6M7.9 10.7v2.6" />
      <path d="M14.8 12h2.6" />
    </svg>
  );
}

// Technischer Speicher: stehender Behälter mit gewölbtem Boden und Deckel,
// wie `SymSpeicher` — nur ohne Literangabe und Fühler.
export function IconSpeicher({ className }) {
  return (
    <svg {...basis} className={className}>
      <ellipse cx="12" cy="6.2" rx="6.8" ry="2.6" />
      <path d="M5.2 6.2v11.6a6.8 2.6 0 0 0 13.6 0V6.2" />
    </svg>
  );
}

// Verdichter: Kreis mit zwei gegenläufigen Kennlinien und sichtbarer Trennung
// in der Mitte — das Kompressorsymbol aus `SymWaermepumpe`.
export function IconKompressor({ className }) {
  return (
    <svg {...basis} className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M6.4 15.6q3-1.9 4.5-2.9" />
      <path d="M13.1 11.3q1.5-1 4.5-2.9" />
      <path d="M6.4 8.4q3 1.9 4.5 2.9" />
      <path d="M13.1 12.7q1.5 1 4.5 2.9" />
    </svg>
  );
}
