import { describe, expect, it } from 'vitest';
import {
  wohnungAendern, wohnungEntfernen, wohnungHinzufuegen, wohnungenAusDaten,
} from './bwwWohnungen';

describe('BWW-Wohnungszeilen', () => {
  it('übernimmt alte Nutzflächen verlustfrei in benannte Zeilen', () => {
    expect(wohnungenAusDaten({ bww_nutzflaechen_m2: [80, 120] })).toEqual([
      { id:'wohnung-1', name:'Wohnung 1', flaeche_m2:80 },
      { id:'wohnung-2', name:'Wohnung 2', flaeche_m2:120 },
    ]);
  });

  it('fügt hinzu, benennt um und lässt immer eine Eingabezeile stehen', () => {
    let zeilen = wohnungenAusDaten();
    zeilen = wohnungAendern(zeilen, 'wohnung-1', 'name', 'WHG 101');
    zeilen = wohnungHinzufuegen(zeilen);
    expect(zeilen.map(z => z.name)).toEqual(['WHG 101', 'Wohnung 2']);
    zeilen = wohnungEntfernen(zeilen, 'wohnung-1');
    zeilen = wohnungEntfernen(zeilen, 'wohnung-2');
    expect(zeilen).toEqual([{ id:'wohnung-1', name:'Wohnung 1', flaeche_m2:'' }]);
  });
});
