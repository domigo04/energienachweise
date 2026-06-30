// Vordefinierte hydraulische Schaltungen — alle Handles top/bottom, Edges type:'step'

const VL  = { stroke: '#ef4444', strokeWidth: 2.5 };
const RL  = { stroke: '#3b82f6', strokeWidth: 2.5 };
const E   = { type: 'step' };

export const SCHALTUNGEN = {

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
