import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Interne Plattformseiten bleiben auch bei direkter URL-Eingabe Admins vorbehalten.
export default function AdminRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== "admin") return <Navigate to="/start" replace />;
  return children;
}
