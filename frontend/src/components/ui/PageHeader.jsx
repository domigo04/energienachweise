import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Einheitlicher Seitenkopf für alle Unterseiten: ein klarer «Zurück»-Weg,
// Titel, Untertitel und rechts Platz für Aktionsknöpfe. Damit sieht jede Seite
// gleich aus und man kommt von überall mit einem Klick zurück.
//
//   back  = { to: "/projekte", label: "Projekte" }   (optional)
//   title, subtitle, actions (React-Knoten, optional)
export default function PageHeader({ back, title, subtitle, actions, children }) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600"
        >
          <ArrowLeft className="size-4" /> {back.label || "Zurück"}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {title && <h1 className="text-2xl font-bold text-slate-900">{title}</h1>}
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
