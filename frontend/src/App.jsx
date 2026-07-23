import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./components/AppLayout";

// Angemeldeter Bereich
import Home from "./pages/Home";
import KontoPage from "./pages/KontoPage";
import ProjectList from "./pages/hc/ProjectList";
import ProjectDashboard from "./pages/hc/ProjectDashboard";
import HeizgruppenPage from "./pages/hc/HeizgruppenPage";
import VentilPage from "./pages/hc/VentilPage";
import DruckverlustPage from "./pages/hc/DruckverlustPage";
import RavelPage from "./pages/hc/RavelPage";
import AuswertungList from "./pages/auswertung/AuswertungList";
import AuswertungForm from "./pages/auswertung/AuswertungForm";
import AuswertungAnalyse from "./pages/auswertung/AuswertungAnalyse";
import GrobkostenSchaetzung from "./pages/grobkosten/GrobkostenSchaetzung";
import BenutzerFreischaltung from "./pages/admin/BenutzerFreischaltung";
import BaupreisindexAdmin from "./pages/admin/BaupreisindexAdmin";

// Der produktive Schema-Editor ist gross und wird nur auf seiner Route geladen.
const HydraulikEditor = lazy(() => import("./pages/hc/HydraulikEditor"));

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
            <Route path="/konto" element={<KontoPage />} />

            <Route path="/projekte" element={<ProjectList />} />
            <Route path="/projekte/:id" element={<ProjectDashboard />} />
            <Route path="/projekte/:id/heizgruppen" element={<HeizgruppenPage />} />
            <Route path="/projekte/:id/kostenschaetzung" element={<GrobkostenSchaetzung />} />

            <Route path="/auswertung" element={<AuswertungList />} />
            <Route path="/auswertung/neu" element={<AuswertungForm />} />
            <Route path="/auswertung/analyse" element={<AuswertungAnalyse />} />
            <Route path="/auswertung/:id" element={<AuswertungForm />} />

            {/* Alte Grobkosten-Standalone-Routen → Schätzung läuft im Projekt */}
            <Route path="/grobkosten/*" element={<Navigate to="/projekte" replace />} />

            <Route path="/rechner/ventil" element={<VentilPage />} />
            <Route path="/rechner/druckverlust" element={<DruckverlustPage />} />
            <Route path="/rechner/ravel" element={<RavelPage />} />

            <Route path="/admin/benutzer" element={<BenutzerFreischaltung />} />
            <Route path="/admin/baupreisindex" element={<BaupreisindexAdmin />} />
          </Route>

          {/* Schema-Editor: Vollbild-Canvas, ausserhalb der gepolsterten Shell */}
          <Route path="/projekte/:id/schema" element={<ProtectedRoute><Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-slate-500">Hydraulikschema wird geladen…</div>}><HydraulikEditor /></Suspense></ProtectedRoute>} />

          {/* Alte Routen umleiten + Fallback */}
          <Route path="/heizungscockpit/*" element={<Navigate to="/start" replace />} />
          <Route path="*" element={<Navigate to="/start" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
