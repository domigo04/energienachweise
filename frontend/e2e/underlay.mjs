// Underlay gegen die CAD-Interaktion prüfen — Sprintpunkte 9-11.
//
// Die Unterlage darf die Bedienung NICHT beeinflussen: keine verschluckten
// Mausbewegungen, keine abgefangenen Klicks, kein verhinderter Anschlussfang,
// kein Versatz beim Zoomen.
//
// Der Vergleich läuft gegen dieselbe Messung ohne Unterlage — nur so ist
// „beeinflusst nicht" überhaupt eine überprüfbare Aussage.
import { protokoll, starten } from './lib.mjs';

const { pruefe, kopf, bilanz } = protokoll('underlay');
const w = await starten();
const { page, cfg } = w;
const OUT = cfg.arbeitsordner;

// Ein kleines, deutlich sichtbares Testbild als Unterlage (rotes Kreuz auf
// weissem Grund). Bewusst erzeugt statt hochgeladen — kein echter Plan.
const testBild = async () => page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 800, 600);
  g.strokeStyle = '#dc2626'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(400, 0); g.lineTo(400, 600); g.moveTo(0, 300); g.lineTo(800, 300); g.stroke();
  g.fillStyle = '#94a3b8'; g.font = '28px sans-serif'; g.fillText('TESTPLAN', 300, 120);
  return c.toDataURL('image/png');
});

/** Unterlage direkt in den Editorzustand setzen (wie nach einem Upload). */
const underlaySetzen = async (dataUrl) => {
  const r = await fetch(`${cfg.api}/api/v1/schemas/${cfg.schemaId}/underlay`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    // `UnderlayIn` ist FLACH — nicht unter `underlay` verschachtelt.
    body: JSON.stringify({
      mime: 'image/png', data: dataUrl, name: 'Testplan',
      x: 300, y: 200, w: 800, h: 600, scale: 1, opacity: 0.55, locked: true,
    }),
  });
  return r.status;
};

/** Eine Messreihe: Bauteil setzen, Anschluss fangen, Zoomtreue prüfen. */
async function messreihe(bezeichnung, praefix) {
  const box = await page.locator('.hc-canvas-wrap').boundingBox();
  const mitte = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

  // 1. Bauteil platzieren
  const pumpeId = await w.setzen('Pumpe', mitte.x - 60, mitte.y - 140);
  pruefe(`${praefix}1`, `${bezeichnung}: Bauteil per Klick platzierbar`, !!pumpeId, pumpeId || '—');
  if (!pumpeId) return null;
  await w.zoomAuf(100);

  // 2./3. Leitung starten und Anschluss fangen
  const ports = await w.portsVon(pumpeId);
  const frei = await w.freieFlaeche();
  pruefe(`${praefix}2`, `${bezeichnung}: freie Zeichenfläche gefunden`, !!frei,
    frei ? `${frei.x},${frei.y}` : 'keine');
  if (!frei || !ports.length) return null;

  await w.leitungStarten(frei);
  await page.mouse.click(frei.x, frei.y);
  await page.waitForTimeout(250);

  // 4. Mausbewegung darf nicht verschluckt werden: das Mass muss erscheinen.
  await page.mouse.move(frei.x + 200, frei.y + 10);
  await page.waitForTimeout(320);
  const masse = (await w.svgTexte()).filter((t) => /^\d+\s*(mm|m)$/.test(t));
  pruefe(`${praefix}3`, `${bezeichnung}: Mausbewegung kommt an (Mass erscheint)`,
    masse.length > 0, masse.join(' / ') || 'kein Mass');

  // 5. numerische Eingabe
  await page.keyboard.type('2400');
  await page.waitForTimeout(220);
  const st = await w.status();
  pruefe(`${praefix}4`, `${bezeichnung}: numerische Eingabe möglich`, /2400/.test(st), st);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);

  // 6. Anschlussfang
  const ziel = ports.reduce((a, b) => (b.y < a.y ? b : a), ports[0]);
  const { sonde, marker } = await w.zielen(ziel);
  pruefe(`${praefix}5`, `${bezeichnung}: Anschlussfang funktioniert`,
    sonde?.typ === 'port' && sonde?.nodeId === pumpeId && marker?.label === 'Anschluss',
    `Sonde ${sonde?.typ ?? '—'}, Marker ${marker?.label ?? '—'}`);
  await w.abbrechen();

  // 7. Zoomtreue: Weltpunkt unter dem Cursor bleibt stabil
  const zx = mitte.x + 80;
  const zy = mitte.y + 40;
  const weltUnterCursor = () => page.evaluate(([x, y]) => {
    const el = document.querySelector('.react-flow__viewport');
    const m = new DOMMatrix(getComputedStyle(el).transform);
    const r = document.querySelector('.react-flow').getBoundingClientRect();
    return { x: (x - r.left - m.e) / m.a, y: (y - r.top - m.f) / m.d };
  }, [zx, zy]);
  await page.mouse.move(zx, zy);
  const vor = await weltUnterCursor();
  for (let i = 0; i < 5; i += 1) { await page.mouse.wheel(0, -120); await page.waitForTimeout(110); }
  const nach = await weltUnterCursor();
  const drift = Math.hypot(nach.x - vor.x, nach.y - vor.y);
  pruefe(`${praefix}6`, `${bezeichnung}: Zoom auf Cursor ohne Versatz`, drift < 12,
    `Drift ${drift.toFixed(1)} mm`);

  // 8. Auswahlfenster auf leerer Fläche
  await w.zoomAuf(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const a = { x: box.x + 120, y: box.y + box.height - 260 };
  const b = { x: box.x + 420, y: box.y + box.height - 120 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(150);
  const rechteck = await page.locator('.react-flow__selection').count();
  await page.mouse.up();
  await page.waitForTimeout(250);
  pruefe(`${praefix}7`, `${bezeichnung}: Auswahlrechteck lässt sich aufziehen`,
    rechteck > 0, `${rechteck} Rechteck`);

  // 9. Pan mit mittlerer Maustaste
  const viewportVor = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
  await page.mouse.move(mitte.x, mitte.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(mitte.x + 120, mitte.y + 60, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(300);
  const viewportNach = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
  pruefe(`${praefix}8`, `${bezeichnung}: Pan mit mittlerer Maustaste wirkt`,
    viewportVor !== viewportNach, viewportVor === viewportNach ? 'Viewport unverändert' : 'verschoben');

  return { pumpeId };
}

// ═══════════════════════════════════════════════════════════════════════════
kopf('Referenzmessung OHNE Unterlage');
await w.frischLaden();
await messreihe('ohne Unterlage', 'O');

kopf('Dieselbe Messung MIT Unterlage');
await w.frischLaden();
const bild = await testBild();
const status = await underlaySetzen(bild);
pruefe('U0', 'Unterlage im Schema gesetzt', status >= 200 && status < 300, `HTTP ${status}`);
await w.laden();
const sichtbar = await page.locator('.hc-underlay').count();
pruefe('U1', 'Unterlage ist im Editor sichtbar', sichtbar > 0, `${sichtbar} Element`);

if (sichtbar > 0) {
  // ── Punkt 10: die Unterlage darf keine Zeigerereignisse abfangen ──────────
  const pe = await page.locator('.hc-underlay').evaluate((el) => ({
    pointerEvents: getComputedStyle(el).pointerEvents,
    zIndex: getComputedStyle(el).zIndex,
  }));
  pruefe('U2', 'Unterlage fängt keine Zeigerereignisse ab (gesperrt)',
    pe.pointerEvents === 'none', JSON.stringify(pe));

  // Was liegt in der Mitte der Unterlage unter dem Cursor? Es muss die
  // Zeichenfläche sein, nicht das Bild.
  const unterlageMitte = await w.weltZuScreen({ x: 700, y: 500 });
  const drunter = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${el.getAttribute('class') || ''}`.slice(0, 60) : 'nichts';
  }, [unterlageMitte.x, unterlageMitte.y]);
  pruefe('U3', 'Über der Unterlage antwortet die Zeichenfläche', !/hc-underlay/.test(drunter), drunter);
}

await messreihe('mit Unterlage', 'M');

// ── Punkt 11: kein Drift zwischen Unterlage und Bauteil ────────────────────
kopf('Unterlage und Bauteil bleiben im gleichen Weltsystem (Punkt 11)');
{
  // Bauteil exakt auf den Kreuzungspunkt der Unterlage setzen (Welt 700/500).
  const kreuz = { x: 700, y: 500 };
  const s = await w.weltZuScreen(kreuz);
  const id = await w.setzen('Pumpe', s.x, s.y);
  pruefe('T0', 'Bauteil auf dem Unterlagen-Kreuz gesetzt', !!id, id || '—');

  if (id) {
    /** Abstand zwischen Bauteilmitte und Unterlagenpunkt in Bildschirmpixeln. */
    const abstand = async () => page.evaluate(([wx, wy, nodeId]) => {
      const vp = document.querySelector('.react-flow__viewport');
      const m = new DOMMatrix(getComputedStyle(vp).transform);
      const r = document.querySelector('.react-flow').getBoundingClientRect();
      const punkt = { x: wx * m.a + m.e + r.left, y: wy * m.d + m.f + r.top };
      const node = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
      if (!node) return null;
      const nb = node.getBoundingClientRect();
      const bild = document.querySelector('.hc-underlay')?.getBoundingClientRect();
      return {
        dx: (nb.left + nb.width / 2) - punkt.x,
        dy: (nb.top + nb.height / 2) - punkt.y,
        bildDa: !!bild,
      };
    }, [kreuz.x, kreuz.y, id]);

    const messungen = {};
    for (const z of [25, 100, 400]) {
      await w.zoomAuf(z);
      const a = await abstand();
      messungen[z] = a;
    }
    // Der Abstand ist bei jedem Zoom in WELTkoordinaten gleich; auf dem Schirm
    // skaliert er mit dem Zoom. Verglichen wird daher der weltbezogene Abstand.
    const weltAbstand = (a, z) => (a ? Math.hypot(a.dx, a.dy) / (z / 100) : null);
    const w25 = weltAbstand(messungen[25], 25);
    const w100 = weltAbstand(messungen[100], 100);
    const w400 = weltAbstand(messungen[400], 400);
    const stabil = [w25, w100, w400].every((v) => v != null)
      && Math.abs(w25 - w100) < 25 && Math.abs(w400 - w100) < 25;
    pruefe('T1', 'Bauteil bleibt bei 25/100/400 % auf demselben Unterlagenpunkt', stabil,
      `Weltabstand 25 %: ${w25?.toFixed(1)}, 100 %: ${w100?.toFixed(1)}, 400 %: ${w400?.toFixed(1)}`);
    pruefe('T2', 'Unterlage ist bei allen Zoomstufen mitgerendert',
      Object.values(messungen).every((m) => m?.bildDa),
      Object.entries(messungen).map(([z, m]) => `${z}%: ${m?.bildDa}`).join(' '));
  }
}

pruefe('X', 'keine Konsolenfehler', w.fehler.length === 0, w.fehler.slice(0, 3).join(' || '));
await page.screenshot({ path: `${OUT}/underlay.png` });
const offen = bilanz(OUT);
await w.browser.close();
process.exit(offen ? 1 : 0);
