// src/pages/ExpertProfile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Building,
  Award,
  FileText,
  Save,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";
import { api } from "../api";

// --- Fachbereiche: Keys (API) ↔ Labels (UI) ---
const FACHBEREICHE = [
  { key: "waermedaemmung", label: "Wärmedämmung" },
  { key: "heizung", label: "Heizung" },
  { key: "klima_lueftung", label: "Klima/Lüftung" },
  { key: "beleuchtung", label: "Beleuchtung" },
  { key: "laerm", label: "Schutz vor Lärm" },
];
const labelByKey = Object.fromEntries(FACHBEREICHE.map((f) => [f.key, f.label]));
const keyByLabel = Object.fromEntries(FACHBEREICHE.map((f) => [f.label, f.key]));

// Hilfsfunktionen zum Normalisieren (Backend kann Keys ODER Labels liefern)
function normalizeFachbereicheFromApi(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => keyByLabel[v] || v).filter((v) => FACHBEREICHE.some((f) => f.key === v));
}
function toApiFachbereiche(keys) {
  // Sende Keys (sauberste Variante)
  return Array.isArray(keys) ? keys : [];
}

export default function ExpertProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    email: "",
    personentyp: "natuerliche_person", // "natuerliche_person" | "firma"
    fachbereiche: [], // Keys
    berufsnachweis: "",
    mitarbeiteranzahl: "",
    vorname: "",
    nachname: "",
    firma: "",
  });
  const [initial, setInitial] = useState(form);

  const expertId = useMemo(() => localStorage.getItem("user_id"), []);
  const emailFromLS = useMemo(() => localStorage.getItem("email") || "", []);

  // ---- Load profile (DEPLOY-SAFE: nutzt api-Instanz & Token) ----
  useEffect(() => {
    async function run() {
      if (!expertId) {
        navigate("/login");
        return;
      }
      try {
        setLoading(true);
        // Falls du /experts/me hast, nimm das. Sonst bleibt /experts/:id
        const res = await api.get(`/experts/${expertId}`);
        const data = res.data || {};
        const fachKeys = normalizeFachbereicheFromApi(data.fachbereiche || []);

        const next = {
          email: data.email || emailFromLS,
          personentyp: data.personentyp || "natuerliche_person",
          fachbereiche: fachKeys,
          berufsnachweis: data.berufsnachweis || "",
          mitarbeiteranzahl: data.mitarbeiteranzahl ?? "",
          vorname: data.vorname || "",
          nachname: data.nachname || "",
          firma: data.firma || "",
        };
        setForm(next);
        setInitial(next);
      } catch (e) {
        console.error("Profil laden fehlgeschlagen:", e?.response?.data || e);
        setError("Profil konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [expertId, emailFromLS, navigate]);

  // ---- Helpers ----
  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const toggleFach = (key) =>
    setForm((f) => {
      const has = f.fachbereiche.includes(key);
      return {
        ...f,
        fachbereiche: has ? f.fachbereiche.filter((k) => k !== key) : [...f.fachbereiche, key],
      };
    });

  const hasChanges = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  // ---- Submit ----
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      // email wird i. d. R. nicht hier editiert
      personentyp: form.personentyp, // "natuerliche_person" | "firma"
      fachbereiche: toApiFachbereiche(form.fachbereiche), // Keys
      berufsnachweis: form.berufsnachweis || null,
      mitarbeiteranzahl:
        form.personentyp === "firma" && form.mitarbeiteranzahl !== ""
          ? Number(form.mitarbeiteranzahl)
          : null,
      // fakultativ – falls Backend diese Felder speichert/bearbeiten lässt:
      vorname: form.personentyp === "natuerliche_person" ? form.vorname || null : null,
      nachname: form.personentyp === "natuerliche_person" ? form.nachname || null : null,
      firma: form.personentyp === "firma" ? form.firma || null : null,
    };

    // Fehlertext schön formatieren
    const toMsg = (data, fallback) => {
      const detail = data?.detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((err) => {
            const path = Array.isArray(err?.loc) ? err.loc.join(".") : "";
            return `${path ? path + ": " : ""}${err?.msg || "Ungültige Eingabe"}`;
          })
          .join(" | ");
      }
      if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
      try {
        if (data && typeof data === "object") return JSON.stringify(data);
      } catch {}
      return fallback || "Unbekannter Fehler";
    };

    try {
      // PATCH /experts/:id (oder /experts/me, wenn vorhanden)
      const res = await api.patch(`/experts/${expertId}`, payload);
      const updated = res.data || {};
      const fachKeys = normalizeFachbereicheFromApi(updated.fachbereiche || payload.fachbereiche);

      const next = {
        email: updated.email || form.email,
        personentyp: updated.personentyp || form.personentyp,
        fachbereiche: fachKeys,
        berufsnachweis: updated.berufsnachweis ?? (form.berufsnachweis || ""),
        mitarbeiteranzahl: updated.mitarbeiteranzahl ?? payload.mitarbeiteranzahl ?? "",
        vorname: updated.vorname ?? form.vorname,
        nachname: updated.nachname ?? form.nachname,
        firma: updated.firma ?? form.firma,
      };
      setForm(next);
      setInitial(next);
      setMessage("Profil gespeichert.");
      setTimeout(() => setMessage(""), 2500);
    } catch (e) {
      console.error("Speichern fehlgeschlagen:", e?.response?.data || e);
      const data = e?.response?.data;
      setError(toMsg(data, e?.message));
      setTimeout(() => setError(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ---- UI ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-slate-700">Profil wird geladen…</span>
          </div>
        </div>
      </div>
    );
  }

  const FachChip = ({ k, label }) => {
    const active = form.fachbereiche.includes(k);
    return (
      <button
        type="button"
        onClick={() => toggleFach(k)}
        className={[
          "px-3 py-2 rounded-xl border text-sm transition",
          active
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  const PersonentypToggle = () => (
    <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-slate-200">
      <button
        type="button"
        onClick={() => setField("personentyp", "natuerliche_person")}
        className={[
          "px-4 py-2 text-center text-sm md:text-base",
          form.personentyp === "natuerliche_person" ? "bg-indigo-600 text-white" : "bg-white text-slate-700",
        ].join(" ")}
      >
        Natürliche Person
      </button>
      <button
        type="button"
        onClick={() => setField("personentyp", "firma")}
        className={[
          "px-4 py-2 text-center text-sm md:text-base",
          form.personentyp === "firma" ? "bg-indigo-600 text-white" : "bg-white text-slate-700",
        ].join(" ")}
      >
        Firma
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <div className="mb-4">
          <button
            onClick={() => navigate("/experte-dashboard")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Zurück zum Dashboard
          </button>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center text-xl font-semibold">
              {form.email?.[0]?.toUpperCase() || "E"}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Mein Expertenprofil</h1>
              <p className="text-slate-600">{form.email}</p>
            </div>
            {message && (
              <div className="hidden md:flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">{message}</span>
              </div>
            )}
            {error && (
              <div className="hidden md:flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                <CircleAlert className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-semibold">Profilangaben</h2>
                <p className="text-blue-100">Bearbeite deine öffentlichen & administrativen Daten</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Personentyp & Pflichtfelder */}
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-xl p-6 border border-slate-100">
                  <label className="flex items-center gap-2 font-semibold text-slate-800 mb-3">
                    <Building className="w-5 h-5 text-indigo-600" />
                    Personentyp
                  </label>
                  <PersonentypToggle />

                  {form.personentyp === "firma" ? (
                    <div className="mt-5 grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm text-slate-600 mb-1">Firmenname</label>
                        <input
                          type="text"
                          value={form.firma}
                          onChange={(e) => setField("firma", e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="z. B. SIREGO GmbH"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-600 mb-1">Mitarbeitende</label>
                        <input
                          type="number"
                          min={0}
                          value={form.mitarbeiteranzahl}
                          onChange={(e) => setField("mitarbeiteranzahl", e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="Anzahl"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-slate-600 mb-1">Vorname</label>
                        <input
                          type="text"
                          value={form.vorname}
                          onChange={(e) => setField("vorname", e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="Vorname"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-600 mb-1">Nachname</label>
                        <input
                          type="text"
                          value={form.nachname}
                          onChange={(e) => setField("nachname", e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="Nachname"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-slate-100">
                  <label className="flex items-center gap-2 font-semibold text-slate-800 mb-3">
                    <Award className="w-5 h-5 text-indigo-600" />
                    Berufsnachweis (optional)
                  </label>
                  <input
                    type="text"
                    value={form.berufsnachweis}
                    onChange={(e) => setField("berufsnachweis", e.target.value)}
                    className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="z. B. Fachausweis Gebäudetechnik oder Link zum PDF"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Dokumente kannst du später direkt im Profil hochladen.
                  </p>
                </div>
              </div>

              {/* Fachbereiche */}
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-xl p-6 border border-slate-100">
                  <label className="flex items-center gap-2 font-semibold text-slate-800 mb-3">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Fachbereiche
                  </label>
                  <p className="text-sm text-slate-600 mb-4">Wähle alle Bereiche aus, in denen du befugt bist.</p>
                  <div className="flex flex-wrap gap-2">
                    {FACHBEREICHE.map(({ key, label }) => (
                      <FachChip key={key} k={key} label={label} />
                    ))}
                  </div>
                  {form.fachbereiche.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4 inline-flex items-center gap-2">
                      <CircleAlert className="w-4 h-4" />
                      Bitte mindestens einen Fachbereich auswählen.
                    </p>
                  )}
                </div>

                {/* Zusammenfassung */}
                <div className="bg-white rounded-xl p-5 border border-slate-100">
                  <h3 className="font-semibold text-slate-800 mb-3">Kurzüberblick</h3>
                  <dl className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Personentyp</dt>
                      <dd className="text-slate-900">
                        {form.personentyp === "firma" ? "Firma" : "Natürliche Person"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Fachbereiche</dt>
                      <dd className="text-slate-900">
                        {form.fachbereiche.length
                          ? form.fachbereiche.map((k) => labelByKey[k] || k).join(", ")
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col md:flex-row md:items-center gap-3">
              <button
                type="submit"
                disabled={saving || !hasChanges || form.fachbereiche.length === 0}
                className={[
                  "w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold",
                  saving || !hasChanges || form.fachbereiche.length === 0
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700",
                ].join(" ")}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-5 h-5" />}
                {saving ? "Wird gespeichert…" : hasChanges ? "Profil speichern" : "Keine Änderungen"}
              </button>

              {message && (
                <span className="inline-flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  {message}
                </span>
              )}
              {error && (
                <span className="inline-flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  <CircleAlert className="w-4 h-4" />
                  {error}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
