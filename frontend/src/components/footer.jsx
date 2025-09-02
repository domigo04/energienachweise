import React from 'react';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="bg-white rounded-t-xl shadow-lg mt-auto p-6">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <h4 className="font-bold text-gray-800 mb-3">Energienachweise</h4>
          <p className="text-sm text-gray-600">
            Vermittlungsplattform für Energieberater und Kunden.
          </p>
        </div>
        <div>
          <h4 className="font-bold text-gray-800 mb-3">Links</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li><a href="#" className="hover:text-blue-600">Impressum</a></li>
            <li><a href="#" className="hover:text-blue-600">Datenschutz</a></li>
            <li><a href="#" className="hover:text-blue-600">AGB</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-gray-800 mb-3">Kontakt</h4>
          <div className="text-sm text-gray-600 space-y-1">
            <p>info@priv-control.ch</p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 mt-6 pt-4 flex justify-between items-center">
        <p className="text-sm text-gray-600">© 2025 SIREGO GmbH</p>
        <button
          onClick={() => navigate("/admin")}
          className="text-gray-500 hover:text-gray-700 text-sm flex items-center"
        >
          <User className="w-4 h-4 mr-1" />
          Admin
        </button>
      </div>
    </footer>
  );
}

export default Footer;
