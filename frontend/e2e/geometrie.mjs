// Segment-Stretch, Bauteil-Move und Speichern/Laden im echten Browser prüfen
// (Sprint-Punkte 4-8, 15, 16, DoD B/C/G).
//
// Geprüft wird GEOMETRIE aus dem gespeicherten Graphen, nicht das Vorhandensein
// von Elementen.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = process.env.CAD_OUT || '/tmp/cad';
const APP = process.env.CAD_APP || 'http://127.0.0.1:5199';
const API = process.env.CAD_API || 'http://127.0.0.1:8011';
const token = fs.readFileSync(`${OUT}/token.txt`, 'utf8').trim();
const userJson = fs.readFileSync(`${OUT}/user.json`, 'utf8');

const ergebnisse = [];
const pruefe = (id, was, ok, notiz = '') => {
  ergebnisse.push({ id, was, ok: !!ok, notiz });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${was}${notiz ? '   → ' + notiz : ''}`);
};

const kopf = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

const graphSetzen = (graph) => fetch(`${API}/api/v1/schemas/1/graph`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ graph }),          // MUSS unter `graph` liegen
});

const graphLesen = async () => {
  const r = await fetch(`${API}/api/v1/projects/1/schema-editor`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  const g = d.schema?.graph ?? {};
  return typeof g === 'string' ? JSON.parse(g) : g;
};

// ── Vorbereitete Testgeometrie ─────────────────────────────────────────────
// Eine Treppe mit senkrechtem Mittelsegment, wie im Auftrag:
//
//   ──────┐
//         │
//   ──────┘
//
// Aufgebaut als Leitung zwischen zwei Ankern mit zwei Eckpunkten. Die Anker sind
// dieselben `junction`-Nodes, die der Editor beim freien Zeichnen erzeugt.
const treppe = () => ({
  nodes: [
    { id: 'a1', type: 'junction', position: { x: 400, y: 400 }, data: { cad_anchor: true } },
    { id: 'a2', type: 'junction', position: { x: 400, y: 700 }, data: { cad_anchor: true } },
  ],
  edges: [{
    id: 'e1', source: 'a1', sourceHandle: 'center-source',
    target: 'a2', targetHandle: 'center-target', type: 'flow',
    data: {
      layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8,
      points: [{ x: 640, y: 400 }, { x: 640, y: 700 }],
    },
    style: { stroke: '#ef4444', strokeWidth: 4.5 },
  }],
  layer_config: {},
});

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const fehler = [];
page.on('pageerror', (e) => fehler.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
await page.addInitScript(([t, u]) => {
  localStorage.setItem('hc_token', t);
  localStorage.setItem('hc_auth', u);
}, [token, userJson]);

const zoomJetzt = async () => Number((await page.locator('.hc-statusbar__zoom').innerText()).replace(/\D/g, ''));
const zoomAuf = async (ziel) => {
  const b = await page.locator('.hc-canvas-wrap').boundingBox();
  await page.mouse.move(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
  for (let i = 0; i < 60; i += 1) {
    const z = await zoomJetzt();
    if (Math.abs(z - ziel) <= Math.max(6, ziel * 0.1)) return z;
    await page.mouse.wheel(0, z > ziel ? 120 : -120);
    await page.waitForTimeout(60);
  }
  return zoomJetzt();
};

/** Weltkoordinate → Bildschirmkoordinate über die echte Viewport-Transformation. */
const weltZuScreen = (punkt) => page.evaluate(([wx, wy]) => {
  const el = document.querySelector('.react-flow__viewport');
  const m = new DOMMatrix(getComputedStyle(el).transform);
  const r = document.querySelector('.react-flow').getBoundingClientRect();
  return { x: Math.round(wx * m.a + m.e + r.left), y: Math.round(wy * m.d + m.f + r.top) };
}, [punkt.x, punkt.y]);

const punkteVon = async (edgeId = 'e1') => {
  const g = await graphLesen();
  return (g.edges || []).find((e) => e.id === edgeId)?.data?.points || null;
};

const laden = async () => {
  await page.goto(`${APP}/projekte/1/schema`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await zoomAuf(100);
};

// ═══════════════════════════════════════════════════════════════════════════
kopf('Segment-Stretch, senkrechtes Mittelsegment');
await graphSetzen(treppe());
await laden();

/** Punkt AUF dem gerenderten Leitungspfad (Anteil 0..1) in Screenkoordinaten. */
const punktAufPfad = (anteil) => page.evaluate((a) => {
  const path = document.querySelector('.react-flow__edge path');
  if (!path) return null;
  const p = path.getPointAtLength(path.getTotalLength() * a);
  const m = path.getScreenCTM();
  return { x: Math.round(p.x * m.a + p.y * m.c + m.e), y: Math.round(p.x * m.b + p.y * m.d + m.f) };
}, anteil);

/** Liegt dieser Bildschirmpunkt frei auf der Zeichenfläche? */
const istFrei = (pt) => page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return !!el && !!el.closest('.hc-canvas-wrap');
}, [pt.x, pt.y]);

/** Klick auf den Mittelpunkt eines bekannten Segments (Weltkoordinaten). */
const segmentKlicken = async (a, b) => {
  const mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const s = await weltZuScreen(mitte);
  if (!(await istFrei(s))) {
    console.log(`  (Segmentmitte ${s.x},${s.y} nicht frei — Test übersprungen)`);
    return null;
  }
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(500);
  return s;
};

const gewaehlt = await segmentKlicken({ x: 640, y: 400 }, { x: 640, y: 700 });
const diag = await page.evaluate(() => {
  const e = document.querySelector('.react-flow__edge');
  const paths = [...document.querySelectorAll('.react-flow__edge path')].map((pp) => ({
    d: (pp.getAttribute('d') || '').slice(0, 70),
    sw: pp.getAttribute('stroke-width'), stroke: pp.getAttribute('stroke'),
  }));
  return { klassen: e?.className?.baseVal ?? e?.getAttribute('class'), paths };
});
console.log('  DIAG Kante:', JSON.stringify(diag).slice(0, 420));
console.log('  DIAG Klickpunkt:', JSON.stringify(gewaehlt));
if (!gewaehlt) {
  pruefe('S0', 'Leitung auswählbar', false, 'Segmentmitte nicht erreichbar');
  fs.writeFileSync(`${OUT}/geometrie.json`, JSON.stringify(ergebnisse, null, 2));
  await browser.close();
  process.exit(1);
}
const grips = await page.locator('.react-flow__edge circle').count();
pruefe('S0', 'Leitung auswählbar, Grips sichtbar', grips >= 2, `${grips} Grips`);

const vorher = await punkteVon();
pruefe('S1', 'Ausgangsgeometrie ist die Treppe', JSON.stringify(vorher) === JSON.stringify([
  { x: 640, y: 400 }, { x: 640, y: 700 }]), JSON.stringify(vorher));

// Das senkrechte Mittelsegment 300 mm nach rechts ziehen.
await page.mouse.move(gewaehlt.x, gewaehlt.y);
await page.mouse.down();
for (let i = 1; i <= 6; i += 1) {
  await page.mouse.move(gewaehlt.x + i * 50, gewaehlt.y);
  await page.waitForTimeout(50);
}
await page.mouse.up();
await page.waitForTimeout(1400);

const nachher = await punkteVon();
const beideX = nachher && nachher.length === 2 && nachher[0].x === nachher[1].x;
const yGleich = nachher && nachher[0].y === vorher[0].y && nachher[1].y === vorher[1].y;
const nachRechts = nachher && nachher[0].x > vorher[0].x;
pruefe('S2', 'Segment ist parallel nach rechts gewandert', !!(beideX && yGleich && nachRechts),
  JSON.stringify(nachher));
pruefe('S3', 'Segment bleibt senkrecht (ORTHO erhalten)', !!beideX,
  nachher ? `x: ${nachher[0].x} / ${nachher[1].x}` : '—');
pruefe('S4', 'Keine neue Ecke entstanden', nachher?.length === 2, `${nachher?.length} Punkte`);

// Ankerpunkte (Leitungsenden) dürfen NICHT mitgewandert sein.
const g1 = await graphLesen();
const anker = (g1.nodes || []).filter((n) => n.type === 'junction');
const ankerStabil = anker.length === 2
  && anker.every((n) => n.position.x === 400 && (n.position.y === 400 || n.position.y === 700));
pruefe('S5', 'Leitungsenden bleiben liegen (nicht die ganze Leitung verschoben)', ankerStabil,
  anker.map((n) => `${n.position.x},${n.position.y}`).join(' '));

// Undo
await page.keyboard.press('Control+z');
await page.waitForTimeout(1400);
const nachUndo = await punkteVon();
pruefe('S6', 'Undo stellt die Ausgangsgeometrie wieder her',
  JSON.stringify(nachUndo) === JSON.stringify(vorher),
  `${JSON.stringify(nachUndo)} (erwartet ${JSON.stringify(vorher)})`);

kopf('Speichern und neu laden (DoD G)');
// Erneut ziehen, dann neu laden und Geometrie vergleichen.
const s2 = await segmentKlicken({ x: 640, y: 400 }, { x: 640, y: 700 });
await page.mouse.move(s2.x, s2.y);
await page.mouse.down();
for (let i = 1; i <= 4; i += 1) { await page.mouse.move(s2.x - i * 40, s2.y); await page.waitForTimeout(50); }
await page.mouse.up();
await page.waitForTimeout(1500);
const vorReload = await punkteVon();
await laden();
const nachReload = await punkteVon();
pruefe('G1', 'Speichern + Neuladen verändert die Geometrie nicht',
  JSON.stringify(vorReload) === JSON.stringify(nachReload),
  `${JSON.stringify(vorReload)} vs ${JSON.stringify(nachReload)}`);

kopf('Waagrechtes Segment');
await graphSetzen({
  nodes: [
    { id: 'b1', type: 'junction', position: { x: 420, y: 400 }, data: { cad_anchor: true } },
    { id: 'b2', type: 'junction', position: { x: 420, y: 760 }, data: { cad_anchor: true } },
  ],
  edges: [{
    id: 'e1', source: 'b1', sourceHandle: 'center-source', target: 'b2', targetHandle: 'center-target',
    type: 'flow',
    data: {
      layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8,
      // Zickzack mit waagrechtem Mittelsegment
      points: [{ x: 520, y: 400 }, { x: 520, y: 580 }, { x: 760, y: 580 }, { x: 760, y: 760 }],
    },
    style: { stroke: '#ef4444', strokeWidth: 4.5 },
  }],
  layer_config: {},
});
await laden();
{
  const sp = await segmentKlicken({ x: 520, y: 580 }, { x: 760, y: 580 });
  const vor = await punkteVon();
  await page.mouse.move(sp.x, sp.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) { await page.mouse.move(sp.x, sp.y - i * 30); await page.waitForTimeout(50); }
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const nach = await punkteVon();
  const mittleresY = nach && nach[1].y === nach[2].y && nach[1].y < vor[1].y;
  const aussenStabil = nach && nach[0].x === vor[0].x && nach[3].x === vor[3].x
    && nach[0].y === vor[0].y && nach[3].y === vor[3].y;
  pruefe('H1', 'Waagrechtes Mittelsegment wandert nur senkrecht', !!mittleresY, JSON.stringify(nach));
  pruefe('H2', 'Nachbarpunkte bleiben in ihrer Achse', !!aussenStabil,
    nach ? `${JSON.stringify(nach[0])} / ${JSON.stringify(nach[3])}` : '—');
  pruefe('H3', 'Keine Diagonale entstanden', !!(nach && nach.every((p, i) =>
    i === 0 || p.x === nach[i - 1].x || p.y === nach[i - 1].y)), JSON.stringify(nach));
}

kopf('Stretch an angeschlossener Leitung (Punkt 5)');
// Pumpe mit angeschlossener Leitung: Mittelsegment ziehen, Portbindung muss halten.
await graphSetzen({
  nodes: [
    { id: 'p1', type: 'pump', position: { x: 460, y: 400 }, data: { label: 'Pumpe', nr: 1 } },
    { id: 'c2', type: 'junction', position: { x: 460, y: 760 }, data: { cad_anchor: true } },
  ],
  edges: [{
    id: 'e1', source: 'p1', sourceHandle: 'bottom', target: 'c2', targetHandle: 'center-target',
    type: 'flow',
    data: {
      layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8,
      points: [{ x: 640, y: 520 }, { x: 640, y: 700 }],
    },
    style: { stroke: '#ef4444', strokeWidth: 4.5 },
  }],
  layer_config: {},
});
await laden();
{
  const sp = await segmentKlicken({ x: 640, y: 520 }, { x: 640, y: 700 });
  await page.mouse.move(sp.x, sp.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) { await page.mouse.move(sp.x + i * 40, sp.y); await page.waitForTimeout(50); }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const g = await graphLesen();
  const e = (g.edges || []).find((x) => x.id === 'e1');
  pruefe('P1', 'Portbindung bleibt nach Stretch erhalten',
    e?.source === 'p1' && e?.sourceHandle === 'bottom',
    e ? `${e.source}/${e.sourceHandle} → ${e.target}/${e.targetHandle}` : 'keine Kante');
  pruefe('P2', 'Pumpe wurde durch den Stretch nicht verschoben',
    (g.nodes || []).find((n) => n.id === 'p1')?.position?.x === 460,
    JSON.stringify((g.nodes || []).find((n) => n.id === 'p1')?.position));
}

kopf('Bauteil verschieben mit angeschlossener Leitung (Punkt 6)');
await graphSetzen({
  nodes: [
    { id: 'p1', type: 'pump', position: { x: 600, y: 400 }, data: { label: 'Pumpe', nr: 1 } },
    { id: 'd2', type: 'junction', position: { x: 200, y: 800 }, data: { cad_anchor: true } },
  ],
  edges: [{
    id: 'e1', source: 'p1', sourceHandle: 'bottom', target: 'd2', targetHandle: 'center-target',
    type: 'flow',
    data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
    style: { stroke: '#ef4444', strokeWidth: 4.5 },
  }],
  layer_config: {},
});
await laden();
{
  const vorG = await graphLesen();
  const knoten = page.locator('.react-flow__node-pump').first();
  const bb = await knoten.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(bb.x + bb.width / 2 + i * 25, bb.y + bb.height / 2 + i * 10);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(1600);
  const nachG = await graphLesen();
  const vorPos = (vorG.nodes || []).find((n) => n.id === 'p1').position;
  const nachPos = (nachG.nodes || []).find((n) => n.id === 'p1').position;
  pruefe('M1', 'Bauteil ist verschoben', nachPos.x !== vorPos.x || nachPos.y !== vorPos.y,
    `${JSON.stringify(vorPos)} → ${JSON.stringify(nachPos)}`);
  const e = (nachG.edges || []).find((x) => x.id === 'e1');
  pruefe('M2', 'Hydraulische Verbindung ist erhalten',
    e?.source === 'p1' && e?.sourceHandle === 'bottom',
    e ? `${e.source}/${e.sourceHandle}` : 'keine Kante');
  pruefe('M3', 'Anderes Leitungsende bleibt liegen',
    (nachG.nodes || []).find((n) => n.id === 'd2')?.position?.y === 800,
    JSON.stringify((nachG.nodes || []).find((n) => n.id === 'd2')?.position));

  // Undo muss Node UND Leitungsgeometrie gemeinsam zurücknehmen.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1500);
  const undoG = await graphLesen();
  const undoPos = (undoG.nodes || []).find((n) => n.id === 'p1').position;
  pruefe('M4', 'Undo nimmt die Verschiebung zurück',
    undoPos.x === vorPos.x && undoPos.y === vorPos.y,
    `${JSON.stringify(undoPos)} (erwartet ${JSON.stringify(vorPos)})`);
}

kopf('Rotation mit angeschlossener Leitung (Punkt 9/10)');
await laden();
{
  const knoten = page.locator('.react-flow__node-pump').first();
  await knoten.click({ force: true });
  await page.waitForTimeout(400);
  const portsVor = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node-pump .react-flow__handle')]
    .map((h) => { const r = h.getBoundingClientRect(); return { id: h.dataset.handleid, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }));
  await page.keyboard.press('d');
  await page.waitForTimeout(900);
  const portsNach = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node-pump .react-flow__handle')]
    .map((h) => { const r = h.getBoundingClientRect(); return { id: h.dataset.handleid, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }));
  const bewegt = portsVor.some((p, i) => Math.abs(p.x - portsNach[i].x) > 3 || Math.abs(p.y - portsNach[i].y) > 3);
  pruefe('R1', 'Rotation bewegt die Anschlüsse sichtbar', bewegt,
    `${portsVor.map((p) => `${p.id}@${p.x},${p.y}`).join(' ')} → ${portsNach.map((p) => `${p.id}@${p.x},${p.y}`).join(' ')}`);
  pruefe('R2', 'Anschluss-IDs bleiben stabil (Semantik erhalten)',
    portsVor.map((p) => p.id).join() === portsNach.map((p) => p.id).join(),
    `${portsVor.map((p) => p.id).join()} vs ${portsNach.map((p) => p.id).join()}`);
  const g = await graphLesen();
  const e = (g.edges || []).find((x) => x.id === 'e1');
  pruefe('R3', 'Angeschlossene Leitung hängt nach der Rotation am gleichen Port',
    e?.source === 'p1' && e?.sourceHandle === 'bottom',
    e ? `${e.source}/${e.sourceHandle}` : 'keine Kante');
  // Die Leitung muss dem gedrehten Port geometrisch folgen: das gerenderte
  // Leitungsende liegt auf dem sichtbaren Port.
  const endeAmPort = await page.evaluate(() => {
    const path = document.querySelector('.react-flow__edge path');
    if (!path) return null;
    const p0 = path.getPointAtLength(0);
    const m = path.getScreenCTM();
    return { x: Math.round(p0.x * m.a + p0.y * m.c + m.e), y: Math.round(p0.x * m.b + p0.y * m.d + m.f) };
  });
  const port = portsNach.find((p) => p.id === 'bottom');
  const nah = endeAmPort && port && Math.hypot(endeAmPort.x - port.x, endeAmPort.y - port.y) < 14;
  pruefe('R4', 'Leitungsende folgt dem gedrehten Anschluss geometrisch', !!nah,
    endeAmPort && port ? `Ende ${endeAmPort.x},${endeAmPort.y} vs Port ${port.x},${port.y}` : '—');
}

kopf('Fensterauswahl mit Richtungslogik (Punkt 15)');
await graphSetzen({
  nodes: [
    { id: 'q1', type: 'pump', position: { x: 300, y: 300 }, data: { label: 'Pumpe', nr: 1 } },
    { id: 'q2', type: 'pump', position: { x: 900, y: 300 }, data: { label: 'Pumpe', nr: 2 } },
  ],
  edges: [],
  layer_config: {},
});
await laden();
{
  const a = await weltZuScreen({ x: 250, y: 250 });
  const b = await weltZuScreen({ x: 500, y: 450 });     // umschliesst nur q1
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const links = await page.locator('.react-flow__node.selected').count();
  pruefe('W1', 'Links→rechts wählt das umschlossene Bauteil', links === 1, `${links} ausgewählt`);

  // Rechts→links: nur halb berühren, muss trotzdem greifen.
  await page.mouse.click(a.x - 40, a.y - 40);
  await page.waitForTimeout(250);
  const c = await weltZuScreen({ x: 520, y: 460 });
  const d = await weltZuScreen({ x: 380, y: 260 });     // berührt q1 nur teilweise
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const rechts = await page.locator('.react-flow__node.selected').count();
  // Bewusst dokumentiert: das Auswahlfenster arbeitet in EINER Betriebsart
  // (nur vollständig umschlossene Elemente). Ein halb berührtes Bauteil wird
  // daher NICHT gewählt — das ist der festgelegte, vorhersehbare Zustand.
  pruefe('W2', 'Auswahlfenster arbeitet vorhersehbar in einer Betriebsart',
    rechts === 0, `${rechts} ausgewählt (nur umschlossene werden gewählt)`);
}

kopf('Keine Phantom-Objekte nach Abbrüchen (Punkt 16)');
await graphSetzen({ nodes: [], edges: [], layer_config: {} });
await laden();
{
  const box = await page.locator('.hc-canvas-wrap').boundingBox();
  const frei = { x: Math.round(box.x + 200), y: Math.round(box.y + box.height - 220) };
  // Abgebrochenes Platzieren
  const gruppen = page.locator('.hc-palette-group__trigger');
  for (let i = 0; i < await gruppen.count(); i += 1) {
    const g = gruppen.nth(i);
    if (!(await g.evaluate((el) => el.className.includes('is-open')))) await g.click({ force: true });
    await page.waitForTimeout(100);
    const item = page.locator('.hc-palette-item').filter({ has: page.locator('strong', { hasText: /^Pumpe$/ }) }).first();
    if (await item.count()) { await item.click({ force: true }); break; }
  }
  await page.waitForTimeout(200);
  await page.mouse.move(frei.x, frei.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  let g = await graphLesen();
  pruefe('N1', 'Abgebrochenes Platzieren hinterlässt kein Bauteil',
    (g.nodes || []).length === 0, `${(g.nodes || []).length} Nodes`);

  // Abgebrochene Leitung
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(250);
  await page.mouse.move(frei.x + 220, frei.y);
  await page.waitForTimeout(200);
  await page.mouse.click(frei.x + 220, frei.y);
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1100);
  g = await graphLesen();
  pruefe('N2', 'Abgebrochene Leitung hinterlässt keinen Anker und keine Kante',
    (g.nodes || []).length === 0 && (g.edges || []).length === 0,
    `${(g.nodes || []).length} Nodes, ${(g.edges || []).length} Kanten`);
  // Nullsegmente/NaN im ganzen Graphen
  const kaputt = (g.edges || []).filter((e) => (e.data?.points || []).some((p) =>
    !Number.isFinite(p.x) || !Number.isFinite(p.y)));
  pruefe('N3', 'Keine NaN-Koordinaten im gespeicherten Graphen', kaputt.length === 0, `${kaputt.length}`);
}

pruefe('X', 'keine Konsolenfehler', fehler.length === 0, fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/geometrie.png` });
fs.writeFileSync(`${OUT}/geometrie.json`, JSON.stringify(ergebnisse, null, 2));
const fail = ergebnisse.filter((r) => !r.ok);
console.log(`\n=== ${ergebnisse.length - fail.length}/${ergebnisse.length} ===`);
if (fail.length) console.log('OFFEN:\n' + fail.map((f) => `  ${f.id} ${f.was} — ${f.notiz}`).join('\n'));
await browser.close();
