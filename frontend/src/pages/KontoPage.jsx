import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CreditCard, ShieldCheck, User as UserIcon } from "lucide-react";
import { getMe, requestFirmaAdmin, updateMe } from "../api/hcApi";
import { useAuth } from "../auth/AuthContext";
import PageHeader from "../components/ui/PageHeader";

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
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");

  useEffect(() => {
    getMe().then((d) => { setKonto(d); setName(d.name || ""); });
  }, []);

  const istEinzelperson = konto?.firma_name?.endsWith("(Einzelperson)");
  const istPlattformadmin = konto?.role === "admin";
  const istFirmenadmin = konto?.firma_role === "admin";
  const adminBeantragt = Boolean(konto?.firma_admin_beantragt_at) && !istFirmenadmin;

  const firmenadminBeantragen = async () => {
    setAdminLoading(true);
    setAdminMsg("");
    try {
      const updated = await requestFirmaAdmin();
      setKonto(updated);
      await refreshUser();
      setAdminMsg("Antrag gesendet. Der Plattformadmin muss ihn noch bestätigen.");
    } catch (err) {
      setAdminMsg(err?.response?.data?.detail || "Antrag konnte nicht gesendet werden.");
    } finally {
      setAdminLoading(false);
    }
  };

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
      <PageHeader
        back={{ to: "/start", label: "Start" }}
        title="Mein Konto"
        subtitle="Profil, Zugehörigkeit und Passwort."
      />

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
            : "Projekte und Auswertungsdaten sind für die Mitglieder dieser Firma gemeinsam verfügbar."}
        </p>
        {!istEinzelperson && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ShieldCheck className="size-4 text-brand-600" />
                {istPlattformadmin ? "Plattformadmin" : istFirmenadmin ? "Firmenadmin" : adminBeantragt ? "Firmenadmin beantragt" : "Firmenmitglied"}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {istFirmenadmin || istPlattformadmin
                  ? "Du kannst die Projekte dieser Firma verwalten und endgültig löschen."
                  : adminBeantragt
                    ? "Dein Antrag wartet auf die Bestätigung des Plattformadmins."
                    : "Als Firmenadmin kannst du die gemeinsamen Projekte der Firma verwalten."}
              </p>
            </div>
            {!istPlattformadmin && !istFirmenadmin && !adminBeantragt && (
              <button type="button" onClick={firmenadminBeantragen} disabled={adminLoading} className="btn-secondary shrink-0">
                {adminLoading ? "Sende…" : "Firmenadmin beantragen"}
              </button>
            )}
          </div>
        )}
        {adminMsg && <p className="mt-3 text-xs text-slate-600">{adminMsg}</p>}
        {(istFirmenadmin || istPlattformadmin) && (
          <Link to="/firma/verwaltung" className="btn-secondary mt-4 w-full justify-center sm:w-auto">
            <Building2 className="size-4" /> Firmenverwaltung öffnen
          </Link>
        )}
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
