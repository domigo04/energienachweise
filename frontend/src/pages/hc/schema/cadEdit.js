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
 * Standardmässig ist die Bewegung frei. Mit `axisLocked:true` bindet
 * `orientation` die Bewegung auf die Normale des Segments (Legacy/CAD-Ortho).
 */
export function segmentVerschieben(points, pointIndexes, orientation, delta, {
  grid = 10, direction = null, axisLocked = false,
} = {}) {
  const idx = new Set(pointIndexes || []);
  if (!Array.isArray(points) || !idx.size) return points || [];
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

  return points.map((punkt, index) => (idx.has(index)
    ? { x: punkt.x + moveX, y: punkt.y + moveY }
    : punkt));
}

/**
 * Bereitet ein sichtbares Teilstück für das Verschieben vor. Liegt es direkt an
 * einem Bauteilanschluss, wird innen ein Stützpunkt ergänzt. Der hydraulische
 * Anschluss bleibt dadurch fest und nur das gewählte Teilstück wandert.
 */
export function segmentZumVerschieben(route, segmentIndex) {
  if (!Array.isArray(route) || segmentIndex < 0 || segmentIndex >= route.length - 1) return null;
  const workingRoute = route.map(point => ({ x:point.x, y:point.y }));
  let startIndex = segmentIndex;
  let endIndex = startIndex + 1;
  if (startIndex === 0) {
    workingRoute.splice(1, 0, { ...workingRoute[0] });
    startIndex = 1;
    endIndex = 2;
  }
  if (endIndex === workingRoute.length - 1) {
    workingRoute.splice(endIndex, 0, { ...workingRoute.at(-1) });
  }
  const a = workingRoute[startIndex];
  const b = workingRoute[endIndex];
  return {
    points:workingRoute.slice(1, -1),
    pointIndexes:[startIndex - 1, endIndex - 1],
    direction:{ x:b.x - a.x, y:b.y - a.y },
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
 * Abschlussdaten für ESC: nur bewusst gesetzte Punkte zählen. Der bewegte
 * Cursor gehört nie zur gespeicherten Leitung.
 */
export function entwurfFuerEscape(draft) {
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
