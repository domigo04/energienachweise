import { describe, expect, it } from 'vitest';
import {
  BAND_TOLERANZ_FAKTOR,
  ERSATZ_HOEHE,
  anzahlAenderungen,
  baender,
  bandToleranz,
  inLeserichtung,
  neueNummern,
  typischeHoehe,
} from './nummerierung';

/** Bauteil mit Standardhöhe 40 — die Toleranz ist damit 20. */
const b = (id, x, y, hoehe = 40, nr = null) => ({ id, x, y, hoehe, nr });

const ids = (liste) => liste.map(item => item.id);

describe('typische Höhe', () => {
  it('nimmt den Median, nicht den Mittelwert', () => {
    // Ein Verteilerbalken über die halbe Zeichnung würde den Mittelwert so
    // hochziehen, dass danach alles in EIN Band fiele.
    expect(typischeHoehe([b('a', 0, 0, 40), b('b', 0, 0, 40), b('c', 0, 0, 4000)])).toBe(40);
  });

  it('mittelt bei gerader Anzahl die beiden inneren Werte', () => {
    expect(typischeHoehe([b('a', 0, 0, 20), b('b', 0, 0, 40)])).toBe(30);
  });

  it('ignoriert Bauteile ohne Höhe', () => {
    expect(typischeHoehe([b('a', 0, 0, 0), b('b', 0, 0, 50)])).toBe(50);
    expect(typischeHoehe([])).toBe(0);
  });
});

describe('Bandtoleranz', () => {
  it('ist der eingestellte Anteil der typischen Höhe', () => {
    expect(bandToleranz([b('a', 0, 0, 40)])).toBe(40 * BAND_TOLERANZ_FAKTOR);
  });

  it('lässt sich überschreiben', () => {
    expect(bandToleranz([b('a', 0, 0, 40)], 1)).toBe(40);
  });

  it('wird ohne gemessene Höhen nicht null', () => {
    // React Flow misst erst nach dem Zeichnen. Direkt nach dem Laden können
    // alle Höhen 0 sein — eine Toleranz von 0 würde dann jede Zeile in
    // Einzelbänder zerlegen. Genau das ist im Browsertest passiert.
    expect(bandToleranz([b('a', 0, 0, 0), b('b', 0, 0, 0)]))
      .toBe(ERSATZ_HOEHE * BAND_TOLERANZ_FAKTOR);
  });
});

describe('ohne gemessene Höhen', () => {
  it('hält eine leicht versetzte Zeile trotzdem zusammen', () => {
    // Der konkrete Fall aus dem Browsertest: vier Bauteile bei y 300/300/300/305.
    const ohneHoehe = [
      { id: 'pumpe', x: 1200, y: 300, hoehe: 0 },
      { id: 'absperr', x: 900, y: 305, hoehe: 0 },
      { id: 'speicher', x: 600, y: 300, hoehe: 0 },
      { id: 'erdsonden', x: 300, y: 300, hoehe: 0 },
    ];
    expect(ids(inLeserichtung(ohneHoehe)))
      .toEqual(['erdsonden', 'speicher', 'absperr', 'pumpe']);
  });
});

describe('Bänder', () => {
  it('fasst Bauteile auf gleicher Höhe zu einem Band zusammen', () => {
    const liste = [b('links', 0, 100), b('rechts', 500, 100)];
    expect(baender(liste, 20).map(ids)).toEqual([['links', 'rechts']]);
  });

  it('trennt Bauteile, die weiter als die Toleranz auseinander liegen', () => {
    const liste = [b('oben', 0, 0), b('unten', 0, 500)];
    expect(baender(liste, 20).map(ids)).toEqual([['oben'], ['unten']]);
  });

  it('misst die OBERKANTE, nicht die Mitte', () => {
    // Der Fall, an dem die erste Fassung im echten Schema gescheitert ist:
    // ein hohes Erdsondenfeld neben einer flachen Pumpe, beide auf derselben
    // Linie gesetzt. Nach der Mitte gebändert lägen sie 80 auseinander und die
    // Zeile zerfiele — nach der Oberkante stehen sie zusammen.
    const erdsonden = b('erdsonden', 300, 300, 200);
    const pumpe = b('pumpe', 1200, 300, 40);
    expect(baender([erdsonden, pumpe], 20).map(ids)).toEqual([['erdsonden', 'pumpe']]);
  });

  it('trennt zwei Etagen trotz sehr hoher Bauteile', () => {
    // Ein hohes Bauteil darf die Zeile darunter nicht an sich ziehen.
    const speicher = b('speicher', 300, 300, 200);
    const unten = b('unten', 300, 800, 40);
    expect(baender([speicher, unten], 20).map(ids)).toEqual([['speicher'], ['unten']]);
  });

  it('kettet nicht durch: der Bezug bleibt das oberste Bauteil des Bandes', () => {
    // Jeder Nachbar liegt nur 15 unter dem vorherigen, die Toleranz ist 20.
    // Mit fortgeschriebenem Bezug läge die ganze Treppe in einem Band.
    const treppe = [b('a', 0, 0), b('b', 0, 15), b('c', 0, 30), b('d', 0, 45)];
    expect(baender(treppe, 20).map(ids)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('nimmt genau auf der Toleranzgrenze noch dazu', () => {
    expect(baender([b('a', 0, 0), b('b', 0, 20)], 20).map(ids)).toEqual([['a', 'b']]);
    expect(baender([b('a', 0, 0), b('b', 0, 20.1)], 20).map(ids)).toEqual([['a'], ['b']]);
  });

  it('gibt für eine leere Liste keine Bänder zurück', () => {
    expect(baender([], 20)).toEqual([]);
  });
});

describe('Leserichtung', () => {
  it('ordnet innerhalb einer Zeile von links nach rechts', () => {
    const liste = [b('rechts', 900, 100), b('mitte', 500, 100), b('links', 100, 100)];
    expect(ids(inLeserichtung(liste))).toEqual(['links', 'mitte', 'rechts']);
  });

  it('arbeitet die obere Zeile vollständig ab, bevor die untere beginnt', () => {
    const liste = [
      b('unten-links', 100, 600), b('oben-rechts', 900, 100),
      b('unten-rechts', 900, 600), b('oben-links', 100, 100),
    ];
    expect(ids(inLeserichtung(liste)))
      .toEqual(['oben-links', 'oben-rechts', 'unten-links', 'unten-rechts']);
  });

  it('lässt geringe Höhenunterschiede innerhalb der Zeile nicht durchschlagen', () => {
    // Das eigentliche Akzeptanzkriterium: ein paar Millimeter Versatz dürfen
    // die Zeile nicht zerreissen.
    const liste = [b('links', 100, 100), b('rechts', 900, 103)];
    expect(ids(inLeserichtung(liste))).toEqual(['links', 'rechts']);
  });

  it('behält bei genau gleicher Lage die eingegebene Reihenfolge', () => {
    const liste = [b('zuerst', 100, 100), b('danach', 100, 100)];
    expect(ids(inLeserichtung(liste))).toEqual(['zuerst', 'danach']);
    expect(ids(inLeserichtung([...liste].reverse()))).toEqual(['danach', 'zuerst']);
  });

  it('kommt mit leerer und ungültiger Eingabe zurecht', () => {
    expect(inLeserichtung([])).toEqual([]);
    expect(inLeserichtung(null)).toEqual([]);
  });

  it('nimmt eine ausdrücklich gesetzte Toleranz statt der berechneten', () => {
    const liste = [b('oben', 900, 100), b('unten', 100, 160)];
    // Toleranz 0: zwei Bänder, oben zuerst — trotz weiter rechts.
    expect(ids(inLeserichtung(liste, { toleranz: 0 }))).toEqual(['oben', 'unten']);
    // Grosse Toleranz: ein Band, also nach x.
    expect(ids(inLeserichtung(liste, { toleranz: 500 }))).toEqual(['unten', 'oben']);
  });
});

describe('neue Nummern', () => {
  it('vergibt fortlaufend ab 1 in Leserichtung', () => {
    const liste = [b('rechts', 900, 100), b('links', 100, 100)];
    expect(neueNummern(liste)).toEqual([
      { id: 'links', nr: 1, vorher: null },
      { id: 'rechts', nr: 2, vorher: null },
    ]);
  });

  it('dreht die Nummern eines von rechts nach links gebauten Schemas um', () => {
    // Genau der Fall aus dem Issue: zuerst rechts gesetzt, also nr 1 rechts.
    const liste = [b('speicher', 900, 100, 40, 1), b('erdsonden', 100, 100, 40, 2)];
    expect(neueNummern(liste)).toEqual([
      { id: 'erdsonden', nr: 1, vorher: 2 },
      { id: 'speicher', nr: 2, vorher: 1 },
    ]);
  });

  it('merkt sich die bisherige Nummer', () => {
    expect(neueNummern([b('a', 0, 0, 40, 7)])[0].vorher).toBe(7);
  });
});

describe('Anzahl Änderungen', () => {
  it('zählt nur, was wirklich eine andere Nummer bekommt', () => {
    const schonRichtig = [b('links', 100, 100, 40, 1), b('rechts', 900, 100, 40, 2)];
    expect(anzahlAenderungen(neueNummern(schonRichtig))).toBe(0);

    const vertauscht = [b('links', 100, 100, 40, 2), b('rechts', 900, 100, 40, 1)];
    expect(anzahlAenderungen(neueNummern(vertauscht))).toBe(2);
  });

  it('zählt bisher unnummerierte Bauteile als Änderung', () => {
    expect(anzahlAenderungen(neueNummern([b('neu', 0, 0)]))).toBe(1);
  });
});
