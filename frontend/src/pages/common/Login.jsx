import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, LogIn, AlertCircle, CheckCircle } from "lucide-react";

function Login() {
  const [formDataState, setFormDataState] = useState({ username: "", password: "" });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const apiBase = process.env.REACT_APP_API_BASE_URL;

  const handleChange = (e) => {
    setFormDataState((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsLoading(true);

    const formData = new URLSearchParams();
    formData.append("username", formDataState.username);
    formData.append("password", formDataState.password);

    const loginRoutes = [
      { role: "admin", url: `${apiBase}/admin/login`, redirect: "/admin-dashboard" },
      { role: "experte", url: `${apiBase}/experts/login`, redirect: "/experte-dashboard" },
      { role: "kunde", url: `${apiBase}/customers/login`, redirect: "/kunde-dashboard" }
    ];

    for (const route of loginRoutes) {
      try {
        const res = await axios.post(route.url, formData, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        const { user, access_token } = res.data;

        if (user.role === "experte" && !user.is_verified) {
          setMessage("⚠️ Dein Experten-Account ist noch nicht freigeschaltet.");
          setIsLoading(false);
          return;
        }

        localStorage.setItem("access_token", access_token);
        localStorage.setItem("user_id", user.id);
        localStorage.setItem("email", user.email);
        localStorage.setItem("role", user.role);
        localStorage.setItem("is_verified", user.is_verified);
        if (user.vorname) localStorage.setItem("vorname", user.vorname);

        setMessage("✅ Login erfolgreich! Weiterleitung...");
        setTimeout(() => navigate(route.redirect), 1200);
        return;
      } catch (err) {
        if (route.role === "kunde") {
          if (err.response?.status === 403) {
            setMessage("⚠️ Dein Account ist noch nicht freigeschaltet.");
          } else {
            setMessage("❌ E-Mail oder Passwort falsch.");
          }
          console.error("Login-Fehler:", err.response?.data || err.message);
          setIsLoading(false);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Willkommen zurück</h1>
          <p className="text-gray-600 mt-2">Melden Sie sich in Ihrem Konto an</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span>E-Mail Adresse</span>
              </label>
              <input
                type="email"
                name="username"
                placeholder="ihre.email@beispiel.ch"
                value={formDataState.username}
                onChange={handleChange}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-2">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Passwort</span>
              </label>
              <input
                type="password"
                name="password"
                placeholder="Ihr Passwort"
                value={formDataState.password}
                onChange={handleChange}
                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Anmeldung läuft...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Anmelden</span>
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

          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-gray-600">
              Noch kein Konto?{" "}
              <button
                onClick={() => navigate("/experte-werden")}
                className="text-blue-600 hover:text-blue-700 font-semibold ml-1"
              >
                Als Experte registrieren
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
