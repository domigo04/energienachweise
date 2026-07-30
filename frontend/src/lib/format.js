// Ein Ort für Zahlen- und Betragsformate, damit dieselbe Zahl auf jeder Seite
// gleich aussieht. Schweizer Schreibweise: Tausender-Hochkomma, Währung vorne
// («CHF 125'000»), Kennwert-Einheit hinten («1'240 CHF/m²», weil die Einheit
// zur Bezugsgrösse gehört). Fehlt ein Wert, steht überall derselbe Gedankenstrich.
const istZahl = (n) => n != null && n !== "" && !Number.isNaN(Number(n));

export const LEER = "—";

export const zahl = (n, maxDecimals = 0) =>
  istZahl(n) ? Number(n).toLocaleString("de-CH", { maximumFractionDigits: maxDecimals }) : LEER;

export const chf = (n) => (istZahl(n) ? `CHF ${zahl(n)}` : LEER);

export const chfPro = (n, einheit) => (istZahl(n) ? `${zahl(n)} CHF/${einheit}` : LEER);
