import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ChartColumnBig, Download, Sparkles, Trash2, Upload } from "lucide-react";
import {
  deleteRefsBulk, exportRefsCsv, getRefProjekte, gkBeispieldatenLaden,
  gkBeispieldatenLoeschen, importRefsCsv,
} from "../../api/hcApi";

const chf = (n) => (n ? Math.round(n).toLocaleString("de-CH") + " CHF" : "—");

function downloadBlob(blob, dateiname) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuswertungList() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [auswahl, setAuswahl] = useState(new Set());

  const load = () =>
    getRefProjekte()
      .then((r) => { setRefs(r); setAuswahl(new Set()); })
      .catch(() => setError("Referenzprojekte konnten nicht geladen werden"))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const hatBeispiele = useMemo(() => refs.some((r) => r.name.startsWith("Beispiel — ")), [refs]);

  const handleExport = async () => {
    try {
      const blob = await exportRefsCsv();
      downloadBlob(blob, "auswertung_referenzprojekte.csv");
    } catch {
      setError("Export fehlgeschlagen");
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // gleiche Datei bleibt danach erneut wählbar
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    try {
      const res = await importRefsCsv(file);
      const teil = res.fehler?.length ? ` ${res.fehler.length} Zeile(n) übersprungen.` : "";
      setImportMsg(`${res.created} Referenzprojekt(e) importiert.${teil}`);
      await load();
    } catch {
      setImportMsg("Import fehlgeschlagen — bitte Dateiformat prüfen.");
    } finally {
      setImporting(false);
    }
  };

  const beispiele = async (aktion) => {
    setBeschaeftigt(true);
    setImportMsg("");
    try { await aktion(); await load(); } finally { setBeschaeftigt(false); }
  };

  const toggle = (id) => setAuswahl((s) => {
    const neu = new Set(s);
    neu.has(id) ? neu.delete(id) : neu.add(id);
    return neu;
  });

  const auswahlLoeschen = async () => {
    if (!window.confirm(`${auswahl.size} ausgewählte Referenzprojekte wirklich löschen?`)) return;
    setBeschaeftigt(true);
    try { await deleteRefsBulk([...auswahl]); await load(); } finally { setBeschaeftigt(false); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auswertung</h1>
          <p className="mt-1 text-sm text-slate-500">
            Referenzprojekte — die firmenweite Wissensdatenbank. Auf ihr rechnet die
            Grobkostenschätzung im Projekt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {auswahl.size > 0 && (
            <button onClick={auswahlLoeschen} disabled={beschaeftigt} className="btn-secondary border-brand-200 text-brand-700 hover:bg-brand-50">
              <Trash2 className="size-4" /> {auswahl.size} ausgewählte löschen
            </button>
          )}
          {!hatBeispiele ? (
            <button onClick={() => beispiele(gkBeispieldatenLaden)} disabled={beschaeftigt} className="btn-secondary">
              <Sparkles className="size-4" /> Beispieldaten laden
            </button>
          ) : (
            <button onClick={() => beispiele(gkBeispieldatenLoeschen)} disabled={beschaeftigt} className="btn-ghost text-slate-500">
              Beispieldaten entfernen
            </button>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="btn-secondary">
            <Upload className="size-4" /> {importing ? "Importiere…" : "CSV importieren"}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
          <button onClick={handleExport} className="btn-secondary"><Download className="size-4" /> CSV exportieren</button>
          <Link to="/auswertung/analyse" className="btn-secondary"><ChartColumnBig className="size-4" /> Analyse</Link>
          <Link to="/auswertung/neu" className="btn-primary"><Plus className="size-4" /> Neu</Link>
        </div>
      </div>

      {importMsg && <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">{importMsg}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Lade…</div>
      ) : refs.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 border-dashed p-12 text-center">
          <div className="text-4xl">📊</div>
          <p className="font-medium text-slate-700">Noch keine Referenzprojekte</p>
          <p className="max-w-md text-sm text-slate-400">
            Erfasse abgeschlossene Projekte mit ihren echten BKP-Kosten, importiere eine CSV —
            oder lade die Beispieldaten (~80 Demo-Projekte, jederzeit wieder entfernbar).
          </p>
          <Link to="/auswertung/neu" className="btn-primary mt-2"><Plus className="size-4" /> Erstes Referenzprojekt</Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {refs.map((r) => (
            <div key={r.id} onClick={() => nav(`/auswertung/${r.id}`)}
              className={"card group relative cursor-pointer p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md " + (auswahl.has(r.id) ? "border-brand-300 bg-brand-50/30" : "")}>
              <input
                type="checkbox"
                className="absolute right-4 top-4 size-4 accent-brand-600"
                checked={auswahl.has(r.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(r.id)}
                title="Für Sammel-Löschen auswählen"
              />
              <div className="mb-2 flex items-start justify-between gap-3 pr-7">
                <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{r.name}</h3>
                <span className="shrink-0 text-sm font-bold text-slate-900">{chf(r.summe_kosten)}</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {r.projektart && <span className="badge bg-slate-100 text-slate-600">{r.projektart}</span>}
                {r.gebaeudetyp && <span className="badge bg-slate-100 text-slate-600">{r.gebaeudetyp}</span>}
                <span className="badge bg-slate-100 text-slate-600 capitalize">{r.anlagenkonfiguration || "monovalent"}</span>
                {(r.waermeerzeuger || []).map((e) => <span key={e} className="badge bg-brand-50 text-brand-700">{e}</span>)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {r.ebf_m2 ? <span>EBF {r.ebf_m2} m²</span> : null}
                {r.heizleistung_kw ? <span>{r.heizleistung_kw} kW</span> : null}
                {r.datum ? <span>{new Date(r.datum).toLocaleDateString("de-CH")}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
