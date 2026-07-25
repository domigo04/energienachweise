import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertTriangle, Trash2, Plus } from "lucide-react";
import {
  uploadLvImport, listLvImports, getLvImport,
  updateLvFeature, updateLvCost, addLvCost, deleteLvCost, updateLvImport, approveLvImport,
} from "../../api/hcApi";

// B9 — Review-Seite des LV-Imports. Ohne :id ist es die Upload-Ansicht.
// Aus einem Unternehmer-LV entsteht ein geprüfter technischer Fingerprint +
// reale BKP-Kosten; erst die Freigabe übernimmt die Daten als Referenzprojekt.

const KATEGORIEN = [
  { titel: "Wärmeerzeugung", keys: ["generator_type", "generator_count", "generator_power_kw", "borehole_count", "borehole_total_m"] },
  { titel: "Speicher", keys: ["buffer_count", "storage_volume_l"] },
  { titel: "Wärmeverteilung", keys: ["pump_count", "valve_2way_count", "valve_3way_count", "pipe_length_m"] },
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

// Block C #9 — der Review läuft in vier klaren Schritten statt einer langen Seite.
const SCHRITTE = [
  { key: "grunddaten", titel: "Grunddaten" },
  { key: "werte", titel: "Technische Werte" },
  { key: "kosten", titel: "BKP-Kosten" },
  { key: "freigabe", titel: "Freigabe" },
];

function anzeige(key, wert) {
  if (wert == null || wert === "") return "—";
  if (key === "generator_type") return GENERATOR_TYPE_LABELS[wert] || wert;
  return wert;
}

// ── Upload-Ansicht (ohne :id) ───────────────────────────────────────────────
function UploadAnsicht() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imports, setImports] = useState([]);

  useEffect(() => { listLvImports().then(setImports).catch(() => {}); }, []);

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

  useEffect(() => {
    getLvImport(id).then(setImp).catch(() => setError("Import konnte nicht geladen werden")).finally(() => setLoading(false));
  }, [id]);

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
  const alleGeprueft = featTotal > 0 && featGeprueft === featTotal && kostenOffen === 0;
  const grunddatenGesetzt = ["ebf_m2", "anzahl_einheiten", "gebaeudetyp", "projektart", "region"]
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

      {/* Schritt-Navigation (Block C #9) */}
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

      {/* Schritt 1 — Projektgrunddaten (im Review ergänzen) */}
      {schritt === 0 && (
      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-slate-800">Projektgrunddaten</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">Optional, fliessen bei Freigabe ins Referenzprojekt.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:px-5">
          {[
            ["ebf_m2", "EBF [m²]", "number"],
            ["anzahl_einheiten", "Nutzungseinheiten", "number"],
            ["gebaeudetyp", "Gebäudetyp", "text"],
            ["projektart", "Projektart", "text"],
            ["region", "Region", "text"],
          ].map(([key, label, typ]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input type={typ} className="input" disabled={gesperrt}
                defaultValue={imp.grunddaten?.[key] ?? ""}
                onBlur={(e) => setGrunddaten({ [key]: e.target.value })} />
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
                {rows.map((f) => (
                  <div key={f.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{f.label}</span>
                        {f.confidence && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONF_STYLE[f.confidence]}`}>{CONF_LABEL[f.confidence]}</span>}
                      </div>
                      {f.source_text && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${M.tagStyle}`} title="Herkunft des Werts">{M.tag}</span>
                          <span>{f.source_page != null ? `Seite ${f.source_page}: ` : ""}„{f.source_text}"</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <input
                        className="input w-36"
                        disabled={gesperrt}
                        defaultValue={f.confirmed_value ?? (f.value ?? "")}
                        placeholder={f.value != null ? String(f.value) : "unbekannt"}
                        onBlur={(e) => setFeature(f, { confirmed_value: e.target.value, confirmed: true })}
                      />
                      {f.unit && <span className="w-6 text-xs text-slate-400">{f.unit}</span>}
                      <label className={`inline-flex items-center gap-1 text-[11px] font-semibold ${f.confirmed ? "text-green-600" : "text-slate-400"}`} title="Wert geprüft (bestätigt oder bewusst unbekannt)">
                        <input type="checkbox" disabled={gesperrt} checked={!!f.confirmed}
                          onChange={(e) => setFeature(f, { confirmed: e.target.checked })} />
                        geprüft
                      </label>
                    </div>
                  </div>
                ))}
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

      {/* Schritt 3 — BKP-Kosten (aggregiert, bestätigbar, manuell ergänzbar) */}
      {schritt === 2 && (
      <div className="space-y-6">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-bold text-slate-800">BKP-Kosten</h2>
            {kostenOffen > 0 && <span className="text-[11px] font-semibold text-amber-600">{kostenOffen} unbestätigt</span>}
          </div>
          <div className="divide-y divide-slate-100">
            {(imp.costs || []).map((c) => (
              <div key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
                <div>
                  <span className="font-medium text-slate-900">BKP {c.bkp_nr}</span>
                  {c.positionen > 1 && <span className="ml-1 text-[11px] text-slate-400">({c.positionen} Positionen aggregiert)</span>}
                  {c.manual && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">manuell</span>}
                  {c.source_text && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${M.tagStyle}`} title="Herkunft des Betrags">{M.tag}</span>
                      <span>{c.source_page != null ? `Seite ${c.source_page}: ` : ""}„{c.source_text}"</span>
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
                    <button onClick={() => entferneKost(c)} className="btn-ghost min-h-8 min-w-8 text-slate-400 hover:text-red-500" title="Position löschen">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!gesperrt && <NeueKostZeile onAdd={kostHinzufuegen} />}
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
