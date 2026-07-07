import { useState } from "react";
import { Link } from "react-router-dom";

// Login/Registrieren — vorerst nur die Oberfläche (Design). Die echte Anmeldung
// (Registrierung → Freischalt-Mail an den Admin → Zugang) kommt im Login-Schritt.
export default function Login() {
  const [modus, setModus] = useState("login"); // login | register
  const [gesendet, setGesendet] = useState(false);

  const feld = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500";
  const tab = (aktiv) =>
    `flex-1 rounded-lg py-2 text-sm font-semibold transition ${aktiv ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">← Startseite</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Heizungs<span className="text-red-600">cockpit</span>
        </h1>

        <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
          <button className={tab(modus === "login")} onClick={() => { setModus("login"); setGesendet(false); }}>Anmelden</button>
          <button className={tab(modus === "register")} onClick={() => { setModus("register"); setGesendet(false); }}>Registrieren</button>
        </div>

        {gesendet ? (
          <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            ✓ Anfrage gesendet. Du wirst nach kurzer Prüfung freigeschaltet und per E-Mail informiert.
          </div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); if (modus === "register") setGesendet(true); }}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">E-Mail</label>
              <input type="email" required placeholder="name@firma.ch" className={feld} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Passwort</label>
              <input type="password" required placeholder="••••••••" className={feld} />
            </div>
            {modus === "register" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Passwort wiederholen</label>
                <input type="password" required placeholder="••••••••" className={feld} />
              </div>
            )}
            <button type="submit" className="mt-2 w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">
              {modus === "login" ? "Anmelden" : "Anfrage abschicken"}
            </button>
            <p className="pt-1 text-center text-xs text-slate-400">
              {modus === "login" ? "Noch kein Zugang? Oben auf «Registrieren»." : "Zugang erst nach Freischaltung durch den Admin."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
