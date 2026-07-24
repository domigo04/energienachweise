import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, X, Check, Info } from "lucide-react";
import { getProject, getProjectContext, setProjectParameter } from "../../api/hcApi";

// §37 — Projektmengenansicht: der komplette ProjectContext nach Kategorien.
// Zeigt je Parameter effektiven Wert + Herkunft + Status und erlaubt komfortable
// externe Ergänzungen / bewusste Übersteuerungen (§20/§21). Reine Sicht auf die
// eine Projektwahrheit — nichts wird hier doppelt gepflegt.

const KATEGORIE_LABELS = {
  grunddaten: "Projektgrunddaten",
  erzeugung: "Wärmeerzeugung",
  verteilung: "Wärmeverteilung",
  messung: "Wärmemessung",
};
const KATEGORIE_ORDER = ["grunddaten", "erzeugung", "verteilung", "messung"];

const SOURCE_LABELS = {
  schema: "Schema",
  projekt: "Projekt",
  extern: "Ergänzt",
  manuell: "Manuell",
  "schema+extern": "Schema + Ergänzung",
};

const STATUS_STYLE = {
  bekannt: "bg-green-100 text-green-700",
  erkannt: "bg-blue-100 text-blue-700",
  ergaenzung_erforderlich: "bg-amber-100 text-amber-800",
  unbekannt: "bg-slate-100 text-slate-500",
};
const STATUS_LABELS = {
  bekannt: "bekannt",
  erkannt: "erkannt",
  ergaenzung_erforderlich: "Ergänzung offen",
  unbekannt: "unbekannt",
};

// Erzeugertyp: strukturierte Codes verständlich anzeigen (§4).
const GENERATOR_TYPE_LABELS = {
  ews_wp: "Sole/Wasser-WP (Erdsonden)",
  lwwp: "Luft/Wasser-WP",
  wasser_wp: "Wasser/Wasser-WP",
  co2_wp: "CO₂-Wärmepumpe",
  fernwaerme: "Fernwärme",
  gas: "Gas",
  oel: "Öl",
  holz: "Holz",
  elektro: "Elektro",
  hybrid: "Hybrid",
  sonstige: "Sonstige",
};

function formatValue(p) {
  const v = p.effective_value;
  if (v === null || v === undefined || v === "") return "—";
  if (p.key === "generator_type") return GENERATOR_TYPE_LABELS[v] || v;
  const num = typeof v === "number" ? v.toLocaleString("de-CH") : v;
  return p.einheit ? `${num} ${p.einheit}` : num;
}

function SourceBadge({ param }) {
  if (!param.source) return null;
  // Der §20-Sonderfall additiv anschaulich machen: "3 Schema + 10 ergänzt".
  const detail =
    param.source === "schema+extern" && param.schema_value != null && param.external_value != null
      ? `${param.schema_value} Schema + ${param.external_value} ergänzt`
      : SOURCE_LABELS[param.source] || param.source;
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
      {detail}
      {param.quelle_notiz ? ` · ${param.quelle_notiz}` : ""}
    </span>
  );
}

function ParamRow({ projectId, param, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [ext, setExt] = useState(param.external_value ?? "");
  const [override, setOverride] = useState(param.manual_override ?? "");
  const [notiz, setNotiz] = useState(param.quelle_notiz ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Grunddaten leben in den Projektinformationen — hier nur lesen (keine zweite
  // Pflegestelle). Technische Mengen dürfen ergänzt/übersteuert werden.
  const editierbar = param.kategorie !== "grunddaten";

  const open = () => {
    setExt(param.external_value ?? "");
    setOverride(param.manual_override ?? "");
    setNotiz(param.quelle_notiz ?? "");
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const ctx = await setProjectParameter(projectId, param.key, {
        external_value: ext === "" ? null : String(ext),
        manual_override: override === "" ? null : String(override),
        quelle_notiz: notiz === "" ? null : notiz,
      });
      onSaved(ctx);
      setEditing(false);
    } catch {
      setError("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{param.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[param.status] || STATUS_STYLE.unbekannt}`}>
              {STATUS_LABELS[param.status] || param.status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <SourceBadge param={param} />
            {param.updated_by_name && <span>· {param.updated_by_name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-right text-sm font-bold tabular-nums text-slate-900">{formatValue(param)}</span>
          {editierbar && !editing && (
            <button onClick={open} className="btn-ghost min-h-9 min-w-9 text-slate-400 hover:text-brand-600" aria-label="Ergänzen oder übersteuern">
              <Pencil className="size-4" />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:grid-cols-3 sm:px-5">
          <div>
            <label className="label">Ergänzung {param.einheit ? `[${param.einheit}]` : ""}</label>
            <input className="input" value={ext} onChange={(e) => setExt(e.target.value)}
              placeholder={param.schema_value != null ? `zusätzlich zu ${param.schema_value} aus Schema` : "aus dem Gebäude"} />
          </div>
          <div>
            <label className="label">Übersteuerung</label>
            <input className="input" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="effektiven Wert erzwingen" />
          </div>
          <div>
            <label className="label">Herkunft / Grund</label>
            <input className="input" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z.B. Grundrissauszug" />
          </div>
          {error && <div className="text-sm text-red-600 sm:col-span-3">{error}</div>}
          <div className="flex gap-2 sm:col-span-3">
            <button onClick={save} disabled={saving} className="btn-primary"><Check className="size-4" /> {saving ? "Speichere…" : "Speichern"}</button>
            <button onClick={() => setEditing(false)} className="btn-secondary"><X className="size-4" /> Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjektMengenPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getProject(id), getProjectContext(id)])
      .then(([p, c]) => { setProject(p); setContext(c); })
      .catch(() => setError("Projektmengen konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [id]);

  const gruppen = useMemo(() => {
    if (!context) return [];
    const byKat = {};
    for (const p of context.parameter) (byKat[p.kategorie] ||= []).push(p);
    return KATEGORIE_ORDER.filter((k) => byKat[k]?.length).map((k) => ({ key: k, params: byKat[k] }));
  }, [context]);

  const z = context?.zusammenfassung;
  const bekannt = z ? z.bekannt + z.erkannt : 0;

  if (loading) return <div className="p-8 text-sm text-slate-400">Lade Projektmengen…</div>;
  if (error) return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-4 text-red-600">{error}</div>
      <Link to={`/projekte/${id}`} className="text-sm text-brand-600 hover:underline">← Zurück zum Projekt</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:py-8 lg:px-8">
      <Link to={`/projekte/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> {project?.name || "Projekt"}
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projektmengen</h1>
          <p className="mt-1 text-sm text-slate-500">Die technische Brücke zwischen Planung und Kosten — jeder Wert mit seiner Herkunft.</p>
        </div>
        {z && (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Datenbasis: {bekannt} von {z.anzahl_parameter} bekannt
          </div>
        )}
      </div>

      {z && (z.ergaenzung_erforderlich > 0 || z.unbekannt > 0) && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {z.ergaenzung_erforderlich > 0 && `${z.ergaenzung_erforderlich} Angabe(n) aus dem Schema können ergänzt werden. `}
            {z.unbekannt > 0 && `${z.unbekannt} Parameter sind noch unbekannt — eine frühe Kostenschätzung ist trotzdem möglich.`}
          </span>
        </div>
      )}

      <div className="space-y-6">
        {gruppen.map(({ key, params }) => (
          <section key={key} className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-bold text-slate-800">{KATEGORIE_LABELS[key] || key}</h2>
            </div>
            <div>
              {params.map((p) => (
                <ParamRow key={p.key} projectId={id} param={p} onSaved={setContext} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
