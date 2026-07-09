// Mehrfach-Auswahl als Pills (Häkchen-System) — für Wärmeerzeuger/-abgabe.
export default function CheckboxGruppe({ label, options, value = [], onChange }) {
  const toggle = (opt) => {
    const set = new Set(value);
    set.has(opt) ? set.delete(opt) : set.add(opt);
    onChange([...set]);
  };
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = value.includes(opt);
          return (
            <button
              type="button"
              key={opt}
              onClick={() => toggle(opt)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm transition " +
                (on
                  ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {on ? "✓ " : ""}{opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
