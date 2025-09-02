// src/routes/PrivateRouteAdmin.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { getToken, decodeJwt } from "../api";

export default function PrivateRouteAdmin({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;

  const payload = decodeJwt(token);
  if (!payload || payload.role !== "admin") return <Navigate to="/login" replace />;

  return children;
}
