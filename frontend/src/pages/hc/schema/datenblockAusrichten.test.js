import { describe, expect, it } from 'vitest';
import { datenblockAusrichten, fangPunkte } from './datenblockAusrichten';

const block = (x, y, breite = 100, hoehe = 60) => ({ x, y, breite, hoehe });

describe('Datenblöcke ausrichten', () => {
  it('rastet die Oberkante auf die Oberkante des Nachbarn', () => {
    const { dx, dy, linien } = datenblockAusrichten(block(400, 204), [block(100, 200)], 8);
    expect(dx).toBe(0);
    expect(dy).toBe(-4);
    expect(linien).toEqual([{ achse: 'y', wert: 200, von: 100, bis: 500 }]);
  });

  it('rastet die linke Kante auf die linke Kante des Nachbarn', () => {
    const { dx, linien } = datenblockAusrichten(block(103, 400), [block(100, 100)], 8);
    expect(dx).toBe(-3);
    // Die Hilfslinie umspannt beide Blöcke, nicht nur den bewegten.
    expect(linien).toEqual([{ achse: 'x', wert: 100, von: 100, bis: 460 }]);
  });

  it('richtet waagrecht und senkrecht gleichzeitig aus', () => {
    const { dx, dy, linien } = datenblockAusrichten(block(102, 197), [block(100, 200)], 8);
    expect([dx, dy]).toEqual([-2, 3]);
    expect(linien.map(l => l.achse)).toEqual(['x', 'y']);
  });

  it('fängt ausserhalb der Toleranz nicht', () => {
    const { dx, dy, linien } = datenblockAusrichten(block(121, 241), [block(100, 200)], 8);
    expect([dx, dy, linien]).toEqual([0, 0, []]);
  });

  it('nimmt die nächstgelegene Flucht, nicht die erstbeste', () => {
    // Rechte Kante des bewegten Blocks (205) liegt 5 neben der linken Kante des
    // Nachbarn (200), die Mitte (155) 45 daneben — die 5 gewinnen.
    const { dx } = datenblockAusrichten(block(105, 900), [block(200, 100)], 8);
    expect(dx).toBe(-5);
  });

  it('richtet auch an der Mitte aus', () => {
    // Schmaler Block: nur seine Mitte (178 + 20 = 198) liegt nahe an der Mitte
    // des Nachbarn (200); linke und rechte Kante sind weit weg.
    const { dx, linien } = datenblockAusrichten(block(178, 900, 40), [block(150, 100)], 8);
    expect(dx).toBe(2);
    expect(linien[0].wert).toBe(200);
  });

  it('ohne Nachbarn bleibt der Block, wo er ist', () => {
    expect(datenblockAusrichten(block(0, 0), [], 8)).toEqual({ dx: 0, dy: 0, linien: [] });
  });

  it('übergeht unbrauchbare Rechtecke, statt NaN zu rechnen', () => {
    const { dx, dy } = datenblockAusrichten(block(100, 100), [null, { x: NaN, y: 0 }], 8);
    expect([dx, dy]).toEqual([0, 0]);
  });

  it('zeigt auf jeder Seite und in jeder Ecke einen Fangpunkt', () => {
    expect(fangPunkte(block(0, 0, 100, 60))).toEqual([
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 30 }, { x: 100, y: 60 },
      { x: 50, y: 60 }, { x: 0, y: 60 },
      { x: 0, y: 30 },
    ]);
  });
});
