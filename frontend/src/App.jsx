import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

// Layout-Komponenten
import Header from "./components/header";
import Footer from "./components/Footer";

// Seiten
import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import ExpertDashboard from "./pages/ExpertDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import ProjektErstellen from "./pages/ProjektErstellen";
import ExpertRegister from "./pages/ExpertRegister";
import CustomerRegister from "./pages/CustomerRegister";
import ExpertProfile from "./pages/ExpertProfile";
import ExpertenDetail from "./pages/ExpertenDetail";

export default function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        {/* Header immer oben */}
        <Header />

        {/* Seiteninhalt */}
        <main className="flex-grow">
          <Routes>
            {/* Public */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/experte-werden" element={<ExpertRegister />} />
            <Route path="/kunden-registrierung" element={<CustomerRegister />} />

            {/* Dashboards */}
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/experte-dashboard" element={<ExpertDashboard />} />
            <Route path="/kunde-dashboard" element={<CustomerDashboard />} />
            <Route path="/projekt-erstellen" element={<ProjektErstellen />} />
            <Route path="/profil" element={<ExpertProfile />} />
            <Route path="/admin/experten/:id" element={<ExpertenDetail />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer immer unten */}
        <Footer />
      </div>
    </Router>
  );
}
