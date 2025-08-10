import React from "react";
import { Navigate } from "react-router-dom";

function PrivateRouteKunde({ children }) {
  const token = localStorage.getItem("access_token");
  const role = localStorage.getItem("role");

  if (!token || role !== "kunde") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRouteKunde;
