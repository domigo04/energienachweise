// Header.jsx
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

// passt den relativen Pfad an je nach Ordnerstruktur:
// Wenn Header.jsx in src/components liegt, dann "../png/…"
import logo from "../png/logo.png"; // oder: "../png/logo-sirego.svg"

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const hideLogin =
    location.pathname.startsWith("/admin-dashboard") ||
    location.pathname.startsWith("/experte-dashboard");

  // Scroll-hide / show
  const [visible, setVisible] = useState(true);
  const [justShown, setJustShown] = useState(false);
  const lastY = useRef(window.scrollY);

  useEffect(() => {
    let bounceTimer;
    const THRESHOLD = 6;
    const MIN_HIDE_Y = 64;

    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - lastY.current;

      if (y > MIN_HIDE_Y && diff > THRESHOLD && visible) {
        setVisible(false);
      } else if (diff < -THRESHOLD && !visible) {
        setVisible(true);
        setJustShown(true);
        clearTimeout(bounceTimer);
        bounceTimer = setTimeout(() => setJustShown(false), 400);
      }
      lastY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(bounceTimer);
    };
  }, [visible]);

  const handleLoginClick = () => navigate("/login");

  return (
    <header
      className={[
        "fixed top-0 left-0 right-0 z-50",
        "transition-transform duration-300 will-change-transform",
        visible ? "translate-y-0" : "-translate-y-full",
        justShown ? "animate-shy-bounce" : "",
        "bg-[#DCEBFF] border-b border-blue-200 shadow-sm",
      ].join(" ")}
    >
      <div className="mx-auto max-w-7xl p-4 px-6 md:px-8 flex justify-between items-center">
        {/* Logo + Titel (Link nach Home) */}
        <Link to="/" className="flex items-center gap-3">
          <img
  src={logo}
  alt="Energienachweise.com – SIREGO GmbH"
  className="h-9 w-auto object-contain shrink-0"
  draggable="false"
  decoding="async"
  loading="eager"
/>
          <div className="flex flex-col">
            <span className="text-lg md:text-xl font-semibold text-slate-800 tracking-tight">
              Energienachweise.com
            </span>
            <span className="text-xs md:text-sm text-slate-600">
              Ein Tool der SIREGO GmbH
            </span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex gap-6">
          <Link to="/" className="text-slate-700 hover:text-slate-900 transition">Home</Link>
          <Link to="/experte-werden" className="text-slate-700 hover:text-slate-900 transition">Experte werden</Link>
          <Link to="/admin" className="text-slate-700 hover:text-slate-900 transition">Admin</Link>
        </nav>

        {/* Login-Button (nicht auf Dashboards) */}
        {!hideLogin && (
          <button
            onClick={handleLoginClick}
            className="rounded-full bg-white text-slate-800 px-4 py-2 text-sm font-medium border border-slate-200 hover:bg-slate-50 transition"
          >
            Login
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
