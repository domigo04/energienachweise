// Mehrfach-Auswahl als Pills (Häkchen-System) — für Wärmeerzeuger/-abgabe.
export default function CheckboxGruppe({ label, options, value = [], onChange }) {
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
    <div>
      {label && <label className="label">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const key = typeof opt === "string" ? opt : opt.value;
          const text = typeof opt === "string" ? opt : opt.label;
          const on = value.includes(key)
            || (typeof opt !== "string" && (opt.aliases || []).some((alias) => value.includes(alias)));
          return (
            <button
              type="button"
              key={key}
              onClick={() => toggle(opt)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm transition " +
                (on
                  ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {on ? "✓ " : ""}{text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
