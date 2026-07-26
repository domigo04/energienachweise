// Spiegeln (Mirror) im echten Browser prüfen — Sprintpunkte 2-5.
//
// Der Kern ist die Trennung von Geometrie und Fachlichkeit:
//
//   Die geometrische LAGE eines Anschlusses darf sich ändern.
//   Seine fachliche IDENTITÄT (Handle-ID, VL/RL) darf sich NIE ändern.
//
// Geprüft wird die sichtbare Portposition, die Handle-ID, der Fang auf den Port
// nach dem Spiegeln, die Kantenreferenz im gespeicherten Graphen und die Lage
// nach einem Neuladen.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('mirror');
const w = await starten();
const { page } = w;
const OUT = w.cfg.arbeitsordner;

const shortcutSpiegeln = 's';        // aus DEFAULT_DRAWING_CONFIG

/** Anschlüsse als Karte handleId → Bildschirmposition (für Mausziele). */
const portKarte = async (nodeId) => Object.fromEntries(
  (await w.portsVon(nodeId)).map((p) => [p.handleId, { x: p.x, y: p.y }]));

/** Anschlüsse in WELTkoordinaten — nur das ist über ein Neuladen vergleichbar.
    Bildschirmkoordinaten verschieben sich mit dem Bildausschnitt, und der ist
    nach dem Laden nicht garantiert derselbe. */
const portKarteWelt = async (nodeId) => Object.fromEntries(
  (await w.portsWeltVon(nodeId)).map((p) => [p.handleId, { x: p.x, y: p.y }]));

kopf('Bauteil OHNE Leitungen spiegeln');
await w.frischLaden();
const box = await page.locator('.hc-canvas-wrap').boundingBox();
const mitte = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

// Speicher: hat mehrere benannte Anschlüsse und keine Klammern im Namen
// (Klammern würden in der Suchregex als Gruppe gelesen).
let weId = await w.setzen('Speicher', mitte.x - 120, mitte.y - 60);
if (!weId) weId = await w.setzen('Pumpe', mitte.x - 120, mitte.y - 60);
pruefe('M0', 'Bauteil mit benannten Anschlüssen gesetzt', !!weId, weId || '—');
if (!weId) {
  bilanz(OUT);
  await w.browser.close();
  process.exit(1);
}
await w.zoomAuf(100);

const vorSpiegeln = await portKarte(weId);
const idsVor = Object.keys(vorSpiegeln).sort();
pruefe('M1', 'Bauteil hat benannte Anschlüsse', idsVor.length >= 2, idsVor.join(', '));

await page.locator(`.react-flow__node[data-id="${weId}"]`).click({ force: true });
await page.waitForTimeout(350);
await page.keyboard.press(shortcutSpiegeln);
await page.waitForTimeout(900);

const nachSpiegeln = await portKarte(weId);
const idsNach = Object.keys(nachSpiegeln).sort();

// ── Punkt 3: Semantik ist stabil ───────────────────────────────────────────
pruefe('M2', 'Anschluss-IDs sind nach dem Spiegeln unverändert',
  idsVor.join(',') === idsNach.join(','), `${idsVor.join(',')} → ${idsNach.join(',')}`);

// ── Punkt 2: Geometrie hat sich bewegt ─────────────────────────────────────
// Bei einer waagrechten Spiegelung müssen sich linke und rechte Anschlüsse
// tauschen; oben/unten bleibt. Wenn sich gar nichts bewegt, ist die Spiegelung
// rein optisch oder tut nichts.
const bewegt = idsVor.filter((id) => nachSpiegeln[id]
  && Math.abs(vorSpiegeln[id].x - nachSpiegeln[id].x) > 3);
const yStabil = idsVor.every((id) => nachSpiegeln[id]
  && Math.abs(vorSpiegeln[id].y - nachSpiegeln[id].y) <= 3);
pruefe('M3', 'Waagrechte Spiegelung verschiebt Anschlüsse in x',
  bewegt.length > 0, `${bewegt.length} von ${idsVor.length} verschoben`);
pruefe('M4', 'Waagrechte Spiegelung lässt y unverändert', yStabil,
  idsVor.map((id) => `${id}: ${vorSpiegeln[id].y}→${nachSpiegeln[id]?.y}`).join(' '));

// ── Der Fang muss der NEUEN Lage folgen ────────────────────────────────────
{
  const zielId = bewegt[0] || idsNach[0];
  const ziel = nachSpiegeln[zielId];
  const frei = await w.freieFlaeche();
  await w.leitungStarten(frei);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(240);
  const { sonde, marker } = await w.zielen(ziel);
  const sondeScreen = sonde ? await w.weltZuScreen({ x: sonde.x, y: sonde.y }) : null;
  const nah = sondeScreen && Math.hypot(sondeScreen.x - ziel.x, sondeScreen.y - ziel.y) < 14;
  pruefe('M5', 'Fang trifft den Anschluss an seiner neuen Lage',
    sonde?.typ === 'port' && sonde?.nodeId === weId && nah,
    sondeScreen ? `Fang @${sondeScreen.x},${sondeScreen.y} vs sichtbar ${ziel.x},${ziel.y} (${sonde?.handleId})` : `Sonde ${sonde?.typ ?? '—'}`);
  pruefe('M6', 'Marker heisst „Anschluss"', marker?.label === 'Anschluss', marker?.label ?? '—');
  // Die vom Fang gemeldete Handle-ID muss zu dem Anschluss gehören, auf den
  // gezeigt wurde — nicht zu seinem Spiegelpartner.
  pruefe('M7', 'Fang meldet den Anschluss, auf den gezeigt wurde',
    sonde?.handleId === zielId, `gezeigt ${zielId}, gemeldet ${sonde?.handleId ?? '—'}`);
  await w.abbrechen();
}

// ── Persistenz ─────────────────────────────────────────────────────────────
{
  const g = await w.graphLesen();
  const node = (g.nodes || []).find((n) => n.id === weId);
  pruefe('M8', 'Spiegelung ist im Graphen gespeichert', node?.data?.mirrored === true,
    JSON.stringify({ mirrored: node?.data?.mirrored, rotation: node?.data?.rotation }));
  await page.keyboard.press('Escape');
  await w.mausWeg();
  const weltVorReload = await portKarteWelt(weId);
  await w.laden();
  await w.mausWeg();
  const weltNachReload = await portKarteWelt(weId);
  const abweichungen = idsNach.filter((id) => !weltNachReload[id]
    || Math.abs(weltNachReload[id].x - weltVorReload[id].x) > 1
    || Math.abs(weltNachReload[id].y - weltVorReload[id].y) > 1);
  pruefe('M9', 'Anschlusslagen sind nach dem Neuladen identisch (Weltkoordinaten)',
    abweichungen.length === 0,
    abweichungen.length
      ? abweichungen.slice(0, 4).map((id) => `${id}: ${JSON.stringify(weltVorReload[id])} → ${JSON.stringify(weltNachReload[id])}`).join(' | ')
      : `${idsNach.length} Anschlüsse unverändert`);
}

kopf('Bauteil MIT angeschlossenen Leitungen spiegeln (Punkt 4)');
{
  // Pumpe zwischen zwei Leitungen, beide an echten Anschlüssen.
  await w.graphSetzen({
    nodes: [
      { id: 'p1', type: 'pump', position: { x: 560, y: 480 }, data: { label: 'Pumpe', nr: 1 } },
      { id: 'k1', type: 'junction', position: { x: 560, y: 300 }, data: { cad_anchor: true } },
      { id: 'k2', type: 'junction', position: { x: 560, y: 760 }, data: { cad_anchor: true } },
    ],
    edges: [
      { id: 'eo', source: 'k1', sourceHandle: 'center-source', target: 'p1', targetHandle: 'top',
        type: 'flow',
        data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
        style: { stroke: '#ef4444', strokeWidth: 4.5 } },
      { id: 'eu', source: 'p1', sourceHandle: 'bottom', target: 'k2', targetHandle: 'center-target',
        type: 'flow',
        data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
        style: { stroke: '#ef4444', strokeWidth: 4.5 } },
    ],
    layer_config: {},
  });
  await w.laden();

  const pumpeVor = await portKarte('p1');
  await page.locator('.react-flow__node-pump').first().click({ force: true });
  await page.waitForTimeout(350);
  await page.keyboard.press(shortcutSpiegeln);
  await page.waitForTimeout(1200);
  const pumpeNach = await portKarte('p1');

  const g = await w.graphLesen();
  const eo = (g.edges || []).find((e) => e.id === 'eo');
  const eu = (g.edges || []).find((e) => e.id === 'eu');
  pruefe('V1', 'Portreferenzen der Leitungen sind unverändert',
    eo?.targetHandle === 'top' && eu?.sourceHandle === 'bottom',
    `oben → ${eo?.targetHandle}, unten → ${eu?.sourceHandle}`);
  pruefe('V2', 'Hydraulische Verbindung besteht weiter',
    eo?.target === 'p1' && eu?.source === 'p1',
    `${eo?.source}→${eo?.target}, ${eu?.source}→${eu?.target}`);

  // Die gerenderten Leitungsenden müssen auf den (evtl. verschobenen) Ports
  // liegen — nicht an der alten Bildschirmposition kleben.
  const enden = await page.evaluate(() => [...document.querySelectorAll('.react-flow__edge')]
    .map((e) => {
      const path = e.querySelector('path');
      if (!path) return null;
      const m = path.getScreenCTM();
      const a = path.getPointAtLength(0);
      const b = path.getPointAtLength(path.getTotalLength());
      const zu = (p) => ({ x: Math.round(p.x * m.a + p.y * m.c + m.e), y: Math.round(p.x * m.b + p.y * m.d + m.f) });
      return { start: zu(a), ende: zu(b) };
    }).filter(Boolean));
  const portPunkte = Object.values(pumpeNach);
  const beiEinemPort = (pt) => portPunkte.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 16);
  const alleAmPort = enden.length === 2
    && enden.every((e) => beiEinemPort(e.start) || beiEinemPort(e.ende));
  pruefe('V3', 'Leitungsenden liegen auf den Anschlüssen der gespiegelten Pumpe', alleAmPort,
    `${enden.map((e) => `${e.start.x},${e.start.y}/${e.ende.x},${e.ende.y}`).join(' ')} vs Ports ${portPunkte.map((p) => `${p.x},${p.y}`).join(' ')}`);

  // Keine Reste.
  const kaputt = (g.edges || []).filter((e) => (e.data?.points || [])
    .some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y)));
  pruefe('V4', 'Keine NaN-Geometrie nach dem Spiegeln', kaputt.length === 0, `${kaputt.length}`);
  pruefe('V5', 'Keine zusätzlichen Knoten entstanden', (g.nodes || []).length === 3,
    `${(g.nodes || []).length} Knoten`);

  // Fang auf einen Port der gespiegelten, angeschlossenen Pumpe.
  const zielId = Object.keys(pumpeNach)[0];
  const frei = await w.freieFlaeche();
  if (frei) {
    await w.leitungStarten(frei);
    await page.mouse.click(frei.x, frei.y);
    await page.waitForTimeout(240);
    const { sonde } = await w.zielen(pumpeNach[zielId]);
    pruefe('V6', 'Fang funktioniert auch am gespiegelten, angeschlossenen Bauteil',
      sonde?.typ === 'port' && sonde?.nodeId === 'p1',
      `${sonde?.typ ?? '—'} ${sonde?.handleId ?? ''}`);
    await w.abbrechen();
  }

  // Neuladen: alles gleich? Wieder in Weltkoordinaten, beide ohne Auswahl.
  await page.keyboard.press('Escape');
  await w.mausWeg();
  const weltVor = await portKarteWelt('p1');
  await w.laden();
  await w.mausWeg();
  const weltNach = await portKarteWelt('p1');
  const ab = Object.keys(weltVor).filter((id) => !weltNach[id]
    || Math.abs(weltNach[id].x - weltVor[id].x) > 1
    || Math.abs(weltNach[id].y - weltVor[id].y) > 1);
  pruefe('V7', 'Nach Neuladen identische Anschlusslagen (Weltkoordinaten)', ab.length === 0,
    ab.length ? ab.map((id) => `${id}: ${JSON.stringify(weltVor[id])} → ${JSON.stringify(weltNach[id])}`).join(' | ')
      : `${Object.keys(weltVor).length} Anschlüsse unverändert`);
  void pumpeVor;
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/mirror.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
