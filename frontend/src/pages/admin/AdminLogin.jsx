import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Shield, Mail, Lock, LogIn, AlertCircle, CheckCircle } from "lucide-react";

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");
    console.log("Login wird ausgeführt");

    try {
      const res = await axios.post("http://localhost:8000/admin/login", {
        email,
        password,
      });

      console.log("Antwort vom Server:", res.data);

      // 🔐 Token & Rolle speichern
      localStorage.setItem("token", res.data.access_token); // Muss vom Backend kommen!
      localStorage.setItem("role", "admin");
      localStorage.setItem("email", email);

      setMessage("✅ Login erfolgreich! Weiterleitung...");

      setTimeout(() => {
        navigate("/admin-dashboard");
      }, 1500);
    } catch (error) {
      console.error("Fehler beim Login:", error);
      setMessage("❌ Login fehlgeschlagen. Bitte prüfen Sie Ihre Zugangsdaten.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Bereich</h1>
          <p className="text-gray-600 mt-2">Zugang nur für Administratoren</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-2">
                <Mail className="w-4 h-4 text-red-600" />
                <span>Admin E-Mail</span>
              </label>
              <input
                type="email"
                placeholder="admin@beispiel.ch"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none transition-colors"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-2">
                <Lock className="w-4 h-4 text-red-600" />
                <span>Passwort</span>
              </label>
              <input
                type="password"
                placeholder="Admin-Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none transition-colors"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Anmeldung läuft...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Als Admin anmelden</span>
                </>
              )}
            </button>

            {message && (
              <div className={`p-4 rounded-xl flex items-center space-x-2 ${
                message.includes("✅")
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}>
                {message.includes("✅") ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="font-medium">{message}</span>
              </div>
            )}
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center space-x-2 text-gray-600 text-sm">
              <Shield className="w-4 h-4" />
              <span>Dieser Bereich ist nur für autorisierte Administratoren zugänglich</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
