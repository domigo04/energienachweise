import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "../api";

// Landepunkt des Links aus der Bestätigungsmail. Die Seite ist bewusst
// öffentlich: wer hier ankommt, hat noch kein Konto, mit dem er sich anmelden
// könnte. Bestätigt wird per POST — ein GET würde beim blossen Vorschauladen
// durch Mailprogramme oder Virenscanner ausgelöst.

export default function EmailBestaetigen() {
  const { token } = useParams();
  const [zustand, setZustand] = useState("laeuft");   // laeuft | ok | fehler
  const [meldung, setMeldung] = useState("");
  // React 18 ruft Effekte im Strict Mode doppelt auf. Der Token gilt nur
  // einmal — der zweite Aufruf würde sonst «ungültig» melden.
  const gestartet = useRef(false);

  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    api.post(`/api/v1/auth/verify/${encodeURIComponent(token)}`)
      .then((r) => { setZustand("ok"); setMeldung(r.data?.message || "E-Mail bestätigt."); })
      .catch((f) => {
        setZustand("fehler");
        setMeldung(f?.response?.data?.detail || "Der Bestätigungslink konnte nicht geprüft werden.");
      });
  }, [token]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="card p-8 text-center">
        {zustand === "laeuft" && (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-slate-300" />
            <p className="mt-4 text-sm text-slate-500">E-Mail wird bestätigt …</p>
          </>
        )}

        {zustand === "ok" && (
          <>
            <CheckCircle2 className="mx-auto size-10 text-green-600" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">E-Mail bestätigt</h1>
            <p className="mt-2 text-sm text-slate-500">{meldung}</p>
            <Link to="/login" className="btn-primary mt-6 inline-flex">Zur Anmeldung</Link>
          </>
        )}

        {zustand === "fehler" && (
          <>
            <XCircle className="mx-auto size-10 text-red-500" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">Das hat nicht geklappt</h1>
            <p className="mt-2 text-sm text-slate-500">{meldung}</p>
            <p className="mt-4 text-xs text-slate-400">
              Bestätigungslinks gelten 24 Stunden und nur einmal. Ist deine Adresse
              schon bestätigt, kannst du dich direkt anmelden.
            </p>
            <Link to="/login" className="btn-secondary mt-6 inline-flex">Zur Anmeldung</Link>
          </>
        )}
      </div>
    </div>
  );
}
