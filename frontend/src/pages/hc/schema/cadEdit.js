// Direkte Geometriebearbeitung an einer bestehenden Leitung (Grips).
// Rein, ohne React, ohne Hydraulik.

/**
 * Grips einer Leitung: Endpunkte und Eckpunkte.
 *
 * Endpunkte hängen an einem Bauteil oder Anker und werden anders behandelt als
 * Eckpunkte (sie verschieben die hydraulische Verbindung, nicht nur die Form) —
 * darum tragen sie hier einen eigenen Typ.
 */
export function gripsFuerRoute(route = []) {
  if (route.length < 2) return [];
  return route.map((punkt, index) => ({
    x: punkt.x,
    y: punkt.y,
    index,
    typ: (index === 0 || index === route.length - 1) ? 'endpoint' : 'vertex',
    // Eckpunkte liegen in `edge.data.points`, das den Start/Endpunkt NICHT
    // enthält — daher der versetzte Index für die Bearbeitung.
    pointIndex: index - 1,
  }));
}

/** Achse eines Segments: 'vertical', 'horizontal' oder null (diagonal). */
export function segmentOrientierung(a, b, toleranz = 0.5) {
  if (!a || !b) return null;
  if (Math.abs(a.x - b.x) <= toleranz && Math.abs(a.y - b.y) <= toleranz) return null;
  if (Math.abs(a.x - b.x) <= toleranz) return 'vertical';
  if (Math.abs(a.y - b.y) <= toleranz) return 'horizontal';
  return null;
}

/**
 * Ein Segment PARALLEL verschieben (Punkt 11).
 *
 * Es werden nur die beiden Punkte des Segments versetzt. Die angrenzenden
 * Segmente verlängern oder verkürzen sich dadurch von selbst — genau das
 * CAD-Verhalten:
 *
 *     ──────┐              ─────────┐
 *           │      →                │
 *     ──────┘              ─────────┘
 *
 * Die ganze Leitung wird NICHT verschoben.
 *
 * `orientation` bindet die Bewegung auf die Normale des Segments: ein
 * senkrechtes Segment kann nur seitlich wandern, ein waagrechtes nur hoch/runter.
 */
export function segmentVerschieben(points, pointIndexes, orientation, delta, { grid = 10, direction = null } = {}) {
  const idx = new Set(pointIndexes || []);
  if (!Array.isArray(points) || !idx.size) return points || [];
  const raster = (wert) => Math.round(wert / grid) * grid;

  let moveX = delta?.x || 0;
  let moveY = delta?.y || 0;
  if (orientation === 'vertical') {
    moveX = raster(moveX);
    moveY = 0;
  } else if (orientation === 'horizontal') {
    moveX = 0;
    moveY = raster(moveY);
  } else if (direction) {
    // Diagonales Segment: nur senkrecht zu seiner eigenen Richtung verschieben,
    // damit der Winkel erhalten bleibt.
    const laenge = Math.hypot(direction.x, direction.y) || 1;
    const nx = -direction.y / laenge;
    const ny = direction.x / laenge;
    const distanz = raster(moveX * nx + moveY * ny);
    moveX = nx * distanz;
    moveY = ny * distanz;
  } else {
    moveX = raster(moveX);
    moveY = raster(moveY);
  }

  return points.map((punkt, index) => (idx.has(index)
    ? { x: punkt.x + moveX, y: punkt.y + moveY }
    : punkt));
}

/**
 * Einen einzelnen Eckpunkt setzen. Gibt eine neue Liste zurück (keine Mutation),
 * damit React die Änderung sieht.
 */
export function eckpunktSetzen(points, pointIndex, punkt) {
  if (!Array.isArray(points) || pointIndex < 0 || pointIndex >= points.length) return points || [];
  const naechste = points.slice();
  naechste[pointIndex] = { x: punkt.x, y: punkt.y };
  return naechste;
}

/** Eckpunkt entfernen (Grip auf einen Nachbarn ziehen / bewusst löschen). */
export function eckpunktEntfernen(points, pointIndex) {
  if (!Array.isArray(points) || pointIndex < 0 || pointIndex >= points.length) return points || [];
  return points.filter((_, index) => index !== pointIndex);
}
