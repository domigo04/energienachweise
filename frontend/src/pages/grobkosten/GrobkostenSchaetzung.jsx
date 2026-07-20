// Grobkostenschätzung (BKP) — läuft im Projekt, rechnet auf den Referenz-
// projekten der Auswertung. Ausgabe wie ein Norm-Leistungsverzeichnis: jede
// BKP-Einzelposition, gruppiert mit Zwischentotalen und Gesamttotal. Eingaben
// (Wärmeerzeuger/-abgabe als Mehrfach-Auswahl, wie in der Auswertung) und
// Ergebnis bleiben pro Projekt gespeichert.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, Calculator, Check, ChevronRight, Database,
  FileSpreadsheet, FileText, ListChecks, Pencil, RefreshCw, RotateCcw, X,
} from "lucide-react";
import {
  bauindexAutomatischAktualisieren, getBauindex, getProject,
  gkProjektExportExcel, gkProjektExportPdf, gkProjektGet, gkProjektSave,
} from "../../api/hcApi";
import CheckboxGruppe from "../../components/kv/CheckboxGruppe";
import InfoTip from "../../components/ui/InfoTip";
import PageHeader from "../../components/ui/PageHeader";
import GewerkLeiste from "../../components/ui/GewerkLeiste";
import { WAERMEABGABE, WAERMEERZEUGER, ZERTIFIZIERUNGEN } from "../../data/kv";
import { chf, gruppeInfo, num, NUTZUNGEN, PROJEKTARTEN } from "../../data/gk";

const LEER = {
  ebf_m2: "", leistung_kw: "", anzahl_ne: "", nutzung: "MFH", projektart: "Neubau", zertifizierung: "",
  waermeerzeuger: ["Erdsonden-WP"], waermeabgabe: ["FBH"],
  bww_bei_heizung: false, baupreisindex_beruecksichtigen: false,
  weiterbetrieb_umbau: false, etappierung: false,
  rohrmeter: "", bohrmeter: "", hk_anzahl: "",
  manuelle_betraege: {}, ignorierte_warnungen: [],
};

const ERKL = {
  kennwert: "Aus den Referenzprojekten mit tatsächlicher Kostenangabe gewichteter Preis pro Bezugsgrösse dieser Position (CHF pro Bohrmeter / kW / m² EBF / Heizkörper). Fehlende Angaben werden nicht als 0 CHF gerechnet.",
  vertrauen: "Wie viele der passenden Referenzprojekte diese Position überhaupt hatten. Viele → verlässlich (hoch), wenige → vorsichtig sein.",
  baupreisindex: "Skaliert die Kosten jedes Referenzprojekts auf das heutige Preisniveau, bevor gerechnet wird (heutiger Index ÷ Index zum Zeitpunkt des Referenzprojekts). Ohne hinterlegte Indexwerte hat das Häkchen keine Wirkung.",
  bww: "Ist das Brauchwarmwasser Teil der Heizungs-Kosten (Schnittstelle bei der Heizung) oder läuft es beim Sanitär? Weiches Kriterium: Referenzen mit anderer Schnittstelle bleiben brauchbar, zählen nur etwas weniger.",
  zertifizierung: "Gebäude-Standard (Minergie usw.). Referenzen mit gleicher Zertifizierung zählen bei der Ähnlichkeit mehr — höhere Standards treiben die Kosten. Weiches Kriterium, kein Ausschluss.",
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
  const [betragBearbeiten, setBetragBearbeiten] = useState(null);
  const [exportLaedt, setExportLaedt] = useState("");
  const timer = useRef(null);
  const autoRechnenUeberspringen = useRef(false);

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

  // Wärmeabgabe ist Pflicht (Dominic 2026-07-19): sie bestimmt, welche Kosten
  // übernommen werden — ohne sie ist keine sinnvolle Schätzung möglich.
  const gueltig = zahl(form.ebf_m2) > 0 && zahl(form.leistung_kw) > 0
    && zahl(form.anzahl_ne) > 0 && (form.waermeerzeuger?.length > 0)
    && (form.waermeabgabe?.length > 0);

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
    if (autoRechnenUeberspringen.current) {
      autoRechnenUeberspringen.current = false;
      return;
    }
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
  const allePositionen = aktiv?.gruppen.flatMap((g) => g.positionen) || [];
  const positionenOhneAngabe = allePositionen.filter((p) => p.betrag == null);
  const ignorierteWarnungen = new Set(form.ignorierte_warnungen || []);
  const manuellePositionen = allePositionen.filter((p) => p.quelle === "manuell");
  const schwachePositionen = allePositionen.filter((p) =>
    p.quelle !== "manuell" && p.betrag != null && p.mit_kostenangabe <= 3
  );
  const belastbarePositionen = allePositionen.filter((p) =>
    p.quelle !== "manuell" && p.betrag != null && p.mit_kostenangabe > 3
  );
  const offenePruefungen = [...positionenOhneAngabe, ...schwachePositionen].filter((p) =>
    !ignorierteWarnungen.has(`position:${p.bkp_nr}:datenbasis`)
  );
  const naechstePruefungOeffnen = () => {
    const bkpNr = offenePruefungen[0]?.bkp_nr;
    if (!bkpNr) return;
    setOffen(bkpNr);
    setTimeout(() => document.getElementById(`bkp-${bkpNr}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const warnungIgnorieren = (warnungId) => setForm((f) => ({
    ...f,
    ignorierte_warnungen: [...new Set([...(f.ignorierte_warnungen || []), warnungId])],
  }));
  const warnungWiederherstellen = (warnungId) => setForm((f) => ({
    ...f,
    ignorierte_warnungen: (f.ignorierte_warnungen || []).filter((x) => x !== warnungId),
  }));
  const manuellenBetragSetzen = (bkpNr, wert) => {
    const alle = { ...(form.manuelle_betraege || {}) };
    const aktuell = { ...(alle[variante] || {}) };
    if (wert === "") delete aktuell[bkpNr];
    else aktuell[bkpNr] = wert;
    alle[variante] = aktuell;
    const neu = { ...form, manuelle_betraege: alle };
    clearTimeout(timer.current);
    autoRechnenUeberspringen.current = true;
    setForm(neu);
    rechnen(neu);
  };

  const exportieren = async (format) => {
    setExportLaedt(format);
    setFehler("");
    try {
      const blob = format === "pdf"
        ? await gkProjektExportPdf(id, variante)
        : await gkProjektExportExcel(id, variante);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const projektName = (projekt?.name || "Projekt").replace(/[^A-Za-z0-9_-]+/g, "_");
      a.download = `${projektName}_Grobkostenschaetzung_${variante}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFehler(err?.response?.data?.detail || `${format.toUpperCase()}-Export fehlgeschlagen.`);
    } finally {
      setExportLaedt("");
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        back={{ to: `/projekte/${id}`, label: projekt?.name || "Projekt" }}
        title="Grobkostenschätzung"
        subtitle={
          <>
            Schätzung je BKP-Position aus den Referenzprojekten der{" "}
            <Link to="/auswertung" className="text-brand-600 hover:underline">Auswertung</Link> —
            aufgebaut wie ein Norm-Leistungsverzeichnis. Eingaben und Ergebnis bleiben im Projekt gespeichert.
          </>
        }
      />

      <GewerkLeiste aktiv="heizung" className="mb-6" />

      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Eingabe ── (klebt nur auf dem Desktop, wo sie alleine in ihrer Spalte
            steht — auf dem Handy normal im Fluss, sonst würde sie das Ergebnis überdecken) */}
        <div className="card lg:sticky lg:top-4 p-5">
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
            <Feld label={<span className="inline-flex items-center gap-1">Zertifizierung <InfoTip text={ERKL.zertifizierung} /></span>}>
              <select className="input" value={form.zertifizierung} onChange={(e) => set("zertifizierung", e.target.value)}>
                <option value="">—</option>
                {ZERTIFIZIERUNGEN.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </Feld>
          </div>

          <div className="mt-3">
            <CheckboxGruppe label="Wärmeerzeuger" options={WAERMEERZEUGER} value={form.waermeerzeuger} onChange={(v) => set("waermeerzeuger", v)} />
          </div>
          <div className="mt-3">
            <CheckboxGruppe label="Wärmeabgabe *" options={WAERMEABGABE} value={form.waermeabgabe} onChange={(v) => set("waermeabgabe", v)} />
            <p className="mt-1 text-xs text-slate-400">
              Pflicht — es werden nur die Kosten der hier gewählten Abgabesysteme übernommen.
            </p>
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
              zugehörigen Positionen direkt mit deiner Zahl.
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
            <div className="card border-red-200 bg-red-50/60 px-5 py-5">
              <h3 className="text-sm font-bold text-slate-800">Keine passenden Referenzprojekte gefunden</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Damit eine Referenz zählt, müssen <b>Nutzung</b> (z.B. MFH), <b>Wärmeerzeuger-Kombination</b>,
                <b> Projektart</b> und <b>Erdsonden ja/nein</b> exakt übereinstimmen. In der Auswertung gibt
                es dafür noch kein Projekt, das alle Merkmale gleichzeitig erfüllt.
              </p>
              {aktiv.referenzfilter && (
                <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
                  {[
                    ["Nutzung", aktiv.referenzfilter.nutzung],
                    ["Wärmeerzeuger", aktiv.referenzfilter.waermeerzeuger],
                    ["Projektart", aktiv.referenzfilter.projektart],
                    ["Erdsonden", aktiv.referenzfilter.erdsonden],
                  ].map(([label, anzahl]) => (
                    <div key={label} className={`flex justify-between rounded border px-2.5 py-1.5 ${anzahl > 0
                      ? "border-slate-200 bg-white text-slate-600"
                      : "border-red-200 bg-red-100/60 text-red-800"}`}>
                      <span>{label} passend</span><b>{anzahl} / {aktiv.referenzfilter.gesamt}</b>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Die Zählungen gelten je Merkmal einzeln. Erfasse eine passende Referenz oder ergänze die Beträge manuell.
              </p>
              <Link to="/auswertung" className="btn-secondary mt-3"><Database className="size-4" /> Zur Auswertung</Link>
            </div>
          )}

          {aktiv && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Exportiert wird die aktuell gewählte {variante}-Variante inklusive manueller Beträge.</p>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={!!exportLaedt || laden} onClick={() => exportieren("pdf")}>
                    <FileText className="size-4" /> {exportLaedt === "pdf" ? "PDF wird erstellt…" : "PDF"}
                  </button>
                  <button type="button" className="btn-secondary" disabled={!!exportLaedt || laden} onClick={() => exportieren("excel")}>
                    <FileSpreadsheet className="size-4" /> {exportLaedt === "excel" ? "Excel wird erstellt…" : "Excel"}
                  </button>
                </div>
              </div>
              {positionenOhneAngabe.length > 0 && !ignorierteWarnungen.has("gesamt:unvollstaendig") && (
                <div className="card flex items-start gap-2 border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <span className="flex-1">
                    <b>Schätzung unvollständig:</b> für {positionenOhneAngabe.length} Position{positionenOhneAngabe.length > 1 ? "en" : ""} ({positionenOhneAngabe.map((p) => p.bkp_nr).join(", ")})
                    {" "}gibt es keine passende Referenz mit Kostenangabe — sie fehlen im Total und müssen manuell geschätzt werden.
                  </span>
                  <button type="button" className="shrink-0 text-xs font-semibold hover:underline"
                    onClick={() => warnungIgnorieren("gesamt:unvollstaendig")}>Hinweis ausblenden</button>
                </div>
              )}
              {positionenOhneAngabe.length > 0 && ignorierteWarnungen.has("gesamt:unvollstaendig") && (
                <button type="button" onClick={() => warnungWiederherstellen("gesamt:unvollstaendig")}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                  <RotateCcw className="size-3" /> Ausgeblendeten Hinweis wieder anzeigen
                </button>
              )}

              {/* Kopf: Gesamt + Brutto/Netto-Umschalter + Datenbasis */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="card px-5 py-4">
                  <div className="text-xs font-medium text-slate-400">
                    {aktiv.ist_unvollstaendig ? "Teilbetrag bekannte Positionen" : "Gesamtschätzung"} ({variante})
                  </div>
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
                    {aktiv.referenzen_im_segment} <span className="text-sm font-normal text-slate-400">passende im Segment</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{aktiv.referenzen_gefunden} davon unten in der Übersicht</div>
                  {aktiv.korrekturfaktoren?.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-amber-700">Korrektur: {aktiv.korrekturfaktoren.join(" · ")}</div>
                  )}
                </div>
              </div>

              {/* Arbeitsstand: macht aus Warnungen eine abarbeitbare Prüfliste. */}
              <div className="card px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-auto flex items-center gap-2">
                    <ListChecks className="size-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Prüfstand</span>
                  </div>
                  <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">{belastbarePositionen.length} belastbar</span>
                  <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{schwachePositionen.length} prüfen</span>
                  <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{positionenOhneAngabe.length} fehlen</span>
                  <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{manuellePositionen.length} manuell</span>
                  {offenePruefungen.length > 0 ? (
                    <button type="button" className="btn-secondary ml-1" onClick={naechstePruefungOeffnen}>
                      Nächste offene Position
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <Check className="size-3.5" /> Alle Hinweise bearbeitet
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  „Prüfen“ bedeutet höchstens drei verwendbare Kostenangaben. Ignorierte Hinweise gelten als bearbeitet.
                </p>
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
                        <GruppenBlock key={g.gruppe_nr} g={g} projektId={id}
                          variante={variante} offen={offen} setOffen={setOffen}
                          betragBearbeiten={betragBearbeiten} setBetragBearbeiten={setBetragBearbeiten}
                          manuelleBetraege={form.manuelle_betraege?.[variante] || {}}
                          manuellenBetragSetzen={manuellenBetragSetzen}
                          ignorierteWarnungen={ignorierteWarnungen}
                          warnungIgnorieren={warnungIgnorieren}
                          warnungWiederherstellen={warnungWiederherstellen} />
                      ))}
                      <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                        <td className="px-4 py-3" colSpan={3}>
                          {positionenOhneAngabe.length > 0 ? "Teilbetrag BKP 24 – bekannte Positionen" : "Total BKP 24 Heizungsanlage"}
                          {positionenOhneAngabe.length > 0 && <span className="ml-2 text-xs font-normal text-red-700">(kein Gesamttotal)</span>}
                        </td>
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
              {refsVerwendet.length > 0 && <div className="card px-5 py-4">
                <h3 className="mb-2 text-sm font-bold text-slate-800">Ähnlichste Referenzprojekte (Übersicht)</h3>
                <div className="divide-y divide-slate-50">
                  {refsVerwendet.map((r) => (
                    <div key={r.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm">
                      <Link
                        to={`/auswertung/${r.id}`}
                        state={{ zurueck: { to: `/projekte/${id}/kostenschaetzung`, label: "Grobkostenschätzung" } }}
                        className="font-medium text-slate-800 hover:text-brand-600 hover:underline"
                      >
                        {ohnePrefix(r.name)}
                      </Link>
                      <span className="text-xs text-slate-400">
                        {r.datum_abrechnung?.slice(0, 4) || "ohne Datum"} · {r.nutzung} · {num(r.ebf_m2)} m² · {num(r.leistung_kw)} kW
                        {r.index_faktor != null ? ` · Index ×${num(r.index_faktor, 2)}` : ""}
                      </span>
                      {r.abgabe_mischsystem && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700" title="Mischsystem — nur die Kosten deiner gewählten Wärmeabgabe wurden übernommen; der CHF/m² kann verzerrt sein, weil die Fläche geteilt ist.">
                          <AlertTriangle className="size-3" /> Mischsystem
                        </span>
                      )}
                      {!r.abgabe_mischsystem && r.abgabe_abweichend && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700" title="Andere Wärmeabgabe als dein Projekt. Für gemeinsame Positionen darf das Projekt zählen; dort wird die Abgabe im Positionsgewicht nicht berücksichtigt.">
                          <AlertTriangle className="size-3" /> andere Abgabe
                        </span>
                      )}
                      <span className="ml-auto text-xs font-semibold tabular-nums text-slate-600">Gewicht {num(r.rang * 100)} %</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-snug text-slate-400">
                  Diese Liste dient der Orientierung. Für jede BKP-Position wird im Detail separat gewichtet:
                  gemeinsame Positionen ohne Einfluss der Wärmeabgabe, Abgabepositionen nur aus fachlich
                  passenden Projekten. Aktualität reduziert das Gewicht nur mild.
                </p>
              </div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GruppenBlock({
  g, projektId, variante, offen, setOffen, manuelleBetraege,
  betragBearbeiten, setBetragBearbeiten,
  manuellenBetragSetzen, ignorierteWarnungen, warnungIgnorieren, warnungWiederherstellen,
}) {
  const info = gruppeInfo(g.gruppe_nr);
  const quercheckId = `gruppe:${g.gruppe_nr}:quercheck`;
  const quercheckIgnoriert = ignorierteWarnungen.has(quercheckId);
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
      {g.quercheck_einheit?.warnung && !quercheckIgnoriert && (
        <tr className="bg-amber-50/60">
          <td />
          <td colSpan={4} className="px-2 py-1.5 text-xs leading-snug text-amber-800">
            <span className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="flex-1">
                CHF/m² und CHF/Einheit weichen stark voneinander ab — pro m² ergibt die Wärmeverteilung{" "}
                <b>{chf(g.quercheck_einheit.betrag_flaeche)}</b>, hochgerechnet pro Wohnung dagegen{" "}
                <b>{chf(g.quercheck_einheit.betrag_einheit)}</b>{" "}
                ({num(g.quercheck_einheit.chf_pro_einheit)} CHF/Einheit). Zahl prüfen — evtl. ein Ausreisser.
              </span>
              <button type="button" className="font-semibold hover:underline"
                onClick={() => warnungIgnorieren(quercheckId)}>Ignorieren</button>
            </span>
          </td>
        </tr>
      )}
      {g.quercheck_einheit?.warnung && quercheckIgnoriert && (
        <tr className="bg-slate-50/60">
          <td />
          <td colSpan={4} className="px-2 py-1 text-xs text-slate-400">
            CHF/Einheit-Warnung ignoriert.{" "}
            <button type="button" className="font-medium hover:underline"
              onClick={() => warnungWiederherstellen(quercheckId)}>Wieder anzeigen</button>
          </td>
        </tr>
      )}
      {g.positionen.map((p) => {
        const hasBetrag = p.betrag != null;
        const hatBerechnung = p.berechneter_betrag != null;
        const keineAngaben = p.status_datenbasis === "Keine Angaben";
        const key = p.bkp_nr;
        const auf = offen === key;
        const warnungId = `position:${key}:datenbasis`;
        const warnungIgnoriert = ignorierteWarnungen.has(warnungId);
        const hatWarnung = keineAngaben || p.mit_kostenangabe <= 3;
        return (
          <Fragment key={key}>
            <tr id={`bkp-${key}`} onClick={() => setOffen(auf ? null : key)}
              className="cursor-pointer border-t border-slate-50 hover:bg-slate-50/70">
              <td className="py-1.5 pl-8 pr-2 tabular-nums text-slate-500">{p.bkp_nr}</td>
              <td className={"px-2 py-1.5 " + (hasBetrag ? "text-slate-700" : "text-slate-400")}>
                {p.bezeichnung}
                {p.quelle === "manuell" && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">manuell</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                {hatBerechnung ? `${num(p.kennwert)} ${p.einheit}` : "–"}
              </td>
              <td className={"px-2 py-1.5 text-right font-medium tabular-nums " + (hasBetrag ? "text-slate-900" : "text-red-700")}>
                <span className="inline-flex items-center justify-end gap-1.5">
                  <span>{hasBetrag ? chf(p.betrag) : "Keine Angaben"}</span>
                  <button type="button" title="Betrag bearbeiten"
                    className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOffen(key);
                      setBetragBearbeiten(key);
                    }}>
                    <Pencil className="size-3.5" />
                  </button>
                </span>
              </td>
              <td className="px-2 py-1.5">
                <span className="inline-flex items-center gap-1">
                  {hatWarnung && !warnungIgnoriert
                    ? <AlertTriangle className={`size-3.5 ${keineAngaben ? "text-red-500" : "text-amber-500"}`} title={p.status_datenbasis} />
                    : <VertrauenPunkt stufe={p.vertrauen} />}
                  <ChevronRight className={`size-3.5 text-slate-300 transition ${auf ? "rotate-90" : ""}`} />
                </span>
              </td>
            </tr>
            {auf && (
              <tr className="bg-slate-50/50">
                <td />
                <td colSpan={4} className="px-2 py-2 text-xs leading-relaxed text-slate-600">
                  {keineAngaben ? (
                    <div className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 ${warnungIgnoriert
                      ? "border-slate-200 bg-slate-50 text-slate-500"
                      : "border-red-200 bg-red-50 text-red-800"}`}>
                      {!warnungIgnoriert && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                      <span className="flex-1">
                        Keine passende Referenz mit einer Kostenangabe gefunden. Von {p.grundsegment} grundsätzlich
                        passenden Projekten {p.passende_abgabe < p.grundsegment
                          ? <>hatten {p.passende_abgabe} die passende Wärmeabgabe, aber keines</>
                          : <>hat keines</>}
                        {" "}eine Kostenangabe für diese Position. Bitte manuell schätzen.
                      </span>
                      {!warnungIgnoriert && <button type="button" className="shrink-0 font-semibold hover:underline"
                        onClick={() => warnungIgnorieren(warnungId)}>Ignorieren</button>}
                    </div>
                  ) : (
                    <>
                      Ø Kennwert <b>{num(p.kennwert)} {p.einheit}</b> × {num(p.ziel_treiber)}{" "}
                      {p.einheit.replace("CHF/", "")} = <b>{chf(p.berechneter_betrag)}</b>.{" "}
                      Von {p.grundsegment} grundsätzlich passenden Projekten hatten {p.passende_abgabe} die passende
                      Wärmeabgabe, {p.mit_kostenangabe} davon eine Kostenangabe für diese Position
                      ({p.status_datenbasis}).
                      {p.bandbreite && <> Bandbreite {chf(p.bandbreite[0])} – {chf(p.bandbreite[1])}.</>}
                      {p.mit_kostenangabe <= 3 && !warnungIgnoriert && (
                        <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          <span className="flex-1">
                            Diese Position basiert nur auf {p.mit_kostenangabe} Kostenangabe{p.mit_kostenangabe === 1 ? "" : "n"}.
                            Der Kennwert ist statistisch nicht belastbar und muss fachlich geprüft werden.
                          </span>
                          <button type="button" className="shrink-0 font-semibold hover:underline"
                            onClick={() => warnungIgnorieren(warnungId)}>Ignorieren</button>
                        </div>
                      )}
                    </>
                  )}
                  {hatWarnung && warnungIgnoriert && (
                    <div className="mt-1 text-slate-400">
                      Warnung ignoriert. <button type="button" className="font-medium hover:underline"
                        onClick={() => warnungWiederherstellen(warnungId)}>Wieder anzeigen</button>
                    </div>
                  )}

                  <ManuellerBetragEditor
                    key={`${key}-${manuelleBetraege[key] ?? "leer"}`}
                    p={p} variante={variante} wert={manuelleBetraege[key]}
                    autoFocus={betragBearbeiten === key}
                    onSpeichern={(wert) => {
                      manuellenBetragSetzen(key, wert);
                      setBetragBearbeiten(null);
                    }}
                    onBerechnung={() => {
                      manuellenBetragSetzen(key, "");
                      setBetragBearbeiten(null);
                    }}
                    onAbbrechen={() => setBetragBearbeiten(null)}
                  />

                  <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">Herkunft und Projektvergleich – eingerechnete Projekte</div>
                    <table className="w-full min-w-[680px] text-[11px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr><th className="px-3 py-1.5 text-left">Projekt</th><th className="px-2 py-1.5 text-right">Kosten</th>
                          <th className="px-2 py-1.5 text-right">Bezugsgrösse</th><th className="px-2 py-1.5 text-right">Kennwert</th>
                          <th className="px-2 py-1.5 text-right">Gewicht</th><th className="px-3 py-1.5 text-left">Verwendung</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(p.herkunft || []).map((r, index) => (
                          <tr key={`${r.id || r.name}-${index}`} className={r.verwendet ? "text-slate-700" : "text-slate-400"}>
                            <td className="px-3 py-1.5">
                              {r.id ? <Link to={`/auswertung/${r.id}`} state={{ zurueck: { to: `/projekte/${projektId}/kostenschaetzung`, label: "Grobkostenschätzung" } }}
                                className="font-medium hover:text-brand-600 hover:underline">{ohnePrefix(r.name)}</Link> : ohnePrefix(r.name)}
                              <span className="ml-1">({num(r.ebf_m2)} m² / {num(r.leistung_kw)} kW)</span>
                              {(r.waermeerzeuger || []).length > 0 && (
                                <div className="text-[10px] text-slate-400">{r.waermeerzeuger.join(" + ")}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.kosten != null ? chf(r.kosten) : "Keine Angabe"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.treiber_wert != null ? num(r.treiber_wert) : "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.kennwert != null ? `${num(r.kennwert)} ${p.einheit}` : "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{num(r.gewicht * 100)} %</td>
                            <td className="px-3 py-1.5">{r.verwendet ? "eingerechnet" : r.ausschlussgrund}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(p.herkunft || []).length === 0 && <p className="px-3 py-2 text-slate-400">Keine Referenz mit verwendbarer Kostenangabe vorhanden.</p>}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function ManuellerBetragEditor({ p, variante, wert, autoFocus, onSpeichern, onBerechnung, onAbbrechen }) {
  const [eingabe, setEingabe] = useState(wert ?? "");
  const inputRef = useRef(null);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);
  const normalisiert = String(eingabe).replace(/[’'\s]/g, "").replace(",", ".");
  const zahlWert = normalisiert === "" ? null : Number(normalisiert);
  const gueltig = zahlWert != null && Number.isFinite(zahlWert) && zahlWert >= 0;
  const vorschlagEinsetzen = (faktor = 1) => {
    if (p.berechneter_betrag == null) return;
    setEingabe(String(Math.round(p.berechneter_betrag * faktor / 100) * 100));
    inputRef.current?.focus();
  };
  return (
    <form className={`mt-3 rounded-md border p-3 ${autoFocus ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"}`}
      onSubmit={(e) => { e.preventDefault(); if (gueltig) onSpeichern(zahlWert); }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <div>
          <div className="font-semibold text-slate-700">Betrag festlegen ({variante})</div>
          <div className="text-[11px] text-slate-400">
            {p.berechneter_betrag != null
              ? <>Berechneter Vorschlag: <b>{chf(p.berechneter_betrag)}</b></>
              : "Kein berechneter Vorschlag vorhanden."}
          </div>
        </div>
        {p.quelle === "manuell" && <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Manueller Wert aktiv</span>}
      </div>
      {p.berechneter_betrag != null && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-slate-400">Ausgangspunkt:</span>
          <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
            onClick={() => vorschlagEinsetzen(1)}>Vorschlag</button>
          <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
            onClick={() => vorschlagEinsetzen(0.9)}>−10 %</button>
          <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
            onClick={() => vorschlagEinsetzen(1.1)}>+10 %</button>
          <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
            onClick={() => vorschlagEinsetzen(1.2)}>+20 %</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-400">CHF</span>
          <input ref={inputRef} type="text" inputMode="decimal" className="input pl-12 text-right font-semibold tabular-nums"
            value={eingabe} placeholder="z.B. 45'000"
            onChange={(e) => setEingabe(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary" disabled={!gueltig}>
          <Check className="size-4" /> Übernehmen
        </button>
        {p.quelle === "manuell" && (
          <button type="button" className="btn-secondary" onClick={onBerechnung}>
            <RotateCcw className="size-4" /> {p.berechneter_betrag != null ? "Vorschlag verwenden" : "Manuellen Wert entfernen"}
          </button>
        )}
        {autoFocus && <button type="button" className="rounded p-2 text-slate-400 hover:bg-slate-100" title="Abbrechen" onClick={onAbbrechen}><X className="size-4" /></button>}
      </div>
      <p className={`mt-1.5 text-[11px] ${eingabe !== "" && !gueltig ? "text-red-600" : "text-slate-400"}`}>
        {eingabe !== "" && !gueltig
          ? "Bitte einen gültigen CHF-Betrag eingeben. Apostrophe und Leerzeichen sind erlaubt."
          : gueltig
            ? `${chf(zahlWert)} wird mit «Übernehmen» gespeichert und in das Total aufgenommen.`
            : "Betrag eingeben und mit «Übernehmen» in das Total aufnehmen."}
      </p>
    </form>
  );
}

function VertrauenPunkt({ stufe }) {
  // Bei niedrigem Vertrauen ein Warndreieck statt nur Punkt — deutlich sichtbarer
  // (Dominic 2026-07-19), weil ein Einzelfall-Kennwert leicht übersehen wird.
  if (stufe === "niedrig") {
    return <AlertTriangle className="inline size-3.5 text-amber-500" title="Vertrauen niedrig — dünne Datenbasis" />;
  }
  const farbe = { hoch: "bg-green-500", mittel: "bg-amber-500" }[stufe] || "bg-slate-300";
  return <span className={`inline-block size-2 rounded-full ${farbe}`} title={`Vertrauen ${stufe}`} />;
}
