import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import { createRef, deleteRef, exportRefCsv, getRef, getRefKatalog, updateRef } from "../../api/hcApi";
import CheckboxGruppe from "../../components/kv/CheckboxGruppe";
import AnlagenkonfigurationAuswahl from "../../components/kv/AnlagenkonfigurationAuswahl";
import PageHeader from "../../components/ui/PageHeader";
import InfoTip from "../../components/ui/InfoTip";
import {
  AUSBAUUMFAENGE, GEBAEUDETYPEN, PROJEKTARTEN, WAERMEABGABE, WAERMEERZEUGER, ZERTIFIZIERUNGEN, hasErdsonde,
  konfigurationVorschlag,
} from "../../data/kv";

// Kurze Erklärungen für die «i»-Tipps — damit klar ist, wozu ein Feld dient
// und wie es später die Grobkostenschätzung beeinflusst.
const ERKL = {
  projektart: "Neubau, Umbau, Sanierung … Beim Kostenschätzen ein hartes Kriterium: nur Referenzen mit gleicher Projektart gelten als ähnlich.",
  ausbauumfang: "Wie umfassend die Anlage ausgeführt wurde (Vollausbau, Grundausbau, nur Erzeugung …).",
  zertifizierung: "Gebäude-Standard wie Minergie. Höhere Standards heben die Kosten tendenziell.",
  qualitaet: "Wie sicher die Kosten sind — gesicherte Ist-Kosten sind verlässlicher als eine grobe Schätzung.",
  ebf: "Energiebezugsfläche nach SIA (die beheizte Fläche). Wichtigste Bezugsgrösse für Kennwerte in CHF pro m².",
  leistung: "Installierte Heizleistung des Wärmeerzeugers in Kilowatt.",
  weitere: "Optionale Zusatzangaben. Je mehr ausgefüllt ist, desto genauer findet die Grobkostenschätzung ähnliche Referenzprojekte.",
  brutto: "Brutto = Summe aller BKP-Positionen. Netto = Brutto × (1 − Rabatt %) × (1 − Skonto %) — der real bezahlte Betrag.",
};

const LEER = {
  name: "", projektart: "", gebaeudetyp: "", ausbauumfang: "", zertifizierung: "", anlagenkonfiguration: "",
  waermeerzeuger: [], waermeabgabe: [], bww_bei_heizung: false, ebf_m2: "", bohrmeter: "", heizleistung_kw: "",
  anzahl_einheiten: "", datum: "", qualitaet: 0.85,
  installierte_leistung_neu_kw: "", flaeche_fbh_m2: "", flaeche_tabs_m2: "", flaeche_deckenstrahlplatten_m2: "",
  anzahl_heizkoerper: "", anzahl_waermemessungen: "", anzahl_schaltgeraetekombinationen: "", laufmeter_rohre_heizung: "",
  rabatt_pct: "", skonto_pct: "",
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
  const location = useLocation();
  // Herkunft: kam man aus der Grobkostenschätzung eines Projekts (Klick auf eine
  // verwendete Referenz), führt der Zurück-Button dorthin zurück statt in die
  // Auswertungs-Liste (Dominic 2026-07-19).
  const zurueck = location.state?.zurueck || { to: "/auswertung", label: "Auswertung" };
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
            bww_bei_heizung: !!r.bww_bei_heizung,
            ebf_m2: r.ebf_m2 ?? "", bohrmeter: r.bohrmeter ?? "", heizleistung_kw: r.heizleistung_kw ?? "",
            anzahl_einheiten: r.anzahl_einheiten ?? "", datum: r.datum || "", qualitaet: r.qualitaet ?? 0.85,
            installierte_leistung_neu_kw: r.installierte_leistung_neu_kw ?? "",
            flaeche_fbh_m2: r.flaeche_fbh_m2 ?? "", flaeche_tabs_m2: r.flaeche_tabs_m2 ?? "",
            flaeche_deckenstrahlplatten_m2: r.flaeche_deckenstrahlplatten_m2 ?? "",
            anzahl_heizkoerper: r.anzahl_heizkoerper ?? "", anzahl_waermemessungen: r.anzahl_waermemessungen ?? "",
            anzahl_schaltgeraetekombinationen: r.anzahl_schaltgeraetekombinationen ?? "",
            laufmeter_rohre_heizung: r.laufmeter_rohre_heizung ?? "",
            rabatt_pct: r.rabatt_pct ?? "", skonto_pct: r.skonto_pct ?? "",
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

  const brutto = Object.values(betraege).reduce((s, v) => s + (Number(v) || 0), 0);
  const rabatt = Number(form.rabatt_pct) || 0;
  const skonto = Number(form.skonto_pct) || 0;
  const netto = brutto * (1 - rabatt / 100) * (1 - skonto / 100);
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
      bww_bei_heizung: !!form.bww_bei_heizung,
      ebf_m2: num(form.ebf_m2), bohrmeter: erdsonde ? num(form.bohrmeter) : null,
      heizleistung_kw: num(form.heizleistung_kw), anzahl_einheiten: num(form.anzahl_einheiten),
      installierte_leistung_neu_kw: num(form.installierte_leistung_neu_kw),
      flaeche_fbh_m2: num(form.flaeche_fbh_m2), flaeche_tabs_m2: num(form.flaeche_tabs_m2),
      flaeche_deckenstrahlplatten_m2: num(form.flaeche_deckenstrahlplatten_m2),
      anzahl_heizkoerper: num(form.anzahl_heizkoerper), anzahl_waermemessungen: num(form.anzahl_waermemessungen),
      anzahl_schaltgeraetekombinationen: num(form.anzahl_schaltgeraetekombinationen),
      laufmeter_rohre_heizung: num(form.laufmeter_rohre_heizung),
      rabatt_pct: rabatt, skonto_pct: skonto,
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
    <div className="mx-auto max-w-[1600px] px-4 py-8 lg:px-8">
      <PageHeader
        back={zurueck}
        title={isEdit ? (form.name || "Referenzprojekt bearbeiten") : "Neues Referenzprojekt"}
        subtitle="Ein abgeschlossenes Projekt mit seinen echten BKP-Kosten erfassen — das ist die Wissensbasis für die Grobkostenschätzung."
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={save}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Zusammenstellung: eigene Spalte rechts (Desktop), oben auf dem Handy.
              Als einziges Element ihrer Spalte klebt sie beim Scrollen mit, ohne je
              eine andere Karte zu überdecken (das war der frühere Overlap-Bug). */}
          <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
            <div className="card p-5">
              <div className="mb-4 flex items-center gap-1.5">
                <h2 className="font-semibold text-slate-800">Zusammenstellung Heizung</h2>
                <InfoTip text={ERKL.brutto} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Rabatt [%]</label>
                  <input type="number" step="0.1" className="input" value={form.rabatt_pct} onChange={(e) => set("rabatt_pct", e.target.value)} /></div>
                <div><label className="label">Skonto [%]</label>
                  <input type="number" step="0.1" className="input" value={form.skonto_pct} onChange={(e) => set("skonto_pct", e.target.value)} /></div>
                <div><div className="label">Brutto (Summe LV)</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{chf(brutto)} CHF</div></div>
                <div><div className="label">Netto (nach Rabatt/Skonto)</div>
                  <div className="mt-1 text-lg font-bold text-brand-600">{chf(netto)} CHF</div></div>
              </div>
              <p className="mt-3 text-xs text-slate-400">Laufend gegen das Leistungsverzeichnis/Devis des Unternehmers prüfen — passt die Summe?</p>
            </div>
          </aside>

          {/* Haupt-Spalte: Merkmale → Bezugsgrössen → BKP-Kosten → Knöpfe */}
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
            {/* Merkmale */}
            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-slate-800">Projekt-Merkmale</h2>
              <div className="space-y-4">
                <div><label className="label">Name / Bezeichnung *</label>
                  <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z.B. MFH Lindenhof, Winterthur" /></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="label flex items-center gap-1">Projektart <InfoTip text={ERKL.projektart} /></label>
                    <select className="input" value={form.projektart} onChange={(e) => set("projektart", e.target.value)}>
                      <option value="">—</option>{PROJEKTARTEN.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                  <div><label className="label">Gebäudetyp</label>
                    <select className="input" value={form.gebaeudetyp} onChange={(e) => set("gebaeudetyp", e.target.value)}>
                      <option value="">—</option>{GEBAEUDETYPEN.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                  <div><label className="label flex items-center gap-1">Ausbauumfang <InfoTip text={ERKL.ausbauumfang} /></label>
                    <select className="input" value={form.ausbauumfang} onChange={(e) => set("ausbauumfang", e.target.value)}>
                      <option value="">—</option>{AUSBAUUMFAENGE.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                  <div><label className="label flex items-center gap-1">Zertifizierung <InfoTip text={ERKL.zertifizierung} /></label>
                    <select className="input" value={form.zertifizierung} onChange={(e) => set("zertifizierung", e.target.value)}>
                      <option value="">—</option>{ZERTIFIZIERUNGEN.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                </div>
                <CheckboxGruppe label="Wärmeerzeuger (mehrere möglich)" options={WAERMEERZEUGER} value={form.waermeerzeuger} onChange={setWaermeerzeuger} />
                <CheckboxGruppe label="Wärmeabgabe (mehrere möglich)" options={WAERMEABGABE} value={form.waermeabgabe} onChange={(v) => set("waermeabgabe", v)} />
                <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={!!form.bww_bei_heizung} onChange={(e) => set("bww_bei_heizung", e.target.checked)} />
                  Brauchwarmwasser bei Heizung
                  <span className="text-xs text-slate-400">(BWW-Kosten sind in den Heizungs-BKP enthalten, Schnittstelle nicht beim Sanitär)</span>
                </label>
                <AnlagenkonfigurationAuswahl value={form.anlagenkonfiguration} onChange={(v) => set("anlagenkonfiguration", v)} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="label">Datum (Devis / Ausführung)</label>
                    <input type="date" className="input" value={form.datum || ""} onChange={(e) => set("datum", e.target.value)} /></div>
                  <div><label className="label flex items-center gap-1">Datenqualität <InfoTip text={ERKL.qualitaet} /></label>
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="label flex items-center gap-1">EBF [m²] <InfoTip text={ERKL.ebf} /></label><input type="number" className="input" value={form.ebf_m2} onChange={(e) => set("ebf_m2", e.target.value)} /></div>
                <div><label className="label flex items-center gap-1">Erzeugerleistung [kW] <InfoTip text={ERKL.leistung} /></label><input type="number" className="input" value={form.heizleistung_kw} onChange={(e) => set("heizleistung_kw", e.target.value)} /></div>
                <div><label className="label">Anzahl Einheiten</label><input type="number" className="input" value={form.anzahl_einheiten} onChange={(e) => set("anzahl_einheiten", e.target.value)} /></div>
                {erdsonde && (
                  <div><label className="label">Bohrmeter</label><input type="number" className="input" value={form.bohrmeter} onChange={(e) => set("bohrmeter", e.target.value)} /></div>
                )}
              </div>
              <div className="mb-1 mt-5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Weitere Bezugsgrössen <InfoTip text={ERKL.weitere} /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="label">Erzeugerleistung neu [kW]</label><input type="number" className="input" value={form.installierte_leistung_neu_kw} onChange={(e) => set("installierte_leistung_neu_kw", e.target.value)} /></div>
                <div><label className="label">Fläche FBH [m²]</label><input type="number" className="input" value={form.flaeche_fbh_m2} onChange={(e) => set("flaeche_fbh_m2", e.target.value)} /></div>
                <div><label className="label">Fläche TABS [m²]</label><input type="number" className="input" value={form.flaeche_tabs_m2} onChange={(e) => set("flaeche_tabs_m2", e.target.value)} /></div>
                <div><label className="label">Fläche Deckenstrahlplatten [m²]</label><input type="number" className="input" value={form.flaeche_deckenstrahlplatten_m2} onChange={(e) => set("flaeche_deckenstrahlplatten_m2", e.target.value)} /></div>
                <div><label className="label">Anzahl Heizkörper</label><input type="number" className="input" value={form.anzahl_heizkoerper} onChange={(e) => set("anzahl_heizkoerper", e.target.value)} /></div>
                <div><label className="label">Anzahl Wärmemessungen</label><input type="number" className="input" value={form.anzahl_waermemessungen} onChange={(e) => set("anzahl_waermemessungen", e.target.value)} /></div>
                <div><label className="label">Anzahl Schaltgerätekombinationen</label><input type="number" className="input" value={form.anzahl_schaltgeraetekombinationen} onChange={(e) => set("anzahl_schaltgeraetekombinationen", e.target.value)} /></div>
                <div><label className="label">Laufmeter Rohre Heizung</label><input type="number" className="input" value={form.laufmeter_rohre_heizung} onChange={(e) => set("laufmeter_rohre_heizung", e.target.value)} /></div>
              </div>
            </div>

            {/* BKP-Kosten — alle Positionen da, nur ausfüllen was zutrifft */}
            <div className="card p-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">BKP-Kosten</h2>
                <span className="text-sm font-bold text-slate-900">Brutto {chf(brutto)} CHF</span>
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
                            <div className="relative w-32 shrink-0 sm:w-36">
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

            {/* Knöpfe */}
            <div className="flex flex-wrap items-center justify-between gap-3">
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
          </div>
        </div>
      </form>
    </div>
  );
}
