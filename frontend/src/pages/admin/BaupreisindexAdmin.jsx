import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { addBauindex, bauindexAutomatischAktualisieren, deleteBauindex, getBauindex } from "../../api/hcApi";

export default function BaupreisindexAdmin() {
  const [eintraege, setEintraege] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState("");
  const [wert, setWert] = useState("");
  const [error, setError] = useState("");
  const [aktualisiere, setAktualisiere] = useState(false);
  const [meldung, setMeldung] = useState(null);

  const load = () => getBauindex().then(setEintraege).catch(() => setError("Einträge konnten nicht geladen werden")).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!periode || !wert) return;
    try {
      await addBauindex({ periode, wert: Number(wert) });
      setPeriode(""); setWert("");
      await load();
    } catch {
      setError("Speichern fehlgeschlagen");
    }
  };

  const remove = async (id) => {
    try { await deleteBauindex(id); await load(); } catch { setError("Löschen fehlgeschlagen"); }
  };

  const jetztAktualisieren = async () => {
    setAktualisiere(true);
    setMeldung(null);
    try {
      const res = await bauindexAutomatischAktualisieren();
      setMeldung(res);
      if (res.erfolg) await load();
    } catch {
      setMeldung({ erfolg: false, meldung: "Anfrage fehlgeschlagen." });
    } finally {
      setAktualisiere(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Baupreisindex</h1>
        <p className="mt-1 text-sm text-slate-500">
          Periodenwerte für die Umrechnung älterer Referenz-Kosten auf heutiges Preisniveau
          (Häkchen «Baupreisindex berücksichtigen» in der Kostenschätzung).
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="card mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Automatischer Abruf (BFS / opendata.swiss)</h2>
          <button onClick={jetztAktualisieren} disabled={aktualisiere} className="btn-secondary">
            <RefreshCw className={"size-4 " + (aktualisiere ? "animate-spin" : "")} />
            {aktualisiere ? "Prüfe…" : "Jetzt aktualisieren"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Bestmöglicher Versuch gegen die offizielle Quelle — noch nicht live verifiziert. Schlägt er fehl,
          bleibt alles beim Alten; die manuelle Eingabe unten funktioniert immer.
        </p>
        {meldung && (
          <div className={"mt-3 rounded-lg p-3 text-sm " + (meldung.erfolg ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800")}>
            {meldung.erfolg ? `✓ ${meldung.meldung} (${meldung.neue_eintraege} neu)` : `⚠ ${meldung.meldung}`}
          </div>
        )}
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Manuell erfassen</h2>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Periode</label>
            <input type="date" className="input" value={periode} onChange={(e) => setPeriode(e.target.value)} />
          </div>
          <div>
            <label className="label">Indexwert</label>
            <input type="number" step="0.1" className="input" value={wert} onChange={(e) => setWert(e.target.value)} placeholder="z.B. 108.4" />
          </div>
          <button type="submit" className="btn-primary">Speichern</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-700">Erfasste Perioden</div>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-400">Lade…</div>
        ) : eintraege.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">Noch keine Indexwerte hinterlegt.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="p-3">Periode</th><th className="p-3 text-right">Indexwert</th><th className="p-3">Quelle</th><th className="p-3" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td className="p-3 text-slate-700">{new Date(e.periode).toLocaleDateString("de-CH")}</td>
                  <td className="p-3 text-right font-medium text-slate-900">{e.wert}</td>
                  <td className="p-3 text-slate-500">{e.quelle}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => remove(e.id)} className="btn-ghost text-slate-400 hover:text-red-500"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
