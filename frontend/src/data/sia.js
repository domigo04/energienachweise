// Gebäudekategorien nach SIA 380/1
export const GEBAEUDEKATEGORIEN = [
  { value: 'MFH',         label: 'I · Wohnen MFH (Mehrfamilienhaus)' },
  { value: 'EFH',         label: 'II · Wohnen EFH (Einfamilienhaus)' },
  { value: 'Verwaltung',  label: 'III · Verwaltung' },
  { value: 'Schulen',     label: 'IV · Schulen' },
  { value: 'Verkauf',     label: 'V · Verkauf' },
  { value: 'Restaurant',  label: 'VI · Restaurant' },
  { value: 'Versammlung', label: 'VII · Versammlungslokale' },
  { value: 'Spital',      label: 'VIII · Spital' },
  { value: 'Industrie',   label: 'IX · Industrie' },
  { value: 'Lager',       label: 'X · Lager' },
  { value: 'Sport',       label: 'XI · Sportbauten' },
  { value: 'Hallenbad',   label: 'XII · Hallenbad' },
];

// Klimastationen nach SIA 2028 mit Auslegungs-Aussentemperatur theta_e (°C).
// ACHTUNG: theta_e sind Startwerte – vom Planer gegen die offizielle SIA 2028 zu prüfen/ergänzen.
export const KLIMASTATIONEN = [
  { name: 'Zürich-SMA', theta_e: -8 }, { name: 'Zürich-Kloten', theta_e: -9 },
  { name: 'Basel-Binningen', theta_e: -9 }, { name: 'Bern-Liebefeld', theta_e: -8 },
  { name: 'Genève-Cointrin', theta_e: -9 }, { name: 'Lausanne', theta_e: -7 },
  { name: 'Neuchâtel', theta_e: -8 }, { name: 'Payerne', theta_e: -10 },
  { name: 'La Chaux-de-Fonds', theta_e: -14 }, { name: 'Luzern', theta_e: -8 },
  { name: 'Altdorf', theta_e: -9 }, { name: 'Interlaken', theta_e: -11 },
  { name: 'Glarus', theta_e: -11 }, { name: 'St. Gallen', theta_e: -11 },
  { name: 'Chur', theta_e: -11 }, { name: 'Davos', theta_e: -17 },
  { name: 'Samedan', theta_e: -21 }, { name: 'Sion', theta_e: -9 },
  { name: 'Montana', theta_e: -13 }, { name: 'Grand-St-Bernard', theta_e: -15 },
  { name: 'Locarno-Monti', theta_e: -5 }, { name: 'Lugano', theta_e: -5 },
  { name: 'Zermatt', theta_e: -14 }, { name: 'Schaffhausen', theta_e: -9 },
];
