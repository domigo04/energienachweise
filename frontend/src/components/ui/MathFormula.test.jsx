import { describe, expect, it } from 'vitest';

import { renderMath } from './renderMath';

describe('MathFormula', () => {
  it('rendert echte Brüche und Indizes als MathML und HTML', () => {
    const html = renderMath(String.raw`L_{\mathrm{erf}} = \frac{Q_0 \cdot 1000}{q_E}`);

    expect(html).toContain('<mfrac>');
    expect(html).toContain('katex-html');
    expect(html).toContain('L');
  });

  it('liefert für eine fehlende Formel keinen HTML-Block', () => {
    expect(renderMath('')).toBe('');
  });
});
