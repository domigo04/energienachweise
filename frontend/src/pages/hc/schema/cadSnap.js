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

export const FANG_SHORTCUTS = Object.freeze({
  se: ENDPOINT,
  sm: MIDPOINT,
  si: INTERSECTION,
  sp: PERPENDICULAR,
  sn: NEAREST,
  sa: PORT,
});

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

/** Kandidaten in derselben Reihenfolge wie die automatische Fangentscheidung. */
export function sortiereFangkandidaten(kandidaten = []) {
  return (kandidaten || [])
    .filter(k => k && FANG_STIL[k.typ] && Number.isFinite(k.x) && Number.isFinite(k.y))
    .map((kandidat, index) => ({ kandidat, index }))
    .sort((a, b) => fangStil(b.kandidat.typ).prio - fangStil(a.kandidat.typ).prio
      || (a.kandidat.distanz ?? Infinity) - (b.kandidat.distanz ?? Infinity)
      || a.index - b.index)
    .map(item => item.kandidat);
}

/** Tab wechselt zyklisch durch die aktuell erreichbaren Fangziele. */
export function naechsterFangkandidat(kandidaten = [], aktuell = null) {
  const sortiert = sortiereFangkandidaten(kandidaten);
  if (!sortiert.length) return null;
  const key = (item) => `${item.typ}:${item.nodeId || item.edgeId || ''}:${item.x}:${item.y}`;
  const index = aktuell ? sortiert.findIndex(item => key(item) === key(aktuell)) : -1;
  return sortiert[(index + 1) % sortiert.length];
}

/** Zweistellige Revit-artige Einmal-Shortcuts (SE, SM, SI, SP, SN, SA). */
export function fangShortcut(sequence) {
  return FANG_SHORTCUTS[String(sequence || '').trim().toLowerCase()] || null;
}

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
  const gueltig = sortiereFangkandidaten(kandidaten);

  if (!gueltig.length) {
    if (!fallback || !Number.isFinite(fallback.x) || !Number.isFinite(fallback.y)) return null;
    return {
      point: { x: fallback.x, y: fallback.y },
      typ: GRID,
      marker: zeigeRaster ? { ...fangStil(GRID), typ: GRID, x: fallback.x, y: fallback.y } : null,
      treffer: null,
    };
  }

  const beste = gueltig[0];

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
export function segmentSchnittpunkt(a1, a2, b1, b2, toleranz = 0.5) {
  if (![a1, a2, b1, b2].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  const r = { x:a2.x - a1.x, y:a2.y - a1.y };
  const s = { x:b2.x - b1.x, y:b2.y - b1.y };
  const kreuz = r.x * s.y - r.y * s.x;
  if (Math.abs(kreuz) <= 1e-9) return null;
  const q = { x:b1.x - a1.x, y:b1.y - a1.y };
  const t = (q.x * s.y - q.y * s.x) / kreuz;
  const u = (q.x * r.y - q.y * r.x) / kreuz;
  const laengeR = Math.hypot(r.x, r.y) || 1;
  const laengeS = Math.hypot(s.x, s.y) || 1;
  const epsT = toleranz / laengeR;
  const epsU = toleranz / laengeS;
  if (t < -epsT || t > 1 + epsT || u < -epsU || u > 1 + epsU) return null;
  return { x:a1.x + t * r.x, y:a1.y + t * r.y };
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

/** Lotfuss von `origin` auf ein endliches Bestandssegment. */
export function senkrechterFang(origin, cursor, a, b, radius = Infinity) {
  if (![origin, cursor, a, b].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const quadrat = dx * dx + dy * dy;
  if (quadrat < 1) return null;
  const t = ((origin.x - a.x) * dx + (origin.y - a.y) * dy) / quadrat;
  if (t < 0 || t > 1) return null;
  const punkt = { x:a.x + t * dx, y:a.y + t * dy };
  const distanz = Math.hypot(cursor.x - punkt.x, cursor.y - punkt.y);
  if (distanz > radius) return null;
  return { ...punkt, t, distanz, typ:PERPENDICULAR };
}

/**
 * Fangspur aus zuvor aufgenommenen Fangpunkten. Es entstehen ausschliesslich
 * horizontale/vertikale Spuren; zwei aufgenommene Punkte können sich kreuzen.
 */
export function fangspurPunkt(cursor, aufgenommen = [], toleranz = 10) {
  if (!Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return null;
  let xTreffer = null;
  let yTreffer = null;
  aufgenommen.forEach(punkt => {
    if (!Number.isFinite(punkt?.x) || !Number.isFinite(punkt?.y)) return;
    const dx = Math.abs(cursor.x - punkt.x);
    const dy = Math.abs(cursor.y - punkt.y);
    if (dx <= toleranz && (!xTreffer || dx < xTreffer.abstand)) xTreffer = { punkt, abstand:dx };
    if (dy <= toleranz && (!yTreffer || dy < yTreffer.abstand)) yTreffer = { punkt, abstand:dy };
  });
  if (!xTreffer && !yTreffer) return null;
  const point = {
    x:xTreffer ? xTreffer.punkt.x : cursor.x,
    y:yTreffer ? yTreffer.punkt.y : cursor.y,
  };
  const guides = [];
  if (xTreffer) guides.push({
    x1:xTreffer.punkt.x, y1:xTreffer.punkt.y, x2:point.x, y2:point.y,
    snapType:'tracking', orientation:'vertical',
  });
  if (yTreffer) guides.push({
    x1:yTreffer.punkt.x, y1:yTreffer.punkt.y, x2:point.x, y2:point.y,
    snapType:'tracking', orientation:'horizontal',
  });
  return { point, guides, xMatch:xTreffer?.punkt || null, yMatch:yTreffer?.punkt || null };
}
