import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Save, ListChecks } from "lucide-react";
import { getProject, updateProject } from "../../api/hcApi";
import { GEBAEUDEKATEGORIEN } from "../../data/sia";

// §9 — Projektinformationsseite. Die zentralen Projektgrunddaten (Quelle A)
// werden hier an EINER Stelle gepflegt und von Kostenschätzung und Mengen
// gelesen — kein zweites EBF-Feld irgendwo (One Source of Truth).

const HEIZUNGSSYSTEME = [
  { value: "gemischt", label: "Gemischt" },
  { value: "FBH", label: "Fussbodenheizung" },
  { value: "HK", label: "Heizkörper" },
];

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

function formFromProject(p) {
  const bd = p.base_data || {};
  return {
    name: p.name || "", standort: p.standort || "", kunde: p.kunde || "", beschreibung: p.beschreibung || "",
    gebaeudekategorie: bd.gebaeudekategorie || "",
    ebf_m2: bd.ebf_m2 ?? "",
    anzahl_nutzungseinheiten: bd.anzahl_nutzungseinheiten ?? "",
    projektart: bd.projektart || "",
    region: bd.region || "",
    zertifizierung: bd.zertifizierung || "",
    heizungssystem: bd.heizungssystem || "gemischt",
    t_aussen: bd.t_aussen ?? -8.0,
    t_innen: bd.t_innen ?? 20.0,
    warmwasser_bedarf_kw: bd.warmwasser_bedarf_kw ?? "",
    klimastation: bd.klimastation || "",
  };
}

export default function ProjektInfoPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getProject(id)
      .then((p) => { setProject(p); setForm(formFromProject(p)); })
      .catch(() => setError("Projekt konnte nicht geladen werden"))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setSaved(false); };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name, standort: form.standort, kunde: form.kunde, beschreibung: form.beschreibung,
        base_data: {
          t_aussen: numOrNull(form.t_aussen) ?? -8.0,
          t_innen: numOrNull(form.t_innen) ?? 20.0,
          heizungssystem: form.heizungssystem || "gemischt",
          warmwasser_bedarf_kw: numOrNull(form.warmwasser_bedarf_kw),
          klimastation: form.klimastation || null,
          gebaeudekategorie: form.gebaeudekategorie || null,
          ebf_m2: numOrNull(form.ebf_m2),
          anzahl_nutzungseinheiten: numOrNull(form.anzahl_nutzungseinheiten),
          projektart: form.projektart || null,
          region: form.region || null,
          zertifizierung: form.zertifizierung || null,
        },
      };
      const updated = await updateProject(id, payload);
      setProject(updated);
      setForm(formFromProject(updated));
      setSaved(true);
    } catch {
      setError("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-400">Lade Projekt…</div>;
  if (!form) return (
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

      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projektinformationen</h1>
          <p className="mt-1 text-sm text-slate-500">Zentrale Projektdaten — einmal hier gepflegt, überall gelesen.</p>
        </div>
        <Link to={`/projekte/${id}/mengen`} className="btn-secondary hidden sm:inline-flex"><ListChecks className="size-4" /> Projektmengen</Link>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-6">
        {/* Allgemein */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Allgemein</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="label">Projektname *</label><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><label className="label">Kunde</label><input className="input" value={form.kunde} onChange={(e) => set("kunde", e.target.value)} /></div>
            <div><label className="label">Standort</label><input className="input" value={form.standort} onChange={(e) => set("standort", e.target.value)} /></div>
            <div><label className="label">Beschreibung</label><input className="input" value={form.beschreibung} onChange={(e) => set("beschreibung", e.target.value)} /></div>
          </div>
        </section>

        {/* Gebäude — die kostenrelevanten Grunddaten */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Gebäude</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div><label className="label">Nutzung</label>
              <select className="input" value={form.gebaeudekategorie} onChange={(e) => set("gebaeudekategorie", e.target.value)}>
                <option value="">— wählen —</option>
                {GEBAEUDEKATEGORIEN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select></div>
            <div><label className="label">EBF [m²]</label><input type="number" className="input" value={form.ebf_m2} onChange={(e) => set("ebf_m2", e.target.value)} placeholder="z.B. 1420" /></div>
            <div><label className="label">Nutzungseinheiten</label><input type="number" className="input" value={form.anzahl_nutzungseinheiten} onChange={(e) => set("anzahl_nutzungseinheiten", e.target.value)} placeholder="z.B. 10" /></div>
            <div><label className="label">Projektart</label><input className="input" value={form.projektart} onChange={(e) => set("projektart", e.target.value)} placeholder="Neubau / Sanierung / Umbau" /></div>
            <div><label className="label">Region</label><input className="input" value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="z.B. Zürich" /></div>
            <div><label className="label">Zertifizierung</label><input className="input" value={form.zertifizierung} onChange={(e) => set("zertifizierung", e.target.value)} placeholder="z.B. Minergie" /></div>
          </div>
        </section>

        {/* Auslegung */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Auslegung</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div><label className="label">Heizungssystem</label>
              <select className="input" value={form.heizungssystem} onChange={(e) => set("heizungssystem", e.target.value)}>
                {HEIZUNGSSYSTEME.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select></div>
            <div><label className="label">Auslegungstemperatur [°C]</label><input type="number" className="input" value={form.t_aussen} onChange={(e) => set("t_aussen", e.target.value)} /></div>
            <div><label className="label">Raumtemperatur [°C]</label><input type="number" className="input" value={form.t_innen} onChange={(e) => set("t_innen", e.target.value)} /></div>
            <div><label className="label">BWW-Bedarf [kW]</label><input type="number" className="input" value={form.warmwasser_bedarf_kw} onChange={(e) => set("warmwasser_bedarf_kw", e.target.value)} placeholder="optional" /></div>
            <div><label className="label">Klimastation</label><input className="input" value={form.klimastation} onChange={(e) => set("klimastation", e.target.value)} placeholder="optional" /></div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="btn-primary"><Save className="size-4" /> {saving ? "Speichere…" : "Speichern"}</button>
          {saved && <span className="text-sm font-medium text-green-600">Gespeichert.</span>}
        </div>
      </div>
    </div>
  );
}
