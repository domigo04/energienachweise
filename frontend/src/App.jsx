import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./components/AppLayout";

// Angemeldeter Bereich
import Home from "./pages/Home";
import ProjectList from "./pages/hc/ProjectList";
import ProjectDashboard from "./pages/hc/ProjectDashboard";
import HeizgruppenPage from "./pages/hc/HeizgruppenPage";
import HydraulikEditor from "./pages/hc/HydraulikEditor";
import KostenschaetzungPage from "./pages/hc/KostenschaetzungPage";
import VentilPage from "./pages/hc/VentilPage";
import DruckverlustPage from "./pages/hc/DruckverlustPage";
import RavelPage from "./pages/hc/RavelPage";
import AuswertungList from "./pages/auswertung/AuswertungList";
import AuswertungForm from "./pages/auswertung/AuswertungForm";
import AuswertungAnalyse from "./pages/auswertung/AuswertungAnalyse";
import BenutzerFreischaltung from "./pages/admin/BenutzerFreischaltung";
import BaupreisindexAdmin from "./pages/admin/BaupreisindexAdmin";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Öffentlich */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          {/* Angemeldet: App-Shell mit Seiten-Navigation */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/start" element={<Home />} />

            <Route path="/projekte" element={<ProjectList />} />
            <Route path="/projekte/:id" element={<ProjectDashboard />} />
            <Route path="/projekte/:id/heizgruppen" element={<HeizgruppenPage />} />
            <Route path="/projekte/:id/kostenschaetzung" element={<KostenschaetzungPage />} />

            <Route path="/auswertung" element={<AuswertungList />} />
            <Route path="/auswertung/neu" element={<AuswertungForm />} />
            <Route path="/auswertung/analyse" element={<AuswertungAnalyse />} />
            <Route path="/auswertung/:id" element={<AuswertungForm />} />

            <Route path="/rechner/ventil" element={<VentilPage />} />
            <Route path="/rechner/druckverlust" element={<DruckverlustPage />} />
            <Route path="/rechner/ravel" element={<RavelPage />} />

            <Route path="/admin/benutzer" element={<BenutzerFreischaltung />} />
            <Route path="/admin/baupreisindex" element={<BaupreisindexAdmin />} />
          </Route>

          {/* Schema-Editor: Vollbild-Canvas, ausserhalb der gepolsterten Shell */}
          <Route path="/projekte/:id/schema" element={<ProtectedRoute><HydraulikEditor /></ProtectedRoute>} />

          {/* Alte Routen umleiten + Fallback */}
          <Route path="/heizungscockpit/*" element={<Navigate to="/start" replace />} />
          <Route path="*" element={<Navigate to="/start" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
