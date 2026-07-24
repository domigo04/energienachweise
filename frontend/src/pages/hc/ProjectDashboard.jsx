import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Share2, Calculator, Layers, ClipboardList, ListChecks, ArrowRight, ArrowLeft, MapPin, User, UserRoundCheck, Pencil, Archive, BadgeCheck, CircleDashed, LockKeyhole, History, ChevronDown } from "lucide-react";
import { getProject, getProjectAudit, getProjectFreigaben, updateProject } from "../../api/hcApi";
import { GEBAEUDEKATEGORIEN } from "../../data/sia";

const HEIZUNGSSYSTEM_LABELS = { FBH: "Fussbodenheizung", HK: "Heizkörper", gemischt: "Gemischt" };
const AUDIT_LABELS = {
  projekt_erstellt: "Projekt erstellt",
  projekt_aktualisiert: "Projektstammdaten geändert",
  projekt_archiviert: "Projekt archiviert",
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
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [freigaben, setFreigaben] = useState(null);
  const [protokoll, setProtokoll] = useState(null);
  const [protokollOpen, setProtokollOpen] = useState(false);
  const [protokollLoading, setProtokollLoading] = useState(false);

  useEffect(() => {
    Promise.all([getProject(id), getProjectFreigaben(id)])
      .then(([p, f]) => { setProject(p); setFreigaben(f); setForm({ name: p.name, standort: p.standort || "", kunde: p.kunde || "", beschreibung: p.beschreibung || "" }); })
      .catch(() => setError("Projekt konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProject(id, form);
      setProject(updated);
      setEditing(false);
    } catch {
      setError("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

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
      try {
        setProtokoll(await getProjectAudit(id));
      } catch {
        setError("Änderungsprotokoll konnte nicht geladen werden");
      } finally {
        setProtokollLoading(false);
      }
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-400">Lade Projekt…</div>;
  if (!project && error) return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 text-red-600">{error}</div>
      <Link to="/projekte" className="text-sm text-brand-600 hover:underline">← Zurück zur Übersicht</Link>
    </div>
  );

  const bd = project.base_data;
  const hasGroups = project.heating_groups?.length > 0;
  const archiviert = project.status === "archiviert";

  const TOOLS = [
    { to: `/projekte/${id}/schema`, icon: Share2, title: "Anlagenschema", text: "Schema zeichnen — Berechnungen leben in den Bauteilen.", primary: true },
    { to: `/projekte/${id}/info`, icon: ClipboardList, title: "Projektinformationen", text: "EBF, Nutzung, Einheiten, Projektart, Region — zentral gepflegt." },
    { to: `/projekte/${id}/mengen`, icon: ListChecks, title: "Projektmengen", text: "Alle technischen Mengen mit Herkunft — die Brücke zur Kostenschätzung." },
    { to: `/projekte/${id}/kostenschaetzung`, icon: Calculator, title: "Grobkostenschätzung", text: "Ähnlichkeitsgewichtete Schätzung aus Referenzprojekten." },
    { to: `/projekte/${id}/heizgruppen`, icon: Layers, title: "Heizgruppen", text: "Heizgruppen-Generator mit Volumenstrom." },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:py-8 lg:px-8">
      {/* Zurück zur Projektübersicht */}
      <Link to="/projekte" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> Projekte
      </Link>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Projekt-Kopf */}
      <div className="card mb-6 p-6">
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><label className="label">Projektname *</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="label">Standort</label><input className="input" value={form.standort} onChange={(e) => setForm((f) => ({ ...f, standort: e.target.value }))} /></div>
              <div><label className="label">Kunde</label><input className="input" value={form.kunde} onChange={(e) => setForm((f) => ({ ...f, kunde: e.target.value }))} /></div>
              <div><label className="label">Beschreibung</label><input className="input" value={form.beschreibung} onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? "Speichere…" : "Speichern"}</button>
              <button onClick={() => setEditing(false)} className="btn-secondary">Abbrechen</button>
            </div>
          </div>
        ) : (
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
                {project.verantwortlicher_name && <span className="inline-flex items-center gap-1"><UserRoundCheck className="size-4 text-slate-400" /> Verantwortlich: {project.verantwortlicher_name}</span>}
                {project.beschreibung && <span>{project.beschreibung}</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setEditing(true)} className="btn-secondary min-h-11 flex-1 justify-center sm:flex-none"><Pencil className="size-4" /> Bearbeiten</button>
              {!archiviert && (
                <button onClick={handleArchive} aria-label="Projekt archivieren" className="btn-ghost min-h-11 min-w-11 text-slate-400 hover:text-red-500"><Archive className="size-4" /></button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Zentraler Freigabestand des Projekts */}
      {freigaben && (
        <div className="card mb-6 overflow-hidden">
          <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Freigaben im Projekt</h2>
              <p className="mt-0.5 text-xs text-slate-500">Verbindliche Stände und gespeicherte Snapshots auf einen Blick.</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {freigaben.anzahl_freigegeben} / {freigaben.anzahl_module} freigegeben
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {freigaben.freigaben.map((item) => (
              <Link key={item.key} to={`/projekte/${id}/kostenschaetzung`}
                className="group grid min-h-20 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 transition hover:bg-slate-50 sm:flex sm:gap-4 sm:px-5">
                <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${item.freigegeben ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {item.freigegeben ? <BadgeCheck className="size-5" /> : <CircleDashed className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{item.titel}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${item.freigegeben ? "bg-green-100 text-green-700" : item.status === "fachlich_geprueft" ? "bg-blue-100 text-blue-700" : item.status === "unvollstaendig" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                      {item.status_label}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.freigegeben
                      ? `${item.variante === "brutto" ? "Brutto" : "Netto"} · Snapshot Version ${item.version_nr}${item.freigegeben_at ? ` · ${new Date(item.freigegeben_at).toLocaleString("de-CH")}` : ""}`
                      : item.status === "nicht_begonnen" ? "Noch keine Schätzung gespeichert" : "Noch kein verbindlicher Snapshot"}
                  </div>
                </div>
                {item.freigegeben && <LockKeyhole className="hidden size-4 text-green-600 sm:block" />}
                <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Lazy geladen: Das Projekt bleibt schnell, solange das Protokoll nicht gebraucht wird. */}
      <section className="card mb-6 overflow-hidden">
        <button
          type="button"
          onClick={toggleProtokoll}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <History className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">Änderungsprotokoll</div>
            <div className="text-xs text-slate-500">Bearbeiter, Änderung und genauer Zeitpunkt nachvollziehen.</div>
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
                  {event.details?.manuelle_aenderungen?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {event.details.manuelle_aenderungen.map((item) => (
                        <span key={`${item.variante}-${item.bkp_nr}`} className="badge bg-amber-50 text-amber-800">
                          BKP {item.bkp_nr}: {item.vorher ?? "–"} → {item.nachher ?? "–"} CHF
                        </span>
                      ))}
                    </div>
                  )}
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

      {/* Werkzeuge für dieses Projekt */}
      {!archiviert && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {TOOLS.map(({ to, icon: Icon, title, text, primary }) => (
            <Link key={to} to={to}
              className={"group flex flex-col rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md " +
                (primary ? "border-transparent bg-gradient-to-br from-brand-600 to-brand-700 text-white" : "card hover:border-brand-200")}>
              <div className={"flex size-10 items-center justify-center rounded-xl " + (primary ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600")}>
                {React.createElement(Icon, { className: "size-5" })}
              </div>
              <div className={"mt-3 text-base font-bold " + (primary ? "text-white" : "text-slate-900")}>{title}</div>
              <p className={"mt-1 flex-1 text-sm " + (primary ? "text-white/80" : "text-slate-500")}>{text}</p>
              <span className={"mt-3 inline-flex items-center gap-1 text-sm font-semibold " + (primary ? "text-white" : "text-brand-600")}>
                Öffnen <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Grunddaten */}
      {bd && (
        <div className="card mb-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Projektgrundlagen</h2>
            <Link to={`/projekte/${id}/info`} className="text-xs font-semibold text-brand-600 hover:underline">Bearbeiten →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><div className="text-xs text-slate-400">Auslegungstemperatur</div><div className="font-medium text-slate-900">{bd.t_aussen} °C</div></div>
            <div><div className="text-xs text-slate-400">Raumtemperatur</div><div className="font-medium text-slate-900">{bd.t_innen} °C</div></div>
            <div><div className="text-xs text-slate-400">Heizungssystem</div><div className="font-medium text-slate-900">{HEIZUNGSSYSTEM_LABELS[bd.heizungssystem] || bd.heizungssystem}</div></div>
            {bd.warmwasser_bedarf_kw != null && <div><div className="text-xs text-slate-400">BWW-Bedarf</div><div className="font-medium text-slate-900">{bd.warmwasser_bedarf_kw} kW</div></div>}
            {bd.gebaeudekategorie && <div><div className="text-xs text-slate-400">Gebäudekategorie</div><div className="font-medium text-slate-900">{GEBAEUDEKATEGORIEN.find((k) => k.value === bd.gebaeudekategorie)?.label || bd.gebaeudekategorie}</div></div>}
            {bd.klimastation && <div><div className="text-xs text-slate-400">Klimastation</div><div className="font-medium text-slate-900">{bd.klimastation}</div></div>}
            {bd.ebf_m2 != null && <div><div className="text-xs text-slate-400">EBF</div><div className="font-medium text-slate-900">{bd.ebf_m2} m²</div></div>}
            {bd.anzahl_nutzungseinheiten != null && <div><div className="text-xs text-slate-400">Nutzungseinheiten</div><div className="font-medium text-slate-900">{bd.anzahl_nutzungseinheiten}</div></div>}
            {bd.projektart && <div><div className="text-xs text-slate-400">Projektart</div><div className="font-medium text-slate-900">{bd.projektart}</div></div>}
            {bd.region && <div><div className="text-xs text-slate-400">Region</div><div className="font-medium text-slate-900">{bd.region}</div></div>}
            {bd.zertifizierung && <div><div className="text-xs text-slate-400">Zertifizierung</div><div className="font-medium text-slate-900">{bd.zertifizierung}</div></div>}
          </div>
        </div>
      )}

      {/* Heizgruppen-Übersicht */}
      {hasGroups && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Heizgruppen — Übersicht</h2>
            <Link to={`/projekte/${id}/heizgruppen`} className="text-xs font-semibold text-brand-600 hover:underline">Alle bearbeiten →</Link>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-lg font-bold text-slate-900">{project.summe_leistung_kw?.toFixed(1)} kW</div>
              <div className="text-xs text-slate-500">Gesamtleistung</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-lg font-bold text-slate-900">{project.summe_volumenstrom_m3h?.toFixed(3)} m³/h</div>
              <div className="text-xs text-slate-500">Gesamtvolumenstrom</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-lg font-bold text-slate-900">{project.rl_gemischt != null ? `${project.rl_gemischt.toFixed(1)} °C` : "—"}</div>
              <div className="text-xs text-slate-500">Gem. Rücklauf</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
