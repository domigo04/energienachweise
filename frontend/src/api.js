// src/api.js
import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export function setAuth(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem("access_token", token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("access_token");
  }
}

export function getToken() {
  return localStorage.getItem("access_token");
}

export function decodeJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }
}
