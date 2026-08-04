import 'katex/dist/katex.min.css';

import { renderMath } from './renderMath';

export default function MathFormula({ latex, fallback, displayMode = false, className = '', style }) {
  if (!latex) return <span className={className} style={style}>{fallback}</span>;

  return (
    <span
      className={className}
      style={style}
      aria-label={fallback || latex}
      dangerouslySetInnerHTML={{ __html: renderMath(latex, displayMode) }}
    />
  );
}
