import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Header from "./components/header";
import Footer from "./components/footer";

import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
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
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/experte-werden" element={<ExpertRegister />} />
            <Route path="/kunden-registrierung" element={<CustomerRegister />} />

            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin" element={<Navigate to="/admin-login" replace />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/admin/experten/:id" element={<ExpertenDetail />} />

            <Route path="/experte-dashboard" element={<ExpertDashboard />} />
            <Route path="/kunde-dashboard" element={<CustomerDashboard />} />
            <Route path="/projekt-erstellen" element={<ProjektErstellen />} />
            <Route path="/profil" element={<ExpertProfile />} />

            <Route path="*" element={<div className="p-8 text-center">404 – Seite nicht gefunden</div>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
