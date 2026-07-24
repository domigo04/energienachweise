import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Share2, Calculator, Waves, ListChecks, FileText, ClipboardList,
  ArrowLeft, MapPin, User, UserRoundCheck, Pencil, Archive, History, ChevronDown,
} from "lucide-react";
import { getProject, getProjectAudit, getProjectStatus, updateProject } from "../../api/hcApi";
import ProjectModuleNode from "../../components/hc/ProjectModuleNode";

const AUDIT_LABELS = {
  projekt_erstellt: "Projekt erstellt",
  projekt_aktualisiert: "Projektstammdaten geändert",
  projekt_archiviert: "Projekt archiviert",
  parameter_ergaenzt: "Projektmenge ergänzt",
  projektverantwortung_geaendert: "Projektverantwortung geändert",
  schema_stand_gespeichert: "Schema-Stand gespeichert",
  schema_stand_wiederhergestellt: "Schema-Stand wiederhergestellt",
  kostenschaetzung_gespeichert: "Kostenschätzung gespeichert",
  kostenschaetzung_status_geaendert: "Status der Kostenschätzung geändert",
};

// §14 — echte Datenabhängigkeiten zwischen den Modulen. Das UI erklärt die
// Architektur, ohne dass man Text lesen muss.
const CONNECTIONS = [
  ["project_data", "cost_estimate"],
  ["schema", "hydraulics"],
  ["schema", "quantities"],
  ["quantities", "cost_estimate"],
  ["hydraulics", "documentation"],
  ["cost_estimate", "documentation"],
];

function relatedKeys(key) {
  if (!key) return null;
  const set = new Set([key]);
  for (const [a, b] of CONNECTIONS) {
    if (a === key) set.add(b);
    if (b === key) set.add(a);
  }
  return set;
}

export default function ProjectDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [protokoll, setProtokoll] = useState(null);
  const [protokollOpen, setProtokollOpen] = useState(false);
  const [protokollLoading, setProtokollLoading] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    Promise.all([getProject(id), getProjectStatus(id)])
      .then(([p, s]) => { setProject(p); setStatus(s); })
      .catch(() => setError("Projekt konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleArchive = async () => {
    if (!confirm("Projekt archivieren?")) return;
    try {
      await updateProject(id, { status: "archiviert" });
      navigate("/projekte");
    } catch {
      setError("Archivieren fehlgeschlagen");
    }
  };

  const toggleProtokoll = async () => {
    const nextOpen = !protokollOpen;
    setProtokollOpen(nextOpen);
    if (nextOpen && protokoll === null) {
      setProtokollLoading(true);
      try { setProtokoll(await getProjectAudit(id)); }
      catch { setError("Änderungsprotokoll konnte nicht geladen werden"); }
      finally { setProtokollLoading(false); }
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-400">Lade Projekt…</div>;
  if (!project && error) return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 text-red-600">{error}</div>
      <Link to="/projekte" className="text-sm text-brand-600 hover:underline">← Zurück zur Übersicht</Link>
    </div>
  );

  const archiviert = project.status === "archiviert";
  const m = status?.modules || {};
  const completion = status?.completion ?? 0;

  // §12 — Modul-Nodes aus dem Backend-Status. Metriken bleiben klein und
  // technisch (§39); die Reihenfolge folgt dem Datenfluss von oben nach unten.
  const nodes = {
    project_data: {
      title: "Projektinfos", icon: ClipboardList, status: m.project_data?.status,
      metric: project.standort || project.kunde || "—",
      secondaryMetric: m.project_data ? `${m.project_data.known}/${m.project_data.total} Grunddaten` : null,
      warnings: m.project_data?.warnings || 0,
      to: `/projekte/${id}/info`,
    },
    schema: {
      title: "Anlagenschema", icon: Share2, status: m.schema?.status,
      metric: m.schema?.revision ? `Version ${m.schema.revision}` : "Kein Stand",
      secondaryMetric: m.schema ? `${m.schema.node_count} Bauteile · ${m.schema.edge_count} Leitungen` : null,
      warnings: m.schema?.warnings || 0,
      to: `/projekte/${id}/schema`,
    },
    hydraulics: {
      title: "Hydraulik", icon: Waves, status: m.hydraulics?.status,
      metric: m.hydraulics?.status === "complete" ? "berechnet" : m.hydraulics?.status === "warning" ? "prüfen" : "—",
      to: `/projekte/${id}/schema`,
    },
    quantities: {
      title: "Projektmengen", icon: ListChecks, status: m.quantities?.status,
      metric: m.quantities ? `${m.quantities.known}/${m.quantities.total} bekannt` : "—",
      secondaryMetric: m.quantities?.warnings ? `${m.quantities.warnings} offen` : null,
      warnings: m.quantities?.warnings || 0,
      to: `/projekte/${id}/mengen`,
    },
    cost_estimate: {
      title: "Kostenschätzung", icon: Calculator, status: m.cost_estimate?.status,
      metric: m.cost_estimate?.version ? `Version ${m.cost_estimate.version}` : "Noch keine",
      isStale: m.cost_estimate?.stale,
      to: `/projekte/${id}/kostenschaetzung`,
    },
    documentation: {
      title: "Dokumentation", icon: FileText, status: m.documentation?.status,
      metric: "geplant",
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:py-8 lg:px-8">
      <Link to="/projekte" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> Projekte
      </Link>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* §11 — Projekt-Kopf mit Fortschritt */}
      <div className="card mb-6 p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
              {archiviert
                ? <span className="badge bg-slate-100 text-slate-500">Archiviert</span>
                : <span className="badge bg-green-100 text-green-700">Aktiv</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {project.standort && <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-slate-400" /> {project.standort}</span>}
              {project.kunde && <span className="inline-flex items-center gap-1"><User className="size-4 text-slate-400" /> {project.kunde}</span>}
              {project.verantwortlicher_name && <span className="inline-flex items-center gap-1"><UserRoundCheck className="size-4 text-slate-400" /> {project.verantwortlicher_name}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {status && (
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-slate-900">{completion}<span className="text-base text-slate-400"> %</span></div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Projektstatus</div>
              </div>
            )}
            <div className="flex gap-2">
              <Link to={`/projekte/${id}/info`} className="btn-secondary min-h-11"><Pencil className="size-4" /> Bearbeiten</Link>
              {!archiviert && (
                <button onClick={handleArchive} aria-label="Projekt archivieren" className="btn-ghost min-h-11 min-w-11 text-slate-400 hover:text-red-500"><Archive className="size-4" /></button>
              )}
            </div>
          </div>
        </div>
        {status && (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${completion}%` }} />
          </div>
        )}
      </div>

      {/* §10/§15 — Project Universe: feste intelligente Anordnung, CSS-Grid + SVG */}
      <ProjectUniverse nodes={nodes} hovered={hovered} setHovered={setHovered} />

      {/* §40 — Activity, bewusst dezent */}
      <section className="card mt-6 overflow-hidden">
        <button type="button" onClick={toggleProtokoll}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><History className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">Activity</div>
            <div className="text-xs text-slate-500">Bearbeiter, Änderung und genauer Zeitpunkt.</div>
          </div>
          <ChevronDown className={`size-4 text-slate-400 transition ${protokollOpen ? "rotate-180" : ""}`} />
        </button>
        {protokollOpen && (
          <div className="border-t border-slate-100">
            {protokollLoading && <div className="px-5 py-6 text-sm text-slate-400">Protokoll wird geladen…</div>}
            {!protokollLoading && (protokoll || []).map((event) => (
              <article key={event.id} className="grid gap-1 border-b border-slate-100 px-4 py-3.5 last:border-b-0 sm:grid-cols-[1fr_auto] sm:px-5">
                <div>
                  <div className="text-sm font-medium text-slate-800">{AUDIT_LABELS[event.action] || event.action}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{event.actor_name || "System"}</div>
                </div>
                <time className="text-xs tabular-nums text-slate-400">
                  {new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}
                </time>
              </article>
            ))}
            {!protokollLoading && protokoll?.length === 0 && (
              <div className="px-5 py-6 text-sm text-slate-400">Noch keine Änderungen protokolliert.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// §10-15 — die Modulfläche mit gemessenen SVG-Verbindungen hinter den Cards.
// Kein React Flow: feste Anordnung im CSS-Grid, Linien werden aus den echten
// Kartenpositionen berechnet und bei Grössenänderung neu vermessen (§15).
function ProjectUniverse({ nodes, hovered, setHovered }) {
  const containerRef = useRef(null);
  const refs = useRef({});
  const [paths, setPaths] = useState([]);

  const setNodeRef = (key) => (el) => { refs.current[key] = el; };

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const next = [];
    for (const [from, to] of CONNECTIONS) {
      const a = refs.current[from]?.getBoundingClientRect();
      const b = refs.current[to]?.getBoundingClientRect();
      if (!a || !b) continue;
      const x1 = a.left - base.left + a.width / 2;
      const y1 = a.top - base.top + a.height;
      const x2 = b.left - base.left + b.width / 2;
      const y2 = b.top - base.top;
      const my = (y1 + y2) / 2;
      next.push({ from, to, d: `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}` });
    }
    setPaths(next);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure, nodes]);

  const related = relatedKeys(hovered);
  const nodeDimmed = (key) => (related ? !related.has(key) : false);

  const cell = (key, extra = "") => {
    const n = nodes[key];
    return (
      <div className={extra}>
        <ProjectModuleNode
          ref={setNodeRef(key)}
          {...n}
          dimmed={nodeDimmed(key)}
          active={hovered === key}
          onMouseEnter={() => setHovered(key)}
          onMouseLeave={() => setHovered(null)}
        />
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Verbindungslinien hinter den Cards (§14) */}
      <svg className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full sm:block" aria-hidden="true">
        {paths.map((p) => {
          const highlight = hovered && (p.from === hovered || p.to === hovered);
          const faded = hovered && !highlight;
          return (
            <path key={`${p.from}-${p.to}`} d={p.d} fill="none"
              stroke={highlight ? "#6366f1" : "#cbd5e1"}
              strokeWidth={highlight ? 2 : 1.5}
              strokeOpacity={faded ? 0.3 : 1}
              className="transition-all" />
          );
        })}
      </svg>

      {/* Aufgeräumte, deterministische Anordnung: eine zentrale Spine mit einer
          symmetrischen Verzweigung (Hydraulik/Mengen). Die SVG-Linien vermessen
          die echten Kartenpositionen und folgen automatisch (§10/§11). */}
      <div className="relative z-10 mx-auto flex max-w-md flex-col items-stretch gap-6 sm:gap-9">
        {cell("project_data", "mx-auto w-full max-w-xs")}
        {cell("schema", "mx-auto w-full max-w-xs")}
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {cell("hydraulics")}
          {cell("quantities")}
        </div>
        {cell("cost_estimate", "mx-auto w-full max-w-xs")}
        {cell("documentation", "mx-auto w-full max-w-xs")}
      </div>
    </div>
  );
}
