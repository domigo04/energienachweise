// Auswahllisten für den Erdsonden-Solekreis.
//
// Spiegel von `backend/app/calculations/sole_rohre.py`. Gerechnet wird
// ausschliesslich im Backend; hier stehen nur die Beschriftungen für die
// Auswahlfelder. `backend/tests/test_sole_druckverlust.py` prüft, dass beide
// Listen dieselben Schlüssel haben — sonst könnten sie auseinanderlaufen.
//
// Quellen: SIA 384/6:2021 (FWS «WP-/EWS-Technik Update 2021»), Tabellen 8 und 10,
// sowie die Zellkommentare in `Erdsonden.xlsx`.

export const SOLE_ROHRE = [
  { key:'pe25x2.3', label:'PE 25 × 2.3 — innen 20.4 mm — PN 16', innen:20.4, pn:'PN 16', sonde:true },
  { key:'pe32x3.0', label:'PE 32 × 3.0 — innen 26.0 mm — PN 16', innen:26.0, pn:'PN 16', sonde:true },
  { key:'pe32x2.9', label:'PE 32 × 2.9 — innen 26.2 mm — PN 16', innen:26.2, pn:'PN 16', sonde:true },
  { key:'pe32x3.6', label:'PE 32 × 3.6 — innen 24.8 mm — PN 20', innen:24.8, pn:'PN 20', sonde:true },
  { key:'pe40x3.7', label:'PE 40 × 3.7 — innen 32.6 mm — PN 16', innen:32.6, pn:'PN 16', sonde:true },
  { key:'pe40x4.5', label:'PE 40 × 4.5 — innen 31.0 mm — PN 20', innen:31.0, pn:'PN 20', sonde:true },
  { key:'pe40x5.4', label:'PE 40 × 5.4 — innen 29.2 mm — PN 25', innen:29.2, pn:'PN 25', sonde:true },
  { key:'pe50x4.6', label:'PE 50 × 4.6 — innen 40.8 mm — PN 16', innen:40.8, pn:'PN 16', sonde:true },
  { key:'pe50x4.7', label:'PE 50 × 4.7 — innen 40.6 mm — PN 16', innen:40.6, pn:'PN 16', sonde:false },
  { key:'pe50x5.6', label:'PE 50 × 5.6 — innen 38.8 mm — PN 20', innen:38.8, pn:'PN 20', sonde:true },
  { key:'pe50x6.9', label:'PE 50 × 6.9 — innen 36.4 mm — PN 25', innen:36.4, pn:'PN 25', sonde:true },
  { key:'pe50x8.9', label:'PE 50 × 8.9 — innen 32.0 mm — PN 32', innen:32.0, pn:'PN 32', sonde:true },
];

export const SOLE_TRAEGER = [
  { key:'antifrogen_l_21_4', label:'Antifrogen L (Propylenglykol) 21.4 % — Frost −8.0 °C' },
  { key:'antifrogen_l_25',   label:'Antifrogen L (Propylenglykol) 25 % — Frost −10.1 °C' },
  { key:'antifrogen_l_30',   label:'Antifrogen L (Propylenglykol) 30 % — Frost −13.5 °C' },
  { key:'antifrogen_n_20',   label:'Antifrogen N (Ethylenglykol) 20 % — Frost −10.4 °C' },
  { key:'antifrogen_n_25',   label:'Antifrogen N (Ethylenglykol) 25 % — Frost −13.6 °C' },
  { key:'ethanol_10',        label:'Ethanol 10 % — Frost −4.5 °C' },
  { key:'ethanol_20',        label:'Ethanol 20 % — Frost −10.5 °C' },
  { key:'ethanol_30',        label:'Ethanol 30 % — Frost −20.5 °C' },
];

// Erforderliche Nenndruckstufe nach Sondentiefe, SIA 384/6:2021 (informativ),
// inklusive 3 bar Betriebsdruck am Sondenfuss. Nur zur Anzeige — geprüft wird
// im Backend.
export const DRUCKSTUFE_NACH_TIEFE = [
  { bis:170, pn:'PN 16', bar:20 },
  { bis:200, pn:'PN 20', bar:24 },
  { bis:260, pn:'PN 25', bar:30 },
  { bis:360, pn:'PN 32', bar:41 },
];
