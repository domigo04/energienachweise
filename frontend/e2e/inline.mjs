// Bauteil direkt in eine Leitung einsetzen — Sprintpunkte 5-10 und 28 A-K.
//
// Geprüft wird die TOPOLOGIE nach dem Einsetzen, nicht nur das Aussehen:
//
//   vorher:   A ────────── B
//   nachher:  A ── Bauteil.Port1 | Bauteil.Port2 ── B
//
// Dazu: Übernahme der technischen Leitungsdaten, Rückgängigmachen als EINE
// Aktion, Speichern/Neuladen — und die Produktregel, dass eine bloss
// geometrische Kreuzung KEINE Verbindung erzeugt.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('inline');
const w = await starten();
const { page } = w;
const OUT = w.cfg.arbeitsordner;

/** Eine Leitung mit technischen Daten, die das Einsetzen erhalten muss. */
const leitungMitDaten = (punkte, extra = {}) => ({
  id: 'e1', source: 'a1', sourceHandle: 'center-source',
  target: 'a2', targetHandle: 'center-target', type: 'flow',
  data: {
    layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8,
    points: punkte,
    // Fachdaten, die beide Teilstücke übernehmen müssen.
    dn: 40, laenge_m: 12.5, medium: 'wasser',
    ...extra,
  },
  style: { stroke: '#ef4444', strokeWidth: 4.5 },
});

const szenario = async (punkte, ankerA, ankerB) => {
  await w.graphSetzen({
    nodes: [
      { id: 'a1', type: 'junction', position: ankerA, data: { cad_anchor: true } },
      { id: 'a2', type: 'junction', position: ankerB, data: { cad_anchor: true } },
    ],
    edges: [leitungMitDaten(punkte)],
    layer_config: {},
  });
  await w.laden();
};

/** Bauteil aus der Bibliothek laden und über einem Punkt schweben lassen. */
const schweben = async (label, weltPunkt) => {
  const item = await w.palette(label);
  if (!item) return null;
  await item.click({ force: true });
  await page.waitForTimeout(220);
  const s = await w.weltZuScreen(weltPunkt);
  await page.mouse.move(s.x, s.y);
  await page.waitForTimeout(320);
  return s;
};

const kantenBild = (g) => (g.edges || [])
  .map((e) => `${e.source}/${e.sourceHandle}→${e.target}/${e.targetHandle}`).sort().join('  ');

// ═══ A) Waagrechte Leitung ═════════════════════════════════════════════════
kopf('A) Pumpe in eine waagrechte Leitung einsetzen');
await w.frischLaden();
await szenario([{ x: 420, y: 500 }, { x: 900, y: 500 }], { x: 380, y: 500 }, { x: 940, y: 500 });

const vorA = await w.graphLesen();
pruefe('A0', 'Ausgangslage: eine Leitung, zwei Anker',
  (vorA.edges || []).length === 1 && (vorA.nodes || []).length === 2,
  `${(vorA.nodes || []).length} Knoten, ${(vorA.edges || []).length} Kanten`);

// Punkt 25 — die Hervorhebung muss erscheinen, BEVOR geklickt wird.
const schwebePunkt = { x: 660, y: 500 };
const s = await schweben('Pumpe', schwebePunkt);
pruefe('A1', 'Bibliothek: Pumpe geladen', !!s, s ? `${s.x},${s.y}` : '—');
const hinweis = (await w.svgTexte()).some((t) => /in Leitung einsetzen/.test(t));
pruefe('A2', 'Sichtbarer Hinweis „in Leitung einsetzen"', hinweis,
  (await w.svgTexte()).slice(0, 5).join(' / '));

await page.mouse.click(s.x, s.y);
await page.waitForTimeout(1500);

const nachA = await w.graphLesen();
const pumpen = (nachA.nodes || []).filter((n) => n.type === 'pump');
pruefe('A3', 'Pumpe ist im Graphen', pumpen.length === 1, `${pumpen.length}`);
const pid = pumpen[0]?.id;

// Punkt 5/8 — genau zwei Kanten, beide an der Pumpe.
const kA = nachA.edges || [];
pruefe('A4', 'Die Leitung ist in genau zwei Kanten geteilt', kA.length === 2,
  `${kA.length}: ${kantenBild(nachA)}`);
const anPumpe = kA.filter((e) => e.source === pid || e.target === pid);
pruefe('A5', 'Beide Kanten hängen an der Pumpe', anPumpe.length === 2,
  `${anPumpe.length}`);
// Die Aussenenden müssen die alten Anker bleiben.
const aussen = new Set(kA.flatMap((e) => [e.source, e.target]).filter((x) => x !== pid));
pruefe('A6', 'Die Aussenenden sind noch die alten Anker',
  aussen.has('a1') && aussen.has('a2') && aussen.size === 2,
  [...aussen].join(', '));
// Punkt 7 — die Pumpe wird über ihre beiden Achsenanschlüsse eingebunden.
const handles = kA.map((e) => (e.source === pid ? e.sourceHandle : e.targetHandle)).sort();
pruefe('A7', 'Ein- und Ausgang sind verschiedene Anschlüsse',
  handles.length === 2 && handles[0] !== handles[1], handles.join(' / '));

// Punkt 8 — technische Daten in BEIDEN Teilstücken.
const datenOk = kA.every((e) => e.data?.layer_id === 'heizung_vl' && e.data?.dn === 40
  && e.data?.medium === 'wasser');
pruefe('A8', 'Layer, DN und Medium sind in beiden Teilstücken erhalten', datenOk,
  kA.map((e) => `layer=${e.data?.layer_id} dn=${e.data?.dn} medium=${e.data?.medium}`).join(' | '));
// Die Länge wird aufgeteilt, nicht verdoppelt.
const summe = kA.reduce((acc, e) => acc + (Number(e.data?.laenge_m) || 0), 0);
pruefe('A9', 'Die Leitungslänge ist aufgeteilt, nicht verdoppelt',
  Math.abs(summe - 12.5) < 0.2, `${summe.toFixed(2)} m (vorher 12.5)`);
pruefe('A10', 'Keine zusätzliche Junction entstanden',
  (nachA.nodes || []).filter((n) => n.type === 'junction').length === 2,
  `${(nachA.nodes || []).filter((n) => n.type === 'junction').length} Junctions`);

// ── F) Rückgängig stellt die ursprüngliche Leitung wieder her ──────────────
await page.keyboard.press('Control+z');
await page.waitForTimeout(1600);
const nachUndo = await w.graphLesen();
pruefe('F1', 'Undo entfernt das Bauteil und stellt EINE Leitung wieder her',
  (nachUndo.nodes || []).filter((n) => n.type === 'pump').length === 0
  && (nachUndo.edges || []).length === 1,
  `${(nachUndo.nodes || []).filter((n) => n.type === 'pump').length} Pumpen, ${(nachUndo.edges || []).length} Kanten`);
const alteKante = (nachUndo.edges || [])[0];
pruefe('F2', 'Die wiederhergestellte Leitung hat ihre Geometrie und Daten',
  alteKante?.data?.dn === 40 && Number(alteKante?.data?.laenge_m) === 12.5
  && JSON.stringify(alteKante?.data?.points) === JSON.stringify([{ x: 420, y: 500 }, { x: 900, y: 500 }]),
  `dn=${alteKante?.data?.dn} l=${alteKante?.data?.laenge_m} pts=${JSON.stringify(alteKante?.data?.points)}`);

// ── G) Wiederherstellen ────────────────────────────────────────────────────
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(1600);
const nachRedo = await w.graphLesen();
pruefe('G1', 'Redo setzt Bauteil und beide Teilstücke wieder',
  (nachRedo.nodes || []).filter((n) => n.type === 'pump').length === 1
  && (nachRedo.edges || []).length === 2,
  `${(nachRedo.nodes || []).filter((n) => n.type === 'pump').length} Pumpen, ${(nachRedo.edges || []).length} Kanten`);

// ── H) Speichern und Neuladen ──────────────────────────────────────────────
await w.laden();
const nachReload = await w.graphLesen();
pruefe('H1', 'Nach Neuladen: Bauteil und beide Teilstücke unverändert',
  (nachReload.nodes || []).filter((n) => n.type === 'pump').length === 1
  && (nachReload.edges || []).length === 2
  && kantenBild(nachReload) === kantenBild(nachRedo),
  kantenBild(nachReload));
pruefe('H2', 'Nach Neuladen: technische Daten noch da',
  (nachReload.edges || []).every((e) => e.data?.dn === 40 && e.data?.layer_id === 'heizung_vl'),
  (nachReload.edges || []).map((e) => `dn=${e.data?.dn}`).join(' | '));

// ═══ B) Senkrechte Leitung ═════════════════════════════════════════════════
kopf('B) Pumpe in eine senkrechte Leitung einsetzen');
await w.frischLaden();
await szenario([{ x: 640, y: 380 }, { x: 640, y: 780 }], { x: 640, y: 340 }, { x: 640, y: 820 });
{
  const sp = await schweben('Pumpe', { x: 640, y: 580 });
  const hin = (await w.svgTexte()).some((t) => /in Leitung einsetzen/.test(t));
  pruefe('B1', 'Hinweis erscheint auch an der senkrechten Leitung', hin, `${hin}`);
  await page.mouse.click(sp.x, sp.y);
  await page.waitForTimeout(1500);
  const g = await w.graphLesen();
  const p = (g.nodes || []).find((n) => n.type === 'pump');
  pruefe('B2', 'Die senkrechte Leitung ist in zwei Kanten geteilt',
    (g.edges || []).length === 2 && !!p, `${(g.edges || []).length} Kanten`);
  const hs = (g.edges || []).map((e) => (e.source === p?.id ? e.sourceHandle : e.targetHandle)).sort();
  pruefe('B3', 'Anschlüsse sind auch senkrecht verschieden', hs[0] !== hs[1], hs.join(' / '));
  // Punkt 7: bei senkrechter Leitung soll das Bauteil NICHT gedreht werden.
  pruefe('B4', 'Bauteil ist an der Leitungsrichtung ausgerichtet',
    !p?.data?.rotation || p.data.rotation === 0, `rotation=${p?.data?.rotation ?? 0}`);
}

// ═══ Nicht geeignete Bauteile ══════════════════════════════════════════════
kopf('Nicht inline-fähige Bauteile teilen die Leitung nicht (Punkt 6)');
await w.frischLaden();
await szenario([{ x: 420, y: 500 }, { x: 900, y: 500 }], { x: 380, y: 500 }, { x: 940, y: 500 });
{
  const sp = await schweben('Speicher', { x: 660, y: 500 });
  const hin = (await w.svgTexte()).some((t) => /in Leitung einsetzen/.test(t));
  pruefe('N1', 'Kein Einsetz-Hinweis für einen Speicher', !hin, `Hinweis sichtbar: ${hin}`);
  if (sp) {
    await page.mouse.click(sp.x, sp.y);
    await page.waitForTimeout(1400);
    const g = await w.graphLesen();
    pruefe('N2', 'Die Leitung bleibt eine Kante',
      (g.edges || []).length === 1, `${(g.edges || []).length} Kanten`);
    pruefe('N3', 'Der Speicher ist trotzdem gesetzt (frei platziert)',
      (g.nodes || []).some((n) => n.type === 'speicher'),
      (g.nodes || []).map((n) => n.type).join(', '));
  }
}

// ═══ J) Geometrische Kreuzung erzeugt KEINE Verbindung ═════════════════════
kopf('J) Kreuzung bleibt Kreuzung (Produktregel Punkt 23/24)');
await w.frischLaden();
{
  // Eine waagrechte Leitung liegt bereits. Darüber wird eine senkrechte
  // gezeichnet, die die erste KREUZT, aber nicht auf ihr endet.
  await w.graphSetzen({
    nodes: [
      { id: 'h1', type: 'junction', position: { x: 400, y: 560 }, data: { cad_anchor: true } },
      { id: 'h2', type: 'junction', position: { x: 900, y: 560 }, data: { cad_anchor: true } },
    ],
    edges: [{
      id: 'eh', source: 'h1', sourceHandle: 'center-source', target: 'h2', targetHandle: 'center-target',
      type: 'flow',
      data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
      style: { stroke: '#ef4444', strokeWidth: 4.5 },
    }],
    layer_config: {},
  });
  await w.laden();
  const oben = await w.weltZuScreen({ x: 650, y: 420 });
  const unten = await w.weltZuScreen({ x: 650, y: 700 });
  // Start und Ende bewusst NEBEN der bestehenden Leitung, der Weg kreuzt sie.
  await w.leitungStarten(oben);
  await page.mouse.click(oben.x, oben.y);
  await page.waitForTimeout(250);
  await page.mouse.move(unten.x, unten.y);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1600);
  const g = await w.graphLesen();
  const kanten = g.edges || [];
  // Die bestehende Leitung darf NICHT geteilt worden sein.
  const bestand = kanten.filter((e) => e.id === 'eh');
  pruefe('J1', 'Die gekreuzte Leitung ist ungeteilt geblieben', bestand.length === 1,
    `${bestand.length}× eh, insgesamt ${kanten.length} Kanten`);
  const verbunden = kanten.some((e) =>
    (e.source === 'h1' || e.source === 'h2' || e.target === 'h1' || e.target === 'h2')
    && e.id !== 'eh');
  pruefe('J2', 'Die neue Leitung ist NICHT an die gekreuzte angeschlossen', !verbunden,
    kantenBild(g));
}

// ═══ K) Bewusstes Enden auf einer Leitung erzeugt eine Verbindung ══════════
kopf('K) Enden auf einer Leitung erzeugt eine Verbindung');
await w.frischLaden();
{
  await w.graphSetzen({
    nodes: [
      { id: 'h1', type: 'junction', position: { x: 400, y: 560 }, data: { cad_anchor: true } },
      { id: 'h2', type: 'junction', position: { x: 900, y: 560 }, data: { cad_anchor: true } },
    ],
    edges: [{
      id: 'eh', source: 'h1', sourceHandle: 'center-source', target: 'h2', targetHandle: 'center-target',
      type: 'flow',
      data: { layer_id: 'heizung_vl', cad_polyline: true, polyline_version: 1, corner_radius: 8, points: [] },
      style: { stroke: '#ef4444', strokeWidth: 4.5 },
    }],
    layer_config: {},
  });
  await w.laden();
  const oben = await w.weltZuScreen({ x: 650, y: 400 });
  const auf = await w.weltZuScreen({ x: 650, y: 560 });   // genau AUF der Leitung
  await w.leitungStarten(oben);
  await page.mouse.click(oben.x, oben.y);
  await page.waitForTimeout(250);
  const { sonde } = await w.zielen(auf);
  // Beides ist ein Fang AUF der Leitung; „midpoint" ist nur der präzisere Fall.
  pruefe('K1', 'Der Fang liegt auf der Leitung',
    sonde?.typ === 'nearest' || sonde?.typ === 'midpoint', `${sonde?.typ ?? '—'}`);
  await page.mouse.click(auf.x, auf.y);
  await page.waitForTimeout(1700);
  const g = await w.graphLesen();
  // Ein bewusstes T-Stück teilt die bestehende Leitung in zwei Teile.
  pruefe('K2', 'Die bestehende Leitung ist bewusst geteilt (T-Stück)',
    (g.edges || []).length >= 3, `${(g.edges || []).length} Kanten: ${kantenBild(g)}`);
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 3).join(' || '));
await page.screenshot({ path: `${OUT}/inline.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
