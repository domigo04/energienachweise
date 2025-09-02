import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, PlusCircle, FolderOpen } from "lucide-react";
import { api, API_BASE } from "../api";
import { getToken } from "../api";


function CustomerDashboard() {
  const navigate = useNavigate();
  const [vorname, setVorname] = useState("");
  const [projekte, setProjekte] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const role = localStorage.getItem("role");
    const name = localStorage.getItem("vorname");

    if (!token || role !== "kunde") {
      navigate("/login");
    } else {
      setVorname(name || "Kunde");
      loadProjekte(token);
    }
  }, [navigate]);

  const loadProjekte = async (token) => {
    try {
      setLoading(true);
      const { data } = await api.get("/customers/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProjekte(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("❌ Fehler beim Laden der Projekte:", error);
      setProjekte([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const handleProjektErstellen = () => navigate("/projekt-erstellen");

  const handleProjektClick = (projektId) => navigate(`/projekt/${projektId}`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 mb-6 border border-white/20">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-800 mb-2">
                👋 Willkommen, {vorname}
              </h1>
              <p className="text-gray-600">
                Verwalte deine Energieprojekte zentral an einem Ort
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-200 flex items-center space-x-2 hover:scale-105"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Projekt erstellen Button */}
        <div className="mb-6">
          <button
            onClick={handleProjektErstellen}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-6 px-8 rounded-2xl font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center space-x-3 hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="w-6 h-6" />
            <span>Neues Projekt erstellen</span>
          </button>
        </div>

        {/* Projektliste */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center space-x-2">
            <FolderOpen className="w-6 h-6 text-blue-600" />
            <span>Meine Projekte</span>
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
              <span className="ml-3 text-gray-600">Projekte werden geladen...</span>
            </div>
          ) : projekte.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                <FolderOpen className="w-12 h-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                Noch keine Projekte
              </h3>
              <p className="text-gray-600 mb-6">
                Du hast noch kein Projekt erstellt. Starte jetzt dein erstes Energieprojekt!
              </p>
              <button
                onClick={handleProjektErstellen}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
              >
                Jetzt starten
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {projekte.map((projekt) => (
                <div
                  key={projekt.id}
                  onClick={() => handleProjektClick(projekt.id)}
                  className="p-6 bg-gradient-to-r from-white to-blue-50 border border-blue-100 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-1">
                        {projekt.name}
                      </h3>
                      {projekt.beschreibung && (
                        <p className="text-gray-600 text-sm mb-2">
                          {projekt.beschreibung}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>📍 {projekt.adresse}</span>
                        <span>🏠 {projekt.gebaeudetyp}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500">
                        Erstellt:{" "}
                        {new Date(projekt.erstellt).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerDashboard;
