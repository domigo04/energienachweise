import { describe, expect, it } from 'vitest';
import { eingefuegterKnoten, kopierbarerKnoten } from './nodeClipboard';

describe('Knoten-Zwischenablage', () => {
  it('kopiert Textblöcke mit Inhalt und Darstellung', () => {
    const original = {
      id:'text-1', type:'label', selected:true, position:{ x:100, y:80 },
      data:{ text:'Warmwasser', fontSize:18, color:'#172033', _calc:{ transient:true } },
    };

    const snapshot = kopierbarerKnoten(original);
    const kopie = eingefuegterKnoten(snapshot, 'text-2');

    expect(kopie).toMatchObject({
      id:'text-2', type:'label', selected:true, position:{ x:124, y:104 },
      data:{ text:'Warmwasser', fontSize:18, color:'#172033' },
    });
    expect(kopie.data._calc).toBeUndefined();
  });

  it('erzeugt eine tiefe, unabhängige Kopie und kann eine neue Nummer setzen', () => {
    const original = { id:'n1', type:'gruppe', position:{ x:0, y:0 }, data:{ nr:2, nested:{ q:5 } } };
    const kopie = eingefuegterKnoten(kopierbarerKnoten(original), 'n2', { nummer:7 });
    kopie.data.nested.q = 12;

    expect(kopie.data.nr).toBe(7);
    expect(original.data.nested.q).toBe(5);
  });
});
