// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import { Shield, CheckCircle, XCircle, Users, LogOut } from "lucide-react";
import { api, setAuth, getToken } from "../api";

export default function AdminDashboard() {
  const [experten, setExperten] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const token = getToken();
      setAuth(token);
      const { data } = await api.get("/admin/experts/unverified");
      setExperten(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function verify(id) {
    try {
      await api.post(`/admin/experts/${id}/verify`);
      await load();
    } catch (e) {
      console.error(e);
      alert("Verifizierung fehlgeschlagen.");
    }
  }

  function logout() {
    setAuth(null);
    window.location.href = "/login";
  }

  useEffect(() => {
    load();
  }, []);

  const pendingCount = experten.length;

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Shield className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Energienachweise.com – Admin</h1>
              <p className="text-sm text-gray-500">Verifizierung von Experten</p>
            </div>
          </div>
          <button onClick={logout} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
            <LogOut className="inline w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Stat title="Ausstehend" value={pendingCount} icon={<XCircle />} />
          <Stat title="Verifiziert (heute)" value="—" icon={<CheckCircle />} />
          <Stat title="Gesamt Experten (nur unverified geladen)" value={pendingCount} icon={<Users />} />
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Noch nicht verifizierte Experten</h2>
            <button onClick={load} className="text-sm text-blue-600 hover:text-blue-700">Neu laden</button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Lade …</div>
          ) : experten.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Aktuell keine offenen Verifizierungen ✅</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {experten.map((e) => (
                <li key={e.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{e.email}</p>
                    <p className="text-sm text-gray-500">
                      {e.firmenname ?? "—"} · Fachbereiche: {(e.fachbereiche ?? []).join(", ") || "—"}
                    </p>
                  </div>
                  <button
                    onClick={() => verify(e.id)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    Verifizieren
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ title, value, icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg grid place-items-center">{icon}</div>
    </div>
  );
}
