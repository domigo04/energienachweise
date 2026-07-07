import { createContext, useContext, useState } from "react";

// Auth-Zustand fürs ganze Frontend. VORERST prüft das Login im Frontend (Admin-
// Gate), damit man nicht ohne Anmeldung ins Cockpit kommt. Wird im nächsten
// Schritt durch echtes Backend-Login (Registrierung → Freischaltung durch Admin,
// Passwort-Hash, Token, User-/Firmen-Trennung) ersetzt — die Schnittstelle
// (login/logout/user) bleibt dann gleich.
const AuthCtx = createContext(null);
const KEY = "hc_auth";
const ADMIN = { email: "dominicgoulon@icloud.com", password: "Sirego2004!" };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  });

  const login = (email, password) => {
    if (email.trim().toLowerCase() === ADMIN.email && password === ADMIN.password) {
      const u = { email: ADMIN.email, name: "Dominic Goulon", role: "admin" };
      localStorage.setItem(KEY, JSON.stringify(u));
      setUser(u);
      return { ok: true };
    }
    return { ok: false, error: "E-Mail oder Passwort falsch — oder das Konto ist noch nicht freigeschaltet." };
  };

  const logout = () => { localStorage.removeItem(KEY); setUser(null); };

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
