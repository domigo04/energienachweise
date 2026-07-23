import { useEffect, useState } from "react";
import { Check, ShieldCheck, UserX, RotateCcw } from "lucide-react";
import { getUsers, updateUser } from "../../api/hcApi";

export default function BenutzerFreischaltung() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setError("Benutzer konnten nicht geladen werden")).finally(() => setLoading(false));
  }, []);

  const patch = async (id, data) => {
    try {
      const u = await updateUser(id, data);
      setUsers((us) => us.map((x) => (x.id === u.id ? u : x)));
    } catch {
      setError("Änderung fehlgeschlagen");
    }
  };

  const pending = users.filter((u) => !u.is_verified);
  const aktiv = users.filter((u) => u.is_verified);
  const firmenadminAntraege = users.filter(
    (u) => u.is_verified && u.role !== "admin" && u.firma_role !== "admin" && u.firma_admin_beantragt_at,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Benutzer</h1>
        <p className="mt-1 text-sm text-slate-500">Registrierungen prüfen und freischalten.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Lade…</div>
      ) : (
        <div className="space-y-8">
          {/* Firmenadmin-Anträge */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Firmenadmin-Anträge ({firmenadminAntraege.length})</h2>
            {firmenadminAntraege.length === 0 ? (
              <div className="card p-5 text-sm text-slate-400">Keine offenen Firmenadmin-Anträge.</div>
            ) : (
              <div className="space-y-2">
                {firmenadminAntraege.map((u) => (
                  <div key={u.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{u.name || u.email}</div>
                      <div className="truncate text-xs text-slate-400">{u.email}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {u.firma_name} · beantragt am {new Date(u.firma_admin_beantragt_at).toLocaleString("de-CH")}
                      </div>
                    </div>
                    <button onClick={() => patch(u.id, { firma_role: "admin" })} className="btn-primary shrink-0">
                      <ShieldCheck className="size-4" /> Als Firmenadmin bestätigen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Wartet auf Freischaltung */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Wartet auf Freischaltung ({pending.length})</h2>
            {pending.length === 0 ? (
              <div className="card p-5 text-sm text-slate-400">Keine offenen Anfragen.</div>
            ) : (
              <div className="space-y-2">
                {pending.map((u) => (
                  <div key={u.id} className="card flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{u.name || u.email}</div>
                      <div className="truncate text-xs text-slate-400">{u.email}</div>
                      {u.firma_name && <div className="mt-1 badge bg-slate-100 text-slate-600">{u.firma_name}</div>}
                    </div>
                    <button onClick={() => patch(u.id, { is_verified: true })} className="btn-primary shrink-0">
                      <Check className="size-4" /> Freischalten
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Freigeschaltet */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Freigeschaltete Benutzer ({aktiv.length})</h2>
            <div className="card divide-y divide-slate-100">
              {aktiv.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                      {(u.name || u.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-800">{u.name || u.email}</span>
                        {u.role === "admin" && <span className="badge bg-brand-50 text-brand-700"><ShieldCheck className="mr-1 size-3" /> Plattformadmin</span>}
                        {u.role !== "admin" && u.firma_role === "admin" && <span className="badge bg-blue-50 text-blue-700"><ShieldCheck className="mr-1 size-3" /> Firmenadmin</span>}
                        {!u.is_active && <span className="badge bg-slate-100 text-slate-500">Deaktiviert</span>}
                      </div>
                      <div className="truncate text-xs text-slate-400">{u.email} {u.firma_name && `· ${u.firma_name}`}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {u.role !== "admin" && u.firma_role === "admin" && (
                      <button onClick={() => patch(u.id, { firma_role: "mitglied" })} className="btn-ghost text-xs text-slate-500 hover:text-amber-700" title="Firmenadmin-Rolle entfernen">
                        Rolle entfernen
                      </button>
                    )}
                    {u.is_active ? (
                      <button onClick={() => patch(u.id, { is_active: false })} className="btn-ghost text-slate-400 hover:text-red-500" title="Deaktivieren">
                        <UserX className="size-4" />
                      </button>
                    ) : (
                      <button onClick={() => patch(u.id, { is_active: true })} className="btn-ghost text-slate-400 hover:text-green-600" title="Reaktivieren">
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
