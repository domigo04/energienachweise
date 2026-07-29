import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SymWE } from './symbols';

describe('Wärmeerzeugersymbole', () => {
  it('symbolisiert bei Luft/Wasser-WP Aussenluft und Fortluft', () => {
    const markup = renderToStaticMarkup(
      <SymWE generatorType="lwwp" lwwpBauart="aussenaufstellung"/>,
    );
    expect(markup).toContain('AUL');
    expect(markup).toContain('FOL');
    expect(markup).toContain('L/W-WP');
    expect(markup).toContain('AUSSEN');
    expect(markup).toContain('aria-label="Luft/Wasser-Wärmepumpe mit Aussenluft und Fortluft"');
  });

  it('kennzeichnet die Splitbauart mit getrennter Kältemittelleitung', () => {
    const markup = renderToStaticMarkup(
      <SymWE generatorType="lwwp" lwwpBauart="split"/>,
    );
    expect(markup).toContain('SPLIT');
    expect(markup).toContain('stroke-dasharray="7 5"');
  });

  it('zeichnet andere Erzeugerarten unterscheidbar', () => {
    expect(renderToStaticMarkup(<SymWE generatorType="gas"/>)).toContain('GAS');
    expect(renderToStaticMarkup(<SymWE generatorType="fernwaerme"/>)).toContain('FERNWÄRME');
    expect(renderToStaticMarkup(<SymWE generatorType="hybrid"/>)).toContain('HYBRID');
  });
});
