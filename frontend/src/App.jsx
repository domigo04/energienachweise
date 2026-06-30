import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Header from "./components/header";
import Footer from "./components/footer";

// Heizungscockpit — Hauptapp
import ProjectList      from "./pages/hc/ProjectList";
import ProjectDashboard from "./pages/hc/ProjectDashboard";
import HeizgruppenPage  from "./pages/hc/HeizgruppenPage";
import VentilPage          from "./pages/hc/VentilPage";
import HydraulikEditor    from "./pages/hc/HydraulikEditor";
import DruckverlustPage from "./pages/hc/DruckverlustPage";
import RavelPage        from "./pages/hc/RavelPage";

// Marketplace — geparkt (Routen erreichbar, aber nicht verlinkt)
import Login            from "./pages/Login";
import AdminLogin       from "./pages/AdminLogin";
import AdminDashboard   from "./pages/AdminDashboard";
import ExpertDashboard  from "./pages/ExpertDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import ProjektErstellen from "./pages/ProjektErstellen";
import ExpertRegister   from "./pages/ExpertRegister";
import CustomerRegister from "./pages/CustomerRegister";
import ExpertProfile    from "./pages/ExpertProfile";
import ExpertenDetail   from "./pages/ExpertenDetail";

// Tools (vorhanden, vorerst nicht im Nav)
import HxDiagramPage  from "./pages/HxDiagramPage";
import WarmwasserTool from "./pages/WarmwasserTool";
import CoolingCalc    from "./pages/CoolingCalc";

export default function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow">
          <Routes>
            {/* Root → Heizungscockpit */}
            <Route path="/" element={<Navigate to="/heizungscockpit" replace />} />

            {/* ── Heizungscockpit ── */}
            <Route path="/heizungscockpit"                              element={<ProjectList />} />
            <Route path="/heizungscockpit/projekte/:id"                 element={<ProjectDashboard />} />
            <Route path="/heizungscockpit/projekte/:id/heizgruppen"     element={<HeizgruppenPage />} />
            <Route path="/heizungscockpit/rechner/ventil"               element={<VentilPage />} />
            <Route path="/heizungscockpit/hydraulik"                    element={<HydraulikEditor />} />
            <Route path="/heizungscockpit/rechner/druckverlust"         element={<DruckverlustPage />} />
            <Route path="/heizungscockpit/rechner/ravel"                element={<RavelPage />} />

            {/* ── Tools (direkt per URL erreichbar) ── */}
            <Route path="/hx-diagramm"    element={<HxDiagramPage />} />
            <Route path="/warmwasser-tool" element={<WarmwasserTool />} />
            <Route path="/kuehllast"       element={<CoolingCalc />} />

            {/* ── Marketplace geparkt (nicht verlinkt, aber erreichbar) ── */}
            <Route path="/login"                  element={<Login />} />
            <Route path="/admin-login"            element={<AdminLogin />} />
            <Route path="/admin"                  element={<Navigate to="/admin-login" replace />} />
            <Route path="/admin-dashboard"        element={<AdminDashboard />} />
            <Route path="/admin/experten/:id"     element={<ExpertenDetail />} />
            <Route path="/experte-dashboard"      element={<ExpertDashboard />} />
            <Route path="/kunde-dashboard"        element={<CustomerDashboard />} />
            <Route path="/projekt-erstellen"      element={<ProjektErstellen />} />
            <Route path="/experte-werden"         element={<ExpertRegister />} />
            <Route path="/kunden-registrierung"   element={<CustomerRegister />} />
            <Route path="/profil"                 element={<ExpertProfile />} />

            <Route path="*" element={<div className="p-8 text-center text-gray-500">404 – Seite nicht gefunden</div>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
