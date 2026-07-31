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

// ── 4. Klick auf einen Anschluss zeichnet sofort ───────────────────────────
kopf('Anschluss anklicken startet die Leitung ohne Umweg');
{
  await w.graphSetzen({
    nodes: [{ id: 'p1', type: 'pump', position: { x: 600, y: 400 }, data: { nr: 1 } }],
    edges: [], layer_config: {},
  });
  await w.laden();
  await w.mausWeg();

  pruefe('A1', 'Vorher steht der Editor im Grundzustand',
    /Modify/.test(await w.status()), await w.status());

  const ports = await w.portsVon('p1');
  const oben = ports.find(p => p.handleId === 'top') || ports[0];
  await page.mouse.click(oben.x, oben.y);
  await page.waitForTimeout(400);

  const status = await w.status();
  pruefe('A2', 'Der Klick auf den Anschluss startet den Leitungsbefehl',
    /Leitung/.test(status), status);

  // Und es hängt wirklich eine Leitung am Cursor: die gestrichelte Vorschau
  // wird gezeichnet, sobald sich die Maus vom Startpunkt wegbewegt.
  await page.mouse.move(oben.x, oben.y - 180);
  await page.waitForTimeout(350);
  const zieht = await page.locator('path[stroke-dasharray="12 7"]').count();
  pruefe('A3', 'Es hängt sofort eine Leitung am Cursor', zieht > 0, `${zieht} Vorschaupfad(e)`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 5. Anschlusszone nur während des Leitungsbefehls ───────────────────────
kopf('Kein Hover-Effekt an den Anschlusszonen');
{
  await w.graphSetzen({
    nodes: [{ id: 'sp1', type: 'speicher', position: { x: 600, y: 300 }, data: { nr: 1 } }],
    edges: [], layer_config: {},
  });
  await w.laden();

  const rahmenFarbe = () => page.evaluate(() => {
    const rahmen = document.querySelector('.react-flow__node[data-id="sp1"] .hc-zone-frame');
    return rahmen ? getComputedStyle(rahmen).borderTopColor : null;
  });
  const unsichtbar = (farbe) => farbe === 'rgba(0, 0, 0, 0)' || farbe === 'transparent';

  await w.mausWeg();
  pruefe('Z1', 'Im Grundzustand ist die Anschlusszone unsichtbar',
    unsichtbar(await rahmenFarbe()), await rahmenFarbe());

  // Darüberfahren darf nichts ändern — genau das war die Unruhe.
  const kasten = await page.locator('.react-flow__node[data-id="sp1"]').boundingBox();
  await page.mouse.move(Math.round(kasten.x + kasten.width / 2), Math.round(kasten.y + kasten.height / 2));
  await page.waitForTimeout(350);
  pruefe('Z2', 'Hover schaltet die Zone NICHT ein',
    unsichtbar(await rahmenFarbe()), await rahmenFarbe());

  await page.keyboard.press('l');
  await page.waitForTimeout(350);
  pruefe('Z3', 'Im Leitungsbefehl ist die Zone sichtbar',
    !unsichtbar(await rahmenFarbe()), await rahmenFarbe());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  pruefe('Z4', 'Nach Esc ist sie wieder weg',
    unsichtbar(await rahmenFarbe()), await rahmenFarbe());
}

// ── 6. Entschlackte Toolbar ────────────────────────────────────────────────
kopf('Toolbar: ein Leitungsknopf statt zwei, ein Stände-Knopf statt zwei');
{
  const knopfText = () => page.locator('.hc-editor-toolbar').innerText();
  pruefe('U1', 'Der separate «Dauer»-Knopf ist weg',
    !/Dauer/.test(await knopfText()), (await knopfText()).replace(/\n/g, ' · ').slice(0, 120));

  const leitung = page.locator('.hc-editor-toolbar button', { hasText: 'Leitung' }).first();
  await leitung.click();
  await page.waitForTimeout(300);
  pruefe('U2', 'Ein Klick startet den Leitungsbefehl einmalig',
    /Leitung zeichnen …/.test(await leitung.innerText()), await leitung.innerText());

  await leitung.click();
  await page.waitForTimeout(300);
  pruefe('U3', 'Ein zweiter Klick macht ihn dauerhaft',
    /dauerhaft/.test(await leitung.innerText()), await leitung.innerText());

  await leitung.click();
  await page.waitForTimeout(300);
  pruefe('U4', 'Ein dritter Klick schaltet ihn aus',
    /Leitung zeichnen$/.test((await leitung.innerText()).trim()), await leitung.innerText());

  const kopfzeile = await page.locator('.hc-editor-header').innerText();
  pruefe('U5', 'Speichern und Verlauf liegen unter einem «Stände»-Knopf',
    /Stände/.test(kopfzeile) && !/Stand speichern/.test(kopfzeile),
    kopfzeile.replace(/\n/g, ' · ').slice(0, 120));
}

// ── 7. Zahnrad: persönliche Tastenbelegung ────────────────────────────────
kopf('Tastenbelegung hinter dem Zahnrad, pro Benutzer gespeichert');
{
  await w.frischLaden();
  await page.locator('.hc-editor-toolbar button[title*="Benutzerdefinierte"]').click();
  await page.waitForTimeout(400);
  pruefe('S1', 'Das Zahnrad öffnet die Tastenbelegung',
    await page.locator('.hc-shortcut-grid').isVisible(), 'Dialog offen');

  const feld = page.locator('#sc-shortcut_line');
  pruefe('S2', 'Die Standardbelegung steht drin', (await feld.inputValue()) === 'l',
    `Leitung = «${await feld.inputValue()}»`);

  await feld.fill('q');
  await page.waitForTimeout(700);
  await page.locator('.hc-stand-dialog__actions .is-primary').click();
  await page.waitForTimeout(300);

  // Die neue Taste wirkt sofort …
  const frei = await w.freieFlaeche();
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('q');
  await page.waitForTimeout(350);
  pruefe('S3', 'Die neue Taste startet den Leitungsbefehl',
    /Leitung/.test(await w.status()), await w.status());
  await page.keyboard.press('Escape');

  // … und die alte ist frei.
  await page.keyboard.press('l');
  await page.waitForTimeout(350);
  pruefe('S4', 'Die alte Taste löst nichts mehr aus',
    /Modify/.test(await w.status()), await w.status());

  // Über einen Neustart hinweg: sie ist beim Benutzer gespeichert, nicht am Schema.
  await w.laden();
  await page.waitForTimeout(400);
  await page.mouse.move(frei.x, frei.y);
  await page.keyboard.press('q');
  await page.waitForTimeout(350);
  pruefe('S5', 'Nach dem Neuladen gilt sie weiterhin',
    /Leitung/.test(await w.status()), await w.status());
  await page.keyboard.press('Escape');

  // Aufräumen: zurück auf Standard, damit die späteren Läufe l/p vorfinden.
  await page.locator('.hc-editor-toolbar button[title*="Benutzerdefinierte"]').click();
  await page.waitForTimeout(300);
  await page.locator('.hc-stand-dialog__actions button', { hasText: 'Standardbelegung' }).click();
  await page.waitForTimeout(600);
  pruefe('S6', '«Standardbelegung» stellt sie wieder her',
    (await page.locator('#sc-shortcut_line').inputValue()) === 'l',
    `Leitung = «${await page.locator('#sc-shortcut_line').inputValue()}»`);
  await page.locator('.hc-stand-dialog__actions .is-primary').click();
  await page.waitForTimeout(300);
}

// ── 8. Schema als Vorlage speichern und wiederverwenden ───────────────────
kopf('Schemas als Vorlage speichern und wiederverwenden');
{
  await w.graphSetzen({
    nodes: [
      { id: 'e1', type: 'erzeuger', position: { x: 300, y: 300 }, data: { nr: 1 } },
      { id: 'sp1', type: 'speicher', position: { x: 800, y: 300 }, data: { nr: 2 } },
    ],
    edges: [], layer_config: {},
  });
  await w.laden();

  const vorlagenMenu = page.locator('.hc-toolbar-menu__trigger', { hasText: 'Vorlagen' }).first();
  await vorlagenMenu.click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: 'Dieses Schema als Vorlage speichern' }).click();
  await page.waitForTimeout(300);

  await page.locator('.hc-stand-field input').fill('E2E-Standardschaltung');
  await page.locator('.hc-stand-dialog__actions .is-primary').click();
  await page.waitForTimeout(1200);

  await vorlagenMenu.click();
  await page.waitForTimeout(300);
  const eintrag = page.locator('.hc-toolbar-menu__content button', { hasText: 'E2E-Standardschaltung' }).first();
  pruefe('V1', 'Die Vorlage steht im Menü', await eintrag.count() > 0,
    `${await eintrag.count()} Einträge`);

  // Leeres Schema, dann Vorlage laden — sie muss die Bauteile zurückbringen.
  await page.keyboard.press('Escape');
  await w.graphSetzen({ nodes: [], edges: [], layer_config: {} });
  await w.laden();
  pruefe('V2', 'Ausgangslage ist leer',
    (await page.locator('.react-flow__node').count()) === 0,
    `${await page.locator('.react-flow__node').count()} Nodes`);

  await vorlagenMenu.click();
  await page.waitForTimeout(300);
  await page.locator('.hc-toolbar-menu__content button', { hasText: 'E2E-Standardschaltung' }).first().click();
  await page.waitForTimeout(900);
  const nachher = await page.locator('.react-flow__node').count();
  pruefe('V3', 'Die Vorlage bringt die Bauteile zurück', nachher === 2, `${nachher} Nodes`);

  // Rückgängig muss das Laden als EINE Aktion zurücknehmen.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(700);
  pruefe('V4', 'Rückgängig nimmt das Laden als EINE Aktion zurück',
    (await page.locator('.react-flow__node').count()) === 0,
    `${await page.locator('.react-flow__node').count()} Nodes`);
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 3).join(' || '));
await page.screenshot({ path: `${OUT}/bedienung.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
