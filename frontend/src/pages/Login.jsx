import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// Login / Registrieren gegen das echte Backend. Registrieren erzeugt ein
// unbestätigtes Konto — die Freischaltung erfolgt durch den Admin.
export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [modus, setModus] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [gesendet, setGesendet] = useState("");
  const [busy, setBusy] = useState(false);

  const tab = (aktiv) =>
    `flex-1 rounded-lg py-2 text-sm font-semibold transition ${aktiv ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (modus === "register") {
        if (pw !== pw2) { setError("Die Passwörter stimmen nicht überein."); return; }
        const r = await register(email, pw, name);
        if (r.ok) setGesendet(r.message || "Anfrage gesendet. Du wirst nach kurzer Prüfung freigeschaltet.");
        else setError(r.error);
      } else {
        const r = await login(email, pw);
        if (r.ok) navigate(loc.state?.from || "/start", { replace: true });
        else setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const wechsel = (m) => { setModus(m); setGesendet(""); setError(""); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">← Startseite</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Heizungs<span className="text-brand-600">cockpit</span>
        </h1>

        <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
          <button className={tab(modus === "login")} onClick={() => wechsel("login")}>Anmelden</button>
          <button className={tab(modus === "register")} onClick={() => wechsel("register")}>Registrieren</button>
        </div>

        {gesendet ? (
          <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">✓ {gesendet}</div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submit}>
            {modus === "register" && (
              <div>
                <label className="label">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" className="input" />
              </div>
            )}
            <div>
              <label className="label">E-Mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.ch" className="input" />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" className="input" />
            </div>
            {modus === "register" && (
              <div>
                <label className="label">Passwort wiederholen</label>
                <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" className="input" />
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <button type="submit" disabled={busy} className="btn-primary mt-2 w-full">
              {busy ? "…" : modus === "login" ? "Anmelden" : "Anfrage abschicken"}
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
