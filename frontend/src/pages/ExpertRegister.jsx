// src/pages/ExpertRegister.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "../api";

// Fachbereiche: interne Keys (für UI-State) + Labels (was ans Backend geht)
const FACHBEREICHE = [
  { key: "waermedaemmung", label: "Wärmedämmung" },
  { key: "heizung", label: "Heizung" },
  { key: "klima_lueftung", label: "Klima/Lüftung" },
  { key: "beleuchtung", label: "Beleuchtung" },
  { key: "laerm", label: "Schutz vor Lärm" },
];
const LABEL_BY_KEY = Object.fromEntries(FACHBEREICHE.map(f => [f.key, f.label]));

const steps = [
  { key: "account", label: "Konto" },
  { key: "person", label: "Personentyp" },
  { key: "fach", label: "Fachbereiche" },
  { key: "proof", label: "Berufsnachweis" },
  { key: "review", label: "Prüfen & Absenden" },
];

export default function ExpertRegister() {
  const navigate = useNavigate();

  const [stepIdx, setStepIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    email: "",
    password: "",
    personentyp: "natuerliche_person", // intern
    firma: "",
    vorname: "",
    nachname: "",
    mitarbeiteranzahl: "",
    fachbereiche: [], // keys
    berufsnachweis: "",
  });

  const setField = (name, value) => setForm(f => ({ ...f, [name]: value }));
  const toggleFach = (key) =>
    setForm(f => {
      const has = f.fachbereiche.includes(key);
      return { ...f, fachbereiche: has ? f.fachbereiche.filter(k => k !== key) : [...f.fachbereiche, key] };
    });

  // Validation je Step
  const stepValid = useMemo(() => {
    switch (steps[stepIdx].key) {
      case "account":
        return /^\S+@\S+\.\S+$/.test(form.email) && form.password.length >= 6;
      case "person":
        if (form.personentyp === "firma") {
          const n = Number(form.mitarbeiteranzahl);
          return form.firma.trim().length > 1 && Number.isFinite(n) && n >= 0;
        }
        return form.vorname.trim().length > 1 && form.nachname.trim().length > 1;
      case "fach":
        return form.fachbereiche.length > 0;
      case "proof":
        return form.berufsnachweis.length === 0 || form.berufsnachweis.length >= 5;
      case "review":
        return true;
      default:
        return false;
    }
  }, [stepIdx, form]);

  const next = () => { if (stepValid) { setError(""); setStepIdx(i => Math.min(i+1, steps.length-1)); } };
  const prev = () => { setError(""); setStepIdx(i => Math.max(i-1, 0)); };

  // ---- SUBMIT: map in die vom Backend erwarteten Texte ----
  const submit = async () => {
    setIsLoading(true);
    setError("");

    // Personentyp in Backend-Text
    const personentypText = form.personentyp === "natuerliche_person" ? "natürliche Person" : "Firma";
    // Fachbereiche als Labels
    const fachbereicheLabels = form.fachbereiche.map(k => LABEL_BY_KEY[k] || k);

    const payload = {
      email: form.email,
      password: form.password,
      personentyp: personentypText,      // <-- wichtig: mit Umlaut/Leerzeichen
      fachbereiche: fachbereicheLabels,  // <-- Labels schicken
      berufsnachweis: form.berufsnachweis || null,
      firma: form.personentyp === "firma" ? form.firma : null,
      mitarbeiteranzahl:
        form.personentyp === "firma" && form.mitarbeiteranzahl !== "" ? Number(form.mitarbeiteranzahl) : null,
      vorname: form.personentyp === "natuerliche_person" ? form.vorname : null,
      nachname: form.personentyp === "natuerliche_person" ? form.nachname : null,
    };

    const toMsg = (data, fallback) => {
      const d = data?.detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) {
        return d.map(err => {
          const path = Array.isArray(err?.loc) ? err.loc.join(".") : "";
          return `${path ? path + ": " : ""}${err?.msg || "Ungültige Eingabe"}`;
        }).join(" | ");
      }
      if (d && typeof d === "object" && typeof d.message === "string") return d.message;
      try { if (data && typeof data === "object") return JSON.stringify(data); } catch {}
      return fallback || "Unbekannter Fehler";
    };

    try {
      await api.post("/experts/register", payload);
      try { localStorage.setItem("email", form.email); } catch {}
      setShowModal(true);
      setForm({
        email: form.email,
        password: "",
        personentyp: "natuerliche_person",
        firma: "",
        vorname: "",
        nachname: "",
        mitarbeiteranzahl: "",
        fachbereiche: [],
        berufsnachweis: "",
      });
      setTimeout(() => { setShowModal(false); navigate("/"); }, 4500);
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      if (status === 409) setError("Diese E-Mail ist bereits registriert.");
      else setError(toMsg(data, e?.message));
    } finally {
      setIsLoading(false);
    }
  };

  const Progress = () => (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => {
        const active = i === stepIdx; const done = i < stepIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={[
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold",
              done ? "bg-green-500 text-white" : active ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700",
            ].join(" ")} title={s.label}>
              {done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && <div className="w-10 h-1 rounded bg-gray-300" />}
          </div>
        );
      })}
    </div>
  );

  const Actions = () => (
    <div className="flex items-center justify-between pt-2">
      <button type="button" onClick={prev} disabled={stepIdx===0||isLoading}
        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border hover:bg-gray-50 disabled:opacity-50">
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>
      {stepIdx < steps.length - 1 ? (
        <button type="button" onClick={next} disabled={!stepValid||isLoading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50">
          Weiter <ChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={isLoading||!stepValid}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isLoading ? "Wird gesendet…" : "Registrieren"}
        </button>
      )}
    </div>
  );

  const fachLabels = form.fachbereiche.map(k => LABEL_BY_KEY[k] || k).join(", ");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-xl rounded-2xl p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Expertenregistrierung</h1>
          <p className="text-center text-gray-600 mb-6">Registriere dich in wenigen Schritten. Du kannst die Angaben jederzeit im Profil ergänzen.</p>

          <Progress />

          {steps[stepIdx].key === "account" && (
            <section className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">E-Mail</label>
                  <input type="email" value={form.email} onChange={e=>setField("email", e.target.value)}
                    className="w-full p-3 border rounded-lg" placeholder="name@firma.ch" autoComplete="email" disabled={isLoading} required />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Passwort</label>
                  <input type="password" value={form.password} onChange={e=>setField("password", e.target.value)}
                    className="w-full p-3 border rounded-lg" placeholder="mind. 6 Zeichen" autoComplete="new-password" minLength={6} disabled={isLoading} required />
                </div>
              </div>
              <p className="text-sm text-gray-500">Dein Passwort wird sicher gehasht gespeichert.</p>
              <Actions />
            </section>
          )}

          {steps[stepIdx].key === "person" && (
            <section className="space-y-6">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Personentyp</label>
                <select value={form.personentyp} onChange={e=>setField("personentyp", e.target.value)}
                  className="w-full p-3 border rounded-lg" disabled={isLoading}>
                  <option value="natuerliche_person">Natürliche Person</option>
                  <option value="firma">Firma</option>
                </select>
              </div>

              {form.personentyp === "firma" ? (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Firmenname</label>
                    <input type="text" value={form.firma} onChange={e=>setField("firma", e.target.value)}
                      className="w-full p-3 border rounded-lg" disabled={isLoading} required />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Mitarbeitende</label>
                    <input type="number" value={form.mitarbeiteranzahl} onChange={e=>setField("mitarbeiteranzahl", e.target.value)}
                      className="w-full p-3 border rounded-lg" min={0} disabled={isLoading} required />
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Vorname</label>
                    <input type="text" value={form.vorname} onChange={e=>setField("vorname", e.target.value)}
                      className="w-full p-3 border rounded-lg" disabled={isLoading} required />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Nachname</label>
                    <input type="text" value={form.nachname} onChange={e=>setField("nachname", e.target.value)}
                      className="w-full p-3 border rounded-lg" disabled={isLoading} required />
                  </div>
                </div>
              )}
              <Actions />
            </section>
          )}

          {steps[stepIdx].key === "fach" && (
            <section className="space-y-4">
              <label className="block text-gray-700 font-semibold">Fachbereiche</label>
              <div className="grid md:grid-cols-2 gap-3">
                {FACHBEREICHE.map(({ key, label }) => (
                  <label key={key} className="flex items-center space-x-3 bg-white border p-3 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={form.fachbereiche.includes(key)} onChange={() => toggleFach(key)} disabled={isLoading} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-sm text-gray-500">Wähle mindestens einen Bereich aus.</p>
              <Actions />
            </section>
          )}

          {steps[stepIdx].key === "proof" && (
            <section className="space-y-4">
              <label className="block text-gray-700 font-semibold">Berufsnachweis (optional)</label>
              <input type="text" value={form.berufsnachweis} onChange={e=>setField("berufsnachweis", e.target.value)}
                placeholder="z. B. Diplom, Link zum Lebenslauf o. ä." className="w-full p-3 border rounded-lg" disabled={isLoading} />
              <p className="text-sm text-gray-500">Du kannst später im Profil Dokumente hochladen. Für die Registrierung reicht ein kurzer Hinweis.</p>
              <Actions />
            </section>
          )}

          {steps[stepIdx].key === "review" && (
            <section className="space-y-6">
              <div className="bg-gray-50 border rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Zusammenfassung</h3>
                <dl className="grid md:grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-gray-500">E-Mail</dt><dd className="text-gray-900 break-all">{form.email}</dd></div>
                  <div><dt className="text-gray-500">Personentyp</dt><dd className="text-gray-900">{form.personentyp === "firma" ? "Firma" : "Natürliche Person"}</dd></div>
                  {form.personentyp === "firma" ? (
                    <>
                      <div><dt className="text-gray-500">Firma</dt><dd className="text-gray-900">{form.firma || "—"}</dd></div>
                      <div><dt className="text-gray-500">Mitarbeitende</dt><dd className="text-gray-900">{form.mitarbeiteranzahl || "—"}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt className="text-gray-500">Vorname</dt><dd className="text-gray-900">{form.vorname || "—"}</dd></div>
                      <div><dt className="text-gray-500">Nachname</dt><dd className="text-gray-900">{form.nachname || "—"}</dd></div>
                    </>
                  )}
                  <div className="md:col-span-2"><dt className="text-gray-500">Fachbereiche</dt><dd className="text-gray-900">{fachLabels || "—"}</dd></div>
                  <div className="md:col-span-2"><dt className="text-gray-500">Berufsnachweis</dt><dd className="text-gray-900">{form.berufsnachweis || "—"}</dd></div>
                </dl>
              </div>
              <Actions />
            </section>
          )}

          {error && <p className="text-center font-semibold text-red-600 mt-6">{error}</p>}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
            <CheckCircle className="text-green-500 w-12 h-12 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Registrierung erfolgreich!</h2>
            <p className="text-gray-600">Wir prüfen deine Angaben und benachrichtigen dich per E-Mail.</p>
          </div>
        </div>
      )}
    </div>
  );
}
