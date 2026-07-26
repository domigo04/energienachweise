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

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/copy.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
