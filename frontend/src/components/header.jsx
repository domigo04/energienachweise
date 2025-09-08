// src/components/header.jsx
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Menu, X, LogIn, ChevronDown } from "lucide-react";
import logo from "../png/logo.png";

const HEADER_H_CLASSES = "h-16 md:h-20";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const hideLogin =
    location.pathname.startsWith("/admin-dashboard") ||
    location.pathname.startsWith("/experte-dashboard");

  const [open, setOpen] = useState(false);

  // Tools Dropdown
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const closeTimer = useRef(null);

  // Scroll-hide/show
  const [visible, setVisible] = useState(true);
  const lastY = useRef(typeof window !== "undefined" ? window.scrollY : 0);

  useEffect(() => {
    const THRESHOLD = 4;
    const MIN_Y = 64;
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

  // Outside-Click schließt Tools
  useEffect(() => {
    const onDocDown = (e) => {
      if (!toolsRef.current) return;
      if (!toolsRef.current.contains(e.target)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // Bei Route-Wechsel alles schließen
  useEffect(() => {
    setToolsOpen(false);
    setOpen(false);
  }, [location.pathname]);

  // Escape zum Schließen
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setToolsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Helpers für Delay-Schließen
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setToolsOpen(false), 200);
  };

  const navLinkCls = ({ isActive }) =>
    [
      "text-sm md:text-base transition rounded-xl px-3 py-2",
      isActive
        ? "text-slate-900 bg-white/60"
        : "text-slate-700 hover:text-slate-900 hover:bg-white/40",
    ].join(" ");

  const NAV = [
    { to: "/", label: "Home" },
    { to: "/experte-werden", label: "Experte werden" },
    { to: "/admin", label: "Admin" },
  ];

  const TOOLS = [
    { to: "/hx-diagramm", label: "h–x Diagramm" },
    { to: "/warmwasser-tool", label: "Warmwasser Tool" },
  ];

  const onLogin = () => navigate("/login");

  return (
    <>
      <header
        className={[
          "fixed inset-x-0 top-0 z-50",
          "transition-transform duration-300 will-change-transform",
          visible ? "translate-y-0" : "-translate-y-full",
          "backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/90",
          "border-b border-slate-200/70 shadow-sm",
        ].join(" ")}
      >
        <div className={`mx-auto max-w-7xl ${HEADER_H_CLASSES} px-4 md:px-6`}>
          <div className="w-full h-full flex items-center justify-between">
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

              {/* Tools Dropdown (Desktop) */}
              <div ref={toolsRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    cancelClose();
                    setToolsOpen((v) => !v);
                  }}
                  onMouseEnter={() => {
                    cancelClose();
                    setToolsOpen(true);
                  }}
                  onMouseLeave={scheduleClose}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      cancelClose();
                      setToolsOpen((v) => !v);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm md:text-base text-slate-700 hover:text-slate-900 hover:bg-white/40 transition"
                  aria-expanded={toolsOpen}
                  aria-haspopup="menu"
                  aria-controls="tools-menu"
                >
                  Tools
                  <ChevronDown className={`w-4 h-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Hover-Bridge + Dropdown Wrapper */}
                <div
                  className={[
                    "absolute right-0 top-full pt-2 z-50", // pt-2 = unsichtbare Brücke
                    toolsOpen ? "pointer-events-auto" : "pointer-events-none",
                  ].join(" ")}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                >
                  <div
                    id="tools-menu"
                    role="menu"
                    tabIndex={-1}
                    className={[
                      "w-56 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg",
                      "transition transform origin-top-right",
                      toolsOpen ? "scale-100 opacity-100" : "scale-95 opacity-0",
                    ].join(" ")}
                  >
                    <div className="py-2">
                      {TOOLS.map((t) => (
                        <NavLink
                          key={t.to}
                          to={t.to}
                          role="menuitem"
                          className={({ isActive }) =>
                            [
                              "block px-3 py-2 text-sm rounded-lg mx-2",
                              isActive
                                ? "bg-slate-100 text-slate-900"
                                : "text-slate-700 hover:bg-slate-50",
                            ].join(" ")
                          }
                          onClick={() => setToolsOpen(false)}
                          end
                        >
                          {t.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
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

        {/* Mobile-Menü */}
        <div
          className={[
            "md:hidden overflow-hidden transition-[max-height] duration-300",
            open ? "max-h-96" : "max-h-0",
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

            <MobileTools />
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

      <div aria-hidden className={`${HEADER_H_CLASSES}`} />
    </>
  );

  function MobileTools() {
    const [openTools, setOpenTools] = useState(false);
    return (
      <div className="mt-1">
        <button
          className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
          onClick={() => setOpenTools((v) => !v)}
          aria-expanded={openTools}
          aria-controls="tools-mobile"
        >
          <span>Tools</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${openTools ? "rotate-180" : ""}`} />
        </button>
        <div
          id="tools-mobile"
          className={[
            "grid transition-[grid-template-rows] duration-300",
            openTools ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            {TOOLS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  [
                    "block rounded-lg px-3 py-2 ml-3 mr-1",
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")
                }
                onClick={() => setOpen(false)}
                end
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
