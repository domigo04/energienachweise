import React from "react";
import { Navigate } from "react-router-dom";
import { getToken } from "../api";

function PrivateRouteExperte({ children }) {
  const token = getToken();
  const role = localStorage.getItem("role");
  const isVerified = localStorage.getItem("is_verified") === "true";

  if (!token || role !== "experte" || !isVerified) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRouteExperte;
