// src/components/Header.jsx
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Menu, X, LogIn } from "lucide-react";
import logo from "../png/logo.png";

// Konstant: Headerhöhe (muss mit Spacer unten matchen)
const HEADER_H_CLASSES = "h-16 md:h-20";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  // Login auf Dashboards ausblenden
  const hideLogin =
    location.pathname.startsWith("/admin-dashboard") ||
    location.pathname.startsWith("/experte-dashboard");

  // Mobile-Menü
  const [open, setOpen] = useState(false);

  // Scroll-hide/show (Headroom-light)
  const [visible, setVisible] = useState(true);
  const lastY = useRef(typeof window !== "undefined" ? window.scrollY : 0);

  useEffect(() => {
    const THRESHOLD = 4;   // wie sensibel die Reaktion
    const MIN_Y = 64;      // ab wann überhaupt ausblenden
    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - lastY.current;
      if (y > MIN_Y && diff > THRESHOLD && visible) setVisible(false);
      else if (diff < -THRESHOLD && !visible) setVisible(true);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  // aktive Link-Stile
  const navLinkCls = ({ isActive }) =>
    [
      "text-sm md:text-base transition rounded-xl px-3 py-2",
      isActive
        ? "text-slate-900 bg-white/60"
        : "text-slate-700 hover:text-slate-900 hover:bg-white/40",
    ].join(" ");

  const NAV = [
    { to: "/", label: "Home" },
    { to: "/hx-diagramm", label: "h–x Diagramm" }, // ⬅️ NEU
    { to: "/experte-werden", label: "Experte werden" },
    { to: "/admin", label: "Admin" },
  ];

  const onLogin = () => navigate("/login");

  return (
    <>
      <header
        className={[
          "fixed inset-x-0 top-0 z-50",
          "transition-transform duration-300 will-change-transform",
          visible ? "translate-y-0" : "-translate-y-full",
          // Glass + Gradient
          "backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/90",
          "border-b border-slate-200/70 shadow-sm",
        ].join(" ")}
      >
        <div className={`mx-auto max-w-7xl ${HEADER_H_CLASSES} px-4 md:px-6`}>
          <div className="w-full h-full flex items-center justify-between">
            {/* Logo + Titel */}
            <Link to="/" className="flex items-center gap-3">
              <img
                src={logo}
                alt="Energienachweise.com – SIREGO GmbH"
                className="h-8 md:h-10 w-auto object-contain select-none"
                draggable="false"
                decoding="async"
                loading="eager"
              />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-base md:text-lg font-semibold text-slate-800 tracking-tight">
                  Energienachweise.com
                </span>
                <span className="text-[11px] md:text-xs text-slate-600">
                  Ein Tool der SIREGO GmbH
                </span>
              </div>
            </Link>

            {/* Desktop-Navi */}
            <nav className="hidden md:flex items-center gap-2">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={navLinkCls} end>
                  {n.label}
                </NavLink>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!hideLogin && (
                <button
                  onClick={onLogin}
                  className="hidden md:inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 transition"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
              )}
              {/* Mobile Toggle */}
              <button
                aria-label="Menü öffnen"
                className="md:hidden inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-3 py-2"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile-Menü (Dropdown unter dem Header) */}
        <div
          className={[
            "md:hidden overflow-hidden transition-[max-height] duration-300",
            open ? "max-h-64" : "max-h-0",
            "bg-white/90 backdrop-blur border-t border-slate-200/70",
          ].join(" ")}
        >
          <nav className="px-4 py-3 flex flex-col gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  [
                    "rounded-lg px-3 py-2",
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")
                }
                onClick={() => setOpen(false)}
                end
              >
                {n.label}
              </NavLink>
            ))}

            {!hideLogin && (
              <button
                onClick={() => {
                  setOpen(false);
                  onLogin();
                }}
                className="mt-1 rounded-lg px-3 py-2 text-left bg-slate-900 text-white"
              >
                Login
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Spacer: sorgt dafür, dass Content nicht unter den fixed Header rutscht. */}
      <div aria-hidden className={`${HEADER_H_CLASSES}`} />
    </>
  );
}
