// Grobkostenschätzung (BKP) — läuft im Projekt, rechnet auf den Referenz-
// projekten der Auswertung. Ausgabe wie ein Norm-Leistungsverzeichnis: jede
// BKP-Einzelposition, gruppiert mit Zwischentotalen und Gesamttotal. Eingaben
// (Wärmeerzeuger/-abgabe als Mehrfach-Auswahl, wie in der Auswertung) und
// Ergebnis bleiben pro Projekt gespeichert.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Calculator, ChevronRight, Database, RefreshCw } from "lucide-react";
import {
  bauindexAutomatischAktualisieren, getBauindex, getProject,
  gkProjektGet, gkProjektSave,
} from "../../api/hcApi";
import CheckboxGruppe from "../../components/kv/CheckboxGruppe";
import InfoTip from "../../components/ui/InfoTip";
import { WAERMEABGABE, WAERMEERZEUGER } from "../../data/kv";
import { chf, gruppeInfo, num, NUTZUNGEN, pct, PROJEKTARTEN } from "../../data/gk";

const LEER = {
  ebf_m2: "", leistung_kw: "", anzahl_ne: "", nutzung: "MFH", projektart: "Neubau",
  waermeerzeuger: ["Erdsonden-WP"], waermeabgabe: ["FBH"],
  bww_bei_heizung: false, baupreisindex_beruecksichtigen: false,
  weiterbetrieb_umbau: false, etappierung: false,
  rohrmeter: "", bohrmeter: "", hk_anzahl: "",
};

const ERKL = {
  kennwert: "Aus den Referenzprojekten gewichtet gemittelter Preis pro Bezugsgrösse dieser Position (CHF pro Bohrmeter / kW / m² EBF / Heizkörper). Eine Referenz, in der die Position nicht vorkam, zählt mit 0 — so wird nichts hochgerechnet, was real nicht vorhanden war.",
  vertrauen: "Wie viele der passenden Referenzprojekte diese Position überhaupt hatten. Viele → verlässlich (hoch), wenige → vorsichtig sein.",
  baupreisindex: "Skaliert die Kosten jedes Referenzprojekts auf das heutige Preisniveau, bevor gerechnet wird (heutiger Index ÷ Index zum Zeitpunkt des Referenzprojekts). Ohne hinterlegte Indexwerte hat das Häkchen keine Wirkung.",
  bww: "Ist das Brauchwarmwasser Teil der Heizungs-Kosten (Schnittstelle bei der Heizung) oder läuft es beim Sanitär? Weiches Kriterium: Referenzen mit anderer Schnittstelle bleiben brauchbar, zählen nur etwas weniger.",
  bruttoNetto: "Brutto = Summe der Leistungsverzeichnis-Positionen der Referenzen. Netto = nach deren Rabatt/Skonto — der real bezahlte Betrag.",
};

const zahl = (v) => (v === "" || v == null ? null : Number(v));
const ohnePrefix = (name) => name?.replace(/^Beispiel — /, "");

function Feld({ label: l, children }) {
  return (<div><label className="label">{l}</label>{children}</div>);
}
function Select({ value, onChange, optionen }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {optionen.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function GrobkostenSchaetzung() {
  const { id } = useParams();
  const [projekt, setProjekt] = useState(null);
  const [form, setForm] = useState(LEER);
  const [variante, setVariante] = useState("netto");
  const [indexStand, setIndexStand] = useState(null);
  const [indexLaedt, setIndexLaedt] = useState(false);
  const [indexMeldung, setIndexMeldung] = useState("");
  const [result, setResult] = useState(null);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(null);
  const timer = useRef(null);

  const ladeIndexStand = useCallback(
    () => getBauindex().then((e) => setIndexStand(e[0]?.periode || null)).catch(() => {}), []);

  useEffect(() => {
    getProject(id).then(setProjekt).catch(() => {});
    ladeIndexStand();
    gkProjektGet(id).then(({ inputs, result: r }) => {
      if (inputs) {
        setForm((f) => {
          const neu = { ...f, ...inputs };
          for (const k of ["ebf_m2", "leistung_kw", "anzahl_ne", "rohrmeter", "bohrmeter", "hk_anzahl"]) {
            if (neu[k] == null) neu[k] = "";
          }
          neu.waermeerzeuger = inputs.waermeerzeuger || [];
          neu.waermeabgabe = inputs.waermeabgabe || [];
          neu.bww_bei_heizung = !!inputs.bww_bei_heizung;
          return neu;
        });
      }
      if (r) setResult(r);
    }).catch(() => {});
  }, [id, ladeIndexStand]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const gueltig = zahl(form.ebf_m2) > 0 && zahl(form.leistung_kw) > 0
    && zahl(form.anzahl_ne) > 0 && (form.waermeerzeuger?.length > 0);

  const rechnen = useCallback(async (f) => {
    setLaden(true);
    setFehler("");
    try {
      const payload = {
        ...f,
        ebf_m2: zahl(f.ebf_m2), leistung_kw: zahl(f.leistung_kw), anzahl_ne: zahl(f.anzahl_ne),
        rohrmeter: zahl(f.rohrmeter), bohrmeter: zahl(f.bohrmeter), hk_anzahl: zahl(f.hk_anzahl),
      };
      const { result: r } = await gkProjektSave(id, payload);
      setResult(r);
    } catch (err) {
      setFehler(err?.response?.data?.detail || "Die Schätzung konnte nicht berechnet werden.");
    } finally {
      setLaden(false);
    }
  }, [id]);

  useEffect(() => {
    if (!result || !gueltig) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => rechnen(form), 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const indexAktualisieren = async () => {
    setIndexLaedt(true); setIndexMeldung("");
    try {
      const r = await bauindexAutomatischAktualisieren();
      setIndexMeldung(r.erfolg ? `${r.neue_eintraege} neue Werte geholt` : r.meldung);
      ladeIndexStand();
      if (result && gueltig) rechnen(form);
    } catch {
      setIndexMeldung("Abruf fehlgeschlagen — manuelle Pflege unter Verwaltung → Baupreisindex.");
    } finally { setIndexLaedt(false); }
  };

  const aktiv = result?.[variante];
  const refsVerwendet = aktiv?.referenzen_verwendet || [];

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <Link to={`/projekte/${id}`} className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        ← {projekt?.name || "Projekt"}
      </Link>
      <h1 className="text-xl font-bold text-slate-900">Grobkostenschätzung</h1>
      <p className="mb-5 mt-1 text-sm text-slate-500">
        Schätzung je BKP-Position aus den Referenzprojekten der{" "}
        <Link to="/auswertung" className="text-brand-600 hover:underline">Auswertung</Link> —
        aufgebaut wie ein Norm-Leistungsverzeichnis. Eingaben und Ergebnis bleiben im Projekt gespeichert.
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Eingabe ── */}
        <div className="card sticky top-4 p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Eckdaten</h2>
          <div className="grid grid-cols-2 gap-3">
            <Feld label="EBF [m²]">
              <input className="input" type="number" min="1" value={form.ebf_m2} onChange={(e) => set("ebf_m2", e.target.value)} placeholder="z.B. 1100" />
            </Feld>
            <Feld label="Heizleistung [kW]">
              <input className="input" type="number" min="1" step="0.5" value={form.leistung_kw} onChange={(e) => set("leistung_kw", e.target.value)} placeholder="z.B. 35" />
            </Feld>
            <Feld label="Nutzung">
              <Select value={form.nutzung} onChange={(v) => set("nutzung", v)} optionen={NUTZUNGEN} />
            </Feld>
            <Feld label="Anzahl Einheiten">
              <input className="input" type="number" min="1" value={form.anzahl_ne} onChange={(e) => set("anzahl_ne", e.target.value)} placeholder="z.B. 8" />
            </Feld>
            <Feld label="Projektart">
              <Select value={form.projektart} onChange={(v) => set("projektart", v)} optionen={PROJEKTARTEN} />
            </Feld>
          </div>

          <div className="mt-3">
            <CheckboxGruppe label="Wärmeerzeuger" options={WAERMEERZEUGER} value={form.waermeerzeuger} onChange={(v) => set("waermeerzeuger", v)} />
          </div>
          <div className="mt-3">
            <CheckboxGruppe label="Wärmeabgabe" options={WAERMEABGABE} value={form.waermeabgabe} onChange={(v) => set("waermeabgabe", v)} />
          </div>

          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={!!form.bww_bei_heizung} onChange={(e) => set("bww_bei_heizung", e.target.checked)} />
              Brauchwarmwasser bei Heizung <InfoTip text={ERKL.bww} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={form.weiterbetrieb_umbau} onChange={(e) => set("weiterbetrieb_umbau", e.target.checked)} />
              Weiterbetrieb während Umbau
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={form.etappierung} onChange={(e) => set("etappierung", e.target.checked)} />
              Etappierte Ausführung
            </label>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-brand-600" checked={form.baupreisindex_beruecksichtigen} onChange={(e) => set("baupreisindex_beruecksichtigen", e.target.checked)} />
              Baupreisindex berücksichtigen <InfoTip text={ERKL.baupreisindex} />
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-slate-400">
              <span>{indexStand ? `Stand: ${indexStand}` : "Noch keine Indexwerte"}</span>
              <button className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline disabled:opacity-50" disabled={indexLaedt} onClick={indexAktualisieren}>
                <RefreshCw className={`size-3 ${indexLaedt ? "animate-spin" : ""}`} /> jetzt aktualisieren (BFS)
              </button>
              {indexMeldung && <span className="text-slate-500">{indexMeldung}</span>}
            </div>
          </div>

          <details className="mt-4 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
              Bekannte Mengen (optional)
            </summary>
            <p className="mt-2 text-xs leading-snug text-slate-400">
              Falls schon bekannt (z.B. Bohrmeter aus der Sondendimensionierung), rechnen die
              zugehörigen Positionen direkt mit Ihrer Zahl.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Feld label="Bohrmeter"><input className="input" type="number" min="0" value={form.bohrmeter} onChange={(e) => set("bohrmeter", e.target.value)} /></Feld>
              <Feld label="Rohrmeter"><input className="input" type="number" min="0" value={form.rohrmeter} onChange={(e) => set("rohrmeter", e.target.value)} /></Feld>
              <Feld label="Heizkörper"><input className="input" type="number" min="0" value={form.hk_anzahl} onChange={(e) => set("hk_anzahl", e.target.value)} /></Feld>
            </div>
          </details>

          <button className="btn-primary mt-5 w-full" disabled={!gueltig || laden} onClick={() => rechnen(form)}>
            <Calculator className="size-4" />
            {laden ? "Berechnet…" : result ? "Neu berechnen" : "Schätzung berechnen"}
          </button>
          {fehler && <p className="mt-2 text-sm text-brand-700">{fehler}</p>}
        </div>

        {/* ── Ergebnis ── */}
        <div className="min-w-0 space-y-4">
          {!aktiv && (
            <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Calculator className="size-8 text-slate-300" />
              <p className="max-w-md text-sm text-slate-500">
                Eckdaten links eingeben und berechnen — das Ergebnis listet jede BKP-Position
                mit Betrag auf, gruppiert mit Zwischentotalen wie ein Norm-Leistungsverzeichnis.
              </p>
            </div>
          )}

          {aktiv && aktiv.referenzen_gefunden === 0 && (
            <div className="card border-amber-200 bg-amber-50/50 px-5 py-5">
              <h3 className="text-sm font-bold text-slate-800">Keine passenden Referenzprojekte gefunden</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Damit eine Referenz zählt, müssen Wärmepumpen-Art, Projektart und Erdsonden ja/nein
                übereinstimmen. In der Auswertung gibt es dafür noch kein passendes Referenzprojekt mit BKP-Kosten.
              </p>
              <Link to="/auswertung" className="btn-secondary mt-3"><Database className="size-4" /> Zur Auswertung</Link>
            </div>
          )}

          {aktiv && aktiv.referenzen_gefunden > 0 && (
            <>
              {/* Kopf: Gesamt + Brutto/Netto-Umschalter + Datenbasis */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="card px-5 py-4">
                  <div className="text-xs font-medium text-slate-400">Gesamtschätzung ({variante})</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{chf(aktiv.gesamt_betrag)}</div>
                  {aktiv.baupreisindex_aktiv && <div className="mt-0.5 text-[11px] text-slate-400">auf heutigem Preisniveau (Baupreisindex)</div>}
                </div>
                <div className="card flex flex-col justify-center px-5 py-4">
                  <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-400">Ansicht <InfoTip text={ERKL.bruttoNetto} /></div>
                  <div className="inline-flex w-fit rounded-lg border border-slate-200 p-0.5">
                    {["brutto", "netto"].map((v) => (
                      <button key={v} onClick={() => setVariante(v)}
                        className={"rounded-md px-4 py-1 text-sm font-semibold capitalize transition " +
                          (variante === v ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card px-5 py-4">
                  <div className="text-xs font-medium text-slate-400">Datenbasis</div>
                  <div className="mt-1 text-lg font-semibold text-slate-700">
                    Top {aktiv.referenzen_gefunden} <span className="text-sm font-normal text-slate-400">von {aktiv.referenzen_im_segment} passenden</span>
                  </div>
                  {aktiv.korrekturfaktoren?.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-amber-700">Korrektur: {aktiv.korrekturfaktoren.join(" · ")}</div>
                  )}
                </div>
              </div>

              {/* Norm-Leistungsverzeichnis: Positionen je Gruppe + Zwischentotale */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <th className="px-4 py-2">BKP</th>
                        <th className="px-2 py-2">Position</th>
                        <th className="px-2 py-2 text-right"><span className="inline-flex items-center gap-1">Kennwert<InfoTip text={ERKL.kennwert} /></span></th>
                        <th className="px-2 py-2 text-right">Betrag</th>
                        <th className="px-2 py-2"><span className="inline-flex items-center gap-1">Vertrauen<InfoTip text={ERKL.vertrauen} /></span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {aktiv.gruppen.map((g) => (
                        <GruppenBlock key={g.gruppe_nr} g={g} ziel={form} offen={offen} setOffen={setOffen} />
                      ))}
                      <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                        <td className="px-4 py-3" colSpan={3}>Total BKP 24 Heizungsanlage</td>
                        <td className="px-2 py-3 text-right tabular-nums">{chf(aktiv.gesamt_betrag)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
                  Position anklicken zeigt den Rechenweg. Positionen ohne Betrag kamen in den passenden
                  Referenzprojekten nicht vor.
                </p>
              </div>

              {/* Verwendete Referenzen */}
              <div className="card px-5 py-4">
                <h3 className="mb-2 text-sm font-bold text-slate-800">Verwendete Referenzprojekte</h3>
                <div className="divide-y divide-slate-50">
                  {refsVerwendet.map((r) => (
                    <div key={r.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm">
                      <Link to={`/auswertung/${r.id}`} className="font-medium text-slate-800 hover:text-brand-600 hover:underline">
                        {ohnePrefix(r.name)}
                      </Link>
                      <span className="text-xs text-slate-400">
                        {r.datum_abrechnung?.slice(0, 4) || "ohne Datum"} · {r.nutzung} · {num(r.ebf_m2)} m² · {num(r.leistung_kw)} kW
                        {r.index_faktor != null ? ` · Index ×${num(r.index_faktor, 2)}` : ""}
                      </span>
                      <span className="ml-auto text-xs font-semibold tabular-nums text-slate-600">Gewicht {num(r.rang * 100)} %</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-snug text-slate-400">
                  Gewicht = Ähnlichkeit × Aktualität (Halbwertszeit 3 Jahre). Eine abweichende Brauchwarmwasser-
                  Schnittstelle senkt nur die Ähnlichkeit leicht, schliesst die Referenz aber nicht aus.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GruppenBlock({ g, ziel, offen, setOffen }) {
  const info = gruppeInfo(g.gruppe_nr);
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60">
        <td className="px-4 py-2 font-bold text-slate-800">
          <span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-sm ${info.farbe}`} />{g.gruppe_nr}</span>
        </td>
        <td className="px-2 py-2 font-semibold text-slate-700" colSpan={2}>{info.name}</td>
        <td className="px-2 py-2 text-right font-bold tabular-nums text-slate-800">{chf(g.betrag)}</td>
        <td />
      </tr>
      {g.positionen.map((p) => {
        const hasBetrag = p.betrag > 0;
        const key = p.bkp_nr;
        const auf = offen === key;
        return (
          <>
            <tr key={key} onClick={() => hasBetrag && setOffen(auf ? null : key)}
              className={"border-t border-slate-50 " + (hasBetrag ? "cursor-pointer hover:bg-slate-50/70" : "")}>
              <td className="py-1.5 pl-8 pr-2 tabular-nums text-slate-500">{p.bkp_nr}</td>
              <td className={"px-2 py-1.5 " + (hasBetrag ? "text-slate-700" : "text-slate-300")}>{p.bezeichnung}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                {hasBetrag ? `${num(p.kennwert)} ${p.einheit}` : "–"}
              </td>
              <td className={"px-2 py-1.5 text-right font-medium tabular-nums " + (hasBetrag ? "text-slate-900" : "text-slate-300")}>
                {hasBetrag ? chf(p.betrag) : "–"}
              </td>
              <td className="px-2 py-1.5">
                {hasBetrag && (
                  <span className="inline-flex items-center gap-1">
                    <VertrauenPunkt stufe={p.vertrauen} />
                    <ChevronRight className={`size-3.5 text-slate-300 transition ${auf ? "rotate-90" : ""}`} />
                  </span>
                )}
              </td>
            </tr>
            {auf && (
              <tr className="bg-slate-50/50">
                <td />
                <td colSpan={4} className="px-2 py-2 text-xs leading-relaxed text-slate-600">
                  Ø Kennwert <b>{num(p.kennwert)} {p.einheit}</b> × {num(p.ziel_treiber)}{" "}
                  {p.einheit.replace("CHF/", "")} = <b>{chf(p.betrag)}</b>.{" "}
                  In {p.abdeckung} von {p.n_referenzen} passenden Referenzen enthalten.
                  {p.bandbreite && <> Bandbreite {chf(p.bandbreite[0])} – {chf(p.bandbreite[1])}.</>}
                </td>
              </tr>
            )}
          </>
        );
      })}
    </>
  );
}

function VertrauenPunkt({ stufe }) {
  const farbe = { hoch: "bg-green-500", mittel: "bg-amber-500", niedrig: "bg-red-400" }[stufe] || "bg-slate-300";
  return <span className={`inline-block size-2 rounded-full ${farbe}`} title={`Vertrauen ${stufe}`} />;
}
