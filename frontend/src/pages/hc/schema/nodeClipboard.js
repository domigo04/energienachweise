const klonen = (wert) => JSON.parse(JSON.stringify(wert));

/**
 * Erstellt einen stabilen Editor-Snapshot ohne flüchtige Berechnungsergebnisse.
 * Dadurch lassen sich insbesondere Textblöcke mit Cmd/Ctrl+C kopieren, ohne
 * dass das Original beim späteren Einfügen mitverändert wird.
 */
export function kopierbarerKnoten(node) {
  if (!node) return null;
  const kopie = klonen(node);
  if (kopie.data) delete kopie.data._calc;
  kopie.selected = false;
  return kopie;
}

/** Erstellt die versetzte, unabhängige Kopie für Cmd/Ctrl+V. */
export function eingefuegterKnoten(snapshot, id, { nummer = null, versatz = 24 } = {}) {
  if (!snapshot || !id) return null;
  const neu = klonen(snapshot);
  neu.id = id;
  neu.selected = true;
  neu.position = {
    x: (neu.position?.x || 0) + versatz,
    y: (neu.position?.y || 0) + versatz,
  };
  neu.data = { ...(neu.data || {}) };
  if (nummer !== null) neu.data.nr = nummer;
  return neu;
}
