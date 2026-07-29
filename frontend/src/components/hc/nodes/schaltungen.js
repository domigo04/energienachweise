// Vordefinierte hydraulische Schaltungen — alle Handles top/bottom, Edges type:'step'

const VL  = { stroke: '#ef4444', strokeWidth: 2.5 };
const RL  = { stroke: '#3b82f6', strokeWidth: 2.5 };
const SOLE_VL = { stroke: '#eab308', strokeWidth: 2.5 };
const SOLE_RL = { stroke: '#16a34a', strokeWidth: 2.5, strokeDasharray: '8 5' };
const E   = { type: 'step' };

export const SCHALTUNGEN = {

  // ── Luca-Pitch: vollständige EWS-Anlage mit drei getrennten Kreisen ──
  luca_demo: {
    name: 'Luca-Pitch · EWS-Wärmepumpe',
    regelt: 'Drei getrennte Kreise',
    einsatz: 'EWS · WP · Speicher · 2 Heizgruppen',
    nodes: [
      {
        id: 'demo-ews',
        type: 'erdsonden',
        position: { x: 30, y: 55 },
        data: { label: 'Erdsondenfeld', nr: 1, sonden_anzahl: 4, sonden_laenge_m: 180 },
      },
      {
        id: 'demo-solep',
        type: 'pump',
        position: { x: 350, y: 90 },
        data: { label: 'Solepumpe P1', nr: 2, rotation: 90, dp_kpa: 45 },
      },
      {
        id: 'demo-wp',
        type: 'erzeuger',
        position: { x: 505, y: 75 },
        data: {
          label: 'Sole/Wasser-Wärmepumpe', nr: 3, typ: 'Wärmepumpe',
          generator_type: 'ews_wp', leistung_kw: 50,
          vl_temp: 50, rl_temp: 30, cop: 4.2,
          sole_vl: 4, sole_rl: 0, sole_ce: 1.08,
        },
      },
      {
        id: 'demo-sp',
        type: 'speicher',
        position: { x: 690, y: 70 },
        data: { label: 'Pufferspeicher', nr: 4, speicher_liter: 1000 },
      },
      {
        id: 'demo-vt',
        type: 'verteiler',
        position: { x: 860, y: 35 },
        data: { label: 'Heizungsverteiler', nr: 5, abgaenge: 2 },
      },
      {
        id: 'demo-g1',
        type: 'gruppe',
        position: { x: 990, y: 195 },
        data: {
          label: 'Gruppe 1 · FBH', nr: 6, typ: 'Fussbodenheizung (FBH)',
          q_kw: 12, vl_temp: 35, rl_temp: 28, dp_kpa: 14,
          schaltung: 'einspritz', hat_pumpe: true, hat_ventil: true,
        },
      },
      {
        id: 'demo-g2',
        type: 'gruppe',
        position: { x: 1165, y: 195 },
        data: {
          label: 'Gruppe 2 · Heizkörper', nr: 7, typ: 'Heizkörper modern (HK)',
          q_kw: 24, vl_temp: 50, rl_temp: 40, dp_kpa: 22,
          schaltung: 'drossel', hat_pumpe: false, hat_ventil: true,
        },
      },
    ],
    edges: [
      // Sole-/Quellenkreis: Q_Quelle = Q_Heiz · (1 - 1/COP)
      { id: 'demo-e1', source: 'demo-ews', sourceHandle: 'sole-vl', target: 'demo-solep', targetHandle: 'bottom', ...E, style: SOLE_VL, data: { layer_id: 'sole_vl' }, label: 'Sole VL 4 °C' },
      { id: 'demo-e2', source: 'demo-solep', sourceHandle: 'top', target: 'demo-wp', targetHandle: 'source_flow', ...E, style: SOLE_VL, data: { layer_id: 'sole_vl' } },
      { id: 'demo-e3', source: 'demo-wp', sourceHandle: 'source_return', target: 'demo-ews', targetHandle: 'sole-rl', ...E, style: SOLE_RL, data: { layer_id: 'sole_rl' }, label: 'Sole RL 0 °C' },

      // Wärmepumpenkreis: eigene 50/30-°C-Auslegung bis zum Speicher.
      { id: 'demo-e4', source: 'demo-wp', sourceHandle: 'heating_flow', target: 'demo-sp', targetHandle: 'sz-l-28', ...E, style: VL, data: { layer_id: 'heizung_vl' }, label: 'WP VL 50 °C' },
      { id: 'demo-e5', source: 'demo-sp', sourceHandle: 'sz-l-76', target: 'demo-wp', targetHandle: 'heating_return', ...E, style: RL, data: { layer_id: 'heizung_rl' }, label: 'WP RL 30 °C' },

      // Verbraucherkreis: Speicher und Verteiler bilden die harte Kreisgrenze.
      { id: 'demo-e6', source: 'demo-sp', sourceHandle: 'sz-r-28', target: 'demo-vt', targetHandle: 'vl-main', ...E, style: VL, data: { layer_id: 'heizung_vl' }, label: 'Verbraucher VL' },
      { id: 'demo-e7', source: 'demo-vt', sourceHandle: 'rl-main', target: 'demo-sp', targetHandle: 'sz-r-76', ...E, style: RL, data: { layer_id: 'heizung_rl' }, label: 'Verbraucher RL' },
      { id: 'demo-e8', source: 'demo-vt', sourceHandle: 'vl-1', target: 'demo-g1', targetHandle: 'vl', ...E, style: VL, data: { layer_id: 'heizung_vl' } },
      { id: 'demo-e9', source: 'demo-g1', sourceHandle: 'rl', target: 'demo-vt', targetHandle: 'rl-1', ...E, style: RL, data: { layer_id: 'heizung_rl' } },
      { id: 'demo-e10', source: 'demo-vt', sourceHandle: 'vl-2', target: 'demo-g2', targetHandle: 'vl', ...E, style: VL, data: { layer_id: 'heizung_vl' } },
      { id: 'demo-e11', source: 'demo-g2', sourceHandle: 'rl', target: 'demo-vt', targetHandle: 'rl-2', ...E, style: RL, data: { layer_id: 'heizung_rl' } },
    ],
  },

  // ── 1. Beimischenschaltung ─────────────────────────────────
  beimisch: {
    name: 'Beimischenschaltung',
    regelt: 'Temperatur',
    einsatz: 'HK · FBH · BWW · Lufterhitzer',
    nodes: [
      { id: 'we',   type: 'erzeuger',    position: { x: 60,  y: 200 }, data: { label: 'WE' } },
      { id: 'v3',   type: 'valve3',      position: { x: 250, y: 195 }, data: { label: '3WM' } },
      { id: 'pump', type: 'pump',        position: { x: 270, y: 110 }, data: { label: 'P1' } },
      { id: 'hk',  type: 'verbraucher', position: { x: 430, y: 155 }, data: { label: 'Heizkreis' } },
    ],
    edges: [
      // WE VL → 3WM Port A (oben links)
      { id: 'e1', source: 'we',   sourceHandle: 'vl', target: 'v3',   targetHandle: 'a',  ...E, style: VL, label: 'VL prim.' },
      // 3WM AB → Pump
      { id: 'e2', source: 'v3',   sourceHandle: 'ab', target: 'pump', targetHandle: 'in', ...E, style: VL },
      // Pump → Heizkreis
      { id: 'e3', source: 'pump', sourceHandle: 'out',target: 'hk',   targetHandle: 'vl', ...E, style: VL, label: 'VL sek.' },
      // Heizkreis RL → 3WM Port B (Beimischung)
      { id: 'e4', source: 'hk',   sourceHandle: 'rl', target: 'v3',   targetHandle: 'b',  ...E, style: RL, label: 'Beimisch' },
      // Heizkreis RL → WE RL
      { id: 'e5', source: 'hk',   sourceHandle: 'rl', target: 'we',   targetHandle: 'rl', ...E, style: RL, label: 'RL prim.' },
    ],
  },

  // ── 2. Einspritzschaltung ──────────────────────────────────
  einspritz: {
    name: 'Einspritzschaltung',
    regelt: 'Temperatur',
    einsatz: 'HK · BWW · Lufterhitzer',
    nodes: [
      { id: 'we',   type: 'erzeuger',    position: { x: 60,  y: 140 }, data: { label: 'WE' } },
      { id: 'v2',   type: 'valve2',      position: { x: 230, y: 60  }, data: { label: 'Einspritzv.' } },
      { id: 'cv',   type: 'checkvalve',  position: { x: 230, y: 155 }, data: { label: 'RV' } },
      { id: 'pump', type: 'pump',        position: { x: 380, y: 155 }, data: { label: 'P1' } },
      { id: 'hk',  type: 'verbraucher', position: { x: 500, y: 155 }, data: { label: 'Heizkreis' } },
    ],
    edges: [
      { id: 'e1', source: 'we',   sourceHandle: 'vl', target: 'v2',   targetHandle: 'in',  ...E, style: VL, label: 'VL' },
      { id: 'e2', source: 'v2',   sourceHandle: 'out',target: 'cv',   targetHandle: 'in',  ...E, style: VL },
      { id: 'e3', source: 'cv',   sourceHandle: 'out',target: 'pump', targetHandle: 'in',  ...E, style: VL },
      { id: 'e4', source: 'pump', sourceHandle: 'out',target: 'hk',   targetHandle: 'vl',  ...E, style: VL, label: 'VL sek.' },
      { id: 'e5', source: 'hk',   sourceHandle: 'rl', target: 'we',   targetHandle: 'rl',  ...E, style: RL, label: 'RL' },
    ],
  },

  // ── 3. Drosselschaltung ────────────────────────────────────
  drossel: {
    name: 'Drosselschaltung',
    regelt: 'Massestrom',
    einsatz: 'Luftkühler · BWW · Fernwärme',
    nodes: [
      { id: 'we',   type: 'erzeuger',    position: { x: 40,  y: 150 }, data: { label: 'WE' } },
      { id: 'pump', type: 'pump',        position: { x: 200, y: 90  }, data: { label: 'P1' } },
      { id: 'v2',   type: 'valve2',      position: { x: 330, y: 90  }, data: { label: '2WV' } },
      { id: 'hk',  type: 'verbraucher', position: { x: 470, y: 90  }, data: { label: 'Heizkreis' } },
    ],
    edges: [
      { id: 'e1', source: 'we',   sourceHandle: 'vl', target: 'pump', targetHandle: 'in',  ...E, style: VL, label: 'VL' },
      { id: 'e2', source: 'pump', sourceHandle: 'out',target: 'v2',   targetHandle: 'in',  ...E, style: VL },
      { id: 'e3', source: 'v2',   sourceHandle: 'out',target: 'hk',   targetHandle: 'vl',  ...E, style: VL },
      { id: 'e4', source: 'hk',   sourceHandle: 'rl', target: 'we',   targetHandle: 'rl',  ...E, style: RL, label: 'RL' },
    ],
  },

  // ── 4. Umschaltschaltung ───────────────────────────────────
  umschalt: {
    name: 'Umschaltschaltung',
    regelt: 'Massestrom',
    einsatz: 'Lufterhitzer / ULA',
    nodes: [
      { id: 'we',  type: 'erzeuger',    position: { x: 40,  y: 150 }, data: { label: 'WE' } },
      { id: 'p1',  type: 'pump',        position: { x: 190, y: 90  }, data: { label: 'P1' } },
      { id: 'va',  type: 'valve2',      position: { x: 300, y: 90  }, data: { label: '30%' } },
      { id: 'vb',  type: 'valve2',      position: { x: 410, y: 90  }, data: { label: '100%' } },
      { id: 'hk', type: 'verbraucher', position: { x: 530, y: 90  }, data: { label: 'Heizkreis' } },
    ],
    edges: [
      { id: 'e1', source: 'we', sourceHandle: 'vl', target: 'p1', targetHandle: 'in',  ...E, style: VL },
      { id: 'e2', source: 'p1', sourceHandle: 'out',target: 'va', targetHandle: 'in',  ...E, style: VL },
      { id: 'e3', source: 'va', sourceHandle: 'out',target: 'vb', targetHandle: 'in',  ...E, style: VL },
      { id: 'e4', source: 'vb', sourceHandle: 'out',target: 'hk', targetHandle: 'vl',  ...E, style: VL },
      { id: 'e5', source: 'hk', sourceHandle: 'rl', target: 'we', targetHandle: 'rl',  ...E, style: RL, label: 'RL' },
    ],
  },

  blank: {
    name: 'Leer (frei zeichnen)',
    regelt: '',
    einsatz: '',
    nodes: [],
    edges: [],
  },
};
