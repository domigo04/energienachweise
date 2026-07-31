import { useCallback, useEffect, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { api } from "../../api";
import PageHeader from "../../components/ui/PageHeader";
import { useFeatures } from "../../lib/features";

// Firmenadministration: Plan und Kontingente ansehen, erlaubte Funktionen
// firmenintern ab- und wieder einschalten. Planwechsel und Overrides sind
// bewusst nicht hier — die macht nur die Plattformadministration.
const STATUS_LABEL = {
  active: "aktiv", trial: "Testphase", suspended: "ausgesetzt",
  expired: "abgelaufen", cancelled: "gekündigt",
};

const QUELLE_LABEL = {
  plan: "im Plan enthalten",
  company_override: "gesondert freigeschaltet",
  default_disabled: "nicht im Plan",
  not_implemented: "noch nicht verfügbar",
};

export default function Abonnement() {
  const { neuLaden } = useFeatures();
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState("");

  const laden = useCallback(async () => {
    try {
      const antwort = await api.get("/api/v1/company/settings");
      setDaten(antwort.data);
      setFehler("");
    } catch (e) {
      setFehler(e?.response?.data?.detail?.message || "Konnte nicht geladen werden.");
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const umschalten = async (key, an) => {
    setSpeichert(key);
    setFehler("");
    try {
      await api.put("/api/v1/company/settings", { feature_key: key, internally_enabled: an });
      await laden();
      await neuLaden();
    } catch (e) {
      setFehler(e?.response?.data?.detail?.message || "Änderung nicht möglich.");
    } finally {
      setSpeichert("");
    }
  };

  if (!daten) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
        <PageHeader title="Abonnement und Funktionen" />
        <p className="text-sm text-slate-500">{fehler || "Wird geladen…"}</p>
      </div>
    );
  }

  const katalog = daten.catalog?.features || [];
  const plan = daten.plan || {};

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <PageHeader
        back={{ to: "/firma/verwaltung", label: "Firma" }}
        title="Abonnement und Funktionen"
        subtitle="Welcher Plan gilt, was er enthält und was Sie firmenintern abschalten können."
      />

      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Plan</div>
            <div className="mt-1 text-lg font-bold text-ink">{plan.name || "—"}</div>
          </div>
          <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold "
            + (plan.active ? "bg-green-50 text-green-700" : "bg-amber-100 text-amber-800")}>
            {STATUS_LABEL[plan.status] || plan.status}
          </span>
        </div>
        {plan.expires_at && (
          <p className="mt-2 text-xs text-slate-500">Läuft bis {plan.expires_at.slice(0, 10)}</p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Ein Planwechsel erfolgt über SIREGO — hier lassen sich nur enthaltene
          Funktionen firmenintern abschalten.
        </p>
      </section>

      {fehler && (
        <div className="mb-4 border-l-2 border-red-500 bg-white px-3 py-2 text-sm text-red-700">{fehler}</div>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
          Funktionen
        </div>
        <div className="divide-y divide-slate-100">
          {katalog.map(({ key, label, implemented }) => {
            const eintrag = daten.features?.[key] || {};
            const imPlan = eintrag.source === "plan" || eintrag.source === "company_override";
            return (
              <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="flex size-6 shrink-0 items-center justify-center">
                  {!implemented ? <Lock className="size-4 text-slate-300" />
                    : eintrag.enabled ? <Check className="size-4 text-green-600" />
                      : <X className="size-4 text-slate-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  <div className="text-xs text-slate-500">
                    {QUELLE_LABEL[eintrag.source] || "—"}
                    {eintrag.limit != null && (
                      <> · {eintrag.used}/{eintrag.limit} genutzt, {eintrag.remaining} übrig</>
                    )}
                    {eintrag.internally_enabled === false && " · firmenintern abgeschaltet"}
                  </div>
                </div>
                {/* Abschalten geht immer, Einschalten nur bei erlaubtem Feature. */}
                {implemented && imPlan && (
                  <button
                    type="button"
                    className={eintrag.internally_enabled ? "btn-secondary" : "btn-primary"}
                    disabled={speichert === key}
                    onClick={() => umschalten(key, !eintrag.internally_enabled)}
                  >
                    {speichert === key ? "…" : eintrag.internally_enabled ? "Abschalten" : "Einschalten"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {daten.usage?.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
            Nutzung
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2 sm:px-5">Funktion</th>
                  <th className="px-4 py-2">Periode</th>
                  <th className="px-4 py-2 text-right">Anzahl</th>
                  <th className="px-4 py-2 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {daten.usage.map((u, i) => (
                  <tr key={`${u.feature_key}-${i}`}>
                    <td className="px-4 py-2 sm:px-5">{u.feature_key}</td>
                    <td className="px-4 py-2 text-slate-500">{u.period_start.slice(0, 7)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{u.usage_count}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500">
                      {u.usage_amount ? `USD ${u.usage_amount.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
