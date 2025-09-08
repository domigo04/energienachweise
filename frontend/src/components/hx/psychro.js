// kleine, isolierte Psycho-Utility (keine React-Abhängigkeiten)
export const clamp = (v, lo, hi) => Math.min(Math.max(Number.isFinite(v) ? v : lo, lo), hi);

const RATIO = 0.62198, Rd = 287.058, Rv = 461.495; // Konstanten

export const pws = (T) => { // Sättigungsdampfdruck [Pa]
  const Tc = clamp(T, -45, 60);
  return 610.94 * Math.exp((17.625 * Tc) / (Tc + 243.04));
};

export const w_from_T_RH = (T, RH, P) => { // kg/kg
  const phi = clamp(RH, 0, 100) / 100;
  const pw = phi * pws(T);
  const d  = P - pw;
  return d <= 1e-6 ? 0 : Math.max(0, (RATIO * pw) / d);
};

export const h_from_T_w = (T, w) => 1.006 * T + w * (2501 + 1.86 * T); // kJ/kg
export const T_from_h_w = (h, w) => (h - 2501 * w) / (1.006 + 1.86 * w); // °C
export const RH_from_T_w = (T, w, P) => { // %
  const pw = (w * P) / (RATIO + w);
  return 100 * Math.max(0, Math.min(1, pw / pws(T)));
};
export const rho_moist = (T, w, P) => { // kg/m³
  const TK = T + 273.15, pw = (w * P) / (RATIO + w), pd = P - pw;
  return pd / (Rd * TK) + pw / (Rv * TK);
};
