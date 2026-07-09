import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getProject,
  getGroupTemplates,
  addGroup,
  updateGroup,
  updateGroupStatus,
  deleteGroup,
} from "../../api/hcApi";

const STATUS_COLORS = {
  aktiv: "bg-green-100 text-green-700",
  inaktiv: "bg-yellow-100 text-yellow-700",
  ignoriert: "bg-gray-100 text-gray-400",
};

const STATUS_LABELS = { aktiv: "Aktiv", inaktiv: "Inaktiv", ignoriert: "Ignoriert" };

const TYPEN = ["FBH", "HK", "Lufterhitzer", "BWW", "Lueftungsregister", "Wandheizung", "TABS", "Konvektoren"];

const defaultForm = { name: "", typ: "FBH", leistung_kw: "", vorlauf: "", ruecklauf: "", template_id: null };

function WarningBadges({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {warnings.map((w, i) => (
        <div key={i} className="text-xs text-orange-600 flex items-start gap-1">
          <span>⚠️</span><span>{w}</span>
        </div>
      ))}
    </div>
  );
}

function EditGroupRow({ group, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: group.name,
    leistung_kw: group.leistung_kw,
    vorlauf: group.vorlauf,
    ruecklauf: group.ruecklauf,
  });
  const saving = false;

  return (
    <tr className="bg-blue-50">
      <td className="px-3 py-2">
        <input className="w-full border border-blue-300 rounded px-2 py-1 text-xs"
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{group.typ}</td>
      <td className="px-3 py-2">
        <input type="number" step="0.1" className="w-20 border border-blue-300 rounded px-2 py-1 text-xs"
          value={form.leistung_kw} onChange={e => setForm(f => ({ ...f, leistung_kw: parseFloat(e.target.value) || 0 }))} />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1 items-center">
          <input type="number" step="0.5" className="w-16 border border-blue-300 rounded px-2 py-1 text-xs"
            value={form.vorlauf} onChange={e => setForm(f => ({ ...f, vorlauf: parseFloat(e.target.value) || 0 }))} />
          <span className="text-xs text-gray-400">/</span>
          <input type="number" step="0.5" className="w-16 border border-blue-300 rounded px-2 py-1 text-xs"
            value={form.ruecklauf} onChange={e => setForm(f => ({ ...f, ruecklauf: parseFloat(e.target.value) || 0 }))} />
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-400">wird berechnet…</td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={() => onSave(group.id, form)}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Speichern</button>
          <button onClick={onCancel}
            className="text-xs border border-gray-300 text-gray-500 px-2 py-1 rounded hover:bg-gray-50">Abbrechen</button>
        </div>
      </td>
    </tr>
  );
}

export default function HeizgruppenPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = () => getProject(id).then(setProject);

  useEffect(() => {
    Promise.all([getProject(id), getGroupTemplates()])
      .then(([p, t]) => { setProject(p); setTemplates(t); })
      .catch(() => setError("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, [id]);

  const applyTemplate = (templateId) => {
    const t = templates.find(t => t.id === parseInt(templateId));
    if (t) {
      setForm(f => ({ ...f, template_id: t.id, typ: t.typ, vorlauf: t.standard_vl, ruecklauf: t.standard_rl }));
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.vorlauf || !form.ruecklauf) return;
    setSaving(true);
    try {
      await addGroup(id, {
        name: form.name,
        typ: form.typ,
        leistung_kw: parseFloat(form.leistung_kw) || 0,
        vorlauf: parseFloat(form.vorlauf),
        ruecklauf: parseFloat(form.ruecklauf),
        template_id: form.template_id || null,
      });
      setForm(defaultForm);
      setShowAdd(false);
      await reload();
    } catch {
      setError("Gruppe konnte nicht hinzugefügt werden");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (groupId, data) => {
    try {
      await updateGroup(groupId, {
        name: data.name,
        leistung_kw: parseFloat(data.leistung_kw) || 0,
        vorlauf: parseFloat(data.vorlauf),
        ruecklauf: parseFloat(data.ruecklauf),
      });
      setEditingId(null);
      await reload();
    } catch {
      setError("Speichern fehlgeschlagen");
    }
  };

  const handleStatus = async (groupId, currentStatus) => {
    const cycle = { aktiv: "inaktiv", inaktiv: "ignoriert", ignoriert: "aktiv" };
    try {
      await updateGroupStatus(groupId, cycle[currentStatus]);
      await reload();
    } catch {
      setError("Status konnte nicht geändert werden");
    }
  };

  const handleDelete = async (groupId, name) => {
    if (!confirm(`Gruppe "${name}" wirklich löschen?`)) return;
    try {
      await deleteGroup(groupId);
      await reload();
    } catch {
      setError("Löschen fehlgeschlagen");
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Lade…</div>;

  const groups = project?.heating_groups || [];
  const aktive = groups.filter(g => g.status === "aktiv");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/projekte" className="hover:text-brand-600">Projekte</Link>
        <span>/</span>
        <Link to={`/projekte/${id}`} className="hover:text-brand-600">{project?.name}</Link>
        <span>/</span>
        <span className="text-gray-800">Heizgruppen</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Summen-Banner */}
      {aktive.length > 0 && (
        <div className="bg-blue-600 text-white rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-blue-200 text-xs">Aktive Gruppen</div>
            <div className="text-xl font-bold">{aktive.length}</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">ΣQ Leistung</div>
            <div className="text-xl font-bold">{project.summe_leistung_kw.toFixed(2)} kW</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">ΣV' Volumenstrom</div>
            <div className="text-xl font-bold">{project.summe_volumenstrom_m3h.toFixed(3)} m³/h</div>
            <div className="text-blue-300 text-xs">{project.summe_volumenstrom_lh.toFixed(0)} l/h</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">Gem. Rücklauf</div>
            <div className="text-xl font-bold">
              {project.rl_gemischt != null ? `${project.rl_gemischt.toFixed(1)} °C` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Formular: Neue Gruppe */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 text-sm">Heizgruppe hinzufügen</h2>
          <form onSubmit={handleAdd} className="space-y-3">
            {/* Vorlage wählen */}
            {templates.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vorlage übernehmen</label>
                <select
                  className="w-full md:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={e => applyTemplate(e.target.value)}
                  defaultValue=""
                >
                  <option value="">— Vorlage wählen (optional) —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} (VL {t.standard_vl}°C / RL {t.standard_rl}°C)</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Bezeichnung *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="z.B. OG Schlafzimmer"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Typ</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.typ}
                  onChange={e => setForm(f => ({ ...f, typ: e.target.value }))}
                >
                  {TYPEN.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leistung Q [kW]</label>
                <input
                  type="number" step="0.1" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                  value={form.leistung_kw}
                  onChange={e => setForm(f => ({ ...f, leistung_kw: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vorlauf VL [°C] *</label>
                <input
                  type="number" step="0.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="35"
                  value={form.vorlauf}
                  onChange={e => setForm(f => ({ ...f, vorlauf: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rücklauf RL [°C] *</label>
                <input
                  type="number" step="0.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="28"
                  value={form.ruecklauf}
                  onChange={e => setForm(f => ({ ...f, ruecklauf: e.target.value }))}
                  required
                />
              </div>
              {/* Vorschau Volumenstrom */}
              {form.leistung_kw && form.vorlauf && form.ruecklauf && parseFloat(form.vorlauf) > parseFloat(form.ruecklauf) && (
                <div className="flex items-end pb-2">
                  <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                    V' ≈ {(parseFloat(form.leistung_kw) / (1.163 * (parseFloat(form.vorlauf) - parseFloat(form.ruecklauf)))).toFixed(4)} m³/h
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                {saving ? "Hinzufüge…" : "Gruppe hinzufügen"}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setForm(defaultForm); }}
                className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm transition">
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Gruppen-Tabelle */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">
            Heizgruppen {groups.length > 0 && <span className="text-gray-400 font-normal">({groups.length})</span>}
          </h2>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Gruppe hinzufügen
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-gray-400 text-3xl mb-2">🔥</div>
            <p className="text-gray-500 text-sm">Noch keine Heizgruppen — füge die erste Gruppe hinzu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                  <th className="text-left px-4 py-3 font-medium">Typ</th>
                  <th className="text-right px-4 py-3 font-medium">Q [kW]</th>
                  <th className="text-center px-4 py-3 font-medium">VL / RL [°C]</th>
                  <th className="text-right px-4 py-3 font-medium">V' [m³/h]</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map(g =>
                  editingId === g.id ? (
                    <EditGroupRow key={g.id} group={g} onSave={handleUpdate} onCancel={() => setEditingId(null)} />
                  ) : (
                    <tr key={g.id} className={`hover:bg-gray-50 transition ${g.status === "ignoriert" ? "opacity-40" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{g.name}</div>
                        <WarningBadges warnings={g.warnings} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{g.typ}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-800">
                        {g.leistung_kw.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {g.vorlauf} / {g.ruecklauf}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-800">
                        {g.volumenstrom_m3h != null ? g.volumenstrom_m3h.toFixed(4) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleStatus(g.id, g.status)}
                          className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition ${STATUS_COLORS[g.status]}`}
                          title="Klicken zum Wechseln"
                        >
                          {STATUS_LABELS[g.status]}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingId(g.id)}
                            className="text-xs text-gray-400 hover:text-blue-600 transition">
                            Bearbeiten
                          </button>
                          <button onClick={() => handleDelete(g.id, g.name)}
                            className="text-xs text-gray-300 hover:text-red-500 transition">
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>

              {/* Summen-Zeile */}
              {aktive.length > 0 && (
                <tfoot>
                  <tr className="bg-blue-50 border-t-2 border-blue-200 font-semibold text-sm">
                    <td className="px-4 py-3 text-blue-800">Summe (aktiv)</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-mono text-blue-900">
                      {project.summe_leistung_kw.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-blue-600">
                      RL gem: {project.rl_gemischt != null ? `${project.rl_gemischt.toFixed(1)} °C` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-900">
                      {project.summe_volumenstrom_m3h.toFixed(4)}
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs text-blue-600">
                      = {project.summe_volumenstrom_lh.toFixed(0)} l/h
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Formel-Hinweis */}
      <div className="mt-4 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        <strong>Formel:</strong> V' [m³/h] = Q [kW] / (1.163 × ΔT [K]) — Status klicken zum Wechseln: Aktiv → Inaktiv → Ignoriert (ignoriert = nicht in Summen)
      </div>
    </div>
  );
}
