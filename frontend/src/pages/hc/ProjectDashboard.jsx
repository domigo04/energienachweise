import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Share2, Calculator, Layers, ArrowRight, MapPin, User, Pencil, Archive } from "lucide-react";
import { getProject, updateProject } from "../../api/hcApi";
import { GEBAEUDEKATEGORIEN } from "../../data/sia";

const HEIZUNGSSYSTEM_LABELS = { FBH: "Fussbodenheizung", HK: "Heizkörper", gemischt: "Gemischt" };

export default function ProjectDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getProject(id)
      .then((p) => { setProject(p); setForm({ name: p.name, standort: p.standort || "", kunde: p.kunde || "", beschreibung: p.beschreibung || "" }); })
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
    { to: `/projekte/${id}/kostenschaetzung`, icon: Calculator, title: "Grobkostenschätzung", text: "Ähnlichkeitsgewichtete Schätzung aus Referenzprojekten." },
    { to: `/projekte/${id}/heizgruppen`, icon: Layers, title: "Heizgruppen", text: "Heizgruppen-Generator mit Volumenstrom." },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/projekte" className="hover:text-brand-600">Projekte</Link>
        <span>/</span>
        <span className="text-slate-800">{project.name}</span>
      </div>

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
          <div className="flex items-start justify-between gap-4">
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
                {project.beschreibung && <span>{project.beschreibung}</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setEditing(true)} className="btn-secondary"><Pencil className="size-4" /> Bearbeiten</button>
              {!archiviert && (
                <button onClick={handleArchive} className="btn-ghost text-slate-400 hover:text-red-500"><Archive className="size-4" /></button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Werkzeuge für dieses Projekt */}
      {!archiviert && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {TOOLS.map(({ to, icon: Icon, title, text, primary }) => (
            <Link key={to} to={to}
              className={"group flex flex-col rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md " +
                (primary ? "border-transparent bg-gradient-to-br from-brand-600 to-brand-700 text-white" : "card hover:border-brand-200")}>
              <div className={"flex size-10 items-center justify-center rounded-xl " + (primary ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600")}>
                <Icon className="size-5" />
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
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Projektgrundlagen</h2>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><div className="text-xs text-slate-400">Auslegungstemperatur</div><div className="font-medium text-slate-900">{bd.t_aussen} °C</div></div>
            <div><div className="text-xs text-slate-400">Raumtemperatur</div><div className="font-medium text-slate-900">{bd.t_innen} °C</div></div>
            <div><div className="text-xs text-slate-400">Heizungssystem</div><div className="font-medium text-slate-900">{HEIZUNGSSYSTEM_LABELS[bd.heizungssystem] || bd.heizungssystem}</div></div>
            {bd.warmwasser_bedarf_kw != null && <div><div className="text-xs text-slate-400">BWW-Bedarf</div><div className="font-medium text-slate-900">{bd.warmwasser_bedarf_kw} kW</div></div>}
            {bd.gebaeudekategorie && <div><div className="text-xs text-slate-400">Gebäudekategorie</div><div className="font-medium text-slate-900">{GEBAEUDEKATEGORIEN.find((k) => k.value === bd.gebaeudekategorie)?.label || bd.gebaeudekategorie}</div></div>}
            {bd.klimastation && <div><div className="text-xs text-slate-400">Klimastation</div><div className="font-medium text-slate-900">{bd.klimastation}</div></div>}
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
