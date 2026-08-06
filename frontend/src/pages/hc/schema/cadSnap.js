// Fangtypen und ihre Darstellung. Rein, ohne React.
//
// Kernregel: der gesetzte Punkt IST der angezeigte Punkt. Darum liefert
// `fangErgebnis()` beides aus einer Quelle — Koordinate und Marker. Es gibt
// keinen Weg, an dem die Anzeige aus einer anderen Rechnung stammt als der
// Klick, und `pruefeFangTreue()` hält das als Prüfung fest.

export const GRID = 'grid';
export const ENDPOINT = 'endpoint';
export const PORT = 'port';
export const INTERSECTION = 'intersection';
export const NEAREST = 'nearest';
// Vorbereitet, noch nicht gesucht — die Darstellung steht schon bereit.
export const MIDPOINT = 'midpoint';
// Bestehender Polylinien-Eckpunkt (§24) — der genaueste Punkt einer Leitung,
// weil ihn jemand bewusst gesetzt hat.
export const CORNER = 'corner';
export const PERPENDICULAR = 'perpendicular';

/**
 * Darstellung je Fangtyp. `form` ist die Marker-Geometrie, `label` der Kurztext
 * am Cursor. `prio` entscheidet, welcher Fang gewinnt, wenn mehrere greifen:
 * ein Bauteilanschluss ist immer wichtiger als ein Rasterpunkt.
 */
export const FANG_STIL = {
  [PORT]:          { form: 'circle', label: 'Anschluss',    farbe: '#16a34a', prio: 100 },
  [ENDPOINT]:      { form: 'square', label: 'Endpunkt',     farbe: '#16a34a', prio: 90 },
  [INTERSECTION]:  { form: 'cross',  label: 'Schnittpunkt', farbe: '#7c3aed', prio: 80 },
  [CORNER]:        { form: 'square', label: 'Eckpunkt',     farbe: '#16a34a', prio: 85 },
  [MIDPOINT]:      { form: 'triangle', label: 'Mittelpunkt', farbe: '#0ea5e9', prio: 70 },
  [PERPENDICULAR]: { form: 'angle',  label: 'Senkrecht',    farbe: '#0ea5e9', prio: 60 },
  [NEAREST]:       { form: 'hourglass', label: 'auf Leitung', farbe: '#7c3aed', prio: 50 },
  [GRID]:          { form: 'dot',    label: 'Raster',       farbe: '#94a3b8', prio: 10 },
};

export const fangStil = (typ) => FANG_STIL[typ] || FANG_STIL[GRID];

/**
 * Fangkandidaten → ein Ergebnis.
 *
 * `kandidaten`: [{ typ, x, y, distanz, ...beliebige Nutzlast }]
 * `fallback`:   Punkt, wenn nichts fängt (der gerasterte Cursor)
 *
 * Auswahl: höhere Priorität gewinnt; bei gleicher Priorität der nähere Punkt.
 * Der Rasterfang ist bewusst ein eigener Typ und kein „kein Fang" — im CAD
 * fängt man auch aufs Raster, und der Nutzer soll das sehen.
 */
export function fangErgebnis(kandidaten, fallback, { zeigeRaster = true } = {}) {
  const gueltig = (kandidaten || []).filter(k =>
    k && FANG_STIL[k.typ] && Number.isFinite(k.x) && Number.isFinite(k.y));

  if (!gueltig.length) {
    if (!fallback || !Number.isFinite(fallback.x) || !Number.isFinite(fallback.y)) return null;
    return {
      point: { x: fallback.x, y: fallback.y },
      typ: GRID,
      marker: zeigeRaster ? { ...fangStil(GRID), typ: GRID, x: fallback.x, y: fallback.y } : null,
      treffer: null,
    };
  }

  const beste = gueltig.reduce((a, b) => {
    const pa = fangStil(a.typ).prio;
    const pb = fangStil(b.typ).prio;
    if (pa !== pb) return pa > pb ? a : b;
    return (a.distanz ?? Infinity) <= (b.distanz ?? Infinity) ? a : b;
  });

  // EINE Koordinatenquelle für Punkt und Marker.
  const point = { x: beste.x, y: beste.y };
  return {
    point,
    typ: beste.typ,
    marker: { ...fangStil(beste.typ), typ: beste.typ, ...point },
    treffer: beste,
  };
}

/**
 * Kleine Hysterese gegen Flackern (Punkt 8).
 *
 * Liegen zwei Kandidaten fast gleich weit, springt der Fang sonst bei jeder
 * Mausbewegung hin und her. Ein bereits gehaltener Fang darf darum etwas
 * „zäher" sein: er wird nur abgelöst, wenn der neue Kandidat deutlich besser
 * ist — höhere Priorität, oder merklich näher.
 *
 * `haltefaktor` 1.0 schaltet die Hysterese ab; 0.7 heisst „30 % näher nötig".
 */
export function fangMitHysterese(neu, gehalten, { haltefaktor = 0.7, radius = 0 } = {}) {
  if (!neu) return gehalten || null;
  if (!gehalten || !gehalten.treffer || !neu.treffer) return neu;
  if (gehalten.typ === neu.typ
    && gehalten.point.x === neu.point.x && gehalten.point.y === neu.point.y) return gehalten;

  const pNeu = fangStil(neu.typ).prio;
  const pAlt = fangStil(gehalten.typ).prio;
  if (pNeu > pAlt) return neu;                     // wichtigerer Fangtyp gewinnt sofort
  if (pNeu < pAlt) {
    // Der gehaltene Fang bleibt, solange er überhaupt noch in Reichweite ist.
    const dAlt = gehalten.treffer.distanz ?? Infinity;
    return radius && dAlt <= radius ? gehalten : neu;
  }
  const dNeu = neu.treffer.distanz ?? Infinity;
  const dAlt = gehalten.treffer.distanz ?? Infinity;
  return dNeu <= dAlt * haltefaktor ? neu : gehalten;
}

/**
 * Prüfung der Fangtreue: liegt der gesetzte Punkt exakt auf dem angezeigten
 * Marker? Genau der Fall „UI zeigt Fangpunkt A, Klick landet 6 px daneben" darf
 * nicht auftreten.
 */
export function pruefeFangTreue(ergebnis) {
  if (!ergebnis?.marker) return true;                  // kein Marker, nichts zu halten
  return ergebnis.marker.x === ergebnis.point.x
    && ergebnis.marker.y === ergebnis.point.y;
}

/**
 * Schnittpunkte zweier achsparalleler Segmente. Nur echte Kreuzungen innerhalb
 * beider Segmente, keine Verlängerungen — sonst „fängt" der Cursor im Leeren.
 */
export function segmentSchnittpunkt(a1, a2, b1, b2) {
  const aVertikal = Math.abs(a1.x - a2.x) < 0.5;
  const bVertikal = Math.abs(b1.x - b2.x) < 0.5;
  const aHorizontal = Math.abs(a1.y - a2.y) < 0.5;
  const bHorizontal = Math.abs(b1.y - b2.y) < 0.5;
  const zwischen = (wert, p, q) => wert >= Math.min(p, q) - 0.5 && wert <= Math.max(p, q) + 0.5;

  if (aVertikal && bHorizontal) {
    const punkt = { x: a1.x, y: b1.y };
    return zwischen(punkt.y, a1.y, a2.y) && zwischen(punkt.x, b1.x, b2.x) ? punkt : null;
  }
  if (aHorizontal && bVertikal) {
    const punkt = { x: b1.x, y: a1.y };
    return zwischen(punkt.x, a1.x, a2.x) && zwischen(punkt.y, b1.y, b2.y) ? punkt : null;
  }
  return null;   // parallel oder schräg — hier bewusst kein Schnittpunktfang
}

/**
 * Echter orthogonaler T-Stück-Punkt auf einem bestehenden Teilstück.
 *
 * Der normale Nearest-Fang projiziert den Cursor auf die Bestandsleitung. Wenn
 * die neue Leitung bereits horizontal/vertikal auf diese zuläuft, darf daraus
 * aber kein zusätzliches Stück längs auf der Bestandsleitung entstehen. Der
 * Fangpunkt ist dann direkt der Schnitt der Achse durch `origin` mit dem
 * vorhandenen, endlichen Segment.
 */
export function orthogonalerTStueckPunkt(origin, a, b, toleranz = 0.5) {
  if (![origin, a, b].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  const zwischen = (wert, p, q) => wert >= Math.min(p, q) - toleranz
    && wert <= Math.max(p, q) + toleranz;
  if (Math.abs(a.x - b.x) <= toleranz && Math.abs(a.y - b.y) > toleranz) {
    return zwischen(origin.y, a.y, b.y) ? { x:a.x, y:origin.y } : null;
  }
  if (Math.abs(a.y - b.y) <= toleranz && Math.abs(a.x - b.x) > toleranz) {
    return zwischen(origin.x, a.x, b.x) ? { x:origin.x, y:a.y } : null;
  }
  return null;
}
