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
