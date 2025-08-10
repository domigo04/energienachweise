import React from "react";
import { Navigate } from "react-router-dom";

function PrivateRouteAdmin({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || role !== "admin") {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

export default PrivateRouteAdmin;
