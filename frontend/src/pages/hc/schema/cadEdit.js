// Direkte Geometriebearbeitung an einer bestehenden Leitung (Grips).
// Rein, ohne React, ohne Hydraulik.

import { constrainPoint } from './cadConstraints';

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

/**
 * Einen freien Leitungsendpunkt weiterziehen, ohne das bestehende Randsegment
 * schräg zu verbiegen. Der bisherige Endpunkt bleibt als Ecke erhalten; nur
 * beim Verlängern auf derselben Achse wird er als überflüssiger Stützpunkt
 * weggelassen. Die Richtungsfreigabe entspricht dem normalen Zeichenbefehl:
 * achsnah orthogonal, bewusst schräg ab 30°.
 */
export function endpunktWeiterziehen(route, side, raw, { grid = 10, shift = false } = {}) {
  if (!Array.isArray(route) || route.length < 2 || !['source', 'target'].includes(side)) return null;
  const basis = side === 'source' ? route[0] : route.at(-1);
  const nachbar = side === 'source' ? route[1] : route.at(-2);
  const endpoint = constrainPoint(basis, raw, { ortho:true, shift, grid });
  if (Math.hypot(endpoint.x - basis.x, endpoint.y - basis.y) <= 0.5) {
    const routeNeu = route.map(p => ({ ...p }));
    return { endpoint:{ ...basis }, basis:{ ...basis }, points:routeNeu.slice(1, -1), route:routeNeu };
  }
  const altHorizontal = segmentOrientierung(nachbar, basis) === 'horizontal';
  const altVertikal = segmentOrientierung(nachbar, basis) === 'vertical';
  const neuHorizontal = segmentOrientierung(basis, endpoint) === 'horizontal';
  const neuVertikal = segmentOrientierung(basis, endpoint) === 'vertical';
  const gleicheAchse = (altHorizontal && neuHorizontal) || (altVertikal && neuVertikal);
  const routeNeu = side === 'source'
    ? [endpoint, ...(gleicheAchse ? route.slice(1) : route)]
    : [...(gleicheAchse ? route.slice(0, -1) : route), endpoint];
  return { endpoint, basis, points:routeNeu.slice(1, -1), route:routeNeu };
}

/**
 * Einen bestehenden Eckpunkt verschieben, ohne das nachfolgende Teilstück
 * unabsichtlich schräg zu ziehen. Zum vorherigen Punkt gilt der 30°-Fang. Wo
 * der feste nächste Punkt danach nicht auf derselben Achse liegt, wird eine
 * zweite 90°-Ecke ergänzt. So bleibt die ganze Route orthogonal; nur die
 * ausdrücklich gezeichnete Strecke darf diagonal sein.
 */
export function eckpunktWeiterziehen(route, routeIndex, raw, { grid = 10 } = {}) {
  if (!Array.isArray(route) || routeIndex <= 0 || routeIndex >= route.length - 1) return null;
  const previous = route[routeIndex - 1];
  const next = route[routeIndex + 1];
  const point = constrainPoint(previous, raw, { ortho:true, shift:false, grid });
  const routeNeu = route.map(p => ({ ...p }));
  routeNeu[routeIndex] = point;
  if (!segmentOrientierung(point, next)) {
    const dx = Math.abs(next.x - point.x);
    const dy = Math.abs(next.y - point.y);
    if (dx > 0.5 && dy > 0.5) {
      const bridge = dx >= dy ? { x:next.x, y:point.y } : { x:point.x, y:next.y };
      routeNeu.splice(routeIndex + 1, 0, bridge);
    }
  }
  return { point, previous, next, route:routeNeu, points:routeNeu.slice(1, -1) };
}

const punktImRechteck = (punkt, rect) => punkt.x >= rect.x && punkt.x <= rect.x + rect.width
  && punkt.y >= rect.y && punkt.y <= rect.y + rect.height;

const naechsterPunktImRechteck = (punkt, rect) => ({
  x:Math.max(rect.x, Math.min(rect.x + rect.width, punkt.x)),
  y:Math.max(rect.y, Math.min(rect.y + rect.height, punkt.y)),
});

const projektion = (punkt, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const quadrat = dx * dx + dy * dy;
  const t = quadrat ? Math.max(0, Math.min(1, ((punkt.x - a.x) * dx + (punkt.y - a.y) * dy) / quadrat)) : 0;
  return { x:a.x + t * dx, y:a.y + t * dy };
};

const segmentRechteckSchnitt = (a, b, rect) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let von = 0;
  let bis = 1;
  const grenzen = [
    [-dx, a.x - rect.x], [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y], [dy, rect.y + rect.height - a.y],
  ];
  for (const [richtung, abstand] of grenzen) {
    if (Math.abs(richtung) < 1e-9) {
      if (abstand < 0) return null;
      continue;
    }
    const t = abstand / richtung;
    if (richtung < 0) von = Math.max(von, t);
    else bis = Math.min(bis, t);
    if (von > bis) return null;
  }
  return { x:a.x + von * dx, y:a.y + von * dy };
};

/** Kürzeste sichtbare Distanz eines Teilstücks zu einem Bauteil-Rechteck. */
export function abstandSegmentZuRechteck(a, b, rect) {
  if (![a, b].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
      || !Number.isFinite(rect?.x) || !Number.isFinite(rect?.y)
      || !(rect.width > 0) || !(rect.height > 0)) return null;
  if (punktImRechteck(a, rect) || punktImRechteck(b, rect)) return { a:{ ...a }, b:{ ...a }, distance:0 };
  const schnitt = segmentRechteckSchnitt(a, b, rect);
  if (schnitt) return { a:schnitt, b:{ ...schnitt }, distance:0 };
  const links = rect.x;
  const rechts = rect.x + rect.width;
  const oben = rect.y;
  const unten = rect.y + rect.height;
  const kandidaten = [];
  const zwischen = (wert, p, q) => wert >= Math.min(p, q) - 0.5 && wert <= Math.max(p, q) + 0.5;
  const add = (linie, box) => {
    const horizontal = Math.abs(linie.y - box.y) <= 0.5;
    const vertical = Math.abs(linie.x - box.x) <= 0.5;
    if (!horizontal && !vertical) return;
    kandidaten.push({ a:linie, b:box, distance:Math.hypot(box.x - linie.x, box.y - linie.y) });
  };

  // Nur orthogonale Masse: Liegt eine Rechteckkante in der Projektion des
  // Teilstücks, wird horizontal oder vertikal zu genau dieser Kante gemessen.
  for (const x of [links, rechts]) {
    if (zwischen(x, a.x, b.x)) {
      const t = Math.abs(b.x - a.x) > 1e-9 ? (x - a.x) / (b.x - a.x) : 0;
      const y = a.y + Math.max(0, Math.min(1, t)) * (b.y - a.y);
      if (y < oben) add({ x, y }, { x, y:oben });
      else if (y > unten) add({ x, y }, { x, y:unten });
    }
  }
  for (const y of [oben, unten]) {
    if (zwischen(y, a.y, b.y)) {
      const t = Math.abs(b.y - a.y) > 1e-9 ? (y - a.y) / (b.y - a.y) : 0;
      const x = a.x + Math.max(0, Math.min(1, t)) * (b.x - a.x);
      if (x < links) add({ x, y }, { x:links, y });
      else if (x > rechts) add({ x, y }, { x:rechts, y });
    }
  }
  // Achsparallele Segmente können eine ganze Kante überdecken. Dafür genügt
  // ein Punkt im gemeinsamen Bereich; eine diagonale Hilfslinie ist verboten.
  if (Math.abs(a.y - b.y) <= 0.5) {
    const x = Math.max(Math.min(Math.max(a.x, b.x), rechts), Math.max(Math.min(a.x, b.x), links));
    if (x >= Math.min(a.x, b.x) - 0.5 && x <= Math.max(a.x, b.x) + 0.5) {
      if (a.y < oben) add({ x, y:a.y }, { x, y:oben });
      else if (a.y > unten) add({ x, y:a.y }, { x, y:unten });
    }
  }
  if (Math.abs(a.x - b.x) <= 0.5) {
    const y = Math.max(Math.min(Math.max(a.y, b.y), unten), Math.max(Math.min(a.y, b.y), oben));
    if (y >= Math.min(a.y, b.y) - 0.5 && y <= Math.max(a.y, b.y) + 0.5) {
      if (a.x < links) add({ x:a.x, y }, { x:links, y });
      else if (a.x > rechts) add({ x:a.x, y }, { x:rechts, y });
    }
  }
  if (!kandidaten.length) return null;
  return kandidaten.reduce((beste, kandidat) => (!beste || kandidat.distance < beste.distance ? kandidat : beste), null);
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
 * Standardmässig ist die Bewegung frei. Mit `axisLocked:true` bindet
 * `orientation` die Bewegung auf die Normale des Segments (Legacy/CAD-Ortho).
 */
export function segmentVerschieben(points, pointIndexes, orientation, delta, {
  grid = 10, direction = null, axisLocked = false,
} = {}) {
  const idx = new Set(pointIndexes || []);
  if (!Array.isArray(points) || !idx.size) return points || [];
  const raster = (wert) => Math.round(wert / grid) * grid;

  const bewegt = segmentVerschiebungDelta(orientation, delta, { grid, direction, axisLocked });
  const moveX = bewegt.x;
  const moveY = bewegt.y;
  return points.map((punkt, index) => (idx.has(index)
    ? { x: punkt.x + moveX, y: punkt.y + moveY }
    : punkt));
}

/** Effektiver, gerasterter Verschiebevektor eines Teilstücks. */
export function segmentVerschiebungDelta(orientation, delta, {
  grid = 10, direction = null, axisLocked = false,
} = {}) {
  const raster = (wert) => Math.round(wert / grid) * grid;
  let moveX = delta?.x || 0;
  let moveY = delta?.y || 0;
  if (!axisLocked) {
    // Revit-artiges Verschieben: die Maus gibt einen freien Vektor vor. Beide
    // Segmentenden erhalten exakt denselben Vektor; das Teilstück bleibt also
    // parallel, ist aber nicht künstlich auf X oder Y beschränkt.
    moveX = raster(moveX);
    moveY = raster(moveY);
  } else if (orientation === 'vertical') {
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

  return { x:moveX, y:moveY };
}

/**
 * Bereitet ein sichtbares Teilstück für das Verschieben vor. Liegt es direkt an
 * einem Bauteilanschluss, wird innen ein Stützpunkt ergänzt. Der hydraulische
 * Anschluss bleibt dadurch fest und nur das gewählte Teilstück wandert.
 */
export function segmentZumVerschieben(route, segmentIndex, { startFrei = false, endFrei = false } = {}) {
  if (!Array.isArray(route) || segmentIndex < 0 || segmentIndex >= route.length - 1) return null;
  const workingRoute = route.map(point => ({ x:point.x, y:point.y }));
  let startIndex = segmentIndex;
  let endIndex = startIndex + 1;
  if (startIndex === 0 && !startFrei) {
    workingRoute.splice(1, 0, { ...workingRoute[0] });
    startIndex = 1;
    endIndex = 2;
  }
  if (endIndex === workingRoute.length - 1 && !endFrei) {
    workingRoute.splice(endIndex, 0, { ...workingRoute.at(-1) });
  }
  const a = workingRoute[startIndex];
  const b = workingRoute[endIndex];
  const pointIndexes = [startIndex, endIndex]
    .filter(index => index > 0 && index < workingRoute.length - 1)
    .map(index => index - 1);
  return {
    points:workingRoute.slice(1, -1),
    pointIndexes,
    moveStart:startFrei && startIndex === 0,
    moveEnd:endFrei && endIndex === workingRoute.length - 1,
    orientation:segmentOrientierung(a, b),
    direction:{ x:b.x - a.x, y:b.y - a.y },
  };
}

export const GRIFF_AKTIONEN = Object.freeze({
  endpoint:Object.freeze(['strecken', 'weiterziehen', 'anschliessen']),
  corner:Object.freeze(['strecken', 'entfernen', 'teilen']),
  segment:Object.freeze(['versetzen', 'einfuegen', 'laenge']),
});

export function griffAktionen(typ) {
  return [...(GRIFF_AKTIONEN[typ] || [])];
}

/** Teilstückauswahl hat beim Löschen Vorrang vor der Edge-Gesamtauswahl. */
export function loeschAuswahl(ganzeEdgeIds = [], segmente = []) {
  const teilEdges = new Set((segmente || []).map(item => item?.edgeId).filter(Boolean));
  return {
    ganzeEdgeIds:[...new Set(ganzeEdgeIds || [])].filter(id => !teilEdges.has(id)),
    segmente:(segmente || []).filter(item => item?.edgeId && Number.isInteger(item.segmentIndex)),
  };
}

/**
 * Eine ganze Leitung um einen Vektor verschieben (CAD-MOVE).
 *
 * Ein Ende, das an einem Bauteilanschluss hängt, darf NICHT wandern — sonst
 * würde die Geometrie die Hydraulik zerreissen (dieselbe Regel wie beim
 * Ausrichten). Statt das Ende mitzunehmen, entsteht dort ein Stützpunkt an der
 * verschobenen Stelle: der Anschluss bleibt, die Leitung führt neu dorthin.
 *
 * `startFrei`/`endFrei` heisst „dieses Ende hängt an einem freien CAD-Anker und
 * darf mitwandern". Die neuen Ankerpositionen kommen als `start`/`end` zurück.
 *
 * Rückgabe: { points, start, end } — `points` sind die Zwischenpunkte der
 * Leitung (ohne Enden), `start`/`end` sind null, wenn das Ende fest bleibt.
 */
export function leitungVerschieben(route, delta, { startFrei = false, endFrei = false } = {}) {
  if (!Array.isArray(route) || route.length < 2) return null;
  const dx = Number(delta?.x) || 0;
  const dy = Number(delta?.y) || 0;
  if (!dx && !dy) return null;
  const versetzt = (p) => ({ x: p.x + dx, y: p.y + dy });
  const ersterPunkt = route[0];
  const letzterPunkt = route[route.length - 1];
  return {
    points: [
      ...(startFrei ? [] : [versetzt(ersterPunkt)]),
      ...route.slice(1, -1).map(versetzt),
      ...(endFrei ? [] : [versetzt(letzterPunkt)]),
    ],
    start: startFrei ? versetzt(ersterPunkt) : null,
    end: endFrei ? versetzt(letzterPunkt) : null,
  };
}

/**
 * Eine Leitung MIT LÜCKE trennen (AutoCAD BREAK).
 *
 * Zwei Punkte auf derselben Leitung; alles dazwischen fällt weg. Zurück kommen
 * die beiden Teilrouten — die erste endet am ersten Punkt, die zweite beginnt
 * am zweiten. Die Reihenfolge der beiden Klicks ist egal: massgebend ist die
 * Lage entlang der Leitung, nicht die Reihenfolge der Eingabe.
 *
 * `a` und `b`: { segmentIndex, x, y } — Treffer auf der Route.
 * Rückgabe: { erste, zweite } (je eine vollständige Punktliste) oder
 * { fehler } — es wird nie geraten.
 */
export function leitungMitLueckeTrennen(route, a, b) {
  if (!Array.isArray(route) || route.length < 2) return { fehler: 'Keine Leitung.' };
  const gueltig = (h) => h && Number.isInteger(h.segmentIndex)
    && h.segmentIndex >= 0 && h.segmentIndex < route.length - 1
    && Number.isFinite(h.x) && Number.isFinite(h.y);
  if (!gueltig(a) || !gueltig(b)) return { fehler: 'Beide Punkte müssen auf der Leitung liegen.' };

  // Position entlang der Leitung: Segmentindex, dann Abstand zum Segmentanfang.
  const laengsmass = (h) => h.segmentIndex
    + Math.hypot(h.x - route[h.segmentIndex].x, h.y - route[h.segmentIndex].y)
      / (Math.hypot(route[h.segmentIndex + 1].x - route[h.segmentIndex].x,
                    route[h.segmentIndex + 1].y - route[h.segmentIndex].y) || 1);
  const [vorn, hinten] = laengsmass(a) <= laengsmass(b) ? [a, b] : [b, a];
  if (Math.hypot(hinten.x - vorn.x, hinten.y - vorn.y) < 0.5) {
    return { fehler: 'Die zwei Punkte liegen aufeinander — es entstünde keine Lücke.' };
  }

  const erste = [...route.slice(0, vorn.segmentIndex + 1), { x: vorn.x, y: vorn.y }];
  const zweite = [{ x: hinten.x, y: hinten.y }, ...route.slice(hinten.segmentIndex + 1)];
  if (erste.length < 2 || zweite.length < 2) {
    return { fehler: 'Die Lücke würde ein Leitungsende verschlucken.' };
  }
  return { erste, zweite };
}

// ── Ecke verbinden (TR) und Teilstücke löschen ─────────────────────────────

const ECKE_TOLERANZ = 1e-6;

/** Schnittpunkt der unendlich verlängerten Geraden zweier Segmente. */
export function geradenSchnittpunkt(a, b, c, d) {
  if (![a, b, c, d].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const kreuz = rx * sy - ry * sx;
  if (Math.hypot(rx, ry) <= ECKE_TOLERANZ || Math.hypot(sx, sy) <= ECKE_TOLERANZ
      || Math.abs(kreuz) <= ECKE_TOLERANZ) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / kreuz;
  return { x:a.x + t * rx, y:a.y + t * ry };
}

const erlaubteEnden = (route, segmentIndex, freigegeben) => {
  const moeglich = [];
  if (segmentIndex === 0) moeglich.push('start');
  if (segmentIndex === route.length - 2) moeglich.push('end');
  return freigegeben ? moeglich.filter(seite => freigegeben.includes(seite)) : moeglich;
};

const endeWaehlen = (route, seiten, ecke) => [...seiten].sort((links, rechts) => {
  const punkt = seite => (seite === 'start' ? route[0] : route.at(-1));
  const distanz = seite => Math.hypot(punkt(seite).x - ecke.x, punkt(seite).y - ecke.y);
  return distanz(links) - distanz(rechts);
})[0] || null;

const routeBisEcke = (route, seite, ecke) => (seite === 'start'
  ? [{ ...ecke }, ...route.slice(1).map(p => ({ ...p }))]
  : [...route.slice(0, -1).map(p => ({ ...p })), { ...ecke }]);

/**
 * Zwei gewählte, endständige Teilstücke bis zu ihrer gemeinsamen Ecke
 * verlängern oder kürzen. Die Geometrie arbeitet auf unendlichen Geraden; das
 * ist der CAD-Fall, in dem zwei noch getrennte Leitungen mit TR zusammentreffen.
 *
 * `erlaubteSeitenA/B` begrenzen die beweglichen Enden (z. B. auf freie
 * Anschlussknoten). Innensegmente und parallele Geraden werden nicht geraten.
 */
export function leitungenMitEckeVerbinden(routeA, segmentIndexA, routeB, segmentIndexB, {
  erlaubteSeitenA = null,
  erlaubteSeitenB = null,
} = {}) {
  const gueltigeRoute = route => Array.isArray(route) && route.length >= 2;
  if (!gueltigeRoute(routeA) || !gueltigeRoute(routeB)) return { fehler:'Zwei Leitungen erforderlich.' };
  if (!Number.isInteger(segmentIndexA) || !Number.isInteger(segmentIndexB)
      || segmentIndexA < 0 || segmentIndexA >= routeA.length - 1
      || segmentIndexB < 0 || segmentIndexB >= routeB.length - 1) {
    return { fehler:'Ungültiges Teilstück.' };
  }

  const seitenA = erlaubteEnden(routeA, segmentIndexA, erlaubteSeitenA);
  const seitenB = erlaubteEnden(routeB, segmentIndexB, erlaubteSeitenB);
  if (!seitenA.length || !seitenB.length) {
    return { fehler:'TR kann nur freie Leitungsenden zu einer Ecke verbinden.' };
  }

  const ecke = geradenSchnittpunkt(
    routeA[segmentIndexA], routeA[segmentIndexA + 1],
    routeB[segmentIndexB], routeB[segmentIndexB + 1],
  );
  if (!ecke) return { fehler:'Parallele Leitungen bilden keine eindeutige Ecke.' };

  const seiteA = endeWaehlen(routeA, seitenA, ecke);
  const seiteB = endeWaehlen(routeB, seitenB, ecke);
  return {
    ecke,
    erste:{ seite:seiteA, route:routeBisEcke(routeA, seiteA, ecke) },
    zweite:{ seite:seiteB, route:routeBisEcke(routeB, seiteB, ecke) },
  };
}

/** Mehrere gewählte, gerade Teilstücke aus einer Route entfernen. */
export function routeSegmenteEntfernen(route, segmentIndexes = []) {
  if (!Array.isArray(route) || route.length < 2) return [];
  const weg = new Set(segmentIndexes.filter(Number.isInteger));
  const teile = [];
  let aktuell = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    if (weg.has(i)) {
      if (aktuell?.length >= 2) teile.push(aktuell);
      aktuell = null;
    } else if (aktuell) {
      aktuell.push({ ...route[i + 1] });
    } else {
      aktuell = [{ ...route[i] }, { ...route[i + 1] }];
    }
  }
  if (aktuell?.length >= 2) teile.push(aktuell);
  return teile;
}

// ── Dehnen (AutoCAD STRETCH) ───────────────────────────────────────────────
//
// Im Auswahlfenster liegende Punkte wandern, alle übrigen bleiben stehen. Ein
// Segment, von dem nur ein Ende im Fenster liegt, wird dadurch länger oder
// kürzer — genau das ist der Unterschied zum Verschieben.

/** Rechteck aus zwei beliebigen Ecken (Reihenfolge egal). */
export const fensterAus = (a, b) => ({
  x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y),
  x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y),
});

export const imFenster = (punkt, fenster) => Boolean(punkt) && Boolean(fenster)
  && punkt.x >= fenster.x1 && punkt.x <= fenster.x2
  && punkt.y >= fenster.y1 && punkt.y <= fenster.y2;

/**
 * Route dehnen: nur Punkte im Fenster erhalten den Vektor.
 *
 * `endenFest` schützt die beiden hydraulischen Enden — sie hängen an einem
 * Bauteil und dürfen sich nie allein bewegen (dieselbe Regel wie beim
 * Ausrichten und Verschieben).
 *
 * Rückgabe: { route, bewegt } — `bewegt` zählt die tatsächlich verschobenen
 * Punkte, damit der Aufrufer eine wirkungslose Dehnung erkennen kann.
 */
export function routeDehnen(route, fenster, delta, { startFest = true, endFest = true } = {}) {
  if (!Array.isArray(route) || !fenster) return { route: route || [], bewegt: 0 };
  const dx = Number(delta?.x) || 0;
  const dy = Number(delta?.y) || 0;
  let bewegt = 0;
  const neu = route.map((punkt, index) => {
    const geschuetzt = (index === 0 && startFest) || (index === route.length - 1 && endFest);
    if (geschuetzt || !imFenster(punkt, fenster)) return { x: punkt.x, y: punkt.y };
    bewegt += 1;
    return { x: punkt.x + dx, y: punkt.y + dy };
  });
  return { route: neu, bewegt };
}

// ── Leitungen ändern: Versatz, Stutzen, Dehnen bis Kante, Verbinden ───────
//
// Die vier CAD-Befehle, mit denen an einer bestehenden Leitung aufgeräumt
// wird. Alles hier ist reine Geometrie auf Punktlisten — keine Kanten, keine
// Knoten, keine Layer. Was daraus hydraulisch wird, entscheidet der Editor.
//
// Gemeinsame Regel: es wird nie geraten. Wo die Geometrie nicht eindeutig ist
// (parallele Geraden, kein Schnittpunkt, Klick daneben), kommt ein `fehler`
// zurück, den der Editor als Satz anzeigen kann.

const TRIM_TOLERANZ = 0.5;

/** Einheitsvektor eines Teilstücks, oder null bei Länge null. */
const richtungVon = (a, b) => {
  if (![a, b].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy);
  return laenge <= ECKE_TOLERANZ ? null : { x:dx / laenge, y:dy / laenge };
};

/** Hat eine Punktliste überhaupt eine sichtbare Ausdehnung? */
const routeHatLaenge = (punkte, toleranz = TRIM_TOLERANZ) => Array.isArray(punkte)
  && punkte.length >= 2
  && punkte.some(p => Math.hypot(p.x - punkte[0].x, p.y - punkte[0].y) > toleranz);

/**
 * Auf welcher Seite eines Teilstücks steht der Cursor? +1 links, -1 rechts der
 * Zeichenrichtung. Massgebend ist das getroffene Teilstück — bei einer
 * abgewinkelten Leitung ist „links" sonst nicht eindeutig.
 */
export function versatzSeite(a, b, cursor) {
  const dir = richtungVon(a, b);
  if (!dir || !Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return 1;
  // Skalarprodukt mit der Normalen (-dy, dx): dasselbe Vorzeichen, das
  // `routeVersetzen` zum Versetzen verwendet.
  const seite = (cursor.x - a.x) * -dir.y + (cursor.y - a.y) * dir.x;
  return seite < 0 ? -1 : 1;
}

/**
 * Eine Leitung PARALLEL versetzen (AutoCAD OFFSET).
 *
 * Jedes Teilstück wandert um `abstand` auf seiner eigenen Normalen. Die neuen
 * Ecken liegen dort, wo sich die versetzten Geraden schneiden — sonst
 * entstünden an jeder Ecke Lücken oder Überstände:
 *
 *     ──────┐                ──────┐
 *           │   Versatz →  ──────┐ │
 *     ──────┘                    │ │
 *
 * Die Quelle wird NICHT verändert; zurück kommt nur die neue Punktliste.
 * `seite` +1/-1 wählt, auf welcher Seite die Kopie entsteht.
 */
export function routeVersetzen(route, abstand, { seite = 1 } = {}) {
  if (!Array.isArray(route) || route.length < 2) return { fehler:'Keine Leitung.' };
  const weite = Number(abstand);
  if (!Number.isFinite(weite) || Math.abs(weite) < TRIM_TOLERANZ) {
    return { fehler:'Der Abstand muss grösser als null sein.' };
  }
  const vorzeichen = seite < 0 ? -1 : 1;

  const versetzt = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const dir = richtungVon(route[i], route[i + 1]);
    if (!dir) continue;                       // Nullsegment trägt keine Richtung
    const nx = -dir.y * Math.abs(weite) * vorzeichen;
    const ny = dir.x * Math.abs(weite) * vorzeichen;
    versetzt.push({
      a:{ x:route[i].x + nx, y:route[i].y + ny },
      b:{ x:route[i + 1].x + nx, y:route[i + 1].y + ny },
    });
  }
  if (!versetzt.length) return { fehler:'Die Leitung hat keine Länge.' };

  const punkte = [{ ...versetzt[0].a }];
  for (let i = 1; i < versetzt.length; i += 1) {
    const ecke = geradenSchnittpunkt(
      versetzt[i - 1].a, versetzt[i - 1].b, versetzt[i].a, versetzt[i].b,
    );
    // Parallel heisst hier: die Leitung läuft geradeaus weiter. Dann ist der
    // versetzte Punkt selbst die Ecke.
    punkte.push(ecke ? { x:ecke.x, y:ecke.y } : { ...versetzt[i].a });
  }
  punkte.push({ ...versetzt.at(-1).b });
  if (!routeHatLaenge(punkte)) return { fehler:'Der Versatz ergäbe keine Leitung.' };
  return { route:punkte };
}

/**
 * Schnittpunkt zweier ENDLICHER Strecken, oder null.
 *
 * Anders als `geradenSchnittpunkt` zählt hier nur eine echte Kreuzung
 * innerhalb beider Strecken — eine gedachte Verlängerung ist keine Begrenzung.
 */
export function streckenSchnittpunkt(a, b, c, d) {
  if (![a, b, c, d].every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return null;
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const kreuz = rx * sy - ry * sx;
  if (Math.abs(kreuz) <= ECKE_TOLERANZ) return null;          // parallel
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / kreuz;
  const u = (qx * ry - qy * rx) / kreuz;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x:a.x + t * rx, y:a.y + t * ry, t, u };
}

/**
 * Alle Stellen, an denen eine Leitung eine Begrenzungsleitung wirklich kreuzt.
 *
 * Je Treffer kommen der Punkt, das getroffene Teilstück und das Längsmass
 * entlang der Leitung zurück (Segmentindex plus Anteil im Segment). Damit lässt
 * sich sagen, welches Stück der Leitung wo liegt — sortiert von vorn nach
 * hinten.
 */
export function trimGrenzen(route, grenzRoute) {
  if (!Array.isArray(route) || route.length < 2) return [];
  if (!Array.isArray(grenzRoute) || grenzRoute.length < 2) return [];
  const treffer = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    for (let k = 0; k < grenzRoute.length - 1; k += 1) {
      const punkt = streckenSchnittpunkt(route[i], route[i + 1], grenzRoute[k], grenzRoute[k + 1]);
      if (!punkt) continue;
      treffer.push({
        x:punkt.x, y:punkt.y,
        segmentIndex:i, mass:i + punkt.t, grenzSegmentIndex:k,
      });
    }
  }
  return treffer.sort((links, rechts) => links.mass - rechts.mass);
}

/** Längsmass eines Treffers auf der Route (Segmentindex plus Anteil). */
const laengsmassAufRoute = (route, treffer) => {
  const a = route[treffer.segmentIndex];
  const b = route[treffer.segmentIndex + 1];
  const laenge = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return treffer.segmentIndex + Math.hypot(treffer.x - a.x, treffer.y - a.y) / laenge;
};

/**
 * Eine Leitung an einer Begrenzungsleitung STUTZEN (AutoCAD TRIM).
 *
 * Angeklickt wird das Stück, das weg soll. Die Schnittpunkte mit der Begrenzung
 * teilen die Leitung; das Stück, in dem der Klick liegt, fällt weg:
 *
 *     ────┬────●────      ────┬────
 *         │          →        │
 *
 * Liegt der Klick zwischen zwei Schnittpunkten, bleiben zwei Reste stehen —
 * genau wie im CAD. Der Rest behält seine Punkte unverändert; nur am
 * Schnittpunkt entsteht ein neues Ende.
 *
 * Rückgabe: { routen, punkte } oder { fehler }.
 */
export function leitungTrimmen(route, grenzRoute, klick) {
  if (!Array.isArray(route) || route.length < 2) return { fehler:'Keine Leitung.' };
  if (!Number.isInteger(klick?.segmentIndex)
      || klick.segmentIndex < 0 || klick.segmentIndex >= route.length - 1
      || !Number.isFinite(klick?.x) || !Number.isFinite(klick?.y)) {
    return { fehler:'Der Klick liegt nicht auf der Leitung.' };
  }
  const grenzen = trimGrenzen(route, grenzRoute);
  if (!grenzen.length) return { fehler:'Die Begrenzung kreuzt diese Leitung nicht.' };

  const klickMass = laengsmassAufRoute(route, klick);
  const davor = [...grenzen].reverse().find(grenze => grenze.mass <= klickMass) || null;
  const danach = grenzen.find(grenze => grenze.mass >= klickMass) || null;

  const routen = [];
  if (davor) {
    const rest = [
      ...route.slice(0, davor.segmentIndex + 1).map(p => ({ x:p.x, y:p.y })),
      { x:davor.x, y:davor.y },
    ];
    if (routeHatLaenge(rest)) routen.push(rest);
  }
  if (danach) {
    const rest = [
      { x:danach.x, y:danach.y },
      ...route.slice(danach.segmentIndex + 1).map(p => ({ x:p.x, y:p.y })),
    ];
    if (routeHatLaenge(rest)) routen.push(rest);
  }
  if (!routen.length) return { fehler:'Stutzen würde die ganze Leitung entfernen.' };
  return { routen, punkte:[davor, danach].filter(Boolean).map(g => ({ x:g.x, y:g.y })) };
}

/**
 * Ein Leitungsende bis zur getroffenen Leitung DEHNEN (AutoCAD EXTEND).
 *
 * Verlängert wird ausschliesslich in der Richtung, die das Randstück bereits
 * hat — es wird nichts abgeknickt und keine Ecke erfunden. Getroffen werden
 * muss die Begrenzung innerhalb ihrer eigenen Länge; eine gedachte
 * Verlängerung der Begrenzung zählt nicht, sonst entstünde ein Anschluss im
 * Leeren.
 *
 * Rückgabe: { route, punkt, grenzSegmentIndex, weite } oder { fehler }.
 */
export function routeBisKanteDehnen(route, seite, grenzRoute) {
  if (!Array.isArray(route) || route.length < 2) return { fehler:'Keine Leitung.' };
  if (!['source', 'target'].includes(seite)) return { fehler:'Kein gültiges Leitungsende.' };
  if (!Array.isArray(grenzRoute) || grenzRoute.length < 2) return { fehler:'Keine Begrenzung.' };
  const ende = seite === 'source' ? route[0] : route.at(-1);
  const nachbar = seite === 'source' ? route[1] : route.at(-2);
  // Nach aussen zeigende Richtung: vom Nachbarn zum Ende.
  const dir = richtungVon(nachbar, ende);
  if (!dir) return { fehler:'Das Randstück hat keine Richtung.' };

  let bester = null;
  for (let k = 0; k < grenzRoute.length - 1; k += 1) {
    const c = grenzRoute[k];
    const d = grenzRoute[k + 1];
    const sx = d.x - c.x, sy = d.y - c.y;
    const kreuz = dir.x * sy - dir.y * sx;
    if (Math.abs(kreuz) <= ECKE_TOLERANZ) continue;             // parallel
    const qx = c.x - ende.x, qy = c.y - ende.y;
    const weite = (qx * sy - qy * sx) / kreuz;                  // Weg ab dem Ende
    const anteil = (qx * dir.y - qy * dir.x) / kreuz;           // Lage auf der Begrenzung
    if (weite <= TRIM_TOLERANZ) continue;                       // nur nach vorn
    if (anteil < 0 || anteil > 1) continue;                     // nur innerhalb der Begrenzung
    if (!bester || weite < bester.weite) {
      bester = {
        weite,
        punkt:{ x:ende.x + weite * dir.x, y:ende.y + weite * dir.y },
        grenzSegmentIndex:k,
      };
    }
  }
  if (!bester) return { fehler:'In dieser Richtung liegt keine Leitung zum Andocken.' };

  const neu = route.map(p => ({ x:p.x, y:p.y }));
  if (seite === 'source') neu[0] = { ...bester.punkt };
  else neu[neu.length - 1] = { ...bester.punkt };
  return { route:neu, punkt:bester.punkt, grenzSegmentIndex:bester.grenzSegmentIndex, weite:bester.weite };
}

/**
 * Zwei aneinanderstossende Teilstücke zu EINER Leitung zusammenführen
 * (AutoCAD JOIN).
 *
 * Verbunden wird nur an einem gemeinsamen Endpunkt — eine Kreuzung in der
 * Mitte ergibt keine durchgehende Leitung. Der gemeinsame Punkt steht danach
 * genau einmal in der Route; ob er als Ecke überhaupt nötig bleibt, entscheidet
 * anschliessend `routeBereinigen` (bei geradem Durchlauf fällt er weg).
 *
 * `seiteA`/`seiteB` nennen die Enden, die zusammenfallen, `beginntBei` die
 * Leitung, an deren freiem Ende die neue Route startet. Damit weiss der
 * Aufrufer, welcher Anker bleibt und welcher verschwindet.
 */
export function routenVerbinden(routeA, routeB, { toleranz = TRIM_TOLERANZ } = {}) {
  const gueltig = route => Array.isArray(route) && route.length >= 2;
  if (!gueltig(routeA) || !gueltig(routeB)) return { fehler:'Zwei Leitungen erforderlich.' };
  const nah = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= toleranz;
  const rueckwaerts = route => [...route].reverse();

  // Vier mögliche Berührungen. Die Reihenfolge legt fest, wie die neue Route
  // durchläuft; der gemeinsame Punkt wird dabei genau einmal übernommen.
  const faelle = [
    { seiteA:'end', seiteB:'start', beginntBei:'a', a:routeA.at(-1), b:routeB[0],
      bauen:() => [...routeA, ...routeB.slice(1)] },
    { seiteA:'end', seiteB:'end', beginntBei:'a', a:routeA.at(-1), b:routeB.at(-1),
      bauen:() => [...routeA, ...rueckwaerts(routeB).slice(1)] },
    { seiteA:'start', seiteB:'end', beginntBei:'b', a:routeA[0], b:routeB.at(-1),
      bauen:() => [...routeB, ...routeA.slice(1)] },
    { seiteA:'start', seiteB:'start', beginntBei:'b', a:routeA[0], b:routeB[0],
      bauen:() => [...rueckwaerts(routeB), ...routeA.slice(1)] },
  ];
  const treffer = faelle.find(fall => nah(fall.a, fall.b));
  if (!treffer) return { fehler:'Die beiden Leitungen stossen nicht aneinander.' };

  const route = treffer.bauen().map(p => ({ x:p.x, y:p.y }));
  if (!routeHatLaenge(route)) return { fehler:'Die verbundene Leitung hätte keine Länge.' };
  return { route, seiteA:treffer.seiteA, seiteB:treffer.seiteB, beginntBei:treffer.beginntBei };
}

// ── Leitungsbeschriftung (DN / m') ────────────────────────────────────────
//
// Die Beschriftung sitzt normalerweise in der Streckenmitte. Im echten Plan
// steht sie dort aber oft im Weg. Darum trägt jede Leitung einen eigenen
// Versatz und ein Sichtbarkeitsflag — beides gehört zur Leitung und wird
// mitgespeichert und mitexportiert.

export const LABEL_VERSATZ_NULL = { x: 0, y: 0 };

/** Gespeicherter Versatz → sicherer Versatz (nie NaN, nie undefined). */
export function labelVersatz(data = {}) {
  const roh = data?.label_offset;
  const x = Number(roh?.x);
  const y = Number(roh?.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

/** Ist die Beschriftung dieser Leitung eingeblendet? */
export const labelSichtbar = (data = {}) => data?.label_hidden !== true;

/** Versatz nach einem Ziehen. `grid` 0 lässt die Beschriftung frei stehen. */
export function labelVerschoben(versatz, delta, { grid = 0 } = {}) {
  const raster = (wert) => (grid > 0 ? Math.round(wert / grid) * grid : wert);
  return {
    x: raster((Number(versatz?.x) || 0) + (Number(delta?.x) || 0)),
    y: raster((Number(versatz?.y) || 0) + (Number(delta?.y) || 0)),
  };
}

/** Verschiebestrecke in der üblichen Planer-Einheit cm, ab 1 m in Metern. */
export function verschiebungLabel(delta = {}) {
  const mm = Math.hypot(Number(delta.x) || 0, Number(delta.y) || 0);
  if (mm >= 1000) return `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')} m`;
  return `${(mm / 10).toFixed(1).replace(/\.0$/, '')} cm`;
}

/**
 * Abschlussdaten für Doppelklick, zweiten Klick auf denselben Punkt und ✓:
 * nur bewusst gesetzte Punkte zählen. Der bewegte Cursor gehört nie zur
 * gespeicherten Leitung. ESC ist kein Abschluss, sondern Abbruch — dort
 * entsteht überhaupt keine Leitung.
 */
export function entwurfFuerAbschluss(draft) {
  const endPoint = draft?.points?.at(-1);
  if (!endPoint) return null;
  return {
    endPoint:{ x:endPoint.x, y:endPoint.y },
    draft:{ ...draft, points:draft.points.slice(0, -1) },
  };
}

/**
 * Abzweig-Punkt für ein Branch-Bauteil (Sicherheitsventil, Expansionsgefäss):
 * senkrecht zur getroffenen Leitung, auf der Seite, auf der der Cursor steht.
 * Liegt der Cursor exakt auf der Leitung, wird nach oben abgezweigt — so wie ein
 * Sicherheitsventil üblicherweise gezeichnet wird.
 */
export function abzweigPunkt(a, b, treffer, cursor, abstand = 70) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy) || 1;
  let nx = -dy / laenge;
  let ny = dx / laenge;
  const seite = (cursor.x - treffer.x) * nx + (cursor.y - treffer.y) * ny;
  if (seite < 0 || (seite === 0 && ny > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: treffer.x + nx * abstand, y: treffer.y + ny * abstand };
}

/**
 * Ein Segment an einem Referenzsegment ausrichten (Punkt 35/36).
 *
 * Zwei Fälle, ein Befehl — wie im CAD:
 *   nicht parallel → das Zielsegment bekommt die Richtung der Referenz
 *                    (ein Endpunkt bleibt fix, die Länge bleibt möglichst gleich);
 *   bereits parallel → das Zielsegment wandert auf dieselbe Flucht.
 *
 * `fest` markiert Enden, die an einem Bauteilanschluss hängen. Sie werden NIE
 * bewegt: lieber verweigert der Befehl, als dass er die Hydraulik für die
 * Geometrie opfert (Punkt 37).
 *
 * Rückgabe: { route } oder { fehler }.
 */
export function segmentAusrichten(route, segmentIndex, referenz, { fest = {}, klick = null, toleranz = 0.5 } = {}) {
  if (!Array.isArray(route) || segmentIndex < 0 || segmentIndex >= route.length - 1) {
    return { fehler: 'Kein gültiges Segment gewählt.' };
  }
  const a = route[segmentIndex];
  const b = route[segmentIndex + 1];
  const rdx = referenz.b.x - referenz.a.x;
  const rdy = referenz.b.y - referenz.a.y;
  const rlen = Math.hypot(rdx, rdy);
  if (rlen < toleranz) return { fehler: 'Referenzsegment hat keine Richtung.' };
  const ux = rdx / rlen;
  const uy = rdy / rlen;
  const nx = -uy;
  const ny = ux;

  const startFest = segmentIndex === 0 && Boolean(fest.start);
  const endFest = segmentIndex === route.length - 2 && Boolean(fest.end);

  const laenge = Math.hypot(b.x - a.x, b.y - a.y);
  // Parallel heisst: das Segment hat keinen Anteil in Richtung der Normalen.
  const parallel = laenge < toleranz
    || Math.abs((b.x - a.x) * nx + (b.y - a.y) * ny) < toleranz;

  const neueRoute = route.map(p => ({ x: p.x, y: p.y }));

  if (parallel) {
    // Auf dieselbe Flucht schieben — beide Punkte wandern senkrecht.
    if (startFest || endFest) {
      return { fehler: 'Segment ist an einen Bauteilanschluss gebunden.' };
    }
    const abstand = (referenz.a.x - a.x) * nx + (referenz.a.y - a.y) * ny;
    if (Math.abs(abstand) < toleranz) return { fehler: 'Segment liegt bereits auf dieser Flucht.' };
    neueRoute[segmentIndex] = { x: a.x + nx * abstand, y: a.y + ny * abstand };
    neueRoute[segmentIndex + 1] = { x: b.x + nx * abstand, y: b.y + ny * abstand };
    return { route: neueRoute };
  }

  // Parallel machen: ein Ende bleibt stehen, das andere wird auf die
  // Referenzrichtung projiziert — der Winkel stimmt, die Länge bleibt möglichst.
  if (startFest && endFest) {
    return { fehler: 'Segment ist an beiden Enden an einen Bauteilanschluss gebunden.' };
  }
  let bewegeB = !endFest;
  if (!startFest && !endFest && klick) {
    // Der Endpunkt näher am Klick bleibt stehen — dort hat der Planer hingezeigt.
    const dA = Math.hypot(klick.x - a.x, klick.y - a.y);
    const dB = Math.hypot(klick.x - b.x, klick.y - b.y);
    bewegeB = dB >= dA;
  }
  const fix = bewegeB ? a : b;
  const beweglich = bewegeB ? b : a;
  const proj = (beweglich.x - fix.x) * ux + (beweglich.y - fix.y) * uy;
  const neu = { x: fix.x + ux * proj, y: fix.y + uy * proj };
  if (Math.hypot(neu.x - fix.x, neu.y - fix.y) < toleranz) {
    return { fehler: 'Ausrichten würde das Segment auf die Länge null bringen.' };
  }
  neueRoute[bewegeB ? segmentIndex + 1 : segmentIndex] = neu;
  return { route: neueRoute };
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

/**
 * Alle Leitungen EINES Leitungssystems (Tab-Auswahl).
 *
 * Ein Klick wählt bewusst nur das Teilstück. Wer den ganzen Strang braucht,
 * erweitert die Auswahl mit Tab. Zusammen gehören Leitungen, die über einen
 * freien Anker, einen Eck- oder einen T-Knoten hängen — also über `junction`.
 *
 * Ein Bauteil trennt das System. Sonst würde ein Klick auf den Vorlauf über die
 * Pumpe hinweg auch den Rücklauf markieren; das sind zwei Systeme, keine
 * durchgehende Leitung.
 */
export function leitungsSystem(edges = [], nodes = [], startEdgeId) {
  const start = edges.find(edge => edge?.id === startEdgeId);
  if (!start) return [];
  const verbindend = new Set(
    nodes.filter(node => node?.type === 'junction').map(node => node.id),
  );
  const gefunden = new Set([start.id]);
  const offen = [start];
  while (offen.length) {
    const aktuell = offen.pop();
    for (const knotenId of [aktuell.source, aktuell.target]) {
      if (!verbindend.has(knotenId)) continue;
      for (const kandidat of edges) {
        if (gefunden.has(kandidat.id)) continue;
        if (kandidat.source !== knotenId && kandidat.target !== knotenId) continue;
        gefunden.add(kandidat.id);
        offen.push(kandidat);
      }
    }
  }
  return [...gefunden];
}
