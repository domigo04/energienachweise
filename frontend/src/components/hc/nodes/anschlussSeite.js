// Auf welcher Seite liegt ein Anschluss, wenn das Bauteil gedreht ist?
//
// Die Drehung eines Bauteils ist eine CSS-Transformation; React Flow sieht sie
// nicht. Es richtet den Leitungsanschluss weiterhin nach der DEKLARIERTEN Seite
// aus — bei einem quer liegenden Ventil also nach oben und unten statt nach
// links und rechts. Sichtbar wird das an den beiden Enden der Flussachse: sie
// liegen dann ein paar Pixel über- und untereinander statt auf einer Höhe
// (Dominic 2026-07-31, 3-Weg-Mischventil).
//
// Diese Datei ist rein und ohne React, damit die Regel prüfbar bleibt. Sie ist
// die EINZIGE Stelle, an der eine Seite gedreht wird: der Handle bekommt die
// wirkliche Seite, und der Editor korrigiert nichts mehr nach.
import { Position } from '@xyflow/react';

// Im Uhrzeigersinn — eine 90°-Drehung (CSS `rotate`, im Uhrzeigersinn)
// verschiebt jede Seite um einen Schritt weiter: oben→rechts→unten→links.
const SEITEN_UHRZEIGER = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function gedrehteSeite(position, rotation = 0, mirrored = false) {
  // Reihenfolge wie die CSS-Transformation `rotate() scaleX(-1)`: erst
  // spiegeln (vertauscht links und rechts, oben/unten bleibt), dann drehen.
  let seite = position;
  if (mirrored) {
    if (seite === Position.Left) seite = Position.Right;
    else if (seite === Position.Right) seite = Position.Left;
  }
  const index = SEITEN_UHRZEIGER.indexOf(seite);
  if (index < 0) return seite;
  const schritte = ((Math.round((rotation || 0) / 90) % 4) + 4) % 4;
  return SEITEN_UHRZEIGER[(index + schritte) % 4];
}

/**
 * Von welcher Seite kommt eine Leitung an einem Bauteil an?
 *
 * `punkt` ist der Anschluss, `nachbar` der nächste Punkt der Leitung. Die
 * dominante Achse entscheidet — eine Leitung, die von links kommt, kommt von
 * links, auch wenn sie leicht schräg liegt.
 */
export function anfahrtsSeite(punkt, nachbar) {
  if (!punkt || !nachbar) return null;
  const dx = nachbar.x - punkt.x;
  const dy = nachbar.y - punkt.y;
  if (!dx && !dy) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? Position.Right : Position.Left;
  return dy > 0 ? Position.Bottom : Position.Top;
}

/**
 * Welche Leitung hängt nach einer Drehung an welchem Anschluss?
 *
 * Dreht man ein Bauteil um 180°, wandert der Anschluss, der oben lag, nach
 * unten. Die Leitung bliebe daran hängen und müsste unter dem Bauteil
 * durchlaufen — sie käme plötzlich von unten statt von oben (Dominic
 * 2026-07-31). Richtig ist: die Leitung, die von oben kommt, hängt danach an
 * dem Anschluss, der jetzt oben liegt.
 *
 * Bewusst nur ein TAUSCH unter den bereits benutzten Anschlüssen. Eine Leitung
 * springt nie auf einen Anschluss, der vorher frei war — sonst würde ein
 * Speicher mit vielen Anschlusspunkten seine Leitungen bei jeder Drehung an
 * eine andere Stelle setzen, ohne dass es jemand verlangt hat.
 *
 * @param handles      [{ id, position }] — die DEKLARIERTEN Seiten des Bauteils
 * @param anschluesse  [{ edgeId, ende:'source'|'target', handleId, anfahrt }]
 * @param rotation     Drehung NACH der Änderung
 * @param mirrored     Spiegelung NACH der Änderung
 * @returns nur die Anschlüsse, die wechseln — [{ edgeId, ende, handleId }]
 */
export function anschluesseNachDrehung(handles = [], anschluesse = [], rotation = 0, mirrored = false) {
  const seiteVon = new Map(handles.map(h => [h.id, gedrehteSeite(h.position, rotation, mirrored)]));
  // Nur Anschlüsse, die wirklich eine Leitung tragen, kommen als Ziel in Frage.
  const benutzt = anschluesse.map(a => a.handleId).filter(id => seiteVon.has(id));

  const belegt = new Set();
  const offen = [];
  for (const a of anschluesse) {
    // Wer schon auf der richtigen Seite liegt, bleibt, wo er ist.
    if (a.anfahrt && seiteVon.get(a.handleId) === a.anfahrt) belegt.add(a.handleId);
    else offen.push(a);
  }

  const wechsel = [];
  for (const a of offen) {
    const ziel = benutzt.find(id => !belegt.has(id) && seiteVon.get(id) === a.anfahrt);
    if (!ziel) {
      // Kein Anschluss liegt auf dieser Seite — das Bauteil hat sich wirklich
      // weggedreht. Dann bleibt die Leitung, wo sie ist, statt zu raten.
      belegt.add(a.handleId);
      continue;
    }
    belegt.add(ziel);
    if (ziel !== a.handleId) wechsel.push({ edgeId: a.edgeId, ende: a.ende, handleId: ziel });
  }
  return wechsel;
}
