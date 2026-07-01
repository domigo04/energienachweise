import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects, createProject } from "../../api/hcApi";
import { GEBAEUDEKATEGORIEN, KLIMASTATIONEN } from "../../data/sia";

const statusBadge = (status) => {
  if (status === "archiviert")
    return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Archiviert</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Aktiv</span>;
};

export default function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", standort: "", kunde: "", beschreibung: "", gebaeudekategorie: "", klimastation: "", t_aussen: -8 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setError("Verbindung zum Backend fehlgeschlagen"))
      .finally(() => setLoading(false));
  }, []);

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
      navigate(`/heizungscockpit/projekte/${project.id}`);
    } catch {
      setError("Projekt konnte nicht erstellt werden");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Heizungscockpit</h1>
          <p className="text-gray-500 text-sm mt-1">Engineering-Plattform für Heizungsplanung</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + Neues Projekt
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Neues Projekt Formular */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Neues Projekt anlegen</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Projektname *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="z.B. EFH Muster, Winterthur"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Standort</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="z.B. Winterthur"
                  value={form.standort}
                  onChange={e => setForm(f => ({ ...f, standort: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kunde / Bauherr</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="z.B. Familie Muster"
                  value={form.kunde}
                  onChange={e => setForm(f => ({ ...f, kunde: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Kurze Beschreibung"
                  value={form.beschreibung}
                  onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gebäudekategorie (SIA 380/1)</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={form.gebaeudekategorie}
                  onChange={e => setForm(f => ({ ...f, gebaeudekategorie: e.target.value }))}
                >
                  <option value="">— bitte wählen —</option>
                  {GEBAEUDEKATEGORIEN.map(k => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Klimastation (SIA 2028)</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={form.klimastation}
                  onChange={e => {
                    const station = KLIMASTATIONEN.find(s => s.name === e.target.value);
                    setForm(f => ({ ...f, klimastation: e.target.value, t_aussen: station ? station.theta_e : f.t_aussen }));
                  }}
                >
                  <option value="">— bitte wählen —</option>
                  {KLIMASTATIONEN.map(s => (
                    <option key={s.name} value={s.name}>{s.name} ({s.theta_e} °C)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Auslegungstemperatur aussen [°C]</label>
                <input
                  type="number"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.t_aussen}
                  onChange={e => setForm(f => ({ ...f, t_aussen: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">aus SIA 2028, überschreibbar</p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {saving ? "Erstelle…" : "Projekt erstellen"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm({ name: "", standort: "", kunde: "", beschreibung: "", gebaeudekategorie: "", klimastation: "", t_aussen: -8 }); }}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm transition"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projektliste */}
      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">Lade Projekte…</div>
      ) : projects.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <div className="text-gray-400 text-4xl mb-3">🔥</div>
          <p className="text-gray-600 font-medium">Noch keine Projekte vorhanden</p>
          <p className="text-gray-400 text-sm mt-1">Erstelle dein erstes Projekt mit dem Button oben.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/heizungscockpit/projekte/${p.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm cursor-pointer transition group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 truncate">
                      {p.name}
                    </h3>
                    {statusBadge(p.status)}
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    {p.standort && <span>📍 {p.standort}</span>}
                    {p.kunde && <span>👤 {p.kunde}</span>}
                    {p.beschreibung && <span className="truncate max-w-xs">{p.beschreibung}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-4 shrink-0">
                  {new Date(p.created_at).toLocaleDateString("de-CH")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
