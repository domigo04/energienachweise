// Kopieren im echten Browser prüfen — Sprintpunkte 6-8.
//
// Der kritische Punkt ist Punkt 7: eine Kopie darf KEINE Geisterverbindung
// erben. Der Graph darf nach dem Kopieren keine Kante enthalten, die auf die
// Kopie zeigt, und keine, die auf einen nicht existierenden Anschluss verweist.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('copy');
const w = await starten();
const { page } = w;
const OUT = w.cfg.arbeitsordner;

kopf('Kopieren eines angeschlossenen Bauteils (Punkt 6/7)');

// Ausgangslage: WP ─── Pumpe. Die Pumpe hängt an einer Leitung.
await w.graphSetzen({
  nodes: [
    { id: 'p1', type: 'pump', position: { x: 560, y: 480 }, data: { label: 'Pumpe', nr: 1 } },
    { id: 'k1', type: 'junction', position: { x: 560, y: 280 }, data: { cad_anchor: true } },
  ],
  edges: [{
    id: 'e1', source: 'k1', sourceHandle: 'center-source', target: 'p1', targetHandle: 'top',
    type: 'flow',
    data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
    style: { stroke: '#ef4444', strokeWidth: 4.5 },
  }],
  layer_config: {},
});
await w.laden();

const vorher = await w.graphLesen();
pruefe('C0', 'Ausgangslage: eine Pumpe an einer Leitung',
  (vorher.nodes || []).length === 2 && (vorher.edges || []).length === 1,
  `${(vorher.nodes || []).length} Knoten, ${(vorher.edges || []).length} Kanten`);

// Auswählen und kopieren/einfügen (bestehende Tastenkombination).
await page.locator('.react-flow__node-pump').first().click({ force: true });
await page.waitForTimeout(350);
await page.keyboard.press('Control+c');
await page.waitForTimeout(250);
await page.keyboard.press('Control+v');
await page.waitForTimeout(1400);

const nachher = await w.graphLesen();
const pumpen = (nachher.nodes || []).filter((n) => n.type === 'pump');
pruefe('C1', 'Es gibt jetzt zwei Pumpen', pumpen.length === 2,
  pumpen.map((p) => p.id).join(', '));

const kopie = pumpen.find((p) => p.id !== 'p1');
pruefe('C2', 'Die Kopie hat eine eigene, neue Knoten-ID',
  !!kopie && kopie.id !== 'p1', kopie?.id || '—');

// ── Punkt 7: keine Geisterverbindung ───────────────────────────────────────
const kanten = nachher.edges || [];
pruefe('C3', 'Es ist keine zusätzliche Leitung entstanden', kanten.length === 1,
  `${kanten.length} Kanten: ${kanten.map((e) => `${e.source}/${e.sourceHandle}→${e.target}/${e.targetHandle}`).join(', ')}`);

const zeigtAufKopie = kopie
  ? kanten.filter((e) => e.source === kopie.id || e.target === kopie.id)
  : [];
pruefe('C4', 'Keine Leitung hängt an der Kopie', zeigtAufKopie.length === 0,
  zeigtAufKopie.map((e) => e.id).join(', ') || 'keine');

pruefe('C5', 'Die Leitung des Originals ist unverändert',
  kanten[0]?.target === 'p1' && kanten[0]?.targetHandle === 'top',
  `${kanten[0]?.target}/${kanten[0]?.targetHandle}`);

// Verwaiste Referenzen: jede Kante muss auf existierende Knoten zeigen.
const knotenIds = new Set((nachher.nodes || []).map((n) => n.id));
const verwaist = kanten.filter((e) => !knotenIds.has(e.source) || !knotenIds.has(e.target));
pruefe('C6', 'Keine Kante zeigt auf einen nicht existierenden Knoten',
  verwaist.length === 0, verwaist.map((e) => e.id).join(', ') || 'keine');

// ── Eigene Identität: Nummerierung und Eigenschaften ───────────────────────
pruefe('C7', 'Die Kopie hat eine eigene Bauteilnummer',
  !!kopie && kopie.data?.nr != null && kopie.data.nr !== vorher.nodes.find((n) => n.id === 'p1')?.data?.nr,
  `Original nr=${vorher.nodes.find((n) => n.id === 'p1')?.data?.nr}, Kopie nr=${kopie?.data?.nr}`);

pruefe('C8', 'Die Kopie liegt nicht exakt auf dem Original',
  !!kopie && (kopie.position.x !== 560 || kopie.position.y !== 480),
  JSON.stringify(kopie?.position));

// ── Die Anschlüsse der Kopie sind eigenständig fangbar ─────────────────────
{
  const ports = kopie ? await w.portsVon(kopie.id) : [];
  pruefe('C9', 'Die Kopie hat eigene Anschlüsse mit denselben Namen',
    ports.length >= 2, ports.map((p) => p.handleId).join(', '));
  if (ports.length) {
    const frei = await w.freieFlaeche();
    if (frei) {
      await w.leitungStarten(frei);
      await page.mouse.click(frei.x, frei.y);
      await page.waitForTimeout(240);
      const { sonde } = await w.zielen(ports[0]);
      pruefe('C10', 'Fang trifft den Anschluss der KOPIE, nicht des Originals',
        sonde?.typ === 'port' && sonde?.nodeId === kopie.id,
        `${sonde?.typ ?? '—'} an ${sonde?.nodeId ?? '—'} (Kopie ist ${kopie.id})`);
      await w.abbrechen();
    }
  }
}

// ── Persistenz ─────────────────────────────────────────────────────────────
{
  await w.laden();
  const g = await w.graphLesen();
  pruefe('C11', 'Nach Neuladen sind beide Pumpen und genau eine Leitung vorhanden',
    (g.nodes || []).filter((n) => n.type === 'pump').length === 2 && (g.edges || []).length === 1,
    `${(g.nodes || []).filter((n) => n.type === 'pump').length} Pumpen, ${(g.edges || []).length} Kanten`);
}

// ── Leitungen vervielfältigen: Basispunkt → Zielpunkt (§74) ────────────────
//
// Der eigentliche Zweck von #74: eine LEITUNG lässt sich mit denselben
// Befehlen kopieren wie ein Bauteil. Geprüft wird dasselbe wie oben — neue
// IDs, eigene Anker, keine Geisterverbindung — nur eben an einer Leitung.

/** Ein zusammenhängendes Bild aus zwei Leitungen und einem freien Anker. */
const leitungsBild = async () => {
  await w.graphSetzen({
    nodes: [
      { id: 'a1', type: 'junction', position: { x: 300, y: 300 }, data: { cad_anchor: true } },
      { id: 'a2', type: 'junction', position: { x: 700, y: 300 }, data: { cad_anchor: true } },
    ],
    edges: [{
      id: 'l1', source: 'a1', sourceHandle: 'center-source', target: 'a2', targetHandle: 'center-target',
      type: 'flow',
      data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
      style: { stroke: '#ef4444', strokeWidth: 4.5 },
    }],
    layer_config: {},
  });
  await w.laden();
};

/** Zustand des Graphen mit den üblichen Kennzahlen. */
const bild = async () => {
  const g = await w.graphLesen();
  const nodes = g.nodes || [];
  const edges = g.edges || [];
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes, edges, ids,
    doppelt: [...nodes.map((n) => n.id), ...edges.map((e) => e.id)]
      .filter((id, i, alle) => alle.indexOf(id) !== i),
    verwaist: edges.filter((e) => !ids.has(e.source) || !ids.has(e.target)),
    freieAnker: nodes.filter((n) => n.type === 'junction'
      && !edges.some((e) => e.source === n.id || e.target === n.id)),
  };
};

/** Welt-Punkt anklicken, wenn er frei auf der Zeichenfläche liegt. */
const klickWelt = async (punkt, warten = 500) => {
  const s = await w.weltZuScreen(punkt);
  if (!(await w.istFrei(s))) return false;
  await page.mouse.move(s.x, s.y);
  await page.waitForTimeout(160);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(warten);
  return true;
};

kopf('Leitung kopieren über Basispunkt und Zielpunkt (§74)');
{
  await leitungsBild();
  // Leitung wählen (Klick auf die Mitte), dann Kopieren mit Shift = ganze Leitung.
  await w.segmentKlicken({ x: 300, y: 300 }, { x: 700, y: 300 });
  await page.keyboard.press('Shift+C');
  await page.waitForTimeout(300);
  const gestartet = await page.locator('.hc-toolrail__button[data-werkzeug="kopieren-basis"][aria-pressed="true"]').count();
  pruefe('K0', 'Kopieren-Befehl ist aktiv', gestartet === 1, `${gestartet} aktive Knöpfe`);

  // Basispunkt auf das linke Leitungsende, Zielpunkt 200 tiefer.
  await klickWelt({ x: 300, y: 300 });
  await klickWelt({ x: 300, y: 500 });

  const nach = await bild();
  pruefe('K1', 'Es gibt jetzt zwei Leitungen', nach.edges.length === 2,
    `${nach.edges.length} Kanten`);
  const kopie = nach.edges.find((e) => e.id !== 'l1');
  pruefe('K2', 'Die Kopie hat eine eigene Leitungs-ID', !!kopie && kopie.id !== 'l1',
    kopie?.id || '—');
  pruefe('K3', 'Die Kopie hat eigene Anker — nicht die des Originals',
    !!kopie && kopie.source !== 'a1' && kopie.target !== 'a1'
    && kopie.source !== 'a2' && kopie.target !== 'a2',
    `${kopie?.source} → ${kopie?.target}`);
  pruefe('K4', 'Keine doppelten IDs im Graphen', nach.doppelt.length === 0,
    nach.doppelt.join(', ') || 'keine');
  pruefe('K5', 'Keine Kante zeigt auf einen nicht existierenden Knoten',
    nach.verwaist.length === 0, nach.verwaist.map((e) => e.id).join(', ') || 'keine');
  pruefe('K6', 'Keine verwaisten Anker ohne Leitung', nach.freieAnker.length === 0,
    nach.freieAnker.map((n) => n.id).join(', ') || 'keine');
  const original = nach.edges.find((e) => e.id === 'l1');
  pruefe('K7', 'Das Original hängt unverändert an seinen Ankern',
    original?.source === 'a1' && original?.target === 'a2',
    `${original?.source} → ${original?.target}`);
}

kopf('Mehrfachkopie bleibt aktiv, bis abgebrochen wird (§74)');
{
  // Ohne Neustart des Befehls: zwei weitere Klicks = zwei weitere Kopien.
  await klickWelt({ x: 300, y: 600 });
  await klickWelt({ x: 300, y: 700 });
  const nach = await bild();
  pruefe('M1', 'Weitere Klicks erzeugen weitere Kopien', nach.edges.length === 4,
    `${nach.edges.length} Kanten`);
  pruefe('M2', 'Auch die weiteren Kopien haben eigene IDs', nach.doppelt.length === 0,
    nach.doppelt.join(', ') || 'keine');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await klickWelt({ x: 300, y: 800 });
  const danach = await bild();
  pruefe('M3', 'Nach ESC erzeugt ein Klick keine Kopie mehr',
    danach.edges.length === 4, `${danach.edges.length} Kanten`);
}

kopf('Undo: eine Kopie ist genau ein Schritt (§74)');
{
  const vorher = (await bild()).edges.length;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(700);
  const nach = (await bild()).edges.length;
  pruefe('U1', 'Ein Undo nimmt genau eine Kopie zurück', nach === vorher - 1,
    `${vorher} → ${nach} Kanten`);
}

kopf('Spiegeln über zwei Achspunkte (§74)');
{
  await leitungsBild();
  await w.segmentKlicken({ x: 300, y: 300 }, { x: 700, y: 300 });
  await page.keyboard.press('Shift+S');
  await page.waitForTimeout(300);
  // Waagrechte Achse bei y = 500 → die Leitung landet bei y = 700.
  await klickWelt({ x: 200, y: 500 });
  await klickWelt({ x: 900, y: 500 });
  await page.keyboard.press('j');          // Original behalten
  await page.waitForTimeout(800);

  const nach = await bild();
  pruefe('S1', 'Original und Spiegelbild sind vorhanden', nach.edges.length === 2,
    `${nach.edges.length} Kanten`);
  const kopie = nach.edges.find((e) => e.id !== 'l1');
  const ankerVon = (id) => nach.nodes.find((n) => n.id === id);
  const spiegelStart = kopie ? ankerVon(kopie.source) : null;
  pruefe('S2', 'Das Spiegelbild liegt auf der gespiegelten Höhe',
    !!spiegelStart && Math.abs(spiegelStart.position.y - 700) < 1,
    `y = ${spiegelStart?.position?.y}`);
  pruefe('S3', 'Das Spiegelbild hat eigene Anker und keine Geisterverbindung',
    !!kopie && !['a1', 'a2'].includes(kopie.source) && !['a1', 'a2'].includes(kopie.target),
    `${kopie?.source} → ${kopie?.target}`);
  pruefe('S4', 'Keine doppelten IDs, keine verwaisten Anker',
    nach.doppelt.length === 0 && nach.verwaist.length === 0 && nach.freieAnker.length === 0,
    `${nach.doppelt.length} doppelt, ${nach.verwaist.length} verwaist, ${nach.freieAnker.length} frei`);
}

kopf('Drehen um einen getippten Winkel (§74)');
{
  await leitungsBild();
  await w.segmentKlicken({ x: 300, y: 300 }, { x: 700, y: 300 });
  await page.keyboard.press('Shift+D');
  await page.waitForTimeout(300);
  await klickWelt({ x: 300, y: 300 });     // Basispunkt = linkes Ende
  await page.keyboard.type('90');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);

  const nach = await bild();
  pruefe('D1', 'Es ist keine zusätzliche Leitung entstanden', nach.edges.length === 1,
    `${nach.edges.length} Kanten`);
  const ende = nach.nodes.find((n) => n.id === 'a2');
  pruefe('D2', 'Das freie Ende ist um 90° um den Basispunkt gewandert',
    !!ende && Math.abs(ende.position.x - 300) < 1 && Math.abs(ende.position.y - 700) < 1,
    `${ende?.position?.x} / ${ende?.position?.y}`);
  const basis = nach.nodes.find((n) => n.id === 'a1');
  pruefe('D3', 'Der Basispunkt selbst bleibt liegen',
    !!basis && Math.abs(basis.position.x - 300) < 1 && Math.abs(basis.position.y - 300) < 1,
    `${basis?.position?.x} / ${basis?.position?.y}`);
  pruefe('D4', 'Die Leitung behält ihre ID und ihre Anker',
    nach.edges[0]?.id === 'l1' && nach.edges[0]?.source === 'a1' && nach.edges[0]?.target === 'a2',
    `${nach.edges[0]?.id}: ${nach.edges[0]?.source} → ${nach.edges[0]?.target}`);
}

kopf('Lineare Reihe (§74)');
{
  await leitungsBild();
  await w.segmentKlicken({ x: 300, y: 300 }, { x: 700, y: 300 });
  await page.keyboard.press('Shift+E');
  await page.waitForTimeout(300);
  await klickWelt({ x: 300, y: 300 });     // Basispunkt
  await klickWelt({ x: 300, y: 400 });     // Abstand = 100 nach unten
  await page.keyboard.press('Backspace');  // vorgeschlagene 3 löschen
  await page.keyboard.type('4');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);

  const nach = await bild();
  pruefe('R1', 'Vier Leitungen inklusive Original', nach.edges.length === 4,
    `${nach.edges.length} Kanten`);
  pruefe('R2', 'Keine doppelten IDs, keine verwaisten Anker',
    nach.doppelt.length === 0 && nach.verwaist.length === 0 && nach.freieAnker.length === 0,
    `${nach.doppelt.length} doppelt, ${nach.verwaist.length} verwaist, ${nach.freieAnker.length} frei`);
  const hoehen = nach.nodes.filter((n) => n.type === 'junction')
    .map((n) => n.position.y).sort((a, b) => a - b);
  pruefe('R3', 'Die Kopien stehen in gleichen Abständen',
    [...new Set(hoehen)].join(',') === '300,400,500,600',
    [...new Set(hoehen)].join(', '));
}

kopf('Persistenz der neuen Befehle');
{
  await w.laden();
  const nach = await bild();
  pruefe('P1', 'Nach Neuladen sind alle vier Leitungen noch da', nach.edges.length === 4,
    `${nach.edges.length} Kanten`);
  pruefe('P2', 'Nach Neuladen keine verwaisten Referenzen',
    nach.verwaist.length === 0 && nach.doppelt.length === 0,
    `${nach.verwaist.length} verwaist, ${nach.doppelt.length} doppelt`);
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/copy.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
