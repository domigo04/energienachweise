import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAWING_CONFIG, graphFuerEditor, normalisiereDrawingConfig,
} from './graphMigration';

// Punkt 19 / Test 11 — der Bestand steht hier auf dem Spiel. Ein altes Schema
// muss unverändert laden; die Migration darf nur ergänzen, nie verändern.

describe('graphFuerEditor — Altbestand', () => {
  it('lässt Leitungspunkte eines gespeicherten Schemas unverändert', () => {
    const punkte = [{ x: 1200, y: 800 }, { x: 2400, y: 800 }, { x: 2400, y: 1450 }];
    const { edges } = graphFuerEditor({
      nodes: [],
      edges: [{ id: 'e1', source: 'a', target: 'b', data: { layer_id: 'heizung_vl', points: punkte } }],
    });
    expect(edges[0].data.points).toEqual(punkte);
  });

  it('erfindet für eine Leitung OHNE Punkte keine Geometrie', () => {
    // Altbestand vor der Polyline: die Route wird aus Quelle/Ziel gerechnet.
    // Eine erfundene Punktliste würde die Leitung sichtbar verbiegen.
    const { edges } = graphFuerEditor({
      nodes: [],
      edges: [{ id: 'e1', source: 'a', sourceHandle: 'vl', target: 'b', targetHandle: 'vl_in' }],
    });
    expect(edges[0].data.points).toBeUndefined();
    expect(edges[0].source).toBe('a');
    expect(edges[0].sourceHandle).toBe('vl');
  });

  it('markiert jede geladene Leitung als Polyline, ohne andere Daten zu verlieren', () => {
    const { edges } = graphFuerEditor({
      edges: [{ id: 'e1', source: 'a', target: 'b',
                data: { layer_id: 'sole_vl', laenge_m: 12.5, dn: 32 } }],
    });
    expect(edges[0].data).toMatchObject({
      layer_id: 'sole_vl', laenge_m: 12.5, dn: 32,
      cad_polyline: true, polyline_version: 1,
    });
  });

  it('behält einen leitungseigenen Eckenradius', () => {
    const { edges } = graphFuerEditor({
      drawing_config: { corner_radius: 8 },
      edges: [{ id: 'e1', source: 'a', target: 'b', data: { corner_radius: 0 } }],
    });
    expect(edges[0].data.corner_radius).toBe(0);   // 0 ist ein Wert, kein „fehlt"
  });

  it('verträgt einen leeren, unvollständigen oder fehlenden Graphen', () => {
    for (const graph of [undefined, {}, { nodes: null, edges: 'kaputt' }]) {
      const r = graphFuerEditor(graph);
      expect(r.nodes).toEqual([]);
      expect(r.edges).toEqual([]);
      expect(r.drawingConfig.grid_size).toBe(DEFAULT_DRAWING_CONFIG.grid_size);
    }
  });

  it('rückt alte freie Leitungsenden einmalig auf den Ankerpunkt', () => {
    const einmal = graphFuerEditor({ nodes: [{ id: 'j1', type: 'junction', position: { x: 100, y: 200 } }] });
    expect(einmal.nodes[0].position).toEqual({ x: 106, y: 206 });
    expect(einmal.nodes[0].data.cad_anchor).toBe(true);
    // Zweites Laden darf NICHT erneut verschieben.
    const zweimal = graphFuerEditor({ nodes: einmal.nodes });
    expect(zweimal.nodes[0].position).toEqual({ x: 106, y: 206 });
  });

  it('vergibt fehlende Bauteilnummern fortlaufend ohne Kollision', () => {
    const { nodes } = graphFuerEditor({
      nodes: [
        { id: 'p1', type: 'pump', data: { nr: 3 } },
        { id: 'p2', type: 'pump', data: {} },
        { id: 'p3', type: 'pump', data: {} },
      ],
    });
    expect(nodes[0].data.nr).toBe(3);      // bestehende Nummer bleibt
    expect(nodes[1].data.nr).toBe(4);
    expect(nodes[2].data.nr).toBe(5);
  });
});

describe('normalisiereDrawingConfig', () => {
  it('setzt für ein Altschema ohne CAD-Flags das bisherige Verhalten', () => {
    const c = normalisiereDrawingConfig({});
    expect(c.ortho).toBe(true);         // orthogonal war schon vorher der Standard
    expect(c.object_snap).toBe(true);
    expect(c.auto_return).toBe(false);  // Auto-RL nur bei ausdrücklichem Flag
    expect(c.polar_snap).toBe(false);
    expect(c.polar_angle).toBe(45);
    expect(c.dynamic_input).toBe(true);
  });

  it('normalisiert Polarfang und dynamische Eingabe', () => {
    expect(normalisiereDrawingConfig({ polar_snap:true, polar_angle:30, dynamic_input:false }))
      .toMatchObject({ polar_snap:true, polar_angle:30, dynamic_input:false });
    expect(normalisiereDrawingConfig({ polar_angle:17 }).polar_angle).toBe(45);
  });

  it('respektiert ausdrücklich abgeschaltete CAD-Zustände', () => {
    const c = normalisiereDrawingConfig({ ortho: false, object_snap: false });
    expect(c.ortho).toBe(false);
    expect(c.object_snap).toBe(false);
  });

  it('zeigt das Raster nur, wenn es ausdrücklich eingeschaltet ist', () => {
    // Zeichenhilfe, kein Planinhalt: ohne Angabe bleibt der Grund leer.
    expect(normalisiereDrawingConfig({}).raster_sichtbar).toBe(false);
    expect(normalisiereDrawingConfig({ raster_sichtbar: true }).raster_sichtbar).toBe(true);
    // Der Rasterfang hängt an grid_size und bleibt davon unberührt.
    expect(normalisiereDrawingConfig({ raster_sichtbar: false }).grid_size).toBe(10);
  });

  it('lässt nur erlaubte Rasterweiten zu', () => {
    expect(normalisiereDrawingConfig({ grid_size: 25 }).grid_size).toBe(25);
    expect(normalisiereDrawingConfig({ grid_size: 7 }).grid_size).toBe(10);
    expect(normalisiereDrawingConfig({ grid_size: 'viel' }).grid_size).toBe(10);
  });

  it('begrenzt Radius und Fangtoleranz auf sinnvolle Werte', () => {
    expect(normalisiereDrawingConfig({ corner_radius: 999 }).corner_radius).toBe(40);
    expect(normalisiereDrawingConfig({ corner_radius: -5 }).corner_radius).toBe(0);
    expect(normalisiereDrawingConfig({ snap_tolerance: 0 }).snap_tolerance).toBe(10);
    expect(normalisiereDrawingConfig({ snap_tolerance: 500 }).snap_tolerance).toBe(40);
  });

  it('reduziert einen Shortcut auf eine Taste in Kleinschreibung', () => {
    expect(normalisiereDrawingConfig({ shortcut_line: 'Shift+L' }).shortcut_line).toBe('l');
    expect(normalisiereDrawingConfig({ shortcut_rotate: '' }).shortcut_rotate).toBe('d');
  });
});
