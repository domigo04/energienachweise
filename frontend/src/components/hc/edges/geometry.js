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
