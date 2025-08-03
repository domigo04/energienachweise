import { Link, useNavigate, useLocation } from "react-router-dom";

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLoginClick = () => {
    navigate("/login");
  };

  // Wenn auf einem Dashboard, Login-Button ausblenden
  const hideLogin =
    location.pathname.startsWith("/admin-dashboard") ||
    location.pathname.startsWith("/experte-dashboard");

  return (
    <header className="bg-white shadow-md p-4 px-6 md:px-12 flex justify-between items-center sticky top-0 z-50">
      {/* Logo + Untertitel */}
      <Link to="/" className="flex flex-col">
        <span className="text-2xl font-bold text-blue-600 tracking-tight">Priv-Control</span>
        <span className="text-sm text-gray-500 -mt-1">Energienachweis-Vermittlung</span>
      </Link>

      {/* Navigation */}
      <nav className="hidden md:flex space-x-6">
        <Link to="/" className="text-gray-700 hover:text-blue-600 transition">Home</Link>
        <Link to="/experte-werden" className="text-gray-700 hover:text-blue-600 transition">Experte werden</Link>
        <Link to="/admin" className="text-gray-700 hover:text-blue-600 transition">Admin</Link>
      </nav>

      {/* Login-Button nur anzeigen, wenn NICHT im Dashboard */}
      {!hideLogin && (
        <button
          onClick={handleLoginClick}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          Login
        </button>
      )}
    </header>
  );
}

export default Header;
