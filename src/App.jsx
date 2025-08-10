import React from "react";
import "./index.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Header from "./components/header";
import Footer from "./components/footer";

// Seiten
import HomePage from "./pages/common/HomePage";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ExpertRegister from "./pages/experte/ExpertRegister";
import Login from "./pages/common/Login";
import ExpertDashboard from "./pages/experte/ExpertDashboard";
import ExpertProfile from "./pages/experte/ExpertProfile";
import ExpertenDetail from "./pages/admin/ExpertenDetail";
import CustomerRegister from "./pages/kunde/CustomerRegister";
import CustomerDashboard from "./pages/kunde/CustomerDashboard";
import ProjektErstellen from "./pages/kunde/ProjektErstellen";

// Auth-Wrapper
import PrivateRouteAdmin from "./components/PrivateRouteAdmin";
import PrivateRouteExperte from "./components/PrivateRouteExperte";
import PrivateRouteKunde from "./components/PrivateRouteKunde";

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen text-gray-800">
        <Header />

        <main className="flex-1 px-6 mt-8">
          <Routes>
            {/* Öffentliche Seiten */}
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/experte-werden" element={<ExpertRegister />} />
            <Route path="/login" element={<Login />} />
            <Route path="/kunden-registrierung" element={<CustomerRegister />} />

            {/* Admin-Routen (geschützt) */}
            <Route path="/admin-dashboard" element={
              <PrivateRouteAdmin><AdminDashboard /></PrivateRouteAdmin>
            } />
            <Route path="/admin/experten/:id" element={<ExpertenDetail />} />


            {/* Experten-Routen (geschützt) */}
            <Route path="/experte-dashboard" element={
              <PrivateRouteExperte><ExpertDashboard /></PrivateRouteExperte>
            } />
            <Route path="/profil" element={
              <PrivateRouteExperte><ExpertProfile /></PrivateRouteExperte>
            } />

            {/* Kunden-Routen (geschützt) */}
            <Route path="/kunde-dashboard" element={
              <PrivateRouteKunde><CustomerDashboard /></PrivateRouteKunde>
            } />
            <Route path="/projekt-erstellen" element={
              <PrivateRouteKunde><ProjektErstellen /></PrivateRouteKunde>
            } />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
