import React from "react";
import { Navigate } from "react-router-dom";

function PrivateRouteExperte({ children }) {
  const token = localStorage.getItem("access_token");
  const role = localStorage.getItem("role");
  const isVerified = localStorage.getItem("is_verified") === "true";

  if (!token || role !== "experte" || !isVerified) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRouteExperte;
