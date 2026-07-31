import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Save, ListChecks } from "lucide-react";
import { getProject, updateProject, getProjectContext, getProjectStatus } from "../../api/hcApi";
import { GEBAEUDEKATEGORIEN, KLIMASTATIONEN } from "../../data/sia";

// §9 — Projektinformationsseite. Die zentralen Projektgrunddaten (Quelle A)
// werden hier an EINER Stelle gepflegt und von Kostenschätzung und Mengen
// gelesen — kein zweites EBF-Feld irgendwo (One Source of Truth).

const HEIZUNGSSYSTEME = [
  { value: "gemischt", label: "Gemischt" },
  { value: "FBH", label: "Fussbodenheizung" },
  { value: "HK", label: "Heizkörper" },
];
const systemLabel = (wert) => HEIZUNGSSYSTEME.find((h) => h.value === wert)?.label || wert;
const stationVon = (name) => KLIMASTATIONEN.find((s) => s.name === name) || null;
const SIA_PHASEN = [
  ["31", "31 Vorprojekt"],
  ["32", "32 Bauprojekt"],
  ["33", "33 Bewilligungsverfahren"],
  ["41", "41 Ausschreibung"],
  ["51", "51 Ausführungsprojekt"],
  ["52", "52 Ausführung"],
  ["53", "53 Inbetriebnahme / Abschluss"],
];

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

function formFromProject(p) {
  const bd = p.base_data || {};
  return {
    name: p.name || "", standort: p.standort || "", kunde: p.kunde || "", beschreibung: p.beschreibung || "",
    projektnummer: p.projektnummer || "", strasse: p.strasse || "", plz: p.plz || "",
    ort: p.ort || "", bauherr: p.bauherr || "", sia_phase: p.sia_phase || "",
    projektfortschritt_pct: p.projektfortschritt_pct ?? 0,
    planbezeichnung: p.planbezeichnung || "Prinzipschema",
    gebaeudekategorie: bd.gebaeudekategorie || "",
    ebf_m2: bd.ebf_m2 ?? "",
    anzahl_nutzungseinheiten: bd.anzahl_nutzungseinheiten ?? "",
    projektart: bd.projektart || "",
    region: bd.region || "",
    zertifizierung: bd.zertifizierung || "",
    heizungssystem: bd.heizungssystem || "gemischt",
    t_aussen: bd.t_aussen ?? -8.0,
    t_innen: bd.t_innen ?? 20.0,
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
  // Aus dem Anlagenschema erkanntes Heizungssystem und der Gesamtfortschritt
  // aus dem Statusendpunkt — beides wird gelesen, nie hier gerechnet (§16).
  const [erkannt, setErkannt] = useState({ heizungssystem: null, waermeabgabe: [] });
  const [fortschritt, setFortschritt] = useState(null);
  // Automatik ist der Normalfall; der Planer kann sie bewusst übersteuern (§7).
  // null = noch nicht entschieden (Projekt oder Kontext fehlt noch).
  const [systemManuell, setSystemManuell] = useState(null);

  useEffect(() => {
    getProject(id)
      .then((p) => { setProject(p); setForm(formFromProject(p)); })
      .catch(() => setError("Projekt konnte nicht geladen werden"))
      .finally(() => setLoading(false));
    getProjectContext(id)
      .then((ctx) => setErkannt({
        heizungssystem: ctx?.heizungssystem ?? null,
        waermeabgabe: ctx?.waermeabgabe || [],
      }))
      .catch(() => {});
    getProjectStatus(id)
      .then((s) => setFortschritt(s?.completion ?? null))
      .catch(() => {});
  }, [id]);

  // Einmalig beim Laden entscheiden: weicht der gespeicherte Wert vom erkannten
  // ab, wurde er bewusst gesetzt — dann bleibt die Handeingabe offen, statt
  // stillschweigend überfahren zu werden.
  useEffect(() => {
    if (systemManuell !== null || !form) return;
    if (erkannt.heizungssystem == null) return;
    setSystemManuell(form.heizungssystem !== erkannt.heizungssystem);
  }, [form, erkannt.heizungssystem, systemManuell]);

  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setSaved(false); };

  // Die Auslegungstemperatur gehört zur Klimastation (SIA 2028). Sie wird beim
  // Wechsel mitgesetzt und bleibt danach überschreibbar (§7).
  const klimastationWaehlen = (name) => {
    const station = stationVon(name);
    setForm((f) => ({ ...f, klimastation: name, ...(station ? { t_aussen: station.theta_e } : {}) }));
    setSaved(false);
  };

  // Ohne Handeingabe gilt der erkannte Wert — sonst der eingetragene.
  const heizungssystemEffektiv = (systemManuell !== true && erkannt.heizungssystem)
    ? erkannt.heizungssystem
    : form?.heizungssystem;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name, standort: form.standort, kunde: form.kunde, beschreibung: form.beschreibung,
        strasse: form.strasse, plz: form.plz,
        ort: form.ort, bauherr: form.bauherr, sia_phase: form.sia_phase,
        // `projektfortschritt_pct` wird nicht mehr gesendet: der Fortschritt
        // kommt aus dem Statusendpunkt, der ihn aus den Modulen rechnet. Zwei
        // Fortschritte nebeneinander wären zwei Wahrheiten.
        planbezeichnung: form.planbezeichnung || "Prinzipschema",
        base_data: {
          t_aussen: numOrNull(form.t_aussen) ?? -8.0,
          t_innen: numOrNull(form.t_innen) ?? 20.0,
          // Ohne Handeingabe wandert der aus dem Schema erkannte Wert in die
          // Grunddaten — damit lesen Kostenschätzung und Export dasselbe.
          heizungssystem: heizungssystemEffektiv || "gemischt",
          klimastation: form.klimastation || null,
          gebaeudekategorie: form.gebaeudekategorie || null,
          ebf_m2: numOrNull(form.ebf_m2),
          anzahl_nutzungseinheiten: numOrNull(form.anzahl_nutzungseinheiten),
          projektart: form.projektart || null,
          region: form.region || null,
          zertifizierung: form.zertifizierung || null,
        },
      };
      await updateProject(id, payload);
      // Read-after-write: die UI bestätigt erst, wenn dieselben Werte über den
      // normalen GET-Pfad wieder aus der Datenbank gelesen wurden.
      const persisted = await getProject(id);
      if ((persisted.sia_phase || "") !== payload.sia_phase) {
        throw new Error("Projektphase wurde vom Server nicht bestätigt");
      }
      setProject(persisted);
      setForm(formFromProject(persisted));
      setSaved(true);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Speichern fehlgeschlagen");
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
            <div>
              <label className="label">Projektnummer</label>
              {/* Unveränderlich: sie wird beim Anlegen vergeben und darf danach
                  nicht mehr wechseln — auch nicht durch den Firmenadmin. */}
              <input className="input bg-slate-50 font-mono tabular-nums text-slate-600"
                value={form.projektnummer} readOnly disabled />
              <p className="mt-1 text-xs text-slate-400">Automatisch vergeben</p>
            </div>
            <div><label className="label">Bauherr</label><input className="input" value={form.bauherr} onChange={(e) => set("bauherr", e.target.value)} /></div>
            <div><label className="label">Kunde / Auftraggeber</label><input className="input" value={form.kunde} onChange={(e) => set("kunde", e.target.value)} /></div>
            <div className="md:col-span-2"><label className="label">Strasse</label><input className="input" value={form.strasse} onChange={(e) => set("strasse", e.target.value)} /></div>
            <div><label className="label">PLZ</label><input className="input" value={form.plz} onChange={(e) => set("plz", e.target.value)} /></div>
            <div><label className="label">Ort</label><input className="input" value={form.ort} onChange={(e) => set("ort", e.target.value)} /></div>
            <div><label className="label">Planbezeichnung</label><input className="input" value={form.planbezeichnung} onChange={(e) => set("planbezeichnung", e.target.value)} placeholder="Prinzipschema" /></div>
            <div><label className="label">Beschreibung</label><input className="input" value={form.beschreibung} onChange={(e) => set("beschreibung", e.target.value)} /></div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Projektphase</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="label">SIA-Phase</label>
              <select className="input" value={form.sia_phase} onChange={(e) => set("sia_phase", e.target.value)}>
                <option value="">— wählen —</option>
                {SIA_PHASEN.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            {/* Der Fortschritt wird nicht mehr von Hand geschoben: der
                Statusendpunkt rechnet ihn aus den Modulen (Projektdaten,
                Schema, Mengen, Kosten, Dokumentation). Hier steht er nur zum
                Nachlesen — eine zweite, gepflegte Prozentzahl daneben wäre
                genau die zweite Wahrheit, die das Projekt vermeidet. */}
            <div>
              <label className="label">Projektfortschritt</label>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${fortschritt ?? 0}%` }} />
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-700">
                  {fortschritt == null ? "—" : `${fortschritt} %`}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Aus dem Projektstatus berechnet — nicht von Hand gepflegt.
              </p>
            </div>
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
            {/* Heizungssystem: erkannt aus den Verbrauchergruppen im
                Anlagenschema. Erkennbar, erklärbar und kontrolliert
                überschreibbar (§7) — nicht stillschweigend gesetzt. */}
            <div className="md:col-span-3">
              <label className="label">Heizungssystem</label>
              {erkannt.heizungssystem && systemManuell !== true ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">{systemLabel(erkannt.heizungssystem)}</span>
                  <span className="badge border-brand-200 bg-brand-50 text-brand-700">aus dem Schema erkannt</span>
                  <button type="button" onClick={() => setSystemManuell(true)}
                    className="ml-auto text-xs font-medium text-slate-500 underline-offset-2 hover:text-brand-600 hover:underline">
                    abweichend festlegen
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select className="input" value={form.heizungssystem} onChange={(e) => set("heizungssystem", e.target.value)}>
                    {HEIZUNGSSYSTEME.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                  {erkannt.heizungssystem && (
                    <button type="button"
                      onClick={() => { setSystemManuell(false); set("heizungssystem", erkannt.heizungssystem); }}
                      className="shrink-0 text-xs font-medium text-slate-500 underline-offset-2 hover:text-brand-600 hover:underline">
                      zurück zur Erkennung
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {erkannt.waermeabgabe.length
                  ? `Verbrauchergruppen im Schema: ${erkannt.waermeabgabe.join(" · ")}`
                  : "Noch keine Verbrauchergruppe mit Typ im Anlagenschema — bis dahin gilt der hier gewählte Wert."}
              </p>
            </div>

            {/* Klimastation nach SIA 2028. Sie bestimmt die
                Auslegungstemperatur; die bleibt danach überschreibbar. */}
            <div>
              <label className="label">Klimastation (SIA 2028)</label>
              <select className="input" value={form.klimastation} onChange={(e) => klimastationWaehlen(e.target.value)}>
                <option value="">— wählen —</option>
                {KLIMASTATIONEN.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.theta_e} °C)</option>)}
              </select>
            </div>
            <div>
              <label className="label">Auslegungstemperatur [°C]</label>
              <input type="number" className="input" value={form.t_aussen} onChange={(e) => set("t_aussen", e.target.value)} />
              <p className="mt-1 text-xs text-slate-400">
                {stationVon(form.klimastation)
                  ? (Number(form.t_aussen) === stationVon(form.klimastation).theta_e
                    ? `Aus ${form.klimastation} (SIA 2028)`
                    : `Abweichend von ${form.klimastation} (${stationVon(form.klimastation).theta_e} °C)`)
                  : "Aus der Klimastation, überschreibbar"}
              </p>
            </div>
            <div><label className="label">Raumtemperatur [°C]</label><input type="number" className="input" value={form.t_innen} onChange={(e) => set("t_innen", e.target.value)} /></div>
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
