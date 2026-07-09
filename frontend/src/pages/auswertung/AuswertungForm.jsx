import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import { createRef, deleteRef, exportRefCsv, getRef, getRefKatalog, updateRef } from "../../api/hcApi";
import CheckboxGruppe from "../../components/kv/CheckboxGruppe";
import AnlagenkonfigurationAuswahl from "../../components/kv/AnlagenkonfigurationAuswahl";
import {
  AUSBAUUMFAENGE, GEBAEUDETYPEN, PROJEKTARTEN, WAERMEABGABE, WAERMEERZEUGER, ZERTIFIZIERUNGEN, hasErdsonde,
  konfigurationVorschlag,
} from "../../data/kv";

const LEER = {
  name: "", projektart: "", gebaeudetyp: "", ausbauumfang: "", zertifizierung: "", anlagenkonfiguration: "",
  waermeerzeuger: [], waermeabgabe: [], ebf_m2: "", bohrmeter: "", heizleistung_kw: "",
  anzahl_einheiten: "", datum: "", qualitaet: 0.85,
};
const QUALITAET = [
  { v: 1.0, l: "gesichert (Ist-Kosten)" },
  { v: 0.85, l: "gut (Devis / Submission)" },
  { v: 0.7, l: "grob (Schätzung)" },
];
const num = (v) => (v === "" || v == null ? null : Number(v));
const chf = (n) => Math.round(n || 0).toLocaleString("de-CH");

export default function AuswertungForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(LEER);
  const [betraege, setBetraege] = useState({}); // { bkp_nr: "12345" }
  const [katalog, setKatalog] = useState({ positionen: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBetrag = (nr, v) => setBetraege((b) => ({ ...b, [nr]: v }));

  // Erst-Vorschlag für die Anlagenkonfiguration, solange sie noch nicht gesetzt ist.
  const setWaermeerzeuger = (v) =>
    setForm((f) => ({
      ...f, waermeerzeuger: v,
      anlagenkonfiguration: f.anlagenkonfiguration || konfigurationVorschlag(v),
    }));

  useEffect(() => {
    getRefKatalog().then(setKatalog).catch(() => {});
    if (isEdit) {
      getRef(id)
        .then((r) => {
          setForm({
            name: r.name || "", projektart: r.projektart || "", gebaeudetyp: r.gebaeudetyp || "",
            ausbauumfang: r.ausbauumfang || "", zertifizierung: r.zertifizierung || "",
            anlagenkonfiguration: r.anlagenkonfiguration || "",
            waermeerzeuger: r.waermeerzeuger || [], waermeabgabe: r.waermeabgabe || [],
            ebf_m2: r.ebf_m2 ?? "", bohrmeter: r.bohrmeter ?? "", heizleistung_kw: r.heizleistung_kw ?? "",
            anzahl_einheiten: r.anzahl_einheiten ?? "", datum: r.datum || "", qualitaet: r.qualitaet ?? 0.85,
          });
          setBetraege(Object.fromEntries((r.kostenzeilen || []).map((z) => [z.bkp_nr, z.betrag_chf])));
        })
        .catch(() => setError("Referenzprojekt konnte nicht geladen werden"));
    }
  }, [id]);

  const gruppen = useMemo(() => {
    const g = {};
    (katalog.positionen || []).forEach((p) => {
      (g[p.gruppe_nr] ||= { name: p.gruppe, items: [] }).items.push(p);
    });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [katalog]);

  const summe = Object.values(betraege).reduce((s, v) => s + (Number(v) || 0), 0);
  const erdsonde = hasErdsonde(form.waermeerzeuger);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Bitte einen Namen angeben."); return; }
    setSaving(true);
    setError("");
    // nur Positionen mit Betrag > 0 speichern
    const kostenzeilen = (katalog.positionen || [])
      .filter((p) => Number(betraege[p.bkp_nr]) > 0)
      .map((p) => ({ bkp_nr: p.bkp_nr, bkp_name: p.bezeichnung, betrag_chf: Number(betraege[p.bkp_nr]) }));
    const payload = {
      name: form.name.trim(),
      projektart: form.projektart || null, gebaeudetyp: form.gebaeudetyp || null,
      ausbauumfang: form.ausbauumfang || null, zertifizierung: form.zertifizierung || null,
      anlagenkonfiguration: form.anlagenkonfiguration || null,
      waermeerzeuger: form.waermeerzeuger, waermeabgabe: form.waermeabgabe,
      ebf_m2: num(form.ebf_m2), bohrmeter: erdsonde ? num(form.bohrmeter) : null,
      heizleistung_kw: num(form.heizleistung_kw), anzahl_einheiten: num(form.anzahl_einheiten),
      datum: form.datum || null, qualitaet: Number(form.qualitaet),
      kostenzeilen,
    };
    try {
      if (isEdit) await updateRef(id, payload);
      else await createRef(payload);
      nav("/auswertung");
    } catch {
      setError("Speichern fehlgeschlagen");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Referenzprojekt löschen?")) return;
    try { await deleteRef(id); nav("/auswertung"); } catch { setError("Löschen fehlgeschlagen"); }
  };

  const exportCsv = async () => {
    const blob = await exportRefCsv(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `referenzprojekt_${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/auswertung" className="hover:text-brand-600">Auswertung</Link>
        <span>/</span>
        <span className="text-slate-800">{isEdit ? form.name || "Bearbeiten" : "Neues Referenzprojekt"}</span>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={save} className="space-y-6">
        {/* Merkmale */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Projekt-Merkmale</h2>
          <div className="space-y-4">
            <div><label className="label">Name / Bezeichnung *</label>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z.B. MFH Lindenhof, Winterthur" /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="label">Projektart</label>
                <select className="input" value={form.projektart} onChange={(e) => set("projektart", e.target.value)}>
                  <option value="">—</option>{PROJEKTARTEN.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div><label className="label">Gebäudetyp</label>
                <select className="input" value={form.gebaeudetyp} onChange={(e) => set("gebaeudetyp", e.target.value)}>
                  <option value="">—</option>{GEBAEUDETYPEN.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div><label className="label">Ausbauumfang</label>
                <select className="input" value={form.ausbauumfang} onChange={(e) => set("ausbauumfang", e.target.value)}>
                  <option value="">—</option>{AUSBAUUMFAENGE.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div><label className="label">Zertifizierung</label>
                <select className="input" value={form.zertifizierung} onChange={(e) => set("zertifizierung", e.target.value)}>
                  <option value="">—</option>{ZERTIFIZIERUNGEN.map((o) => <option key={o}>{o}</option>)}
                </select></div>
            </div>
            <CheckboxGruppe label="Wärmeerzeuger (mehrere möglich)" options={WAERMEERZEUGER} value={form.waermeerzeuger} onChange={setWaermeerzeuger} />
            <CheckboxGruppe label="Wärmeabgabe (mehrere möglich)" options={WAERMEABGABE} value={form.waermeabgabe} onChange={(v) => set("waermeabgabe", v)} />
            <AnlagenkonfigurationAuswahl value={form.anlagenkonfiguration} onChange={(v) => set("anlagenkonfiguration", v)} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="label">Datum (Devis / Ausführung)</label>
                <input type="date" className="input" value={form.datum || ""} onChange={(e) => set("datum", e.target.value)} /></div>
              <div><label className="label">Datenqualität</label>
                <select className="input" value={form.qualitaet} onChange={(e) => set("qualitaet", e.target.value)}>
                  {QUALITAET.map((q) => <option key={q.v} value={q.v}>{q.l}</option>)}
                </select></div>
            </div>
          </div>
        </div>

        {/* Bezugsgrössen */}
        <div className="card p-6">
          <h2 className="mb-1 font-semibold text-slate-800">Bezugsgrössen</h2>
          <p className="mb-4 text-xs text-slate-400">Zahlen, auf die die Kosten bezogen werden (Kennwerte). Nur ausfüllen, was bekannt ist.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><label className="label">EBF [m²]</label><input type="number" className="input" value={form.ebf_m2} onChange={(e) => set("ebf_m2", e.target.value)} /></div>
            <div><label className="label">Erzeugerleistung [kW]</label><input type="number" className="input" value={form.heizleistung_kw} onChange={(e) => set("heizleistung_kw", e.target.value)} /></div>
            <div><label className="label">Anzahl Einheiten</label><input type="number" className="input" value={form.anzahl_einheiten} onChange={(e) => set("anzahl_einheiten", e.target.value)} /></div>
            {erdsonde && (
              <div><label className="label">Bohrmeter</label><input type="number" className="input" value={form.bohrmeter} onChange={(e) => set("bohrmeter", e.target.value)} /></div>
            )}
          </div>
        </div>

        {/* BKP-Kosten: alle Positionen da, nur ausfüllen was zutrifft */}
        <div className="card p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">BKP-Kosten</h2>
            <span className="text-sm font-bold text-slate-900">Total {chf(summe)} CHF</span>
          </div>
          <p className="mb-4 text-xs text-slate-400">Nur ausfüllen, was zutrifft — leere Positionen werden nicht gespeichert.</p>
          <div className="space-y-5">
            {gruppen.map(([nr, g]) => (
              <div key={nr}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{nr} · {g.name}</div>
                <div className="space-y-1.5">
                  {g.items.map((p) => {
                    const gefuellt = Number(betraege[p.bkp_nr]) > 0;
                    return (
                      <div key={p.bkp_nr} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-slate-700">{p.bkp_nr}</span>
                          <span className="ml-2 text-sm text-slate-500">{p.bezeichnung}</span>
                        </div>
                        <div className="relative w-36 shrink-0">
                          <input
                            type="number"
                            className={"input pr-10 text-right " + (gefuellt ? "border-brand-300 bg-brand-50/40" : "")}
                            value={betraege[p.bkp_nr] ?? ""}
                            onChange={(e) => setBetrag(p.bkp_nr, e.target.value)}
                            placeholder="—"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">CHF</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Speichere…" : "Speichern"}</button>
            <Link to="/auswertung" className="btn-secondary">Abbrechen</Link>
          </div>
          {isEdit && (
            <div className="flex gap-2">
              <button type="button" onClick={exportCsv} className="btn-secondary"><Download className="size-4" /> CSV</button>
              <button type="button" onClick={remove} className="btn-ghost text-red-500 hover:bg-red-50"><Trash2 className="size-4" /> Löschen</button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
