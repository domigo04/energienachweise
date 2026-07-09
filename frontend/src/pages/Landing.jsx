import { Link } from "react-router-dom";

// Erste Landing-Page für energienachweise.com (Dominic-Feedback: «zeig schon mal,
// was kommt, optisch sauber, mit Login»). Login-Seite folgt — der Button ist
// schon da und führt vorerst ins Cockpit.
const FEATURES = [
  { icon: "🗺️", titel: "Lebendes Anlagenschema", text: "Zeichne die Heizung einmal — das Schema ist die Datenbank. Bauteile tragen ihre Auslegung selbst." },
  { icon: "💧", titel: "Hydraulik automatisch", text: "Volumenströme, Ventile, Pumpen, Expansionsgefäss und Leitungs-Dimension rechnen im Hintergrund." },
  { icon: "📄", titel: "PDF-Dokumentation", text: "Deckblatt, Vektor-Schema, Legende und Berechnungen — auf Knopfdruck als sauberes PDF." },
  { icon: "💰", titel: "Kostenschätzung (KV)", text: "Reale Devis nach Gebäudekategorie auswerten und daraus schnelle, belegte Kostenschätzungen ziehen." },
];

export default function Landing() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-red-600/20 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
          <span className="inline-block rounded-full border border-red-400/40 bg-red-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-red-300">
            SIREGO · in Entwicklung
          </span>
          <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            Heizungs<span className="text-red-500">cockpit</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            Die Engineering-Plattform für die Heizungsplanung — ein lebendes Anlagenschema,
            das rechnet, dokumentiert und irgendwann auch deine Kosten schätzt.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link to="/login"
              className="rounded-lg bg-red-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500">
              Anmelden / Registrieren
            </Link>
            <Link to="/start"
              className="rounded-lg border border-slate-600 px-7 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white">
              Zum Cockpit →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-slate-400">Was dich erwartet</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.titel} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition hover:border-red-300 hover:shadow-md">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{f.titel}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA-Streifen */}
      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Zugang nur auf Anfrage</h2>
          <p className="max-w-xl text-sm text-slate-600">
            Registriere dich mit E-Mail und Passwort — die Freischaltung erfolgt nach kurzer Prüfung.
            Deine Projekte und Daten bleiben privat.
          </p>
          <Link to="/login" className="mt-2 rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
            Anfrage stellen
          </Link>
        </div>
      </section>
    </div>
  );
}
