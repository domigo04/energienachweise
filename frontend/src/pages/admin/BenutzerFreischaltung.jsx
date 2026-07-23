import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  FolderKanban,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { getAdminOverview, getUsers, updateFirma, updateUser } from "../../api/hcApi";

function Metric({ icon: Icon, value, label, warning }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex size-10 items-center justify-center rounded-xl ${warning ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-slate-950">{value ?? "–"}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function BenutzerFreischaltung() {
  const [users, setUsers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [userData, overviewData] = await Promise.all([getUsers(), getAdminOverview()]);
      setUsers(userData);
      setOverview(overviewData);
    } catch {
      setError("Plattformdaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const patchUser = async (id, data) => {
    setBusy(`user-${id}`);
    setError("");
    try {
      const updated = await updateUser(id, data);
      setUsers((items) => items.map((item) => item.id === updated.id ? updated : item));
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Benutzeränderung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const patchFirma = async (firma, data) => {
    setBusy(`firma-${firma.id}`);
    setError("");
    try {
      await updateFirma(firma.id, data);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Firmenänderung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const pending = users.filter((user) => !user.is_verified);
  const firmenadminAntraege = users.filter(
    (user) => user.is_verified && user.role !== "admin" && user.firma_role !== "admin" && user.firma_admin_beantragt_at,
  );
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [user.name, user.email, user.firma_name].some((value) => value?.toLowerCase().includes(needle)));
  }, [users, query]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">
          <ShieldCheck className="size-4" /> Plattform
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Plattform-Administration</h1>
        <p className="mt-1 text-sm text-slate-500">Firmen, Registrierungen und globale Zugänge verwalten.</p>
      </header>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Plattformdaten werden geladen…</div>
      ) : (
        <div className="space-y-8">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric icon={Building2} value={overview?.kennzahlen.firmen} label="Firmen" />
            <Metric icon={Users} value={overview?.kennzahlen.benutzer} label="Benutzer" />
            <Metric icon={FolderKanban} value={overview?.kennzahlen.projekte} label="Projekte" />
            <Metric icon={UserCheck} value={overview?.kennzahlen.offene_registrierungen} label="Registrierungen offen" warning={overview?.kennzahlen.offene_registrierungen > 0} />
            <Metric icon={ShieldCheck} value={overview?.kennzahlen.offene_firmenadmin_antraege} label="Adminanträge offen" warning={overview?.kennzahlen.offene_firmenadmin_antraege > 0} />
          </section>

          {(firmenadminAntraege.length > 0 || pending.length > 0) && (
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-slate-900">Offene Freigaben</h2>
                <p className="text-sm text-slate-500">Nur Entscheidungen, die wirklich einen Plattformadmin benötigen.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {firmenadminAntraege.map((user) => (
                  <div key={`admin-${user.id}`} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{user.name || user.email}</div>
                      <div className="truncate text-xs text-slate-500">{user.firma_name} · Firmenadmin beantragt</div>
                      <div className="mt-1 text-xs text-slate-400">{new Date(user.firma_admin_beantragt_at).toLocaleString("de-CH")}</div>
                    </div>
                    <button
                      onClick={() => patchUser(user.id, { firma_role: "admin" })}
                      disabled={busy === `user-${user.id}`}
                      className="btn-primary shrink-0 justify-center"
                    >
                      <ShieldCheck className="size-4" /> Bestätigen
                    </button>
                  </div>
                ))}
                {pending.map((user) => (
                  <div key={`pending-${user.id}`} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{user.name || user.email}</div>
                      <div className="truncate text-xs text-slate-500">{user.email} · {user.firma_name}</div>
                    </div>
                    <button
                      onClick={() => patchUser(user.id, { is_verified: true })}
                      disabled={busy === `user-${user.id}`}
                      className="btn-primary shrink-0 justify-center"
                    >
                      <Check className="size-4" /> Freischalten
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Firmen</h2>
              <p className="text-sm text-slate-500">Mandantenstatus, Nutzung und Firmenadmins auf einen Blick.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {(overview?.firmen || []).map((firma) => (
                <article key={firma.id} className={`rounded-2xl border bg-white p-5 ${firma.is_active ? "border-slate-200" : "border-red-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-950">{firma.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className={`badge ${firma.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {firma.is_active ? "Aktiv" : "Deaktiviert"}
                        </span>
                        <span className="badge bg-slate-100 text-slate-600">{firma.abo_plan}</span>
                      </div>
                    </div>
                    <Building2 className="size-5 text-slate-300" />
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-slate-100 py-3 text-center">
                    <div><dt className="text-xl font-semibold text-slate-900">{firma.user_count}</dt><dd className="text-[11px] text-slate-400">Benutzer</dd></div>
                    <div><dt className="text-xl font-semibold text-slate-900">{firma.project_count}</dt><dd className="text-[11px] text-slate-400">Projekte</dd></div>
                    <div><dt className="text-xl font-semibold text-slate-900">{firma.firma_admin_count}</dt><dd className="text-[11px] text-slate-400">Admins</dd></div>
                  </dl>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{firma.pending_user_count} offene Registrierung(en)</span>
                    <button
                      type="button"
                      disabled={busy === `firma-${firma.id}`}
                      onClick={() => patchFirma(firma, { is_active: !firma.is_active })}
                      className={`btn-secondary ${firma.is_active ? "text-red-600" : "text-emerald-700"}`}
                    >
                      {firma.is_active ? <UserX className="size-4" /> : <RotateCcw className="size-4" />}
                      {firma.is_active ? "Deaktivieren" : "Reaktivieren"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Alle Benutzer</h2>
                <p className="text-sm text-slate-500">Globale Kontrolle für Support- und Ausnahmefälle.</p>
              </div>
              <label className="relative block sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, E-Mail oder Firma" />
              </label>
            </div>
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {filteredUsers.map((user) => (
                <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                      {(user.name || user.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-slate-900">{user.name || user.email}</span>
                        {user.role === "admin" && <span className="badge bg-brand-50 text-brand-700">Plattformadmin</span>}
                        {user.role !== "admin" && user.firma_role === "admin" && <span className="badge bg-blue-50 text-blue-700">Firmenadmin</span>}
                        {!user.is_verified && <span className="badge bg-amber-50 text-amber-700">Nicht freigeschaltet</span>}
                        {!user.is_active && <span className="badge bg-slate-100 text-slate-500">Deaktiviert</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">{user.email} · {user.firma_name}</div>
                    </div>
                  </div>
                  {user.role !== "admin" && (
                    <div className="flex flex-wrap gap-2">
                      {user.firma_role === "admin" && (
                        <button onClick={() => patchUser(user.id, { firma_role: "mitglied" })} className="btn-ghost text-xs text-slate-500">Adminrolle entfernen</button>
                      )}
                      <button
                        onClick={() => patchUser(user.id, { is_active: !user.is_active })}
                        className={`btn-ghost ${user.is_active ? "text-red-500" : "text-emerald-700"}`}
                        title={user.is_active ? "Deaktivieren" : "Reaktivieren"}
                      >
                        {user.is_active ? <UserX className="size-4" /> : <RotateCcw className="size-4" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
