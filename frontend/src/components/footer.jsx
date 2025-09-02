// Footer.jsx
import { User } from "lucide-react";
import { useNavigate } from "react-router-dom";

function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-10 grid gap-8 md:grid-cols-3">
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Energienachweise.com</h4>
          <p className="text-sm text-slate-600 leading-relaxed">
            Vermittlungsplattform für Energieberater und Kunden.
            <br />
            Ein Tool der <span className="font-medium">SIREGO GmbH</span>.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Links</h4>
          <ul className="text-sm text-slate-600 space-y-2">
            <li><a href="#" className="hover:text-slate-900">Impressum</a></li>
            <li><a href="#" className="hover:text-slate-900">Datenschutz</a></li>
            <li><a href="#" className="hover:text-slate-900">AGB</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Kontakt</h4>
          <div className="text-sm text-slate-600 space-y-1">
            <p>info@energienachweise.com</p>
            <p>+41 44 123 45 67</p>
          </div>
        </div>
      </div>

      <div className="bg-[#EAF3FF] border-t border-blue-200">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between text-sm text-slate-700">
          <p>© 2025 Energienachweise.com – SIREGO GmbH</p>
          <button
            onClick={() => navigate("/admin")}
            className="text-slate-600 hover:text-slate-900 flex items-center"
          >
            <User className="w-4 h-4 mr-1" />
            Admin
          </button>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
