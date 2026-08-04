import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, Database,
  FileCheck2, Mail, Maximize2, ShieldCheck, Sparkles, TrendingUp, Users,
} from "lucide-react";
import logo from "../../png/logo.png";
import schemaUebersicht from "../../assets/pitchdeck/schema-uebersicht.png";
import detailExcel from "../../assets/pitchdeck/detail-excel.png";
import detailGruppe from "../../assets/pitchdeck/detail-gruppe.png";
import detailVerteiler from "../../assets/pitchdeck/detail-verteiler.png";
import kontaktQr from "../../assets/pitchdeck/kontakt-qr.svg";
import portrait from "../../assets/pitchdeck/portrait.jpg";
import { normaliseSlide, pitchPosition, PITCH_KONTAKT, PITCH_SLIDES } from "./pitchDeckContent";
import "./PitchDeck.css";

// Porträt der Gründerfolie. Ein anderes Foto ersetzt einfach
// `src/assets/pitchdeck/portrait.jpg`; auf null gesetzt zeigt die Folie
// stattdessen das Monogramm.
const PORTRAIT = portrait;

// Änderungsbeispiel aus dem Pilotschema: Verbrauchergruppe «Lufterhitzer»
// 15 kW → 21 kW. Alle Werte stammen aus dem Backend-Rechenkern
// (PHYSIK.md §1, §4, §10, §14, §17) — Herleitung in docs/PITCHDECK.md.
const KASKADE = [
  ["auto", "Volumenstrom Gruppe", "1.29 m³/h", "1.81 m³/h"],
  ["ok", "Rohrdimension", "DN32 · 50 Pa/m", "DN40 · 44 Pa/m"],
  ["auto", "Verteiler", "45.00 kW", "51.00 kW"],
  ["auto", "Misch-Rücklauf", "34.3 °C", "35.3 °C"],
  ["auto", "Ventil und Pumpe", "kvs · Förderhöhe", "neu ausgelegt"],
  ["auto", "Quellenleistung WP", "35.0 kW", "39.7 kW"],
  ["warn", "Erdsonden-Bedarf", "856 m", "970 m · 900 m gebohrt"],
  ["ok", "Export", "Revision 07", "Revision 08"],
];

const KETTE = [
  "Leistung", "Volumenstrom", "Rohrdimension", "Druckverlust", "Pumpe",
  "Ventil", "Erzeuger und Quelle", "Speicher und Expansion", "Export",
];

const STATUS = [
  ["ok", "Heute verifiziert", [
    "Schema zeichnen, parametrisieren, speichern und wieder öffnen",
    "Sole/Wasser- und Luft/Wasser-Wärmepumpe mit getrenntem Quellenkreis",
    "Hydraulik im Backend gerechnet, Rechenweg sichtbar",
    "Warnungen mit Element, Ursache, Auswirkung und Korrektur",
    "Vektor-PDF mit Plankopf, Revision und Legende",
  ]],
  ["auto", "Im Pilot zu validieren", [
    "12 Golden-Testfälle durch externe Fachprüfung",
    "50 Speicher- und Wiederöffnungszyklen ohne Datenverlust",
    "Export im realen Abgabeablauf zweier Büros",
    "Brauchwarmwasser nach SIA 385/2",
    "Erdsondenfeld und Solekreis als Planungshilfe",
  ]],
  ["off", "Nicht im Pilot", [
    "Dampf, BHKW und Solarthermie",
    "Erzeugerkaskaden mit vollständiger Regelung",
    "Kälte-, Lüftungs-, Sanitär- und Elektroplanung",
    "Verbindliche Herstellerauslegung",
    "Revit, IFC und bidirektionales CAD",
  ]],
];

const NUTZEN = [
  ["Schneller zeichnen", "80–200 h", "2–5 h je Prinzipschema"],
  ["Weniger Nachführung", "120–320 h", "3–8 h je geänderter Auslegung"],
  ["Weniger Fehler und Rückfragen", "40–80 h", "1–2 h je Projekt"],
];

const GATES = [
  ["Rechenkern geschlossen", "Schema, Hydraulik und BWW rechnen vollständig durch."],
  ["Golden Cases bestanden", "12 Testfälle mit Handrechnung, Backendtest und externer Freigabe."],
  ["Datenverlust- und Export-Gate", "50 Speicherzyklen ohne Verlust, Export im realen Ablauf bestätigt."],
  ["Pilotbetrieb freigegeben", "Betrieb, Datenschutz und drei verbindliche Büros stehen."],
  ["Wirkung belegt", "Mindestens zwei Büros starten freiwillig das zweite Projekt."],
];

function AccentTitle({ before, accent, after = "" }) {
  return <h1 className="pitch-title">{before}<span>{accent}</span>{after}</h1>;
}

/** Produktausschnitt im Rahmen — bewusst ein Detail, nicht das ganze Schema. */
function Shot({ src, alt, caption, className = "" }) {
  return (
    <figure className={`pitch-shot ${className}`}>
      <img src={src} alt={alt} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Funktionsfarben: blau Eingabe · orange automatisch · grün geprüft · rot Warnung. */
function Marker({ kind, children }) {
  return <span className={`pitch-marker pitch-marker--${kind}`}>{children}</span>;
}

function SlideContent({ slideKey }) {
  switch (slideKey) {
    case "titel":
      return (
        <div className="pitch-split pitch-split--hero">
          <div>
            <div className="pitch-kicker">Fachplanung neu verbunden</div>
            <AccentTitle before="Heizungs" accent="cockpit" />
            <p className="pitch-lead">Ein Schema. Alle Berechnungen.<br />Ein lebender Projektstand.</p>
            <div className="pitch-promise"><Sparkles /> Ändern – neu rechnen – sicher weiterplanen.</div>
          </div>
          <Shot src={schemaUebersicht} className="pitch-shot--bleed"
            alt="Hydraulikschema mit Wärmepumpe, Speichern, Verteiler und zwei Verbrauchergruppen"
            caption="Pilotschema · Sole/Wasser-Wärmepumpe mit Erdsonden" />
        </div>
      );
    case "problem":
      return (
        <div className="pitch-split">
          <div>
            <div className="pitch-kicker">Die Situation kennen wir alle</div>
            <AccentTitle before="Eine Änderung. " accent="Fünf Excel neu." />
            <p className="pitch-lead pitch-lead--small">
              Expansion, Druckverlust, Ventilautorität, Speicher, Erdsonden – jede Datei rechnet für sich.
            </p>
            <div className="pitch-staende">
              {[["Schema", "V7"], ["Druckverlust", "final_2"], ["Ventile", "neu"], ["Export", "V6"]].map(([name, stand]) => (
                <div key={name}><span>{name}</span><b>{stand}</b></div>
              ))}
              <strong><AlertTriangle /> Welcher Stand gilt?</strong>
            </div>
          </div>
          <Shot src={detailExcel} alt="Ein Schema mit vier getrennten Excel-Berechnungen"
            caption="Heute: ein Schema, fünf getrennte Rechenstände" />
        </div>
      );
    case "beispiel":
      return (
        <>
          <div className="pitch-kicker">Konkret · aus dem Pilotschema</div>
          <AccentTitle before="Eine Eingabe. " accent="Acht Folgen." />
          <div className="pitch-case">
            <div className="pitch-case__input">
              <Marker kind="eingabe">Eingabe</Marker>
              <b>15 → 21 kW</b>
              <span>Gruppe «Lufterhitzer» · 50/40 °C</span>
              <Shot src={detailGruppe} alt="Verbrauchergruppen im Schema mit Dimension und Massenstrom"
                caption="Der geänderte Verbraucher im Schema" />
            </div>
            <div className="pitch-cascade">
              {KASKADE.map(([kind, name, vorher, nachher]) => (
                <div key={name} className={`pitch-cascade__row pitch-cascade__row--${kind}`}>
                  <span>{name}</span><i>{vorher}</i><em>→</em><b>{nachher}</b>
                </div>
              ))}
              <p>Annahmen: COP 4.5 · Entzugsleistung 45 W/m · Sicherheitsfaktor 1.10. Gerechnet vom Backend-Rechenkern, nicht von der Folie.</p>
            </div>
          </div>
        </>
      );
    case "kette":
      return (
        <>
          <div className="pitch-kicker">Das Prinzip</div>
          <AccentTitle before="Eine Änderung. " accent="Das System reagiert." />
          <div className="pitch-chain-layout">
            <ol className="pitch-chain">
              {KETTE.map((stufe, i) => <li key={stufe} style={{ "--i": i }}>{stufe}</li>)}
            </ol>
            <Shot src={detailVerteiler} alt="Verteilerbalken mit berechneter Leistung, Volumenstrom und Dimension"
              caption="Berechnete Werte stehen im Schema, nicht in einer Nebendatei" />
          </div>
          <p className="pitch-bottom-line">
            Schema, Berechnung, Revision und Export verwenden dieselbe Projektgrundlage.
          </p>
        </>
      );
    case "status":
      return (
        <>
          <AccentTitle before="Pilot V1 – " accent="ehrlich abgegrenzt" />
          <p className="pitch-subtitle">Was heute läuft, was der Pilot beweisen muss und was nicht dazugehört.</p>
          <div className="pitch-status">
            {STATUS.map(([kind, titel, punkte]) => (
              <div key={titel} className={`pitch-status__col pitch-status__col--${kind}`}>
                <b><Marker kind={kind} />{titel}</b>
                <ul>{punkte.map((punkt) => <li key={punkt}>{punkt}</li>)}</ul>
              </div>
            ))}
          </div>
        </>
      );
    case "projektstand":
      return (
        <div className="pitch-split">
          <div>
            <AccentTitle before="Nachvollziehbarer " accent="Projektstand" />
            <ol className="pitch-steps">
              {[
                ["Formel", "Jeder Rechenweg bleibt sichtbar."],
                ["Herkunft", "Automatisch oder manuell gesetzt ist erkennbar."],
                ["Warnung", "Fehlende Grundlagen statt stiller Annahmen."],
                ["Revision", "Freigegebene Stände bleiben unverändert."],
              ].map(([titel, text]) => <li key={titel}><b>{titel}</b><span>{text}</span></li>)}
            </ol>
          </div>
          <div className="pitch-snapshot">
            <div className="pitch-snapshot__head"><FileCheck2 /><span>Projektstand · Revision 07</span><b>bereit</b></div>
            {[
              ["Schema", "aktuell"], ["Berechnungsversion", "gespeichert"],
              ["Eingaben und Resultate", "enthalten"], ["Fehlende Grundlagen", "sichtbar"],
              ["Bearbeiter und Zeitpunkt", "protokolliert"],
            ].map(([name, stand]) => (
              <div className="pitch-snapshot__row" key={name}><CheckCircle2 /><span>{name}</span><b>{stand}</b></div>
            ))}
          </div>
        </div>
      );
    case "nutzen":
      return (
        <div className="pitch-split">
          <div>
            <div className="pitch-kicker">Nutzenhypothese</div>
            <AccentTitle before="Freigesetzte " accent="Planungskapazität" />
            <div className="pitch-range"><b>240–600 h</b><span>pro Büro und Jahr</span></div>
            <div className="pitch-open"><Clock3 /> Im Pilot gemessen: noch offen</div>
          </div>
          <div className="pitch-bands">
            {NUTZEN.map(([titel, spanne, basis]) => (
              <div key={titel}><span>{titel}</span><b>{spanne}</b><small>{basis}</small></div>
            ))}
            <p>Modellannahme: 40 Prinzipschemata pro Büro und Jahr. Keine garantierte Einsparung – Annahmen im Anhang.</p>
          </div>
        </div>
      );
    case "zielbuero":
      return (
        <div className="pitch-split">
          <div>
            <AccentTitle before="Für wen der Pilot " accent="passt" />
            <p className="pitch-subtitle">Gesucht: Büros, die mit echten Projekten messen – nicht nur testen.</p>
            <ul className="pitch-list pitch-list--checks">
              <li>2–15 Heizungsplaner</li>
              <li>Regelmässige Prinzipschemata, heute mit CAD und Excel</li>
              <li>Zwei reale, passende Wärmepumpenprojekte</li>
              <li>Eine verantwortliche Person und eigener Softwareentscheid</li>
            </ul>
          </div>
          <div className="pitch-pilot-card">
            <Users /><b>3 Büros</b><span>6 reale Projekte</span><hr />
            <strong>Der echte Beweis</strong>
            <p>Mindestens zwei Büros starten freiwillig das zweite Projekt.</p>
          </div>
        </div>
      );
    case "angebot":
      return (
        <>
          <AccentTitle before="Das " accent="Pilotangebot" />
          <div className="pitch-offer">
            <div>
              <span>Leistung · 3 Monate begleitet</span>
              <b>CHF 5'000</b>
              <small>Bis 5 Nutzer · Einführung · 2–3 Firmenvorlagen · direkter Support · wöchentlicher Feedbacktermin</small>
            </div>
            <div>
              <span>Start</span>
              <b>Nach dem Export-Gate</b>
              <small>Kein Kalendertermin: Der Pilot startet, wenn Datenverlust- und Export-Gate bestanden sind.</small>
            </div>
            <div>
              <span>Mitwirkung des Büros</span>
              <b>90 Min + 30 Min/Woche</b>
              <small>Einführung, zwei reale Projekte, wöchentliches Feedback, Zeit- und Fehlererfassung</small>
            </div>
          </div>
          <p className="pitch-bottom-line">Nach dem Pilot: Core pro Büro und Jahr – Preise im Anhang.</p>
        </>
      );
    case "hintergrund":
      return (
        <div className="pitch-split pitch-split--person">
          <div className="pitch-portrait">
            {PORTRAIT ? <img src={PORTRAIT} alt={PITCH_KONTAKT.name} /> : <span>DG</span>}
            <b>{PITCH_KONTAKT.name}</b>
            <small>{PITCH_KONTAKT.rolle} · {PITCH_KONTAKT.firma}</small>
          </div>
          <div>
            <div className="pitch-kicker">Fachlicher Hintergrund</div>
            <AccentTitle before="Von einem " accent="Heizungsfachplaner" after=" gebaut" />
            <ul className="pitch-list">
              <li>Die Rechenwege stammen aus den eigenen Planungshilfen: Rohrtabelle, Expansions- und Erdsondenberechnung.</li>
              <li>Jede Formel hat eine dokumentierte Quelle, einen Backendtest und einen lesbaren Rechenweg im Export.</li>
              <li>Entstanden, weil dieselbe Leistungsänderung sonst fünfmal von Hand nachgeführt wird.</li>
            </ul>
          </div>
        </div>
      );
    case "kontakt":
      return (
        <div className="pitch-split">
          <div>
            <AccentTitle before="Pilotprojekt " accent="gemeinsam auswählen" />
            <ol className="pitch-steps pitch-steps--cta">
              <li><b>Live-Demo am realen Schema</b><span>30 Minuten</span></li>
              <li><b>Passendes Projekt gemeinsam auswählen</b><span>30 Minuten</span></li>
              <li><b>Einführung im Büro, danach selbstständig</b><span>90 Minuten</span></li>
            </ol>
          </div>
          <div className="pitch-contact">
            <img src={kontaktQr} alt={`QR-Code für eine E-Mail an ${PITCH_KONTAKT.mail}`} />
            <div>
              <b>{PITCH_KONTAKT.name}</b>
              <span>{PITCH_KONTAKT.firma}</span>
              <a href={`mailto:${PITCH_KONTAKT.mail}?subject=${encodeURIComponent(PITCH_KONTAKT.betreff)}`}>
                <Mail /> {PITCH_KONTAKT.mail}
              </a>
              <small>QR scannen – die E-Mail «{PITCH_KONTAKT.betreff}» ist vorbereitet.</small>
            </div>
          </div>
        </div>
      );
    case "lv":
      return (
        <>
          <AccentTitle before="Add-on: LV wird " accent="Firmenwissen" />
          <p className="pitch-subtitle">Getrenntes Beta-Modul nach dem Kern – kein Bestandteil des Schema-Piloten.</p>
          <div className="pitch-flow">
            {["PDF / DEVIS", "KI-Import", "Fachprüfung", "Referenzprojekt", "Kostenindikation"].map((stufe, i) => (
              <div key={stufe}><span>0{i + 1}</span><b>{stufe}</b></div>
            ))}
          </div>
          <p className="pitch-bottom-line">
            <Database /> Jedes geprüfte Projekt macht die nächste Indikation belastbarer. Freigabe erst nach Leave-one-out-Test.
          </p>
        </>
      );
    case "modell":
      return (
        <>
          <AccentTitle before="Geschäftsmodell " accent="nach dem Pilot" />
          <div className="pitch-offer">
            <div><span>Core · pro Büro und Jahr</span><b>CHF 4'000–6'000</b><small>Schema · Berechnungen · Revision · Export</small></div>
            <div><span>Add-on · nach Datengate</span><b>LV und Kostenintelligenz</b><small>Eigenes Kontingent, eigene Wertlogik</small></div>
            <div><span>Belastbar ab</span><b>Erster bestätigter Nutzen</b><small>Preise gelten erst als bestätigt, wenn der Pilot eine Nutzenannahme belegt.</small></div>
          </div>
        </>
      );
    case "gates":
      return (
        <>
          <AccentTitle before="Reihenfolge " accent="statt Termine" />
          <p className="pitch-subtitle">Nicht die nächste Funktion entscheidet – sondern das bestandene Gate.</p>
          <ol className="pitch-gates">
            {GATES.map(([titel, text], i) => (
              <li key={titel}><span>{i + 1}</span><b>{titel}</b><p>{text}</p></li>
            ))}
          </ol>
          <p className="pitch-bottom-line"><TrendingUp /> Termine werden intern geführt; im Gespräch zählt das nächste bestandene Gate.</p>
        </>
      );
    case "daten":
      return (
        <>
          <AccentTitle before="Daten und " accent="Datenschutz" />
          <p className="pitch-subtitle">Vor dem Pilotstart verbindlich geregelt – nicht danach.</p>
          <div className="pitch-proof">
            {[
              ["Dateneigentum", "Projektdaten gehören dem Büro. Export und Löschung sind Vertragsbestandteil."],
              ["Mandantentrennung", "Projekte sind firmenweit sichtbar, firmenübergreifend nie."],
              ["Datenstandort", "Wird vor dem Pilotstart festgelegt und in der Pilotvereinbarung dokumentiert."],
              ["Betrieb", "Getrennte Datenbanken für Test und Produktion, Backup und Restore nachgewiesen."],
            ].map(([titel, text]) => <div key={titel}><ShieldCheck /><b>{titel}</b><p>{text}</p></div>)}
          </div>
        </>
      );
    default:
      return (
        <>
          <AccentTitle before="Berechnungs" accent="annahmen" />
          <div className="pitch-assumptions">
            <div>
              <b>Nutzenhypothese</b>
              <ul>
                <li>40 Prinzipschemata pro Büro und Jahr</li>
                <li>Zeichnen 2–5 h · Nachführung 3–8 h · Fehler 1–2 h je Schema</li>
                <li>Summe 240–600 h; bei CHF 160 Stundenwert CHF 38'400–96'000</li>
                <li>Keine garantierte Einsparung – im Pilot gemessen wird Zeit bis zum ersten Schema, Supportzeit und Wiederverwendung</li>
              </ul>
            </div>
            <div>
              <b>Änderungsbeispiel 15 → 21 kW</b>
              <ul>
                <li>Verteiler-VL 50 °C · FBH 30 kW bei 35/28 °C · Lufterhitzer bei 50/40 °C</li>
                <li>Volumenstrom V′ = Q / (1.163 · ΔT); Rohr nach Tabelle bis 70 Pa/m</li>
                <li>Quellenleistung Q₀ = Q · (1 − 1/COP) mit COP 4.5</li>
                <li>Bohrmeter L = Q₀ · 1000 / 45 W/m · 1.10; gebohrt sind 5 × 180 m</li>
              </ul>
            </div>
          </div>
        </>
      );
  }
}

export default function PitchDeck() {
  const { slideId } = useParams();
  const navigate = useNavigate();
  const index = normaliseSlide(slideId);
  const slide = PITCH_SLIDES[index];
  const position = pitchPosition(index);

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
    <main className="pitch-deck" data-tone={slide.tone || "light"}>
      <div className="pitch-brand"><img src={logo} alt="" /><span>Heizungscockpit</span></div>
      <article key={index} className={`pitch-slide pitch-slide--${slide.key}`} aria-labelledby="pitch-slide-title">
        <div id="pitch-slide-title" className="sr-only">{slide.eyebrow} · {slide.label}</div>
        <SlideContent slideKey={slide.key} />
      </article>

      <div className="pitch-caption">{position.text}</div>
      <nav className="pitch-navigation" aria-label="Pitchdeck-Navigation">
        <div className="pitch-dots">
          {PITCH_SLIDES.map((item) => (
            <button type="button" key={item.id} className={`${item.anhang ? "is-anhang" : ""} ${item.id === index ? "is-active" : ""}`}
              onClick={() => go(item.id)} aria-label={`${item.anhang ? "Anhang" : "Folie"}: ${item.label}`}
              aria-current={item.id === index ? "page" : undefined} />
          ))}
        </div>
        <div className="pitch-controls">
          <b>{position.zaehler}</b>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Folie"><ArrowLeft /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === PITCH_SLIDES.length - 1} aria-label="Nächste Folie"><ArrowRight /></button>
          <button type="button" onClick={fullscreen} aria-label="Vollbild öffnen"><Maximize2 /></button>
        </div>
      </nav>
    </main>
  );
}
