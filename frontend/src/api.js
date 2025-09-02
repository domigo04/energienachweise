// src/api.js
import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
});

// Token setzen (beim Login)
export function setAuth(token) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
  localStorage.setItem("access_token", token);
}

// Token auslesen (neu hinzugefügt)
export function getToken() {
  return localStorage.getItem("access_token");
}

// JWT Payload decodieren
export function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}
