import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertTriangle, Trash2, Plus, ChevronDown, Loader2 } from "lucide-react";
import {
  uploadLvImport, listLvImports, getLvImport, getFachwerte, getNormLv,
  updateLvFeature, updateLvCost, addLvCost, deleteLvCost, updateLvImport, approveLvImport,
} from "../../api/hcApi";

// B9 — Review-Seite des LV-Imports. Ohne :id ist es die Upload-Ansicht.
// Aus einem Unternehmer-LV entsteht ein geprüfter technischer Fingerprint +
// reale BKP-Kosten; erst die Freigabe übernimmt die Daten als Referenzprojekt.

// Mehrwertige Merkmale kommen aus der zentralen Registry (Punkt 6/7) und werden
// als Checkbox-Gruppe dargestellt, nicht als Zahlenfeld.
const MULTI_FEATURES = { generator_types: "generator_types", heat_delivery_types: "heat_delivery_types" };

const KATEGORIEN = [
  { titel: "Wärmeerzeugung", keys: ["generator_types", "generator_count", "generator_power_kw"] },
  { titel: "Erdsonden", keys: ["borehole_count", "borehole_length_each_m", "borehole_total_m"] },
  { titel: "Speicher", keys: ["buffer_count", "storage_volume_l"] },
  { titel: "Wärmeabgabe", keys: ["heat_delivery_types", "radiator_count"] },
  {
    titel: "Wärmeverteilung",
    keys: ["pump_count", "valve_2way_count", "valve_3way_count", "balancing_valve_count",
           "pipe_length_source_m", "pipe_length_distribution_m", "pipe_length_m"],
  },
  { titel: "Wärmemessung", keys: ["heat_meter_count"] },
];

const GENERATOR_TYPE_LABELS = {
  ews_wp: "Sole/Wasser-WP (Erdsonden)", lwwp: "Luft/Wasser-WP", wasser_wp: "Wasser/Wasser-WP",
  co2_wp: "CO₂-Wärmepumpe", fernwaerme: "Fernwärme", gas: "Gas", oel: "Öl", holz: "Holz",
  elektro: "Elektro", hybrid: "Hybrid", sonstige: "Sonstige",
};

const CONF_STYLE = {
  high: "bg-green-100 text-green-700", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-500",
};
const CONF_LABEL = { high: "hohe Sicherheit", medium: "prüfen", low: "unsicher" };

const STATUS_STYLE = {
  approved: "bg-violet-100 text-violet-700", review: "bg-blue-100 text-blue-700",
  extracted: "bg-amber-100 text-amber-800", uploaded: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
};

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

// Wie eine Kostenposition dem Norm-LV zugeordnet wurde. Sichtbar, damit
// nachvollziehbar bleibt, was automatisch und was per LLM entschieden wurde.
const MAPPING = {
  exact: { label: "exakt", style: "bg-green-100 text-green-700" },
  rule: { label: "Regel", style: "bg-green-100 text-green-700" },
  llm: { label: "KI-Vorschlag", style: "bg-violet-100 text-violet-700" },
  manual: { label: "manuell", style: "bg-slate-100 text-slate-600" },
};

// Punkt 21 — vier klare Schritte statt einer langen Seite.
const SCHRITTE = [
  { key: "projekt", titel: "Projekt" },
  { key: "technik", titel: "Technik" },
  { key: "kosten", titel: "Kosten" },
  { key: "freigabe", titel: "Prüfen & Freigeben" },
];

function anzeige(key, wert) {
  if (wert == null || wert === "") return "—";
  if (key === "generator_type") return GENERATOR_TYPE_LABELS[wert] || wert;
  return wert;
}

// Aufklappbare Fundstelle (Punkt 12/22): kompakte Zeile, Details auf Wunsch.
function Quelle({ feature, tag, tagStyle }) {
  const [offen, setOffen] = useState(false);
  if (!feature.source_text && !feature.derived_from) return null;
  const mehr = feature.source_excerpt && feature.source_excerpt !== feature.source_text;
  return (
    <div className="mt-1 text-[11px] text-slate-400">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${tagStyle}`} title="Herkunft des Werts">{tag}</span>
        {feature.derived_from
          ? <span className="font-medium text-slate-500">Berechnet: {feature.derived_from}</span>
          : <span>{feature.source_page != null ? `Seite ${feature.source_page}: ` : ""}„{feature.source_text}"</span>}
        {mehr && (
          <button type="button" onClick={() => setOffen((o) => !o)}
            className="inline-flex items-center gap-0.5 text-brand-600 hover:underline">
            Quelle anzeigen <ChevronDown className={`size-3 transition ${offen ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {offen && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-500">
          {feature.source_page != null ? `Seite ${feature.source_page}\n` : ""}{feature.source_excerpt}
        </pre>
      )}
    </div>
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

// Punkt 24 — sichtbarer Verarbeitungszustand statt scheinbar eingefrorener Seite.
const PROCESSING = [
  "Datei eingelesen",
  "Seiten klassifiziert",
  "Technische Mengen werden erkannt",
  "Kosten werden ausgewertet",
  "Resultat wird vorbereitet",
];

function ProcessingAnsicht({ schritt }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="card p-6">
        <div className="flex items-center gap-2 text-slate-800">
          <Loader2 className="size-5 animate-spin text-brand-500" />
          <h1 className="text-base font-bold">PDF wird analysiert …</h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Das kann bei grossen LVs einen Moment dauern. Bitte nicht schliessen.
        </p>
        <ul className="mt-5 space-y-2.5">
          {PROCESSING.map((text, i) => (
            <li key={text} className="flex items-center gap-2.5 text-sm">
              {i < schritt
                ? <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                : i === schritt
                  ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-500" />
                  : <span className="size-4 shrink-0 rounded-full border border-slate-200" />}
              <span className={i <= schritt ? "text-slate-700" : "text-slate-300"}>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Punkt 25 — Zusammenfassung nach der Verarbeitung.
function ImportZusammenfassung({ report, imp, offen }) {
  if (!report || !Object.keys(report).length) return null;
  const typen = report.page_types || {};
  const zeilen = [
    [`${report.page_count ?? imp.page_count} Seiten analysiert`, true],
    [`${typen.lv || 0} LV-Seiten erkannt`, (typen.lv || 0) > 0],
    [`${typen.cost_summary || 0} Kostenzusammenstellungs-Seiten erkannt`, (typen.cost_summary || 0) > 0],
    [`${report.features_erkannt ?? 0} technische Werte erkannt`, (report.features_erkannt ?? 0) > 0],
    [`${report.kostenpositionen ?? 0} Kostenpositionen erkannt`, (report.kostenpositionen ?? 0) > 0],
    [`${(report.kostenpositionen ?? 0) - (report.kosten_ohne_zuordnung ?? 0)} davon dem Norm-LV zugeordnet`, true],
  ];
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-bold text-slate-700">Import abgeschlossen</p>
      <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[11px] text-slate-500 sm:grid-cols-2">
        {zeilen.map(([text, ok]) => (
          <li key={text} className={ok ? "" : "text-slate-400"}>· {text}</li>
        ))}
        {offen > 0 && (
          <li className="font-semibold text-amber-600">· {offen} Angaben müssen geprüft werden</li>
        )}
      </ul>
      {report.cost_source && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          Kostenquelle: {report.cost_source === "cost_summary"
            ? "Kostenzusammenstellung (bevorzugt)"
            : "LV-Positionstotale (keine Kostenzusammenstellung gefunden)"}
        </p>
      )}
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

  useEffect(() => { listLvImports().then(setImports).catch(() => {}); }, []);

  // Punkt 24 — der Upload arbeitet synchron; statt Fake-Prozenten laufen die
  // Schritte optisch weiter, damit die Seite nicht eingefroren wirkt.
  const [schritt, setSchritt] = useState(0);
  useEffect(() => {
    if (!busy) { setSchritt(0); return undefined; }
    const t = setInterval(() => setSchritt((s) => Math.min(s + 1, PROCESSING.length - 1)), 1200);
    return () => clearInterval(t);
  }, [busy]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      const imp = await uploadLvImport(file);
      navigate(`/auswertung/import/${imp.id}`);
    } catch {
      setError("Upload fehlgeschlagen. Nur PDF wird unterstützt.");
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <ProcessingAnsicht schritt={schritt} />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8 lg:px-8">
      <Link to="/auswertung" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> Auswertung
      </Link>
      <h1 className="text-xl font-bold text-slate-900">Unternehmer-LV importieren</h1>
      <p className="mt-1 text-sm text-slate-500">Aus einem alten LV entsteht ein geprüfter technischer Fingerprint + reale BKP-Kosten. Digitaler Text wird direkt gelesen, gescannte PDFs automatisch per deutscher OCR.</p>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-slate-500 transition hover:border-brand-400 hover:text-brand-600">
        <Upload className="size-7" />
        <span className="text-sm font-semibold">{busy ? "Lade hoch & extrahiere…" : "PDF hochladen (Submission / LV)"}</span>
        <span className="text-xs text-slate-400">Original wird gespeichert, Werte werden automatisch erkannt</span>
      </button>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />

      {imports.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-bold text-slate-700">Bisherige Importe</h2>
          <div className="card divide-y divide-slate-100">
            {imports.map((imp) => (
              <Link key={imp.id} to={`/auswertung/import/${imp.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                <FileText className="size-4 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{imp.filename}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[imp.status] || STATUS_STYLE.uploaded}`}>{imp.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
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

// ── Review-Ansicht (mit :id) ────────────────────────────────────────────────
function ReviewAnsicht({ id }) {
  const [imp, setImp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [schritt, setSchritt] = useState(0);

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
        eintrag.total = { ...eintrag.total, sum_hint: diff > 1 ? `(Positionen: ${summe.toLocaleString("de-CH")})` : null };
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
  const kostenTotal = kostenGruppen.reduce((s, g) => s + (
    g.positionen.length
      ? g.positionen.reduce((x, c) => x + (c.effective_amount ?? 0), 0)
      : (g.total?.effective_amount ?? 0)
  ), 0);
  const alleGeprueft = featTotal > 0 && featGeprueft === featTotal && kostenOffen === 0;
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

  const setFeature = async (feature, patch) => {
    const updated = await updateLvFeature(id, feature.id, patch);
    setImp((cur) => ({ ...cur, features: cur.features.map((f) => (f.id === feature.id ? updated : f)) }));
  };
  const setCost = async (cost, patch) => {
    const updated = await updateLvCost(id, cost.id, patch);
    setImp((cur) => ({ ...cur, costs: cur.costs.map((c) => (c.id === cost.id ? updated : c)) }));
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
  };
  const alleBestaetigen = async () => {
    for (const f of (imp.features || []).filter((x) => !x.confirmed)) {
      // eslint-disable-next-line no-await-in-loop
      await setFeature(f, { confirmed: true });
    }
    for (const c of kostenVerwendet.filter((x) => !x.confirmed)) {
      // eslint-disable-next-line no-await-in-loop
      await setCost(c, { confirmed: true });
    }
  };
  const freigeben = async () => {
    if (!confirm("Referenzdaten freigeben? Danach entsteht ein Referenzprojekt aus diesem Import.")) return;
    setApproving(true);
    setError("");
    try {
      const res = await approveLvImport(id);
      setImp((cur) => ({ ...cur, ...res.import }));
    } catch {
      setError("Freigabe fehlgeschlagen — bitte alle Werte und Kosten prüfen.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8 lg:px-8">
      <Link to="/auswertung/import" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> LV-Import
      </Link>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900">{imp.filename}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{imp.page_count} Seiten · {M.kopf}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[imp.status] || STATUS_STYLE.uploaded}`}>{imp.status}</span>
      </div>

      {methode === "ocr" && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kein digitaler Text — die Werte wurden automatisch per OCR (Deutsch) erkannt. Bitte besonders sorgfältig prüfen; jede Fundstelle ist mit «OCR» markiert.
        </div>
      )}
      {methode === "image" && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kein Text gefunden — auch die OCR lieferte nichts (oder ist auf dem Server nicht verfügbar). Werte bitte manuell erfassen.
        </div>
      )}

      {/* Punkt 25 — was wurde beim Import erkannt */}
      <ImportZusammenfassung report={imp.report} imp={imp}
        offen={(featTotal - featGeprueft) + kostenOffen} />

      {/* Schritt-Navigation (Punkt 21) */}
      <ol className="mb-6 flex flex-wrap items-center gap-2">
        {SCHRITTE.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-1 basis-40">
            <button type="button" onClick={() => setSchritt(i)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${i === schritt ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${schrittFertig[i] ? "bg-green-500 text-white" : i === schritt ? "bg-brand-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                {schrittFertig[i] ? "✓" : i + 1}
              </span>
              <span className={`truncate text-xs font-semibold ${i === schritt ? "text-brand-700" : "text-slate-600"}`}>{s.titel}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* Schritt 1 — Projekt (Punkt 20: kategoriale Werte als Select) */}
      {schritt === 0 && (
      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-slate-800">Projektinformationen</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Aus dem Deckblatt erkannte Angaben bitte prüfen. Vergleichsrelevante Merkmale
            sind Auswahllisten — kein Freitext.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:px-5">
          {[
            ["projekt_name", "Projektname", "text"],
            ["projekt_nummer", "Projekt-Nr.", "text"],
            ["ort", "Ort", "text"],
            ["unternehmer", "Unternehmer", "text"],
            ["offert_datum", "Datum", "text"],
            ["region", "Region", "text"],
            ["ebf_m2", "EBF [m²]", "number"],
            ["anzahl_einheiten", "Nutzungseinheiten", "number"],
          ].map(([key, label, typ]) => (
            <div key={key}>
              <label className="label">{label}</label>
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
              <label className="label">{label}</label>
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
      <div className="space-y-6">
        {KATEGORIEN.map((kat) => {
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
                  const nichtErkannt = f.value == null && !f.confirmed_value;
                  return (
                  <div key={f.id} className={`grid gap-2 px-4 py-3.5 sm:px-5 ${multi ? "" : "sm:grid-cols-[1fr_auto] sm:items-center"}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{f.label}</span>
                        {f.confidence && !multi && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONF_STYLE[f.confidence]}`}>{CONF_LABEL[f.confidence]}</span>}
                        {nichtErkannt && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                            nicht zuverlässig erkannt
                          </span>
                        )}
                      </div>
                      <Quelle feature={f} tag={M.tag} tagStyle={M.tagStyle} />
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
                      <input
                        className="input w-36"
                        disabled={gesperrt}
                        defaultValue={f.confirmed_value ?? (f.value ?? "")}
                        placeholder={f.value != null ? String(f.value) : "Wert eingeben"}
                        onBlur={(e) => setFeature(f, { confirmed_value: e.target.value, confirmed: true })}
                      />
                      {f.unit && <span className="w-6 text-xs text-slate-400">{f.unit}</span>}
                      <label className={`inline-flex items-center gap-1 text-[11px] font-semibold ${f.confirmed ? "text-green-600" : "text-slate-400"}`} title="Wert geprüft (bestätigt oder bewusst unbekannt)">
                        <input type="checkbox" disabled={gesperrt} checked={!!f.confirmed}
                          onChange={(e) => setFeature(f, { confirmed: e.target.checked })} />
                        geprüft
                      </label>
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Erzeugertyp-Klartext, falls erkannt */}
        {featureByKey.generator_type && (
          <p className="text-xs text-slate-400">Erkannter Erzeugertyp: {anzeige("generator_type", featureByKey.generator_type.effective_value)}</p>
        )}
        {!KATEGORIEN.some((kat) => kat.keys.some((k) => featureByKey[k])) && (
          <p className="text-sm text-slate-400">Keine technischen Werte erkannt — bitte im nächsten Schritt Kosten und ggf. Werte manuell ergänzen.</p>
        )}
      </div>
      )}

      {/* Schritt 3 — Kosten je BKP-Gruppe mit Total und Summenprüfung (Punkt 23) */}
      {schritt === 2 && (
      <div className="space-y-5">
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
                <div key={c.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-900">
                      {c.original_position || `BKP ${c.bkp_nr}`}
                      {c.original_title ? ` ${c.original_title}` : ""}
                    </span>
                    {c.positionen > 1 && !c.original_position && (
                      <span className="ml-1 text-[11px] text-slate-400">({c.positionen} Positionen aggregiert)</span>
                    )}
                    {c.manual && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">manuell</span>}
                    {c.mapping_method && MAPPING[c.mapping_method] && (
                      <span className={`ml-1 rounded px-1 text-[10px] font-semibold ${MAPPING[c.mapping_method].style}`}
                        title={c.mapping_reason || ""}>
                        {MAPPING[c.mapping_method].label}
                        {c.mapping_confidence != null && c.mapping_method === "llm"
                          ? ` ${Math.round(c.mapping_confidence * 100)}%` : ""}
                      </span>
                    )}
                    {!c.canonical_key && !c.manual && (
                      <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500"
                        title={c.mapping_reason || "Im Norm-LV nicht enthalten — der Betrag zählt trotzdem in seiner BKP-Gruppe"}>
                        nicht im Norm-LV
                      </span>
                    )}
                    {!c.is_group_total && normLv && (
                      <div className="mt-1">
                        <select className="input h-7 max-w-full py-0 text-[11px]" disabled={gesperrt}
                          value={c.canonical_key || ""}
                          onChange={(e) => setCost(c, { canonical_key: e.target.value })}>
                          <option value="">— Norm-LV-Position wählen —</option>
                          {Object.entries(normLv.gruppen || {}).map(([g, name]) => (
                            <optgroup key={g} label={`${g} ${name}`}>
                              {(normLv.positionen || []).filter((p) => p.gruppe === g).map((p) => (
                                <option key={p.key} value={p.key}>{p.key} {p.bezeichnung}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}
                    {c.source_text && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${M.tagStyle}`}>{M.tag}</span>
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
                    <label className={`inline-flex items-center gap-1 text-[11px] font-semibold ${c.confirmed ? "text-green-600" : "text-slate-400"}`}>
                      <input type="checkbox" disabled={gesperrt} checked={!!c.confirmed}
                        onChange={(e) => setCost(c, { confirmed: e.target.checked })} /> ok
                    </label>
                    {!gesperrt && (
                      <button onClick={() => entferneKost(c)} className="btn-ghost min-h-8 min-w-8 text-slate-400 hover:text-red-500" title="Position entfernen">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {total && (
                <div className="flex items-center justify-between bg-slate-50/60 px-4 py-2.5 text-sm sm:px-5">
                  <span className="font-bold text-slate-700">Total {gruppe}</span>
                  <span className="font-bold text-slate-900">
                    CHF {(total.effective_amount ?? 0).toLocaleString("de-CH")}
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
            {kostenOffen > 0 && <span className="text-[11px] font-semibold text-amber-600">{kostenOffen} unbestätigt</span>}
          </div>
          {!gesperrt && <NeueKostZeile onAdd={kostHinzufuegen} />}
          <div className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
            <span className="font-bold text-slate-700">Verwendete Kosten total</span>
            <span className="font-bold text-slate-900">CHF {kostenTotal.toLocaleString("de-CH")}</span>
          </div>
        </section>
      </div>
      )}

      {/* Schritt 4 — Freigabe (nur wenn alle Werte geprüft und Kosten bestätigt) */}
      {schritt === 3 && (
      <section className="card overflow-hidden">
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
                  Kosten: {kostenOffen === 0 ? "alle verwendeten bestätigt" : `${kostenOffen} offen`}
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
                  <CheckCircle2 className="size-4" /> {approving ? "Gebe frei…" : "Referenzdaten freigeben"}
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
