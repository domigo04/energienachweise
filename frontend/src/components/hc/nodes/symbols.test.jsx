import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ARMATUR_H, SymAbsperrklappe, SymCheckValve, SymEntleerung, SymPump, SymShutoff,
  SymSTAD, SymTemperatur, SymValve2V, SymValve3, SymWE,
} from './symbols';

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

describe('Kompakte Armaturen und Feldgeräte', () => {
  // Dominic 2026-08-05: alle Armaturen sind gleich hoch. Nur die Pumpe ist
  // grösser, Entleerung und Temperaturfühler sind kleiner.
  it('zeichnet alle Armaturen gleich hoch', () => {
    const armaturen = [
      <SymShutoff key="kh"/>, <SymAbsperrklappe key="ak"/>, <SymValve2V key="v2"/>,
      <SymValve3 key="v3"/>, <SymSTAD key="st"/>, <SymCheckValve key="rv"/>,
    ];
    for (const sym of armaturen) {
      expect(renderToStaticMarkup(sym)).toContain(`height="${ARMATUR_H}"`);
    }
  });

  it('zeichnet die Pumpe grösser und Fühler/Entleerung kleiner als die Armaturen', () => {
    expect(renderToStaticMarkup(<SymPump/>)).toContain('height="34"');
    expect(renderToStaticMarkup(<SymTemperatur/>)).toContain('height="19"');
    expect(renderToStaticMarkup(<SymEntleerung/>)).toContain('height="9.6"');
  });

  it('zeichnet Kugelhahn in Ventiloptik ohne Motor und das Rückschlagventil mit Leitungsstutzen', () => {
    const kugelhahn = renderToStaticMarkup(<SymShutoff/>);
    const rueckschlag = renderToStaticMarkup(<SymCheckValve/>);
    expect(kugelhahn).toContain('points="32,14 68,14 50,50"');
    expect(kugelhahn).not.toContain('ffd34d');
    expect(rueckschlag).toContain('y1="0"');
    expect(rueckschlag).toContain('y2="80"');
  });
});
