// src/api.js
import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Zugriffstoken und Benutzerzustand bleiben nur in dieser Browser-Sitzung.
// Anders als localStorage überlebt sessionStorage das Schliessen des Tabs nicht.
const TOKEN_KEY = "hc_token";
const USER_KEY = "hc_auth";

const storage = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);

export const getToken = () => storage()?.getItem(TOKEN_KEY) || null;
export const setToken = (token) => {
  if (token) storage()?.setItem(TOKEN_KEY, token);
  else storage()?.removeItem(TOKEN_KEY);
};
export const getStoredUser = () => {
  try { return JSON.parse(storage()?.getItem(USER_KEY)) || null; } catch { return null; }
};
export const setStoredUser = (user) => {
  if (user) storage()?.setItem(USER_KEY, JSON.stringify(user));
  else storage()?.removeItem(USER_KEY);
};
export const clearAuthSession = () => {
  setToken(null);
  setStoredUser(null);
};

// Token an jede Anfrage hängen
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// 401 → abgemeldet: Token weg und zurück zum Login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      clearAuthSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login?session=expired";
      }
    }
    return Promise.reject(err);
  }
);
