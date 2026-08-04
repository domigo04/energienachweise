import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Calculator, CheckCircle2,
  Clock3, Coins, Database, FileCheck2, FileText,
  Maximize2, Network, RefreshCw, Sparkles, TrendingUp, Users,
} from "lucide-react";
import logo from "../../png/logo.png";
import excelChaos from "../../assets/pitchdeck/excel-chaos.png";
import connectedSystem from "../../assets/pitchdeck/connected-system.png";
import pilotSchema from "../../assets/pitchdeck/pilot-schema.png";
import { normaliseSlide, PITCH_SLIDES } from "./pitchDeckContent";
import "./PitchDeck.css";

const CALCULATIONS = [
  "Rohrdimension", "Druckverlust", "Pumpe", "Ventilautorität", "Speicher", "Expansion",
];

function AccentTitle({ before, accent, after = "" }) {
  return <h1 className="pitch-title">{before}<span>{accent}</span>{after}</h1>;
}

function SlideContent({ index }) {
  switch (index) {
    case 0:
      return (
        <div className="pitch-hero pitch-hero--image">
          <div className="pitch-hero__copy">
            <div className="pitch-kicker">Fachplanung neu verbunden</div>
            <AccentTitle before="Heizungs" accent="cockpit" />
            <p className="pitch-lead">Ein Schema. Alle Berechnungen.<br />Ein lebender Projektstand.</p>
            <div className="pitch-hero__promise"><Sparkles /> Ändern – neu rechnen – sicher weiterplanen.</div>
          </div>
          <img src={connectedSystem} alt="Vernetztes Heizsystem mit Berechnungsebene" />
        </div>
      );
    case 1:
      return (
        <div className="pitch-photo-slide">
          <img src={excelChaos} alt="Planer zwischen getrennten Schema- und Berechnungsdateien" />
          <div className="pitch-photo-slide__shade" />
          <div className="pitch-photo-slide__copy">
            <div className="pitch-kicker">Die Situation kennen wir alle</div>
            <AccentTitle before="Eine Änderung. " accent="Fünf Excel neu." />
            <p className="pitch-lead pitch-lead--small">Expansion dort. Druckverlust hier. Ventilberechnung irgendwo dazwischen.</p>
          </div>
          <div className="pitch-change-chip"><RefreshCw /> Und wenn sich die Leistung ändert?</div>
        </div>
      );
    case 2:
      return (
        <>
          <AccentTitle before="Planung " accent="heute" />
          <p className="pitch-subtitle">Ein Projekt – mehrere Werkzeuge – mehrere Wahrheiten</p>
          <div className="pitch-islands">
            <div><FileText /><b>CAD</b><span>Schema</span></div>
            <i>↯</i>
            <div><Calculator /><b>Excel</b><span>{CALCULATIONS.length} Berechnungen</span></div>
            <i>↯</i>
            <div><FileCheck2 /><b>PDF</b><span>Momentaufnahme</span></div>
          </div>
          <div className="pitch-calculation-tags">
            {CALCULATIONS.map((item) => <span key={item}>{item}</span>)}
          </div>
          <p className="pitch-bottom-line">Jede Änderung muss von Hand durch jede Datei getragen werden – oder sie wird vergessen.</p>
        </>
      );
    case 3:
      return (
        <div className="pitch-two-col">
          <div>
            <AccentTitle before="Der Fehler liegt " accent="dazwischen" />
            <ul className="pitch-list">
              <li>Werte werden mehrfach eingetragen</li>
              <li>Formeln bleiben in Einzeldateien verborgen</li>
              <li>Schema und Berechnung laufen auseinander</li>
              <li>Kontrolle kostet mehr Zeit als die Berechnung</li>
            </ul>
          </div>
          <div className="pitch-fragment-card" aria-label="Getrennte Projektstände">
            {[["Schema", "V7"], ["Druckverlust", "final_2"], ["Ventile", "neu"], ["Export", "V6"]].map(([name, state]) => (
              <div key={name}><span>{name}</span><b>{state}</b></div>
            ))}
            <strong><AlertTriangle /> Welcher Stand gilt?</strong>
          </div>
        </div>
      );
    case 4:
      return (
        <>
          <AccentTitle before="Ein System, das " accent="mitdenkt" />
          <p className="pitch-subtitle">Das Schema wird zum technischen Datenmodell.</p>
          <div className="pitch-solution-core">
            <div><Network /><span>01</span><b>Einmal eingeben</b><p>Grunddaten entstehen dort, wo sie fachlich hingehören.</p></div>
            <div><RefreshCw /><span>02</span><b>Automatisch reagieren</b><p>Abhängige Berechnungen werden neu bewertet.</p></div>
            <div><FileCheck2 /><span>03</span><b>Geprüft ausgeben</b><p>Warnungen und fehlende Grundlagen bleiben sichtbar.</p></div>
          </div>
        </>
      );
    case 5:
      return (
        <div className="pitch-magic">
          <img src={connectedSystem} alt="Heizsystem mit vernetzter Berechnungsebene" />
          <div className="pitch-magic__shade" />
          <div className="pitch-magic__copy">
            <div className="pitch-kicker">Das Zielbild</div>
            <AccentTitle before="Eine Änderung. " accent="Das System reagiert." />
            <p>Leistung → Volumenstrom → Rohr → Druckverlust → Pumpe → Ventil → Speicher → Export</p>
          </div>
          <div className="pitch-ripple"><i /><i /><i /></div>
        </div>
      );
    case 6:
      return (
        <div className="pitch-pilot-layout">
          <div>
            <AccentTitle before="Pilot " accent="V1" />
            <p className="pitch-subtitle">Ein realer Systemtyp – durchgängig verbunden</p>
            <ul className="pitch-list pitch-list--checks">
              <li>Wärmepumpe mit Heiz- und Quellenkreis</li>
              <li>Speicher, Verteiler und Verbrauchergruppen</li>
              <li>Pumpen, Ventile, Erdsonden und Expansion</li>
              <li>Berechnung, Warnung, Revision und Export</li>
            </ul>
          </div>
          <div className="pitch-schema-frame">
            <img src={pilotSchema} alt="Reales Hydraulikschema aus dem Heizungscockpit" />
            <div className="pitch-load-slider">
              <span>Gesamtleistung</span><i><em /></i><b>45 kW</b>
            </div>
          </div>
        </div>
      );
    case 7:
      return (
        <>
          <AccentTitle before="Nachvollziehbar, " accent="nicht Blackbox" />
          <div className="pitch-proof-grid">
            {[
              ["Formel", "Jeder Rechenweg bleibt sichtbar"],
              ["Herkunft", "Automatisch oder manuell erkennbar"],
              ["Warnung", "Fehlende Grundlagen statt stiller Annahmen"],
              ["Revision", "Freigegebene Stände bleiben unverändert"],
            ].map(([title, text], i) => <div key={title}><span>0{i + 1}</span><b>{title}</b><p>{text}</p></div>)}
          </div>
        </>
      );
    case 8:
      return (
        <>
          <AccentTitle before="LV wird " accent="Firmenwissen" />
          <p className="pitch-subtitle">Historische Unternehmerangebote werden zur eigenen, erklärbaren Referenzbasis.</p>
          <div className="pitch-lv-flow">
            {[
              ["01", "PDF / DEVIS"], ["02", "KI-Import"], ["03", "Fachprüfung"],
              ["04", "Referenzprojekt"], ["05", "Kostenindikation"],
            ].map(([n, t]) => <div key={n}><span>{n}</span><b>{t}</b></div>)}
          </div>
          <div className="pitch-lv-payoff"><Database /><span>Jedes geprüfte Projekt macht die nächste Schätzung schneller und belastbarer.</span></div>
        </>
      );
    case 9:
      return (
        <div className="pitch-value-layout">
          <div>
            <div className="pitch-kicker">Beispielrechnung · im Pilot zu validieren</div>
            <AccentTitle before="Mehr als " accent="Zeit sparen" />
            <div className="pitch-value-total"><span>Potenzielle Planungskapazität</span><b>CHF 102'400</b><small>pro Büro und Jahr</small></div>
          </div>
          <div className="pitch-value-stack">
            <div><Clock3 /><span>Schneller zeichnen</span><b>CHF 32'000</b><small>5 h × 40 Schemas</small></div>
            <div><RefreshCw /><span>Weniger Nachführung</span><b>CHF 51'200</b><small>8 h × 40 Schemas</small></div>
            <div><Coins /><span>Schneller schätzen</span><b>CHF 19'200</b><small>6 h × 20 Schätzungen</small></div>
            <p>Modellannahme: CHF 160 produktiver Stundenwert. Keine garantierte Einsparung.</p>
          </div>
        </div>
      );
    case 10:
      return (
        <div className="pitch-snapshot-layout">
          <div>
            <AccentTitle before="Jeder Export ist ein " accent="belastbarer Stand" />
            <p className="pitch-lead pitch-lead--small">Der Export friert den aktuell ausgelegten und berechneten Projektstand ein.</p>
          </div>
          <div className="pitch-snapshot-card">
            <div className="pitch-snapshot-card__head"><FileCheck2 /><span>Projektstand · Revision 07</span><b>bereit</b></div>
            {[
              ["Schema", "aktuell"], ["Berechnungsversion", "gespeichert"],
              ["Eingaben & Resultate", "enthalten"], ["Fehlende Grundlagen", "sichtbar"],
              ["Bearbeiter & Zeitpunkt", "protokolliert"],
            ].map(([name, state]) => <div className="pitch-snapshot-row" key={name}><CheckCircle2 /><span>{name}</span><b>{state}</b></div>)}
          </div>
        </div>
      );
    case 11:
      return (
        <>
          <AccentTitle before="Vom Produkt zum " accent="Beweis" />
          <p className="pitch-subtitle">Nicht die nächste Funktion entscheidet – sondern das bestandene Gate.</p>
          <div className="pitch-roadmap">
            {[
              ["AUG", "Kern schliessen", "Schema, BWW, Rechenkern"],
              ["SEP", "Vertrauen", "Golden Cases, Datenverlust, Export"],
              ["OKT", "Pilot starten", "3 Büros · 6 reale Projekte"],
              ["DANACH", "Wiederholbar", "ROI belegen · Core skalieren"],
            ].map(([n, title, text]) => <div key={n}><span>{n}</span><b>{title}</b><p>{text}</p></div>)}
          </div>
          <div className="pitch-roadmap-goal"><TrendingUp /> Ziel bis 25. Oktober 2026: Fremde Planer bearbeiten echte Projekte ohne direkte Reparatur durch SIREGO.</div>
        </>
      );
    case 12:
      return (
        <div className="pitch-two-col pitch-two-col--balanced">
          <div>
            <AccentTitle before="Geschäfts" accent="modell" />
            <p className="pitch-lead pitch-lead--small">Core schafft sofort Nutzen.<br />Firmenwissen wächst danach.</p>
          </div>
          <div className="pitch-pricing">
            <div className="is-primary"><span>Betreuter Pilot · 3 Monate</span><b>CHF 5'000</b><small>bis 5 Nutzer · Einführung · direkter Support</small></div>
            <div><span>Core · danach pro Büro/Jahr</span><b>CHF 4'000–6'000</b><small>Schema · Berechnungen · Revision · Export</small></div>
            <div><span>Add-on · nach Datengate</span><b>LV & Kostenintelligenz</b><small>eigenes Kontingent · eigene Wertlogik</small></div>
          </div>
        </div>
      );
    case 13:
      return (
        <div className="pitch-two-col">
          <div>
            <AccentTitle before="Design " accent="Partner" />
            <p className="pitch-subtitle">Gesucht: Planungsbüros, die mit echten Projekten messen – nicht nur testen.</p>
            <ul className="pitch-list pitch-list--checks">
              <li>2–15 Heizungsplaner</li>
              <li>Regelmässige Prinzipschemata</li>
              <li>Zwei passende Wärmepumpenprojekte</li>
              <li>Zeit, Korrekturen und Qualität erfassen</li>
            </ul>
          </div>
          <div className="pitch-pilot-card">
            <Users /><b>3 Büros</b><span>6 reale Projekte</span><hr />
            <strong>Der echte Beweis:</strong><p>Mindestens zwei Büros starten freiwillig das zweite Projekt.</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="pitch-thanks">
          <div className="pitch-kicker">Heizungsplanung als zusammenhängendes System</div>
          <AccentTitle before="Ein Projekt. " accent="Ein lebender Stand." />
          <p className="pitch-lead">Schneller zeichnen. Änderungen sicher nachführen.<br />Aus jedem Projekt mehr wissen.</p>
          <div className="pitch-cta"><ArrowRight /> Pilotprojekt gemeinsam auswählen</div>
        </div>
      );
  }
}

export default function PitchDeck() {
  const { slideId } = useParams();
  const navigate = useNavigate();
  const index = normaliseSlide(slideId);
  const slide = PITCH_SLIDES[index];

  const go = useCallback((next) => {
    navigate(`/admin/pitchdeck/${normaliseSlide(next)}`);
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (["ArrowRight", "PageDown", " "].includes(event.key) && index < PITCH_SLIDES.length - 1) {
        event.preventDefault(); go(index + 1);
      } else if (["ArrowLeft", "PageUp"].includes(event.key) && index > 0) {
        event.preventDefault(); go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(PITCH_SLIDES.length - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, index]);

  const fullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <main className="pitch-deck">
      <div className="pitch-brand"><img src={logo} alt="" /><span>Heizungscockpit</span></div>
      <article key={index} className={`pitch-slide pitch-slide--${index}`} aria-labelledby="pitch-slide-title">
        <div className="pitch-eyebrow">{slide.eyebrow}</div>
        <div id="pitch-slide-title" className="sr-only">{slide.label}</div>
        <SlideContent index={index} />
      </article>

      <div className="pitch-caption">Folie {index + 1} von {PITCH_SLIDES.length} · {slide.label}</div>
      <nav className="pitch-navigation" aria-label="Pitchdeck-Navigation">
        <div className="pitch-dots">
          {PITCH_SLIDES.map((item) => (
            <button type="button" key={item.id} className={item.id === index ? "is-active" : ""}
              onClick={() => go(item.id)} aria-label={`Folie ${item.id + 1}: ${item.label}`}
              aria-current={item.id === index ? "page" : undefined} />
          ))}
        </div>
        <div className="pitch-controls">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Folie"><ArrowLeft /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === PITCH_SLIDES.length - 1} aria-label="Nächste Folie"><ArrowRight /></button>
          <button type="button" onClick={fullscreen} aria-label="Vollbild öffnen"><Maximize2 /></button>
        </div>
      </nav>
    </main>
  );
}
