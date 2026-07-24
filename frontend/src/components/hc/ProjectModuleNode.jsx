import React, { forwardRef } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";

// §12/§13 — ein Modul des Project Universe als Node/Kachel. Bewusst technisch,
// SIREGO-nah: feine Border, dezenter Statuspunkt, kleine Kennzahl. Keine
// Farbverläufe, keine Neonfarben (§38).

// Statusfarbwelt aus §13. `dot` = Statuspunkt, `ring` = Rahmen bei Hervorhebung.
const STATUS = {
  not_started: { label: "nicht begonnen", dot: "bg-slate-300", text: "text-slate-400" },
  in_progress: { label: "in Bearbeitung", dot: "bg-blue-500", text: "text-blue-600" },
  incomplete: { label: "unvollständig", dot: "bg-amber-500", text: "text-amber-600" },
  complete: { label: "bereit", dot: "bg-green-500", text: "text-green-600" },
  warning: { label: "Warnung", dot: "bg-orange-500", text: "text-orange-600" },
  error: { label: "Fehler", dot: "bg-red-500", text: "text-red-600" },
  stale: { label: "veraltet", dot: "bg-orange-500", text: "text-orange-600" },
  released: { label: "freigegeben", dot: "bg-violet-500", text: "text-violet-600" },
};

const ProjectModuleNode = forwardRef(function ProjectModuleNode(
  { title, icon: Icon, status = "not_started", statusLabel, metric, secondaryMetric,
    to, onClick, warnings = 0, isStale = false, dimmed = false, active = false,
    onMouseEnter, onMouseLeave },
  ref,
) {
  const s = STATUS[status] || STATUS.not_started;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Icon className="size-4" />
            </div>
          )}
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</span>
        </div>
        <span className={`size-2.5 shrink-0 rounded-full ${s.dot}`} title={statusLabel || s.label} />
      </div>

      <div className="mt-3 min-h-8">
        {metric != null && <div className="text-lg font-bold leading-tight text-slate-900">{metric}</div>}
        {secondaryMetric != null && <div className="text-xs text-slate-500">{secondaryMetric}</div>}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
        <span className={s.text}>{statusLabel || s.label}</span>
        {warnings > 0 && (
          <span className="inline-flex items-center gap-0.5 text-orange-600">
            <AlertTriangle className="size-3" /> {warnings}
          </span>
        )}
        {isStale && (
          <span className="inline-flex items-center gap-0.5 text-orange-600">
            <Clock className="size-3" /> veraltet
          </span>
        )}
      </div>
    </>
  );

  const interaktiv = Boolean(to || onClick);
  const cls =
    "block w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition " +
    (active ? "border-brand-400 ring-2 ring-brand-100 " : "border-slate-200 ") +
    (dimmed ? "opacity-40 " : "opacity-100 ") +
    (interaktiv ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md " : "");

  const shared = { ref, className: cls, onMouseEnter, onMouseLeave };
  if (to) return <Link to={to} {...shared}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} {...shared}>{inner}</button>;
  return <div {...shared}>{inner}</div>;
});

export default ProjectModuleNode;
