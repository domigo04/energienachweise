import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MapPin, User, CalendarDays, Trash2 } from "lucide-react";
import { getProjects, createProject, deleteProjectPermanent, deleteAllArchived } from "../../api/hcApi";
import { useAuth } from "../../auth/AuthContext";
import { GEBAEUDEKATEGORIEN, KLIMASTATIONEN } from "../../data/sia";

const LEER_FORM = { name: "", standort: "", kunde: "", beschreibung: "", gebaeudekategorie: "", klimastation: "", t_aussen: -8 };

function StatusBadge({ status }) {
  if (status === "archiviert") return <span className="badge bg-slate-100 text-slate-500">Archiviert</span>;
  return <span className="badge bg-green-100 text-green-700">Aktiv</span>;
}

export default function ProjectList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(LEER_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const kannEndgueltigLoeschen = user?.role === "admin" || user?.firma_role === "admin";

  useEffect(() => {
    loadProjects().finally(() => setLoading(false));
  }, []);

  const loadProjects = () => getProjects().then(setProjects).catch(() => setError("Verbindung zum Backend fehlgeschlagen"));

  const handleDeletePermanent = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Projekt endgültig löschen? Das kann nicht rückgängig gemacht werden.")) return;
    try {
      await deleteProjectPermanent(id);
      await loadProjects();
    } catch {
      setError("Löschen fehlgeschlagen");
    }
  };

  const handleDeleteAllArchived = async () => {
    const anzahl = projects.filter((p) => p.status === "archiviert").length;
    if (!confirm(`${anzahl} archivierte Projekt(e) endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      await deleteAllArchived();
      await loadProjects();
    } catch {
      setError("Löschen fehlgeschlagen");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const project = await createProject({
        name: form.name,
        standort: form.standort || null,
        kunde: form.kunde || null,
        beschreibung: form.beschreibung || null,
        base_data: {
          t_aussen: Number(form.t_aussen) || -8,
          t_innen: 20,
          gebaeudekategorie: form.gebaeudekategorie || null,
          klimastation: form.klimastation || null,
        },
      });
      navigate(`/projekte/${project.id}`);
    } catch {
      setError("Projekt konnte nicht erstellt werden");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      {/* Kopf */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projekte</h1>
          <p className="mt-1 text-sm text-slate-500">Die Heizungsplanungen deiner Firma — Schema, Auslegung und Grobkostenschätzung.</p>
        </div>
        <div className="flex gap-2">
          {kannEndgueltigLoeschen && projects.some((p) => p.status === "archiviert") && (
            <button onClick={handleDeleteAllArchived} className="btn-ghost text-slate-400 hover:text-red-500">
              <Trash2 className="size-4" /> Alle archivierten endgültig löschen
            </button>
          )}
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <Plus className="size-4" /> Neues Projekt
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Neues-Projekt-Formular */}
      {showForm && (
        <div className="card mb-6 p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Neues Projekt anlegen</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="label">Projektname *</label>
                <input className="input" placeholder="z.B. EFH Muster, Winterthur" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Standort</label>
                <input className="input" placeholder="z.B. Winterthur" value={form.standort}
                  onChange={(e) => setForm((f) => ({ ...f, standort: e.target.value }))} />
              </div>
              <div>
                <label className="label">Kunde / Bauherr</label>
                <input className="input" placeholder="z.B. Familie Muster" value={form.kunde}
                  onChange={(e) => setForm((f) => ({ ...f, kunde: e.target.value }))} />
              </div>
              <div>
                <label className="label">Beschreibung</label>
                <input className="input" placeholder="Kurze Beschreibung" value={form.beschreibung}
                  onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))} />
              </div>
              <div>
                <label className="label">Gebäudekategorie (SIA 380/1)</label>
                <select className="input" value={form.gebaeudekategorie}
                  onChange={(e) => setForm((f) => ({ ...f, gebaeudekategorie: e.target.value }))}>
                  <option value="">— bitte wählen —</option>
                  {GEBAEUDEKATEGORIEN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Klimastation (SIA 2028)</label>
                <select className="input" value={form.klimastation}
                  onChange={(e) => {
                    const station = KLIMASTATIONEN.find((s) => s.name === e.target.value);
                    setForm((f) => ({ ...f, klimastation: e.target.value, t_aussen: station ? station.theta_e : f.t_aussen }));
                  }}>
                  <option value="">— bitte wählen —</option>
                  {KLIMASTATIONEN.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.theta_e} °C)</option>)}
                </select>
              </div>
              <div>
                <label className="label">Auslegungstemperatur aussen [°C]</label>
                <input type="number" className="input" value={form.t_aussen}
                  onChange={(e) => setForm((f) => ({ ...f, t_aussen: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-400">aus SIA 2028, überschreibbar</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Erstelle…" : "Projekt erstellen"}
              </button>
              <button type="button" className="btn-secondary"
                onClick={() => { setShowForm(false); setForm(LEER_FORM); }}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Lade Projekte…</div>
      ) : projects.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 border-dashed p-12 text-center">
          <div className="text-4xl">🔥</div>
          <p className="font-medium text-slate-700">Noch keine Projekte vorhanden</p>
          <p className="text-sm text-slate-400">Erstelle dein erstes Projekt mit dem Button oben rechts.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} onClick={() => navigate(`/projekte/${p.id}`)}
              className="card group cursor-pointer p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{p.name}</h3>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={p.status} />
                  {kannEndgueltigLoeschen && p.status === "archiviert" && (
                    <button onClick={(e) => handleDeletePermanent(e, p.id)} className="text-slate-300 hover:text-red-500" title="Endgültig löschen">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {p.standort && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {p.standort}</span>}
                {p.kunde && <span className="inline-flex items-center gap-1"><User className="size-3.5" /> {p.kunde}</span>}
                <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {new Date(p.created_at).toLocaleDateString("de-CH")}</span>
              </div>
              {p.beschreibung && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.beschreibung}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
