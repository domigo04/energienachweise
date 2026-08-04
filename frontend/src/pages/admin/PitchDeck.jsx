import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Database,
  Mail, Maximize2, ShieldCheck, Sparkles, TrendingUp,
} from "lucide-react";
import logo from "../../png/logo.png";
import schemaUebersicht from "../../assets/pitchdeck/schema-uebersicht.png";
import detailExcel from "../../assets/pitchdeck/detail-excel.png";
import detailGruppe from "../../assets/pitchdeck/detail-gruppe.png";
import detailVerteiler from "../../assets/pitchdeck/detail-verteiler.png";
import kontaktQr from "../../assets/pitchdeck/kontakt-qr.svg";
import portrait from "../../assets/pitchdeck/portrait.jpg";
import {
  normaliseSlide, pitchDeck, pitchPosition, pitchWert, PITCH_AUSBAU, PITCH_INVESTOR,
  PITCH_KONTAKT, PITCH_ZAHLEN,
} from "./pitchDeckContent";
import "./PitchDeck.css";

// Porträt der Eingangsfolie. Ein anderes Foto ersetzt einfach
// `src/assets/pitchdeck/portrait.jpg`; auf null gesetzt zeigt die Folie
// stattdessen das Monogramm.
const PORTRAIT = portrait;

// Änderungsbeispiel aus dem Pilotschema: Verbrauchergruppe «Lufterhitzer»
// 15 kW → 21 kW. Alle Werte stammen aus dem Backend-Rechenkern
// (PHYSIK.md §1, §4, §10, §14, §17) — Herleitung in docs/PITCHDECK.md.
const KASKADE = [
  ["auto", "Volumenstrom Gruppe", "1.29 m³/h", "1.81 m³/h"],
  ["ok", "Rohrdimension", "DN32", "DN40 · 44 Pa/m"],
  ["auto", "Verteiler", "45.00 kW", "51.00 kW"],
  ["auto", "Misch-Rücklauf", "34.3 °C", "35.3 °C"],
  ["auto", "Ventil und Pumpe", "kvs · Förderhöhe", "neu ausgelegt"],
  ["auto", "Quellenleistung WP", "35.0 kW", "39.7 kW"],
  ["warn", "Erdsonden-Bedarf", "856 m", "970 m · 900 m gebohrt"],
  ["ok", "Export", "Revision 07", "Revision 08"],
];

const WORKFLOW = [
  "Schema zeichnen", "Parametrieren", "Backend rechnet",
  "Warnungen prüfen", "Revision", "PDF-Export",
];

const COCKPIT = [
  ["Das Schema ist das Datenmodell", "Jedes Bauteil trägt seine fachlichen Werte, nicht nur ein Symbol."],
  ["Gerechnet wird im Backend", "Ein Rechenkern für Schema, Schnellrechner und Export — keine zweite Wahrheit."],
  ["Warnungen statt stiller Annahmen", "Fehlende Grundlagen werden benannt, mit Element, Ursache und Korrektur."],
  ["Revision und Export aus demselben Stand", "Freigegebene Stände bleiben unverändert und lassen sich wieder öffnen."],
];

const TIMELINE = [
  ["Heute", "Rechenkern, Editor, Warnungen und Vektor-PDF laufen."],
  ["Pilotbereitschaft", "Golden Cases extern geprüft, Datenverlust- und Export-Gate bestanden."],
  ["Begleiteter Pilot", "Drei Monate, reale Projekte, wöchentlicher Feedbacktermin."],
  ["Marktstart", "Lizenzbetrieb für Planungsbüros."],
];

const LEISTUNGEN = [
  ["Einführung im Büro", "90 Minuten vor Ort, danach arbeiten Sie selbstständig."],
  ["Firmenvorlagen", "Zwei bis drei Vorlagen, auf Ihre eigenen Prinzipschemata zugeschnitten."],
  ["Wöchentlicher Termin", "Feste Sitzung mit dem Entwickler — Ihre Rückmeldung landet direkt im Werkzeug."],
  ["Direkter Support", "Kein Ticketsystem, sondern der Weg zur Person, die das Werkzeug gebaut hat."],
  ["Ihre realen Projekte", "Zwei echte Aufträge in zwölf Wochen statt Testdaten."],
  ["Unterlagen", "Einführungsvideo, Kurzanleitung und die bekannten Einschränkungen schriftlich."],
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

/** Funktionsfarben: blau Eingabe · amber automatisch · grün geprüft · rot Warnung. */
function Marker({ kind, children }) {
  return <span className={`pitch-marker pitch-marker--${kind}`}>{children}</span>;
}

/** Kaufmännischer Wert; noch nicht eingetragene Felder bleiben sichtbar offen. */
function Wert({ value, einheit = "" }) {
  const { text, offen } = pitchWert(value);
  return <b className={offen ? "is-offen" : ""}>{text}{offen || !einheit ? "" : ` ${einheit}`}</b>;
}

function KaufmaennischeFolie({ before, accent, after = "", subtitle, felder, fuss }) {
  return (
    <>
      <AccentTitle before={before} accent={accent} after={after} />
      <p className="pitch-subtitle">{subtitle}</p>
      <div className="pitch-kennzahlen">
        {felder.map(([titel, value, hinweis]) => (
          <div key={titel}>
            <span>{titel}</span>
            <Wert value={value} />
            <small>{hinweis}</small>
          </div>
        ))}
      </div>
      {fuss ? <p className="pitch-bottom-line">{fuss}</p> : null}
    </>
  );
}

/** Der Kreislauf: eine Änderung läuft nicht durch Dateien, sondern zurück ins Schema. */
function Flowchart() {
  const breite = 148;
  const luecke = 22;
  return (
    <svg className="pitch-flowchart" viewBox="0 0 1020 212" role="img"
      aria-label="Kreislauf von Schema zeichnen über Berechnung und Revision zum Export, mit Rücksprung bei jeder Änderung">
      <defs>
        <marker id="pfeil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" />
        </marker>
        <marker id="pfeil-auto" className="pitch-flowchart__marker-auto" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>
      {WORKFLOW.map((schritt, i) => {
        const x = i * (breite + luecke);
        return (
          <g key={schritt}>
            <rect x={x} y={20} width={breite} height={64} rx={14} />
            <text x={x + breite / 2} y={57}>{schritt}</text>
            {i < WORKFLOW.length - 1 ? (
              <path className="pitch-flowchart__weg" markerEnd="url(#pfeil)"
                d={`M${x + breite + 3} 52 H${x + breite + luecke - 5}`} />
            ) : null}
          </g>
        );
      })}
      <path className="pitch-flowchart__rueckweg" markerEnd="url(#pfeil-auto)"
        d={`M${5 * (breite + luecke) + breite / 2} 92 V158 H${breite + luecke + breite / 2} V96`} />
      <text className="pitch-flowchart__label" x={510} y={190}>
        Eine Änderung — und die Kette rechnet neu
      </text>
    </svg>
  );
}

function SlideContent({ slideKey }) {
  switch (slideKey) {
    case "sirego":
      return (
        <div className="pitch-split pitch-split--hero">
          <div>
            <div className="pitch-kicker">SIREGO GmbH · Heizungscockpit</div>
            <AccentTitle before="Heizungs" accent="cockpit" />
            <p className="pitch-lead">Ein Schema. Alle Berechnungen.<br />Ein lebender Projektstand.</p>
            <div className="pitch-promise"><Sparkles /> Ändern – neu rechnen – sicher weiterplanen.</div>
          </div>
          <div className="pitch-portrait">
            {PORTRAIT ? <img src={PORTRAIT} alt={PITCH_KONTAKT.name} /> : <span>DG</span>}
            <b>{PITCH_KONTAKT.name}</b>
            <small>{PITCH_KONTAKT.rolle} · {PITCH_KONTAKT.firma}</small>
            <ul>
              <li>Von einem Heizungsfachplaner für reale Heizungsprojekte gebaut.</li>
              <li>Die Rechenwege stammen aus den eigenen Planungshilfen.</li>
              <li>Jede Formel hat eine Quelle und einen lesbaren Rechenweg.</li>
            </ul>
          </div>
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
    case "loesung":
      return (
        <>
          <div className="pitch-kicker">Die Lösung · Beispiel aus dem Pilotschema</div>
          <AccentTitle before="Eine Änderung. " accent="Das System reagiert." />
          <div className="pitch-case">
            <div>
              <div className="pitch-case__input">
                <Marker kind="eingabe">Eingabe</Marker>
                <b>15 → 21 kW</b>
                <span>Gruppe «Lufterhitzer» · 50/40 °C</span>
              </div>
              <Shot src={detailGruppe} alt="Verbrauchergruppen im Schema mit Dimension und Massenstrom"
                caption="Der geänderte Verbraucher" />
            </div>
            <ol className="pitch-tail">
              {KASKADE.map(([kind, name, vorher, nachher], i) => (
                <li key={name} className={`pitch-tail__step pitch-tail__step--${kind}`} style={{ "--i": i }}>
                  <span>{name}</span><i>{vorher}</i><em>→</em><b>{nachher}</b>
                </li>
              ))}
            </ol>
          </div>
          <p className="pitch-bottom-line">
            Acht Folgewerte aus einer Eingabe – gerechnet vom Backend, nicht von der Folie.
          </p>
        </>
      );
    case "workflow":
      return (
        <>
          <AccentTitle before="Ein " accent="Kreislauf" after=" statt einer Dateikette" />
          <p className="pitch-subtitle">Dieselbe Projektgrundlage trägt Schema, Berechnung, Revision und Export.</p>
          <Flowchart />
        </>
      );
    case "cockpit":
      return (
        <div className="pitch-split">
          <div>
            <AccentTitle before="Das Heizungscockpit " accent="erklärt" />
            <ol className="pitch-steps">
              {COCKPIT.map(([titel, text]) => <li key={titel}><b>{titel}</b><span>{text}</span></li>)}
            </ol>
          </div>
          <Shot src={schemaUebersicht} alt="Hydraulikschema mit Wärmepumpe, Speichern, Verteiler und Verbrauchergruppen"
            caption="Ein reales Pilotschema im Editor" />
        </div>
      );
    case "timeline":
      return (
        <>
          <AccentTitle before="Der Weg zum " accent="Marktstart" />
          <p className="pitch-subtitle">Der nächste Schritt entsteht nicht durch ein Datum, sondern durch ein bestandenes Gate.</p>
          <ol className="pitch-timeline">
            {TIMELINE.map(([titel, text], i) => (
              <li key={titel} className={i === 0 ? "is-jetzt" : ""}>
                <span>{i + 1}</span><b>{titel}</b><p>{text}</p>
              </li>
            ))}
          </ol>
        </>
      );
    case "leistungen":
      return (
        <div className="pitch-split">
          <div>
            <div className="pitch-kicker">Im Piloten enthalten</div>
            <AccentTitle before="Was Sie " accent="bekommen" />
            <div className="pitch-leistungen">
              {LEISTUNGEN.map(([titel, text]) => (
                <div key={titel}><CheckCircle2 /><b>{titel}</b><span>{text}</span></div>
              ))}
            </div>
          </div>
          <Shot src={detailVerteiler} alt="Verteilerbalken mit berechneter Leistung, Volumenstrom und Dimension"
            caption="Ihre Vorlagen, Ihre Schemas – berechnet im Werkzeug" />
        </div>
      );
    case "bedarf":
      return (
        <KaufmaennischeFolie
          before="Der Bedarf " accent="verschwindet nicht"
          subtitle="Warum es dieses Werkzeug in fünf Jahren noch geben wird – und warum sich die Einarbeitung lohnt."
          felder={[
            ["Heizungsplanungs-Workflows pro Jahr", PITCH_ZAHLEN.bedarf.workflows,
              `Schweiz · ${PITCH_ZAHLEN.bedarf.workflowsSpanne}`],
            ["Wohngebäude noch mit Öl oder Gas beheizt", PITCH_ZAHLEN.bedarf.gebaeude,
              "Ersatz und Sanierung über die nächsten Jahrzehnte"],
            ["Davon in Ihrem Büro", PITCH_ZAHLEN.bedarf.projekteProPlaner,
              "pro Planer und Jahr – die Grundlage der nächsten Folie"],
          ]}
          fuss="Nicht jedes Baugesuch ist ein Heizungsprojekt: die Zahl ist auf die real planbaren Vorgänge heruntergerechnet."
        />
      );
    case "rechnung":
      return (
        <div className="pitch-split">
          <div>
            <div className="pitch-kicker">Zielannahme für das fertige Produkt</div>
            <AccentTitle before="Was es " accent="Ihnen" after=" bringt" />
            <div className="pitch-range">
              <b>{PITCH_ZAHLEN.nutzen.stunden}</b><span>weniger Aufwand je Projekt</span>
            </div>
            <div className="pitch-open pitch-open--ok">
              <CheckCircle2 /> Amortisation {PITCH_ZAHLEN.nutzen.amortisation}
            </div>
          </div>
          <div className="pitch-bands">
            <div>
              <span>Direkte interne Kosteneinsparung</span>
              <b>{PITCH_ZAHLEN.nutzen.intern}</b><small>je Projekt</small>
            </div>
            <div>
              <span>Freigesetzte verrechenbare Kapazität</span>
              <b>{PITCH_ZAHLEN.nutzen.verrechenbar}</b><small>je Projekt</small>
            </div>
            <div>
              <span>Bei {PITCH_ZAHLEN.bedarf.projekteProPlaner} pro Planer und Jahr</span>
              <b>{PITCH_ZAHLEN.nutzen.jahrFranken}</b>
              <small>{PITCH_ZAHLEN.nutzen.jahrStunden} freigesetzte Planungszeit</small>
            </div>
            <p>Zielwerte für das fertige Produkt, nicht für den heutigen Pilotstand. Im Piloten werden sie an Ihren realen Projekten gemessen.</p>
          </div>
        </div>
      );
    case "ausbau":
      return (
        <>
          <AccentTitle before="Was als " accent="Nächstes" after=" kommt" />
          <p className="pitch-subtitle">In dieser Reihenfolge gebaut – Sie zahlen für das, was schon läuft, nicht für ein Versprechen.</p>
          <ol className="pitch-gates">
            {PITCH_AUSBAU.map(([titel, text], i) => (
              <li key={titel} className={i === 0 ? "is-jetzt" : ""}>
                <span>{i + 1}</span><b>{titel}</b><p>{text}</p>
              </li>
            ))}
          </ol>
          <p className="pitch-bottom-line">Stufe 1 ist der Pilotumfang. Alles Weitere folgt erst, wenn sie im realen Betrieb trägt.</p>
        </>
      );
    case "preise":
      return (
        <div className="pitch-split">
          <div>
            <AccentTitle before="Pilot und " accent="Lizenz" />
            <div className="pitch-case__input pitch-case__input--preis">
              <Marker kind="eingabe">Begleiteter Pilot</Marker>
              <b>{PITCH_ZAHLEN.preise.pilot}</b>
              <span>{PITCH_ZAHLEN.preise.pilotdauer}</span>
            </div>
            <p className="pitch-lead pitch-lead--small">
              Danach Lizenz pro Nutzer und Jahr – Sie zahlen für die Plätze, die wirklich planen.
            </p>
          </div>
          <div className="pitch-bands">
            <div><span>Core</span><b>{PITCH_ZAHLEN.preise.core}</b><small>Schema, Hydraulik, Revision, Export</small></div>
            <div><span>Professional</span><b>{PITCH_ZAHLEN.preise.professional}</b><small>zusätzlich Firmenstandards und Zusammenarbeit</small></div>
            <div><span>Enterprise</span><b>{PITCH_ZAHLEN.preise.enterprise}</b><small>zusätzlich Kostenindikation und Zusatzmodule</small></div>
            <p>Beispiel: {PITCH_ZAHLEN.preise.beispiel} pro Jahr für {PITCH_ZAHLEN.preise.beispielBasis}.</p>
          </div>
        </div>
      );
    case "markt":
      return (
        <KaufmaennischeFolie
          before="Markt" accent="grösse" after=" Schweiz"
          subtitle="Bandbreite und Basisszenario – kein Bestwert, sondern eine Spanne mit Mitte."
          felder={[
            ["Potenzielle Firmenkunden", PITCH_INVESTOR.markt.firmen, "Planungsbüros mit Heizungsplanung"],
            ["Zahlende Nutzerlizenzen", PITCH_INVESTOR.markt.lizenzen, `Basisszenario ${PITCH_INVESTOR.markt.nutzerBasis} Nutzer`],
            ["Wiederkehrender Jahresumsatz", PITCH_INVESTOR.markt.arr, PITCH_INVESTOR.markt.arrBasis],
          ]}
          fuss={`Gestützt auf ${PITCH_ZAHLEN.bedarf.workflows} Planungs-Workflows und ${PITCH_ZAHLEN.bedarf.gebaeude} noch fossil beheizte Wohngebäude. Effizienzpotenzial beim Kunden schweizweit ${PITCH_INVESTOR.markt.effizienz} pro Jahr.`}
        />
      );
    case "kosten":
      return (
        <KaufmaennischeFolie
          before="Was der Ausbau " accent="braucht"
          subtitle="Auf dem bestehenden Code, nicht auf der grünen Wiese."
          felder={[
            ["Pilot auf bestehendem Code", PITCH_INVESTOR.kosten.pilot, "zusätzlich zum heutigen Stand"],
            ["Produktiver V1-Stand", PITCH_INVESTOR.kosten.v1, "lizenzfähig im Regelbetrieb"],
            ["Vollständiges Endprodukt", PITCH_INVESTOR.kosten.endprodukt, "alle Ausbaustufen"],
          ]}
          fuss={`Bezahlte Kundenpiloten tragen einen Teil davon: ${PITCH_INVESTOR.kosten.pilotErloes} je Pilot.`}
        />
      );
    case "bewertung":
      return (
        <KaufmaennischeFolie
          before="Die " accent="Bewertung"
          subtitle="Unternehmenswert, keine Marktkapitalisierung – SIREGO ist nicht kotiert."
          felder={[
            ["Heute, Prototyp ohne Umsätze", PITCH_INVESTOR.bewertung.heute, "Pre-Money"],
            ["Mit bezahlten Piloten", PITCH_INVESTOR.bewertung.mitPiloten, "und extern geprüftem Rechenkern"],
            ["Bei Schweizer Marktführerschaft", PITCH_INVESTOR.bewertung.marktfuehrer, "langfristig"],
          ]}
          fuss={PITCH_INVESTOR.bewertung.grenze}
        />
      );
    case "kontakt":
      return (
        <div className="pitch-split">
          <div>
            <AccentTitle before="Heizungscockpit " accent="näher kennenlernen" />
            <ol className="pitch-steps pitch-steps--cta">
              <li><b>Live-Demo am realen Schema</b><span>30 Minuten</span></li>
              <li><b>Passendes Projekt gemeinsam auswählen</b><span>30 Minuten</span></li>
              <li><b>Einführung und Schulung im Büro</b><span>90 Minuten, danach selbstständig</span></li>
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
    case "status":
      return (
        <>
          <AccentTitle before="Funktionsstatus " accent="heute" />
          <p className="pitch-subtitle">Für Rückfragen: was läuft, was der Pilot beweisen muss, was nicht dazugehört.</p>
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
              <b>Nutzen und Bedarf</b>
              <ul>
                <li>Zielannahme 8 Stunden weniger Aufwand je Projekt, im fertigen Produkt</li>
                <li>CHF 600 direkte interne Einsparung und CHF 1'120 freigesetzte verrechenbare Kapazität je Projekt</li>
                <li>15 Projekte pro Planer und Jahr → 120 Stunden und CHF 9'000</li>
                <li>25'000 Planungs-Workflows pro Jahr, Bandbreite 17'000–35'000; nicht alle Baugesuche sind Heizungsprojekte</li>
                <li>Keine garantierte Einsparung – im Pilot an realen Projekten gemessen</li>
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

export default function PitchDeck({ variante = "kunde" }) {
  const { slideId } = useParams();
  const navigate = useNavigate();
  const { pfad, folien } = pitchDeck(variante);
  const index = normaliseSlide(slideId, variante);
  const slide = folien[index];
  const position = pitchPosition(index, variante);

  const go = useCallback((next) => {
    navigate(`${pfad}/${normaliseSlide(next, variante)}`);
  }, [navigate, pfad, variante]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (["ArrowRight", "PageDown", " "].includes(event.key) && index < folien.length - 1) {
        event.preventDefault(); go(index + 1);
      } else if (["ArrowLeft", "PageUp"].includes(event.key) && index > 0) {
        event.preventDefault(); go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(folien.length - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [folien.length, go, index]);

  const fullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <main className="pitch-deck">
      <div className="pitch-brand">
        <img src={logo} alt="" /><span>Heizungscockpit</span>
        {variante === "investor" ? <i>Investoren</i> : null}
      </div>
      <article key={index} className={`pitch-slide pitch-slide--${slide.key}`} aria-labelledby="pitch-slide-title">
        <div id="pitch-slide-title" className="sr-only">{slide.eyebrow} · {slide.label}</div>
        <SlideContent slideKey={slide.key} />
      </article>

      <div className="pitch-caption">{position.text}</div>
      <nav className="pitch-navigation" aria-label="Pitchdeck-Navigation">
        <div className="pitch-dots">
          {folien.map((item) => (
            <button type="button" key={item.id} className={`${item.anhang ? "is-anhang" : ""} ${item.id === index ? "is-active" : ""}`}
              onClick={() => go(item.id)} aria-label={`${item.anhang ? "Anhang" : "Folie"}: ${item.label}`}
              aria-current={item.id === index ? "page" : undefined} />
          ))}
        </div>
        <div className="pitch-controls">
          <b>{position.zaehler}</b>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Folie"><ArrowLeft /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === folien.length - 1} aria-label="Nächste Folie"><ArrowRight /></button>
          <button type="button" onClick={fullscreen} aria-label="Vollbild öffnen"><Maximize2 /></button>
        </div>
      </nav>
    </main>
  );
}
