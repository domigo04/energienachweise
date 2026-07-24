import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Share2, Calculator, Waves, ListChecks, FileText, ClipboardList, Workflow,
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
      <ProjectUniverse nodes={nodes} hovered={hovered} setHovered={setHovered} completion={completion} />

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
// Statuspunkt-Farben (§13) für die Umlaufbahn.
const STATUS_DOT = {
  not_started: "#cbd5e1", in_progress: "#3b82f6", incomplete: "#f59e0b",
  complete: "#22c55e", warning: "#f97316", error: "#ef4444",
  stale: "#f97316", released: "#8b5cf6",
};

// Reihenfolge im Uhrzeigersinn ab oben = Datenfluss, aber als GESCHLOSSENER
// Kreis um das zentrale Projektmodell (Single Source of Truth). So hängt alles
// zusammen statt in einem linearen Flussdiagramm.
const ORBIT = [
  { key: "project_data", subtitle: "EBF · Nutzung · Einheiten" },
  { key: "schema", subtitle: "Geometrie + Verbindungen" },
  { key: "hydraulics", subtitle: "Auslegung + Plausibilität" },
  { key: "quantities", subtitle: "Mengen + Herkunft" },
  { key: "cost_estimate", subtitle: "Referenzen + Bandbreite" },
  { key: "documentation", subtitle: "Plan + Nachweise" },
];

function ProjectUniverse({ nodes, hovered, setHovered, completion }) {
  const R = 34; // Radius der Modulkarten (% der quadratischen Fläche)
  const punkt = (i, radius) => {
    const angle = (-90 + i * (360 / ORBIT.length)) * (Math.PI / 180);
    return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  };

  const OrbitCard = ({ m }) => {
    const n = nodes[m.key];
    const dimmed = hovered && hovered !== m.key;
    const dot = STATUS_DOT[n?.status] || STATUS_DOT.not_started;
    const inner = (
      <div
        className="w-40 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
        style={{ opacity: dimmed ? 0.45 : 1, borderColor: hovered === m.key ? "#a5b4fc" : "#e2e8f0" }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{n?.title}</span>
          <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
        </div>
        <div className="mt-0.5 text-[10px] text-slate-400">{m.subtitle}</div>
        {n?.metric != null && <div className="mt-1 truncate text-xs font-semibold text-slate-800">{n.metric}</div>}
      </div>
    );
    if (n?.to) return <Link to={n.to} className="block">{inner}</Link>;
    if (n?.onClick) return <button type="button" onClick={n.onClick} className="block w-full">{inner}</button>;
    return inner;
  };

  return (
    <>
      {/* Mobil: schlichte Liste (das Orbit-Layout braucht Fläche) */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {ORBIT.map((m) => (
          <ProjectModuleNode key={m.key} {...nodes[m.key]} />
        ))}
      </div>

      {/* Desktop: orbitales Projektuniversum */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-2xl sm:block">
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {/* Umlaufbahnen */}
          <circle cx="50" cy="50" r="15" fill="none" stroke="#c7d2fe" strokeWidth="0.2" strokeDasharray="1 1.4" />
          <circle cx="50" cy="50" r="26" fill="none" stroke="#e2e8f0" strokeWidth="0.25" />
          <circle cx="50" cy="50" r="36" fill="none" stroke="#e2e8f0" strokeWidth="0.25" />
          {/* Verbindungslinien vom Zentrum zu jedem Modul */}
          {ORBIT.map((m, i) => {
            const p = punkt(i, R - 8);
            const hl = hovered === m.key;
            return (
              <line key={m.key} x1="50" y1="50" x2={p.x} y2={p.y}
                stroke={hl ? "#6366f1" : "#dbe2ea"} strokeWidth={hl ? 0.5 : 0.3}
                strokeOpacity={hovered && !hl ? 0.3 : 1} className="transition-all" />
            );
          })}
          {/* Statuspunkte auf der mittleren Bahn */}
          {ORBIT.map((m, i) => {
            const p = punkt(i, R - 8);
            return (
              <circle key={m.key} cx={p.x} cy={p.y} r={hovered === m.key ? 1.3 : 1}
                fill={STATUS_DOT[nodes[m.key]?.status] || STATUS_DOT.not_started} className="transition-all" />
            );
          })}
        </svg>

        {/* Zentrales Projektmodell */}
        <div className="absolute left-1/2 top-1/2 flex aspect-square w-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-slate-100 bg-white text-center shadow-[0_18px_50px_-12px_rgba(79,70,229,0.28)]">
          <Workflow className="size-6 text-brand-600" />
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Projektmodell</div>
          <div className="text-2xl font-bold leading-none text-slate-900">{completion}<span className="text-sm text-slate-400">%</span></div>
          <div className="mt-0.5 text-[9px] text-slate-400">Single Source of Truth</div>
        </div>

        {/* Modulkarten auf der Umlaufbahn */}
        {ORBIT.map((m, i) => {
          const p = punkt(i, R);
          return (
            <div key={m.key} className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              onMouseEnter={() => setHovered(m.key)} onMouseLeave={() => setHovered(null)}>
              <OrbitCard m={m} />
            </div>
          );
        })}
      </div>
    </>
  );
}
