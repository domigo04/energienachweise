import { createElement, useEffect, useRef } from "react";
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
  return (
    <div className="landing-schema" aria-label="Animiertes Hydraulikschema mit Live-Berechnungen">
      <div className="landing-schema__topbar">
        <span><i /> LIVE MODEL</span>
        <span>SCHEMA 01</span>
      </div>
      <svg viewBox="0 0 760 590" role="img" aria-labelledby="schema-title schema-desc">
        <title id="schema-title">Intelligentes Hydraulikschema</title>
        <desc id="schema-desc">Eine Wärmepumpe, ein Speicher und mehrere Verbraucher sind über animierte Vor- und Rücklaufleitungen verbunden.</desc>
        <defs>
          <filter id="landing-glow-red" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="landing-glow-blue" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="landing-card" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#182235" />
            <stop offset="1" stopColor="#0c1321" />
          </linearGradient>
        </defs>

        <g className="landing-schema__grid">
          {Array.from({ length: 15 }, (_, i) => <line key={`v-${i}`} x1={20 + i * 52} y1="0" x2={20 + i * 52} y2="590" />)}
          {Array.from({ length: 12 }, (_, i) => <line key={`h-${i}`} x1="0" y1={20 + i * 52} x2="760" y2={20 + i * 52} />)}
        </g>

        <path className="landing-pipe landing-pipe--red" d="M150 372 V168 H326 V110 H650" />
        <path className="landing-pipe landing-pipe--blue" d="M150 446 V514 H650 V455" />
        <path className="landing-pipe landing-pipe--red landing-pipe--branch" d="M430 110 V208" />
        <path className="landing-pipe landing-pipe--blue landing-pipe--branch" d="M430 385 V514" />
        <path className="landing-pipe landing-pipe--red landing-pipe--branch delay-one" d="M555 110 V208" />
        <path className="landing-pipe landing-pipe--blue landing-pipe--branch delay-one" d="M555 385 V514" />
        <path className="landing-pipe landing-pipe--red landing-pipe--branch delay-two" d="M650 110 V208" />
        <path className="landing-pipe landing-pipe--blue landing-pipe--branch delay-two" d="M650 385 V455" />

        <g className="landing-component landing-component--source" transform="translate(73 350)">
          <rect width="154" height="116" rx="16" fill="url(#landing-card)" />
          <rect x="1" y="1" width="152" height="114" rx="15" className="landing-component__border" />
          <circle cx="77" cy="38" r="20" />
          <path d="M62 47 Q72 40 75 37 M79 34 Q83 31 92 27 M62 28 Q71 33 75 36 M79 39 Q84 42 92 48" />
          <text x="77" y="82" textAnchor="middle">WÄRMEPUMPE</text>
          <text x="77" y="99" textAnchor="middle" className="landing-component__sub">62.0 kW</text>
        </g>

        <g className="landing-component landing-component--storage" transform="translate(295 222)">
          <path className="landing-component__body" d="M24 34 A54 25 0 0 1 132 34 V212 A54 25 0 0 1 24 212 Z" fill="url(#landing-card)" />
          <path d="M24 34 A54 25 0 0 1 132 34 V212 A54 25 0 0 1 24 212 Z" className="landing-component__border" />
          <line x1="24" y1="34" x2="132" y2="34" />
          <text x="78" y="112" textAnchor="middle">SPEICHER</text>
          <text x="78" y="132" textAnchor="middle" className="landing-component__sub">1'200 L</text>
        </g>

        {[430, 555, 650].map((x, index) => (
          <g key={x} className={`landing-component landing-component--consumer consumer-${index}`} transform={`translate(${x - 42} 220)`}>
            <rect width="84" height="164" rx="13" fill="url(#landing-card)" />
            <rect x="1" y="1" width="82" height="162" rx="12" className="landing-component__border" />
            <circle cx="42" cy="34" r="12" />
            <path d="M32 38 L42 28 L52 38" />
            <text x="42" y="78" textAnchor="middle">KREIS {index + 1}</text>
            <text x="42" y="99" textAnchor="middle" className="landing-component__sub">{[18, 26, 12][index]} kW</text>
            <text x="42" y="126" textAnchor="middle" className="landing-component__value">DN{[40, 50, 32][index]}</text>
            <text x="42" y="144" textAnchor="middle" className="landing-component__sub">{[35, 55, 40][index]} / {[28, 40, 32][index]} °C</text>
          </g>
        ))}

        <g className="landing-data-card landing-data-card--one" transform="translate(84 95)">
          <rect width="188" height="70" rx="12" />
          <text x="16" y="25">VOLUMENSTROM</text>
          <text x="16" y="51">7'740 kg/h</text>
          <circle cx="166" cy="35" r="7" />
        </g>
        <g className="landing-data-card landing-data-card--two" transform="translate(490 418)">
          <rect width="178" height="66" rx="12" />
          <text x="15" y="24">DRUCKVERLUST</text>
          <text x="15" y="49">18.4 kPa</text>
          <path d="M143 46 L151 33 L159 38 L167 20" />
        </g>
      </svg>
      <div className="landing-schema__scan" />
      <div className="landing-schema__status">
        <span><i /> Berechnung aktuell</span>
        <span>0 Konflikte</span>
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
