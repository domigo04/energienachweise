import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SymWE } from './symbols';

describe('Wärmeerzeugersymbole', () => {
  it('zeichnet innen- und aussenaufgestellte Luft/Wasser-WP wie die Standard-WP', () => {
    const markup = renderToStaticMarkup(
      <SymWE generatorType="lwwp" lwwpBauart="aussenaufstellung"/>,
    );
    expect(markup).toContain('L/W-WP');
    expect(markup).toContain('<text x="32" y="38">V</text>');
    expect(markup).not.toContain('AUL');
    expect(markup).toContain('aria-label="Luft/Wasser-Wärmepumpe mit Aussenluft und Fortluft"');
  });

  it('kennzeichnet die Splitbauart mit getrennter Kältemittelleitung', () => {
    const markup = renderToStaticMarkup(
      <SymWE generatorType="lwwp" lwwpBauart="split"/>,
    );
    expect(markup).toContain('L/W-WP SPLIT');
    expect(markup).toContain('VERFL.');
    expect(markup).toContain('VERD.');
    expect(markup).toContain('stroke-dasharray="7 5"');
  });

  it('zeichnet andere Erzeugerarten unterscheidbar', () => {
    expect(renderToStaticMarkup(<SymWE generatorType="gas"/>)).toContain('GAS');
    expect(renderToStaticMarkup(<SymWE generatorType="fernwaerme"/>)).toContain('FERNWÄRME');
    expect(renderToStaticMarkup(<SymWE generatorType="hybrid"/>)).toContain('HYBRID');
  });
});
