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
