import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Schützt das Cockpit: ohne Login → zurück zur Login-Seite (kein Umgehen mehr).
export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}
