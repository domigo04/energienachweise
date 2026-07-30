import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChartColumnBig, CheckSquare, ChevronDown, ChevronUp, Download, FileUp, Plus, Trash2, Upload, X,
} from "lucide-react";
import {
  deleteRefsBulk, exportRefsCsv, getRefProjekte, gkBeispieldatenLaden,
  gkBeispieldatenLoeschen, importRefsCsv,
} from "../../api/hcApi";
import PageHeader from "../../components/ui/PageHeader";
import GewerkLeiste from "../../components/ui/GewerkLeiste";
import { GEBAEUDETYPEN, PROJEKTARTEN, WAERMEABGABE, WAERMEERZEUGER, waermeerzeugerLabel } from "../../data/kv";
import { LEER, chf, zahl } from "../../lib/format";

// Kennwert = Netto pro m² EBF. Die Zahl, mit der Referenzen verglichen werden;
// ohne EBF gibt es keinen Kennwert (und keine erfundene Ersatzgrösse).
const kennwertVon = (r) => (r.ebf_m2 > 0 && r.summe_kosten > 0 ? r.summe_kosten / r.ebf_m2 : null);
const jahrVon = (r) => (r.datum ? Number(String(r.datum).slice(0, 4)) : null);

const quantil = (werte, p) => {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const u = Math.floor(i), o = Math.ceil(i);
  return u === o ? s[u] : s[u] + (s[o] - s[u]) * (i - u);
};

// Sortierbare Spalten: Wert je Zeile, damit ein Vergleich reicht (keine
// Sonderfälle je Spalte).
const SPALTEN = [
  { key: "name", titel: "Name", breit: true, wert: (r) => r.name || "" },
  { key: "projektart", titel: "Projektart", wert: (r) => r.projektart || "" },
  { key: "gebaeudetyp", titel: "Nutzung", wert: (r) => r.gebaeudetyp || "" },
  { key: "waermeerzeuger", titel: "Wärmeerzeuger", wert: (r) => (r.waermeerzeuger || []).map(waermeerzeugerLabel).join(", ") },
  { key: "ebf_m2", titel: "EBF m²", wert: (r) => r.ebf_m2, num: true },
  { key: "heizleistung_kw", titel: "kW", wert: (r) => r.heizleistung_kw, num: true },
  { key: "summe_kosten", titel: "Netto CHF", wert: (r) => r.summe_kosten, num: true },
  { key: "kennwert", titel: "CHF/m²", wert: kennwertVon, num: true },
  { key: "jahr", titel: "Jahr", wert: jahrVon, num: true },
];

// Leere Werte stehen immer am Ende — egal in welche Richtung sortiert wird.
const vergleich = (a, b, spalte, dir) => {
  const x = spalte.wert(a), y = spalte.wert(b);
  const xLeer = x == null || x === "", yLeer = y == null || y === "";
  if (xLeer || yLeer) return xLeer === yLeer ? 0 : xLeer ? 1 : -1;
  return dir * (spalte.num ? x - y : String(x).localeCompare(String(y), "de", { numeric: true }));
};

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
  const [sort, setSort] = useState(null); // null = Reihenfolge des Backends (neueste zuerst)
  // Filter (rein client-seitig — die Liste ist schon geladen). Erzeuger/Abgabe
  // nach «enthält»-Regel: ein Projekt zählt, wenn es MINDESTENS eine der
  // gewählten Arten hat (gemischte Projekte tauchen also mit auf).
  const [fErzeuger, setFErzeuger] = useState(new Set());
  const [fAbgabe, setFAbgabe] = useState(new Set());
  const [fNutzung, setFNutzung] = useState("");
  const [fProjektart, setFProjektart] = useState("");

  const toggleFilter = (setter) => (wert) => setter((s) => {
    const neu = new Set(s);
    neu.has(wert) ? neu.delete(wert) : neu.add(wert);
    return neu;
  });
  const filterAktiv = fErzeuger.size || fAbgabe.size || fNutzung || fProjektart;
  const filterReset = () => { setFErzeuger(new Set()); setFAbgabe(new Set()); setFNutzung(""); setFProjektart(""); };

  const gefiltert = useMemo(() => refs.filter((r) => {
    const erz = new Set(r.waermeerzeuger || []);
    const abg = new Set(r.waermeabgabe || []);
    if (fErzeuger.size && ![...fErzeuger].some((x) => erz.has(x))) return false;
    if (fAbgabe.size && ![...fAbgabe].some((x) => abg.has(x))) return false;
    if (fNutzung && r.gebaeudetyp !== fNutzung) return false;
    if (fProjektart && r.projektart !== fProjektart) return false;
    return true;
  }), [refs, fErzeuger, fAbgabe, fNutzung, fProjektart]);

  const zeilen = useMemo(() => {
    if (!sort) return gefiltert;
    const spalte = SPALTEN.find((s) => s.key === sort.key);
    return [...gefiltert].sort((a, b) => vergleich(a, b, spalte, sort.dir));
  }, [gefiltert, sort]);

  const sortieren = (key) => setSort((s) => (s?.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  // Kennzahlen über die gefilterte Menge — der Filter ist die Auswertung.
  const kennzahlen = useMemo(() => {
    const kennwerte = gefiltert.map(kennwertVon).filter((v) => v != null);
    const netto = gefiltert.map((r) => r.summe_kosten).filter((v) => v > 0);
    const jahre = gefiltert.map(jahrVon).filter(Boolean);
    return {
      mitKennwert: kennwerte.length,
      medianNetto: quantil(netto, 0.5),
      medianKennwert: quantil(kennwerte, 0.5),
      p25: quantil(kennwerte, 0.25),
      p75: quantil(kennwerte, 0.75),
      vonJahr: jahre.length ? Math.min(...jahre) : null,
      bisJahr: jahre.length ? Math.max(...jahre) : null,
    };
  }, [gefiltert]);

  const alleGefiltertGewaehlt = gefiltert.length > 0 && gefiltert.every((r) => auswahl.has(r.id));
  const alleAuswaehlen = () => setAuswahl(alleGefiltertGewaehlt ? new Set() : new Set(gefiltert.map((r) => r.id)));

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
    <div className="px-5 py-7 lg:px-10 xl:px-12">
      <PageHeader
        title="Auswertung"
        subtitle="Referenzprojekte Heizung — Datenbasis der Grobkostenschätzung."
        actions={
          <>
            {auswahl.size > 0 && (
              <button onClick={auswahlLoeschen} disabled={beschaeftigt} className="btn-ghost text-brand-700 hover:bg-brand-50">
                <Trash2 className="size-4" /> {auswahl.size} löschen
              </button>
            )}
            {!hatBeispiele ? (
              <button onClick={() => beispiele(gkBeispieldatenLaden)} disabled={beschaeftigt} className="btn-ghost">
                Beispieldaten
              </button>
            ) : (
              <button onClick={() => beispiele(gkBeispieldatenLoeschen)} disabled={beschaeftigt} className="btn-ghost text-slate-500">
                Beispieldaten entfernen
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="btn-ghost">
              <Upload className="size-4" /> {importing ? "Importiere…" : "CSV Import"}
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            <button onClick={handleExport} className="btn-ghost"><Download className="size-4" /> CSV Export</button>
            <Link to="/auswertung/import" className="btn-secondary"><FileUp className="size-4" /> LV importieren</Link>
            <Link to="/auswertung/analyse" className="btn-secondary"><ChartColumnBig className="size-4" /> Analyse</Link>
            <Link to="/auswertung/neu" className="btn-primary"><Plus className="size-4" /> Neu</Link>
          </>
        }
      />

      <GewerkLeiste aktiv="heizung" className="mb-5" />

      {refs.length > 0 && (
        <>
          {/* Kennzahlen der gefilterten Menge. Haarlinien-Raster statt Farbflächen. */}
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4">
            <Kennzahl
              titel="Referenzen"
              wert={zahl(gefiltert.length)}
              zusatz={filterAktiv ? `von ${refs.length}` : kennzahlen.vonJahr
                ? `${kennzahlen.vonJahr}–${kennzahlen.bisJahr}` : null}
            />
            <Kennzahl titel="Median Netto" wert={chf(kennzahlen.medianNetto)} />
            <Kennzahl
              titel="Median Kennwert"
              wert={kennzahlen.medianKennwert != null ? `${zahl(kennzahlen.medianKennwert)} CHF/m²` : LEER}
              zusatz={`${kennzahlen.mitKennwert} mit EBF`}
            />
            <Kennzahl
              titel="P25–P75 Kennwert"
              wert={kennzahlen.p25 != null ? `${zahl(kennzahlen.p25)} – ${zahl(kennzahlen.p75)}` : LEER}
              zusatz={kennzahlen.p25 != null ? "CHF/m²" : null}
            />
          </div>

          {/* Filter */}
          <div className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="mr-1 w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Erzeuger</span>
              {WAERMEERZEUGER.map((e) => (
                <ChipToggle key={e.value} label={e.label} aktiv={fErzeuger.has(e.value)} onClick={() => toggleFilter(setFErzeuger)(e.value)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="mr-1 w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Abgabe</span>
              {WAERMEABGABE.map((a) => (
                <ChipToggle key={a} label={a} aktiv={fAbgabe.has(a)} onClick={() => toggleFilter(setFAbgabe)(a)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select className="input h-8 w-auto py-0 text-sm" value={fNutzung} onChange={(e) => setFNutzung(e.target.value)}>
                <option value="">Nutzung: alle</option>
                {GEBAEUDETYPEN.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select className="input h-8 w-auto py-0 text-sm" value={fProjektart} onChange={(e) => setFProjektart(e.target.value)}>
                <option value="">Projektart: alle</option>
                {PROJEKTARTEN.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={alleAuswaehlen} disabled={gefiltert.length === 0} className="btn-ghost text-sm disabled:opacity-40">
                  <CheckSquare className="size-4" /> {alleGefiltertGewaehlt ? "Auswahl aufheben" : "Alle auswählen"}
                </button>
                {filterAktiv ? (
                  <button onClick={filterReset} className="btn-ghost text-sm text-slate-500"><X className="size-4" /> Filter zurücksetzen</button>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}

      {importMsg && <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{importMsg}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Lade…</div>
      ) : refs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-700">Noch keine Referenzprojekte</p>
          <p className="mt-1 text-sm text-slate-400">Abgeschlossenes Projekt erfassen, CSV importieren oder Beispieldaten laden.</p>
          <Link to="/auswertung/neu" className="btn-primary mt-4"><Plus className="size-4" /> Erstes Referenzprojekt</Link>
        </div>
      ) : gefiltert.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">Kein Referenzprojekt passt zum Filter</p>
          <button onClick={filterReset} className="btn-secondary mt-3"><X className="size-4" /> Filter zurücksetzen</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="w-9 py-2 pl-3 pr-2" />
                {SPALTEN.map((s) => (
                  <th key={s.key} className={"py-2 pr-3 font-semibold " + (s.num ? "text-right " : "") + (s.breit ? "w-full" : "whitespace-nowrap")}>
                    <button
                      type="button"
                      onClick={() => sortieren(s.key)}
                      className={"inline-flex items-center gap-0.5 uppercase tracking-wide transition hover:text-slate-700 "
                        + (sort?.key === s.key ? "text-slate-700" : "")}
                    >
                      {s.titel}
                      {sort?.key === s.key
                        ? (sort.dir === 1 ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
                        : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zeilen.map((r) => {
                const gewaehlt = auswahl.has(r.id);
                const kennwert = kennwertVon(r);
                return (
                  <tr
                    key={r.id}
                    onClick={() => nav(`/auswertung/${r.id}`)}
                    className={"cursor-pointer transition hover:bg-slate-50 " + (gewaehlt ? "bg-slate-50" : "")}
                  >
                    <td className="py-2 pl-3 pr-2">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-brand-600"
                        checked={gewaehlt}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(r.id)}
                        title="Für Sammel-Löschen auswählen"
                      />
                    </td>
                    <td className="w-full max-w-0 truncate py-2 pr-3">
                      <Link
                        to={`/auswertung/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{r.projektart || LEER}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{r.gebaeudetyp || LEER}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                      {(r.waermeerzeuger || []).map(waermeerzeugerLabel).join(", ") || LEER}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{zahl(r.ebf_m2)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{zahl(r.heizleistung_kw, 1)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums text-slate-900">{zahl(r.summe_kosten)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{zahl(kennwert)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{jahrVon(r) ?? LEER}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kennzahl({ titel, wert, zusatz }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titel}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{wert}</div>
      {zusatz && <div className="text-[11px] tabular-nums text-slate-400">{zusatz}</div>}
    </div>
  );
}

function ChipToggle({ label, aktiv, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"rounded-full border px-2.5 py-0.5 text-xs font-medium transition "
        + (aktiv ? "border-brand-700 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400")}
    >
      {label}
    </button>
  );
}
