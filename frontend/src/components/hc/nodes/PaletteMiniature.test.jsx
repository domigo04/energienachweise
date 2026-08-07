import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BauteilMiniatur, PALETTE_MINIATUR_TYPEN } from './PaletteMiniature';

const ERWARTETE_TYPEN = [
  'erzeuger', 'erdsonden', 'pwt', 'speicher', 'bww', 'verteiler', 'gruppe',
  'heizkoerper', 'luftheizapparat', 'lufterhitzer', 'lufterhitzer_gruppe',
  'pump', 'valve2', 'valve3', 'shutoff', 'stad', 'checkvalve', 'expansion',
  'sicherheitsventil', 'waermezaehler', 'waermezaehler_cad', 'temperatur',
  'anschluss', 'label', 'concrete_area', 'interface_line',
];

describe('Bauteil-Miniaturen', () => {
  it('kennt jeden Typ der Bauteilpalette', () => {
    expect([...PALETTE_MINIATUR_TYPEN].sort()).toEqual([...ERWARTETE_TYPEN].sort());
  });

  it.each(ERWARTETE_TYPEN)('zeichnet %s als SVG-Miniatur', type => {
    const markup = renderToStaticMarkup(<BauteilMiniatur item={{ type }} />);
    expect(markup).toContain('hc-palette-miniature');
    expect(markup).toContain('<svg');
  });

  it('unterscheidet die Wärmeerzeuger-Varianten', () => {
    const split = renderToStaticMarkup(<BauteilMiniatur item={{
      type:'erzeuger', preset:{ generator_type:'lwwp', lwwp_bauart:'split' },
    }} />);
    const sole = renderToStaticMarkup(<BauteilMiniatur item={{
      type:'erzeuger', preset:{ generator_type:'ews_wp' },
    }} />);
    expect(split).toContain('SPLIT');
    expect(sole).toContain('S/W-WP');
  });
});
