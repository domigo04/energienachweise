// Bedienung im Editor — Feedback Dominic 2026-07-31.
//
// Drei Zusagen, die man nur im Browser belegen kann:
//
//   1. Eine Leitung endet mit einem Doppelklick bzw. mit einem zweiten Klick
//      auf denselben Punkt — nicht nur mit Enter oder Escape.
//   2. Ein Klick auf eine Leitung wählt das Teilstück; Tab nimmt den ganzen
//      zusammenhängenden Strang dazu und Tab führt wieder zurück.
//   3. Die 90°-Drehung dreht das ganze Bauteil-DIV, also auch den
//      Auswahlrahmen — nicht nur das Zeichen darin.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('bedienung');
const w = await starten();
const { page } = w;
const OUT = w.cfg.arbeitsordner;

const anker = (id, position) => ({ id, type: 'junction', position, data: { cad_anchor: true } });
const leitung = (id, source, target, punkte = []) => ({
  id, source, sourceHandle: 'center-source', target, targetHandle: 'center-target', type: 'flow',
  data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, points: punkte, dn: 32 },
  style: { stroke: '#ef4444', strokeWidth: 4.5 },
});

// ── 1. Leitung mit Doppelklick abschliessen ────────────────────────────────
kopf('Leitung endet mit Doppelklick');
await w.frischLaden();
{
  const start = await w.freieFlaeche();
  await page.mouse.move(start.x, start.y);
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(220);
  const ende = { x: start.x + 240, y: start.y };
  await page.mouse.move(ende.x, ende.y);
  await page.waitForTimeout(200);
  await page.mouse.dblclick(ende.x, ende.y);
  await page.waitForTimeout(1500);

  const g = await w.graphLesen();
  pruefe('D1', 'Der Doppelklick hat eine Leitung erzeugt',
    (g.edges || []).length === 1, `${(g.edges || []).length} Kanten`);
  // Kein Nullsegment: der doppelt geklickte Punkt wird zum Leitungsende,
  // nicht zu einem zusätzlichen Eckpunkt auf sich selbst.
  const punkte = g.edges?.[0]?.data?.points || [];
  pruefe('D2', 'Der doppelt geklickte Punkt wird das Ende, kein Eckpunkt',
    punkte.length === 0, `${punkte.length} Eckpunkte`);
  pruefe('D3', 'Der Zeichenbefehl läuft nicht mehr weiter',
    /MODIFY/i.test(await w.status()), await w.status());
}

// ── 2. Teilstück vs. Leitungssystem (Tab) ──────────────────────────────────
kopf('Klick wählt das Teilstück, Tab den Strang');
{
  // vl1 ── a2 ── vl2 ── a3 ── vl3     (ein durchgehendes System)
  // rl1 hängt an einem eigenen Ankerpaar und gehört NICHT dazu.
  await w.graphSetzen({
    nodes: [
      anker('a1', { x: 200, y: 300 }), anker('a2', { x: 600, y: 300 }),
      anker('a3', { x: 1000, y: 300 }), anker('a4', { x: 1400, y: 300 }),
      anker('b1', { x: 200, y: 700 }), anker('b2', { x: 600, y: 700 }),
    ],
    edges: [
      leitung('vl1', 'a1', 'a2'), leitung('vl2', 'a2', 'a3'), leitung('vl3', 'a3', 'a4'),
      leitung('rl1', 'b1', 'b2'),
    ],
    layer_config: {},
  });
  await w.laden();

  const mitte = await w.weltZuScreen({ x: 800, y: 300 });   // auf vl2
  await page.mouse.click(mitte.x, mitte.y);
  await page.waitForTimeout(400);

  const status1 = await w.status();
  pruefe('T1', 'Ein Klick wählt das Teilstück',
    /Teilstück/.test(status1), status1);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const status2 = await w.status();
  pruefe('T2', 'Tab wählt das ganze Leitungssystem',
    /Leitungssystem · 3 Leitungen/.test(status2), status2);

  // Der Rücklauf hängt an einem eigenen Ankerpaar — er darf nicht mitkommen.
  pruefe('T3', 'Der getrennte Rücklauf bleibt aussen vor',
    !/4 Leitungen/.test(status2), status2);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const status3 = await w.status();
  pruefe('T4', 'Nochmal Tab führt zurück aufs Teilstück',
    /Teilstück/.test(status3), status3);
}

// ── 3. Drehung dreht das ganze DIV ─────────────────────────────────────────
kopf('90°-Drehung dreht das ganze Bauteil-DIV');
{
  // Bewusst ein NICHT quadratisches Bauteil: nur daran ist zu sehen, ob das
  // ganze DIV quer liegt oder bloss das Zeichen darin gedreht wurde.
  await w.graphSetzen({
    nodes: [{ id: 's1', type: 'speicher', position: { x: 500, y: 300 }, data: { nr: 1 } }],
    edges: [], layer_config: {},
  });
  await w.laden();

  // Misst das äusserste Bauteil-DIV im Node — das ist das Element, auf dem
  // React Flow den Auswahlrahmen setzt (`.react-flow__node.selected > *`).
  const bauteilDiv = () => page.evaluate(() => {
    const node = document.querySelector('.react-flow__node[data-id="s1"]');
    const kind = node.firstElementChild;
    const stil = getComputedStyle(kind);
    const kasten = kind.getBoundingClientRect();
    return {
      transform: stil.transform,
      outline: stil.outlineWidth,
      breite: Math.round(kasten.width),
      hoehe: Math.round(kasten.height),
      nr: node.querySelector('div[style*="border-radius: 9px"]')?.textContent ?? null,
    };
  });

  await page.locator('.react-flow__node[data-id="s1"]').click();
  await page.waitForTimeout(300);
  const vorher = await bauteilDiv();

  await page.keyboard.press('d');       // Standard-Shortcut fürs Drehen
  await page.waitForTimeout(500);
  const nachher = await bauteilDiv();

  pruefe('R1', 'Das äusserste Bauteil-DIV trägt die Drehung',
    nachher.transform !== 'none' && nachher.transform !== '', nachher.transform);
  pruefe('R2', 'Der Auswahlrahmen sitzt auf genau diesem gedrehten DIV',
    nachher.outline !== '0px' && vorher.outline !== '0px',
    `outline vorher ${vorher.outline}, jetzt ${nachher.outline}`);
  pruefe('R3', 'Das DIV liegt danach quer — Breite und Höhe sind getauscht',
    Math.abs(nachher.breite - vorher.hoehe) <= 2 && Math.abs(nachher.hoehe - vorher.breite) <= 2,
    `vorher ${vorher.breite}×${vorher.hoehe} px, jetzt ${nachher.breite}×${nachher.hoehe} px`);
  pruefe('R4', 'Die Bauteilnummer bleibt lesbar (nicht mitgedreht)',
    nachher.nr === '1', `Nr «${nachher.nr}»`);
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 3).join(' || '));
await page.screenshot({ path: `${OUT}/bedienung.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
