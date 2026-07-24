export function roundedPolylinePath(points, radius = 8) {
  if (!points?.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const r = Math.max(0, Number(radius) || 0);
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const inDx = corner.x - previous.x;
    const inDy = corner.y - previous.y;
    const outDx = next.x - corner.x;
    const outDy = next.y - corner.y;
    const inLength = Math.hypot(inDx, inDy);
    const outLength = Math.hypot(outDx, outDy);
    const directionDot = inLength && outLength
      ? (inDx * outDx + inDy * outDy) / (inLength * outLength)
      : 1;

    // Gerade Segmente, Doppelpunkt-Klicks und 180°-Wenden benötigen keinen
    // Bogen. Bei kurzen Segmenten wird der Radius automatisch verkleinert.
    if (!r || !inLength || !outLength || Math.abs(directionDot) > 0.999) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const cut = Math.min(r, inLength / 2, outLength / 2);
    const before = {
      x: corner.x - (inDx / inLength) * cut,
      y: corner.y - (inDy / inLength) * cut,
    };
    const after = {
      x: corner.x + (outDx / outLength) * cut,
      y: corner.y + (outDy / outLength) * cut,
    };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = points.at(-1);
  return `${path} L ${end.x} ${end.y}`;
}

export function pairedHandleId(nodeType, handleId) {
  if (!handleId) return null;
  if (handleId === 'vl') return 'rl';
  if (handleId === 'vl-main') return 'rl-main';
  if (/^vl-\d+$/.test(handleId)) return handleId.replace(/^vl-/, 'rl-');
  if (['speicher', 'bww'].includes(nodeType)) {
    if (handleId === 'top-l') return 'bot-l';
    if (handleId === 'top-r') return 'bot-r';
  }
  if (nodeType === 'verbraucher' && handleId === 'top') return 'bottom';
  if (nodeType === 'pwt') {
    if (handleId === 'left') return 'bottom';
    if (handleId === 'top') return 'right';
  }
  return null;
}

// Gesamtlänge einer Route (Punktfolge inkl. Endpunkte).
export function streckenLaenge(points) {
  return points.slice(1).reduce(
    (sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y),
    0,
  );
}

// Projektion eines Punktes auf ein Segment a→b (t geklemmt auf [0,1]).
export function projektionAufSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return null;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
}

// Eine Route an einem Punkt auf `segmentIndex` teilen — der geometrische Kern
// des Inline-Einsetzens (§3) und des CAD-Junction-Splits. Liefert die
// Zwischen-Stützpunkte beider Teilstücke (ohne Endpunkte) und den Längenanteil
// des ersten Stücks, damit z. B. `laenge_m` proportional aufgeteilt werden kann.
// Bestehende Waypoints bleiben erhalten, nichts wird neu berechnet.
export function splitRouteAtPoint(route, segmentIndex, point) {
  const before = route.slice(1, segmentIndex + 1);
  const after = route.slice(segmentIndex + 1, -1);
  const firstRoute = [route[0], ...before, point];
  const secondRoute = [point, ...after, route.at(-1)];
  const total = streckenLaenge(firstRoute) + streckenLaenge(secondRoute);
  const firstShare = total ? streckenLaenge(firstRoute) / total : 0.5;
  return { before, after, firstShare };
}

// Zwei Routen, die sich einen Knoten teilen (A endet im Knoten, B beginnt dort),
// beim Löschen eines Inline-Bauteils wieder zu EINER Route verbinden (§6). Der
// Knotenpunkt wird zu einem gewöhnlichen Stützpunkt. Nur bei eindeutiger
// Topologie (genau zwei Nachbarn) aufrufen — hier wird nichts geraten.
export function mergeReconnectWaypoints(routeA, routeB) {
  const knoten = routeA.at(-1);
  return [...routeA.slice(1, -1), knoten, ...routeB.slice(1, -1)];
}

// Zwei Leitungen, die ein Inline-Bauteil verbinden, beim Löschen zu EINER
// zusammenführen (§6). `routeOf(edge)` liefert die volle Route [start..end].
// Beide Kanten berühren `nodeId`; die Routen werden so orientiert, dass die
// erste beim Knoten endet und die zweite dort beginnt — unabhängig von der
// gespeicherten Kantenrichtung. Gibt null zurück, wenn keine eindeutige
// Durchgangs-Topologie vorliegt (z. B. beide äusseren Enden gleich).
export function reconnectThroughNode(e1, e2, nodeId, routeOf) {
  const routeIn = e1.target === nodeId ? routeOf(e1) : [...routeOf(e1)].reverse();
  const routeOut = e2.source === nodeId ? routeOf(e2) : [...routeOf(e2)].reverse();
  const outer1 = e1.target === nodeId
    ? { node: e1.source, handle: e1.sourceHandle }
    : { node: e1.target, handle: e1.targetHandle };
  const outer2 = e2.source === nodeId
    ? { node: e2.target, handle: e2.targetHandle }
    : { node: e2.source, handle: e2.sourceHandle };
  if (!routeIn?.length || !routeOut?.length || outer1.node === outer2.node) return null;
  return {
    source: outer1.node, sourceHandle: outer1.handle,
    target: outer2.node, targetHandle: outer2.handle,
    points: mergeReconnectWaypoints(routeIn, routeOut),
  };
}

// Ausrichtung eines Segments für die automatische Bauteil-Orientierung (§5):
// überwiegt die horizontale Ausdehnung → 'horizontal', sonst 'vertikal'.
export function segmentAusrichtung(a, b) {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertikal';
}

export function parallelWaypoints(points, start, end, pairStart, pairEnd) {
  if (!points?.length) return [];
  const route = [start, ...points, end];
  const segmentLengths = route.slice(1).map((point, index) => Math.hypot(
    point.x - route[index].x,
    point.y - route[index].y,
  ));
  const total = segmentLengths.reduce((sum, length) => sum + length, 0) || 1;
  const sourceDelta = { x:pairStart.x - start.x, y:pairStart.y - start.y };
  const targetDelta = { x:pairEnd.x - end.x, y:pairEnd.y - end.y };
  let travelled = 0;
  return points.map((point, index) => {
    travelled += segmentLengths[index];
    const ratio = travelled / total;
    return {
      x:point.x + sourceDelta.x * (1 - ratio) + targetDelta.x * ratio,
      y:point.y + sourceDelta.y * (1 - ratio) + targetDelta.y * ratio,
    };
  });
}
