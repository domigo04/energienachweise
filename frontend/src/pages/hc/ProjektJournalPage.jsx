import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, MapPin, Paperclip, Plus, Sparkles, Trash2, X,
} from "lucide-react";
import {
  createProjectNote, deleteProjectNote, getProject, getProjectNotes, updateProjectNote,
} from "../../api/hcApi";

// Projektjournal (Stufe 1, Dominic 2026-07-31).
//
// Ein Zeitstrahl statt einer Ordnerstruktur: Notizen, Sitzungsprotokolle,
// Pendenzen, Entscheide und Abnahmepunkte liegen in EINEM Strang, neueste
// zuerst. Jeder Eintrag trägt seinen Autor; eine fremde Bearbeitung ist am
// Eintrag sichtbar und steht zusätzlich im Änderungsprotokoll.
//
// Ein Eintrag kann eine Stecknadel im Anlagenschema tragen. Gesetzt wird sie
// im Schema-Editor; hier ist sie sichtbar und führt per Klick dorthin.

const ARTEN = [
  { value: "notiz", label: "Notiz", farbe: "bg-slate-100 text-slate-700" },
  { value: "sitzung", label: "Sitzung", farbe: "bg-indigo-100 text-indigo-700" },
  { value: "aufgabe", label: "Pendenz", farbe: "bg-amber-100 text-amber-800" },
  { value: "entscheid", label: "Entscheid", farbe: "bg-emerald-100 text-emerald-700" },
  { value: "abnahme", label: "Abnahme", farbe: "bg-purple-100 text-purple-700" },
];
const ART = Object.fromEntries(ARTEN.map((a) => [a.value, a]));

const zeit = (iso) => (iso
  ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
  : "");
const tag = (iso) => (iso
  ? new Intl.DateTimeFormat("de-CH", { dateStyle: "long" }).format(new Date(iso))
  : "");

// Checkboxen im Text sind die Pendenzen innerhalb eines Eintrags: eine Zeile
// «- [ ] …» ist offen, «- [x] …» erledigt. Bewusst Markdown und kein eigener
// Blockeditor — man schreibt durch und das System liest die Punkte heraus.
const punkteAusText = (text) => (text || "").split("\n")
  .map((zeile) => zeile.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/))
  .filter(Boolean)
  .map((m) => ({ erledigt: m[1].toLowerCase() === "x", text: m[2].trim() }));

export default function ProjektJournalPage() {
  const { id } = useParams();
  const [projekt, setProjekt] = useState(null);
  const [notizen, setNotizen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState("");
  const [filter, setFilter] = useState("alle");
  const [entwurf, setEntwurf] = useState(null);   // { kind, titel, text, faellig_am }
  const [bearbeite, setBearbeite] = useState(null); // { id, titel, text }

  const laden_ = async () => {
    try {
      const [p, n] = await Promise.all([getProject(id), getProjectNotes(id)]);
      setProjekt(p);
      setNotizen(n.notizen || []);
    } catch {
      setFehler("Journal konnte nicht geladen werden");
    } finally {
      setLaden(false);
    }
  };
  useEffect(() => { laden_(); }, [id]);

  const sichtbar = useMemo(() => {
    if (filter === "offen") return notizen.filter((n) => !n.erledigt);
    if (filter === "nadel") return notizen.filter((n) => n.pin);
    if (filter === "alle") return notizen;
    return notizen.filter((n) => n.kind === filter);
  }, [notizen, filter]);

  const offenePunkte = useMemo(() => notizen
    .filter((n) => !n.erledigt && (n.kind === "aufgabe" || n.faellig_am))
    .sort((a, b) => (a.faellig_am || "9999").localeCompare(b.faellig_am || "9999")), [notizen]);

  const anlegen = async () => {
    if (!entwurf?.titel?.trim() && !entwurf?.text?.trim()) return;
    try {
      const neu = await createProjectNote(id, {
        kind: entwurf.kind, titel: entwurf.titel || "", text: entwurf.text || "",
        faellig_am: entwurf.faellig_am || null,
      });
      setNotizen((liste) => [neu, ...liste]);
      setEntwurf(null);
    } catch { setFehler("Eintrag konnte nicht gespeichert werden"); }
  };

  const aendern = async (noteId, patch) => {
    try {
      const neu = await updateProjectNote(id, noteId, patch);
      setNotizen((liste) => liste.map((n) => (n.id === noteId ? neu : n)));
      return neu;
    } catch { setFehler("Änderung konnte nicht gespeichert werden"); return null; }
  };

  const entfernen = async (noteId) => {
    if (!window.confirm("Diesen Eintrag löschen? Das Änderungsprotokoll behält den Vorgang.")) return;
    try {
      await deleteProjectNote(id, noteId);
      setNotizen((liste) => liste.filter((n) => n.id !== noteId));
    } catch { setFehler("Eintrag konnte nicht gelöscht werden"); }
  };

  if (laden) return <div className="p-8 text-sm text-slate-400">Journal wird geladen…</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:py-8 lg:px-8">
      <Link to={`/projekte/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> {projekt?.name || "Projekt"}
      </Link>

      {fehler && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {fehler}
          <button onClick={() => setFehler("")}><X className="size-4" /></button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dokumentation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Notizen, Sitzungsprotokolle und Pendenzen im Zeitstrahl. Jeder Eintrag
            trägt seinen Autor; Stecknadeln verknüpfen ihn mit einer Stelle im Schema.
          </p>
        </div>
        <button onClick={() => setEntwurf({ kind: "notiz", titel: "", text: "", faellig_am: "" })}
          className="btn-primary"><Plus className="size-4" /> Neuer Eintrag</button>
      </div>

      {/* Offene Punkte zuerst — das ist die Frage, die man beim Öffnen hat. */}
      {offenePunkte.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Offene Punkte <span className="text-slate-400">({offenePunkte.length})</span>
          </h2>
          <div className="space-y-2">
            {offenePunkte.map((n) => (
              <label key={n.id} className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600"
                  checked={false} onChange={() => aendern(n.id, { erledigt: true })} />
                <span className="min-w-0 flex-1">
                  <span className="text-slate-800">{n.titel || "(ohne Titel)"}</span>
                  {n.faellig_am && (
                    <span className="ml-2 text-xs text-amber-700">bis {tag(n.faellig_am)}</span>
                  )}
                  <span className="ml-2 text-xs text-slate-400">· {n.autor_name}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[{ value: "alle", label: "Alle" }, { value: "offen", label: "Offen" },
          { value: "nadel", label: "Mit Stecknadel" }, ...ARTEN].map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === f.value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Entwurf */}
      {entwurf && (
        <section className="card mb-5 p-5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ARTEN.map((a) => (
              <button key={a.value} onClick={() => setEntwurf((e) => ({ ...e, kind: a.value }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  entwurf.kind === a.value ? "bg-slate-800 text-white" : a.farbe}`}>
                {a.label}
              </button>
            ))}
          </div>
          <input className="input mb-2" autoFocus placeholder="Titel, z.B. «Bauherrensitzung vom 12.3.»"
            value={entwurf.titel} onChange={(e) => setEntwurf((x) => ({ ...x, titel: e.target.value }))} />
          <textarea className="input min-h-32 font-mono text-sm" placeholder={"Text. Offene Punkte als Liste:\n- [ ] Offerte Lüftung einholen\n- [x] Schema an Bauherr geschickt"}
            value={entwurf.text} onChange={(e) => setEntwurf((x) => ({ ...x, text: e.target.value }))} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-slate-500">Fällig bis
              <input type="date" className="input ml-2 inline-block w-auto py-1"
                value={entwurf.faellig_am || ""}
                onChange={(e) => setEntwurf((x) => ({ ...x, faellig_am: e.target.value }))} />
            </label>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setEntwurf(null)} className="btn-secondary">Abbrechen</button>
              <button onClick={anlegen} className="btn-primary">Speichern</button>
            </div>
          </div>
        </section>
      )}

      {/* Zeitstrahl */}
      <section className="relative">
        <div className="absolute bottom-2 left-[15px] top-2 hidden w-px bg-slate-200 sm:block" />
        <div className="space-y-3">
          {sichtbar.map((n) => {
            const art = ART[n.kind] || ART.notiz;
            const punkte = punkteAusText(n.text);
            const inBearbeitung = bearbeite?.id === n.id;
            return (
              <article key={n.id} className="relative sm:pl-10">
                <span className="absolute left-2.5 top-5 hidden size-2 rounded-full bg-slate-300 ring-4 ring-white sm:block" />
                <div className={`card p-4 ${n.erledigt ? "opacity-60" : ""}`}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${art.farbe}`}>
                      {art.label}
                    </span>
                    {n.pin && (
                      <Link to={`/projekte/${id}/schema?notiz=${n.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-200"
                        title="Im Anlagenschema zeigen">
                        <MapPin className="size-3" /> im Schema
                      </Link>
                    )}
                    {n.faellig_am && !n.erledigt && (
                      <span className="text-[11px] font-semibold text-amber-700">bis {tag(n.faellig_am)}</span>
                    )}
                    <time className="ml-auto text-[11px] tabular-nums text-slate-400">{zeit(n.created_at)}</time>
                  </div>

                  {inBearbeitung ? (
                    <>
                      <input className="input mb-2" value={bearbeite.titel}
                        onChange={(e) => setBearbeite((b) => ({ ...b, titel: e.target.value }))} />
                      <textarea className="input min-h-28 font-mono text-sm" value={bearbeite.text}
                        onChange={(e) => setBearbeite((b) => ({ ...b, text: e.target.value }))} />
                      <div className="mt-2 flex justify-end gap-2">
                        <button className="btn-secondary" onClick={() => setBearbeite(null)}>Abbrechen</button>
                        <button className="btn-primary" onClick={async () => {
                          await aendern(n.id, { titel: bearbeite.titel, text: bearbeite.text });
                          setBearbeite(null);
                        }}>Speichern</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="font-semibold text-slate-900">{n.titel || "(ohne Titel)"}</h3>
                      {n.text && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{n.text}</p>
                      )}
                      {punkte.length > 0 && (
                        <div className="mt-2 text-xs text-slate-500">
                          {punkte.filter((p) => p.erledigt).length}/{punkte.length} Punkte erledigt
                        </div>
                      )}
                    </>
                  )}

                  {/* Autorenspur: der Verfasser bleibt immer stehen, eine fremde
                      Bearbeitung kommt zusätzlich dazu. */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                    <span><strong className="font-semibold text-slate-500">{n.autor_name || "Unbekannt"}</strong> hat den Eintrag erstellt</span>
                    {n.bearbeitet_at && (
                      <span>· zuletzt bearbeitet von <strong className="font-semibold text-slate-500">{n.bearbeitet_von_name}</strong> am {zeit(n.bearbeitet_at)}</span>
                    )}
                    {n.erledigt && n.erledigt_von_name && (
                      <span>· erledigt von {n.erledigt_von_name}</span>
                    )}
                    <span className="ml-auto flex gap-2">
                      <button className="hover:text-slate-700"
                        onClick={() => aendern(n.id, { erledigt: !n.erledigt })}>
                        {n.erledigt ? "wieder öffnen" : "erledigt"}
                      </button>
                      {!inBearbeitung && (
                        <button className="hover:text-slate-700"
                          onClick={() => setBearbeite({ id: n.id, titel: n.titel, text: n.text })}>
                          bearbeiten
                        </button>
                      )}
                      <button className="text-slate-400 hover:text-red-500" onClick={() => entfernen(n.id)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
          {sichtbar.length === 0 && (
            <div className="card p-8 text-center text-sm text-slate-400">
              {notizen.length === 0
                ? "Noch kein Eintrag. Der erste kann eine Sitzungsnotiz oder eine Pendenz sein."
                : "Kein Eintrag für diesen Filter."}
            </div>
          )}
        </div>
      </section>

      {/* Was als Nächstes kommt — bewusst sichtbar, aber noch ohne Funktion,
          damit die Richtung erkennbar ist (Dominic 2026-07-31). */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Paperclip className="size-4" /> Dokumente · geplant
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Datenblätter, Fotos und Offerten hängen später direkt am Eintrag —
            Datenblatt einer Wärmepumpe beim Entscheid, Mängelfoto beim
            Abnahmepunkt. Die Ablage dafür ist noch nicht eingerichtet.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Sparkles className="size-4" /> KI-Unterstützung · geplant
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Rohnotizen zu einem sauberen Sitzungsprotokoll, Kennwerte aus einem
            Datenblatt als Vorschlag ins Projekt, Abnahmeprotokoll aus Schema und
            offenen Punkten. Vorschläge bleiben immer bestätigungspflichtig.
          </p>
        </div>
      </section>
    </div>
  );
}
