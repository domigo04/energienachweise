import { createContext, useContext, useState } from "react";
import { api, setToken } from "../api";

// Auth-Zustand fürs ganze Frontend. Jetzt echtes Backend-Login (JWT):
// login/register rufen /api/v1/auth/*, der Token hängt via Interceptor an jede
// Anfrage. Die Schnittstelle (user/login/logout) blieb wie vorher.
const AuthCtx = createContext(null);
const USER_KEY = "hc_auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch { return null; }
  });

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/api/v1/auth/login", { email, password });
      setToken(data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.response?.data?.detail || "Anmeldung fehlgeschlagen." };
    }
  };

  const register = async (email, password, name, kontoTyp, firmenname) => {
    try {
      const { data } = await api.post("/api/v1/auth/register", {
        email, password, name: name || null,
        konto_typ: kontoTyp || "einzelperson",
        firmenname: firmenname || null,
      });
      return { ok: true, message: data.message };
    } catch (e) {
      return { ok: false, error: e?.response?.data?.detail || "Registrierung fehlgeschlagen." };
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/api/v1/auth/me");
    localStorage.setItem(USER_KEY, JSON.stringify(data));
    setUser(data);
    return data;
  };

  return <AuthCtx.Provider value={{ user, login, register, logout, refreshUser }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
