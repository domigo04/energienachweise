// Geometrie-Constraints des Zeichenbefehls. Rein, ohne React, ohne Hydraulik:
// diese Datei weiss nichts über Vorlauf, Rücklauf, Layer oder Medien. Sie kennt
// nur Punkte, Richtungen, Raster und Längen.
//
// Vorher lagen orthogonaler Fang und 45°-Fang als zwei separate Funktionen im
// Editor, und „orthogonal" war fest verdrahtet. Hier ist beides EIN
// Constraint-System mit einem umschaltbaren Zustand.

/** Interne Einheit ist mm — dieselbe wie im Raster und in der Persistenz. */
export const EINHEIT = 'mm';

export const rasterPunkt = (point, grid = 10) => ({
  x: Math.round(point.x / grid) * grid,
  y: Math.round(point.y / grid) * grid,
});

/**
 * Der Constraint-Zustand eines Zeichenbefehls.
 *
 * ortho  — Segmente werden auf die dominante Achse geführt (CAD ORTHO)
 * diag   — 45° zusätzlich erlaubt (bisheriges Shift-Verhalten)
 * frei   — keine Richtungsbindung, nur Raster
 *
 * Shift kehrt den ortho-Zustand temporär um. Das ist die CAD-Gewohnheit: ORTHO
 * an + Shift = kurz frei, ORTHO aus + Shift = kurz gebunden.
 */
export const ORTHO = 'ortho';
export const DIAG = 'diag';
export const FREI = 'frei';

/** Welcher Modus gilt gerade, inklusive Shift-Umkehr? */
export function aktiverConstraint(orthoAn, shift = false) {
  if (shift) return orthoAn ? DIAG : ORTHO;
  return orthoAn ? ORTHO : FREI;
}

/**
 * Punkt unter dem aktiven Constraint.
 *
 * ORTHO: die Achse gewinnt, in deren Richtung der Cursor weiter entfernt liegt.
 *        Start (1000,1000), Maus (1800,1200) → (1800,1000), weil |dx| > |dy|.
 * DIAG:  horizontal, vertikal oder exakt 45°.
 * FREI:  nur Raster.
 */
export function constrainPoint(origin, point, { ortho = true, shift = false, grid = 10 } = {}) {
  const modus = aktiverConstraint(ortho, shift);
  if (!origin) return rasterPunkt(point, grid);
  const raster = rasterPunkt(point, grid);
  if (modus === FREI) return raster;
  if (modus === ORTHO) {
    return Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y)
      ? { x: raster.x, y: origin.y }
      : { x: origin.x, y: raster.y };
  }
  // DIAG — Achtelkreis bestimmen: 0 = horizontal, 1 = 45°, 2 = vertikal.
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const achtel = Math.round(Math.atan2(Math.abs(dy), Math.abs(dx)) / (Math.PI / 4));
  if (achtel <= 0) return { x: raster.x, y: origin.y };
  if (achtel >= 2) return { x: origin.x, y: raster.y };
  const distanz = Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / grid) * grid;
  return {
    x: origin.x + (Math.sign(dx) || 1) * distanz,
    y: origin.y + (Math.sign(dy) || 1) * distanz,
  };
}

/** Länge eines Segments in mm. */
export const segmentLaenge = (a, b) => (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0);

/** Länge eines ganzen Zuges in mm. */
export const zugLaenge = (points = []) => points.slice(1)
  .reduce((summe, punkt, index) => summe + segmentLaenge(points[index], punkt), 0);

/**
 * Beschriftung eines temporären Masses.
 *
 * CAD-artig in mm ohne Trennzeichen bis 10 m, darüber in m — sonst wird die
 * Zahl am Cursor zu lang, um sie im Zeichnen zu lesen.
 */
export function massLabel(laengeMm) {
  const mm = Math.round(Number(laengeMm) || 0);
  if (mm >= 10000) return `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')} m`;
  return `${mm} mm`;
}

/**
 * Position der Massbeschriftung: Mitte des Segments, um `abstand` mm nach
 * aussen versetzt, damit die Zahl nicht auf der Linie klebt.
 */
export function massAnker(a, b, abstand = 14) {
  if (!a || !b) return null;
  const mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy);
  if (!laenge) return { ...mitte, laenge: 0 };
  // Normale des Segments; bei senkrechten Segmenten nach rechts, sonst nach oben.
  return {
    x: mitte.x + (-dy / laenge) * abstand,
    y: mitte.y + (dx / laenge) * abstand,
    laenge,
  };
}

/**
 * Endpunkt aus einer getippten Länge (numerische Direkteingabe).
 *
 * Die Richtung kommt aus der aktuellen Vorschau — nicht aus einem Formularfeld.
 * Bei ORTHO liegt der Punkt exakt horizontal oder vertikal, sonst entlang des
 * Vorschauvektors. Ohne brauchbare Richtung (Cursor noch auf dem Startpunkt)
 * gibt es keinen Punkt, statt eine Richtung zu erfinden.
 */
export function punktAusLaenge(origin, richtungsPunkt, laengeMm, { ortho = true, shift = false } = {}) {
  const laenge = Number(laengeMm);
  if (!origin || !richtungsPunkt || !Number.isFinite(laenge) || laenge <= 0) return null;
  let dx = richtungsPunkt.x - origin.x;
  let dy = richtungsPunkt.y - origin.y;
  if (Math.hypot(dx, dy) < 0.5) return null;

  const modus = aktiverConstraint(ortho, shift);
  if (modus === ORTHO) {
    // Auf die dominante Achse reduzieren, danach exakt die getippte Länge.
    if (Math.abs(dx) >= Math.abs(dy)) return { x: origin.x + Math.sign(dx) * laenge, y: origin.y };
    return { x: origin.x, y: origin.y + Math.sign(dy) * laenge };
  }
  if (modus === DIAG) {
    const achtel = Math.round(Math.atan2(Math.abs(dy), Math.abs(dx)) / (Math.PI / 4));
    if (achtel <= 0) return { x: origin.x + Math.sign(dx) * laenge, y: origin.y };
    if (achtel >= 2) return { x: origin.x, y: origin.y + Math.sign(dy) * laenge };
    const kante = laenge / Math.SQRT2;
    return {
      x: origin.x + (Math.sign(dx) || 1) * kante,
      y: origin.y + (Math.sign(dy) || 1) * kante,
    };
  }
  const norm = Math.hypot(dx, dy);
  dx /= norm;
  dy /= norm;
  return { x: origin.x + dx * laenge, y: origin.y + dy * laenge };
}

/**
 * Tastendruck in den Puffer der numerischen Eingabe.
 *
 * Rückgabe: { buffer, action }
 *   action = 'weiter' | 'anwenden' | 'abbrechen' | 'ignoriert'
 *
 * Bewusst eng: nur Ziffern, ein Dezimaltrennzeichen, Backspace, Enter, Escape.
 * Alles andere wird ignoriert, damit während der Eingabe kein Shortcut feuert.
 */
export function laengeTaste(buffer, key) {
  if (key === 'Enter') {
    return { buffer, action: buffer ? 'anwenden' : 'abbrechen' };
  }
  if (key === 'Escape') return { buffer: '', action: 'abbrechen' };
  if (key === 'Backspace') {
    const next = buffer.slice(0, -1);
    return { buffer: next, action: next ? 'weiter' : 'abbrechen' };
  }
  if (/^[0-9]$/.test(key)) return { buffer: buffer + key, action: 'weiter' };
  if ((key === '.' || key === ',') && !buffer.includes('.')) {
    // Leere Eingabe mit Punkt beginnen lassen ergibt „0."; sonst wäre „.5" nicht lesbar.
    return { buffer: (buffer || '0') + '.', action: 'weiter' };
  }
  return { buffer, action: 'ignoriert' };
}

/** Puffer → mm. Unvollständiges wie „12." ergibt null statt NaN. */
export function laengeAusBuffer(buffer) {
  const wert = Number.parseFloat(buffer);
  return Number.isFinite(wert) && wert > 0 ? wert : null;
}
