// Datenblöcke am Bauteil ausrichten — Feedback Dominic 2026-08-06.
//
// Drei Zusagen, die man nur im Browser belegen kann:
//
//   1. Gewöhnliche Bauteile haben denselben Datenblock; nur wer wirklich
//      lange Angaben hat, wird breiter.
//   2. Beim Verschieben rastet ein Block an der Flucht der anderen ein
//      (Fangpunkte und Hilfslinie sichtbar) und trifft sie exakt.
//   3. Die ausgerichtete Lage übersteht Speichern und Neuladen — auch wenn
//      der Block dafür nach OBEN wandern musste.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('datenblock');
const w = await starten();
const { page } = w;
const OUT = w.cfg.arbeitsordner;

/** Datenblock eines Bauteils in WELTkoordinaten plus Greifpunkt am Bildschirm. */
const block = (nodeId) => page.evaluate((id) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"] .hc-datenblock`);
  if (!el) return null;
  const vp = document.querySelector('.react-flow__viewport');
  const m = new DOMMatrix(getComputedStyle(vp).transform);
  const r0 = document.querySelector('.react-flow').getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const welt = (sx, sy) => ({ x: (sx - r0.left - m.e) / m.a, y: (sy - r0.top - m.f) / m.d });
  const links = welt(b.left, b.top);
  const rechts = welt(b.right, b.bottom);
  return {
    x: links.x, y: links.y,
    breite: rechts.x - links.x, hoehe: rechts.y - links.y,
    griff: { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + 6) },
    text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
  };
}, nodeId);

/** Zoomfaktor der Ansicht — Weltmass × Faktor = Bildschirmmass. */
const zoomFaktor = () => page.evaluate(() => {
  const vp = document.querySelector('.react-flow__viewport');
  return new DOMMatrix(getComputedStyle(vp).transform).a;
});

/** Hilfslinien und Fangpunkte, die gerade gezeichnet werden. */
const fangAnzeige = () => page.evaluate(() => ({
  linien: document.querySelectorAll('.react-flow__viewport svg line[stroke="#22c55e"]').length,
  punkte: document.querySelectorAll('.react-flow__viewport svg rect[stroke="#16a34a"]').length,
}));

kopf('Gewöhnliche Bauteile haben denselben Datenblock');
await w.graphSetzen({
  nodes: [
    { id: 'p1', type: 'pump', position: { x: 400, y: 300 }, data: { nr: 1, label: 'Pumpe' } },
    { id: 'v1', type: 'valve2', position: { x: 900, y: 460 }, data: { nr: 2, label: 'Ventil' } },
    // Weit weg: der dritte Block soll die Breite belegen, aber beim Ausrichten
    // keine eigene Flucht in Reichweite haben. «Sole/Wasser-WP (Erdsonden)»
    // passt nicht in die Grundbreite — dieser Block darf breiter werden.
    { id: 'we', type: 'erzeuger', position: { x: 1500, y: 1100 },
      data: { nr: 3, label: 'WP', generator_type: 'ews_wp' } },
  ],
  edges: [], layer_config: {},
});
await w.laden();
await w.mausWeg();
{
  const p1 = await block('p1');
  const v1 = await block('v1');
  const we = await block('we');
  pruefe('B1', 'Pumpe und Ventil bekommen denselben Kasten',
    Math.abs(p1.breite - v1.breite) < 0.6, `${p1.breite.toFixed(1)} / ${v1.breite.toFixed(1)}`);
  pruefe('B1b', 'Ein Bauteil mit langen Angaben darf breiter werden',
    we.breite > p1.breite, `Wärmeerzeuger ${we.breite.toFixed(1)} vs Pumpe ${p1.breite.toFixed(1)}`);
}

kopf('Ausrichten mit Fangpunkten und Hilfslinie');
{
  const ziel = await block('p1');          // Flucht, auf die ausgerichtet wird
  const bewegt = await block('v1');
  // Der Block soll knapp NEBEN die Flucht gezogen werden: 3–4 mm daneben liegt
  // innerhalb des Fangradius, muss also einrasten. Die Maus bewegt sich in
  // Bildschirmpixeln — das Weltmass muss dafür durch den Zoom.
  const zoom = await zoomFaktor();
  const dx = (ziel.x + 3 - bewegt.x) * zoom;
  const dy = (ziel.y + 4 - bewegt.y) * zoom;

  await page.mouse.move(bewegt.griff.x, bewegt.griff.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(Math.round(bewegt.griff.x + (dx * i) / 6),
      Math.round(bewegt.griff.y + (dy * i) / 6));
    await page.waitForTimeout(60);
  }
  const anzeige = await fangAnzeige();
  pruefe('B2', 'Während des Ziehens liegen Fangpunkte auf jeder Seite und Ecke',
    anzeige.punkte === 8, `${anzeige.punkte} Punkte`);
  pruefe('B3', 'Beide Fluchten werden als Hilfslinie gezeigt',
    anzeige.linien === 2, `${anzeige.linien} Hilfslinien`);

  await page.mouse.up();
  await page.waitForTimeout(400);

  const gerastet = await block('v1');
  pruefe('B4', 'Die Oberkante liegt exakt auf der Oberkante des Nachbarn',
    Math.abs(gerastet.y - ziel.y) < 0.6, `${gerastet.y.toFixed(1)} vs ${ziel.y.toFixed(1)}`);
  pruefe('B5', 'Die linke Kante liegt exakt auf der linken Kante des Nachbarn',
    Math.abs(gerastet.x - ziel.x) < 0.6, `${gerastet.x.toFixed(1)} vs ${ziel.x.toFixed(1)}`);
}

kopf('Die ausgerichtete Lage übersteht Speichern und Neuladen');
{
  await page.waitForTimeout(1500);                    // Autosave abwarten
  const gespeichert = await w.graphLesen();
  const knoten = (gespeichert.nodes || []).find((n) => n.id === 'v1') || {};
  const daten = knoten.data || {};
  // Seit #58 traegt der Block eine EIGENE Lage (`caption_pos`) statt eines
  // Versatzes zum Bauteil. Die Aussage bleibt dieselbe: die Lage darf oberhalb
  // des Bauteils liegen — hier wurde der Block auf die Flucht des Nachbarn
  // hochgezogen, also ueber die Oberkante seines eigenen Ventils.
  pruefe('B6', 'Die eigene Lage ist gespeichert und darf ueber dem Bauteil liegen',
    Boolean(daten.caption_pos) && Number(daten.caption_pos.y) < Number(knoten.position?.y)
      && daten.caption_offset_x === undefined && daten.caption_offset_y === undefined,
    `caption_pos = ${JSON.stringify(daten.caption_pos)}, Bauteil y = ${knoten.position?.y}`);

  const vorher = await block('v1');
  await w.laden();
  await w.mausWeg();
  const nachher = await block('v1');
  const ziel = await block('p1');
  pruefe('B7', 'Nach dem Neuladen steht der Block wieder auf der Flucht',
    Math.abs(nachher.y - ziel.y) < 0.6 && Math.abs(nachher.x - ziel.x) < 0.6,
    `${nachher.x.toFixed(1)},${nachher.y.toFixed(1)} vs ${ziel.x.toFixed(1)},${ziel.y.toFixed(1)}`
    + ` (vor dem Neuladen ${vorher.x.toFixed(1)},${vorher.y.toFixed(1)})`);
}

kopf('Die Schaltungsart steht nicht im Datenblock');
await w.graphSetzen({
  nodes: [{
    id: 'g1', type: 'gruppe', position: { x: 500, y: 300 },
    data: { nr: 1, label: 'Lufterhitzer', schaltung: 'beimisch', q_kw: 12, vl_temp: 50, rl_temp: 30, hat_wz: true },
  }],
  edges: [], layer_config: {},
});
await w.laden();
await w.mausWeg();
{
  const g = await block('g1');
  pruefe('B8', 'Weder Beimisch- noch Drosselschaltung stehen im Block',
    g && !/schaltung/i.test(g.text), g ? g.text.slice(0, 90) : 'kein Block');
  pruefe('B9', 'Wärmezähler und Durchfluss stehen weiterhin drin',
    g && /Wärmezähler/.test(g.text) && /Massenstrom|V'/.test(g.text),
    g ? g.text.slice(0, 120) : 'kein Block');
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 2).join(' || '));
await page.screenshot({ path: `${OUT}/datenblock.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
