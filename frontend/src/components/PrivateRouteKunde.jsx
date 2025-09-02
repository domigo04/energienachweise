import React from "react";
import { Navigate } from "react-router-dom";
import { getToken } from "../api";

function PrivateRouteKunde({ children }) {
  const token = getToken();
  const role = localStorage.getItem("role");

  if (!token || role !== "kunde") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRouteKunde;
