import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Shield, CheckCircle, XCircle, Eye, LogOut, Trash2, User
} from "lucide-react";

function AdminDashboard() {
  const [experten, setExperten] = useState([]);
  const [kunden, setKunden] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchExperten();
    fetchKunden();
  }, []);

  const fetchExperten = () => {
    fetch("http://localhost:8000/admin/experts")
      .then((res) => res.json())
      .then(setExperten)
      .catch((err) => console.error("Fehler beim Laden der Experten:", err));
  };

  const fetchKunden = () => {
    fetch("http://localhost:8000/admin/kunden")
      .then((res) => res.json())
      .then(setKunden)
      .catch((err) => console.error("Fehler beim Laden der Kunden:", err));
  };

  const handleVerify = async (id) => {
    await fetch(`http://localhost:8000/admin/experts/${id}/verify`, { method: "PATCH" });
    fetchExperten();
  };

  const handleDeleteExperte = async (id) => {
    if (window.confirm("Experte wirklich löschen?")) {
      await fetch(`http://localhost:8000/admin/experts/${id}`, { method: "DELETE" });
      fetchExperten();
    }
  };

  const handleDeleteKunde = async (id) => {
    if (window.confirm("Kunde wirklich löschen?")) {
      await fetch(`http://localhost:8000/admin/kunden/${id}`, { method: "DELETE" });
      fetchKunden();
    }
  };

  const handleLogout = () => {
    navigate("/");
  };

  const verifiedCount = experten.filter(e => e.is_verified).length;
  const pendingCount = experten.length - verifiedCount;

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-xl bg-[#007AFF] flex items-center justify-center">
              <Shield className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Benutzerverwaltung</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* Statistiken */}
        <section className="grid md:grid-cols-3 gap-6">
          <StatCard title="Gesamt Experten" value={experten.length} icon={<Users />} />
          <StatCard title="Verifiziert" value={verifiedCount} icon={<CheckCircle />} />
          <StatCard title="Wartend" value={pendingCount} icon={<XCircle />} />
        </section>

        {/* Expertenliste */}
        <Section title="Experten">
          {experten.length === 0 ? (
            <EmptyState icon={<Users />} text="Keine Experten gefunden" />
          ) : (
            <UserList
              users={experten}
              onView={(id) => navigate(`/admin/experten/${id}`)}
              onVerify={handleVerify}
              onDelete={handleDeleteExperte}
              role="experte"
            />
          )}
        </Section>

        {/* Kundenliste */}
        <Section title="Kunden">
          {kunden.length === 0 ? (
            <EmptyState icon={<User />} text="Keine Kunden gefunden" />
          ) : (
            <UserList
              users={kunden}
              onDelete={handleDeleteKunde}
              role="kunde"
            />
          )}
        </Section>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-[#007AFF]">
        {icon}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center px-6 py-12 text-gray-500">
      <div className="mb-4 flex justify-center">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function UserList({ users, onView, onVerify, onDelete, role }) {
  return (
    <ul className="divide-y divide-gray-100">
      {users.map((user) => (
        <li key={user.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
          <div>
            <p className="font-medium">{user.email}</p>
            <div className="text-sm text-gray-500 flex items-center space-x-4">
              <span>ID: {user.id}</span>
              {role === "experte" && (
                <span className={user.is_verified ? "text-green-600" : "text-orange-500"}>
                  {user.is_verified ? "✔ Verifiziert" : "⚠ Wartend"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {role === "experte" && onView && (
              <button
                onClick={() => onView(user.id)}
                className="text-[#007AFF] text-sm hover:underline"
              >
                Profil
              </button>
            )}
            {role === "experte" && !user.is_verified && onVerify && (
              <button
                onClick={() => onVerify(user.id)}
                className="text-sm bg-[#007AFF] hover:bg-blue-600 text-white px-3 py-1 rounded-lg"
              >
                Verifizieren
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(user.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Löschen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default AdminDashboard;
