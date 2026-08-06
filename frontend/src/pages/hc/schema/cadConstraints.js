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
 * ortho  — achsnahe Segmente werden horizontal/vertikal geführt; eine klar
 *          beabsichtigte Schräge ab 30° zur nächsten Achse bleibt erhalten
 * diag   — freie Richtung als bewusstes Shift-Verhalten
 * frei   — keine Richtungsbindung, nur Raster
 *
 * Shift kehrt den ortho-Zustand temporär um. Das ist die CAD-Gewohnheit: ORTHO
 * an + Shift = kurz frei, ORTHO aus + Shift = kurz gebunden.
 */
export const ORTHO = 'ortho';
export const DIAG = 'diag';
export const FREI = 'frei';
export const SCHRAEGE_MIN_WINKEL = 30;
export const POLAR_WINKEL = Object.freeze([90, 45, 30, 15]);

/** Neigung eines Segments zur Horizontalen, unabhängig von der Zeichenrichtung. */
export function segmentWinkelGrad(a, b) {
  if (!a || !b) return null;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (Math.hypot(dx, dy) < 0.5) return null;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

/** Kleinster Winkelabstand zur horizontalen oder vertikalen Achse (0…45°). */
export function achsenAbstandGrad(a, b) {
  const winkel = segmentWinkelGrad(a, b);
  return winkel === null ? 0 : Math.min(winkel, 90 - winkel);
}

/** Nur eine deutlich gezeichnete Schräge darf den ORTHO-Fang überstimmen. */
export function istBewussteDiagonale(a, b, minWinkel = SCHRAEGE_MIN_WINKEL) {
  // Trigonometrische Rundung darf eine exakt gezeichnete 30°-Linie nicht als
  // 29.999999999° unter die fachliche Schwelle drücken.
  return achsenAbstandGrad(a, b) >= minWinkel - 1e-9;
}

export function winkelLabel(winkel) {
  if (!Number.isFinite(winkel)) return '';
  const gerundet = Math.round(winkel * 10) / 10;
  return `${Number.isInteger(gerundet) ? gerundet : gerundet.toFixed(1)}°`;
}

/** Gerichteter Winkel im Zeichenkoordinatensystem (0° rechts, 90° unten). */
export function richtungsWinkelGrad(a, b) {
  if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) return null;
  const winkel = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return (winkel + 360) % 360;
}

/**
 * Polarfang auf ein frei gewähltes Winkelraster. Die Cursorentfernung bleibt
 * erhalten; nur die Richtung rastet auf das nächste Vielfache ein.
 */
export function polarPunkt(origin, point, winkelRaster = 45, grid = 10) {
  if (!origin || !point) return rasterPunkt(point, grid);
  const schritt = POLAR_WINKEL.includes(Number(winkelRaster)) ? Number(winkelRaster) : 45;
  const laenge = Math.hypot(point.x - origin.x, point.y - origin.y);
  if (laenge < 0.5) return { ...origin };
  const roh = Math.atan2(point.y - origin.y, point.x - origin.x);
  const rasterRad = schritt * Math.PI / 180;
  const winkel = Math.round(roh / rasterRad) * rasterRad;
  const ziel = {
    x:origin.x + Math.cos(winkel) * laenge,
    y:origin.y + Math.sin(winkel) * laenge,
  };
  return rasterPunkt(ziel, grid);
}

/** Welcher Modus gilt gerade, inklusive Shift-Umkehr? */
export function aktiverConstraint(orthoAn, shift = false) {
  if (shift) return orthoAn ? DIAG : ORTHO;
  return orthoAn ? ORTHO : FREI;
}

/**
 * Punkt unter dem aktiven Constraint.
 *
 * ORTHO: achsnahe Bewegungen werden exakt horizontal/vertikal. Erst eine
 *        deutliche Schräge (mindestens 30° zur nächsten Achse) bleibt schräg.
 * DIAG:  freie, gerasterte Richtung — Shift ist die ausdrückliche Freigabe.
 * FREI:  nur Raster.
 */
export function constrainPoint(origin, point, {
  ortho = true, shift = false, grid = 10, polar = false, polarWinkel = 45,
} = {}) {
  const modus = aktiverConstraint(ortho, shift);
  if (!origin) return rasterPunkt(point, grid);
  const raster = rasterPunkt(point, grid);
  if (!ortho && polar && !shift) return polarPunkt(origin, point, polarWinkel, grid);
  if (modus === FREI) return raster;
  if (modus === ORTHO) {
    if (istBewussteDiagonale(origin, point)) return raster;
    return Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y)
      ? { x: raster.x, y: origin.y }
      : { x: origin.x, y: raster.y };
  }
  return raster;
}

/**
 * Exakter Zielpunkt der dynamischen Eingabe. Länge und Winkel können einzeln
 * gesperrt werden; der jeweils fehlende Wert stammt aus der Cursorvorschau.
 */
export function punktAusDynamischerEingabe(origin, cursor, {
  laenge = null, winkel = null, ortho = true, shift = false,
  polar = false, polarWinkel = 45,
} = {}) {
  if (!origin || !cursor) return null;
  const cursorLaenge = segmentLaenge(origin, cursor);
  const zielLaenge = Number.isFinite(Number(laenge)) && Number(laenge) > 0
    ? Number(laenge) : cursorLaenge;
  if (!(zielLaenge > 0)) return null;

  const hatWinkel = winkel !== null && winkel !== '' && Number.isFinite(Number(winkel));
  const eingegebenerWinkel = Number(winkel);
  if (hatWinkel) {
    const rad = eingegebenerWinkel * Math.PI / 180;
    const dx = Math.cos(rad) * zielLaenge;
    const dy = Math.sin(rad) * zielLaenge;
    return {
      x:origin.x + (Math.abs(dx) < 1e-9 ? 0 : dx),
      y:origin.y + (Math.abs(dy) < 1e-9 ? 0 : dy),
    };
  }
  const richtungsPunkt = constrainPoint(origin, cursor, {
    ortho, shift, grid:1, polar, polarWinkel,
  });
  return punktAusLaenge(origin, richtungsPunkt, zielLaenge, { ortho:false, shift:false });
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

/** Länge plus Winkel — der Winkel erscheint nur bei einer bewussten Schräge. */
export function segmentMassLabel(a, b) {
  const basis = massLabel(segmentLaenge(a, b));
  if (!istBewussteDiagonale(a, b)) return basis;
  return `${basis} · ${winkelLabel(segmentWinkelGrad(a, b))}`;
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
    if (!istBewussteDiagonale(origin, richtungsPunkt)) {
      // Auf die dominante Achse reduzieren, danach exakt die getippte Länge.
      if (Math.abs(dx) >= Math.abs(dy)) return { x: origin.x + Math.sign(dx) * laenge, y: origin.y };
      return { x: origin.x, y: origin.y + Math.sign(dy) * laenge };
    }
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
