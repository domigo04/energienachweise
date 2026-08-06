// Datenblöcke am Bauteil aneinander ausrichten (Dominic 2026-08-06).
//
// Jeder Datenblock hat auf jeder Seite einen Fangpunkt: waagrecht links,
// Mitte und rechts, senkrecht oben, Mitte und unten. Wird ein Block
// verschoben, rastet er an der gleichen Flucht der anderen Blöcke ein und
// zeigt sie als Hilfslinie — dieselbe Bedienung wie in Revit.
//
// Rein, ohne React und ohne DOM: die Rechtecke kommen in Weltkoordinaten
// herein, heraus kommt die Korrektur und die Hilfslinie. Genau dadurch ist der
// Fang prüfbar, ohne den Editor zu starten.

/** Waagrechte Fangwerte eines Rechtecks: linke Kante, Mitte, rechte Kante. */
export const xFangwerte = (r) => [r.x, r.x + r.breite / 2, r.x + r.breite];

/** Senkrechte Fangwerte: Oberkante, Mitte, Unterkante. */
export const yFangwerte = (r) => [r.y, r.y + r.hoehe / 2, r.y + r.hoehe];

/**
 * Die acht sichtbaren Fangpunkte eines Blocks: vier Ecken und die Mitte jeder
 * Seite. Der Mittelpunkt selbst wird nicht gezeigt — er liegt im Text.
 */
export function fangPunkte(r) {
  const [links, mitte, rechts] = xFangwerte(r);
  const [oben, hoehenmitte, unten] = yFangwerte(r);
  return [
    { x: links, y: oben }, { x: mitte, y: oben }, { x: rechts, y: oben },
    { x: rechts, y: hoehenmitte }, { x: rechts, y: unten },
    { x: mitte, y: unten }, { x: links, y: unten },
    { x: links, y: hoehenmitte },
  ];
}

/** Nächstgelegene Flucht auf einer Achse; ohne Treffer null. */
function besteFlucht(eigene, ziele, toleranz) {
  let beste = null;
  for (const wert of eigene) {
    for (const ziel of ziele) {
      const delta = ziel.wert - wert;
      if (Math.abs(delta) > toleranz) continue;
      if (!beste || Math.abs(delta) < Math.abs(beste.delta)) {
        beste = { delta, koordinate: ziel.wert, partner: ziel.rechteck };
      }
    }
  }
  return beste;
}

/**
 * Einen bewegten Block an den anderen ausrichten.
 *
 * `bewegt` und `andere` sind `{ x, y, breite, hoehe }` in Weltkoordinaten,
 * `toleranz` der Fangradius in derselben Einheit.
 *
 * Rückgabe: `{ dx, dy, linien }`. `dx`/`dy` sind die Korrektur auf die
 * gewünschte Lage, `linien` die Hilfslinien zur getroffenen Flucht —
 * `{ achse:'x'|'y', wert, von, bis }`, wobei die Linie beide Blöcke umspannt.
 */
export function datenblockAusrichten(bewegt, andere = [], toleranz = 6) {
  if (!bewegt || !Number.isFinite(bewegt.x) || !Number.isFinite(bewegt.y)) {
    return { dx: 0, dy: 0, linien: [] };
  }
  const zieleX = [];
  const zieleY = [];
  for (const rechteck of andere) {
    if (!rechteck || !Number.isFinite(rechteck.x) || !Number.isFinite(rechteck.y)) continue;
    for (const wert of xFangwerte(rechteck)) zieleX.push({ wert, rechteck });
    for (const wert of yFangwerte(rechteck)) zieleY.push({ wert, rechteck });
  }

  const x = besteFlucht(xFangwerte(bewegt), zieleX, toleranz);
  const y = besteFlucht(yFangwerte(bewegt), zieleY, toleranz);
  const dx = x ? x.delta : 0;
  const dy = y ? y.delta : 0;
  const gerastet = { ...bewegt, x: bewegt.x + dx, y: bewegt.y + dy };

  const linien = [];
  if (x) {
    linien.push({
      achse: 'x',
      wert: x.koordinate,
      von: Math.min(gerastet.y, x.partner.y),
      bis: Math.max(gerastet.y + gerastet.hoehe, x.partner.y + x.partner.hoehe),
    });
  }
  if (y) {
    linien.push({
      achse: 'y',
      wert: y.koordinate,
      von: Math.min(gerastet.x, y.partner.x),
      bis: Math.max(gerastet.x + gerastet.breite, y.partner.x + y.partner.breite),
    });
  }
  return { dx, dy, linien };
}
