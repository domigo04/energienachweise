import { describe, expect, it } from 'vitest';
import {
  ALT_ABSTAND,
  BLOCK_SPALTE,
  BLOCK_ZEILE,
  LINIE_ABSTAND,
  altLage,
  blockLage,
  blockRahmen,
  blockSichtbar,
  brauchtMigration,
  migrierteDaten,
  naechsteBlockLage,
  rasterPlaetze,
  schemaUnterkante,
} from './datenblock';

// Breite und Höhe kommen bei der Lage über `groesse`, nicht über den Knoten.
const bauteil = (x, y, data = {}) => ({ position: { x, y }, data });
const groesse = (width = 60, height = 60) => ({ width, height });

describe('Sichtbarkeit', () => {
  it('ist standardmässig eingeblendet', () => {
    expect(blockSichtbar({})).toBe(true);
    expect(blockSichtbar(undefined)).toBe(true);
  });

  it('nur ein ausdrückliches true blendet aus', () => {
    expect(blockSichtbar({ caption_hidden: true })).toBe(false);
    expect(blockSichtbar({ caption_hidden: false })).toBe(true);
  });
});

describe('Altlage', () => {
  it('rechnet Mitte und Unterkante wie bisher', () => {
    // Genau die Formel aus HydraulikNodes und schema_svg: Mitte-X, Unterkante
    // plus fester Abstand.
    expect(altLage(bauteil(100, 200), groesse(60, 40)))
      .toEqual({ x: 130, y: 200 + 40 + ALT_ABSTAND });
  });

  it('berücksichtigt den gespeicherten Versatz in beide Richtungen', () => {
    const mitVersatz = bauteil(100, 200, { caption_offset_x: -25, caption_offset_y: -60 });
    expect(altLage(mitVersatz, groesse(60, 40)))
      .toEqual({ x: 105, y: 200 + 40 + ALT_ABSTAND - 60 });
  });
});

describe('geltende Lage', () => {
  it('nimmt die eigene Lage, sobald sie da ist', () => {
    const node = bauteil(100, 200, { caption_pos: { x: 900, y: 1200 } });
    expect(blockLage(node, groesse(60, 40))).toEqual({ x: 900, y: 1200 });
  });

  it('fällt ohne eigene Lage auf das Altmodell zurück', () => {
    // Ein Schema, das noch nie im neuen Editor offen war, sieht unverändert aus.
    expect(blockLage(bauteil(100, 200), groesse(60, 40)))
      .toEqual({ x: 130, y: 250 });
  });

  it('ignoriert eine unbrauchbare gespeicherte Lage', () => {
    const kaputt = bauteil(100, 200, { caption_pos: { x: null, y: 5 } });
    expect(blockLage(kaputt, groesse(60, 40))).toEqual({ x: 130, y: 250 });
  });
});

describe('Migration', () => {
  it('betrifft nur Bauteile mit Block und ohne eigene Lage', () => {
    expect(brauchtMigration(bauteil(0, 0, { nr: 1 }))).toBe(true);
    // Ohne Nummer gibt es keinen Block.
    expect(brauchtMigration(bauteil(0, 0, {}))).toBe(false);
    // Schon überführt.
    expect(brauchtMigration(bauteil(0, 0, { nr: 1, caption_pos: { x: 1, y: 2 } }))).toBe(false);
  });

  it('setzt die Lage exakt dorthin, wo der Block vorher stand', () => {
    // DAS Akzeptanzkriterium: ein vorher gespeichertes Schema sieht nachher
    // gleich aus.
    const node = bauteil(300, 400, { nr: 3, caption_offset_x: 12, caption_offset_y: -8 });
    const vorher = altLage(node, groesse(60, 40));
    expect(migrierteDaten(node, groesse(60, 40)).caption_pos).toEqual(vorher);
  });

  it('entfernt die Altfelder, damit es nur eine Quelle gibt', () => {
    const node = bauteil(300, 400, { nr: 3, caption_offset_x: 12, caption_offset_y: -8 });
    const daten = migrierteDaten(node, groesse(60, 40));
    expect('caption_offset_x' in daten).toBe(false);
    expect('caption_offset_y' in daten).toBe(false);
  });

  it('lässt alle übrigen Node-Daten unangetastet', () => {
    const node = bauteil(0, 0, { nr: 3, label: 'Pumpe', fabrikat: 'Testfabrikat' });
    const daten = migrierteDaten(node, groesse());
    expect(daten.label).toBe('Pumpe');
    expect(daten.fabrikat).toBe('Testfabrikat');
    expect(daten.nr).toBe(3);
  });
});

describe('Rahmen der Blockreihe', () => {
  const bauteile = [
    { x: 300, y: 200, breite: 60, hoehe: 100 },
    { x: 900, y: 200, breite: 60, hoehe: 40 },
  ];

  it('legt die Linie unter das tiefste Bauteil', () => {
    // Tiefste Unterkante ist 200 + 100 = 300.
    expect(schemaUnterkante(bauteile)).toBe(300);
    expect(blockRahmen(bauteile).oben).toBe(300 + LINIE_ABSTAND);
  });

  it('beginnt links am Schema und endet rechts', () => {
    const rahmen = blockRahmen(bauteile);
    expect(rahmen.links).toBe(300);
    expect(rahmen.rechts).toBe(960);
  });

  it('gibt auch einem einzelnen schmalen Bauteil eine brauchbare Zeile', () => {
    const rahmen = blockRahmen([{ x: 100, y: 0, breite: 10, hoehe: 10 }]);
    expect(rahmen.rechts - rahmen.links).toBeGreaterThanOrEqual(BLOCK_SPALTE);
  });

  it('kommt ohne Bauteile zurecht', () => {
    expect(schemaUnterkante([])).toBe(0);
    expect(blockRahmen([]).oben).toBe(LINIE_ABSTAND);
  });
});

describe('Rasterplätze', () => {
  const rahmen = { links: 0, rechts: 2 * BLOCK_SPALTE, oben: 1000 };

  it('liegen zeilenweise von links oben', () => {
    const plaetze = rasterPlaetze(rahmen, 2);
    expect(plaetze[0]).toEqual({ x: BLOCK_SPALTE / 2, y: 1000 });
    expect(plaetze[1]).toEqual({ x: BLOCK_SPALTE * 1.5, y: 1000 });
    // Neue Zeile erst, nachdem die alte voll ist.
    expect(plaetze[3].y).toBe(1000 + BLOCK_ZEILE);
  });

  it('sind endlich — die Reihe wächst nicht unbegrenzt', () => {
    expect(rasterPlaetze(rahmen, 3).length).toBe(9);
  });
});

describe('nächste freie Lage', () => {
  const bauteile = [{ x: 0, y: 0, breite: 3 * BLOCK_SPALTE, hoehe: 100 }];

  it('setzt den ersten Block ganz links unter die Linie', () => {
    const lage = naechsteBlockLage(bauteile, []);
    expect(lage).toEqual({ x: BLOCK_SPALTE / 2, y: 100 + LINIE_ABSTAND });
  });

  it('reiht den nächsten Block rechts daneben', () => {
    const erster = naechsteBlockLage(bauteile, []);
    expect(naechsteBlockLage(bauteile, [erster]).x).toBe(BLOCK_SPALTE * 1.5);
  });

  it('bricht in die nächste Zeile um, wenn die Zeile voll ist', () => {
    const rahmen = blockRahmen(bauteile);
    const volleZeile = rasterPlaetze(rahmen, 1);
    const naechste = naechsteBlockLage(bauteile, volleZeile);
    expect(naechste.y).toBe(rahmen.oben + BLOCK_ZEILE);
    expect(naechste.x).toBe(BLOCK_SPALTE / 2);
  });

  it('füllt eine Lücke, statt hinten anzuhängen', () => {
    // Wird ein Bauteil gelöscht, soll der nächste Block dessen Platz nehmen.
    const rahmen = blockRahmen(bauteile);
    const plaetze = rasterPlaetze(rahmen, 1);
    const mitLuecke = plaetze.filter((_, i) => i !== 1);
    expect(naechsteBlockLage(bauteile, mitLuecke)).toEqual(plaetze[1]);
  });

  it('stapelt unterhalb der Reihe, wenn alle Zeilen voll sind', () => {
    const rahmen = blockRahmen(bauteile);
    const alleVoll = rasterPlaetze(rahmen, 2);
    const lage = naechsteBlockLage(bauteile, alleVoll, { zeilen: 2 });
    expect(lage.y).toBe(rahmen.oben + 2 * BLOCK_ZEILE);
  });

  it('lässt sich von unbrauchbaren Lagen nicht stören', () => {
    const lage = naechsteBlockLage(bauteile, [null, { x: null, y: 5 }]);
    expect(lage).toEqual({ x: BLOCK_SPALTE / 2, y: 100 + LINIE_ABSTAND });
  });
});
