import { Navigate } from "react-router-dom";

// Marketplace geparkt — Heizungscockpit ist die Hauptapp
export default function HomePage() {
  return <Navigate to="/heizungscockpit" replace />;
}
