import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Shield, LogOut, Settings, FileText, Calendar } from "lucide-react";

function ExpertDashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const email = localStorage.getItem("email");
    const role = localStorage.getItem("role");
    const is_verified = localStorage.getItem("is_verified");

    if (!email || role !== "experte") {
      navigate("/login");
    } else {
      setUser({ email, role, is_verified });
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-600 text-lg">Dashboard wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Experten Dashboard</h1>
              <p className="text-gray-600">Willkommen, {user.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors shadow-md"
            >
              Logout
            </button>
            <div
              onClick={() => navigate("/profil")}
              className="cursor-pointer"
              title="Zum Profil"
            >
              <img
                src="https://avatars.githubusercontent.com/u/1000000?v=4"
                alt="Profilbild"
                className="w-10 h-10 rounded-full object-cover border-2 border-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Inhalt */}
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* Verifizierungsbox */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Account verifiziert!</h2>
              <p className="text-green-100">Ihr Profil ist freigeschaltet.</p>
            </div>
          </div>
        </div>

        {/* Quick-Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            onClick={() => navigate("/profil")}
            className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Settings className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Profil bearbeiten</h3>
                <p className="text-gray-600 text-sm">Daten aktualisieren</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Neue Anfragen</h3>
                <p className="text-gray-600 text-sm">0 offene Anfragen</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Terminkalender</h3>
                <p className="text-gray-600 text-sm">Verfügbarkeiten</p>
              </div>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">E-Mail Adresse</p>
              <p className="font-semibold text-gray-900">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Account-Typ</p>
              <p className="font-semibold text-gray-900 capitalize">{user.role}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Status</p>
              <span className="font-semibold text-green-600">Verifiziert</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpertDashboard;
