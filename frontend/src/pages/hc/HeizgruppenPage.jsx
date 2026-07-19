import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import {
  getProject,
  getGroupTemplates,
  addGroup,
  updateGroup,
  updateGroupStatus,
  deleteGroup,
} from "../../api/hcApi";
import PageHeader from "../../components/ui/PageHeader";

const STATUS_COLORS = {
  aktiv: "bg-green-100 text-green-700",
  inaktiv: "bg-amber-100 text-amber-700",
  ignoriert: "bg-slate-100 text-slate-400",
};

const STATUS_LABELS = { aktiv: "Aktiv", inaktiv: "Inaktiv", ignoriert: "Ignoriert" };

const TYPEN = ["FBH", "HK", "Lufterhitzer", "BWW", "Lueftungsregister", "Wandheizung", "TABS", "Konvektoren"];

const defaultForm = { name: "", typ: "FBH", leistung_kw: "", vorlauf: "", ruecklauf: "", template_id: null };

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function WarningBadges({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1 text-xs text-amber-600">
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

  return (
    <tr className="bg-brand-50/40">
      <td className="px-3 py-2">
        <input className="input px-2.5 py-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{group.typ}</td>
      <td className="px-3 py-2">
        <input type="number" step="0.1" className="input w-20 px-2.5 py-1.5"
          value={form.leistung_kw} onChange={(e) => setForm((f) => ({ ...f, leistung_kw: parseFloat(e.target.value) || 0 }))} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input type="number" step="0.5" className="input w-16 px-2.5 py-1.5"
            value={form.vorlauf} onChange={(e) => setForm((f) => ({ ...f, vorlauf: parseFloat(e.target.value) || 0 }))} />
          <span className="text-xs text-slate-400">/</span>
          <input type="number" step="0.5" className="input w-16 px-2.5 py-1.5"
            value={form.ruecklauf} onChange={(e) => setForm((f) => ({ ...f, ruecklauf: parseFloat(e.target.value) || 0 }))} />
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">wird berechnet…</td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          <button onClick={() => onSave(group.id, form)} className="btn-primary px-3 py-1.5 text-xs">Speichern</button>
          <button onClick={onCancel} className="btn-secondary px-3 py-1.5 text-xs">Abbrechen</button>
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
    const t = templates.find((t) => t.id === parseInt(templateId));
    if (t) {
      setForm((f) => ({ ...f, template_id: t.id, typ: t.typ, vorlauf: t.standard_vl, ruecklauf: t.standard_rl }));
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

  if (loading) return <div className="p-8 text-sm text-slate-400">Lade…</div>;

  const groups = project?.heating_groups || [];
  const aktive = groups.filter((g) => g.status === "aktiv");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        back={{ to: `/projekte/${id}`, label: project?.name || "Projekt" }}
        title="Heizgruppen"
        subtitle="Heizgruppen erfassen — Volumenstrom und gemischter Rücklauf werden automatisch gerechnet."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summen */}
      {aktive.length > 0 && (
        <div className="card mb-6 grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
          <Stat label="Aktive Gruppen" value={aktive.length} />
          <Stat label="ΣQ Leistung" value={`${project.summe_leistung_kw.toFixed(2)} kW`} />
          <Stat label="ΣV' Volumenstrom" value={`${project.summe_volumenstrom_m3h.toFixed(3)} m³/h`} sub={`${project.summe_volumenstrom_lh.toFixed(0)} l/h`} />
          <Stat label="Gem. Rücklauf" value={project.rl_gemischt != null ? `${project.rl_gemischt.toFixed(1)} °C` : "—"} />
        </div>
      )}

      {/* Formular: Neue Gruppe */}
      {showAdd && (
        <div className="card mb-5 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Heizgruppe hinzufügen</h2>
          <form onSubmit={handleAdd} className="space-y-3">
            {templates.length > 0 && (
              <div>
                <label className="label">Vorlage übernehmen</label>
                <select className="input w-full md:w-80" onChange={(e) => applyTemplate(e.target.value)} defaultValue="">
                  <option value="">— Vorlage wählen (optional) —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} (VL {t.standard_vl}°C / RL {t.standard_rl}°C)</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="label">Bezeichnung *</label>
                <input className="input" placeholder="z.B. OG Schlafzimmer" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Typ</label>
                <select className="input" value={form.typ} onChange={(e) => setForm((f) => ({ ...f, typ: e.target.value }))}>
                  {TYPEN.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Leistung Q [kW]</label>
                <input type="number" step="0.1" min="0" className="input" placeholder="0.0" value={form.leistung_kw}
                  onChange={(e) => setForm((f) => ({ ...f, leistung_kw: e.target.value }))} />
              </div>
              <div>
                <label className="label">Vorlauf VL [°C] *</label>
                <input type="number" step="0.5" className="input" placeholder="35" value={form.vorlauf}
                  onChange={(e) => setForm((f) => ({ ...f, vorlauf: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Rücklauf RL [°C] *</label>
                <input type="number" step="0.5" className="input" placeholder="28" value={form.ruecklauf}
                  onChange={(e) => setForm((f) => ({ ...f, ruecklauf: e.target.value }))} required />
              </div>
              {form.leistung_kw && form.vorlauf && form.ruecklauf && parseFloat(form.vorlauf) > parseFloat(form.ruecklauf) && (
                <div className="flex items-end pb-2">
                  <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    V' ≈ {(parseFloat(form.leistung_kw) / (1.163 * (parseFloat(form.vorlauf) - parseFloat(form.ruecklauf)))).toFixed(4)} m³/h
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Hinzufüge…" : "Gruppe hinzufügen"}</button>
              <button type="button" onClick={() => { setShowAdd(false); setForm(defaultForm); }} className="btn-secondary">Abbrechen</button>
            </div>
          </form>
        </div>
      )}

      {/* Gruppen-Tabelle */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Heizgruppen {groups.length > 0 && <span className="font-normal text-slate-400">({groups.length})</span>}
          </h2>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
              <Plus className="size-4" /> Gruppe hinzufügen
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-2 text-3xl">🔥</div>
            <p className="text-sm text-slate-500">Noch keine Heizgruppen — füge die erste Gruppe hinzu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Bezeichnung</th>
                  <th className="px-4 py-3 text-left">Typ</th>
                  <th className="px-4 py-3 text-right">Q [kW]</th>
                  <th className="px-4 py-3 text-center">VL / RL [°C]</th>
                  <th className="px-4 py-3 text-right">V' [m³/h]</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((g) =>
                  editingId === g.id ? (
                    <EditGroupRow key={g.id} group={g} onSave={handleUpdate} onCancel={() => setEditingId(null)} />
                  ) : (
                    <tr key={g.id} className={"transition hover:bg-slate-50 " + (g.status === "ignoriert" ? "opacity-40" : "")}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{g.name}</div>
                        <WarningBadges warnings={g.warnings} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{g.typ}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">{g.leistung_kw.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{g.vorlauf} / {g.ruecklauf}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                        {g.volumenstrom_m3h != null ? g.volumenstrom_m3h.toFixed(4) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleStatus(g.id, g.status)}
                          className={"cursor-pointer rounded px-2 py-0.5 text-xs font-medium transition " + STATUS_COLORS[g.status]}
                          title="Klicken zum Wechseln">
                          {STATUS_LABELS[g.status]}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(g.id)} className="text-xs text-slate-400 transition hover:text-brand-600">Bearbeiten</button>
                          <button onClick={() => handleDelete(g.id, g.name)} className="text-slate-300 transition hover:text-red-500" title="Löschen">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>

              {aktive.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-brand-200 bg-brand-50/50 text-sm font-semibold">
                    <td className="px-4 py-3 text-slate-800">Summe (aktiv)</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-700">{project.summe_leistung_kw.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-xs text-brand-600">
                      RL gem: {project.rl_gemischt != null ? `${project.rl_gemischt.toFixed(1)} °C` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-700">{project.summe_volumenstrom_m3h.toFixed(4)}</td>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs text-brand-600">= {project.summe_volumenstrom_lh.toFixed(0)} l/h</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Formel-Hinweis */}
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-400">
        <strong className="text-slate-500">Formel:</strong> V' [m³/h] = Q [kW] / (1.163 × ΔT [K]) — Status klicken zum Wechseln: Aktiv → Inaktiv → Ignoriert (ignoriert = nicht in Summen)
      </div>
    </div>
  );
}
