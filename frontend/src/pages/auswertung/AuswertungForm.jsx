import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Download, Plus, Trash2 } from "lucide-react";
import {
  createRef, deleteRef, exportRefCsv, getFachwerte, getRef, getRefAnalyse, getRefKatalog, updateRef,
} from "../../api/hcApi";
import CheckboxGruppe from "../../components/kv/CheckboxGruppe";
import AnlagenkonfigurationAuswahl from "../../components/kv/AnlagenkonfigurationAuswahl";
import PageHeader from "../../components/ui/PageHeader";
import InfoTip from "../../components/ui/InfoTip";
import { chf, zahl } from "../../lib/format";
import { fachwertOptionen } from "../../lib/fachwerte";
import {
  hasErdsonde, konfigurationVorschlag,
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
  anzahl_heizkoerper: "", anzahl_schaltgeraetekombinationen: "", laufmeter_rohre_heizung: "",
  rabatt_pct: "", skonto_pct: "",
};
const QUALITAET = [
  { v: 1.0, l: "gesichert (Ist-Kosten)" },
  { v: 0.85, l: "gut (Devis / Submission)" },
  { v: 0.7, l: "grob (Schätzung)" },
];
const num = (v) => (v === "" || v == null ? null : Number(v));
const kw = (n) => zahl(n, Math.abs(Number(n)) < 100 ? 1 : 0);

// Bezugsgrösse je Kostentreiber. Spiegelt `_REF_DRIVER_ATTR` im Backend; die
// Feldnamen im Formular heissen gleich wie die Spalten am Referenzprojekt.
const TREIBER_FELD = {
  ebf: "ebf_m2", kw: "heizleistung_kw", einheiten: "anzahl_einheiten", bohrmeter: "bohrmeter",
};
// Ab dieser Abweichung vom Median ist eine Position auffällig genug, um sie zu
// markieren — darunter ist Streuung normal.
const AUFFAELLIG_PCT = 50;

const leereKonditionen = () => ({ base_amount: null, conditions: [], vat_rate: "" });

const normalisiereKonditionen = (wert, rabatt = 0, skonto = 0) => {
  if (wert) {
    return {
      ...leereKonditionen(), ...wert,
      vat_rate: wert.vat_rate ?? "",
      conditions: (wert.conditions || []).map((row) => ({
        ...row, label: row.label || row.original_label || "Kondition",
        rate_percent: row.rate_percent ?? "", amount: row.amount ?? "",
        basis_amount: row.basis_amount ?? "",
      })),
    };
  }
  const conditions = [];
  if (Number(rabatt)) conditions.push({ label: "Rabatt", kind: "percent", direction: "deduction", rate_percent: rabatt, amount: "", basis_amount: "" });
  if (Number(skonto)) conditions.push({ label: "Skonto", kind: "percent", direction: "deduction", rate_percent: skonto, amount: "", basis_amount: "" });
  return { ...leereKonditionen(), conditions };
};

// Nur eine Live-Vorschau. Beim Speichern berechnet und validiert das Backend
// dieselbe Kette nochmals und ist damit die verbindliche Quelle.
const konditionenVorschau = (fallbackBase, commercial) => {
  const base = commercial.base_amount == null || commercial.base_amount === ""
    ? Number(fallbackBase || 0) : Number(commercial.base_amount);
  let running = base;
  let nebenkostenBasis = null;
  const conditions = (commercial.conditions || []).map((row, index) => {
    if (row.status === "requested_not_priced") {
      return { ...row, calculated_amount: null, running_total: running, order: index + 1 };
    }
    const primary = /rabatt|skonto/i.test(row.label || "");
    let basis = row.basis_amount === "" || row.basis_amount == null ? null : Number(row.basis_amount);
    let amount;
    if (row.kind === "fixed") {
      amount = Math.abs(Number(row.amount) || 0);
      basis ??= running;
    } else {
      if (basis == null) {
        if (primary) basis = running;
        else { nebenkostenBasis ??= running; basis = nebenkostenBasis; }
      }
      amount = Math.abs(basis * (Number(row.rate_percent) || 0) / 100);
    }
    running += amount * (row.direction === "surcharge" ? 1 : -1);
    return { ...row, basis_amount: basis, calculated_amount: amount, running_total: running, order: index + 1 };
  });
  const vatRate = commercial.vat_rate === "" || commercial.vat_rate == null ? null : Number(commercial.vat_rate);
  const vatAmount = vatRate == null ? null : running * vatRate / 100;
  return {
    base_amount: base, conditions, subtotal_excl_vat: running, vat_rate: vatRate,
    vat_amount: vatAmount, total_incl_vat: vatAmount == null ? null : running + vatAmount,
  };
};

function KonditionenBearbeiten({ commercial, onChange, brutto }) {
  const [editing, setEditing] = useState(false);
  const preview = konditionenVorschau(brutto, commercial);
  const patchRow = (index, patch) => onChange({
    ...commercial,
    conditions: commercial.conditions.map((row, i) => (i === index ? { ...row, ...patch } : row)),
  });
  const add = () => onChange({
    ...commercial,
    conditions: [...commercial.conditions, {
      label: "Sonstiger Abzug", kind: "percent", direction: "deduction",
      rate_percent: "", amount: "", basis_amount: "",
    }],
  });
  if (!editing) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <strong>Brutto / LV-Summe</strong><strong>{chf(preview.base_amount)}</strong>
        </div>
        {preview.conditions.map((row, index) => (
          <div key={`${row.label}-${index}`} className="border-b border-slate-100 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-medium text-slate-700">{row.label}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {row.kind === "percent" ? `${row.rate_percent ?? 0} %` : "Fixbetrag"}
                </span>
              </div>
              <strong className={row.direction === "deduction" ? "text-slate-700" : "text-green-700"}>
                {row.direction === "deduction" ? "−" : "+"} {chf(Math.abs(row.calculated_amount || 0))}
              </strong>
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Zwischentotal</span><span>{chf(row.running_total)}</span>
            </div>
          </div>
        ))}
        {!preview.conditions.length && (
          <p className="py-2 text-xs text-slate-400">Keine Abzüge oder Zuschläge erfasst.</p>
        )}
        <div className="flex justify-between"><span>Netto exkl. MWST</span><strong>{chf(preview.subtotal_excl_vat)}</strong></div>
        <div className="flex justify-between"><span>MWST {preview.vat_rate ?? "—"} %</span><span>{chf(preview.vat_amount)}</span></div>
        <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base">
          <strong>Endsumme inkl. MWST</strong>
          <strong className="text-brand-600">{chf(preview.total_incl_vat ?? preview.subtotal_excl_vat)}</strong>
        </div>
        <button type="button" className="btn-secondary mt-2 w-full justify-center" onClick={() => setEditing(true)}>
          Konditionen bearbeiten
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="border-b border-slate-200 pb-3">
        <div className="flex items-center justify-between gap-2">
          <label className="font-semibold">Brutto / LV-Summe [CHF]</label>
          <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700"
            onClick={() => onChange({ ...commercial, base_amount: brutto })}>
            Summe BKP übernehmen
          </button>
        </div>
        <input className="input mt-2 text-right font-semibold" type="number" step="0.01"
          value={commercial.base_amount ?? ""} placeholder={String(brutto || 0)}
          onChange={(e) => onChange({ ...commercial, base_amount: e.target.value })} />
      </div>
      {commercial.conditions.map((row, index) => (
        <div key={`${row.label}-${index}`} className="rounded-lg border border-slate-200 p-2">
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1" value={row.label || ""}
              onChange={(e) => patchRow(index, { label: e.target.value })} />
            <button type="button" className="btn-ghost min-h-9 min-w-9 text-slate-400 hover:text-red-500"
              onClick={() => onChange({ ...commercial, conditions: commercial.conditions.filter((_, i) => i !== index) })}
              title="Kondition entfernen"><Trash2 className="size-4" /></button>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr_90px] gap-2">
            <select className="input" value={row.kind || "percent"} onChange={(e) => patchRow(index, { kind: e.target.value })}>
              <option value="percent">Prozent</option><option value="fixed">Fixbetrag</option>
            </select>
            <select className="input" value={row.direction || "deduction"} onChange={(e) => patchRow(index, { direction: e.target.value })}>
              <option value="deduction">Abzug</option><option value="surcharge">Zuschlag</option>
            </select>
            <input className="input text-right" type="number" step="0.01"
              value={row.kind === "fixed" ? row.amount : row.rate_percent}
              onChange={(e) => patchRow(index, row.kind === "fixed" ? { amount: e.target.value } : { rate_percent: e.target.value })} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{row.kind === "fixed" ? "CHF" : "%"}</span>
            <span>{row.direction === "deduction" ? "−" : "+"} {chf(Math.abs(preview.conditions[index]?.calculated_amount || 0))}</span>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary min-h-8 w-full justify-center" onClick={add}>
        <Plus className="size-4" /> Abzug oder Zuschlag ergänzen
      </button>
      <div>
        <label className="label">MWST [%]</label>
        <input className="input" type="number" step="0.1" value={commercial.vat_rate}
          onChange={(e) => onChange({ ...commercial, vat_rate: e.target.value })} />
      </div>
      <div className="space-y-1 border-t border-slate-200 pt-2">
        <div className="flex justify-between"><span>Netto exkl. MWST</span><strong>{chf(preview.subtotal_excl_vat)}</strong></div>
        <div className="flex justify-between"><span>MWST {preview.vat_rate ?? 0} %</span><span>{chf(preview.vat_amount)}</span></div>
        <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base"><strong>Endsumme inkl. MWST</strong><strong className="text-brand-600">{chf(preview.total_incl_vat ?? preview.subtotal_excl_vat)}</strong></div>
      </div>
      <button type="button" className="btn-secondary w-full justify-center" onClick={() => setEditing(false)}>
        Bearbeitung schliessen
      </button>
    </div>
  );
}

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
  const [listen, setListen] = useState({});
  const [commercial, setCommercial] = useState(leereKonditionen);
  const [refFeatures, setRefFeatures] = useState({});
  const [aktiveBkp, setAktiveBkp] = useState(null);
  const [kennwerte, setKennwerte] = useState({}); // bkp_nr → Streuung im Bestand
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const waermeerzeugerOptionen = useMemo(
    () => fachwertOptionen(listen, "generator_types"),
    [listen],
  );
  const waermeabgabeOptionen = useMemo(
    () => fachwertOptionen(listen, "heat_delivery_types"),
    [listen],
  );

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
    getFachwerte().then((result) => setListen(result.listen || {})).catch(() => {});
    // Kennwerte des Bestands, um jede Position gegen den Median zu stellen.
    getRefAnalyse()
      .then((a) => setKennwerte(Object.fromEntries((a.kennwerte || []).map((k) => [k.bkp_nr, k]))))
      .catch(() => {});
    if (isEdit) {
      getRef(id)
        .then((r) => {
          setCommercial(normalisiereKonditionen(r.lv_commercial, r.rabatt_pct, r.skonto_pct));
          setRefFeatures(r.features || {});
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
            anzahl_heizkoerper: r.anzahl_heizkoerper ?? "",
            anzahl_schaltgeraetekombinationen: r.anzahl_schaltgeraetekombinationen ?? "",
            laufmeter_rohre_heizung: r.laufmeter_rohre_heizung ?? "",
            rabatt_pct: r.rabatt_pct ?? "", skonto_pct: r.skonto_pct ?? "",
          });
          setBetraege(Object.fromEntries((r.kostenzeilen || []).map((z) => [z.bkp_nr, z.betrag_chf])));
        })
        .catch(() => setError("Referenzprojekt konnte nicht geladen werden"));
    }
  }, [id, isEdit]);

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
  const commercialPreview = konditionenVorschau(brutto, commercial);
  const erdsonde = hasErdsonde(form.waermeerzeuger);
  // Massgebend ist derselbe Betrag, den auch die Liste als Netto zeigt.
  const nettoEffektiv = commercialPreview.total_incl_vat ?? commercialPreview.subtotal_excl_vat ?? netto;

  // Vergleich einer Position mit dem Bestand: ohne Betrag der Median als
  // Orientierung, mit Betrag die eigene Abweichung. Fehlt die Bezugsgrösse,
  // gibt es nichts zu vergleichen — dann steht dort bewusst nichts.
  const vergleichFuer = (pos) => {
    const k = kennwerte[pos.bkp_nr];
    if (!k) return null;
    const betrag = Number(betraege[pos.bkp_nr]) || 0;
    const bezug = Number(form[TREIBER_FELD[pos.treiber]]) || 0;
    if (!betrag || !bezug) return { text: `Median ${kw(k.median)} ${k.einheit}`, schwach: true };
    const eigen = betrag / bezug;
    const abw = k.median > 0 ? (eigen / k.median - 1) * 100 : null;
    return {
      text: `${kw(eigen)} ${k.einheit}${abw == null ? "" : ` · ${abw >= 0 ? "+" : "−"}${zahl(Math.abs(abw))} %`}`,
      auffaellig: abw != null && Math.abs(abw) >= AUFFAELLIG_PCT,
    };
  };

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
      anzahl_heizkoerper: num(form.anzahl_heizkoerper),
      anzahl_schaltgeraetekombinationen: num(form.anzahl_schaltgeraetekombinationen),
      laufmeter_rohre_heizung: num(form.laufmeter_rohre_heizung),
      rabatt_pct: rabatt, skonto_pct: skonto,
      commercial: {
        base_amount: commercial.base_amount == null || commercial.base_amount === ""
          ? brutto : Number(commercial.base_amount),
        vat_rate: num(commercial.vat_rate),
        conditions: commercial.conditions,
      },
      features: refFeatures,
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
              <KonditionenBearbeiten commercial={commercial} onChange={setCommercial} brutto={brutto} />
              {(form.ebf_m2 > 0 || form.heizleistung_kw > 0) && nettoEffektiv > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 pt-px">
                  <Kennwert titel="Netto/EBF" wert={form.ebf_m2 > 0 ? `${kw(nettoEffektiv / form.ebf_m2)} CHF/m²` : null} />
                  <Kennwert titel="Netto/kW" wert={form.heizleistung_kw > 0 ? `${kw(nettoEffektiv / form.heizleistung_kw)} CHF/kW` : null} />
                </div>
              )}
              <p className="mt-3 text-xs text-slate-400">Laufend gegen das Leistungsverzeichnis/Devis des Unternehmers prüfen — passt die Summe?</p>
            </div>
            {/* Speichern klebt mit der Zusammenstellung mit (Dominic 2026-07-31).
                Vorher stand es ganz unten — bei einem langen Formular musste man
                dafür jedes Mal durch alle BKP-Zeilen scrollen. */}
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? "Speichere…" : "Speichern"}
              </button>
              <Link to="/auswertung" className="btn-secondary">Abbrechen</Link>
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
                      <option value="">— keine Angabe —</option>{(listen.project_types || []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select></div>
                  <div><label className="label">Gebäudetyp</label>
                    <select className="input" value={form.gebaeudetyp} onChange={(e) => set("gebaeudetyp", e.target.value)}>
                      <option value="">— keine Angabe —</option>{(listen.building_uses || []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select></div>
                  <div><label className="label flex items-center gap-1">Ausbauumfang <InfoTip text={ERKL.ausbauumfang} /></label>
                    <select className="input" value={form.ausbauumfang} onChange={(e) => set("ausbauumfang", e.target.value)}>
                      <option value="">— keine Angabe —</option>{(listen.scope_levels || []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select></div>
                  <div><label className="label flex items-center gap-1">Zertifizierung <InfoTip text={ERKL.zertifizierung} /></label>
                    <select className="input" value={form.zertifizierung} onChange={(e) => set("zertifizierung", e.target.value)}>
                      <option value="">— keine Angabe —</option>{(listen.certifications || []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select></div>
                </div>
                <CheckboxGruppe
                  label="Wärmeerzeuger"
                  hint="Mehrere Systeme können gleichzeitig gewählt werden. Die Auswahl wird mit denselben Codes wie im LV-Importer gespeichert."
                  options={waermeerzeugerOptionen}
                  value={form.waermeerzeuger}
                  onChange={setWaermeerzeuger}
                />
                <CheckboxGruppe
                  label="Wärmeabgabe"
                  hint="Alle im Projekt vorhandenen Abgabesysteme auswählen."
                  options={waermeabgabeOptionen}
                  value={form.waermeabgabe}
                  onChange={(v) => set("waermeabgabe", v)}
                />
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
                <div><label className="label">Anzahl Schaltgerätekombinationen</label><input type="number" className="input" value={form.anzahl_schaltgeraetekombinationen} onChange={(e) => set("anzahl_schaltgeraetekombinationen", e.target.value)} /></div>
                <div><label className="label">Laufmeter Rohre Heizung</label><input type="number" className="input" value={form.laufmeter_rohre_heizung} onChange={(e) => set("laufmeter_rohre_heizung", e.target.value)} /></div>
              </div>
            </div>

            {/* BKP-Kosten — alle Positionen da, nur ausfüllen was zutrifft */}
            <div className="card p-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">BKP-Kosten</h2>
                <span className="text-sm font-semibold tabular-nums text-slate-900">Brutto {chf(brutto)}</span>
              </div>
              <p className="mb-4 text-xs text-slate-400">Nur ausfüllen, was zutrifft — leere Positionen werden nicht gespeichert.</p>
              <div className="space-y-5">
                {gruppen.map(([nr, g]) => (
                  <div key={nr}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <span>{nr} · {g.name}</span>
                      <span className="tabular-nums text-slate-700">
                        Total {nr}: {chf(g.items.reduce((summe, item) => summe + (Number(betraege[item.bkp_nr]) || 0), 0))}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {g.items.map((p) => {
                        const gefuellt = Number(betraege[p.bkp_nr]) > 0;
                        const vergleich = vergleichFuer(p);
                        return (
                          <div key={p.bkp_nr}
                            className={`flex items-center gap-3 rounded-md px-2 py-1 transition-colors ${aktiveBkp === p.bkp_nr ? "bg-sky-50 ring-1 ring-sky-200" : ""}`}>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-slate-700">{p.bkp_nr}</span>
                              <span className="ml-2 text-sm text-slate-500">{p.bezeichnung}</span>
                            </div>
                            {/* Vergleich mit dem Bestand — auf dem Handy ausgeblendet,
                                dort zählt das Eingabefeld. */}
                            <div className={"hidden w-48 shrink-0 text-right text-[11px] tabular-nums sm:block "
                              + (vergleich?.auffaellig ? "font-semibold text-amber-700" : "text-slate-400")}
                              title={vergleich?.auffaellig ? `Mehr als ${AUFFAELLIG_PCT} % vom Median des Bestands entfernt.` : undefined}>
                              {vergleich?.text}
                            </div>
                            <div className="relative w-32 shrink-0 sm:w-36">
                              <input
                                type="number"
                                className={"input pr-10 text-right " + (gefuellt ? "border-brand-300 bg-brand-50/40" : "")}
                                value={betraege[p.bkp_nr] ?? ""}
                                onChange={(e) => setBetrag(p.bkp_nr, e.target.value)}
                                onFocus={() => setAktiveBkp(p.bkp_nr)}
                                onBlur={() => setAktiveBkp(null)}
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

            {/* Speichern und Abbrechen stehen oben bei der Zusammenstellung.
                Hier bleiben nur die selten gebrauchten Aktionen. */}
            {isEdit && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={exportCsv} className="btn-secondary"><Download className="size-4" /> CSV</button>
                <button type="button" onClick={remove} className="btn-ghost text-red-500 hover:bg-red-50"><Trash2 className="size-4" /> Löschen</button>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// Eine Kennzahl in der Zusammenstellung — gleiche Sprache wie die Kennzahlen
// über der Auswertungsliste.
function Kennwert({ titel, wert }) {
  return (
    <div className="bg-white px-2 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{titel}</div>
      <div className="tabular-nums text-slate-900">{wert || "—"}</div>
    </div>
  );
}
