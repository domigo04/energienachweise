import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CircleGauge, Database, FileCheck2,
  FileText, Maximize2, Network, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import logo from "../../png/logo.png";
import { normaliseSlide, PITCH_SLIDES } from "./pitchDeckContent";
import "./PitchDeck.css";

const FLOW = ["Verbraucher", "Rücklauf", "Wärmepumpe", "Quelle", "Erdsonden", "Speicher"];

function AccentTitle({ before, accent, after = "" }) {
  return <h1 className="pitch-title">{before}<span>{accent}</span>{after}</h1>;
}

function Flow() {
  return (
    <div className="pitch-flow">
      {FLOW.map((item, index) => (
        <div className="pitch-flow__part" key={item}>
          <div className="pitch-flow__node">{item}</div>
          {index < FLOW.length - 1 && <ArrowRight aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

function SlideContent({ index }) {
  switch (index) {
    case 0:
      return (
        <div className="pitch-hero">
          <div>
            <div className="pitch-kicker">Fachplanung neu verbunden</div>
            <AccentTitle before="Heizungs" accent="cockpit" />
            <p className="pitch-lead">Ein Schema. Alle Berechnungen.<br />Ein prüfbarer Projektstand.</p>
          </div>
          <div className="pitch-hero__mark" aria-hidden="true">
            <span className="pitch-hero__ring" />
            <Network />
            <span>Schema → Berechnung → Export</span>
          </div>
        </div>
      );
    case 1:
      return (
        <>
          <AccentTitle before="Planung " accent="heute" />
          <p className="pitch-subtitle">Ein Projekt – mehrere Wahrheiten</p>
          <div className="pitch-islands">
            <div><FileText /><b>CAD</b><span>Schema</span></div>
            <i>↯</i>
            <div><CircleGauge /><b>Excel</b><span>Berechnungen</span></div>
            <i>↯</i>
            <div><FileCheck2 /><b>PDF</b><span>Abgabe</span></div>
          </div>
          <p className="pitch-bottom-line">Jede Änderung muss von Hand durch alle Stände getragen werden.</p>
        </>
      );
    case 2:
      return (
        <div className="pitch-two-col">
          <div>
            <AccentTitle before="Der Fehler liegt " accent="dazwischen" />
            <ul className="pitch-list">
              <li>Werte werden mehrfach eingetragen</li>
              <li>Formeln bleiben in Einzeldateien verborgen</li>
              <li>Änderungen erzeugen widersprüchliche Stände</li>
              <li>Kontrolle kostet mehr Zeit als die Berechnung</li>
            </ul>
          </div>
          <div className="pitch-fragment-card" aria-label="Getrennte Projektstände">
            {[["Schema", "V7"], ["Berechnung", "final_2"], ["Export", "neu"]].map(([name, state]) => (
              <div key={name}><span>{name}</span><b>{state}</b></div>
            ))}
            <strong>Welcher Stand gilt?</strong>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="pitch-two-col pitch-two-col--balanced">
          <div>
            <AccentTitle before="Für " accent="Fachplaner" />
            <p className="pitch-lead pitch-lead--small">Das Cockpit ersetzt keine Heizungsplanung. Es macht sie konsistent.</p>
            <div className="pitch-quote">„Der Planer entscheidet.<br />Das System hält alles zusammen.“</div>
          </div>
          <div className="pitch-audience">
            <Users />
            <h2>Kleine und mittlere Planungsbüros</h2>
            <p>Gebäudetechnikplaner · Projektleiter<br />ausführende Heizungsunternehmen</p>
          </div>
        </div>
      );
    case 4:
      return (
        <>
          <AccentTitle before="die " accent="Lösung" />
          <div className="pitch-solution-core">
            <div><Network /><b>1 intelligentes Schema</b></div>
            <div><Database /><b>1 fachliche Wahrheit</b></div>
            <div><FileCheck2 /><b>1 prüfbarer Export</b></div>
          </div>
          <p className="pitch-bottom-line">Eine Eingabe wird dort gepflegt, wo sie entsteht – und überall weiterverwendet.</p>
        </>
      );
    case 5:
      return (
        <>
          <div className="pitch-kicker">Zielbild des unterstützten Systems</div>
          <AccentTitle before="Die " accent="Magic" />
          <Flow />
          <div className="pitch-magic-note"><Sparkles /> Eine Änderung aktualisiert die gesamte fachliche Kette.</div>
        </>
      );
    case 6:
      return (
        <div className="pitch-two-col">
          <div>
            <AccentTitle before="Pilot " accent="V1" />
            <p className="pitch-subtitle">Ein Systemtyp – vollständig gedacht</p>
            <ul className="pitch-list pitch-list--checks">
              <li>Wärmepumpen mit Heiz- und Quellenkreis</li>
              <li>2–8 Verbrauchergruppen und Verteiler</li>
              <li>Pumpen, Ventile und Mischtemperaturen</li>
              <li>Erdsonden, technischer Speicher und Expansion</li>
              <li>BWW als nächstes Schliessungs-Gate</li>
            </ul>
          </div>
          <div className="pitch-system-visual">
            <div className="pitch-system-visual__source">EWS</div>
            <div className="pitch-system-visual__wp">WP</div>
            <div className="pitch-system-visual__store">SP</div>
            <div className="pitch-system-visual__groups"><i /><i /><i /></div>
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
              ["Warnung", "Grenzen statt stiller Annahmen"],
              ["Revision", "Freigegebene Stände bleiben unverändert"],
            ].map(([title, text], i) => <div key={title}><span>0{i + 1}</span><b>{title}</b><p>{text}</p></div>)}
          </div>
        </>
      );
    case 8:
      return (
        <>
          <AccentTitle before="LV wird " accent="Wissen" />
          <p className="pitch-subtitle">Historische Unternehmerangebote werden zur eigenen Referenzbasis.</p>
          <div className="pitch-lv-flow">
            {[
              ["01", "PDF / DEVIS"], ["02", "Import"], ["03", "Fachprüfung"],
              ["04", "Referenz"], ["05", "Kostenindikation"],
            ].map(([n, t]) => <div key={n}><span>{n}</span><b>{t}</b></div>)}
          </div>
          <p className="pitch-coffee">Import läuft? Zeit für einen kurzen Kaffee.</p>
        </>
      );
    case 9:
      return (
        <div className="pitch-two-col">
          <div>
            <AccentTitle before="Der " accent="Nutzen" />
            <ul className="pitch-list">
              <li>Weniger manuelle Übertragungen</li>
              <li>Änderungen werden sofort sichtbar</li>
              <li>Rechenwege statt Ergebnisboxen</li>
              <li>Wiederverwendbare Firmenvorlagen</li>
              <li>Ein Export aus dem freigegebenen Stand</li>
            </ul>
          </div>
          <div className="pitch-value-bars">
            <div><b>Planen</b><i style={{ "--value": "82%" }} /></div>
            <div><b>Kontrollieren</b><i style={{ "--value": "68%" }} /></div>
            <div><b>Ändern</b><i style={{ "--value": "92%" }} /></div>
            <small>Zielgrössen – im Pilot mit realen Projekten messen</small>
          </div>
        </div>
      );
    case 10:
      return (
        <>
          <AccentTitle before="Produktstand " accent="heute" />
          <div className="pitch-status">
            {[
              ["Berechnungskern", "stark", 82],
              ["Schema-Workflow", "fortgeschritten", 68],
              ["Fachvalidierung", "offenes Gate", 42],
              ["Betrieb & Sicherheit", "offenes Gate", 38],
            ].map(([name, state, value]) => (
              <div key={name}><b>{name}</b><span>{state}</span><i><em style={{ width: `${value}%` }} /></i></div>
            ))}
          </div>
          <p className="pitch-honest"><ShieldCheck /> Heute demonstrierbar. Nach den Gates bereit für echte Pilotdaten.</p>
        </>
      );
    case 11:
      return (
        <>
          <AccentTitle before="Road" accent="map" />
          <p className="pitch-subtitle">Nicht das Datum entscheidet – sondern das bestandene Gate.</p>
          <div className="pitch-roadmap">
            {[
              ["01", "Kreislauf", "WP + BWW schliessen"],
              ["02", "Validierung", "Golden Cases prüfen"],
              ["03", "Vertrauen", "E2E, Backup, Security"],
              ["04", "Pilot", "Reale Projekte messen"],
            ].map(([n, title, text]) => <div key={n}><span>{n}</span><b>{title}</b><p>{text}</p></div>)}
          </div>
        </>
      );
    case 12:
      return (
        <div className="pitch-two-col pitch-two-col--balanced">
          <div>
            <AccentTitle before="Geschäfts" accent="modell" />
            <p className="pitch-lead pitch-lead--small">Zuerst betreut.<br />Dann wiederholbar.</p>
          </div>
          <div className="pitch-pricing">
            <div><span>Pilot · 3 Monate</span><b>CHF 3'500–5'000</b><small>bis 5 Nutzer · Einführung · direkter Support</small></div>
            <div><span>Danach · pro Büro/Jahr</span><b>CHF 4'000–6'000</b><small>Core-Lizenz · zwei gleichzeitige Nutzer</small></div>
            <div><span>Optional</span><b>LV- & Kostenmodul</b><small>nach Daten- und Freigabegate</small></div>
          </div>
        </div>
      );
    case 13:
      return (
        <div className="pitch-two-col">
          <div>
            <AccentTitle before="Design " accent="Partner" />
            <p className="pitch-subtitle">Gesucht: Planungsbüros, die mit echten Projekten testen.</p>
            <ul className="pitch-list pitch-list--checks">
              <li>2–15 Heizungsplaner</li>
              <li>Regelmässige Prinzipschemata</li>
              <li>Zwei passende Wärmepumpenprojekte</li>
              <li>Wöchentliches strukturiertes Feedback</li>
            </ul>
          </div>
          <div className="pitch-pilot-card">
            <Users />
            <b>3 Büros</b>
            <span>6 reale Projekte</span>
            <hr />
            <strong>Ein Ziel:</strong>
            <p>Der zweite Projektstart erfolgt freiwillig.</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="pitch-thanks">
          <div className="pitch-kicker">Heizungsplanung als zusammenhängendes System</div>
          <AccentTitle before="Gemeinsam " accent="testen" />
          <p className="pitch-lead">Ein passendes Wärmepumpenprojekt.<br />Ein ehrlicher Pilot. Ein messbares Ergebnis.</p>
          <div className="pitch-cta"><ArrowRight /> Pilotgespräch starten</div>
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
      <article className="pitch-slide" aria-labelledby="pitch-slide-title">
        <div className="pitch-eyebrow">{slide.eyebrow}</div>
        <div id="pitch-slide-title" className="sr-only">{slide.label}</div>
        <SlideContent index={index} />
      </article>

      <div className="pitch-caption">Folie {index + 1} von {PITCH_SLIDES.length} · {slide.label}</div>
      <nav className="pitch-navigation" aria-label="Pitchdeck-Navigation">
        <div className="pitch-dots">
          {PITCH_SLIDES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === index ? "is-active" : ""}
              onClick={() => go(item.id)}
              aria-label={`Folie ${item.id + 1}: ${item.label}`}
              aria-current={item.id === index ? "page" : undefined}
            />
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
