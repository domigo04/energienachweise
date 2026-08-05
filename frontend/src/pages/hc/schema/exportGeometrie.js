// Die im Browser vermessene Geometrie eines Bauteils für den Export.
//
// Nur der Editor weiss, wo ein Bauteil wirklich liegt: React Flow misst Box und
// Anschlüsse im DOM — inklusive Drehung, Spiegelung und von Hand gezogener
// Grösse. Leitete das Backend dieselbe Geometrie ein zweites Mal her, wich der
// Plot ab: schräge Schlusssegmente, Leitungen an der falschen Bauteilseite,
// Betonflächen in Standardgrösse.
//
// Deshalb schickt der Export diese Messwerte mit. Das Backend zeichnet die
// Symbole nur noch in die gelieferte Box und hängt die Leitungen an die
// gelieferten Anschlusspunkte. Die Werte gehören ausschliesslich in den
// Export — gespeichert wird der Graph ohne sie, sonst veraltet die Geometrie
// im Schema.

function messpunkte(internal) {
  return [
    ...(internal?.internals?.handleBounds?.source || []),
    ...(internal?.internals?.handleBounds?.target || []),
  ];
}

/**
 * Box und Anschlusspunkte eines Bauteils in absoluten Flow-Koordinaten.
 *
 * `internal` ist der React-Flow-Knoten aus `getInternalNode(id)`. Ohne Messung
 * (Bauteil noch nicht gerendert) gibt es `null` — das Backend rechnet dann wie
 * bisher mit seinen Standardmassen weiter.
 */
export function bauteilGeometrie(internal) {
  const absolute = internal?.internals?.positionAbsolute;
  if (!absolute || !Number.isFinite(absolute.x) || !Number.isFinite(absolute.y)) return null;

  const handles = {};
  for (const handle of messpunkte(internal)) {
    if (!handle?.id) continue;
    handles[handle.id] = {
      x: absolute.x + handle.x + (handle.width || 0) / 2,
      y: absolute.y + handle.y + (handle.height || 0) / 2,
    };
  }

  const breite = internal.measured?.width;
  const hoehe = internal.measured?.height;
  const box = breite > 0 && hoehe > 0
    ? { x: absolute.x, y: absolute.y, width: breite, height: hoehe }
    : null;

  return box || Object.keys(handles).length ? { box, handles } : null;
}

/**
 * Den Graphen für den Export um die gemessene Geometrie ergänzen.
 *
 * `nodes` bleibt unverändert; zurück kommt eine Kopie mit `export_box` und
 * `export_handles` in `data`.
 */
export function nodesMitExportGeometrie(nodes, internalVon) {
  return (nodes || []).map(node => {
    const geometrie = bauteilGeometrie(internalVon(node.id));
    if (!geometrie) return node;
    return {
      ...node,
      data: {
        ...(node.data || {}),
        ...(geometrie.box ? { export_box: geometrie.box } : {}),
        export_handles: geometrie.handles,
      },
    };
  });
}
