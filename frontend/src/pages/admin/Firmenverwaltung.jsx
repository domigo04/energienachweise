import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  FolderKanban,
  ShieldCheck,
  UserCheck,
  UserRoundCheck,
  UserX,
} from "lucide-react";
import {
  getFirmaAdminOverview,
  updateFirmaMember,
  updateProjektVerantwortlicher,
} from "../../api/hcApi";

const TABS = [
  ["uebersicht", "Übersicht"],
  ["mitglieder", "Mitarbeitende"],
  ["projekte", "Projekte"],
  ["protokoll", "Protokoll"],
];

const ACTION_LABELS = {
  projekt_erstellt: "Projekt erstellt",
  projekt_aktualisiert: "Projekt aktualisiert",
  projekt_archiviert: "Projekt archiviert",
  projekt_endgueltig_geloescht: "Projekt endgültig gelöscht",
  archivierte_projekte_geloescht: "Archivierte Projekte gelöscht",
  projektverantwortung_geaendert: "Projektverantwortung geändert",
  firmenmitglied_aktualisiert: "Firmenmitglied geändert",
  plattformadmin_benutzer_aktualisiert: "Benutzer durch Plattformadmin geändert",
  firma_aktualisiert: "Firma geändert",
  firmenadmin_beantragt: "Firmenadmin beantragt",
  eigenes_profil_aktualisiert: "Eigenes Profil geändert",
  kostenschaetzung_gespeichert: "Kostenschätzung gespeichert",
  kostenschaetzung_status_geaendert: "Status der Kostenschätzung geändert",
  schema_stand_gespeichert: "Schema-Stand gespeichert",
  schema_stand_wiederhergestellt: "Schema-Stand wiederhergestellt",
};

const fmtDate = (value) => value
  ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Noch nie";

function StatCard({ icon: Icon, label, value, tone = "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function MemberCard({ member, onPatch, busy }) {
  const label = member.name || member.email;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{label}</div>
          <div className="truncate text-xs text-slate-500">{member.email}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!member.is_verified && <span className="badge bg-amber-100 text-amber-800">Freigabe offen</span>}
            {!member.is_active && <span className="badge bg-slate-100 text-slate-600">Deaktiviert</span>}
            {member.firma_role === "admin" && <span className="badge bg-blue-50 text-blue-700">Firmenadmin</span>}
            {member.role === "admin" && <span className="badge bg-brand-50 text-brand-700">Plattformadmin</span>}
          </div>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">
          {label.slice(0, 1).toUpperCase()}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-xs">
        <div><dt className="text-slate-400">Erstellt</dt><dd className="mt-0.5 text-slate-700">{fmtDate(member.created_at)}</dd></div>
        <div><dt className="text-slate-400">Letzter Login</dt><dd className="mt-0.5 text-slate-700">{fmtDate(member.last_login_at)}</dd></div>
      </dl>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {member.role === "admin" ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
            Plattformadmins werden in der Plattform-Administration verwaltet.
          </div>
        ) : !member.is_verified ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch(member.id, { is_verified: true, is_active: true })}
            className="btn-primary flex-1 justify-center"
          >
            <CheckCircle2 className="size-4" /> Freischalten
          </button>
        ) : (
          <>
            <select
              className="input min-h-10 flex-1 py-2 text-sm"
              value={member.firma_role}
              disabled={busy || !member.is_active}
              onChange={(event) => onPatch(member.id, { firma_role: event.target.value })}
              aria-label={`Rolle von ${label}`}
            >
              <option value="mitglied">Mitglied</option>
              <option value="admin">Firmenadmin</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch(member.id, { is_active: !member.is_active })}
              className={`btn-secondary justify-center ${member.is_active ? "text-red-600" : "text-emerald-700"}`}
            >
              {member.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
              {member.is_active ? "Deaktivieren" : "Aktivieren"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function activityDescription(event) {
  const details = event.details || {};
  if (event.action === "projektverantwortung_geaendert") {
    return `${details.vorher?.name || "Nicht zugewiesen"} → ${details.nachher?.name || "Nicht zugewiesen"}`;
  }
  if (event.action === "firmenmitglied_aktualisiert" || event.action === "plattformadmin_benutzer_aktualisiert") {
    return details.benutzer || "Benutzerkonto";
  }
  if (details.projekt) return details.projekt;
  if (details.bezeichnung) return details.bezeichnung;
  if (details.anzahl) return `${details.anzahl} Einträge`;
  return event.project_name || event.entity_type || "Änderung";
}

export default function Firmenverwaltung() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("uebersicht");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = () => getFirmaAdminOverview()
    .then(setData)
    .catch((err) => setError(err?.response?.status === 403
      ? "Du benötigst Firmenadminrechte für diesen Bereich."
      : "Firmenverwaltung konnte nicht geladen werden."))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const aktiveMitglieder = useMemo(
    () => (data?.mitglieder || []).filter((member) => member.is_active && member.is_verified),
    [data],
  );

  const patchMember = async (id, patch) => {
    setBusy(`member-${id}`);
    setError("");
    try {
      const updated = await updateFirmaMember(id, patch);
      setData((current) => ({
        ...current,
        mitglieder: current.mitglieder.map((member) => member.id === id ? updated : member),
        kennzahlen: {
          ...current.kennzahlen,
          aktive_mitglieder: current.mitglieder.filter((member) => {
            const value = member.id === id ? updated : member;
            return value.is_active && value.is_verified;
          }).length,
          offene_registrierungen: current.mitglieder.filter((member) => {
            const value = member.id === id ? updated : member;
            return !value.is_verified;
          }).length,
          firmenadmins: current.mitglieder.filter((member) => {
            const value = member.id === id ? updated : member;
            return value.firma_role === "admin" && value.is_active;
          }).length,
        },
      }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Änderung konnte nicht gespeichert werden.");
    } finally {
      setBusy(null);
    }
  };

  const assignProject = async (projectId, value) => {
    setBusy(`project-${projectId}`);
    setError("");
    try {
      const updated = await updateProjektVerantwortlicher(projectId, value ? Number(value) : null);
      setData((current) => ({
        ...current,
        projekte: current.projekte.map((project) => project.id === projectId ? updated : project),
      }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Projektverantwortung konnte nicht gespeichert werden.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-400">Firmenverwaltung wird geladen…</div>;
  if (!data) return <div className="mx-auto max-w-6xl p-8 text-sm text-red-700">{error}</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">
            <Building2 className="size-4" /> Firmenverwaltung
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{data.firma.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Mitglieder, Verantwortungen und Änderungen zentral verwalten.</p>
        </div>
        <span className="badge w-fit bg-slate-100 px-3 py-1.5 text-slate-600">Plan: {data.firma.abo_plan}</span>
      </header>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 overflow-x-auto border-b border-slate-200">
        <nav className="flex min-w-max gap-1" aria-label="Firmenverwaltung">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "uebersicht" && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard icon={UserCheck} label="Aktive Mitglieder" value={data.kennzahlen.aktive_mitglieder} tone="green" />
            <StatCard icon={ShieldCheck} label="Firmenadmins" value={data.kennzahlen.firmenadmins} tone="blue" />
            <StatCard icon={UserRoundCheck} label="Freigaben offen" value={data.kennzahlen.offene_registrierungen} tone="amber" />
            <StatCard icon={FolderKanban} label="Aktive Projekte" value={data.kennzahlen.aktive_projekte} tone="blue" />
            <StatCard icon={FolderKanban} label="Archiviert" value={data.kennzahlen.archivierte_projekte} />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold text-slate-900">Projektverantwortung</h2>
                <p className="mt-0.5 text-xs text-slate-500">Wer hält bei welchem Projekt fachlich den Faden zusammen?</p>
              </div>
              <div className="divide-y divide-slate-100">
                {data.projekte.slice(0, 6).map((project) => (
                  <div key={project.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{project.name}</div>
                      <div className="truncate text-xs text-slate-400">{project.verantwortlicher_name || "Noch nicht zugewiesen"}</div>
                    </div>
                    <span className={`badge ${project.status === "aktiv" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{project.status}</span>
                  </div>
                ))}
                {data.projekte.length === 0 && <div className="px-5 py-8 text-sm text-slate-400">Noch keine Projekte vorhanden.</div>}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold text-slate-900">Letzte Änderungen</h2>
                <p className="mt-0.5 text-xs text-slate-500">Mit Bearbeiter und Änderungsdatum.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {data.aktivitaeten.slice(0, 6).map((event) => (
                  <div key={event.id} className="px-5 py-3.5">
                    <div className="text-sm font-medium text-slate-800">{ACTION_LABELS[event.action] || event.action}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{event.actor_name || "System"} · {fmtDate(event.created_at)}</div>
                  </div>
                ))}
                {data.aktivitaeten.length === 0 && <div className="px-5 py-8 text-sm text-slate-400">Noch keine Änderungen protokolliert.</div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "mitglieder" && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Mitarbeitende</h2>
            <p className="text-sm text-slate-500">Konten freigeben, Firmenadmins bestimmen und Zugänge deaktivieren.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.mitglieder.map((member) => (
              <MemberCard key={member.id} member={member} onPatch={patchMember} busy={busy === `member-${member.id}`} />
            ))}
          </div>
        </section>
      )}

      {tab === "projekte" && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Projekte & Verantwortung</h2>
            <p className="text-sm text-slate-500">Eine klare verantwortliche Person pro Projekt festlegen.</p>
          </div>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {data.projekte.map((project) => (
              <div key={project.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_260px] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{project.name}</span>
                    <span className={`badge ${project.status === "aktiv" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{project.status}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">{[project.standort, project.kunde].filter(Boolean).join(" · ") || "Keine weiteren Projektdaten"}</div>
                </div>
                <select
                  className="input min-h-11"
                  value={project.verantwortlicher_id || ""}
                  disabled={busy === `project-${project.id}`}
                  onChange={(event) => assignProject(project.id, event.target.value)}
                  aria-label={`Verantwortung für ${project.name}`}
                >
                  <option value="">Nicht zugewiesen</option>
                  {aktiveMitglieder.map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email}</option>
                  ))}
                </select>
              </div>
            ))}
            {data.projekte.length === 0 && <div className="p-8 text-sm text-slate-400">Noch keine Projekte vorhanden.</div>}
          </div>
        </section>
      )}

      {tab === "protokoll" && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Änderungsprotokoll</h2>
            <p className="text-sm text-slate-500">Wer hat was wann an Benutzerkonten, Projekten und Schema-Ständen geändert?</p>
          </div>
          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {data.aktivitaeten.map((event) => (
                <article key={event.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4 sm:px-5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Activity className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{ACTION_LABELS[event.action] || event.action}</div>
                    <div className="truncate text-xs text-slate-500">{activityDescription(event)} · {event.actor_name || "System"}</div>
                  </div>
                  <time className="text-xs tabular-nums text-slate-400">{fmtDate(event.created_at)}</time>
                </article>
              ))}
              {data.aktivitaeten.length === 0 && <div className="p-8 text-sm text-slate-400">Noch keine Änderungen protokolliert.</div>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
