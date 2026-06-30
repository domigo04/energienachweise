import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import logo from "../png/logo.png";

const RECHNER = [
  { to: "/heizungscockpit/hydraulik",             label: "Hydraulik-Editor" },
  { to: "/heizungscockpit/rechner/ventil",        label: "Ventilauslegung (M3)" },
  { to: "/heizungscockpit/rechner/druckverlust",  label: "Druckverlust (M4)" },
  { to: "/heizungscockpit/rechner/ravel",         label: "RAVEL-Wirtschaftlichkeit (M10)" },
];

export default function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [rechnerOpen, setRechnerOpen] = useState(false);
  const [mobileRechnerOpen, setMobileRechnerOpen] = useState(false);
  const dropRef = useRef(null);
  const closeTimer = useRef(null);

  // Scroll-hide
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > 64 && y - lastY.current > 4 && visible) setVisible(false);
      else if (y - lastY.current < -4 && !visible) setVisible(true);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setRechnerOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { setMobileOpen(false); setRechnerOpen(false); }, [location.pathname]);

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setRechnerOpen(false), 180); };

  const linkCls = ({ isActive }) =>
    "text-sm transition rounded-lg px-3 py-2 " +
    (isActive ? "text-slate-900 bg-white/60" : "text-slate-700 hover:text-slate-900 hover:bg-white/40");

  // Heizungscockpit-Seiten: keine Marketplace-Navigation zeigen
  const isHC = location.pathname.startsWith("/heizungscockpit");

  return (
    <>
      <header className={[
        "fixed inset-x-0 top-0 z-50 transition-transform duration-300",
        visible ? "translate-y-0" : "-translate-y-full",
        "backdrop-blur bg-white/90 border-b border-slate-200/70 shadow-sm",
      ].join(" ")}>
        <div className="mx-auto max-w-7xl h-16 px-4 md:px-6 flex items-center justify-between">

          {/* Logo */}
          <Link to="/heizungscockpit" className="flex items-center gap-3">
            <img src={logo} alt="SIREGO" className="h-8 w-auto object-contain" draggable="false" />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-base font-semibold text-slate-800 tracking-tight">Heizungscockpit</span>
              <span className="text-[11px] text-slate-500">SIREGO GmbH</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/heizungscockpit" end className={linkCls}>
              Projekte
            </NavLink>

            {/* Rechner Dropdown */}
            <div ref={dropRef} className="relative">
              <button
                onClick={() => { cancelClose(); setRechnerOpen(v => !v); }}
                onMouseEnter={() => { cancelClose(); setRechnerOpen(true); }}
                onMouseLeave={scheduleClose}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-700 hover:text-slate-900 hover:bg-white/40 transition"
                aria-expanded={rechnerOpen}
              >
                Rechner
                <ChevronDown className={`w-4 h-4 transition-transform ${rechnerOpen ? "rotate-180" : ""}`} />
              </button>

              <div
                className={[
                  "absolute left-0 top-full pt-2 z-50 transition-all",
                  rechnerOpen ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1",
                ].join(" ")}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                <div className="w-64 rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg py-2">
                  {RECHNER.map(r => (
                    <NavLink
                      key={r.to} to={r.to}
                      className={({ isActive }) =>
                        "block px-4 py-2.5 text-sm rounded-lg mx-2 " +
                        (isActive ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50")
                      }
                    >
                      {r.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg border border-slate-200"
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        <div className={[
          "md:hidden overflow-hidden transition-[max-height] duration-300",
          mobileOpen ? "max-h-72" : "max-h-0",
          "bg-white/95 border-t border-slate-200/70",
        ].join(" ")}>
          <nav className="px-4 py-3 flex flex-col gap-1">
            <NavLink to="/heizungscockpit" end
              className={({ isActive }) => "rounded-lg px-3 py-2 text-sm " + (isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50")}>
              Projekte
            </NavLink>

            <button
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setMobileRechnerOpen(v => !v)}
            >
              <span>Rechner</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${mobileRechnerOpen ? "rotate-180" : ""}`} />
            </button>

            <div className={["overflow-hidden transition-[max-height] duration-200", mobileRechnerOpen ? "max-h-40" : "max-h-0"].join(" ")}>
              {RECHNER.map(r => (
                <NavLink key={r.to} to={r.to}
                  className={({ isActive }) => "block rounded-lg px-3 py-2 ml-4 text-sm " + (isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}>
                  {r.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <div aria-hidden className="h-16" />
    </>
  );
}
