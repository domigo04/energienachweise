import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getProject, updateProject } from "../../api/hcApi";

const MODULE_CARDS = [
  { id: "heizgruppen", label: "Heizgruppen", icon: "🔥", beschreibung: "Heizgruppen-Generator mit Volumenstrom", phase: "MVP", href: "heizgruppen" },
  { id: "kvs", label: "kvs / Ventilauslegung", icon: "🔧", beschreibung: "kvs-Berechnung mit Ventilautorität", phase: "Verfügbar", href: "/heizungscockpit/rechner/ventil", extern: true },
  { id: "druckverlust", label: "Druckverlust", icon: "📊", beschreibung: "Approximative Rohrnetz-Berechnung (3 Kreise)", phase: "Verfügbar", href: "/heizungscockpit/rechner/druckverlust", extern: true },
  { id: "ravel", label: "RAVEL-Wirtschaftlichkeit", icon: "💶", beschreibung: "Dynamische Annuitätenmethode, bis 6 Varianten", phase: "Verfügbar", href: "/heizungscockpit/rechner/ravel", extern: true },
  { id: "waermeleistung", label: "Wärmeleistungsbedarf", icon: "🏠", beschreibung: "Raumstruktur nach SIA 384.2", phase: "Phase 2", href: null },
  { id: "bww", label: "Brauchwarmwasser", icon: "🚿", beschreibung: "Speichergrösse, Ladeleistung", phase: "Phase 3", href: null },
];

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
      .then(p => { setProject(p); setForm({ name: p.name, standort: p.standort || "", kunde: p.kunde || "", beschreibung: p.beschreibung || "" }); })
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
      navigate("/heizungscockpit");
    } catch {
      setError("Archivieren fehlgeschlagen");
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Lade Projekt…</div>;
  if (!project && error) return (
    <div className="p-8">
      <div className="text-red-600 mb-4">{error}</div>
      <Link to="/heizungscockpit" className="text-blue-600 hover:underline text-sm">← Zurück zur Übersicht</Link>
    </div>
  );

  const bd = project.base_data;
  const hasGroups = project.heating_groups?.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/heizungscockpit" className="hover:text-blue-600">Heizungscockpit</Link>
        <span>/</span>
        <span className="text-gray-800">{project.name}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Projektinfo */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Projektname *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Standort</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.standort} onChange={e => setForm(f => ({ ...f, standort: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kunde</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.kunde} onChange={e => setForm(f => ({ ...f, kunde: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Beschreibung</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {saving ? "Speichere…" : "Speichern"}
              </button>
              <button onClick={() => setEditing(false)}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm">
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                {project.status === "archiviert" ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Archiviert</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Aktiv</span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                {project.standort && <span>📍 {project.standort}</span>}
                {project.kunde && <span>👤 {project.kunde}</span>}
                {project.beschreibung && <span>{project.beschreibung}</span>}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <button onClick={() => setEditing(true)}
                className="text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition">
                Bearbeiten
              </button>
              {project.status !== "archiviert" && (
                <button onClick={handleArchive}
                  className="text-sm border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 px-3 py-1.5 rounded-lg transition">
                  Archivieren
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cockpit / Anlagenschema — die eine Wahrheit */}
      {project.status !== "archiviert" && (
        <Link to={`/heizungscockpit/projekte/${id}/schema`}
          className="block rounded-xl p-5 mb-6 shadow-sm transition bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">🔧 Anlagenschema öffnen</div>
              <div className="text-sm text-blue-100 mt-0.5">
                Schema zeichnen — Berechnungen leben in den Bauteilen
              </div>
            </div>
            <span className="text-2xl leading-none">→</span>
          </div>
        </Link>
      )}

      {/* Grunddaten */}
      {bd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Projektgrundlagen</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">Auslegungstemperatur</div>
              <div className="font-medium text-gray-900">{bd.t_aussen} °C</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Raumtemperatur</div>
              <div className="font-medium text-gray-900">{bd.t_innen} °C</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Heizungssystem</div>
              <div className="font-medium text-gray-900">{HEIZUNGSSYSTEM_LABELS[bd.heizungssystem] || bd.heizungssystem}</div>
            </div>
            {bd.warmwasser_bedarf_kw != null && (
              <div>
                <div className="text-xs text-gray-500">BWW-Bedarf</div>
                <div className="font-medium text-gray-900">{bd.warmwasser_bedarf_kw} kW</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Heizgruppen-Übersicht */}
      {hasGroups && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-blue-800">Heizgruppen — Übersicht</h2>
            <Link to={`/heizungscockpit/projekte/${id}/heizgruppen`}
              className="text-xs text-blue-600 hover:underline">Alle bearbeiten →</Link>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-900">{project.summe_leistung_kw.toFixed(1)} kW</div>
              <div className="text-xs text-gray-500">Gesamtleistung</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-900">{project.summe_volumenstrom_m3h.toFixed(3)} m³/h</div>
              <div className="text-xs text-gray-500">Gesamtvolumenstrom</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-900">
                {project.rl_gemischt != null ? `${project.rl_gemischt.toFixed(1)} °C` : "—"}
              </div>
              <div className="text-xs text-gray-500">Gem. Rücklauf</div>
            </div>
          </div>
        </div>
      )}

      {/* Modul-Karten */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Berechnungsmodule</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULE_CARDS.map(mod => {
          const available = ["MVP", "Verfügbar"].includes(mod.phase);
          const link = mod.href ? (mod.extern ? mod.href : `/heizungscockpit/projekte/${id}/${mod.href}`) : null;
          const inner = (
            <div className={`bg-white border rounded-xl p-4 transition ${available ? "border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer" : "border-gray-100 opacity-60"}`}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{mod.icon}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${mod.phase === "Verfügbar" ? "bg-green-100 text-green-700" : available ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                  {mod.phase}
                </span>
              </div>
              <div className="font-medium text-gray-800 text-sm">{mod.label}</div>
              <div className="text-xs text-gray-500 mt-1">{mod.beschreibung}</div>
            </div>
          );
          return link ? (
            <Link key={mod.id} to={link}>{inner}</Link>
          ) : (
            <div key={mod.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
