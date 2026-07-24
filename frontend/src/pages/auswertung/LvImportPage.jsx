import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  uploadLvImport, listLvImports, getLvImport,
  updateLvFeature, updateLvCost, approveLvImport,
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
      <p className="mt-1 text-sm text-slate-500">Aus einem alten LV entsteht ein geprüfter technischer Fingerprint + reale BKP-Kosten. Zunächst born-digital PDF.</p>

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

// ── Review-Ansicht (mit :id) ────────────────────────────────────────────────
function ReviewAnsicht({ id }) {
  const [imp, setImp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);

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
  const gesperrt = imp.status === "approved";

  const setFeature = async (feature, patch) => {
    const updated = await updateLvFeature(id, feature.id, patch);
    setImp((cur) => ({ ...cur, features: cur.features.map((f) => (f.id === feature.id ? updated : f)) }));
  };
  const setCost = async (cost, patch) => {
    const updated = await updateLvCost(id, cost.id, patch);
    setImp((cur) => ({ ...cur, costs: cur.costs.map((c) => (c.id === cost.id ? updated : c)) }));
  };
  const freigeben = async () => {
    if (!confirm("Referenzdaten freigeben? Danach entsteht ein Referenzprojekt aus diesem Import.")) return;
    setApproving(true);
    try {
      const res = await approveLvImport(id);
      setImp((cur) => ({ ...cur, ...res.import }));
    } catch {
      setError("Freigabe fehlgeschlagen");
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
          <p className="mt-0.5 text-xs text-slate-500">{imp.page_count} Seiten · {imp.is_searchable ? "durchsuchbar" : "Bild-PDF (OCR folgt)"}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[imp.status] || STATUS_STYLE.uploaded}`}>{imp.status}</span>
      </div>

      {!imp.is_searchable && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kein durchsuchbarer Text gefunden — Bild-PDF. OCR ist ein späterer Schritt; Werte bitte manuell erfassen.
        </div>
      )}

      {/* Technischer Fingerprint nach Kategorien */}
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
                        <div className="mt-1 text-[11px] text-slate-400">
                          {f.source_page != null ? `Seite ${f.source_page}: ` : ""}„{f.source_text}"
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <input
                        className="input w-40"
                        disabled={gesperrt}
                        defaultValue={f.confirmed_value ?? (f.value ?? "")}
                        placeholder={f.value != null ? String(f.value) : "unbekannt"}
                        onBlur={(e) => setFeature(f, { confirmed_value: e.target.value, confirmed: true })}
                      />
                      {f.unit && <span className="text-xs text-slate-400">{f.unit}</span>}
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

        {/* BKP-Kosten */}
        {(imp.costs || []).length > 0 && (
          <section className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-bold text-slate-800">BKP-Kosten</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {imp.costs.map((c) => (
                <div key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
                  <div>
                    <span className="font-medium text-slate-900">BKP {c.bkp_nr}</span>
                    {c.source_text && <div className="mt-0.5 text-[11px] text-slate-400">{c.source_page != null ? `Seite ${c.source_page}: ` : ""}„{c.source_text}"</div>}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className="text-xs text-slate-400">CHF</span>
                    <input className="input w-32" disabled={gesperrt}
                      defaultValue={c.confirmed_amount ?? (c.detected_amount ?? "")}
                      placeholder={c.detected_amount != null ? String(c.detected_amount) : "—"}
                      onBlur={(e) => setCost(c, { confirmed_amount: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Freigabe */}
      <div className="mt-6 flex items-center gap-3">
        {gesperrt ? (
          <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
            <CheckCircle2 className="size-4" /> Freigegeben
            {imp.ref_projekt_id && <Link to="/auswertung" className="text-brand-600 hover:underline">· Referenzprojekt ansehen</Link>}
          </div>
        ) : (
          <button onClick={freigeben} disabled={approving} className="btn-primary">
            <CheckCircle2 className="size-4" /> {approving ? "Gebe frei…" : "Referenzdaten freigeben"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LvImportPage() {
  const { id } = useParams();
  return id ? <ReviewAnsicht id={id} /> : <UploadAnsicht />;
}
