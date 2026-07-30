import { useMemo, useState } from "react";
import {
  Activity, CircleGauge, Flame, Gauge, MoveHorizontal, RefreshCw, Scale, Waves,
} from "lucide-react";
import { api } from "../../api";
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
    kurz: "Jahresenergie für Raumheizung und Warmwasser als schnelle Vorbemessung.",
    quelle: "Jahresenergiebedarf Heizung und BWW.xlsx",
    felder: [
      ["heizleistung_kw", "Heizleistung", "kW", 30],
      ["vollbetriebsstunden_h_d", "Vollbetriebsstunden", "h/Tag", 17],
      ["heizgradtage_kd_a", "Heizgradtage", "Kd/a", 3432],
      ["auslegungs_delta_t_k", "Auslegungs-ΔT", "K", 28],
      ["bww_m3_d", "BWW-Tagesverbrauch", "m³/Tag", 0.388],
      ["bww_verlustfaktor", "BWW-Verlustfaktor", "–", 1.5],
    ],
    ergebnisse: [
      ["heizung_kwh_a", "Raumheizung", "kWh/a"],
      ["bww_kwh_a", "Warmwasser", "kWh/a"],
      ["total_kwh_a", "Gesamtenergie", "kWh/a"],
    ],
  },
  {
    id: "jaz",
    gruppe: "Wärmeerzeugung",
    icon: Activity,
    titel: "JAZ & Stromkosten",
    kurz: "COP nach Temperaturstunden gewichten und jährlichen Strombedarf abschätzen.",
    quelle: "JAZ.xlsx",
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

const startwerte = (rechner) =>
  Object.fromEntries((rechner.felder || []).map(([key, , , wert]) => [key, String(wert)]));

// So viele Spalten wie Ergebnisse — sonst bleibt neben einem einzelnen Wert
// eine leere Fläche stehen.
const SPALTEN = { 1: "", 2: "sm:grid-cols-2" };

function Resultat({ rechner, resultat }) {
  if (!resultat) return null;
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
    </div>
  );
}

export default function EinzelberechnungenPage() {
  const [aktiv, setAktiv] = useState(RECHNER[0].id);
  const rechner = useMemo(() => RECHNER.find((item) => item.id === aktiv), [aktiv]);
  const [werteJeRechner, setWerteJeRechner] = useState(() => Object.fromEntries(RECHNER.map((item) => [item.id, startwerte(item)])));
  const [resultate, setResultate] = useState({});
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState("");
  const werte = werteJeRechner[rechner.id];

  const set = (key, value) => {
    setWerteJeRechner((alt) => ({ ...alt, [rechner.id]: { ...alt[rechner.id], [key]: value } }));
    setFehler("");
  };

  const berechnen = async () => {
    setLoading(true);
    setFehler("");
    try {
      const eingaben = rechner.bauen
        ? rechner.bauen(werte)
        : Object.fromEntries(rechner.felder.map(([key, , , , typ]) => [key, typ === "select" ? werte[key] : ZAHL(werte[key])]));
      if (Object.values(eingaben).some((wert) => typeof wert === "number" && !Number.isFinite(wert))) {
        throw new Error("Bitte alle Eingabefelder mit gültigen Zahlen ausfüllen.");
      }
      const response = await api.post("/api/v1/einzelberechnungen/berechnen", { typ: rechner.id, eingaben });
      setResultate((alt) => ({ ...alt, [rechner.id]: response.data.resultat }));
    } catch (error) {
      setFehler(error?.response?.data?.detail || error.message || "Berechnung fehlgeschlagen");
    } finally {
      setLoading(false);
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
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rechner.felder.map(([key, label, einheit, , typ, optionen]) => (
                  <label key={key} className="block">
                    <span className="label">{label}{einheit ? ` [${einheit}]` : ""}</span>
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

              <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
                <button type="button" className="btn-primary" disabled={loading} onClick={berechnen}>
                  <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} />
                  {loading ? "Berechne…" : "Berechnen"}
                </button>
                <span className="text-xs text-slate-400">Keine Projektdaten werden gespeichert.</span>
              </div>
              {fehler && <div className="mt-4 border-l-2 border-red-500 bg-white px-3 py-2 text-sm text-red-700">{fehler}</div>}
              <Resultat rechner={rechner} resultat={resultate[rechner.id]} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
