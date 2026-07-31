import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Upload, FileText, Check, CheckCircle2, AlertTriangle, Trash2, Plus, ChevronDown, Loader2 } from "lucide-react";
import {
  uploadLvImport, listLvImports, getLvImport, getFachwerte, getNormLv,
  updateLvFeature, updateLvCost, addLvCost, deleteLvCost, updateLvCommercial,
  updateLvImport, approveLvImport,
} from "../../api/hcApi";
import { GENERATOR_TYPES } from "../../components/hc/nodes/generatorTypes";
import PageHeader from "../../components/ui/PageHeader";
import { LEER, chf, zahl } from "../../lib/format";
import { PROCESSING, processingSchritt } from "./lvImportProgress";

// B9 — Review-Seite des LV-Imports. Ohne :id ist es die Upload-Ansicht.
// Aus einem Unternehmer-LV entsteht ein geprüfter technischer Fingerprint +
// reale BKP-Kosten; erst die Freigabe übernimmt die Daten als Referenzprojekt.

// Mehrwertige Merkmale kommen aus der zentralen Registry (Punkt 6/7) und werden
// als Checkbox-Gruppe dargestellt, nicht als Zahlenfeld.
const MULTI_FEATURES = {};

// FastAPI liefert Fehler teils als Text und teils strukturiert als
// { code, message }. React darf dieses Objekt nie direkt rendern.
const apiFehlertext = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof detail?.message === "string" && detail.message.trim()) return detail.message;
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
};

const KATEGORIEN = [
  // Bewusst kurz: nur Kennwerte, die für die Kostenauswertung belastbar sind.
  // Speicher, Verteilsystem, Temperaturen und Bauablaufmerkmale sind entfallen —
  // technisch interessant, für den Kostenvergleich aber ohne Nutzen.
  { titel: "Wärmeerzeuger", keys: ["generator_type", "generator_power_kw"] },
  {
    titel: "Erdsonden",
    keys: ["borehole_count", "borehole_length_each_m", "borehole_total_m"],
    // Nur zeigen, wenn Bohrungen erkannt wurden oder ein Sole-System vorliegt.
    nurWenn: (byKey) =>
      Number(byKey.borehole_count?.effective_value) > 0
      || Number(byKey.borehole_total_m?.effective_value) > 0
      || byKey.generator_type?.effective_value === "ews_wp",
  },
  { titel: "Frischwasserstation", keys: ["fresh_water_station_present"] },
  { titel: "Rohrmeter", keys: ["pipe_length_m"] },
  { titel: "Pumpen", keys: ["pump_count"] },
  { titel: "Wärmemessung", keys: ["heat_metering_present", "heat_meter_count"] },
];

// Wird gerechnet, nicht eingegeben — im Review nur lesbar.
const ABGELEITET = new Set(["borehole_total_m"]);

// Wer liefert, wer montiert — für die Anzeige der Anlagensysteme.
const WER = { contractor: "Unternehmer", others: "bauseits/fremd" };

// Merkmale mit Ja/Nein statt Zahleneingabe.
const BOOL_FEATURES = new Set([
  "fresh_water_station_present", "heat_metering_present",
]);
const SCOPE_LABEL = {
  included: "enthalten",
  installed_by_contractor: "Lieferung bauseits, Montage Unternehmer",
  by_others: "bauseits",
  supplied_by_others: "Lieferung bauseits",
  excluded: "nicht enthalten",
  optional: "Option",
  requested_not_priced: "angefragt, nicht beziffert",
  unknown: "unklar",
};

const CONF_STYLE = {
  high: "bg-green-100 text-green-700", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-500",
};
const CONF_LABEL = { high: "hohe Sicherheit", medium: "prüfen", low: "unsicher" };

const STATUS_STYLE = {
  approved: "bg-slate-100 text-slate-700", review: "bg-slate-100 text-slate-700",
  extracted: "bg-slate-100 text-slate-700", uploaded: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
};
// Der Status ist im Backend ein englischer Enum-Wert; im UI steht immer Deutsch.
const STATUS_LABEL = {
  approved: "Freigegeben", review: "Zu prüfen", extracted: "Erkannt – unsicher",
  uploaded: "Hochgeladen", failed: "Fehlgeschlagen",
};
const statusText = (status) => STATUS_LABEL[status] || STATUS_LABEL.uploaded;

// P0 #1 — Herkunft des Textes: aus digitaler Textebene oder per OCR erkannt.
// tag = kleiner Marker an jeder Fundstelle, damit im Review sichtbar ist, ob ein
// Wert aus Digitaltext oder OCR kommt.
const METHODE = {
  spatial_pdf: { kopf: "digitaler Text mit Tabellenerkennung", tag: "Tabelle", tagStyle: "bg-slate-100 text-slate-500" },
  text: { kopf: "digitaler Text", tag: "Digital", tagStyle: "bg-slate-100 text-slate-500" },
  digital: { kopf: "durchsuchbar (digitaler Text)", tag: "Digital", tagStyle: "bg-slate-100 text-slate-500" },
  ocr: { kopf: "per OCR (Deutsch) erkannt", tag: "OCR", tagStyle: "bg-amber-100 text-amber-800" },
  image: { kopf: "Bild-PDF ohne Textebene", tag: "manuell", tagStyle: "bg-slate-100 text-slate-500" },
  manual: { kopf: "manuell erfasst", tag: "manuell", tagStyle: "bg-slate-100 text-slate-500" },
};
// Alt-Importe ohne gespeicherte Methode aus is_searchable herleiten.
const methodeOf = (imp) => METHODE[imp.extract_method] ? imp.extract_method : (imp.is_searchable ? "text" : "image");

// Punkt 17 — WIE die Norm-LV-Zuordnung entstanden ist. Für die Prüfung zählt
// die Methode (deterministisch oder Vorschlag), nicht der Anbieter dahinter;
// welches Modell geantwortet hat, gehört in den Debug-Bereich, nicht hierher.
const MAPPING = {
  exact: { label: "Exakt", style: "border border-slate-200 bg-slate-50 text-slate-700",
    hilfe: "Titel stimmt wörtlich mit der Norm-LV-Position überein." },
  rule: { label: "Regel", style: "border border-slate-200 bg-slate-50 text-slate-700",
    hilfe: "Feste Zuordnungsregel im Backend — kein Modell beteiligt." },
  llm: { label: "Vorschlag", style: "border border-amber-200 bg-amber-50 text-amber-800",
    hilfe: "Automatischer Vorschlag. Bitte prüfen — er gilt erst, wenn du ihn bestätigst." },
  manual: { label: "Manuell", style: "border border-slate-200 bg-white text-slate-600",
    hilfe: "Von Hand zugeordnet." },
};
const NICHT_ZUGEORDNET = { label: "Nicht zugeordnet", style: "bg-amber-100 text-amber-700",
  hilfe: "Keine passende Norm-LV-Position gefunden." };

// Sichtbare Rückmeldung nach dem Speichern eines Feldes.
function Gespeichert({ an }) {
  if (!an) return null;
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-medium text-slate-600">
      <Check className="size-3" /> gespeichert
    </span>
  );
}

// Punkt 21 — vier klare Schritte statt einer langen Seite.
const SCHRITTE = [
  { key: "projekt", titel: "Projekt" },
  { key: "technik", titel: "Technik" },
  { key: "kosten", titel: "Kosten" },
  { key: "freigabe", titel: "Prüfen & Freigeben" },
];

// Aufklappbare Fundstelle (Punkt 12/22): kompakte Zeile, Details auf Wunsch.
function Quelle({ feature, tag, tagStyle }) {
  const [offen, setOffen] = useState(false);
  if (!feature.source_text && !feature.derived_from) return null;
  const mehr = feature.source_excerpt && feature.source_excerpt !== feature.source_text;
  return (
    <div className="mt-1 text-[11px] text-slate-400">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagStyle}`} title="Herkunft des Werts">{tag}</span>
        {feature.derived_from
          ? <span className="font-medium text-slate-500">Berechnet: {feature.derived_from}</span>
          : <span>{feature.source_page != null ? `Seite ${feature.source_page}: ` : ""}„{feature.source_text}"</span>}
        {mehr && (
          <button type="button" onClick={() => setOffen((o) => !o)}
            className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700 hover:underline">
            Quelle anzeigen <ChevronDown className={`size-3 transition ${offen ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {offen && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-500">
          {feature.source_page != null ? `Seite ${feature.source_page}\n` : ""}{feature.source_excerpt}
        </pre>
      )}
    </div>
  );
}

// Handschriftliche Korrektur: beide Stände nebeneinander, damit im Review
// sichtbar bleibt, was gedruckt stand und was von Hand kam.
function Handschrift({ feature }) {
  if (!feature.corrected_value && !feature.printed_value) return null;
  const gilt = feature.selected_source === "corrected" ? feature.corrected_value : feature.printed_value;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-l-brand-300 bg-brand-50/50 px-2.5 py-1.5 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-slate-500">Handschrift</span>
      <span className="text-slate-500">
        gedruckt <span className="font-mono line-through">{feature.printed_value ?? "—"}</span>
      </span>
      <span className="text-slate-500">
        korrigiert <span className="font-mono font-semibold text-slate-800">{feature.corrected_value ?? "—"}</span>
      </span>
      <span className="font-semibold text-brand-700">gilt: {gilt ?? "—"}</span>
      {feature.source_page != null && <span className="text-slate-400">Seite {feature.source_page}</span>}
      {feature.requires_review && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
          unsicher — bitte prüfen
        </span>
      )}
    </div>
  );
}

// Wärmeabgabe und Wärmeerzeugung. Mehrere Systeme gleichzeitig sind der
// Normalfall, darum eine Liste statt eines einzelnen Feldes.
function AnlagenSysteme({ systeme }) {
  if (!systeme?.length) return null;
  const gruppen = [
    ["heat_emission", "Wärmeabgabe"],
    ["heat_generation", "Wärmeerzeugung"],
  ];
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-bold text-slate-800">Anlagensysteme</h2>
      </div>
      {gruppen.map(([kind, titel]) => {
        const rows = systeme.filter((s) => s.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind}>
            <div className="border-b border-slate-100 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              {titel}
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((s) => (
                <div key={s.id ?? `${s.kind}-${s.type_code}`} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-slate-900">{s.label || s.type_code}</span>
                    {s.count != null && (
                      <span className="font-mono text-sm tabular-nums text-slate-700">{s.count} Stk.</span>
                    )}
                    {s.capacity_kw != null && (
                      <span className="font-mono text-sm tabular-nums text-slate-700">{s.capacity_kw} kW</span>
                    )}
                    {(s.manufacturer || s.model) && (
                      <span className="text-xs text-slate-500">{[s.manufacturer, s.model].filter(Boolean).join(" ")}</span>
                    )}
                    {s.existing_or_new && (
                      <span className="text-xs text-slate-400">
                        {s.existing_or_new === "existing" ? "bestehend" : "neu"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {s.scope_status && (
                      <span className={"rounded-full px-2 py-0.5 font-semibold "
                        + (s.scope_status === "included" ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-800")}>
                        {SCOPE_LABEL[s.scope_status] || s.scope_status}
                      </span>
                    )}
                    {s.supplied_by && <span>Lieferung: {WER[s.supplied_by] || s.supplied_by}</span>}
                    {s.installation_by && <span>Montage: {WER[s.installation_by] || s.installation_by}</span>}
                    {s.source_page != null && <span>Seite {s.source_page}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// Kontrollierte Mehrfachauswahl aus der zentralen Registry (Punkt 6/7).
function MultiSelect({ optionen, werte, disabled, onChange }) {
  const gesetzt = new Set(werte);
  const toggle = (code) => {
    const neu = new Set(gesetzt);
    if (neu.has(code)) neu.delete(code); else neu.add(code);
    onChange(optionen.filter((o) => neu.has(o.code)).map((o) => o.code));
  };
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {optionen.map((o) => (
        <label key={o.code}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${gesetzt.has(o.code) ? "border-brand-400 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
          <input type="checkbox" checked={gesetzt.has(o.code)} disabled={disabled}
            onChange={() => toggle(o.code)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function ProcessingAnsicht({ schritt, vergangen }) {
  const aktuell = PROCESSING[schritt];
  const minuten = Math.floor(vergangen / 60);
  const sekunden = vergangen % 60;
  const zeit = minuten ? `${minuten}:${String(sekunden).padStart(2, "0")} min` : `${sekunden} s`;
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="card p-6">
        <div className="flex items-center gap-2 text-slate-800">
          <Loader2 className="size-5 animate-spin text-brand-500" />
          <h1 className="text-base font-bold">PDF wird analysiert …</h1>
        </div>
        <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2">
          <p className="text-xs font-semibold text-brand-700">Aktueller Schritt (geschätzt): {aktuell.titel}</p>
          <p className="mt-0.5 text-[11px] text-brand-600">{aktuell.detail}</p>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>Vergangene Zeit: {zeit}</span>
          <span>Typisch etwa 30–120 Sekunden</span>
        </div>
        <ul className="mt-5 space-y-2.5">
          {PROCESSING.map((item, i) => (
            <li key={item.titel} className="flex items-center gap-2.5 text-sm">
              {i < schritt
                ? <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                : i === schritt
                  ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-500" />
                  : <span className="size-4 shrink-0 rounded-full border border-slate-200" />}
              <span className={i <= schritt ? "text-slate-700" : "text-slate-300"}>{item.titel}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Punkt 25 — Zusammenfassung nach der Verarbeitung.
function ImportZusammenfassung({ report, imp }) {
  if (!report || !Object.keys(report).length) return null;
  const zeilen = [
    [`${report.page_count ?? imp.page_count} Seiten gelesen`, true],
    [`${report.kostenpositionen ?? 0} Kostenpositionen erkannt`, (report.kostenpositionen ?? 0) > 0],
    [`${report.commercial?.conditions?.length || 0} Konditionen erkannt`, true],
  ];
  return (
    <div className="mb-5 max-w-5xl border-b border-slate-200 pb-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
        {zeilen.map(([text, ok]) => (
          <li key={text} className={ok ? "" : "text-slate-400"}>· {text}</li>
        ))}
      </ul>
      {(report.deterministic_checks || []).map(check => (
        <p key={check.code} className="mt-1 text-[11px] font-medium text-amber-700">
          Plausibilitätsprüfung: {check.message}
        </p>
      ))}
      {(report.visual_review_issues || []).map((warning, index) => (
        <p key={`${warning}-${index}`} className="mt-1 text-[11px] font-semibold text-red-700">
          Auswertung blockiert: {warning}
        </p>
      ))}
    </div>
  );
}

// ── Upload-Ansicht (ohne :id) ───────────────────────────────────────────────
function UploadAnsicht() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imports, setImports] = useState([]);
  const [ueberZone, setUeberZone] = useState(false);

  useEffect(() => {
    listLvImports()
      .then((data) => setImports(Array.isArray(data) ? data : []))
      .catch(() => setError("Bisherige LV-Importe konnten nicht geladen werden."));
  }, []);

  // Punkt 24 — der Upload arbeitet synchron; statt Fake-Prozenten laufen die
  // Schritte optisch weiter, damit die Seite nicht eingefroren wirkt.
  const [schritt, setSchritt] = useState(0);
  const [vergangen, setVergangen] = useState(0);
  useEffect(() => {
    if (!busy) { setSchritt(0); setVergangen(0); return undefined; }
    const started = Date.now();
    const t = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setVergangen(seconds);
      setSchritt(processingSchritt(seconds));
    }, 1000);
    return () => clearInterval(t);
  }, [busy]);

  const hochladen = async (file) => {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      setError("Nur PDF wird unterstützt.");
      return;
    }
    setBusy(true); setError("");
    try {
      const imp = await uploadLvImport(file);
      navigate(`/auswertung/import/${imp.id}`);
    } catch (err) {
      setError(apiFehlertext(err, "Upload fehlgeschlagen. Nur PDF wird unterstützt."));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // dieselbe Datei bleibt danach erneut wählbar
    hochladen(file);
  };

  if (busy) return <ProcessingAnsicht schritt={schritt} vergangen={vergangen} />;

  return (
    <div className="px-5 py-7 lg:px-10 xl:px-12">
      <PageHeader
        back={{ to: "/auswertung", label: "Auswertung" }}
        title="Unternehmer-LV importieren"
        subtitle="Aus einem alten LV entstehen ein technischer Fingerprint und reale BKP-Kosten. Gescannte PDFs werden automatisch per deutscher OCR gelesen."
      />

      {error && <div className="mb-4 max-w-5xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="max-w-5xl">
      {/* Die gestrichelte Fläche sieht aus wie eine Ablagezone — also ist sie
          auch eine: Klick und Drag & Drop führen zum selben Upload. */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        onDragOver={(e) => { e.preventDefault(); setUeberZone(true); }}
        onDragLeave={() => setUeberZone(false)}
        onDrop={(e) => { e.preventDefault(); setUeberZone(false); hochladen(e.dataTransfer.files?.[0]); }}
        className={"flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 transition "
          + (ueberZone ? "border-slate-800 bg-slate-50 text-slate-700" : "border-slate-300 bg-white text-slate-500 hover:border-slate-400")}
      >
        <Upload className="size-6" />
        <span className="text-sm font-semibold">PDF hier ablegen oder auswählen</span>
        <span className="text-xs text-slate-400">Submission oder LV · das Original bleibt gespeichert</span>
      </button>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />

      {imports.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-brand-200 bg-brand-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-full py-2 pl-3 pr-3">Datei</th>
                <th className="whitespace-nowrap py-2 pr-3">Projekt</th>
                <th className="whitespace-nowrap py-2 pr-3">Unternehmer</th>
                <th className="whitespace-nowrap py-2 pr-3 text-right">Seiten</th>
                <th className="whitespace-nowrap py-2 pr-3">Hochgeladen</th>
                <th className="whitespace-nowrap py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((imp) => (
                <tr key={imp.id} onClick={() => navigate(`/auswertung/import/${imp.id}`)}
                  className="cursor-pointer transition odd:bg-white even:bg-slate-50/70 hover:bg-brand-50/60">
                  <td className="max-w-0 truncate py-2 pl-3 pr-3">
                    <Link to={`/auswertung/import/${imp.id}`} onClick={(e) => e.stopPropagation()}
                      className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-900 hover:text-brand-700">
                      <FileText className="size-4 shrink-0 text-slate-400" />
                      <span className="truncate">{imp.filename}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{imp.grunddaten?.projekt_name || LEER}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{imp.grunddaten?.unternehmer || LEER}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{zahl(imp.page_count)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-slate-400">
                    {imp.created_at ? new Date(imp.created_at).toLocaleDateString("de-CH") : LEER}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[imp.status] || STATUS_STYLE.uploaded}`}>
                      {statusText(imp.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

// Kleine Zeile zum manuellen Hinzufügen einer BKP-Kostenposition (P0 Item 3).
function NeueKostZeile({ onAdd }) {
  const [bkp, setBkp] = useState("");
  const [betrag, setBetrag] = useState("");
  const [busy, setBusy] = useState(false);

  const hinzufuegen = async () => {
    if (!bkp.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(bkp.trim(), betrag === "" ? null : betrag);
      setBkp(""); setBetrag("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-50/40 px-4 py-3 sm:px-5">
      <input className="input w-24" placeholder="BKP-Nr." value={bkp}
        onChange={(e) => setBkp(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") hinzufuegen(); }} />
      <span className="text-xs text-slate-400">CHF</span>
      <input className="input w-28" type="number" placeholder="Betrag" value={betrag}
        onChange={(e) => setBetrag(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") hinzufuegen(); }} />
      <button onClick={hinzufuegen} disabled={!bkp.trim() || busy} className="btn-secondary min-h-8">
        <Plus className="size-4" /> Position hinzufügen
      </button>
    </div>
  );
}

function KonditionenEditor({ imp, gesperrt, onSaved }) {
  const toRow = (condition) => ({
    ...condition,
    original_label: condition.original_label || "",
    kind: condition.kind || "percent",
    direction: condition.direction || "deduction",
    rate_percent: condition.rate_percent ?? "",
    amount: condition.amount ?? "",
    basis_amount: condition.basis_amount ?? "",
  });
  const [rows, setRows] = useState(() => (imp.conditions || []).map(toRow));
  const [vatRate, setVatRate] = useState(imp.report?.commercial?.vat_rate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows((imp.conditions || []).map(toRow));
    setVatRate(imp.report?.commercial?.vat_rate ?? "");
  }, [imp.conditions, imp.report?.commercial?.vat_rate]);

  const patchRow = (index, patch) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const addRow = () => setRows((current) => [...current, {
    original_label: "Sonstiger Abzug", kind: "percent",
    direction: "deduction", rate_percent: "", amount: "", basis_amount: "",
  }]);
  const save = async () => {
    setSaving(true); setError("");
    try {
      const result = await updateLvCommercial(imp.id, {
        vat_rate: vatRate,
        conditions: rows,
      });
      onSaved(result);
    } catch (err) {
      setError(apiFehlertext(err, "Konditionen konnten nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };
  const commercial = imp.report?.commercial || {};

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Kommerzielle Konditionen</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">Rabatt, Skonto und sonstige Abzüge vor der Freigabe prüfen oder ergänzen.</p>
        </div>
        {!gesperrt && (
          <button type="button" onClick={addRow} className="btn-secondary min-h-8">
            <Plus className="size-4" /> Abzug ergänzen
          </button>
        )}
      </div>
      {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 sm:mx-5">{error}</p>}
      <div className="grid grid-cols-[1fr_auto] border-b border-slate-200 px-4 py-3 text-sm sm:px-5">
        <strong>Brutto / LV-Summe</strong>
        <strong className="tabular-nums">{chf(commercial.base_amount ?? imp.report?.trade_total ?? 0)}</strong>
      </div>
      <div className="hidden grid-cols-[1.5fr_.65fr_.7fr_.7fr_auto] gap-2 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:grid sm:px-5">
        <span>Bezeichnung</span><span>Satz</span><span className="text-right">Abzug/Zuschlag</span><span className="text-right">Zwischentotal</span><span />
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((condition, index) => (
          <div key={condition.id || `new-${index}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[1.5fr_.65fr_.7fr_.7fr_auto] sm:items-center sm:px-5">
            <div>
              <input className="input" disabled={gesperrt} value={condition.original_label}
                onChange={(e) => patchRow(index, { original_label: e.target.value })} />
              {!gesperrt && (
                <div className="mt-1 flex gap-1">
                  <select className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px]" value={condition.kind}
                    onChange={(e) => patchRow(index, { kind: e.target.value })}>
                    <option value="percent">Prozent</option><option value="fixed">Fixbetrag</option>
                  </select>
                  <select className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px]" value={condition.direction}
                    onChange={(e) => patchRow(index, { direction: e.target.value })}>
                    <option value="deduction">Abzug</option><option value="surcharge">Zuschlag</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <input className="input" type="number" step="0.01" disabled={gesperrt}
                value={condition.kind === "percent" ? condition.rate_percent : condition.amount}
                onChange={(e) => patchRow(index, condition.kind === "percent"
                  ? { rate_percent: e.target.value } : { amount: e.target.value })} />
              <span className="mt-0.5 block text-[10px] text-slate-400">{condition.kind === "percent" ? "%" : "CHF"}</span>
            </div>
            <div className={`text-right text-sm font-medium ${condition.direction === "deduction" ? "text-slate-700" : "text-green-700"}`}>
              {condition.status === "requested_not_priced" ? (
                // «Anfrage» ist kein Abzug von null, sondern eine offene
                // Verhandlungsposition — sie darf nicht als Betrag erscheinen.
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  angefragt, nicht beziffert
                </span>
              ) : condition.calculated_amount != null
                ? `${condition.direction === "deduction" ? "−" : "+"} ${chf(Math.abs(condition.calculated_amount))}`
                : "wird beim Speichern berechnet"}
            </div>
            <div className="text-right text-sm font-bold text-slate-800">
              {chf(condition.running_total)}
            </div>
            {!gesperrt && (
              <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                className="btn-ghost min-h-9 min-w-9 text-slate-400 hover:text-red-500" title="Kondition entfernen">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {!rows.length && <p className="px-4 py-4 text-xs text-slate-400 sm:px-5">Noch keine Konditionen erfasst.</p>}
      </div>
      <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-sm sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-40">
            <label className="label">MWST %</label>
            <input className="input" type="number" step="0.1" disabled={gesperrt}
              value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          </div>
          {!gesperrt && <button type="button" onClick={save} disabled={saving} className="btn-primary">{saving ? "Berechnet…" : "Konditionen speichern"}</button>}
        </div>
        {commercial.subtotal_excl_vat != null && (
          <div className="space-y-1 border-t border-slate-200 pt-2">
            <div className="flex justify-between"><span>Zwischentotal exkl. MWST</span><strong className="tabular-nums">{chf(commercial.subtotal_excl_vat)}</strong></div>
            <div className="flex justify-between"><span>MWST {commercial.vat_rate} %</span><span className="tabular-nums">{chf(commercial.vat_amount)}</span></div>
            <div className="flex justify-between text-base"><strong>Endsumme inkl. MWST</strong><strong className="tabular-nums">{chf(commercial.total_incl_vat)}</strong></div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Review-Ansicht (mit :id) ────────────────────────────────────────────────
function ReviewAnsicht({ id }) {
  const [imp, setImp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [schritt, setSchritt] = useState(0);
  const [gespeichert, setGespeichert] = useState(null); // zuletzt gespeichertes Feld

  const [listen, setListen] = useState(null);
  const [normLv, setNormLv] = useState(null);

  useEffect(() => {
    getLvImport(id).then(setImp).catch(() => setError("Import konnte nicht geladen werden")).finally(() => setLoading(false));
    // Punkt 5/20 — Auswahllisten zentral holen, keine Kopie im Frontend.
    getFachwerte().then((f) => setListen(f.listen)).catch(() => {});
    getNormLv().then(setNormLv).catch(() => {});
  }, [id]);

  // ACHTUNG: alle Hooks MÜSSEN vor den frühen `return`s stehen. React verlangt
  // in jedem Render dieselbe Hook-Reihenfolge; ein useMemo nach `if (loading)
  // return …` wird im ersten Render übersprungen und lässt die Seite beim
  // zweiten Render abstürzen (weisser Bildschirm).
  // Punkt 23 — Kosten nach BKP-Gruppe bündeln; das Gruppentotal ist eine eigene
  // Kontrollzeile und wird nicht als Einzelposition mitgezählt.
  const kostenGruppen = useMemo(() => {
    const map = new Map();
    for (const c of imp?.costs || []) {
      const g = c.bkp_nr || "—";
      if (!map.has(g)) map.set(g, { gruppe: g, positionen: [], total: null });
      if (c.is_group_total) map.get(g).total = c;
      else map.get(g).positionen.push(c);
    }
    for (const eintrag of map.values()) {
      eintrag.positionen.sort((a, b) =>
        String(a.original_position || a.bkp_nr).localeCompare(String(b.original_position || b.bkp_nr), "de", { numeric: true }));
      const summe = eintrag.positionen.reduce((s, c) => s + (c.effective_amount ?? 0), 0);
      if (!eintrag.total && eintrag.positionen.length) {
        eintrag.total = { effective_amount: summe, sum_hint: "(Summe der Positionen)" };
      } else if (eintrag.total && eintrag.positionen.length) {
        const diff = Math.abs((eintrag.total.effective_amount ?? 0) - summe);
        eintrag.total = { ...eintrag.total, sum_hint: diff > 1 ? `(Positionen: ${zahl(summe)})` : null };
      }
    }
    return [...map.values()].sort((a, b) => a.gruppe.localeCompare(b.gruppe, "de", { numeric: true }));
  }, [imp?.costs]);

  if (loading) return <div className="p-8 text-sm text-slate-400">Lade Import…</div>;
  if (!imp) return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-4 text-red-600">{error}</div>
      <Link to="/auswertung/import" className="text-sm text-brand-600 hover:underline">← Zurück zum Upload</Link>
    </div>
  );

  const featureByKey = Object.fromEntries((imp.features || []).map((f) => [f.key, f]));
  const methode = methodeOf(imp);
  const M = METHODE[methode];
  const gesperrt = imp.status === "approved";
  const featTotal = (imp.features || []).length;
  const featGeprueft = (imp.features || []).filter((f) => f.confirmed).length;
  // Verwendete Kosten = Positionen mit effektivem Betrag; sie müssen bestätigt sein.
  const kostenVerwendet = (imp.costs || []).filter((c) => c.effective_amount != null);
  const kostenOffen = kostenVerwendet.filter((c) => !c.confirmed).length;
  // Verwendete Kosten = Einzelpositionen; Gruppentotale nur wo es keine gibt
  // (dieselbe Regel wie im Backend bei der Freigabe — keine Doppelzählung).
  // Nur bestätigt zugeordnete Positionen landen in den Referenzkosten.
  const referenzTotal = (imp.costs || [])
    .filter((c) => c.in_reference)
    .reduce((s, c) => s + (c.effective_amount ?? 0), 0);
  const zuordnungOffen = (imp.costs || []).filter(
    (c) => !c.is_group_total && c.effective_amount != null && !c.mapping_confirmed).length;
  const kostenTotal = kostenGruppen.reduce((s, g) => s + (
    g.positionen.length
      ? g.positionen.reduce((x, c) => x + (c.effective_amount ?? 0), 0)
      : (g.total?.effective_amount ?? 0)
  ), 0);
  // Punkt 15 — dritte Summe: was gelesen wurde, aber nicht in die Referenz geht.
  // Als Rest definiert, damit Summe 2 + Summe 3 immer genau Summe 1 ergibt.
  const ausserhalbTotal = Math.max(0, kostenTotal - referenzTotal);
  const alleGeprueft = featTotal > 0 && featGeprueft === featTotal
    && kostenOffen === 0 && zuordnungOffen === 0;
  const grunddatenGesetzt = ["ebf_m2", "anzahl_einheiten", "gebaeudetyp", "projektart",
    "zertifizierung", "region", "projekt_name"]
    .some((k) => imp.grunddaten?.[k] != null && imp.grunddaten?.[k] !== "");
  // Fortschritt je Schritt für den Stepper (Freigabe selbst ist nie „fertig").
  const schrittFertig = [
    grunddatenGesetzt,
    featTotal > 0 && featGeprueft === featTotal,
    kostenOffen === 0,
    false,
  ];
  // Wie viel ist in jedem Schritt noch offen — steht am Schritt selbst, nicht
  // erst darin versteckt.
  const schrittOffen = [0, featTotal - featGeprueft, kostenOffen + zuordnungOffen, 0];

  // Alle Felder speichern beim Verlassen. Ohne Rückmeldung weiss niemand, ob
  // der Wert angekommen ist; die Markierung verschwindet nach kurzer Zeit.
  const merkeGespeichert = (schluessel) => {
    setGespeichert(schluessel);
    clearTimeout(merkeGespeichert.timer);
    merkeGespeichert.timer = setTimeout(() => setGespeichert(null), 1800);
  };

  const setFeature = async (feature, patch) => {
    const updated = await updateLvFeature(id, feature.id, patch);
    setImp((cur) => ({ ...cur, features: cur.features.map((f) => (f.id === feature.id ? updated : f)) }));
    merkeGespeichert(`f${feature.id}`);
  };
  const setCost = async (cost, patch) => {
    const updated = await updateLvCost(id, cost.id, patch);
    setImp((cur) => ({ ...cur, costs: cur.costs.map((c) => (c.id === cost.id ? updated : c)) }));
    merkeGespeichert(`c${cost.id}`);
  };
  const entferneKost = async (cost) => {
    await deleteLvCost(id, cost.id);
    setImp((cur) => ({ ...cur, costs: cur.costs.filter((c) => c.id !== cost.id) }));
  };
  const kostHinzufuegen = async (bkp_nr, betrag) => {
    const neu = await addLvCost(id, { bkp_nr, confirmed_amount: betrag, confirmed: true });
    setImp((cur) => ({ ...cur, costs: [...cur.costs, neu] }));
  };
  const setGrunddaten = async (patch) => {
    const updated = await updateLvImport(id, patch);
    setImp((cur) => ({ ...cur, grunddaten: updated.grunddaten }));
    merkeGespeichert(Object.keys(patch)[0]);
  };
  const alleBestaetigen = async () => {
    for (const f of (imp.features || []).filter((x) => !x.confirmed)) {
      await setFeature(f, { confirmed: true });
    }
    for (const c of kostenVerwendet.filter((x) => !x.confirmed || !x.mapping_confirmed)) {
      await setCost(c, { confirmed: true, mapping_confirmed: true });
    }
  };
  const freigeben = async () => {
    if (!confirm("Referenzdaten freigeben? Danach entsteht ein Referenzprojekt aus diesem Import.")) return;
    setApproving(true);
    setError("");
    try {
      const res = await approveLvImport(id);
      setImp((cur) => ({ ...cur, ...res.import }));
    } catch (err) {
      setError(apiFehlertext(err, "Freigabe fehlgeschlagen — bitte alle Werte und Kosten prüfen."));
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="px-5 py-7 lg:px-10 xl:px-12">
      <PageHeader
        back={{ to: "/auswertung/import", label: "LV-Import" }}
        title={imp.filename}
        subtitle={`${imp.page_count} Seite${imp.page_count === 1 ? "" : "n"} · ${M.kopf}`}
        actions={
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[imp.status] || STATUS_STYLE.uploaded}`}>
            {statusText(imp.status)}
          </span>
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {methode === "ocr" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kein digitaler Text — per OCR erkannt. Jede Fundstelle ist mit «OCR» markiert.
        </div>
      )}
      {methode === "image" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kein Text gefunden — Werte bitte manuell erfassen.
        </div>
      )}

      {/* Punkt 25 — was wurde beim Import erkannt */}
      <ImportZusammenfassung report={imp.report} imp={imp} />

      {/* Schritt-Navigation (Punkt 21) — mit der Zahl offener Punkte je Schritt */}
      <ol className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
        {SCHRITTE.map((s, i) => (
          <li key={s.key} className="flex">
            <button type="button" onClick={() => setSchritt(i)}
              className={"flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition "
                + (i === schritt ? "bg-brand-600 text-white" : "bg-white hover:bg-slate-50")}>
              <span className={"flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold "
                + (schrittFertig[i] ? "bg-slate-600 text-white" : i === schritt ? "bg-white text-slate-800" : "bg-slate-100 text-slate-500")}>
                {schrittFertig[i] ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="truncate text-xs font-semibold">{s.titel}</span>
              {schrittOffen[i] > 0 && (
                <span className={"ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-bold tabular-nums "
                  + (i === schritt ? "bg-amber-400 text-amber-950" : "bg-amber-100 text-amber-800")}
                  title={`${schrittOffen[i]} offene Angaben in diesem Schritt`}>
                  {schrittOffen[i]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>

      {/* Schritt 1 — Projekt (Punkt 20: kategoriale Werte als Select) */}
      {schritt === 0 && (
      <section className="card max-w-5xl overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-slate-800">Projektinformationen</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          {[
            ["projekt_name", "Projektname", "text"],
            ["projekt_nummer", "Projekt-Nr.", "text"],
            ["ort", "Ort", "text"],
            ["unternehmer", "Unternehmer", "text"],
            ["offert_datum", "Datum", "text"],
            ["gewerk", "Gewerk", "text"],
            ["waehrung", "Währung", "text"],
            ["region", "Region", "text"],
            ["ebf_m2", "EBF [m²]", "number"],
            ["anzahl_einheiten", "Nutzungseinheiten", "number"],
          ].map(([key, label, typ]) => (
            <div key={key}>
              <label className="label flex items-center gap-2">
                {label} <Gespeichert an={gespeichert === key} />
              </label>
              <input type={typ} className="input" disabled={gesperrt}
                defaultValue={imp.grunddaten?.[key] ?? ""}
                onBlur={(e) => setGrunddaten({ [key]: e.target.value })} />
            </div>
          ))}
          {[
            ["gebaeudetyp", "Gebäudenutzung", "building_uses"],
            ["projektart", "Projektart", "project_types"],
            ["zertifizierung", "Zertifizierung", "certifications"],
          ].map(([key, label, liste]) => (
            <div key={key}>
              <label className="label flex items-center gap-2">
                {label} <Gespeichert an={gespeichert === key} />
              </label>
              <select className="input" disabled={gesperrt || !listen}
                value={imp.grunddaten?.[key] ?? ""}
                onChange={(e) => setGrunddaten({ [key]: e.target.value })}>
                <option value="">— nicht erfasst —</option>
                {(listen?.[liste] || []).map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Schritt 2 — Technischer Fingerprint nach Kategorien */}
      {schritt === 1 && (
      <div className="max-w-5xl space-y-6">
        <AnlagenSysteme systeme={imp.systems} />
        {KATEGORIEN.filter((kat) => !kat.nurWenn || kat.nurWenn(featureByKey)).map((kat) => {
          const rows = kat.keys.map((k) => featureByKey[k]).filter(Boolean);
          if (!rows.length) return null;
          return (
            <section key={kat.titel} className="card overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                <h2 className="text-sm font-bold text-slate-800">{kat.titel}</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {rows.map((f) => {
                  const multi = MULTI_FEATURES[f.key];
                  const werte = (f.effective_value || "").split(",").map((s) => s.trim()).filter(Boolean);
                  return (
                  <div key={f.id} className={`grid gap-2 px-4 py-3.5 sm:px-5 ${!f.confirmed ? "border-l-4 border-l-amber-400 bg-amber-50/70" : ""} ${multi ? "" : "sm:grid-cols-[1fr_auto] sm:items-center"}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{f.label}</span>
                        {f.key === "heat_meter_count"
                          && featureByKey.heat_metering_present?.effective_value === "True"
                          && !f.effective_value && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            vorhanden, Anzahl nicht erkannt
                          </span>
                        )}
                      </div>
                      <Handschrift feature={f} />
                      {multi && listen && (
                        <div className="mt-2">
                          <MultiSelect
                            optionen={listen[multi] || []}
                            werte={werte}
                            disabled={gesperrt}
                            onChange={(codes) => setFeature(f, { confirmed_value: codes.join(","), confirmed: true })}
                          />
                          <label className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${f.confirmed ? "text-green-600" : "text-slate-400"}`}>
                            <input type="checkbox" disabled={gesperrt} checked={!!f.confirmed}
                              onChange={(e) => setFeature(f, { confirmed: e.target.checked })} />
                            geprüft
                          </label>
                        </div>
                      )}
                    </div>
                    {!multi && (
                    <div className="flex items-center gap-2 sm:justify-end">
                      {f.key === "generator_type" ? (
                        <select className="input w-52" disabled={gesperrt}
                          value={f.confirmed_value ?? (f.value ?? "")}
                          onChange={(e) => setFeature(f, { confirmed_value: e.target.value, confirmed: true })}>
                          <option value="">— nicht erkannt —</option>
                          {GENERATOR_TYPES.filter((type) => type.value !== "hybrid").map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      ) : BOOL_FEATURES.has(f.key) ? (
                        <select className="input w-36" disabled={gesperrt}
                          value={String(f.confirmed_value ?? f.value ?? "")}
                          onChange={(e) => setFeature(f, { confirmed_value: e.target.value, confirmed: true })}>
                          <option value="">— wählen —</option>
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : ABGELEITET.has(f.key) ? (
                        // Bohrmeter entstehen aus Anzahl × Länge. Ein eigenes
                        // Eingabefeld wäre eine dritte Zahl, die den beiden
                        // anderen widersprechen kann.
                        <div className="text-right">
                          <div className="font-mono text-sm tabular-nums text-slate-800">
                            {f.effective_value ? `${f.effective_value} m` : "—"}
                          </div>
                          <div className="text-[11px] text-slate-400">automatisch berechnet</div>
                        </div>
                      ) : (
                        <input
                          className="input w-36"
                          type="number"
                          step={["borehole_count", "pump_count", "heat_meter_count", "buffer_count"].includes(f.key) ? "1" : "0.1"}
                          disabled={gesperrt}
                          defaultValue={f.confirmed_value ?? (f.value ?? "")}
                          placeholder={f.value != null ? String(f.value) : "Wert eingeben"}
                          onBlur={(e) => setFeature(f, { confirmed_value: e.target.value, confirmed: true })}
                        />
                      )}
                      {f.unit && <span className="w-6 text-xs text-slate-400">{f.unit}</span>}
                      <label className={`inline-flex items-center gap-1 text-[11px] font-semibold ${f.confirmed ? "text-slate-600" : "text-slate-400"}`} title="Wert geprüft (bestätigt oder bewusst unbekannt)">
                        <input type="checkbox" disabled={gesperrt} checked={!!f.confirmed}
                          onChange={(e) => setFeature(f, { confirmed: e.target.checked })} />
                        geprüft
                      </label>
                      <Gespeichert an={gespeichert === `f${f.id}`} />
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {!KATEGORIEN.some((kat) => kat.keys.some((k) => featureByKey[k])) && (
          <p className="text-sm text-slate-400">Keine technischen Werte erkannt — bitte im nächsten Schritt Kosten und ggf. Werte manuell ergänzen.</p>
        )}
      </div>
      )}

      {/* Schritt 3 — Kosten je BKP-Gruppe mit Total und Summenprüfung (Punkt 23) */}
      {schritt === 2 && (
      <div className="max-w-5xl space-y-5">
        {kostenGruppen.map(({ gruppe, positionen, total }) => (
          <section key={gruppe} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-bold text-slate-800">
                BKP {gruppe}{total?.original_title ? ` – ${total.original_title}` : ""}
              </h2>
              {total?.validation_status === "valid" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600">
                  <CheckCircle2 className="size-3.5" /> Summe geprüft
                </span>
              )}
              {total?.validation_status === "mismatch" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                  <AlertTriangle className="size-3.5" /> Summe weicht ab
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {positionen.map((c) => (
                <div key={c.id} className={`px-4 py-3 sm:px-5 lg:grid lg:grid-cols-2 lg:gap-6 ${(!c.confirmed || !c.mapping_confirmed) ? "border-l-4 border-l-amber-400 bg-amber-50/50" : ""}`}>
                  {/* Punkt 16 — Block 1: WAS IM LV STEHT. Nummer, Titel, Betrag,
                      Betrag geprüft. Diese Zeile bleibt immer so wie im PDF. */}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Original-LV</p>
                      <p className="text-sm font-medium text-slate-900">
                        {c.original_position || `BKP ${c.bkp_nr}`}
                        {c.original_title ? ` ${c.original_title}` : ""}
                        {c.manual && <span className="ml-1 rounded-full bg-slate-100 px-2 text-[11px] font-semibold text-slate-500">manuell erfasst</span>}
                      </p>
                      {c.positionen > 1 && !c.original_position && (
                        <p className="text-[11px] text-slate-400">({c.positionen} Positionen aggregiert)</p>
                      )}
                      {c.source_scope_summary && (
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                          Umfang: {c.source_scope_summary}
                        </p>
                      )}
                      {c.included_norm_labels?.length > 0 && (
                        // Sammelposition: mehrere Norm-Positionen, aber nur ein
                        // Betrag. Sichtbar machen, damit niemand doppelt zählt.
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Enthält zusätzlich: {c.included_norm_labels.join(" · ")}
                          <span className="ml-1 text-slate-400">(Betrag zählt einmal)</span>
                        </p>
                      )}
                      {c.source_text && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${M.tagStyle}`}>{M.tag}</span>
                          <span className="truncate">{c.source_page != null ? `Seite ${c.source_page}` : ""}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <span className="text-xs text-slate-400">CHF</span>
                      <input className="input w-28" disabled={gesperrt}
                        defaultValue={c.confirmed_amount ?? (c.detected_amount ?? "")}
                        placeholder={c.detected_amount != null ? String(c.detected_amount) : "—"}
                        onBlur={(e) => setCost(c, { confirmed_amount: e.target.value, confirmed: true })} />
                      <label className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold ${c.confirmed ? "text-green-600" : "text-amber-600"}`}
                        title="Betrag geprüft — sagt nichts über die Norm-LV-Zuordnung aus.">
                        <input type="checkbox" disabled={gesperrt} checked={!!c.confirmed}
                          onChange={(e) => setCost(c, { confirmed: e.target.checked })} />
                        Betrag geprüft
                      </label>
                      <Gespeichert an={gespeichert === `c${c.id}`} />
                      {!gesperrt && (
                        <button onClick={() => entferneKost(c)} className="btn-ghost min-h-8 min-w-8 text-slate-400 hover:text-red-500" title="Position entfernen">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Punkt 16 — Block 2: WOHIN SIE IM NORM-LV GEHÖRT. Getrennter
                      Entscheid mit eigener Bestätigung. */}
                  {!c.is_group_total && (
                    <div className="mt-2 border-l-2 border-slate-200 pl-3 lg:mt-0 lg:border-l-0 lg:pl-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Norm-LV</span>
                        {(() => {
                          const m = c.canonical_key ? MAPPING[c.mapping_method] : NICHT_ZUGEORDNET;
                          return m ? (
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.style}`} title={m.hilfe}>
                              {m.label}
                            </span>
                          ) : null;
                        })()}
                        <span className="min-w-0 truncate text-[11px] text-slate-500">
                          {c.canonical_key
                            ? (String(c.canonical_label || "").startsWith(c.canonical_key)
                              ? c.canonical_label
                              : `${c.canonical_key} ${c.canonical_label || ""}`.trim())
                            : (c.mapping_confirmed ? "bewusst von der Referenz ausgeschlossen" : "noch nicht entschieden")}
                        </span>
                      </div>
                      {normLv && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <select className="input h-7 min-w-0 flex-1 py-0 text-[11px]" disabled={gesperrt}
                            value={c.canonical_key || ""}
                            onChange={(e) => setCost(c, { canonical_key: e.target.value })}>
                            <option value="">— keine passende Norm-LV-Position —</option>
                            {Object.entries(normLv.gruppen || {}).map(([g, name]) => (
                              <optgroup key={g} label={`${g} ${name}`}>
                                {(normLv.positionen || []).filter((p) => p.gruppe === g).map((p) => (
                                  <option key={p.key} value={p.key}>{p.key} {p.bezeichnung}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          {c.canonical_key ? (
                            <label className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${c.mapping_confirmed ? "text-green-600" : "text-amber-600"}`}
                              title="Norm-LV-Zuordnung geprüft — unabhängig vom Betrag.">
                              <input type="checkbox" disabled={gesperrt} checked={!!c.mapping_confirmed}
                                onChange={(e) => setCost(c, { mapping_confirmed: e.target.checked })} />
                              Zuordnung geprüft
                            </label>
                          ) : (
                            <button type="button" disabled={gesperrt}
                              onClick={() => setCost(c, { mapping_confirmed: !c.mapping_confirmed })}
                              className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${c.mapping_confirmed ? "border-slate-300 bg-slate-100 text-slate-600" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                              title="Diese Leistung hat keine Norm-LV-Position. Der Betrag bleibt im Import dokumentiert, fliesst aber nicht in die Referenzkosten.">
                              {c.mapping_confirmed ? "ausgeschlossen ✓" : "Von Referenz ausschliessen"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {total && (
                <div className="flex items-center justify-between bg-slate-50/60 px-4 py-2.5 text-sm sm:px-5">
                  <span className="font-bold text-slate-700">Total {gruppe}</span>
                  <span className="font-bold text-slate-900">
                    {chf(total.effective_amount ?? 0)}
                    {total.sum_hint && <span className="ml-2 text-[11px] font-normal text-slate-400">{total.sum_hint}</span>}
                  </span>
                </div>
              )}
            </div>
          </section>
        ))}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-bold text-slate-800">Kostenposition ergänzen</h2>
            {kostenOffen > 0 && <span className="text-[11px] font-semibold text-amber-600">{kostenOffen} Betrag / {zuordnungOffen} Zuordnung offen</span>}
          </div>
          {!gesperrt && <NeueKostZeile onAdd={kostHinzufuegen} />}
          {/* Punkt 15 — drei Summen, immer sichtbar. Wer die Zahlen prüft, muss
              sehen, wie viel gelesen wurde, wie viel in die Referenz geht und
              wie viel bewusst draussen bleibt. Summe 2 + 3 = Summe 1. */}
          <div className="space-y-1 px-4 py-3 text-sm sm:px-5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">1. Im Original-LV gelesen</span>
              <span className="tabular-nums text-slate-600">{chf(kostenTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">2. Davon in die Norm-LV-Referenz</span>
              <span className="font-bold tabular-nums text-slate-900">{chf(referenzTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={ausserhalbTotal > 0 ? "text-amber-700" : "text-slate-500"}>
                3. Nicht im Norm-LV / ausgeschlossen
              </span>
              <span className={ausserhalbTotal > 0 ? "font-medium text-amber-700" : "text-slate-600"}>
                {chf(ausserhalbTotal)}
              </span>
            </div>
            {ausserhalbTotal > 0 && (
              <p className="text-[11px] text-slate-500">
                Diese Beträge bleiben in diesem Import dokumentiert und nachvollziehbar,
                fliessen aber nicht in die Referenzkosten — dort steht nur, was es im
                Norm-LV wirklich gibt.
              </p>
            )}
          </div>
        </section>
        <KonditionenEditor imp={imp} gesperrt={gesperrt}
          onSaved={(result) => setImp((current) => ({
            ...current,
            conditions: result.conditions,
            report: { ...current.report, commercial: result.commercial },
          }))} />
      </div>
      )}

      {/* Schritt 4 — Freigabe (nur wenn alle Werte geprüft und Kosten bestätigt) */}
      {schritt === 3 && (
      <section className="card max-w-5xl overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-slate-800">Freigabe</h2>
        </div>
        <div className="space-y-4 p-4 sm:px-5">
          {gesperrt ? (
            <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
              <CheckCircle2 className="size-4" /> Freigegeben
              {imp.ref_projekt_id && <Link to="/auswertung" className="text-brand-600 hover:underline">· Referenzprojekt ansehen</Link>}
            </div>
          ) : (
            <>
              <ul className="space-y-1.5 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  {schrittFertig[1] ? <CheckCircle2 className="size-4 text-green-600" /> : <AlertTriangle className="size-4 text-amber-500" />}
                  Technische Werte: {featGeprueft} / {featTotal} geprüft
                </li>
                <li className="flex items-center gap-2">
                  {kostenOffen === 0 ? <CheckCircle2 className="size-4 text-green-600" /> : <AlertTriangle className="size-4 text-amber-500" />}
                  Beträge: {kostenOffen === 0 ? "alle verwendeten bestätigt" : `${kostenOffen} offen`}
                </li>
                <li className="flex items-center gap-2">
                  {zuordnungOffen === 0 ? <CheckCircle2 className="size-4 text-green-600" /> : <AlertTriangle className="size-4 text-amber-500" />}
                  Norm-LV-Zuordnung: {zuordnungOffen === 0
                    ? `geprüft · ${chf(referenzTotal)} gehen in die Referenz`
                    + (ausserhalbTotal > 0 ? `, ${chf(ausserhalbTotal)} nicht` : "")
                    : `${zuordnungOffen} offen`}
                </li>
                <li className="flex items-center gap-2 text-slate-500">
                  {grunddatenGesetzt ? <CheckCircle2 className="size-4 text-green-600" /> : <span className="size-4" />}
                  Grunddaten: {grunddatenGesetzt ? "erfasst" : "leer (optional)"}
                </li>
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                {!alleGeprueft && (
                  <button onClick={alleBestaetigen} className="btn-secondary">Alle als geprüft markieren</button>
                )}
                <button onClick={freigeben} disabled={approving || !alleGeprueft} className="btn-primary" title={!alleGeprueft ? "Zuerst alle Werte prüfen" : ""}>
                  <CheckCircle2 className="size-4" /> {approving ? "Werte aus…" : "Als ausgewertet freigeben"}
                </button>
              </div>
              {!alleGeprueft && (
                <p className="text-xs text-amber-600">Freigabe erst möglich, wenn alle technischen Werte geprüft und alle verwendeten Kostenpositionen bestätigt sind.</p>
              )}
            </>
          )}
        </div>
      </section>
      )}

      {/* Schritt-Navigation unten */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" disabled={schritt === 0}
          onClick={() => setSchritt((s) => Math.max(0, s - 1))}
          className="btn-ghost disabled:opacity-40">Zurück</button>
        {schritt < SCHRITTE.length - 1 && (
          <button type="button" onClick={() => setSchritt((s) => Math.min(SCHRITTE.length - 1, s + 1))}
            className="btn-primary">Weiter</button>
        )}
      </div>
    </div>
  );
}

export default function LvImportPage() {
  const { id } = useParams();
  return id ? <ReviewAnsicht id={id} /> : <UploadAnsicht />;
}
