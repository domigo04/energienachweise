import { useMemo, useState } from "react";
import {
  Activity, CircleGauge, ExternalLink, FileDown, Flame, Gauge, MoveHorizontal,
  RefreshCw, Scale, Waves,
} from "lucide-react";
import { api } from "../../api";
import Balken from "../../components/charts/Balken";
import PageHeader from "../../components/ui/PageHeader";
import { IconKompressor, IconSpeicher, IconWaermetauscher } from "../../components/ui/fachIcons";
import { VentilRechner } from "./VentilPage";
import { DruckverlustRechner } from "./DruckverlustPage";
import { RavelRechner } from "./RavelPage";

const ZAHL = (wert) => Number(String(wert).replace(",", "."));

// Alle Auslegungen in einer Liste, gleich dargestellt und am gleichen Ort
// gerechnet. Die meisten beschreiben nur ihre Felder und ihr Resultat und
// nutzen dieselbe Maske; die drei älteren Rechner bringen als `komponente`
// ihre eigene Maske mit, sitzen aber im selben Bereich.
const RECHNER = [
  {
    id: "waermetauscher",
    gruppe: "Hydraulik",
    icon: IconWaermetauscher,
    titel: "Wärmetauscher",
    kurz: "Benötigte Tauscherfläche aus Leistung, U-Wert und logarithmischer Temperaturdifferenz.",
    quelle: "Wärmetauscherauslegung.xlsx",
    felder: [
      ["leistung_kw", "Leistung", "kW", 110],
      ["u_wert_w_m2k", "U-Wert", "W/(m²·K)", 4800],
      ["delta_t_lm_k", "Log. Temperaturdifferenz", "K", 10.4],
    ],
    ergebnisse: [["flaeche_m2", "Tauscherfläche", "m²"]],
  },
  {
    id: "speicher_wp",
    gruppe: "Hydraulik",
    icon: IconSpeicher,
    titel: "Technischer Speicher",
    kurz: "Wasservolumen für eine definierte Überbrückungszeit der Wärmepumpe.",
    quelle: "TS_Auslegung.xlsx · Speicher_Auslegung.xlsx",
    felder: [
      ["leistung_kw", "Heizleistung", "kW", 29.88],
      ["ueberbrueckung_min", "Überbrückungszeit", "min", 15],
      ["delta_t_k", "Nutzbare Temperaturspreizung", "K", 10],
      ["dichte_kg_m3", "Dichte Wasser", "kg/m³", 988],
    ],
    ergebnisse: [
      ["speichervolumen_l", "Berechnetes Volumen", "Liter"],
      ["richtwert_25_l_kw", "Vergleichswert 25 l/kW", "Liter"],
    ],
    diagramm: (r) => ({
      einheit: "l",
      werte: [
        { label: "Berechnet", wert: r.speichervolumen_l },
        { label: "Richtwert 25 l/kW", wert: r.richtwert_25_l_kw },
      ],
    }),
  },
  {
    id: "rohrausdehnung",
    gruppe: "Hydraulik",
    icon: MoveHorizontal,
    titel: "Rohrausdehnung",
    kurz: "Thermische Längenänderung und Endlänge eines geraden Rohrabschnitts.",
    quelle: "Rohrausdehnung.xlsx",
    felder: [
      ["laenge_m", "Rohrlänge", "m", 30],
      ["temperaturdifferenz_k", "Temperaturänderung", "K", 50],
      ["alpha_mm_mk", "Ausdehnungskoeffizient", "mm/(m·K)", 0.0115],
    ],
    ergebnisse: [
      ["laengenaenderung_mm", "Längenänderung", "mm"],
      ["endlaenge_m", "Endlänge", "m"],
    ],
  },
  {
    id: "waermepumpe",
    gruppe: "Wärmeerzeugung",
    icon: IconKompressor,
    titel: "WP-Leistungen",
    kurz: "Heiz-, Quellen- und elektrische Leistung über den COP umrechnen.",
    quelle: "Heiz_Kälteleistung.xslx.xlsx",
    felder: [
      ["bekannte_seite", "Bekannte Leistung", "", "heizung", "select", [
        ["heizung", "Heizleistung"], ["quelle", "Quellen-/Kälteleistung"],
      ]],
      ["leistung_kw", "Bekannte Leistung", "kW", 176.4],
      ["cop", "COP", "–", 3.5],
    ],
    ergebnisse: [
      ["heizleistung_kw", "Heizleistung", "kW"],
      ["quellenleistung_kw", "Quellenleistung", "kW"],
      ["elektrische_leistung_kw", "Elektrische Leistung", "kW"],
    ],
    diagramm: (r) => ({
      einheit: "kW",
      dezimalen: 1,
      werte: [
        { label: "Heizleistung", wert: r.heizleistung_kw, hinweis: "= Quelle + elektrisch" },
        { label: "Quellenleistung", wert: r.quellenleistung_kw },
        { label: "Elektrische Leistung", wert: r.elektrische_leistung_kw },
      ],
    }),
  },
  {
    id: "druckverlust_kvs",
    gruppe: "Hydraulik",
    icon: CircleGauge,
    titel: "Δp über kvs",
    kurz: "Druckverlust eines Ventils aus Volumenstrom und effektivem kvs-Wert.",
    quelle: "Delta P.xlsx",
    felder: [
      ["volumenstrom_m3h", "Volumenstrom", "m³/h", 14.2],
      ["kvs", "kvs-Wert", "m³/(h·√bar)", 40],
    ],
    ergebnisse: [
      ["druckverlust_kpa", "Druckverlust", "kPa"],
      ["druckverlust_bar", "Druckverlust", "bar"],
    ],
  },
  {
    id: "jahresenergie",
    gruppe: "Wärmeerzeugung",
    icon: Flame,
    titel: "Jahresenergie",
    kurz: "Jahresenergiebedarf für Raumheizung, Kühlung und Warmwasser.",
    quelle: "Jahresenergiebedarf Heizung und BWW.xlsx",
    // Aufbau wie im Blatt: Heizanteil, Kühlanteil, Warmwasser.
    abschnitte: [
      {
        titel: "1) Jahresenergiebedarf Heizung",
        felder: [
          ["vollbetriebsstunden_h_d", "td · Vollbetriebsstunden pro Tag", "h/d", 17],
          ["heizgradtage_kd_a", "HGT · Heizgradtage", "Kd/a", 3432],
          ["heizleistung_kw", "Q · Heizleistung der Raumheizgruppen", "kW", 30],
          ["auslegungs_delta_t_k", "Δθmax · mittl. RT zu grösster AT", "K", 28],
        ],
      },
      {
        titel: "Kühlanteil — nur ausfüllen, wenn gekühlt wird",
        felder: [
          ["kuehl_vollbetriebsstunden_h_d", "td · Vollbetriebsstunden pro Tag", "h/d", 17],
          ["kuehlgradtage_kd_a", "KGT · Kühlgradtage", "Kd/a", 160],
          ["kuehlleistung_kw", "Q · Kühlleistung", "kW", 0],
          ["kuehl_delta_t_k", "Δθmax · Temperaturdifferenz", "K", 0],
        ],
      },
      {
        titel: "2) Jahresenergiebedarf BWW",
        felder: [
          ["bww_tage_a", "ta · Nutzungstage pro Jahr", "d/a", 365],
          ["bww_m3_d", "Vw,d · Tagesverbrauch", "m³/d", 0.388],
          ["bww_verlustfaktor", "f · Faktor für Verluste", "–", 1.5],
          ["bww_dichte_kg_m3", "ρw · Dichte", "kg/m³", 998],
          ["bww_c_kj_kgk", "c · spezifische Wärmekapazität", "kJ/(kg·K)", 4.187],
          ["bww_delta_t_k", "Δθ · Kalt- zu Warmwasser", "K", 50],
        ],
      },
    ],
    ergebnisse: [
      ["qh_kwh_a", "Jahresenergiebedarf Heizung", "kWh/a"],
      ["bww_kwh_a", "Jahresenergiebedarf BWW", "kWh/a"],
      ["total_kwh_a", "Total", "kWh/a"],
    ],
    diagramm: (r) => ({
      einheit: "kWh/a",
      werte: [
        { label: "Raumheizung", wert: r.heizung_kwh_a },
        { label: "Kühlung", wert: r.kuehlung_kwh_a },
        { label: "Warmwasser", wert: r.bww_kwh_a },
      ].filter((w) => w.wert > 0),
    }),
    hinweise: [
      { text: "Vollbetriebsstunden nach SIA 2024: Wohnhäuser und Schulen 16–18 h/d, Büro- und Geschäftshäuser 17–18 h/d, Hotels 18–20 h/d." },
      { text: "Heizgradtage je Ort und Jahr — HEV Schweiz", url: "https://www.hev-schweiz.ch/vermieten/nebenkostenabrechnungen/heizgradtage" },
      { text: "Kühlgradtage je Ort — zevvy", url: "https://www.zevvy.org/de-CH/wissenswertes/heizkosten/kuehlgradtage" },
    ],
  },
  {
    id: "jaz",
    gruppe: "Wärmeerzeugung",
    icon: Activity,
    titel: "JAZ & Stromkosten",
    kurz: "COP nach Temperaturstunden gewichten und jährlichen Strombedarf abschätzen.",
    quelle: "JAZ.xlsx",
    // Zwei Spalten, damit COP und Stunden eines Temperaturbands nebeneinander
    // stehen und nicht über den Zeilenumbruch auseinandergerissen werden.
    spalten: 2,
    felder: [
      ["cop_1", "COP −8 bis −4 °C", "–", 3], ["h_1", "Stunden", "h/a", 100],
      ["cop_2", "COP −4 bis 0 °C", "–", 3], ["h_2", "Stunden", "h/a", 340],
      ["cop_3", "COP 0 bis 4 °C", "–", 3.2], ["h_3", "Stunden", "h/a", 710],
      ["cop_4", "COP 4 bis 8 °C", "–", 4], ["h_4", "Stunden", "h/a", 820],
      ["cop_5", "COP 8 bis 12 °C", "–", 5], ["h_5", "Stunden", "h/a", 700],
      ["cop_6", "COP über 12 °C", "–", 3.5], ["h_6", "Stunden", "h/a", 260],
      ["heizung_kwh_a", "Heizenergie", "kWh/a", 93000],
      ["bww_kwh_a", "Warmwasserenergie", "kWh/a", 1],
      ["cop_bww", "COP Warmwasser", "–", 1],
      ["systemfaktor", "Systemfaktor", "–", 0.9],
      ["strompreis_chf_kwh", "Strompreis", "CHF/kWh", 0.19],
    ],
    bauen: (werte) => ({
      cop_werte: [1, 2, 3, 4, 5, 6].map((i) => ZAHL(werte[`cop_${i}`])),
      stunden: [1, 2, 3, 4, 5, 6].map((i) => ZAHL(werte[`h_${i}`])),
      heizung_kwh_a: ZAHL(werte.heizung_kwh_a), bww_kwh_a: ZAHL(werte.bww_kwh_a),
      cop_bww: ZAHL(werte.cop_bww), systemfaktor: ZAHL(werte.systemfaktor),
      strompreis_chf_kwh: ZAHL(werte.strompreis_chf_kwh),
    }),
    ergebnisse: [
      ["jaz", "Jahresarbeitszahl", ""],
      ["stromverbrauch_kwh_a", "Stromverbrauch", "kWh/a"],
      ["stromkosten_chf_a", "Stromkosten", "CHF/a"],
    ],
    // Das Diagramm zeigt die Gewichtung: welches Temperaturband die JAZ traegt.
    diagrammAusEingabe: (werte) => ({
      einheit: "h/a",
      werte: [
        ["-8 bis -4 \u00b0C", 1], ["-4 bis 0 \u00b0C", 2], ["0 bis 4 \u00b0C", 3],
        ["4 bis 8 \u00b0C", 4], ["8 bis 12 \u00b0C", 5], ["\u00fcber 12 \u00b0C", 6],
      ].map(([label, i]) => ({
        label, wert: Number(werte[`h_${i}`]), hinweis: `COP ${werte[`cop_${i}`]}`,
      })),
    }),
  },
  {
    id: "ventil",
    gruppe: "Hydraulik",
    icon: Gauge,
    titel: "Ventilauslegung",
    kurz: "kvs-Wert und Ventilautorität eines Regelventils.",
    quelle: "Ventilauslegung.xlsx (M3)",
    komponente: VentilRechner,
  },
  {
    id: "druckverlust",
    gruppe: "Hydraulik",
    icon: Waves,
    titel: "Pumpendruckverlust",
    kurz: "Rohrsystem und Apparate je Pumpenkreis, approximativ.",
    quelle: "Druckverlust.xlsx (M4)",
    komponente: DruckverlustRechner,
  },
  {
    id: "ravel",
    gruppe: "Wirtschaftlichkeit",
    icon: Scale,
    titel: "RAVEL-Vergleich",
    kurz: "Mittlere Jahreskosten mehrerer Varianten nach der Annuitätenmethode.",
    quelle: "RAVEL-Leitfaden BfK 1994 (M10)",
    komponente: RavelRechner,
  },
];

// Reihenfolge der Rubriken in der Liste. Steht ein Rechner in keiner, landet er
// unter der letzten — so fehlt nie einer, wenn eine neue Rubrik dazukommt.
const GRUPPEN = ["Hydraulik", "Wärmeerzeugung", "Wirtschaftlichkeit"];

// Ein Rechner beschreibt seine Felder entweder flach oder in Abschnitten wie im
// Excel-Blatt. Alles andere arbeitet mit der flachen Liste.
const abschnitteVon = (rechner) => rechner.abschnitte || [{ felder: rechner.felder || [] }];
const felderVon = (rechner) => abschnitteVon(rechner).flatMap((a) => a.felder);

const startwerte = (rechner) =>
  Object.fromEntries(felderVon(rechner).map(([key, , , wert]) => [key, String(wert)]));

// So viele Spalten wie Ergebnisse — sonst bleibt neben einem einzelnen Wert
// eine leere Fläche stehen.
const SPALTEN = { 1: "", 2: "sm:grid-cols-2" };

function Resultat({ rechner, resultat, werte }) {
  if (!resultat) return null;
  const diagramm = rechner.diagramm?.(resultat) || rechner.diagrammAusEingabe?.(werte);
  return (
    <div className="mt-6 border-t border-slate-300 pt-5">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Resultat</div>
      <div className={"grid gap-px border border-slate-300 bg-slate-300 " +
        (SPALTEN[rechner.ergebnisse.length] ?? "sm:grid-cols-2 lg:grid-cols-3")}>
        {rechner.ergebnisse.map(([key, label, einheit], index) => (
          <div key={key} className={"bg-white p-4 " + (index === 0 ? "border-l-2 border-l-brand-600" : "")}>
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-950">
              {Number(resultat[key]).toLocaleString("de-CH", { maximumFractionDigits: 3 })}
              {einheit && <span className="ml-1.5 text-sm font-medium text-slate-500">{einheit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {diagramm?.werte?.length > 1 && (
          <div>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Verteilung</div>
            <Balken werte={diagramm.werte} einheit={diagramm.einheit} dezimalen={diagramm.dezimalen} />
          </div>
        )}
        {resultat.rechenweg?.length > 0 && (
          <div>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rechenweg</div>
            <div className="space-y-2.5">
              {resultat.rechenweg.map((schritt, i) => (
                <div key={i} className="text-xs">
                  <div className="font-semibold text-slate-700">{schritt.formel}</div>
                  <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-slate-500">
                    <span className="break-all">= {schritt.eingesetzt}</span>
                    <span className="font-semibold text-brand-700">= {schritt.ergebnis}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EinzelberechnungenPage() {
  const [aktiv, setAktiv] = useState(RECHNER[0].id);
  const rechner = useMemo(() => RECHNER.find((item) => item.id === aktiv), [aktiv]);
  const [werteJeRechner, setWerteJeRechner] = useState(() => Object.fromEntries(RECHNER.map((item) => [item.id, startwerte(item)])));
  const [resultate, setResultate] = useState({});
  const [loading, setLoading] = useState(false);
  const [exportLaeuft, setExportLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const werte = werteJeRechner[rechner.id];

  const set = (key, value) => {
    setWerteJeRechner((alt) => ({ ...alt, [rechner.id]: { ...alt[rechner.id], [key]: value } }));
    setFehler("");
  };

  const eingabenBauen = () => {
    const eingaben = rechner.bauen
      ? rechner.bauen(werte)
      : Object.fromEntries(felderVon(rechner).map(([key, , , , typ]) => [key, typ === "select" ? werte[key] : ZAHL(werte[key])]));
    if (Object.values(eingaben).some((wert) => typeof wert === "number" && !Number.isFinite(wert))) {
      throw new Error("Bitte alle Eingabefelder mit gültigen Zahlen ausfüllen.");
    }
    return eingaben;
  };

  const berechnen = async () => {
    setLoading(true);
    setFehler("");
    try {
      const response = await api.post("/api/v1/einzelberechnungen/berechnen", { typ: rechner.id, eingaben: eingabenBauen() });
      setResultate((alt) => ({ ...alt, [rechner.id]: response.data.resultat }));
    } catch (error) {
      setFehler(error?.response?.data?.detail || error.message || "Berechnung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  // Das PDF rechnet im Backend noch einmal — damit im Export garantiert
  // dieselben Zahlen stehen wie auf dem Bildschirm.
  const exportieren = async () => {
    setExportLaeuft(true);
    setFehler("");
    try {
      const response = await api.post("/api/v1/einzelberechnungen/export", {
        typ: rechner.id,
        eingaben: eingabenBauen(),
        titel: rechner.titel,
        grundlage: rechner.quelle || "",
        eingabe_zeilen: felderVon(rechner).map(([key, label, einheit]) => ({
          label, wert: String(werte[key]), einheit: einheit || "",
        })),
        ergebnis_zeilen: rechner.ergebnisse.map(([key, label, einheit]) => ({
          label, wert: key, einheit: einheit || "",
        })),
        hinweise: (rechner.hinweise || []).map((h) => (h.url ? `${h.text}: ${h.url}` : h.text)),
      }, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${rechner.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFehler(error?.message || "Export fehlgeschlagen");
    } finally {
      setExportLaeuft(false);
    }
  };

  const Eigene = rechner.komponente;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <PageHeader
        back={{ to: "/start", label: "Start" }}
        title="Einzelberechnungen"
        subtitle="Schnelle technische Auslegungen ohne Projekt. Die Formeln laufen geprüft im Backend und basieren auf deinen Excel-Arbeitsblättern."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="card overflow-hidden">
          {GRUPPEN.map((gruppe, gi) => (
            <div key={gruppe}>
              <div className={"border-b border-slate-300 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 " +
                (gi > 0 ? "border-t" : "")}>
                {gruppe}
              </div>
              <div className="divide-y divide-slate-200">
                {RECHNER.filter((item) => item.gruppe === gruppe).map(({ id, icon: Icon, titel, kurz }) => (
                  <button key={id} type="button" onClick={() => { setAktiv(id); setFehler(""); }}
                    className={"flex w-full gap-3 border-l-2 px-4 py-3 text-left transition " +
                      (id === aktiv ? "border-brand-600 bg-brand-50/70" : "border-transparent bg-white hover:bg-slate-50")}>
                    <Icon className={"mt-0.5 size-5 shrink-0 " + (id === aktiv ? "text-brand-600" : "text-slate-400")} />
                    <span className="min-w-0">
                      <span className={"block text-sm font-semibold " + (id === aktiv ? "text-brand-800" : "text-slate-800")}>{titel}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">{kurz}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <section className="card p-5 sm:p-6">
          <div className="flex items-start gap-3 border-b border-slate-300 pb-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-slate-50 text-brand-600">
              <rechner.icon className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">{rechner.titel}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{rechner.kurz}</p>
              <p className="mt-1 text-[11px] text-slate-400">Grundlage: {rechner.quelle}</p>
            </div>
          </div>

          {Eigene ? (
            // Rechner mit eigener Maske: gleicher Rahmen, gleicher Kopf, gleicher
            // Ort — nur der Inhalt dazwischen ist seiner.
            <Eigene key={rechner.id} />
          ) : (
            <>
              {abschnitteVon(rechner).map((abschnitt, ai) => (
                <div key={abschnitt.titel || ai} className={ai === 0 ? "mt-5" : "mt-6"}>
                  {abschnitt.titel && (
                    <div className="mb-3 border-b border-slate-200 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {abschnitt.titel}
                    </div>
                  )}
                  <div className={"grid gap-4 sm:grid-cols-2 " + (rechner.spalten === 2 ? "" : "xl:grid-cols-3")}>
                    {abschnitt.felder.map(([key, label, einheit, , typ, optionen]) => (
                      <label key={key} className="block">
                        {/* Ohne Grossschreibung: kW ist nicht KW und Δθ nicht ΔΘ. */}
                        <span className="label normal-case">{label}{einheit ? ` [${einheit}]` : ""}</span>
                        {typ === "select" ? (
                          <select className="input" value={werte[key]} onChange={(e) => set(key, e.target.value)}>
                            {optionen.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                          </select>
                        ) : (
                          <input className="input font-mono tabular-nums" type="number" step="any" value={werte[key]}
                            onChange={(e) => set(key, e.target.value)} />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {rechner.hinweise?.length > 0 && (
                <ul className="mt-5 space-y-1 text-xs text-slate-500">
                  {rechner.hinweise.map((hinweis) => (
                    <li key={hinweis.text}>
                      {hinweis.text}
                      {hinweis.url && (
                        <>
                          {" "}
                          <a href={hinweis.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">
                            öffnen <ExternalLink className="size-3" />
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                <button type="button" className="btn-primary" disabled={loading} onClick={berechnen}>
                  <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} />
                  {loading ? "Berechne…" : "Berechnen"}
                </button>
                <button type="button" className="btn-secondary" disabled={exportLaeuft} onClick={exportieren}>
                  <FileDown className="size-4" />
                  {exportLaeuft ? "Erstelle…" : "PDF"}
                </button>
                <span className="text-xs text-slate-400">Keine Projektdaten werden gespeichert.</span>
              </div>
              {fehler && <div className="mt-4 border-l-2 border-red-500 bg-white px-3 py-2 text-sm text-red-700">{fehler}</div>}
              <Resultat rechner={rechner} resultat={resultate[rechner.id]} werte={werte} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
