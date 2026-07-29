import { describe, expect, it } from 'vitest';
import { SCHALTUNGEN } from './schaltungen';

describe('Luca-Pitch-Demoschema', () => {
  it('enthält Quellen-, Wärmepumpen- und Verbraucherkreis als getrennte Topologien', () => {
    const schema = SCHALTUNGEN.luca_demo;
    const layers = new Set(schema.edges.map(edge => edge.data?.layer_id));
    const nodeTypes = new Set(schema.nodes.map(node => node.type));

    expect(nodeTypes.has('erdsonden')).toBe(true);
    expect(nodeTypes.has('erzeuger')).toBe(true);
    expect(nodeTypes.has('speicher')).toBe(true);
    expect(nodeTypes.has('verteiler')).toBe(true);
    expect(schema.nodes.filter(node => node.type === 'gruppe')).toHaveLength(2);
    expect(layers).toEqual(new Set(['sole_vl', 'sole_rl', 'heizung_vl', 'heizung_rl']));
  });

  it('liefert ausfüllte Wärmepumpen- und Gruppendaten für die Live-Berechnung', () => {
    const schema = SCHALTUNGEN.luca_demo;
    const wp = schema.nodes.find(node => node.id === 'demo-wp');
    const groups = schema.nodes.filter(node => node.type === 'gruppe');

    expect(wp.data).toMatchObject({
      generator_type: 'ews_wp',
      leistung_kw: 50,
      cop: 4.2,
      sole_vl: 4,
      sole_rl: 0,
    });
    expect(groups.map(node => node.data.q_kw)).toEqual([12, 24]);
  });
});
