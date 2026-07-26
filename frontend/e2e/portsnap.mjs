// Port-Snap systematisch prüfen (Sprint-Punkt 1-3).
//
// Die Prüfung ist NICHT „Marker existiert", sondern die Vierfach-Identität:
//
//   sichtbarer Marker == gewählter Fang == gesetzter Endpunkt == gespeicherter Port
//
// Jeder Fall bewegt die Maus auf die BEKANNTE Bildschirmposition eines Ports,
// liest die Fangentscheidung aus der Prüfsonde (`window.__hcSnap`), klickt und
// vergleicht danach den gespeicherten Graphen.
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

const graphLeeren = () => fetch(`${API}/api/v1/schemas/1/graph`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  // Achtung: der Endpunkt erwartet den Graphen UNTER `graph`. Flach gesendet
  // antwortet er 200, löscht aber nichts — eine stille Falle.
  body: JSON.stringify({ graph: { nodes: [], edges: [] } }),
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

// ── Hilfsfunktionen ────────────────────────────────────────────────────────
const status = async () => (await page.locator('.hc-statusbar').innerText())
  .replace(/\n?\d+ mm(?=\n|$)/g, '').replace(/\n+/g, ' | ');

const zoomJetzt = async () => Number((await page.locator('.hc-statusbar__zoom').innerText()).replace(/\D/g, ''));

const zoomAuf = async (ziel) => {
  const b = await page.locator('.hc-canvas-wrap').boundingBox();
  const cx = Math.round(b.x + b.width / 2);
  const cy = Math.round(b.y + b.height / 2);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 60; i += 1) {
    const z = await zoomJetzt();
    if (Math.abs(z - ziel) <= Math.max(6, ziel * 0.1)) return z;
    await page.mouse.wheel(0, z > ziel ? 120 : -120);
    await page.waitForTimeout(60);
  }
  return zoomJetzt();
};

/** Alle Handle-Mittelpunkte eines Nodes in SCREEN-Koordinaten. */
const portsVon = (nodeId) => page.evaluate((id) => {
  const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
  if (!node) return [];
  return [...node.querySelectorAll('.react-flow__handle')].map((h) => {
    const r = h.getBoundingClientRect();
    return {
      handleId: h.dataset.handleid || null,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });
}, nodeId);

const nodeIds = () => page.evaluate(() =>
  [...document.querySelectorAll('.react-flow__node')].map((n) => n.dataset.id));

/** Nur echte Bauteile eines Typs (nicht die unsichtbaren Leitungsanker). */
const bauteilIds = (typ) => page.evaluate((t) =>
  [...document.querySelectorAll(`.react-flow__node-${t}`)].map((n) => n.dataset.id), typ);

const snapSonde = () => page.evaluate(() => window.__hcSnap || null);

/** Der im SVG gezeichnete Marker: Position aus dem gerenderten Element. */
const markerAusSvg = () => page.evaluate(() => {
  const texte = [...document.querySelectorAll('.react-flow__viewport text')]
    .map((t) => (t.textContent || '').trim());
  // Der Fangmarker ist die Gruppe mit einem der bekannten Kurztexte.
  const label = texte.find((t) => /^(Anschluss|Endpunkt|Schnittpunkt|Mittelpunkt|auf Leitung|Raster)$/.test(t));
  if (!label) return null;
  const el = [...document.querySelectorAll('.react-flow__viewport text')]
    .find((t) => (t.textContent || '').trim() === label);
  const gruppe = el?.parentElement;
  const form = gruppe?.querySelector('circle, rect, polygon, polyline, line');
  if (!form) return { label, x: null, y: null };
  const cx = form.getAttribute('cx');
  const cy = form.getAttribute('cy');
  return {
    label,
    x: cx != null ? Number(cx) : null,
    y: cy != null ? Number(cy) : null,
  };
});

/** Graph aus dem Backend lesen (was WIRKLICH gespeichert ist). */
const graphLesen = async () => {
  const r = await fetch(`${API}/api/v1/projects/1/schema-editor`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  const g = d.schema?.graph ?? d.schema?.graph_json ?? d.graph ?? d;
  return typeof g === 'string' ? JSON.parse(g) : (g || {});
};

const freieFlaeche = async (box) => page.evaluate(([bx, by, bw, bh]) => {
  for (let y = by + bh - 160; y > by + 80; y -= 24) {
    for (let x = bx + 100; x < bx + bw - 200; x += 24) {
      const el = document.elementFromPoint(x, y);
      if (el?.classList?.contains('react-flow__pane')) return { x, y };
    }
  }
  return null;
}, [box.x, box.y, box.width, box.height]);

const palette = async (label) => {
  const gruppen = page.locator('.hc-palette-group__trigger');
  for (let i = 0; i < await gruppen.count(); i += 1) {
    const g = gruppen.nth(i);
    if (!(await g.evaluate((el) => el.className.includes('is-open')))) await g.click({ force: true });
    await page.waitForTimeout(120);
    const item = page.locator('.hc-palette-item')
      .filter({ has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) }).first();
    if (await item.count()) return item;
  }
  return null;
};

const setzen = async (label, screenX, screenY) => {
  const item = await palette(label);
  if (!item) return null;
  await item.click({ force: true });
  await page.waitForTimeout(200);
  const vorher = (await nodeIds()).length;
  await page.mouse.move(screenX, screenY);
  await page.waitForTimeout(180);
  await page.mouse.click(screenX, screenY);
  await page.waitForTimeout(450);
  const ids = await nodeIds();
  return ids.length > vorher ? ids.at(-1) : null;
};

// ═══════════════════════════════════════════════════════════════════════════
let leer = false;
for (let versuch = 0; versuch < 3 && !leer; versuch += 1) {
  await graphLeeren();
  await page.goto(`${APP}/projekte/1/schema`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  leer = (await page.locator('.react-flow__node').count()) === 0;
  if (!leer) console.log(`  (Versuch ${versuch + 1}: noch ${await page.locator('.react-flow__node').count()} Nodes)`);
}
pruefe('0', 'Editor geladen mit leerem Schema',
  (await page.locator('.react-flow').count()) > 0 && leer);

const box = await page.locator('.hc-canvas-wrap').boundingBox();
const mitte = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

// Eine Pumpe allein auf der Fläche (Fall A/B Grundlage).
const pumpeId = await setzen('Pumpe', mitte.x, mitte.y - 120);
pruefe('A0', 'Pumpe gesetzt', !!pumpeId, pumpeId || '—');
await zoomAuf(100);

const ports = pumpeId ? await portsVon(pumpeId) : [];
pruefe('A1', 'Pumpe hat sichtbare Anschlüsse', ports.length >= 2,
  ports.map((p) => `${p.handleId}@${p.x},${p.y}`).join(' '));
if (ports.length < 2) {
  console.log('\nOhne Anschlüsse ist der Rest sinnlos — Abbruch.');
  fs.writeFileSync(`${OUT}/portsnap.json`, JSON.stringify(ergebnisse, null, 2));
  await page.screenshot({ path: `${OUT}/portsnap-abbruch.png` });
  await browser.close();
  process.exit(1);
}

/**
 * Der Kernfall: von `startVon` aus zeichnen und auf `port` zielen.
 * Prüft Sonde, Marker und danach den gespeicherten Graphen.
 */
async function portFangen(id, port, startVersatz) {
  const frei = await freieFlaeche(box);
  if (!frei) return pruefe(id, 'keine freie Fläche zum Starten', false);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  const start = { x: port.x + startVersatz.dx, y: port.y + startVersatz.dy };
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(150);
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(250);

  // Auf den Port zielen.
  await page.mouse.move(port.x, port.y);
  await page.waitForTimeout(320);

  const sonde = await snapSonde();
  const marker = await markerAusSvg();
  const sondeIstPort = sonde?.typ === 'port';
  pruefe(`${id}a`, 'Fangentscheidung ist PORT', sondeIstPort,
    sonde ? `${sonde.typ} ${sonde.handleId ?? ''} d=${sonde.distanz?.toFixed?.(1) ?? '?'}` : 'keine Sonde');
  pruefe(`${id}b`, 'Marker „Anschluss" sichtbar', marker?.label === 'Anschluss',
    marker ? marker.label : 'kein Marker');
  // Marker-Koordinate == Fangkoordinate (keine zwei Wahrheiten).
  const gleich = marker && sonde && Math.abs(marker.x - sonde.x) < 0.6 && Math.abs(marker.y - sonde.y) < 0.6;
  pruefe(`${id}c`, 'Marker liegt exakt auf dem gewählten Fang', !!gleich,
    marker && sonde ? `Marker ${marker.x},${marker.y} vs Fang ${sonde.x},${sonde.y}` : '—');

  const kantenVor = (await graphLesen()).edges?.length || 0;
  await page.mouse.click(port.x, port.y);
  await page.waitForTimeout(1300);          // Autosave abwarten

  const graph = await graphLesen();
  const neue = (graph.edges || []).slice(kantenVor);
  const kante = neue.at(-1);
  const trifftPort = kante
    && ((kante.source === pumpeId && kante.sourceHandle === sonde?.handleId)
      || (kante.target === pumpeId && kante.targetHandle === sonde?.handleId));
  pruefe(`${id}d`, 'Gespeicherte Leitung hängt am angezeigten Port', !!trifftPort,
    kante ? `${kante.source}/${kante.sourceHandle} → ${kante.target}/${kante.targetHandle}, erwartet ${sonde?.handleId}` : 'keine Kante gespeichert');
  return kante;
}

// ── A) Leitung von links → rechter Port ────────────────────────────────────
const rechts = ports.reduce((a, b) => (b.x > a.x ? b : a), ports[0]);
const links = ports.reduce((a, b) => (b.x < a.x ? b : a), ports[0]);
const oben = ports.reduce((a, b) => (b.y < a.y ? b : a), ports[0]);
const unten = ports.reduce((a, b) => (b.y > a.y ? b : a), ports[0]);
console.log(`  Ports: links=${links.handleId} rechts=${rechts.handleId} oben=${oben.handleId} unten=${unten.handleId}`);

await portFangen('A', oben, { dx: -260, dy: -10 });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/** Frische Pumpe für eine Testphase, mit ihren Ports NACH dem Zoomsetzen. */
async function frischePumpe(zielZoom, versatz) {
  await zoomAuf(zielZoom);
  const id = await setzen('Pumpe', mitte.x + versatz.dx, mitte.y + versatz.dy);
  if (!id) return null;
  await page.waitForTimeout(250);
  const ps = await portsVon(id);
  return ps.length ? { id, ports: ps } : null;
}

// ── F) Port schlägt Raster ─────────────────────────────────────────────────
{
  const pumpe = await frischePumpe(100, { dx: 260, dy: -120 });
  if (!pumpe) {
    pruefe('F', 'PORT schlägt GRID', false, 'Pumpe nicht gesetzt');
  } else {
    const ziel = pumpe.ports.reduce((a, b) => (b.y < a.y ? b : a), pumpe.ports[0]);
    const frei = await freieFlaeche(box);
    await page.mouse.move(frei.x, frei.y);
    await page.keyboard.press('l');
    await page.waitForTimeout(180);
    await page.mouse.click(frei.x, frei.y);
    await page.waitForTimeout(220);
    await page.mouse.move(ziel.x, ziel.y);
    await page.waitForTimeout(340);
    const sn = await snapSonde();
    pruefe('F', 'PORT schlägt GRID (Port liegt am Raster)',
      sn?.typ === 'port' && sn?.nodeId === pumpe.id,
      `${sn?.typ ?? '—'} ${sn?.handleId ?? ''} d=${sn?.distanz?.toFixed?.(1) ?? '?'}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

// ── I) Flackertest: langsam über die Fanggrenze ────────────────────────────
{
  const pumpe = await frischePumpe(100, { dx: -260, dy: 60 });
  if (!pumpe) {
    pruefe('I', 'Fang flackert nicht', false, 'Pumpe nicht gesetzt');
  } else {
    const ziel = pumpe.ports.reduce((a, b) => (b.y < a.y ? b : a), pumpe.ports[0]);
    const frei = await freieFlaeche(box);
    await page.mouse.move(frei.x, frei.y);
    await page.keyboard.press('l');
    await page.waitForTimeout(180);
    await page.mouse.click(frei.x, frei.y);
    await page.waitForTimeout(220);
    await page.evaluate(() => { window.__hcSnapVerlauf = []; });
    for (let d = 46; d >= 0; d -= 2) { await page.mouse.move(ziel.x, ziel.y - d); await page.waitForTimeout(45); }
    for (let d = 0; d <= 46; d += 2) { await page.mouse.move(ziel.x, ziel.y - d); await page.waitForTimeout(45); }
    const verlauf = await page.evaluate(() => (window.__hcSnapVerlauf || []).map((e) => e.typ));
    let wechsel = 0;
    for (let i = 1; i < verlauf.length; i += 1) if (verlauf[i] !== verlauf[i - 1]) wechsel += 1;
    pruefe('I', 'Fang flackert nicht beim Überfahren der Fanggrenze', wechsel <= 4,
      `${wechsel} Wechsel in ${verlauf.length} Schritten: ${[...new Set(verlauf)].join('/')}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

// ── C/D/E) Port-Snap bei 25 %, 50 %, 100 %, 200 %, 400 % ───────────────────
for (const [i, zielZoom] of [25, 50, 100, 200, 400].entries()) {
  const pumpe = await frischePumpe(zielZoom, { dx: -120 + i * 90, dy: 180 });
  const z = await zoomJetzt();
  if (!pumpe) { pruefe(`Z${zielZoom}`, `Port-Snap bei ~${z} %`, false, 'Pumpe nicht gesetzt'); continue; }
  const ziel = pumpe.ports.reduce((a, b) => (b.y < a.y ? b : a), pumpe.ports[0]);
  const frei = await freieFlaeche(box);
  if (!frei) { pruefe(`Z${zielZoom}`, `Port-Snap bei ~${z} %`, false, 'keine freie Fläche'); continue; }
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(220);
  await page.mouse.move(ziel.x, ziel.y);
  await page.waitForTimeout(340);
  const sn = await snapSonde();
  const m = await markerAusSvg();
  pruefe(`Z${zielZoom}`, `Port-Snap bei ~${z} % Zoom`,
    sn?.typ === 'port' && sn?.nodeId === pumpe.id && m?.label === 'Anschluss',
    `Sonde ${sn?.typ ?? '—'}${sn?.nodeId === pumpe.id ? '' : ' (falscher Node)'}, Marker ${m?.label ?? '—'}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// ── J) Rotiertes Bauteil ───────────────────────────────────────────────────
{
  const neu = await frischePumpe(100, { dx: 330, dy: 120 });
  const pid = neu?.id;
  if (!pid) { pruefe('J1', 'Pumpe für Rotationstest', false); }
  await page.locator(`.react-flow__node[data-id="${pid}"]`).click({ force: true });
  await page.waitForTimeout(300);
  const vor = await portsVon(pid);
  await page.keyboard.press('d');            // Drehen (Shortcut aus drawingConfig)
  await page.waitForTimeout(700);
  const nach = await portsVon(pid);
  const bewegt = vor.length === nach.length && vor.some((p, i) =>
    Math.abs(p.x - nach[i].x) > 3 || Math.abs(p.y - nach[i].y) > 3);
  pruefe('J1', 'Rotation verschiebt die Anschlusspositionen sichtbar', bewegt,
    `${vor.map((p) => `${p.x},${p.y}`).join(' ')} → ${nach.map((p) => `${p.x},${p.y}`).join(' ')}`);

  // Fangkoordinate muss der NEUEN sichtbaren Position folgen.
  const ziel = nach.reduce((a, b) => (b.x > a.x ? b : a), nach[0]);
  const frei = await freieFlaeche(box);
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(220);
  await page.mouse.move(ziel.x, ziel.y);
  await page.waitForTimeout(340);
  const s = await snapSonde();
  // Sonde liefert Weltkoordinaten — in Screen umrechnen und vergleichen.
  const sondeScreen = s ? await page.evaluate(([wx, wy]) => {
    const el = document.querySelector('.react-flow__viewport');
    const m = new DOMMatrix(getComputedStyle(el).transform);
    const r = document.querySelector('.react-flow').getBoundingClientRect();
    return { x: wx * m.a + m.e + r.left, y: wy * m.d + m.f + r.top };
  }, [s.x, s.y]) : null;
  const nah = sondeScreen && Math.hypot(sondeScreen.x - ziel.x, sondeScreen.y - ziel.y) < 12;
  pruefe('J2', 'Fangkoordinate folgt der sichtbaren Portposition nach Rotation',
    s?.typ === 'port' && nah,
    sondeScreen ? `Fang @${Math.round(sondeScreen.x)},${Math.round(sondeScreen.y)} vs sichtbar ${ziel.x},${ziel.y}` : `Sonde ${s?.typ ?? '—'}`);
  await page.keyboard.press('Escape');
}

pruefe('X', 'keine Konsolenfehler', fehler.length === 0, fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/portsnap.png` });
fs.writeFileSync(`${OUT}/portsnap.json`, JSON.stringify(ergebnisse, null, 2));

const fail = ergebnisse.filter((r) => !r.ok);
console.log(`\n=== ${ergebnisse.length - fail.length}/${ergebnisse.length} ===`);
if (fail.length) console.log('OFFEN:\n' + fail.map((f) => `  ${f.id} ${f.was} — ${f.notiz}`).join('\n'));
await browser.close();
