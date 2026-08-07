import { describe, expect, it } from 'vitest';
import {
  achsWinkel, anzahlAusBuffer, bauteilLage, bauteilPosition, drehung, kopierPlan,
  punktGedreht, punktGespiegelt, punktVerschoben, reihenAbbildungen, reihenVersaetze,
  routeAbgebildet, spiegelung, verschiebung, viertelWinkel, winkelAusBuffer,
  winkelNormiert, winkelZwischen,
} from './cadTransform';
import { leitungVerschieben } from './cadEdit';

// Eine Beispielroute in L-Form: waagrecht, dann senkrecht nach unten.
const L_ROUTE = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }];

// Zähler für vorhersagbare IDs im Bauplan-Test.
const idFabrik = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

describe('Winkel', () => {
  it('normiert auf 0 bis unter 360', () => {
    expect(winkelNormiert(0)).toBe(0);
    expect(winkelNormiert(370)).toBe(10);
    expect(winkelNormiert(-90)).toBe(270);
    expect(winkelNormiert(360)).toBe(0);
  });

  it('rastet die Bauteillage auf den nächsten Viertelkreis', () => {
    expect(viertelWinkel(0)).toBe(0);
    expect(viertelWinkel(89)).toBe(90);
    expect(viertelWinkel(91)).toBe(90);
    expect(viertelWinkel(350)).toBe(0);
    expect(viertelWinkel(-90)).toBe(270);
  });

  it('misst die Achsrichtung im Bildschirmsinn (y nach unten)', () => {
    expect(achsWinkel({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(0);
    expect(achsWinkel({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(90);
    expect(winkelZwischen({ x: 0, y: 0 }, { x: -100, y: 0 })).toBe(180);
    expect(winkelZwischen({ x: 0, y: 0 }, { x: 0, y: -100 })).toBe(270);
  });
});

describe('Verschieben', () => {
  it('versetzt einen Punkt um den Vektor', () => {
    expect(punktVerschoben({ x: 10, y: 20 }, { x: 5, y: -5 })).toEqual({ x: 15, y: 15 });
  });

  it('verschiebt eine ganze Route mit freien Enden', () => {
    const ergebnis = routeAbgebildet(L_ROUTE, verschiebung({ x: 100, y: 50 }),
      { startFrei: true, endFrei: true });
    expect(ergebnis.points).toEqual([{ x: 400, y: 50 }]);
    expect(ergebnis.start).toEqual({ x: 100, y: 50 });
    expect(ergebnis.end).toEqual({ x: 400, y: 250 });
  });

  it('lässt ein festes Ende stehen und setzt dort einen Stützpunkt', () => {
    // Genau die Regel, die verhindert, dass die Geometrie die Hydraulik
    // zerreisst: der Anschluss bleibt, die Leitung führt neu dorthin.
    const ergebnis = routeAbgebildet(L_ROUTE, verschiebung({ x: 100, y: 0 }));
    expect(ergebnis.start).toBeNull();
    expect(ergebnis.end).toBeNull();
    expect(ergebnis.points).toEqual([{ x: 100, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }]);
  });

  it('ist dieselbe Rechnung wie `leitungVerschieben`', () => {
    const delta = { x: 40, y: -25 };
    expect(leitungVerschieben(L_ROUTE, delta, { startFrei: true }))
      .toEqual(routeAbgebildet(L_ROUTE, verschiebung(delta), { startFrei: true }));
  });

  it('lässt die Bauteillage unangetastet', () => {
    expect(bauteilLage({ rotation: 90, mirrored: true }, verschiebung({ x: 5, y: 5 })))
      .toEqual({ rotation: 90, mirrored: true });
  });
});

describe('Spiegeln', () => {
  const senkrecht = { a: { x: 100, y: 0 }, b: { x: 100, y: 500 } };
  const waagrecht = { a: { x: 0, y: 100 }, b: { x: 500, y: 100 } };

  it('spiegelt exakt an einer senkrechten Achse', () => {
    expect(punktGespiegelt({ x: 40, y: 30 }, senkrecht.a, senkrecht.b)).toEqual({ x: 160, y: 30 });
  });

  it('spiegelt exakt an einer waagrechten Achse', () => {
    expect(punktGespiegelt({ x: 40, y: 30 }, waagrecht.a, waagrecht.b)).toEqual({ x: 40, y: 170 });
  });

  it('spiegelt an einer schrägen Achse (45°) durch den Ursprung', () => {
    // An der Winkelhalbierenden werden x und y vertauscht.
    const punkt = punktGespiegelt({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 100 });
    expect(punkt.x).toBeCloseTo(0, 9);
    expect(punkt.y).toBeCloseTo(10, 9);
  });

  it('lässt einen Punkt liegen, wenn die Achse keine Länge hat', () => {
    expect(punktGespiegelt({ x: 7, y: 9 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 7, y: 9 });
  });

  it('zweimal gespiegelt ergibt exakt das Original', () => {
    const abbildung = spiegelung(senkrecht.a, senkrecht.b);
    expect(L_ROUTE.map(abbildung.punkt).map(abbildung.punkt)).toEqual(L_ROUTE);
  });

  it('klappt ein Bauteil an einer senkrechten Achse waagrecht um', () => {
    // Dasselbe Ergebnis wie der bestehende Knopf «Bauteil spiegeln».
    expect(bauteilLage({ rotation: 0, mirrored: false }, spiegelung(senkrecht.a, senkrecht.b)))
      .toEqual({ rotation: 0, mirrored: true });
  });

  it('klappt ein Bauteil an einer waagrechten Achse senkrecht um', () => {
    expect(bauteilLage({ rotation: 0, mirrored: false }, spiegelung(waagrecht.a, waagrecht.b)))
      .toEqual({ rotation: 180, mirrored: true });
  });

  it('spiegelt ein Bauteil um seine Mitte, nicht um seine linke obere Ecke', () => {
    // Bauteil 40 breit, Mitte bei x = 120, Achse bei x = 100 → Mitte auf 80,
    // linke obere Ecke also auf 60.
    expect(bauteilPosition({ x: 100, y: 200 }, { width: 40, height: 20 },
      spiegelung(senkrecht.a, senkrecht.b))).toEqual({ x: 60, y: 200 });
  });

  it('lässt Text- und Beschriftungsblöcke aufrecht stehen', () => {
    // Ein Textblock ist nicht drehbar: er wandert nur an seinen neuen Platz,
    // sonst stünde er seitenverkehrt und wäre nicht mehr lesbar.
    expect(bauteilLage({ rotation: 0, mirrored: false },
      spiegelung(waagrecht.a, waagrecht.b), { drehbar: false }))
      .toEqual({ rotation: 0, mirrored: false });
  });
});

describe('Drehen', () => {
  it('dreht exakt um 90° im Uhrzeigersinn (Bildschirmsinn)', () => {
    expect(punktGedreht({ x: 100, y: 0 }, { x: 0, y: 0 }, 90)).toEqual({ x: 0, y: 100 });
  });

  it('dreht exakt um 180° und 270° ohne Rundungsrest', () => {
    expect(punktGedreht({ x: 100, y: 0 }, { x: 0, y: 0 }, 180)).toEqual({ x: -100, y: 0 });
    expect(punktGedreht({ x: 100, y: 0 }, { x: 0, y: 0 }, 270)).toEqual({ x: 0, y: -100 });
  });

  it('viermal 90° ergibt exakt die Ausgangsgeometrie', () => {
    // Ohne exakte Viertelwerte läge die Route nach dem Speichern um
    // Bruchteile daneben — genau das darf nicht passieren.
    const abbildung = drehung({ x: 300, y: 200 }, 90);
    let route = L_ROUTE;
    for (let i = 0; i < 4; i += 1) route = route.map(abbildung.punkt);
    expect(route).toEqual(L_ROUTE);
  });

  it('dreht auch um einen freien Winkel', () => {
    const punkt = punktGedreht({ x: 100, y: 0 }, { x: 0, y: 0 }, 45);
    expect(punkt.x).toBeCloseTo(70.7106, 3);
    expect(punkt.y).toBeCloseTo(70.7106, 3);
  });

  it('dreht um den Basispunkt, nicht um den Ursprung', () => {
    expect(punktGedreht({ x: 150, y: 100 }, { x: 100, y: 100 }, 90)).toEqual({ x: 100, y: 150 });
  });

  it('zählt den Winkel zur Bauteillage dazu und rastet auf Viertelkreise', () => {
    expect(bauteilLage({ rotation: 90 }, drehung({ x: 0, y: 0 }, 90)))
      .toEqual({ rotation: 180, mirrored: false });
    expect(bauteilLage({ rotation: 0 }, drehung({ x: 0, y: 0 }, 45)))
      .toEqual({ rotation: 90, mirrored: false });
  });

  it('behält den Spiegelzustand eines Bauteils', () => {
    expect(bauteilLage({ rotation: 0, mirrored: true }, drehung({ x: 0, y: 0 }, 90)).mirrored)
      .toBe(true);
  });
});

describe('Lineare Reihe', () => {
  it('zählt das Original mit: drei Stück ergeben zwei Kopien', () => {
    expect(reihenVersaetze(3, { x: 100, y: 0 }))
      .toEqual([{ x: 100, y: 0 }, { x: 200, y: 0 }]);
  });

  it('reiht auch schräg', () => {
    expect(reihenVersaetze(3, { x: 50, y: -20 }))
      .toEqual([{ x: 50, y: -20 }, { x: 100, y: -40 }]);
  });

  it('erzeugt ohne Abstand oder unter zwei Stück keine Reihe', () => {
    expect(reihenVersaetze(3, { x: 0, y: 0 })).toEqual([]);
    expect(reihenVersaetze(1, { x: 100, y: 0 })).toEqual([]);
    expect(reihenVersaetze(0, { x: 100, y: 0 })).toEqual([]);
  });

  it('liefert je Kopie eine Abbildung', () => {
    const abbildungen = reihenAbbildungen(4, { x: 10, y: 0 });
    expect(abbildungen).toHaveLength(3);
    expect(abbildungen[2].punkt({ x: 0, y: 0 })).toEqual({ x: 30, y: 0 });
  });
});

describe('Eingaben', () => {
  it('nimmt einen getippten Winkel entgegen', () => {
    expect(winkelAusBuffer('90')).toBe(90);
    expect(winkelAusBuffer('450')).toBe(90);
    expect(winkelAusBuffer('22.5')).toBe(22.5);
    expect(winkelAusBuffer('')).toBeNull();
    expect(winkelAusBuffer('12.')).toBe(12);
  });

  it('nimmt eine getippte Anzahl ab zwei entgegen', () => {
    expect(anzahlAusBuffer('3')).toBe(3);
    expect(anzahlAusBuffer('1')).toBeNull();
    expect(anzahlAusBuffer('')).toBeNull();
  });
});

describe('Bauplan einer Kopie', () => {
  // Ausgangslage: eine Pumpe, an der eine Leitung hängt, plus eine zweite
  // Leitung, deren beide Enden an fremden Bauteilen hängen.
  const snapshot = {
    nodes: [{
      id: 'p1', type: 'pump', position: { x: 100, y: 100 },
      groesse: { width: 40, height: 40 }, data: { nr: 1 },
    }],
    routes: [
      { edge: { id: 'e1' }, whole: true, sourceRef: null, targetRef: 'p1',
        route: [{ x: 0, y: 120 }, { x: 100, y: 120 }] },
      { edge: { id: 'e2' }, whole: true, sourceRef: null, targetRef: null,
        route: [{ x: 0, y: 300 }, { x: 200, y: 300 }] },
    ],
  };
  const optionen = () => ({
    neueId: idFabrik(),
    ersteNummer: 7,
    nummeriert: node => node.type === 'pump',
    drehbar: node => node.type === 'pump',
  });

  it('gibt jedem Bauteil, jeder Leitung und jedem Anker eine eigene neue ID', () => {
    const plan = kopierPlan(snapshot, [verschiebung({ x: 500, y: 0 })], optionen());
    const alle = [...plan.nodes, ...plan.edges, ...plan.anker].map(item => item.id);
    expect(new Set(alle).size).toBe(alle.length);
    // Keine ID stammt aus dem Original.
    expect(alle.some(id => ['p1', 'e1', 'e2'].includes(id))).toBe(false);
  });

  it('hängt kein Leitungsende am Original — keine Geisterverbindung', () => {
    const plan = kopierPlan(snapshot, [verschiebung({ x: 500, y: 0 })], optionen());
    const original = new Set(['p1', 'e1', 'e2']);
    plan.edges.forEach(edge => {
      expect(original.has(edge.source)).toBe(false);
      expect(original.has(edge.target)).toBe(false);
    });
  });

  it('lässt keinen Anker verwaisen und kein Leitungsende ins Leere zeigen', () => {
    const plan = kopierPlan(snapshot, [verschiebung({ x: 500, y: 0 })], optionen());
    const vorhanden = new Set([...plan.nodes, ...plan.anker].map(item => item.id));
    plan.edges.forEach(edge => {
      expect(vorhanden.has(edge.source)).toBe(true);
      expect(vorhanden.has(edge.target)).toBe(true);
    });
    const benutzt = new Set(plan.edges.flatMap(edge => [edge.source, edge.target]));
    plan.anker.forEach(eintrag => expect(benutzt.has(eintrag.id)).toBe(true));
  });

  it('hängt das Ende am MITKOPIERTEN Bauteil, alle übrigen an eigenen Ankern', () => {
    const plan = kopierPlan(snapshot, [verschiebung({ x: 500, y: 0 })], optionen());
    const kopiertePumpe = plan.nodes[0].id;
    const [ersteLeitung, zweiteLeitung] = plan.edges;
    expect(ersteLeitung.target).toBe(kopiertePumpe);
    expect(ersteLeitung.eigenerTarget).toBe(false);
    expect(ersteLeitung.eigenerSource).toBe(true);
    expect(zweiteLeitung.eigenerSource).toBe(true);
    expect(zweiteLeitung.eigenerTarget).toBe(true);
    // Drei eigene Anker: e1-Start, e2-Start und e2-Ende.
    expect(plan.anker).toHaveLength(3);
  });

  it('setzt die Anker genau auf die abgebildeten Leitungsenden', () => {
    const plan = kopierPlan(snapshot, [verschiebung({ x: 500, y: 0 })], optionen());
    expect(plan.anker[0].punkt).toEqual({ x: 500, y: 120 });
    expect(plan.anker[1].punkt).toEqual({ x: 500, y: 300 });
    expect(plan.anker[2].punkt).toEqual({ x: 700, y: 300 });
  });

  it('vergibt fortlaufende freie Nummern über alle Kopien einer Reihe', () => {
    const plan = kopierPlan(snapshot, reihenAbbildungen(4, { x: 300, y: 0 }), optionen());
    expect(plan.nodes.map(node => node.nr)).toEqual([7, 8, 9]);
  });

  it('trennt die Kopien einer Reihe voneinander', () => {
    // Kopie 2 darf nie an den Bauteilen von Kopie 1 hängen.
    const plan = kopierPlan(snapshot, reihenAbbildungen(3, { x: 300, y: 0 }), optionen());
    expect(plan.nodes).toHaveLength(2);
    expect(plan.edges).toHaveLength(4);
    expect(plan.edges[0].target).toBe(plan.nodes[0].id);
    expect(plan.edges[2].target).toBe(plan.nodes[1].id);
    expect(plan.edges[0].target).not.toBe(plan.edges[2].target);
  });

  it('bildet Bauteilposition und Route mit derselben Abbildung ab', () => {
    const plan = kopierPlan(snapshot, [spiegelung({ x: 400, y: 0 }, { x: 400, y: 500 })], optionen());
    // Pumpenmitte 120 → 680, linke obere Ecke also 660.
    expect(plan.nodes[0].position).toEqual({ x: 660, y: 100 });
    expect(plan.nodes[0].mirrored).toBe(true);
    expect(plan.edges[0].route).toEqual([{ x: 800, y: 120 }, { x: 700, y: 120 }]);
  });

  it('gibt ohne Auswahl oder ohne Abbildung einen leeren Plan zurück', () => {
    expect(kopierPlan(null, [verschiebung({ x: 1, y: 1 })], optionen()))
      .toEqual({ nodes: [], edges: [], anker: [] });
    expect(kopierPlan(snapshot, [], optionen()))
      .toEqual({ nodes: [], edges: [], anker: [] });
    expect(kopierPlan(snapshot, [verschiebung({ x: 1, y: 1 })], {}))
      .toEqual({ nodes: [], edges: [], anker: [] });
  });
});
