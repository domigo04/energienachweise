import { ANLAGENKONFIGURATIONEN } from "../../data/kv";

// Einzel-Auswahl der Anlagenkonfiguration mit erklärendem Hinweistext —
// gemeinsam genutzt von Auswertungs-Formular und Kostenschätzung.
export default function AnlagenkonfigurationAuswahl({ value, onChange }) {
  const aktuelle = ANLAGENKONFIGURATIONEN.find((k) => k.value === value);
  return (
    <div>
      <label className="label">Anlagenkonfiguration</label>
      <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {ANLAGENKONFIGURATIONEN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      {aktuelle && <p className="mt-1 text-xs text-slate-400">{aktuelle.hinweis}</p>}
    </div>
  );
}
