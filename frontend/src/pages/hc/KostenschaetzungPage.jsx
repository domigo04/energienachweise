import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Info } from "lucide-react";
import { getProject, ksGet, ksSave } from "../../api/hcApi";
import CheckboxGruppe from "../../components/kv/CheckboxGruppe";
import AnlagenkonfigurationAuswahl from "../../components/kv/AnlagenkonfigurationAuswahl";
import BoxPlot from "../../components/charts/BoxPlot";
import BarPlot from "../../components/charts/BarPlot";
import {
  AUSBAUUMFAENGE, GEBAEUDETYPEN, PROJEKTARTEN, WAERMEABGABE, WAERMEERZEUGER, ZERTIFIZIERUNGEN, hasErdsonde,
  konfigurationVorschlag, siaZuGebaeudetyp,
} from "../../data/kv";

const DEFAULT = {
  projektart: "", gebaeudetyp: "", ausbauumfang: "", zertifizierung: "", anlagenkonfiguration: "",
  waermeerzeuger: [], waermeabgabe: [], ebf: "", bohrmeter: "", heizleistung_kw: "", anzahl_einheiten: "",
  baupreisindex_beruecksichtigen: false,
};
const num = (v) => (v === "" || v == null ? null : Number(v));
const chf = (n) => (n || n === 0 ? Math.round(n).toLocaleString("de-CH") + " CHF" : "—");
const CONF = { hoch: "badge-hoch", mittel: "badge-mittel", tief: "badge-tief" };
const ERKL_STYLE = {
  hoch: "border-green-200 bg-green-50 text-green-900",
  mittel: "border-amber-200 bg-amber-50 text-amber-900",
  tief: "border-slate-200 bg-slate-100 text-slate-700",
};

// Vergleicht Eingabe und beste Referenz konkret — Grundlage für den
// dynamischen Erklärungssatz (welche Merkmale stimmen überein/ab).
function vergleicheMitReferenz(inp, ref) {
  if (!ref) return "";
  const punkte = [];
  if (inp.anlagenkonfiguration && inp.anlagenkonfiguration === ref.anlagenkonfiguration) {
    punkte.push("gleiche Anlagenkonfiguration");
  }
  if (inp.gebaeudetyp && inp.gebaeudetyp === ref.gebaeudetyp) {
    punkte.push(`gleicher Gebäudetyp (${ref.gebaeudetyp})`);
  }
  const ebfIn = Number(inp.ebf), ebfRef = Number(ref.ebf);
  if (ebfIn > 0 && ebfRef > 0) {
    const diff = Math.abs(ebfIn - ebfRef) / Math.max(ebfIn, ebfRef);
    punkte.push(diff < 0.15 ? `ähnliche Fläche (${ebfRef} vs. deine ${ebfIn} m²)` : `unterschiedliche Fläche (${ebfRef} vs. deine ${ebfIn} m²)`);
  }
  const kwIn = Number(inp.heizleistung_kw), kwRef = Number(ref.heizleistung_kw);
  if (kwIn > 0 && kwRef > 0) {
    const diff = Math.abs(kwIn - kwRef) / Math.max(kwIn, kwRef);
    punkte.push(diff < 0.15 ? `ähnliche Leistung (${kwRef} vs. deine ${kwIn} kW)` : `unterschiedliche Leistung (${kwRef} vs. deine ${kwIn} kW)`);
  }
  const erzInp = new Set(inp.waermeerzeuger || []);
  const erzRef = new Set(ref.waermeerzeuger || []);
  if (erzInp.size > 0 && erzInp.size === erzRef.size && [...erzInp].every((e) => erzRef.has(e))) {
    punkte.push("gleiche Wärmeerzeuger");
  }
  return punkte.join(", ");
}

// Ein Satz, der das Ergebnis in Alltagssprache einordnet — Ähnlichkeit (passt
// die beste Referenz?) und Validierung (bestätigen das genug Referenzen?)
// sind bewusst getrennte Aussagen, dynamisch aus der jeweils besten Referenz.
function erklaerung(r, inp) {
  if (!r || !r.rows?.length) return "";
  const n = r.anzahl_referenzen || 0;
  const total = Math.round(r.total).toLocaleString("de-CH") + " CHF";
  const topRef = r.referenzen?.[0];

  let satz = "";
  if (r.aehnlichkeit && topRef) {
    const vergleich = vergleicheMitReferenz(inp, topRef);
    satz = `Die ähnlichste Referenz ist «${topRef.name}» (Ähnlichkeit ${r.aehnlichkeit.stufe}, Gewicht ${r.aehnlichkeit.gewicht})${vergleich ? " — " + vergleich : ""}. `;
  }

  if (r.overall_confidence === "hoch")
    satz += `Validierung hoch: ${n} Referenzen bestätigen das mit ähnlichen Zahlen — die ${total} sind als Richtwert gut brauchbar.`;
  else if (r.overall_confidence === "mittel")
    satz += `Validierung mittel: ${n} Referenzen passen einigermassen. Nimm die ${total} als Hausnummer und schau dir die grössten Positionen genauer an.`;
  else
    satz += `Validierung tief: erst ${n} vergleichbare Referenz${n === 1 ? "" : "en"} — sei mit der Bandbreite vorsichtig, auch wenn die Ähnlichkeit gut ist. Erfasse in der Auswertung mehr ähnliche Projekte, damit es verlässlicher wird.`;

  const zuschlagZeilen = r.rows.filter((row) => row.hinweis);
  if (zuschlagZeilen.length > 0) {
    const positionen = zuschlagZeilen.map((row) => row.bkp_nr).join(", ");
    satz += ` Für die Positionen ${positionen} (Regelung/Armaturen/Koordination) gibt es noch keine Referenzprojekte mit derselben Anlagenkonfiguration — dort wurde ein grober Komplexitätszuschlag auf monovalenter Basis geschätzt (Vertrauen «tief»).`;
  }
  return satz;
}

export default function KostenschaetzungPage() {
  const { id } = useParams();
  const [inp, setInp] = useState(DEFAULT);
  const [result, setResult] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("");

  const set = (k, v) => setInp((f) => ({ ...f, [k]: v }));
  const erdsonde = hasErdsonde(inp.waermeerzeuger);

  // Erst-Vorschlag für die Anlagenkonfiguration, solange sie noch nicht gesetzt ist.
  const setWaermeerzeuger = (v) =>
    setInp((f) => ({
      ...f, waermeerzeuger: v,
      anlagenkonfiguration: f.anlagenkonfiguration || konfigurationVorschlag(v),
    }));

  useEffect(() => {
    Promise.all([ksGet(id), getProject(id).catch(() => null)])
      .then(([d, proj]) => {
        const base = { ...DEFAULT, ...(d.inputs || {}) };
        // Gespeicherte null-Werte (nicht gesetzte Optional-Felder) auf "" normalisieren,
        // sonst beschwert sich React über <select value={null}>.
        ["projektart", "gebaeudetyp", "ausbauumfang", "zertifizierung", "anlagenkonfiguration"].forEach((k) => {
          if (base[k] == null) base[k] = "";
        });
        // Gebäudetyp aus dem Projekt übernehmen, falls noch nicht gesetzt
        if (!base.gebaeudetyp && proj?.base_data?.gebaeudekategorie) {
          base.gebaeudetyp = siaZuGebaeudetyp(proj.base_data.gebaeudekategorie);
        }
        setInp(base);
        if (d.result) setResult(d.result);
      })
      .finally(() => setLoaded(true));
  }, [id]);

  // debounced: rechnen + speichern
  useEffect(() => {
    if (!loaded) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const payload = {
        projektart: inp.projektart || null, gebaeudetyp: inp.gebaeudetyp || null,
        ausbauumfang: inp.ausbauumfang || null, zertifizierung: inp.zertifizierung || null,
        anlagenkonfiguration: inp.anlagenkonfiguration || null,
        waermeerzeuger: inp.waermeerzeuger, waermeabgabe: inp.waermeabgabe,
        ebf: num(inp.ebf), bohrmeter: erdsonde ? num(inp.bohrmeter) : null,
        heizleistung_kw: num(inp.heizleistung_kw), anzahl_einheiten: num(inp.anzahl_einheiten),
        baupreisindex_beruecksichtigen: !!inp.baupreisindex_beruecksichtigen,
      };
      try { const d = await ksSave(id, payload); setResult(d.result); setSaveState("saved"); }
      catch { setSaveState("error"); }
    }, 500);
    return () => clearTimeout(t);
  }, [inp, loaded, id]);

  const leer = !result || !result.rows || result.rows.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/projekte" className="hover:text-brand-600">Projekte</Link><span>/</span>
          <Link to={`/projekte/${id}`} className="hover:text-brand-600">Projekt</Link><span>/</span>
          <span className="text-slate-800">Kostenschätzung</span>
        </div>
        <span className="text-xs text-slate-400">
          {saveState === "saving" ? "● Rechne…" : saveState === "error" ? "● Fehler" : saveState === "saved" ? "● Gespeichert" : ""}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Eingaben */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-800">Projekt-Merkmale</h2>
            <div className="space-y-3">
              <div><label className="label">Projektart</label>
                <select className="input" value={inp.projektart} onChange={(e) => set("projektart", e.target.value)}>
                  <option value="">—</option>{PROJEKTARTEN.map((o) => <option key={o}>{o}</option>)}</select></div>
              <div><label className="label">Gebäudetyp</label>
                <select className="input" value={inp.gebaeudetyp} onChange={(e) => set("gebaeudetyp", e.target.value)}>
                  <option value="">—</option>{GEBAEUDETYPEN.map((o) => <option key={o}>{o}</option>)}</select></div>
              <div><label className="label">Ausbauumfang</label>
                <select className="input" value={inp.ausbauumfang} onChange={(e) => set("ausbauumfang", e.target.value)}>
                  <option value="">—</option>{AUSBAUUMFAENGE.map((o) => <option key={o}>{o}</option>)}</select></div>
              <div><label className="label">Zertifizierung</label>
                <select className="input" value={inp.zertifizierung} onChange={(e) => set("zertifizierung", e.target.value)}>
                  <option value="">—</option>{ZERTIFIZIERUNGEN.map((o) => <option key={o}>{o}</option>)}</select></div>
              <CheckboxGruppe label="Wärmeerzeuger" options={WAERMEERZEUGER} value={inp.waermeerzeuger} onChange={setWaermeerzeuger} />
              <CheckboxGruppe label="Wärmeabgabe" options={WAERMEABGABE} value={inp.waermeabgabe} onChange={(v) => set("waermeabgabe", v)} />
              <AnlagenkonfigurationAuswahl value={inp.anlagenkonfiguration} onChange={(v) => set("anlagenkonfiguration", v)} />
            </div>
          </div>
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-800">Bezugsgrössen</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">EBF [m²]</label><input type="number" className="input" value={inp.ebf} onChange={(e) => set("ebf", e.target.value)} /></div>
              <div><label className="label">Erzeugerleistung [kW]</label><input type="number" className="input" value={inp.heizleistung_kw} onChange={(e) => set("heizleistung_kw", e.target.value)} /></div>
              <div><label className="label">Anzahl Einheiten</label><input type="number" className="input" value={inp.anzahl_einheiten} onChange={(e) => set("anzahl_einheiten", e.target.value)} /></div>
              {erdsonde && <div><label className="label">Bohrmeter</label><input type="number" className="input" value={inp.bohrmeter} onChange={(e) => set("bohrmeter", e.target.value)} /></div>}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={!!inp.baupreisindex_beruecksichtigen}
                onChange={(e) => set("baupreisindex_beruecksichtigen", e.target.checked)} />
              Baupreisindex berücksichtigen
            </label>
          </div>
        </div>

        {/* Ergebnis */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="card p-4"><div className="text-xs text-slate-400">Summe (Kontrollzahl)</div><div className="mt-1 text-xl font-bold text-slate-900">{chf(result?.total)}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-400">Bandbreite tief</div><div className="mt-1 text-lg font-semibold text-slate-700">{chf(result?.total_low)}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-400">Bandbreite hoch</div><div className="mt-1 text-lg font-semibold text-slate-700">{chf(result?.total_high)}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-400">Ähnlichkeit</div><div className="mt-1">{result ? <span className={CONF[result.aehnlichkeit?.stufe]}>{result.aehnlichkeit?.stufe}</span> : "—"}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-400">Validierung</div><div className="mt-1">{result ? <span className={CONF[result.overall_confidence]}>{result.overall_confidence}</span> : "—"}</div></div>
          </div>
          <p className="-mt-3 text-xs text-slate-400">
            Massgebend sind die einzelnen BKP-Positionen unten — die Summe oben ist nur eine Kontrollzahl.
            <b> Ähnlichkeit</b> zeigt, wie gut die beste Referenz passt; <b>Validierung</b>, wie viele
            unabhängige Referenzen das mit ähnlichen Zahlen bestätigen — beides kann unterschiedlich ausfallen.
          </p>

          {leer ? (
            <div className="card border-dashed p-10 text-center">
              <p className="font-medium text-slate-700">Noch keine Schätzung möglich</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                Wähle Merkmale und Bezugsgrössen — und erfasse in der <Link to="/auswertung" className="text-brand-600 hover:underline">Auswertung</Link> Referenzprojekte mit BKP-Kosten. Ohne passende Referenzen gibt es keine Kennwerte.
              </p>
            </div>
          ) : (
            <>
              <div className={"rounded-xl border p-4 text-sm leading-relaxed " + (ERKL_STYLE[result.overall_confidence] || ERKL_STYLE.tief)}>
                {erklaerung(result, inp)}
              </div>
              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-700">Schätzung je BKP-Position</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="p-3">BKP</th><th className="p-3">Position</th><th className="p-3 text-right">Kennwert</th>
                      <th className="p-3 text-right">Schätzung</th><th className="p-3 text-right">tief–hoch</th><th className="p-3">Vertrauen</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.rows.map((r) => (
                        <tr key={r.bkp_nr}>
                          <td className="p-3 font-medium text-slate-700">
                            <span className="inline-flex items-center gap-1.5">
                              {r.bkp_nr}
                              {r.hinweis && (
                                <Info className="size-3.5 shrink-0 text-amber-500" strokeWidth={2.5}>
                                  <title>{r.hinweis}</title>
                                </Info>
                              )}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{r.bkp_name}</td>
                          <td className="p-3 text-right text-slate-500">{r.kennwert} <span className="text-xs text-slate-400">{r.einheit}</span></td>
                          <td className="p-3 text-right font-semibold text-slate-900">{chf(r.estimate)}</td>
                          <td className="p-3 text-right text-xs text-slate-400">{chf(r.low)}–{chf(r.high)}</td>
                          <td className="p-3"><span className={CONF[r.confidence]}>{r.confidence}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Kennwert-Streuung je BKP</h3>
                <p className="mb-2 text-xs text-slate-400">Zeig auf eine Box, um die genauen Zahlen zu sehen.</p>
                <div className="overflow-x-auto"><BoxPlot data={result.boxplot} /></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Box = P25–P75</span><span>Strich = Median</span><span>Punkt = gewichteter Kennwert</span>
                </div>
              </div>
              <div className="card p-5">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Kosten je BKP (mit Bandbreite)</h3>
                <p className="mb-2 text-xs text-slate-400">Zeig auf einen Balken, um tief/Schätzung/hoch zu sehen.</p>
                <div className="overflow-x-auto"><BarPlot data={result.rows} /></div>
              </div>

              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-700">Ähnlichste Referenzprojekte</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="p-3">Projekt</th><th className="p-3">Typ</th><th className="p-3">Konfiguration</th><th className="p-3">System</th>
                      <th className="p-3 text-right">EBF</th><th className="p-3 text-right">kW</th><th className="p-3 text-right">Gewicht</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.referenzen.map((r, i) => (
                        <tr key={i}>
                          <td className="p-3 font-medium text-slate-700">{r.name}</td>
                          <td className="p-3 text-slate-500">{[r.projektart, r.gebaeudetyp].filter(Boolean).join(" / ")}</td>
                          <td className="p-3 text-slate-500 capitalize">{r.anlagenkonfiguration}</td>
                          <td className="p-3 text-slate-500">{[...(r.waermeerzeuger || []), ...(r.waermeabgabe || [])].join(", ")}</td>
                          <td className="p-3 text-right text-slate-500">{r.ebf ? `${r.ebf} m²` : "—"}</td>
                          <td className="p-3 text-right text-slate-500">{r.heizleistung_kw ?? "—"}</td>
                          <td className="p-3 text-right font-semibold text-slate-700">{r.gewicht}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
