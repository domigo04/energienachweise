import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { api, setAuth, decodeJwt, API_BASE } from "../api";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        email: form.email,
        password: form.password,
      });

      const token = data?.access_token;
      if (!token) throw new Error("Kein Token erhalten.");

      setAuth(token);
      const payload = decodeJwt(token);
      const role = payload?.role ?? "";
      const userId = payload?.sub ?? "";

      localStorage.setItem("role", role);
      localStorage.setItem("user_id", userId);

      setMsg("✅ Login erfolgreich – Weiterleitung …");

      if (role === "admin") navigate("/admin");
      else if (role === "experte") navigate("/experte");
      else navigate("/kunde-dashboard");
    } catch (err) {
      console.error(err);
      setMsg("❌ Login fehlgeschlagen. Prüfe E-Mail/Passwort.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Anmelden</h1>
          <p className="text-gray-600 mt-2">API: {API_BASE}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Mail className="w-4 h-4 text-blue-600" />
                E-Mail Adresse
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                placeholder="admin@beispiel.ch"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Lock className="w-4 h-4 text-blue-600" />
                Passwort
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              {loading ? "Anmeldung läuft…" : (<><LogIn className="w-5 h-5" /> Anmelden</>)}
            </button>

            {msg && (
              <div className={`p-4 rounded-xl flex items-center gap-2 ${
                msg.includes("✅")
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}>
                {msg.includes("✅") ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="font-medium">{msg}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
