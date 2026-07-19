// Gewerk-Umschalter für Auswertung + Grobkostenschätzung. Heute rechnet nur
// «Heizung»; Sanitär/Kälte/Lüftung sind sichtbar vorbereitet, aber als «Bald»
// ausgegraut — so ist der Ausbau-Plan für andere Gewerke sofort erkennbar,
// ohne dass schon etwas dahinter funktionieren muss.
const GEWERKE = [
  { key: "heizung", label: "Heizung", bald: false },
  { key: "sanitaer", label: "Sanitär", bald: true },
  { key: "kaelte", label: "Kälte", bald: true },
  { key: "lueftung", label: "Lüftung", bald: true },
];

export default function GewerkLeiste({ aktiv = "heizung", className = "" }) {
  return (
    <div className={"flex flex-wrap items-center gap-1.5 " + className}>
      {GEWERKE.map((g) => {
        const istAktiv = g.key === aktiv && !g.bald;
        return (
          <button
            key={g.key}
            type="button"
            disabled={g.bald}
            aria-current={istAktiv ? "page" : undefined}
            title={g.bald ? "Dieses Gewerk kommt später" : undefined}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition " +
              (istAktiv
                ? "bg-brand-600 text-white shadow-sm"
                : g.bald
                  ? "cursor-not-allowed border border-dashed border-slate-200 bg-slate-50 text-slate-400"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            {g.label}
            {g.bald && (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Bald
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
