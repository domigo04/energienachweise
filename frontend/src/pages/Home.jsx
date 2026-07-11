import { Link } from "react-router-dom";
import { FolderKanban, BarChart3, Calculator, ArrowRight } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const CARDS = [
  {
    to: "/projekte",
    icon: FolderKanban,
    title: "Projekte",
    text: "Anlagen planen: Schema zeichnen, Heizgruppen auslegen und je Projekt eine Grobkostenschätzung erstellen.",
    cta: "Zu den Projekten",
  },
  {
    to: "/auswertung",
    icon: BarChart3,
    title: "Auswertung",
    text: "Reale Projekte mit ihren BKP-Kosten erfassen — deine firmenweite Wissensdatenbank für Kennwerte.",
    cta: "Zur Auswertung",
  },
  {
    to: "/rechner/ventil",
    icon: Calculator,
    title: "Rechner",
    text: "Schnelle Einzelrechner: Ventilauslegung, Druckverlust und RAVEL-Wirtschaftlichkeit.",
    cta: "Zu den Rechnern",
  },
];

export default function Home() {
  const { user } = useAuth();
  const vorname = (user?.name || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <header className="mb-8">
        <p className="text-sm font-medium text-brand-600">Heizungscockpit</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Willkommen{vorname ? `, ${vorname}` : ""}.
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Deine Engineering-Plattform für die Heizungsplanung. Wähle einen Bereich, um loszulegen.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(({ to, icon: Icon, title, text, cta }) => (
          <Link
            key={to}
            to={to}
            className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
              <Icon className="size-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{text}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
              {cta} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      {/* Kurz erklärt: wie Auswertung und Kostenschätzung zusammenspielen */}
      <div className="card mt-8 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">So hängt es zusammen</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-800">1 · Auswertung befüllen</div>
            <p className="mt-1 text-sm text-slate-500">
              Erfasse abgeschlossene Projekte mit ihren echten BKP-Kosten. Je mehr Referenzen, desto verlässlicher.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-800">2 · Grobkostenschätzung ziehen</div>
            <p className="mt-1 text-sm text-slate-500">
              In einem Projekt vergleicht das Tool deine Eingaben mit ähnlichen Referenzen und zeigt Bandbreite und Vertrauen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
