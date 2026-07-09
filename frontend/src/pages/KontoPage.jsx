import { useEffect, useState } from "react";
import { Building2, CreditCard, User as UserIcon } from "lucide-react";
import { getMe, updateMe } from "../api/hcApi";
import { useAuth } from "../auth/AuthContext";

const ABO_LABEL = { kostenlos: "Kostenlos" };

export default function KontoPage() {
  const { refreshUser } = useAuth();
  const [konto, setKonto] = useState(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [aktuellesPw, setAktuellesPw] = useState("");
  const [neuesPw, setNeuesPw] = useState("");
  const [neuesPw2, setNeuesPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    getMe().then((d) => { setKonto(d); setName(d.name || ""); });
  }, []);

  const istEinzelperson = konto?.firma_name?.endsWith("(Einzelperson)");

  const nameSpeichern = async (e) => {
    e.preventDefault();
    setSavingName(true);
    setNameMsg("");
    try {
      const updated = await updateMe({ name });
      setKonto(updated);
      await refreshUser();
      setNameMsg("Gespeichert.");
    } catch {
      setNameMsg("Speichern fehlgeschlagen.");
    } finally {
      setSavingName(false);
    }
  };

  const passwortAendern = async (e) => {
    e.preventDefault();
    setPwError("");
    setPwMsg("");
    if (neuesPw !== neuesPw2) { setPwError("Die neuen Passwörter stimmen nicht überein."); return; }
    setSavingPw(true);
    try {
      await updateMe({ aktuelles_passwort: aktuellesPw, neues_passwort: neuesPw });
      setPwMsg("Passwort geändert.");
      setAktuellesPw(""); setNeuesPw(""); setNeuesPw2("");
    } catch (err) {
      setPwError(err?.response?.data?.detail || "Passwort ändern fehlgeschlagen.");
    } finally {
      setSavingPw(false);
    }
  };

  if (!konto) return <div className="p-8 text-sm text-slate-400">Lade…</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mein Konto</h1>
        <p className="mt-1 text-sm text-slate-500">Profil, Zugehörigkeit und Passwort.</p>
      </header>

      <div className="card mb-6 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Building2 className="size-4 text-brand-600" /> Zugehörigkeit
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><div className="text-xs text-slate-400">Konto-Typ</div><div className="font-medium text-slate-900">{istEinzelperson ? "Einzelperson" : "Firma"}</div></div>
          <div><div className="text-xs text-slate-400">{istEinzelperson ? "Bereich" : "Firma"}</div><div className="font-medium text-slate-900">{konto.firma_name}</div></div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {istEinzelperson
            ? "Deine Auswertungsdaten sind privat, nur für dich sichtbar."
            : "Du teilst dir die Auswertungsdaten mit allen Mitgliedern dieser Firma."}
        </p>
      </div>

      <div className="card mb-6 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <CreditCard className="size-4 text-brand-600" /> Plan & Zahlung
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
          <span className="text-slate-600">Aktueller Tarif</span>
          <span className="badge bg-green-100 text-green-700">{ABO_LABEL[konto.abo_plan] || konto.abo_plan}</span>
        </div>
        <p className="mt-3 text-xs text-slate-400">Bezahlte Tarife (z.B. nach Anzahl auswertbarer Projekte) folgen später.</p>
      </div>

      <div className="card mb-6 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <UserIcon className="size-4 text-brand-600" /> Profil
        </div>
        <form onSubmit={nameSpeichern} className="space-y-3">
          <div><label className="label">E-Mail</label><input className="input bg-slate-50 text-slate-400" value={konto.email} disabled /></div>
          <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          {nameMsg && <p className="text-xs text-slate-500">{nameMsg}</p>}
          <button type="submit" disabled={savingName} className="btn-primary">{savingName ? "Speichere…" : "Speichern"}</button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Passwort ändern</h2>
        <form onSubmit={passwortAendern} className="space-y-3">
          <div><label className="label">Aktuelles Passwort</label><input type="password" className="input" value={aktuellesPw} onChange={(e) => setAktuellesPw(e.target.value)} /></div>
          <div><label className="label">Neues Passwort</label><input type="password" className="input" value={neuesPw} onChange={(e) => setNeuesPw(e.target.value)} /></div>
          <div><label className="label">Neues Passwort wiederholen</label><input type="password" className="input" value={neuesPw2} onChange={(e) => setNeuesPw2(e.target.value)} /></div>
          {pwError && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{pwError}</div>}
          {pwMsg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">{pwMsg}</div>}
          <button type="submit" disabled={savingPw} className="btn-primary">{savingPw ? "Speichere…" : "Passwort ändern"}</button>
        </form>
      </div>
    </div>
  );
}
