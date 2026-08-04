import katex from 'katex';

export function renderMath(latex, displayMode = false) {
  if (!latex) return '';
  return katex.renderToString(latex, {
    displayMode,
    output: 'htmlAndMathml',
    strict: 'ignore',
    throwOnError: false,
    trust: false,
  });
}
