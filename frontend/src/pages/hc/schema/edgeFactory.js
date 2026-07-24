// Einzige Stelle, an der eine hydraulische Leitung (Edge) entsteht. JEDE
// Edge-Erzeugung MUSS durch diese Funktion laufen — so kann keine Leitung
// ausserhalb des expliziten Zeichenpfads erstellt werden (Prio: keine
// zufälligen Leitungen).
//
// Validierung vor der Erzeugung:
//   - gültige Quelle UND gültiges Ziel
//   - kein Selbstanschluss (source === target)
//   - keine Null-Länge (identische Quelle/Ziel-Position, falls übergeben)
//   - keine Duplikat-Edge (gleiche Quelle/Ziel + Handles existiert schon)
//   - gültiger Layer
//
// Gibt die fertige Edge zurück oder null, wenn eine Regel verletzt ist.
export function createHydraulicEdge(params, existingEdges = []) {
  const {
    id, source, sourceHandle = null, target, targetHandle = null,
    layerId, layerColor = "#334155", points = [], cornerRadius = 8,
    startPoint = null, endPoint = null,
  } = params || {};

  if (!id) return null;
  if (!source || !target) return null;          // gültige Quelle + Ziel
  if (source === target) return null;            // kein Selbstanschluss
  if (!layerId) return null;                     // gültiger Layer

  // Null-Länge: nur prüfen, wenn beide Endpunkt-Positionen bekannt sind.
  if (startPoint && endPoint) {
    const dist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
    if (dist < 2) return null;
  }

  // Duplikat: exakt dieselbe Verbindung (inkl. Handles) existiert bereits.
  const duplikat = (existingEdges || []).some((e) =>
    e && e.source === source && e.target === target
    && (e.sourceHandle ?? null) === (sourceHandle ?? null)
    && (e.targetHandle ?? null) === (targetHandle ?? null));
  if (duplikat) return null;

  return {
    id, source, sourceHandle, target, targetHandle,
    type: "flow", selected: false,
    data: { layer_id: layerId, cad_polyline: true, polyline_version: 1, corner_radius: cornerRadius, points },
    style: { stroke: layerColor, strokeWidth: 4.5 },
  };
}
