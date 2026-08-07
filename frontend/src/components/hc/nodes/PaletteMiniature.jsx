import {
  SymBwwSpeicher, SymCheckValve, SymLufterhitzer, SymLuftheizapparat,
  SymPWT, SymPump, SymShutoff, SymSpeicher, SymSTAD, SymSicherheitsventil,
  SymTemperatur, SymValve2V, SymValve3, SymVerteiler, SymWaermezaehlerCad, SymWE,
} from './symbols';

const Svg = ({ children, viewBox = '0 0 64 48' }) => (
  <svg viewBox={viewBox} aria-hidden="true">{children}</svg>
);

const Heizkoerper = () => <Svg>
  <rect x="5" y="8" width="54" height="32" rx="2" fill="#ecfdf5" stroke="#15803d" strokeWidth="2" />
  {[14, 23, 32, 41, 50].map(x => <line key={x} x1={x} y1="11" x2={x} y2="37" stroke="#22c55e" strokeWidth="2" />)}
</Svg>;

const Erdsonden = () => <Svg>
  <path d="M7 9 H57 M12 16 H52" stroke="#ca8a04" strokeWidth="3" />
  {[16, 32, 48].map(x => <path key={x} d={`M${x} 16 V39 l-5 -7 M${x} 39 l5 -7`} fill="none" stroke="#334155" strokeWidth="2" />)}
</Svg>;

const Expansion = () => <Svg>
  <path d="M22 5 Q32 0 42 5 V38 Q32 44 22 38 Z" fill="#e5e7eb" stroke="#1e293b" strokeWidth="2" />
  <path d="M22 23 H42 M32 42 V48" stroke="#1e293b" strokeWidth="2" />
</Svg>;

const Waermezaehler = () => <Svg>
  <line x1="32" y1="0" x2="32" y2="10" stroke="#1e293b" strokeWidth="2" />
  <circle cx="32" cy="24" r="14" fill="white" stroke="#0f766e" strokeWidth="2" />
  <text x="32" y="28" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f766e">WZ</text>
  <line x1="32" y1="38" x2="32" y2="48" stroke="#1e293b" strokeWidth="2" />
</Svg>;

const Anschluss = () => <Svg>
  <circle cx="12" cy="24" r="9" fill="white" stroke="#1e293b" strokeWidth="2" />
  <text x="12" y="28" textAnchor="middle" fontSize="10" fontWeight="700">A</text>
  <path d="M24 15 H57 l-7 -5 M57 15 l-7 5" fill="none" stroke="#ef4444" strokeWidth="2.5" />
  <path d="M57 33 H24 l7 -5 M24 33 l7 5" fill="none" stroke="#3b82f6" strokeWidth="2.5" />
</Svg>;

const Gruppe = ({ register = false }) => <Svg>
  <line x1="32" y1="2" x2="32" y2="46" stroke="#ef4444" strokeWidth="2" />
  <circle cx="32" cy="13" r="7" fill="white" stroke="#1e293b" strokeWidth="2" />
  <path d="M25 13 H39 L32 19 Z" fill="#1e293b" />
  {register
    ? <g><rect x="19" y="27" width="26" height="13" fill="white" stroke="#1e293b" strokeWidth="2"/><path d="M20 28 L44 39 M44 28 L20 39" stroke="#1e293b" /></g>
    : <g><path d="M22 27 L32 35 L42 27" fill="none" stroke="#1e293b" strokeWidth="2"/><circle cx="32" cy="35" r="3" fill="#1e293b"/></g>}
</Svg>;

const Annotation = ({ type }) => <Svg>
  {type === 'label' && <text x="8" y="32" fontSize="24" fontWeight="700" fill="#334155">Aa</text>}
  {type === 'concrete_area' && <g stroke="#64748b" strokeWidth="1.5">
    <rect x="5" y="5" width="54" height="38" fill="#f8fafc" />
    {[0, 16, 32, 48, 64].map(x => <path key={x} d={`M${x} 5 L${x - 28} 43 M${x} 43 L${x + 28} 5`} />)}
  </g>}
  {type === 'interface_line' && <g><path d="M5 24 H59" stroke="#111827" strokeWidth="3"/><text x="32" y="17" textAnchor="middle" fontSize="8">SYSTEMGRENZE</text></g>}
</Svg>;

const MINIATUREN = {
  erzeuger: item => <SymWE generatorType={item?.preset?.generator_type} lwwpBauart={item?.preset?.lwwp_bauart} />,
  erdsonden: () => <Erdsonden />,
  pwt: () => <SymPWT />,
  speicher: () => <SymSpeicher liter={800} />,
  bww: () => <SymBwwSpeicher liter={500} />,
  verteiler: () => <SymVerteiler />,
  gruppe: () => <Gruppe />,
  heizkoerper: () => <Heizkoerper />,
  luftheizapparat: () => <SymLuftheizapparat />,
  lufterhitzer: () => <SymLufterhitzer />,
  lufterhitzer_gruppe: () => <Gruppe register />,
  pump: () => <SymPump />,
  valve2: () => <SymValve2V />,
  valve3: () => <SymValve3 />,
  shutoff: () => <SymShutoff />,
  stad: () => <SymSTAD />,
  checkvalve: () => <SymCheckValve />,
  expansion: () => <Expansion />,
  sicherheitsventil: () => <SymSicherheitsventil />,
  waermezaehler: () => <Waermezaehler />,
  waermezaehler_cad: () => <SymWaermezaehlerCad />,
  temperatur: () => <SymTemperatur />,
  anschluss: () => <Anschluss />,
  label: () => <Annotation type="label" />,
  concrete_area: () => <Annotation type="concrete_area" />,
  interface_line: () => <Annotation type="interface_line" />,
};

export const PALETTE_MINIATUR_TYPEN = Object.freeze(Object.keys(MINIATUREN));

export function BauteilMiniatur({ item }) {
  const render = MINIATUREN[item?.type];
  return (
    <span className="hc-palette-miniature" aria-hidden="true">
      {render ? render(item) : <Svg><rect x="8" y="8" width="48" height="32" fill="white" stroke="#64748b" strokeWidth="2" /></Svg>}
    </span>
  );
}
