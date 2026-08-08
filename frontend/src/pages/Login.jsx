import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { CheckCircle2, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

// Login / Registrieren gegen das echte Backend. Registrieren erzeugt ein
// unbestätigtes Konto — die Freischaltung erfolgt durch den Admin.
export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const sessionNotice = loc.state?.notice || (
    new URLSearchParams(loc.search).get("session") === "expired"
      ? "Deine Sitzung ist abgelaufen oder wurde widerrufen. Bitte melde dich erneut an."
      : ""
  );
  const [modus, setModus] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [kontoTyp, setKontoTyp] = useState("einzelperson");
  const [firmenname, setFirmenname] = useState("");
  const [error, setError] = useState("");
  const [gesendet, setGesendet] = useState("");
  const [busy, setBusy] = useState(false);

  const tab = (aktiv) =>
    `flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-2.5 text-sm font-semibold transition ${aktiv ? "border-brand-600 text-slate-950" : "border-transparent text-slate-400 hover:text-slate-700"}`;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (modus === "register") {
        if (pw !== pw2) { setError("Die Passwörter stimmen nicht überein."); return; }
        if (kontoTyp === "firma" && !firmenname.trim()) { setError("Bitte einen Firmennamen angeben."); return; }
        const r = await register(email, pw, name, kontoTyp, firmenname);
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16">
      <div className="w-full max-w-sm rounded-md border border-slate-300 bg-white p-7 shadow-sm">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">← Startseite</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          Heizungs<span className="text-brand-600">cockpit</span>
        </h1>

        {sessionNotice && (
          <div className="mt-4 rounded-sm border border-amber-200 border-l-2 border-l-amber-600 bg-white px-3 py-2 text-xs text-slate-700">
            {sessionNotice}
          </div>
        )}

        <div className="mt-6 flex border-b border-slate-200">
          <button className={tab(modus === "login")} onClick={() => wechsel("login")}><LogIn className="size-4" /> Anmelden</button>
          <button className={tab(modus === "register")} onClick={() => wechsel("register")}><UserPlus className="size-4" /> Registrieren</button>
        </div>

        {gesendet ? (
          <div className="mt-6 flex gap-2 rounded-sm border border-green-200 border-l-2 border-l-green-600 bg-white p-4 text-sm text-slate-700">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700" /> {gesendet}
          </div>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submit}>
            {modus === "register" && (
              <>
                <div>
                  <label className="label">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" className="input" />
                </div>
                <div>
                  <label className="label">Konto-Typ</label>
                  <div className="flex gap-px rounded-sm border border-slate-200 bg-slate-200 p-px">
                    <button type="button" onClick={() => setKontoTyp("einzelperson")}
                      className={"flex-1 rounded-sm py-1.5 text-xs font-semibold transition " + (kontoTyp === "einzelperson" ? "bg-white text-slate-900" : "bg-slate-50 text-slate-500")}>
                      Einzelperson
                    </button>
                    <button type="button" onClick={() => setKontoTyp("firma")}
                      className={"flex-1 rounded-sm py-1.5 text-xs font-semibold transition " + (kontoTyp === "firma" ? "bg-white text-slate-900" : "bg-slate-50 text-slate-500")}>
                      Firma
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {kontoTyp === "einzelperson"
                      ? "Deine Auswertungsdaten bleiben privat, nur für dich sichtbar."
                      : "Alle Mitglieder derselben Firma teilen sich die Auswertungsdaten."}
                  </p>
                </div>
                {kontoTyp === "firma" && (
                  <div>
                    <label className="label">Firmenname</label>
                    <input value={firmenname} onChange={(e) => setFirmenname(e.target.value)} placeholder="z.B. SIREGO GmbH" className="input" />
                    <p className="mt-1 text-xs text-slate-400">Gibt es die Firma schon, trittst du automatisch bei.</p>
                  </div>
                )}
              </>
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
            {error && <div className="rounded-sm border border-red-200 border-l-2 border-l-red-600 bg-white px-3 py-2 text-xs text-red-700">{error}</div>}
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
