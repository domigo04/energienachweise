import { Check } from "lucide-react";

// Kompakte Mehrfach-Auswahl für kontrollierte Fachwerte. Die Optionen kommen
// aus der Backend-Registry; String-Optionen bleiben nur für alte Aufrufer
// kompatibel.
export default function CheckboxGruppe({ label, options = [], value = [], onChange, disabled = false, hint }) {
  const toggle = (opt) => {
    const key = typeof opt === "string" ? opt : opt.value;
    const aliases = typeof opt === "string" ? [] : (opt.aliases || []);
    const set = new Set(value);
    const active = set.has(key) || aliases.some((alias) => set.has(alias));
    aliases.forEach((alias) => set.delete(alias));
    active ? set.delete(key) : set.add(key);
    onChange([...set]);
  };
  return (
    <fieldset disabled={disabled} className="min-w-0">
      {label && <legend className="label mb-1.5">{label}</legend>}
      {hint && <p className="mb-2 text-xs leading-5 text-slate-500">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const key = typeof opt === "string" ? opt : (opt.value ?? opt.code);
          const text = typeof opt === "string" ? opt : opt.label;
          const on = value.includes(key)
            || (typeof opt !== "string" && (opt.aliases || []).some((alias) => value.includes(alias)));
          return (
            <button
              type="button"
              key={key}
              onClick={() => toggle(opt)}
              aria-pressed={on}
              className={
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 " +
                (on
                  ? "border-brand-300 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
              }
            >
              <span className={"flex size-4 items-center justify-center rounded border "
                + (on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white")}
                aria-hidden="true">
                {on ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              {text}
            </button>
          );
        })}
        {!options.length && <span className="text-sm text-slate-400">Auswahlliste wird geladen…</span>}
      </div>
    </fieldset>
  );
}
