import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, FolderKanban, BarChart3, Building2, ShieldCheck, TrendingUp, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import logo from "../png/logo.png";

// Persistente App-Shell für alle angemeldeten Seiten: linke Navigation +
// (auf dem Handy) ein Kopf mit Schublade. Ersetzt den alten Marketing-Header.

// Grobkostenschätzung ist bewusst KEIN eigener Nav-Punkt: geschätzt wird im
// Projekt (Projekte → Projekt → Grobkostenschätzung), die Wissensbasis dafür
// ist die Auswertung (Dominic 2026-07-14).
const MAIN = [
  { to: "/start",      label: "Start",      icon: Home },
  { to: "/projekte",   label: "Projekte",   icon: FolderKanban },
  { to: "/auswertung", label: "Auswertung", icon: BarChart3 },
];

const RECHNER = [
  { to: "/rechner/ventil",       label: "Ventilauslegung" },
  { to: "/rechner/druckverlust", label: "Druckverlust" },
  { to: "/rechner/ravel",        label: "RAVEL-Wirtschaftlichkeit" },
];

function NavItem({ to, label, icon: Icon, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
        (isActive
          ? "bg-brand-50 text-brand-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
      }
    >
      {Icon ? <Icon className="size-[18px] shrink-0" strokeWidth={2} /> : <span className="size-[18px]" />}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function SidebarContent({ user, onLogout, onNavigate }) {
  const initial = (user?.name || user?.email || "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex h-full flex-col">
      {/* Marke */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-[18px]">
        <img src={logo} alt="SIREGO" className="h-8 w-auto object-contain" draggable="false" />
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900">Heizungscockpit</div>
          <div className="text-[11px] text-slate-400">SIREGO GmbH</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {MAIN.map((i) => (
          <NavItem key={i.to} {...i} onNavigate={onNavigate} />
        ))}

        <div className="pt-5">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rechner</div>
          {RECHNER.map((i) => (
            <NavItem key={i.to} {...i} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="pt-5">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Verwaltung</div>
          {/* Baupreisindex für ALLE Nutzer: jede Firma pflegt ihre eigenen Indexwerte */}
          <NavItem to="/admin/baupreisindex" label="Baupreisindex" icon={TrendingUp} onNavigate={onNavigate} />
          {(user?.role === "admin" || user?.firma_role === "admin") && (
            <NavItem to="/firma/verwaltung" label="Meine Firma" icon={Building2} onNavigate={onNavigate} />
          )}
          {user?.role === "admin" && (
            <NavItem to="/admin/benutzer" label="Plattform" icon={ShieldCheck} onNavigate={onNavigate} />
          )}
        </div>
      </nav>

      {/* Benutzer + Abmelden */}
      <div className="border-t border-slate-200 p-3">
        <NavLink to="/konto" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-100">
          <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{user?.name || "Angemeldet"}</div>
            <div className="truncate text-xs text-slate-400">{user?.email}</div>
          </div>
        </NavLink>
        <button
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <LogOut className="size-4" /> Abmelden
        </button>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const doLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop-Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-60 lg:border-r lg:border-slate-200 lg:bg-white">
        <SidebarContent user={user} onLogout={doLogout} />
      </aside>

      {/* Handy-Kopf */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 p-2 text-slate-700">
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-bold text-slate-900">Heizungscockpit</span>
      </div>

      {/* Handy-Schublade */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="size-5" />
            </button>
            <SidebarContent user={user} onLogout={doLogout} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Inhalt */}
      <div className="lg:pl-60">
        <main className="min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
