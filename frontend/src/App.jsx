import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./index.css";

import Header from "./components/header";
import Footer from "./components/footer";
import Landing from "./pages/Landing";
import Login from "./pages/Login";

// Heizungscockpit
import ProjectList      from "./pages/hc/ProjectList";
import ProjectDashboard from "./pages/hc/ProjectDashboard";
import HeizgruppenPage  from "./pages/hc/HeizgruppenPage";
import VentilPage       from "./pages/hc/VentilPage";
import HydraulikEditor  from "./pages/hc/HydraulikEditor";
import DruckverlustPage from "./pages/hc/DruckverlustPage";
import RavelPage        from "./pages/hc/RavelPage";

export default function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />

            {/* ── Heizungscockpit ── */}
            <Route path="/heizungscockpit"                          element={<ProjectList />} />
            <Route path="/heizungscockpit/projekte/:id"             element={<ProjectDashboard />} />
            <Route path="/heizungscockpit/projekte/:id/heizgruppen" element={<HeizgruppenPage />} />
            <Route path="/heizungscockpit/projekte/:id/schema"      element={<HydraulikEditor />} />

            {/* ── Schnell-Tools (UC2) ── */}
            <Route path="/heizungscockpit/rechner/ventil"           element={<VentilPage />} />
            <Route path="/heizungscockpit/rechner/druckverlust"     element={<DruckverlustPage />} />
            <Route path="/heizungscockpit/rechner/ravel"            element={<RavelPage />} />

            <Route path="*" element={<div className="p-8 text-center text-gray-500">404 – Seite nicht gefunden</div>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
