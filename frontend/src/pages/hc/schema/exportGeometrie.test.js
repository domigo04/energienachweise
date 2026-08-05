import { describe, expect, it } from 'vitest';

import { bauteilGeometrie, nodesMitExportGeometrie } from './exportGeometrie';

// So sieht ein vermessener React-Flow-Knoten aus: absolute Position, gemessene
// Grösse und die Handle-Bounds relativ zur Bauteilecke.
function gemessen({ x = 100, y = 50, width = 34, height = 34, handles = [] } = {}) {
  return {
    measured: { width, height },
    internals: {
      positionAbsolute: { x, y },
      handleBounds: { source: handles, target: [] },
    },
  };
}

const PUMPE = [
  { id: 'top', x: 13, y: -4, width: 8, height: 8 },
  { id: 'bottom', x: 13, y: 30, width: 8, height: 8 },
];

describe('bauteilGeometrie', () => {
  it('liefert Box und Anschlussmitten in absoluten Koordinaten', () => {
    const geometrie = bauteilGeometrie(gemessen({ handles: PUMPE }));

    expect(geometrie.box).toEqual({ x: 100, y: 50, width: 34, height: 34 });
    // Mitte des Handles: Bauteilecke + Handle-Ecke + halbe Handle-Grösse.
    expect(geometrie.handles).toEqual({
      top: { x: 117, y: 50 },
      bottom: { x: 117, y: 84 },
    });
  });

  it('gibt ohne Messung nichts zurück — das Backend rechnet dann selbst', () => {
    expect(bauteilGeometrie(null)).toBeNull();
    expect(bauteilGeometrie({ measured: { width: 34, height: 34 } })).toBeNull();
  });

  it('liefert die Anschlüsse auch ohne gemessene Grösse', () => {
    const ohneGroesse = gemessen({ handles: PUMPE });
    ohneGroesse.measured = {};
    const geometrie = bauteilGeometrie(ohneGroesse);

    expect(geometrie.box).toBeNull();
    expect(geometrie.handles.top).toEqual({ x: 117, y: 50 });
  });
});

describe('nodesMitExportGeometrie', () => {
  const nodes = [
    { id: 'p1', type: 'pump', position: { x: 100, y: 50 }, data: { nr: 3 } },
    { id: 'ohne', type: 'pump', position: { x: 0, y: 0 }, data: {} },
  ];
  const internalVon = (id) => (id === 'p1' ? gemessen({ handles: PUMPE }) : null);

  it('hängt die Messwerte an, ohne die übrigen Daten anzufassen', () => {
    const [mit, ohne] = nodesMitExportGeometrie(nodes, internalVon);

    expect(mit.data.nr).toBe(3);
    expect(mit.data.export_box.width).toBe(34);
    expect(mit.data.export_handles.bottom).toEqual({ x: 117, y: 84 });
    expect(ohne).toBe(nodes[1]);          // unverändert durchgereicht
    expect(nodes[0].data.export_box).toBeUndefined();   // Eingabe bleibt sauber
  });
});
