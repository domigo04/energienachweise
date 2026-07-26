// Port-Snap systematisch prüfen (Sprint-Punkt 1-3).
//
// Die Prüfung ist NICHT „Marker existiert", sondern die Vierfach-Identität:
//
//   sichtbarer Marker == gewählter Fang == gesetzter Endpunkt == gespeicherter Port
//
// Jeder Fall bewegt die Maus auf die BEKANNTE Bildschirmposition eines Ports,
// liest die Fangentscheidung aus der Prüfsonde (`window.__hcSnap`), klickt und
// vergleicht danach den gespeicherten Graphen.
import { protokoll, starten } from './lib.mjs';

const { pruefe, bilanz } = protokoll('portsnap');
const w = await starten();
const { page, cfg } = w;
const OUT = cfg.arbeitsordner;

// ═══════════════════════════════════════════════════════════════════════════
const leer = await w.frischLaden();
pruefe('0', 'Editor geladen mit leerem Schema',
  (await page.locator('.react-flow').count()) > 0 && leer);

const box = await page.locator('.hc-canvas-wrap').boundingBox();
const mitte = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

// Eine Pumpe allein auf der Fläche (Fall A/B Grundlage).
const pumpeId = await w.setzen('Pumpe', mitte.x, mitte.y - 120);
pruefe('A0', 'Pumpe gesetzt', !!pumpeId, pumpeId || '—');
await w.zoomAuf(100);

const ports = pumpeId ? await w.portsVon(pumpeId) : [];
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
  const frei = await w.freieFlaeche();
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

  const sonde = await w.snapSonde();
  const marker = await w.markerAusSvg();
  const sondeIstPort = sonde?.typ === 'port';
  pruefe(`${id}a`, 'Fangentscheidung ist PORT', sondeIstPort,
    sonde ? `${sonde.typ} ${sonde.handleId ?? ''} d=${sonde.distanz?.toFixed?.(1) ?? '?'}` : 'keine Sonde');
  pruefe(`${id}b`, 'Marker „Anschluss" sichtbar', marker?.label === 'Anschluss',
    marker ? marker.label : 'kein Marker');
  // Marker-Koordinate == Fangkoordinate (keine zwei Wahrheiten).
  const gleich = marker && sonde && Math.abs(marker.x - sonde.x) < 0.6 && Math.abs(marker.y - sonde.y) < 0.6;
  pruefe(`${id}c`, 'Marker liegt exakt auf dem gewählten Fang', !!gleich,
    marker && sonde ? `Marker ${marker.x},${marker.y} vs Fang ${sonde.x},${sonde.y}` : '—');

  const kantenVor = (await w.graphLesen()).edges?.length || 0;
  await page.mouse.click(port.x, port.y);
  await page.waitForTimeout(1300);          // Autosave abwarten

  const graph = await w.graphLesen();
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
  await w.zoomAuf(zielZoom);
  const id = await w.setzen('Pumpe', mitte.x + versatz.dx, mitte.y + versatz.dy);
  if (!id) return null;
  await page.waitForTimeout(250);
  const ps = await w.portsVon(id);
  return ps.length ? { id, ports: ps } : null;
}

// ── F) Port schlägt Raster ─────────────────────────────────────────────────
{
  const pumpe = await frischePumpe(100, { dx: 260, dy: -120 });
  if (!pumpe) {
    pruefe('F', 'PORT schlägt GRID', false, 'Pumpe nicht gesetzt');
  } else {
    const ziel = pumpe.ports.reduce((a, b) => (b.y < a.y ? b : a), pumpe.ports[0]);
    const frei = await w.freieFlaeche();
    await page.mouse.move(frei.x, frei.y);
    await page.keyboard.press('l');
    await page.waitForTimeout(180);
    await page.mouse.click(frei.x, frei.y);
    await page.waitForTimeout(220);
    await page.mouse.move(ziel.x, ziel.y);
    await page.waitForTimeout(340);
    const sn = await w.snapSonde();
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
    const frei = await w.freieFlaeche();
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
  const z = await w.zoomJetzt();
  if (!pumpe) { pruefe(`Z${zielZoom}`, `Port-Snap bei ~${z} %`, false, 'Pumpe nicht gesetzt'); continue; }
  const ziel = pumpe.ports.reduce((a, b) => (b.y < a.y ? b : a), pumpe.ports[0]);
  const frei = await w.freieFlaeche();
  if (!frei) { pruefe(`Z${zielZoom}`, `Port-Snap bei ~${z} %`, false, 'keine freie Fläche'); continue; }
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(220);
  await page.mouse.move(ziel.x, ziel.y);
  await page.waitForTimeout(340);
  const sn = await w.snapSonde();
  const m = await w.markerAusSvg();
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
  const vor = await w.portsVon(pid);
  await page.keyboard.press('d');            // Drehen (Shortcut aus drawingConfig)
  await page.waitForTimeout(700);
  const nach = await w.portsVon(pid);
  const bewegt = vor.length === nach.length && vor.some((p, i) =>
    Math.abs(p.x - nach[i].x) > 3 || Math.abs(p.y - nach[i].y) > 3);
  pruefe('J1', 'Rotation verschiebt die Anschlusspositionen sichtbar', bewegt,
    `${vor.map((p) => `${p.x},${p.y}`).join(' ')} → ${nach.map((p) => `${p.x},${p.y}`).join(' ')}`);

  // Fangkoordinate muss der NEUEN sichtbaren Position folgen.
  const ziel = nach.reduce((a, b) => (b.x > a.x ? b : a), nach[0]);
  const frei = await w.freieFlaeche();
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(180);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(220);
  await page.mouse.move(ziel.x, ziel.y);
  await page.waitForTimeout(340);
  const s = await w.snapSonde();
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

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/portsnap.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
