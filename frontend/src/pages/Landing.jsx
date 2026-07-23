import { createElement, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Calculator, ChartNoAxesCombined, CircuitBoard,
  Database, FileCheck2, Gauge, Layers3, ShieldCheck,
} from "lucide-react";
import "./Landing.css";

const CAPABILITIES = [
  {
    icon: CircuitBoard,
    number: "01",
    title: "Schema als Datenmodell",
    text: "Du zeichnest die Anlage. Verbindungen, Bauteile und Kennwerte bleiben als ein gemeinsames technisches Modell erhalten.",
  },
  {
    icon: Gauge,
    number: "02",
    title: "Hydraulik in Echtzeit",
    text: "Volumenstrom, Dimension, Druckverlust und Auslegung reagieren direkt auf die Anlage – ohne Medienbruch.",
  },
  {
    icon: ChartNoAxesCombined,
    number: "03",
    title: "Kosten mit Herkunft",
    text: "Referenzprojekte werden vergleichbar. Jede Zahl bleibt prüfbar, fehlende Daten werden sichtbar statt schöngerechnet.",
  },
  {
    icon: FileCheck2,
    number: "04",
    title: "Dokumentation aus dem Modell",
    text: "Schema, Berechnungen und technische Eigenschaften werden zu einer nachvollziehbaren Projektdokumentation.",
  },
];

const TICKER = [
  "HYDRAULIKSCHEMA",
  "LIVE-BERECHNUNG",
  "BKP-KOSTEN",
  "REFERENZPROJEKTE",
  "TECHNISCHE DOKUMENTATION",
];

function AnimatedSchema() {
  const [last, setLast] = useState(100);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const levels = [100, 76, 54, 88];
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % levels.length;
      setLast(levels[index]);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [auto]);

  const factor = last / 100;
  const leistung = (47 * factor).toFixed(1);
  const volumenstrom = (2.481 * factor).toFixed(3);
  const massenstrom = Math.round(2481 * factor).toLocaleString("de-CH");
  const ventilautoritaet = Math.round(42 + (100 - last) * .36);
  const ventilFarbe = ventilautoritaet >= 50 ? "#0f9f77" : ventilautoritaet >= 35 ? "#f59e0b" : "#ef4444";
  const gruppen = [
    { x: 640, name: "FUSSBODENHEIZUNG", q: 15, vl: 35, rl: 28, flow: .843, dn: 20, bypass: true },
    { x: 770, name: "HEIZKÖRPER", q: 12, vl: 50, rl: 40, flow: 1.032, dn: 25, bypass: true },
    { x: 900, name: "BWW", q: 20, vl: 65, rl: 55, flow: 1.720, dn: 40, bypass: false },
  ];

  return (
    <div className="landing-schema" aria-label="Animiertes Hydraulikschema mit Live-Berechnungen">
      <div className="landing-schema__topbar">
        <span><i /> HYDRAULIKMODELL AKTIV</span>
        <span>LASTFALL {last} %</span>
      </div>
      <svg viewBox="0 0 980 620" role="img" aria-labelledby="schema-title schema-desc">
        <title id="schema-title">Intelligentes Hydraulikschema</title>
        <desc id="schema-desc">Ein Erdsondenfeld, eine Wärmepumpe, ein Speicher und drei Verbrauchergruppen reagieren auf einen veränderbaren Lastfall.</desc>
        <defs>
          <filter id="landing-glow-red" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="landing-glow-blue" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="landing-card" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#f5f8ff" />
          </linearGradient>
          <linearGradient id="landing-heat" x1="0" x2="1">
            <stop offset="0" stopColor="#ff5f6d" />
            <stop offset="1" stopColor="#f04455" />
          </linearGradient>
          <linearGradient id="landing-cold" x1="0" x2="1">
            <stop offset="0" stopColor="#5b8cff" />
            <stop offset="1" stopColor="#3677ed" />
          </linearGradient>
        </defs>

        <g className="landing-schema__grid">
          {Array.from({ length: 20 }, (_, i) => <line key={`v-${i}`} x1={20 + i * 50} y1="0" x2={20 + i * 50} y2="620" />)}
          {Array.from({ length: 13 }, (_, i) => <line key={`h-${i}`} x1="0" y1={20 + i * 50} x2="980" y2={20 + i * 50} />)}
        </g>

        {/* Erdsondenfeld: fünf Duplexsonden, je zwei U-Rohre. */}
        <g className="landing-ews" transform="translate(18 332)">
          <text x="75" y="-12" textAnchor="middle">5 DUPLEX · 180 M</text>
          <rect x="2" y="0" width="146" height="42" rx="5" />
          <line x1="10" y1="13" x2="148" y2="13" className="landing-ews__vl" />
          <line x1="10" y1="31" x2="148" y2="31" className="landing-ews__rl" />
          {Array.from({ length: 5 }, (_, index) => {
            const x = 20 + index * 27;
            return (
              <g key={x}>
                <path d={`M${x - 4} 13 V58 H${x - 8} V142 Q${x - 8} 151 ${x - 3} 151 Q${x + 2} 151 ${x + 2} 142 V58 H${x - 4}`} className="landing-ews__probe" />
                <path d={`M${x + 5} 31 V63 H${x + 1} V142 Q${x + 1} 151 ${x + 6} 151 Q${x + 11} 151 ${x + 11} 142 V63 H${x + 5}`} className="landing-ews__probe landing-ews__probe--return" />
              </g>
            );
          })}
        </g>
        <path className="landing-system-line landing-system-line--sole" d="M166 345 H205 V395 H224" />
        <path className="landing-system-line landing-system-line--sole-return" d="M166 363 H190 V455 H224" />

        {/* Hauptsystem nach Dominics Schema. */}
        <path className="landing-system-line landing-system-line--red" d="M274 352 V136 H410 V326" />
        <path className="landing-system-line landing-system-line--red" d="M446 326 V250 H526 V95 H930" />
        <path className="landing-system-line landing-system-line--blue" d="M274 478 V548 H410 V480" />
        <path className="landing-system-line landing-system-line--blue" d="M446 480 H520 V558 H930" />
        <path className="landing-system-flow landing-system-flow--red" d="M274 352 V136 H410 V326 M446 326 V250 H526 V95 H930" />
        <path className="landing-system-flow landing-system-flow--blue" d="M274 478 V548 H410 V480 M446 480 H520 V558 H930" />

        <g className="landing-component landing-component--source" transform="translate(224 352)">
          <rect width="100" height="126" rx="5" fill="url(#landing-card)" />
          <rect x="1" y="1" width="98" height="124" rx="4" className="landing-component__border" />
          <rect x="9" y="10" width="28" height="104" />
          <line x1="9" y1="10" x2="37" y2="114" />
          <rect x="63" y="10" width="28" height="104" />
          <line x1="91" y1="10" x2="63" y2="114" />
          <circle cx="50" cy="34" r="15" />
          <path d="M38 41 Q45 37 48 35 M52 32 Q56 30 62 27 M38 27 Q45 31 48 33 M52 36 Q56 39 62 41" />
          <path d="M37 101 L50 108 L37 115 Z M63 101 L50 108 L63 115 Z" />
          <text x="22" y="23">V</text><text x="78" y="23">K</text>
        </g>

        <g className="landing-component landing-component--storage" transform="translate(390 326)">
          <path className="landing-component__body" d="M20 22 A38 18 0 0 1 76 22 V154 A38 18 0 0 1 20 154 Z" fill="url(#landing-card)" />
          <path d="M20 22 A38 18 0 0 1 76 22 V154 A38 18 0 0 1 20 154 Z" className="landing-component__border" />
          <line x1="20" y1="22" x2="76" y2="22" />
          <text x="48" y="80" textAnchor="middle">1'200 L</text>
          <text x="48" y="98" textAnchor="middle" className="landing-component__sub">PUFFERSPEICHER</text>
        </g>

        {/* Hauptpumpe zwischen Speicher und Verteiler. */}
        <g className="landing-pump" transform="translate(526 220)">
          <circle r="18" />
          <line x1="-18" y1="0" x2="18" y2="0" />
          <polygon points="-18,0 18,0 0,-18" />
        </g>

        {/* Verteilerbalken und drei Gruppen aus der gelieferten Vorlage. */}
        <rect x="560" y="79" width="370" height="32" rx="5" className="landing-manifold landing-manifold--red" />
        <text x="578" y="100" className="landing-manifold__text">VL 65.0 °C · Σ {leistung} kW · {volumenstrom} m³/h</text>
        <rect x="560" y="542" width="370" height="32" rx="5" className="landing-manifold landing-manifold--blue" />
        <text x="578" y="563" className="landing-manifold__text">RL 43.7 °C · {volumenstrom} m³/h</text>

        {gruppen.map((gruppe, index) => {
          const flow = (gruppe.flow * factor).toFixed(3);
          return (
            <g key={gruppe.name} className={`landing-group consumer-${index}`}>
              <path className="landing-system-line landing-system-line--red landing-system-line--branch" d={`M${gruppe.x} 111 V210`} />
              <path className="landing-system-line landing-system-line--blue landing-system-line--branch" d={`M${gruppe.x} 455 V542`} />
              <path className="landing-system-flow landing-system-flow--red" d={`M${gruppe.x} 111 V210`} />
              <path className="landing-system-flow landing-system-flow--blue" d={`M${gruppe.x} 455 V542`} />
              {gruppe.bypass && <path className="landing-bypass" d={`M${gruppe.x} 220 H${gruppe.x - 46} V438 H${gruppe.x}`} />}
              <g className="landing-shutoff" transform={`translate(${gruppe.x} 178)`}>
                <polygon points="-8,-9 8,-9 0,0" /><polygon points="-8,9 8,9 0,0" />
              </g>
              {index < 2 && (
                <g className="landing-pump" transform={`translate(${gruppe.x} 220)`}>
                  <circle r="15" /><line x1="-15" y1="0" x2="15" y2="0" /><polygon points="-15,0 15,0 0,15" />
                </g>
              )}
              <rect x={gruppe.x - 27} y="258" width="54" height="142" rx="3" className="landing-consumer" />
              <text transform={`translate(${gruppe.x - 8} 329) rotate(-90)`} textAnchor="middle" className="landing-consumer__title">{gruppe.name}</text>
              <text transform={`translate(${gruppe.x + 8} 329) rotate(-90)`} textAnchor="middle" className="landing-consumer__value">
                {(gruppe.q * factor).toFixed(1)} kW · {gruppe.vl}/{gruppe.rl} °C
              </text>
              <g className="landing-shutoff" transform={`translate(${gruppe.x} 425)`}>
                <polygon points="-8,-9 8,-9 0,0" /><polygon points="-8,9 8,9 0,0" />
              </g>
              <text x={gruppe.x} y="148" textAnchor="middle" className="landing-pipe-label">DN{gruppe.dn} · {Math.round(flow * 1000).toLocaleString("de-CH")} kg/h</text>
            </g>
          );
        })}

        {/* Das intelligente Ventil liegt wie gewünscht im gemeinsamen Rücklauf. */}
        <g className="landing-smart-valve" transform="translate(520 532)" style={{ "--valve-color": ventilFarbe }}>
          <polygon points="-9,-10 9,-10 0,0" /><polygon points="-9,10 9,10 0,0" />
          <circle r="2.5" />
          <rect x="-31" y="-8" width="15" height="16" rx="3" />
          <line x1="-16" y1="0" x2="-9" y2="0" />
        </g>

        <g className="landing-data-card landing-data-card--one" transform="translate(330 58)">
          <rect width="184" height="64" rx="12" />
          <text x="15" y="22">HAUPTVOLUMENSTROM</text>
          <text x="15" y="46">{massenstrom} kg/h</text>
          <circle cx="163" cy="32" r="7" />
        </g>
        <g className="landing-data-card landing-data-card--two" transform="translate(388 495)">
          <rect width="170" height="62" rx="12" />
          <text x="14" y="21">VENTILAUTORITÄT</text>
          <text x="14" y="45" style={{ fill: ventilFarbe }}>{ventilautoritaet} %</text>
          <text x="118" y="45" className="landing-data-card__minor">Hub {last} %</text>
        </g>
      </svg>
      <div className="landing-schema__scan" />
      <label className="landing-schema__control">
        <span>ANLAGENLEISTUNG</span>
        <input type="range" min="35" max="100" value={last}
          onPointerDown={()=>setAuto(false)}
          onChange={event=>setLast(Number(event.target.value))} />
        <strong>{leistung} kW</strong>
      </label>
      <div className="landing-schema__status">
        <span><i /> Hydraulik live berechnet</span>
        <span>Ventilautorität {ventilautoritaet} %</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const pageRef = useRef(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.14 });
    root.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const moveLight = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
    event.currentTarget.style.setProperty("--parallax-x", `${((event.clientX - rect.left) / rect.width - .5) * 18}px`);
    event.currentTarget.style.setProperty("--parallax-y", `${((event.clientY - rect.top) / rect.height - .5) * 14}px`);
  };

  return (
    <main ref={pageRef} className="landing-page" onPointerMove={moveLight}>
      <div className="landing-ambient" aria-hidden="true">
        <div className="landing-ambient__grid" />
        <div className="landing-ambient__light" />
        <div className="landing-ambient__orb landing-ambient__orb--one" />
        <div className="landing-ambient__orb landing-ambient__orb--two" />
      </div>

      <nav className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="SIREGO Heizungscockpit">
          <span className="landing-brand__mark"><i /><i /><i /></span>
          <span>SIREGO</span>
          <small>ENGINEERING SYSTEMS</small>
        </Link>
        <div className="landing-nav__links">
          <a href="#plattform">Plattform</a>
          <a href="#workflow">Workflow</a>
          <Link to="/login" className="landing-nav__login">Anmelden <ArrowRight size={15} /></Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="landing-kicker landing-enter landing-enter--one">
            <span /> Engineering wird intelligent
          </div>
          <h1 className="landing-enter landing-enter--two">
            Planen.<br />
            Rechnen.<br />
            <span>Beweisen.</span>
          </h1>
          <p className="landing-enter landing-enter--three">
            Eine technische Plattform, in der das Anlagenschema nicht nur gezeichnet wird.
            Es versteht Zusammenhänge, berechnet Hydraulik und dokumentiert Entscheidungen.
          </p>
          <div className="landing-hero__actions landing-enter landing-enter--four">
            <Link to="/login" className="landing-button landing-button--primary">
              Zugang öffnen <ArrowRight size={17} />
            </Link>
            <a href="#plattform" className="landing-button landing-button--ghost">
              Plattform entdecken
            </a>
          </div>
          <div className="landing-proof landing-enter landing-enter--five">
            <span><ShieldCheck size={15} /> Mandantengetrennt</span>
            <span><Database size={15} /> Nachvollziehbare Daten</span>
            <span><Layers3 size={15} /> Ein Modell</span>
          </div>
        </div>

        <div className="landing-hero__visual landing-enter landing-enter--visual">
          <div className="landing-hero__halo" />
          <AnimatedSchema />
        </div>

        <a href="#plattform" className="landing-scroll" aria-label="Weiter zur Plattform">
          <span>SCROLL</span><i />
        </a>
      </section>

      <div className="landing-ticker" aria-hidden="true">
        <div className="landing-ticker__track">
          {[...TICKER, ...TICKER].map((item, index) => (
            <span key={`${item}-${index}`}>{item}<i /></span>
          ))}
        </div>
      </div>

      <section id="plattform" className="landing-section landing-capabilities">
        <div className="landing-section__heading" data-reveal>
          <div>
            <span className="landing-section__number">01 / PLATTFORM</span>
            <h2>Ein System.<br />Keine losen Inseln.</h2>
          </div>
          <p>
            Planung, Berechnung, Kostenwissen und Dokumentation greifen ineinander.
            Änderungen bleiben sichtbar und Ergebnisse bleiben erklärbar.
          </p>
        </div>

        <div className="landing-capabilities__grid">
          {CAPABILITIES.map(({ icon: Icon, number, title, text }, index) => (
            <article key={title} className="landing-capability" data-reveal style={{ "--reveal-delay": `${index * 90}ms` }}>
              <div className="landing-capability__top">
                <span>{number}</span>
                {createElement(Icon, { size: 24, strokeWidth: 1.6 })}
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
              <div className="landing-capability__line"><i /></div>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="landing-section landing-workflow">
        <div className="landing-workflow__visual" data-reveal>
          <div className="landing-workflow__rings" aria-hidden="true"><i /><i /><i /></div>
          <div className="landing-workflow__core">
            <CircuitBoard size={34} strokeWidth={1.35} />
            <span>PROJEKTMODELL</span>
            <strong>Single Source<br />of Truth</strong>
          </div>
          {[
            ["SCHEMA", "Geometrie + Verbindungen"],
            ["PHYSIK", "Auslegung + Plausibilität"],
            ["KOSTEN", "Referenzen + Bandbreite"],
            ["EXPORT", "Plan + Nachweise"],
          ].map(([title, text], index) => (
            <div key={title} className={`landing-orbit-card orbit-${index + 1}`}>
              <span>{title}</span><small>{text}</small>
            </div>
          ))}
        </div>

        <div className="landing-workflow__copy" data-reveal>
          <span className="landing-section__number">02 / WORKFLOW</span>
          <h2>Die Berechnung lebt dort, wo sie gebraucht wird.</h2>
          <p>
            Eine Pumpe kennt ihren Volumenstrom. Eine Leitung kennt Dimension und Druckverlust.
            Eine Kostenzahl kennt ihre Referenzen. Du wechselst nicht zwischen Tabellen,
            Zeichnung und Dokumentation – das Projektmodell verbindet sie.
          </p>
          <div className="landing-workflow__facts">
            <div><Calculator size={18} /><span><strong>Live</strong> berechnet</span></div>
            <div><Database size={18} /><span><strong>Sauber</strong> versioniert</span></div>
            <div><FileCheck2 size={18} /><span><strong>Direkt</strong> dokumentiert</span></div>
          </div>
        </div>
      </section>

      <section className="landing-cta" data-reveal>
        <div className="landing-cta__glow" aria-hidden="true" />
        <span className="landing-section__number">SIREGO ENGINEERING SYSTEMS</span>
        <h2>Gebäudetechnik.<br /><em>Neu verdrahtet.</em></h2>
        <p>Die Plattform befindet sich im kontrollierten Aufbau. Zugang erfolgt aktuell auf Anfrage.</p>
        <Link to="/login" className="landing-button landing-button--light">
          Zugang anfragen <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="landing-footer">
        <span>SIREGO GmbH</span>
        <span>Heizungscockpit · 2026</span>
        <Link to="/login">Login</Link>
      </footer>
    </main>
  );
}
