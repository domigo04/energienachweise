import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./components/AppLayout";

// Die öffentliche Landingpage lädt keinen internen Projektcode. Jede grössere
// Arbeitsseite wird erst beim Öffnen als eigenes Paket nachgeladen.
const Home = lazy(() => import("./pages/Home"));
const KontoPage = lazy(() => import("./pages/KontoPage"));
const ProjectList = lazy(() => import("./pages/hc/ProjectList"));
const ProjectDashboard = lazy(() => import("./pages/hc/ProjectDashboard"));
const ProjektInfoPage = lazy(() => import("./pages/hc/ProjektInfoPage"));
const ProjektMengenPage = lazy(() => import("./pages/hc/ProjektMengenPage"));
const HeizgruppenPage = lazy(() => import("./pages/hc/HeizgruppenPage"));
const VentilPage = lazy(() => import("./pages/hc/VentilPage"));
const DruckverlustPage = lazy(() => import("./pages/hc/DruckverlustPage"));
const RavelPage = lazy(() => import("./pages/hc/RavelPage"));
const AuswertungList = lazy(() => import("./pages/auswertung/AuswertungList"));
const AuswertungForm = lazy(() => import("./pages/auswertung/AuswertungForm"));
const AuswertungAnalyse = lazy(() => import("./pages/auswertung/AuswertungAnalyse"));
const LvImportPage = lazy(() => import("./pages/auswertung/LvImportPage"));
const GrobkostenSchaetzung = lazy(() => import("./pages/grobkosten/GrobkostenSchaetzung"));
const BenutzerFreischaltung = lazy(() => import("./pages/admin/BenutzerFreischaltung"));
const Firmenverwaltung = lazy(() => import("./pages/admin/Firmenverwaltung"));
const BaupreisindexAdmin = lazy(() => import("./pages/admin/BaupreisindexAdmin"));
const HydraulikEditor = lazy(() => import("./pages/hc/HydraulikEditor"));

function PageLoader({ children }) {
  return (
    <Suspense fallback={<div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Bereich wird geladen…</div>}>
      {children}
    </Suspense>
  );
}

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
            <Route path="/start" element={<PageLoader><Home /></PageLoader>} />
            <Route path="/konto" element={<PageLoader><KontoPage /></PageLoader>} />

            <Route path="/projekte" element={<PageLoader><ProjectList /></PageLoader>} />
            <Route path="/projekte/:id" element={<PageLoader><ProjectDashboard /></PageLoader>} />
            <Route path="/projekte/:id/info" element={<PageLoader><ProjektInfoPage /></PageLoader>} />
            <Route path="/projekte/:id/mengen" element={<PageLoader><ProjektMengenPage /></PageLoader>} />
            <Route path="/projekte/:id/heizgruppen" element={<PageLoader><HeizgruppenPage /></PageLoader>} />
            <Route path="/projekte/:id/kostenschaetzung" element={<PageLoader><GrobkostenSchaetzung /></PageLoader>} />

            <Route path="/auswertung" element={<PageLoader><AuswertungList /></PageLoader>} />
            <Route path="/auswertung/neu" element={<PageLoader><AuswertungForm /></PageLoader>} />
            <Route path="/auswertung/analyse" element={<PageLoader><AuswertungAnalyse /></PageLoader>} />
            <Route path="/auswertung/import" element={<PageLoader><LvImportPage /></PageLoader>} />
            <Route path="/auswertung/import/:id" element={<PageLoader><LvImportPage /></PageLoader>} />
            <Route path="/auswertung/:id" element={<PageLoader><AuswertungForm /></PageLoader>} />

            {/* Alte Grobkosten-Standalone-Routen → Schätzung läuft im Projekt */}
            <Route path="/grobkosten/*" element={<Navigate to="/projekte" replace />} />

            <Route path="/rechner/ventil" element={<PageLoader><VentilPage /></PageLoader>} />
            <Route path="/rechner/druckverlust" element={<PageLoader><DruckverlustPage /></PageLoader>} />
            <Route path="/rechner/ravel" element={<PageLoader><RavelPage /></PageLoader>} />

            <Route path="/admin/benutzer" element={<PageLoader><BenutzerFreischaltung /></PageLoader>} />
            <Route path="/admin/baupreisindex" element={<PageLoader><BaupreisindexAdmin /></PageLoader>} />
            <Route path="/firma/verwaltung" element={<PageLoader><Firmenverwaltung /></PageLoader>} />
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
