import { describe, expect, it } from 'vitest';

import {
  GENERATOR_TYPES,
  LWWP_BAUARTEN,
  generatorType,
  hatSoleOderWasserkreis,
  istWaermepumpe,
} from './generatorTypes';

describe('Erzeugerarten', () => {
  it('führt eindeutige maschinenlesbare Erzeugercodes', () => {
    const codes = GENERATOR_TYPES.map(item => item.value);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('lwwp');
    expect(codes).toContain('fernwaerme');
    expect(codes).toContain('holz');
    expect(codes).not.toContain('gas');
    expect(codes).not.toContain('oel');
  });

  it('klassiert die Luft/Wasser-WP als Wärmepumpe ohne hydraulischen Quellenkreis', () => {
    expect(generatorType('lwwp')).toMatchObject({ family: 'wp', source: 'air' });
    expect(istWaermepumpe('lwwp')).toBe(true);
    expect(hatSoleOderWasserkreis('lwwp')).toBe(false);
    expect(hatSoleOderWasserkreis('ews_wp')).toBe(true);
  });

  it('bietet Aussen-, Innen- und Splitaufstellung an', () => {
    expect(LWWP_BAUARTEN.map(item => item.value)).toEqual([
      'aussenaufstellung',
      'innenaufstellung',
      'split',
    ]);
  });
});
