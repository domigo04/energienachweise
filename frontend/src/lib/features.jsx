import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

// Die EINE Stelle, an der das Frontend seinen Plan- und Feature-Zustand kennt.
// Ohne sie würde an vielen Orten eigene Planlogik entstehen, die dann
// auseinanderläuft. Ausblenden ist trotzdem nur Bequemlichkeit — gesperrt wird
// im Backend, jede geschützte Route prüft selbst.
const FeatureContext = createContext(null);

const LEER = { plan: null, features: {}, catalog: null };

export function FeatureProvider({ children }) {
  const [daten, setDaten] = useState(LEER);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler("");
    try {
      const antwort = await api.get("/api/v1/company/features");
      setDaten(antwort.data || LEER);
    } catch (e) {
      // Ohne Antwort wird nichts stillschweigend freigeschaltet: die Oberfläche
      // bleibt zurückhaltend, das Backend entscheidet ohnehin.
      setDaten(LEER);
      setFehler(e?.response?.data?.detail?.message || "Funktionen konnten nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const wert = useMemo(() => ({ ...daten, laedt, fehler, neuLaden: laden }),
    [daten, laedt, fehler, laden]);
  return <FeatureContext.Provider value={wert}>{children}</FeatureContext.Provider>;
}

export function useFeatures() {
  return useContext(FeatureContext) || { ...LEER, laedt: false, fehler: "", neuLaden: () => {} };
}

// Ein einzelnes Feature samt Grund und Kontingent.
export function useFeature(key) {
  const { features, laedt } = useFeatures();
  const eintrag = features?.[key];
  return {
    enabled: !!eintrag?.enabled,
    limit: eintrag?.limit ?? null,
    used: eintrag?.used ?? 0,
    remaining: eintrag?.remaining ?? null,
    source: eintrag?.source ?? null,
    laedt,
    grund: grundText(eintrag),
  };
}

// Warum ist die Funktion nicht verfügbar? Der Text erklärt, statt nur zu sperren.
export function grundText(eintrag) {
  if (!eintrag) return "Diese Funktion ist nicht verfügbar.";
  if (eintrag.enabled) {
    if (eintrag.limit != null && eintrag.remaining === 0) {
      return "Das monatliche Kontingent ist aufgebraucht.";
    }
    return "";
  }
  if (eintrag.reason) return eintrag.reason;
  if (eintrag.internally_enabled === false) {
    return "Diese Funktion wurde in Ihrer Firma deaktiviert.";
  }
  return "Diese Funktion ist in Ihrem aktuellen Plan nicht enthalten.";
}
