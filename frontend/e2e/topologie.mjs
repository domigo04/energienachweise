// T-Stücke, Abzweig-Bauteile und Ausrichten — Sprintpunkte 23-29, 48, 49, 51.
//
// Geprüft wird immer die TOPOLOGIE im gespeicherten Graphen, nicht das Bild:
//
//   Leitungsende auf einem Eckpunkt:   A ──●── B   und   C → ●
//   Sicherheitsventil an der Leitung:  A ──●── B   und   ● → SV
//
// Eine rein optische Kreuzung darf weiterhin NICHTS verbinden.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('topologie');
const w = await starten();
const { page } = w;
const OUT = w.cfg.arbeitsordner;

const anker = (id, x, y) => ({ id, type: 'junction', position: { x, y }, data: { cad_anchor: true } });

/** Leitung mit Fachdaten, die ein Split vollständig erhalten muss (§27). */
const leitung = (id, a, b, punkte, extra = {}) => ({
  id, source: a, sourceHandle: 'center-source', target: b, targetHandle: 'center-target',
  type: 'flow',
  data: {
    layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8,
    points: punkte, dn: 40, laenge_m: 12.5, medium: 'wasser', ...extra,
  },
  style: { stroke: '#ef4444', strokeWidth: 4.5 },
});

const junctions = (g) => (g.nodes || []).filter((n) => n.type === 'junction');
const kantenAn = (g, id) => (g.edges || []).filter((e) => e.source === id || e.target === id);

// ═══ A) Leitungsende exakt auf einen bestehenden ECKPUNKT (§24/§25) ════════
kopf('A) T-Stück auf einem bestehenden Polylinien-Eckpunkt');
await w.frischLaden();
// Bestehende Leitung mit einer Ecke bei (900|400):
//   (500|400) ── (900|400) ── (900|800)
await w.graphSetzen({
  nodes: [anker('a1', 500, 400), anker('a2', 900, 800)],
  edges: [leitung('e1', 'a1', 'a2', [{ x: 500, y: 400 }, { x: 900, y: 400 }, { x: 900, y: 800 }])],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

const vorA = await w.graphLesen();
pruefe('A0', 'Ausgangslage: eine Leitung mit einem Eckpunkt',
  (vorA.edges || []).length === 1 && (vorA.edges[0].data?.points || []).length === 3,
  `${(vorA.edges || []).length} Kanten, ${(vorA.edges?.[0]?.data?.points || []).length} Punkte`);

// Neue Leitung von links unten auf genau diesen Eckpunkt zeichnen.
const start = await w.weltZuScreen({ x: 500, y: 700 });
const ecke = await w.weltZuScreen({ x: 900, y: 400 });
await page.keyboard.press('l');
await page.waitForTimeout(200);
await page.mouse.click(start.x, start.y);
await page.waitForTimeout(250);
await page.mouse.move(ecke.x, ecke.y);
await page.waitForTimeout(400);

const marker = await w.markerAusSvg();
pruefe('A1', 'Der Fangmarker meldet einen Eckpunkt', marker?.label === 'Eckpunkt',
  marker ? `${marker.label}` : 'kein Marker');

await page.mouse.click(ecke.x, ecke.y);
await page.waitForTimeout(1400);

const nachA = await w.graphLesen();
// Die alte Leitung muss an der Ecke geteilt sein: 2 Teilstücke + 1 neue Leitung.
pruefe('A2', 'Aus einer Leitung sind drei geworden (zwei Teilstücke + neue)',
  (nachA.edges || []).length === 3, `${(nachA.edges || []).length} Kanten`);

// Der Knoten an der Ecke muss von DREI Leitungen berührt werden — das ist das T.
const treffer = junctions(nachA)
  .map((n) => ({ n, k: kantenAn(nachA, n.id).length }))
  .find((x) => x.k >= 3);
pruefe('A3', 'An der Ecke hängen drei Leitungen (echte Junction)', !!treffer,
  junctions(nachA).map((n) => `${n.id}:${kantenAn(nachA, n.id).length}`).join(' '));
pruefe('A4', 'Die Junction sitzt genau auf dem alten Eckpunkt',
  !!treffer && Math.abs(treffer.n.position.x - 900) < 6 && Math.abs(treffer.n.position.y - 400) < 6,
  treffer ? `${Math.round(treffer.n.position.x)}|${Math.round(treffer.n.position.y)}` : '—');

// §27 — beide Teilstücke behalten die Fachdaten, die Länge wird geteilt.
const teile = (nachA.edges || []).filter((e) => e.data?.dn === 40);
pruefe('A5', 'Beide Teilstücke behalten Layer, DN und Medium',
  teile.length === 2 && teile.every((e) => e.data?.layer_id === 'heizung_vl' && e.data?.medium === 'wasser'),
  teile.map((e) => `dn=${e.data?.dn} layer=${e.data?.layer_id}`).join(' | '));
const summe = teile.reduce((acc, e) => acc + (Number(e.data?.laenge_m) || 0), 0);
pruefe('A6', 'Die Leitungslänge ist geteilt, nicht verdoppelt',
  Math.abs(summe - 12.5) < 0.3, `${summe.toFixed(2)} m (vorher 12.5)`);
// §25 — der Eckpunkt darf danach nicht mehr als Stützpunkt doppelt vorkommen.
const doppelt = teile.some((e) => (e.data?.points || [])
  .some((p) => Math.abs(p.x - 900) < 2 && Math.abs(p.y - 400) < 2));
pruefe('A7', 'Der Eckpunkt ist jetzt Knoten und kein Stützpunkt mehr', !doppelt,
  teile.map((e) => JSON.stringify(e.data?.points)).join(' | '));

// ── Undo / Redo als EINE Aktion (§29) ──
await page.keyboard.press('Control+z');
await page.waitForTimeout(1500);
const nachUndo = await w.graphLesen();
pruefe('A8', 'Undo stellt die eine durchgehende Leitung wieder her',
  (nachUndo.edges || []).length === 1
  && (nachUndo.edges[0].data?.points || []).length === 3,
  `${(nachUndo.edges || []).length} Kanten`);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(1500);
pruefe('A9', 'Redo stellt das T-Stück wieder her',
  ((await w.graphLesen()).edges || []).length === 3,
  `${((await w.graphLesen()).edges || []).length} Kanten`);

// ── Speichern und Neuladen (§48 G) ──
await w.laden();
const nachReload = await w.graphLesen();
pruefe('A10', 'Nach Neuladen bleiben drei Leitungen und das T bestehen',
  (nachReload.edges || []).length === 3
  && junctions(nachReload).some((n) => kantenAn(nachReload, n.id).length >= 3),
  `${(nachReload.edges || []).length} Kanten`);

// ═══ B) Reine Kreuzung verbindet weiterhin NICHT (§23, Regression) ═════════
kopf('B) Optische Kreuzung erzeugt keine Verbindung');
await w.frischLaden();
await w.graphSetzen({
  nodes: [anker('a1', 400, 500), anker('a2', 1000, 500)],
  edges: [leitung('e1', 'a1', 'a2', [{ x: 400, y: 500 }, { x: 1000, y: 500 }])],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

const obenS = await w.weltZuScreen({ x: 700, y: 260 });
const untenS = await w.weltZuScreen({ x: 700, y: 760 });
await page.keyboard.press('l');
await page.waitForTimeout(200);
await page.mouse.click(obenS.x, obenS.y);
await page.waitForTimeout(250);
await page.mouse.move(untenS.x, untenS.y);
await page.waitForTimeout(300);
await page.mouse.click(untenS.x, untenS.y);
await page.waitForTimeout(1400);

const nachB = await w.graphLesen();
pruefe('B1', 'Die gekreuzte Leitung bleibt ungeteilt',
  (nachB.edges || []).filter((e) => e.data?.dn === 40).length === 1,
  `${(nachB.edges || []).filter((e) => e.data?.dn === 40).length} Teilstücke der alten Leitung`);
pruefe('B2', 'Keine Junction mit drei Leitungen entstanden',
  !junctions(nachB).some((n) => kantenAn(nachB, n.id).length >= 3),
  junctions(nachB).map((n) => `${n.id}:${kantenAn(nachB, n.id).length}`).join(' '));

// ═══ C) Sicherheitsventil als Abzweig (§17-§19, §49) ═══════════════════════
kopf('C) Sicherheitsventil hängt als Abzweig an der Leitung');
await w.frischLaden();
await w.graphSetzen({
  nodes: [anker('a1', 400, 600), anker('a2', 1000, 600)],
  edges: [leitung('e1', 'a1', 'a2', [{ x: 400, y: 600 }, { x: 1000, y: 600 }])],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

const sv = await w.palette('Sicherheitsventil');
pruefe('C0', 'Sicherheitsventil in der Bauteilliste gefunden', !!sv);
await sv.click({ force: true });
await page.waitForTimeout(220);
// Leicht OBERHALB der Leitung schweben — der Abzweig soll nach oben zeigen.
const ueber = await w.weltZuScreen({ x: 700, y: 588 });
await page.mouse.move(ueber.x, ueber.y);
await page.waitForTimeout(380);
const svHinweis = (await w.svgTexte()).some((t) => /Abzweig an Leitung/.test(t));
pruefe('C1', 'Vorschau meldet „Abzweig an Leitung"', svHinweis,
  (await w.svgTexte()).slice(0, 6).join(' / '));

await page.mouse.click(ueber.x, ueber.y);
await page.waitForTimeout(1500);

const nachC = await w.graphLesen();
const svNode = (nachC.nodes || []).find((n) => n.type === 'sicherheitsventil');
pruefe('C2', 'Sicherheitsventil ist im Graphen', !!svNode);
pruefe('C3', 'Die Leitung ist geteilt und der Stich ergänzt (drei Kanten)',
  (nachC.edges || []).length === 3, `${(nachC.edges || []).length} Kanten`);
const svKanten = svNode ? kantenAn(nachC, svNode.id) : [];
pruefe('C4', 'Das Sicherheitsventil hat genau EINEN Anschluss im Graphen',
  svKanten.length === 1,
  svKanten.map((e) => `${e.source}→${e.target}`).join(' '));
pruefe('C5', 'Der Stich hängt am Abzweig-Anschluss des Ventils',
  svKanten[0] && (svKanten[0].targetHandle === 'an' || svKanten[0].sourceHandle === 'an'),
  svKanten[0] ? `${svKanten[0].sourceHandle}/${svKanten[0].targetHandle}` : '—');
const abzweig = junctions(nachC).find((n) => kantenAn(nachC, n.id).length === 3);
pruefe('C6', 'An der Leitung ist eine echte Junction mit drei Kanten entstanden', !!abzweig,
  junctions(nachC).map((n) => `${n.id}:${kantenAn(nachC, n.id).length}`).join(' '));
pruefe('C7', 'Das Ventil liegt NICHT im Hauptstrom (a1 und a2 bleiben Aussenenden)',
  (nachC.edges || []).some((e) => e.source === 'a1' || e.target === 'a1')
  && (nachC.edges || []).some((e) => e.source === 'a2' || e.target === 'a2'),
  '');
pruefe('C8', 'Das Ventil steht oberhalb der Leitung (Cursorseite)',
  !!svNode && svNode.position.y < 600, `y=${Math.round(svNode?.position?.y ?? 0)}`);

await page.keyboard.press('Control+z');
await page.waitForTimeout(1500);
const svUndo = await w.graphLesen();
pruefe('C9', 'Undo nimmt Ventil, Junction und Split in EINEM Schritt zurück',
  (svUndo.edges || []).length === 1
  && !(svUndo.nodes || []).some((n) => n.type === 'sicherheitsventil'),
  `${(svUndo.edges || []).length} Kanten`);

// ═══ D) 3-Weg-Ventil inline mit freiem drittem Anschluss (§21, §49) ════════
kopf('D) 3-Weg-Ventil inline einsetzen, dritter Anschluss bleibt frei');
await w.frischLaden();
await w.graphSetzen({
  nodes: [anker('a1', 400, 600), anker('a2', 1000, 600)],
  edges: [leitung('e1', 'a1', 'a2', [{ x: 400, y: 600 }, { x: 1000, y: 600 }])],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

const v3 = await w.palette('3-Weg-Mischventil');
pruefe('D0', '3-Weg-Ventil in der Bauteilliste gefunden', !!v3);
await v3.click({ force: true });
await page.waitForTimeout(220);
const aufLeitung = await w.weltZuScreen({ x: 700, y: 600 });
await page.mouse.move(aufLeitung.x, aufLeitung.y);
await page.waitForTimeout(380);
pruefe('D1', 'Vorschau meldet „in Leitung einsetzen"',
  (await w.svgTexte()).some((t) => /in Leitung einsetzen/.test(t)),
  (await w.svgTexte()).slice(0, 6).join(' / '));

await page.mouse.click(aufLeitung.x, aufLeitung.y);
await page.waitForTimeout(1500);

const nachD = await w.graphLesen();
const v3Node = (nachD.nodes || []).find((n) => n.type === 'valve3');
pruefe('D2', '3-Weg-Ventil ist im Graphen', !!v3Node);
pruefe('D3', 'Die Leitung ist in genau zwei Kanten geteilt',
  (nachD.edges || []).length === 2, `${(nachD.edges || []).length} Kanten`);
const v3Kanten = v3Node ? kantenAn(nachD, v3Node.id) : [];
const v3Handles = v3Kanten.map((e) => (e.source === v3Node.id ? e.sourceHandle : e.targetHandle));
pruefe('D4', 'Beide Kanten hängen am Ventil, an verschiedenen Anschlüssen',
  v3Kanten.length === 2 && v3Handles[0] !== v3Handles[1], v3Handles.join(' / '));
pruefe('D5', 'Der dritte Anschluss (right) bleibt frei',
  !v3Handles.includes('right'), v3Handles.join(' / '));

// Alle drei Anschlüsse müssen gefangen werden können.
await w.mausWeg();
const v3Ports = v3Node ? await w.portsVon(v3Node.id) : [];
const portIds = v3Ports.map((p) => p.handleId);
pruefe('D6', 'Alle drei Anschlüsse sind vorhanden (top/bottom/right)',
  ['top', 'bottom', 'right'].every((id) => portIds.includes(id)), portIds.join(', '));

// Rotation: IDs bleiben stabil, die Positionen drehen mit (§22).
const vorRot = v3Node ? await w.portsWeltVon(v3Node.id) : [];
await page.mouse.click(aufLeitung.x, aufLeitung.y);   // Ventil auswählen
await page.waitForTimeout(300);
await page.keyboard.press('d');
await page.waitForTimeout(900);
await w.mausWeg();
const nachRot = v3Node ? await w.portsWeltVon(v3Node.id) : [];
pruefe('D7', 'Nach dem Drehen sind die Anschluss-IDs unverändert',
  nachRot.length === vorRot.length
  && nachRot.map((p) => p.handleId).sort().join() === vorRot.map((p) => p.handleId).sort().join(),
  nachRot.map((p) => p.handleId).join(', '));
const bewegt = nachRot.some((p) => {
  const alt = vorRot.find((q) => q.handleId === p.handleId);
  return alt && Math.hypot(p.x - alt.x, p.y - alt.y) > 5;
});
pruefe('D8', 'Die Anschlüsse drehen mit dem Symbol mit', bewegt, '');

// ═══ E) Bauteilliste ist scrollbar (§30-§32, §50) ══════════════════════════
kopf('E) Bauteilliste scrollen, ohne den Canvas zu zoomen');
await w.frischLaden();
await page.setViewportSize({ width: 1280, height: 620 });
await page.waitForTimeout(500);
// Alle Gruppen aufklappen, damit die Liste garantiert länger ist als die Sidebar.
const trigger = await page.locator('.hc-palette-group__trigger').all();
for (const t of trigger) {
  const offen = (await t.getAttribute('class'))?.includes('is-open');
  if (!offen) { await t.click(); await page.waitForTimeout(90); }
}
await page.waitForTimeout(300);

const body = page.locator('.hc-palette-body');
const mass = await body.evaluate((el) => ({ scroll: el.scrollHeight, sicht: el.clientHeight }));
pruefe('E1', 'Die Liste ist länger als der sichtbare Bereich (sonst sagt der Test nichts)',
  mass.scroll > mass.sicht + 20, `${mass.scroll} > ${mass.sicht}`);

const zoomVorher = await w.zoomJetzt();
const box = await body.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(400);
const scrollNachher = await body.evaluate((el) => el.scrollTop);
pruefe('E2', 'Das Mausrad scrollt die Bauteilliste', scrollNachher > 20, `scrollTop=${scrollNachher}`);
pruefe('E3', 'Der Canvas-Zoom bleibt dabei unverändert',
  (await w.zoomJetzt()) === zoomVorher, `${zoomVorher} → ${await w.zoomJetzt()}`);

const letzterSichtbar = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.hc-palette-item')];
  const el = items.at(-1);
  const body = document.querySelector('.hc-palette-body');
  if (!el || !body) return false;
  const a = el.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  return a.top >= b.top - 2 && a.bottom <= b.bottom + 2;
});
pruefe('E4', 'Das unterste Bauteil ist nach dem Scrollen erreichbar', letzterSichtbar, '');
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(300);

// ═══ F) Ausrichten-Befehl (§34-§37, §51) ══════════════════════════════════
kopf('F) A richtet ein Segment am Referenzsegment aus');
await w.frischLaden();
// Referenz: exakt waagrecht bei y=400. Ziel: leicht schräg.
await w.graphSetzen({
  nodes: [anker('r1', 400, 400), anker('r2', 1000, 400),
          anker('z1', 400, 700), anker('z2', 1000, 760)],
  edges: [
    leitung('ref', 'r1', 'r2', [{ x: 400, y: 400 }, { x: 1000, y: 400 }]),
    leitung('ziel', 'z1', 'z2', [{ x: 400, y: 700 }, { x: 1000, y: 760 }]),
  ],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

await page.keyboard.press('a');
await page.waitForTimeout(300);
pruefe('F1', 'Der Befehl fragt nach dem Referenzsegment',
  (await page.locator('.react-flow__panel.top.center').innerText()).includes('Referenzsegment'),
  (await page.locator('.react-flow__panel.top.center').innerText()).split('\n')[0]);

const refKlick = await w.weltZuScreen({ x: 700, y: 400 });
await page.mouse.click(refKlick.x, refKlick.y);
await page.waitForTimeout(400);
pruefe('F2', 'Danach fragt er nach dem Segment zum Ausrichten',
  (await page.locator('.react-flow__panel.top.center').innerText()).includes('zum Ausrichten'),
  (await page.locator('.react-flow__panel.top.center').innerText()).split('\n')[0]);

// Nahe beim linken Ende klicken → dieses Ende bleibt stehen.
const zielKlick = await w.weltZuScreen({ x: 480, y: 708 });
await page.mouse.click(zielKlick.x, zielKlick.y);
await page.waitForTimeout(1400);

const nachF = await w.graphLesen();
const zielKante = (nachF.edges || []).find((e) => e.id === 'ziel');
const zielAnker = (id) => (nachF.nodes || []).find((n) => n.id === id)?.position;
const p1 = zielAnker('z1');
const p2 = zielAnker('z2');
pruefe('F3', 'Das Zielsegment liegt exakt waagrecht',
  !!p1 && !!p2 && Math.abs(p1.y - p2.y) < 1.5,
  `y ${Math.round(p1?.y ?? 0)} / ${Math.round(p2?.y ?? 0)}`);
pruefe('F4', 'Das angeklickte Ende ist stehen geblieben',
  !!p1 && Math.abs(p1.y - 700) < 1.5, `z1 y=${Math.round(p1?.y ?? 0)}`);
pruefe('F5', 'Der Befehl ist danach beendet (zurück in Modify)',
  !(await page.locator('body').innerText()).includes('Referenzsegment wählen'), '');
void zielKante;

// Zweiter Teil: zwei bereits parallele Segmente auf dieselbe Flucht bringen.
kopf('F) Bereits paralleles Segment auf dieselbe Flucht legen');
await w.frischLaden();
await w.graphSetzen({
  nodes: [anker('r1', 400, 400), anker('r2', 1000, 400),
          anker('z1', 400, 460), anker('z2', 1000, 460)],
  edges: [
    leitung('ref', 'r1', 'r2', [{ x: 400, y: 400 }, { x: 1000, y: 400 }]),
    leitung('ziel', 'z1', 'z2', [{ x: 400, y: 460 }, { x: 1000, y: 460 }]),
  ],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

await page.keyboard.press('a');
await page.waitForTimeout(250);
const ref2 = await w.weltZuScreen({ x: 700, y: 400 });
await page.mouse.click(ref2.x, ref2.y);
await page.waitForTimeout(350);
const ziel2 = await w.weltZuScreen({ x: 700, y: 460 });
await page.mouse.click(ziel2.x, ziel2.y);
await page.waitForTimeout(1400);

const nachF2 = await w.graphLesen();
const f2 = (id) => (nachF2.nodes || []).find((n) => n.id === id)?.position;
pruefe('F6', 'Das parallele Segment liegt jetzt auf der Referenz-Flucht',
  Math.abs((f2('z1')?.y ?? 0) - 400) < 1.5 && Math.abs((f2('z2')?.y ?? 0) - 400) < 1.5,
  `z1 y=${Math.round(f2('z1')?.y ?? 0)} z2 y=${Math.round(f2('z2')?.y ?? 0)}`);
pruefe('F7', 'Längs hat sich nichts verschoben',
  Math.abs((f2('z1')?.x ?? 0) - 400) < 1.5 && Math.abs((f2('z2')?.x ?? 0) - 1000) < 1.5,
  `z1 x=${Math.round(f2('z1')?.x ?? 0)} z2 x=${Math.round(f2('z2')?.x ?? 0)}`);

await page.keyboard.press('Control+z');
await page.waitForTimeout(1400);
const f2Undo = await w.graphLesen();
const undoPos = (f2Undo.nodes || []).find((n) => n.id === 'z1')?.position;
pruefe('F8', 'Undo nimmt die Ausrichtung als EINE Aktion zurück',
  Math.abs((undoPos?.y ?? 0) - 460) < 1.5, `z1 y=${Math.round(undoPos?.y ?? 0)}`);

// ── Portgebundenes Segment darf die Verbindung nicht verlieren (§37) ──
kopf('F) Portgebundenes Segment wird nicht stillschweigend gelöst');
await w.frischLaden();
await w.graphSetzen({
  nodes: [
    anker('r1', 400, 300), anker('r2', 1000, 300),
    { id: 'p1', type: 'pump', position: { x: 500, y: 700 }, data: { label: 'Pumpe' } },
    anker('z2', 1000, 760),
  ],
  edges: [
    leitung('ref', 'r1', 'r2', [{ x: 400, y: 300 }, { x: 1000, y: 300 }]),
    { id: 'ziel', source: 'p1', sourceHandle: 'right', target: 'z2', targetHandle: 'center-target',
      type: 'flow',
      data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8,
              points: [], dn: 40, laenge_m: 8, medium: 'wasser' },
      style: { stroke: '#ef4444', strokeWidth: 4.5 } },
  ],
  layer_config: {},
});
await w.laden();
await w.zoomAuf(1);

await page.keyboard.press('a');
await page.waitForTimeout(250);
const ref3 = await w.weltZuScreen({ x: 700, y: 300 });
await page.mouse.click(ref3.x, ref3.y);
await page.waitForTimeout(350);
// Ganz nah am Pumpenanschluss klicken → dieses Ende ist der feste Anschluss.
const nahPumpe = await w.weltZuScreen({ x: 580, y: 728 });
await page.mouse.click(nahPumpe.x, nahPumpe.y);
await page.waitForTimeout(1200);

const nachF3 = await w.graphLesen();
const zielF3 = (nachF3.edges || []).find((e) => e.id === 'ziel');
pruefe('F9', 'Die Leitung hängt weiterhin an der Pumpe',
  zielF3?.source === 'p1' && zielF3?.sourceHandle === 'right',
  `${zielF3?.source}/${zielF3?.sourceHandle}`);

await bilanz(OUT);
await w.browser.close();
