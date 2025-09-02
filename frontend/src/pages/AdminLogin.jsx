// src/pages/AdminLogin.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Mail, Lock, LogIn, AlertCircle, CheckCircle } from "lucide-react";
import { api, setAuth, decodeJwt } from "../api";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      const token = data?.access_token;
      if (!token) throw new Error("Kein Token erhalten");

      setAuth(token);
      const payload = decodeJwt(token);
      const role = payload?.role;

      if (role === "admin") {
        localStorage.setItem("role", "admin");
        localStorage.setItem("email", email);

        setMessage("✅ Login erfolgreich! Weiterleitung …");
        setTimeout(() => navigate("/admin-dashboard"), 800);
      } else {
        setMessage("❌ Kein Admin-Konto. Bitte mit Admin-Account einloggen.");
      }
    } catch (err) {
      console.error("Admin-Login fehlgeschlagen:", err);
      setMessage("❌ Login fehlgeschlagen. E-Mail/Passwort prüfen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Admin Login</h1>
          <p className="text-slate-600 mt-2 text-sm">API: {api.defaults.baseURL}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Mail className="w-4 h-4 text-blue-600" /> Admin E-Mail
              </label>
              <input
                type="email"
                placeholder="admin@beispiel.ch"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Lock className="w-4 h-4 text-blue-600" /> Passwort
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? "Anmeldung läuft…" : (<><LogIn className="w-5 h-5" /> Als Admin anmelden</>)}
            </button>

            {message && (
              <div className={`p-4 rounded-xl flex items-center gap-2 ${
                message.includes("✅")
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}>
                {message.includes("✅") 
                  ? <CheckCircle className="w-5 h-5" /> 
                  : <AlertCircle className="w-5 h-5" />}
                <span className="font-medium">{message}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
