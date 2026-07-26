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

// ── Route-Cleanup (Punkt 20) ───────────────────────────────────────────────
//
// Nach jedem Geometrie-Edit entstehen leicht Punkte, die nichts mehr tragen:
// ein Grip, der genau auf seinem Nachbarn landet, oder ein Zwischenpunkt, der
// nach dem Ziehen exakt auf der Verbindungslinie liegt. Gespeichert würden sie
// zu Nullsegmenten und zu Ecken, die man anfassen kann, die aber nichts tun.
//
// WICHTIG — die Grenze der Optimierung: bereinigt werden ausschliesslich
// EIGENE Zwischenpunkte der Leitung (`edge.data.points`). Start- und Endpunkt
// hängen an der Hydraulik und sind hier nie enthalten. Ein Punkt, der eine
// Abzweigung trägt, ist im Datenmodell ein `junction`-NODE und damit ein
// Leitungsende — er kann von dieser Funktion gar nicht erreicht werden.

const ENDLICH = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Liegt `b` auf der Strecke a→c (und ist damit als Ecke überflüssig)? */
export function istKollinear(a, b, c, toleranz = 0.5) {
  if (!ENDLICH(a) || !ENDLICH(b) || !ENDLICH(c)) return false;
  // Kreuzprodukt = doppelte Dreiecksfläche. Auf die Länge bezogen ergibt das den
  // senkrechten Abstand von b zur Geraden a→c.
  const flaeche = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const laenge = Math.hypot(c.x - a.x, c.y - a.y);
  if (laenge < toleranz) return true;          // a und c fallen zusammen
  return flaeche / laenge <= toleranz;
}

/**
 * Zwischenpunkte einer Leitung normalisieren.
 *
 * `start`/`end` sind die (hydraulischen) Enden. Sie werden NICHT zurückgegeben —
 * sie werden nur gebraucht, um zu erkennen, ob der erste bzw. letzte
 * Zwischenpunkt auf dem Ende klebt oder auf dessen Verbindungslinie liegt.
 *
 * Reihenfolge der Schritte ist bewusst: erst Unbrauchbares weg, dann Duplikate,
 * dann Kollinearität — sonst würde ein NaN-Punkt die Kollinearitätsprüfung
 * seiner Nachbarn verfälschen.
 */
export function routeBereinigen(points, { start = null, end = null, toleranz = 0.5 } = {}) {
  if (!Array.isArray(points)) return [];

  // 1. NaN/Infinity fliegen raus — ein solcher Punkt macht die ganze Leitung
  //    unzeichenbar und ist nie eine gewollte Geometrie.
  let sauber = points.filter(ENDLICH).map(p => ({ x: p.x, y: p.y }));

  // 2. Aufeinanderfolgende identische Punkte (Nullsegmente). Die Enden zählen
  //    mit: ein Zwischenpunkt genau auf dem Startpunkt ist auch ein Nullsegment.
  const mitEnden = [...(ENDLICH(start) ? [start] : []), ...sauber, ...(ENDLICH(end) ? [end] : [])];
  const behalten = [];
  for (let i = 0; i < mitEnden.length; i += 1) {
    const vorher = behalten.at(-1);
    if (vorher && Math.hypot(mitEnden[i].x - vorher.x, mitEnden[i].y - vorher.y) <= toleranz) continue;
    behalten.push(mitEnden[i]);
  }

  // 3. Kollineare Zwischenpunkte. Enden bleiben immer stehen.
  const ergebnis = behalten.slice();
  let index = 1;
  while (index < ergebnis.length - 1) {
    if (istKollinear(ergebnis[index - 1], ergebnis[index], ergebnis[index + 1], toleranz)) {
      ergebnis.splice(index, 1);          // Index bleibt: der Nachfolger rückt nach
    } else {
      index += 1;
    }
  }

  // Enden wieder abschneiden — zurück kommen nur die Zwischenpunkte.
  const von = ENDLICH(start) ? 1 : 0;
  const bis = ENDLICH(end) ? ergebnis.length - 1 : ergebnis.length;
  return ergebnis.slice(von, Math.max(von, bis));
}

/**
 * Ist eine Route überhaupt zeichenbar? Weniger als zwei brauchbare Punkte ergibt
 * keine Leitung.
 */
export function routeIstGueltig(route) {
  return Array.isArray(route) && route.filter(ENDLICH).length >= 2;
}
