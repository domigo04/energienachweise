import { createContext, useContext, useState } from "react";
import {
  api,
  clearAuthSession,
  getStoredUser,
  setStoredUser,
  setToken,
} from "../api";

// Auth-Zustand fürs ganze Frontend. Jetzt echtes Backend-Login (JWT):
// login/register rufen /api/v1/auth/*, der Token hängt via Interceptor an jede
// Anfrage. Die Schnittstelle (user/login/logout) blieb wie vorher.
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/api/v1/auth/login", { email, password });
      setToken(data.access_token);
      setStoredUser(data.user);
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
    clearAuthSession();
    setUser(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/api/v1/auth/me");
    setStoredUser(data);
    setUser(data);
    return data;
  };

  return <AuthCtx.Provider value={{ user, login, register, logout, refreshUser }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
