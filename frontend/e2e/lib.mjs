// Gemeinsame Grundlage der CAD-Browsertests.
//
// Hier liegen Konfiguration, Browserstart und alle Messhelfer. Die einzelnen
// Testläufe enthalten dadurch nur noch Fachlogik, und ein neuer Lauf muss die
// Stolperfallen (SVG-Text, Anker vs. Bauteil, Panels über der Zeichenfläche)
// nicht neu lernen.
//
// Es gibt KEINE festen IDs: Projekt- und Schema-ID kommen aus `setup.mjs`.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath statt .pathname: sonst bleibt in einem Pfad mit Leerzeichen
// («Mobile Documents») ein %20 stehen und jeder Kindprozess scheitert.
const HIER = path.dirname(fileURLToPath(import.meta.url));
export const LAUFDATEI = path.join(HIER, '.run.json');

/** Zugangsdaten und IDs des laufenden Testaufbaus. */
export function konfig() {
  if (!fs.existsSync(LAUFDATEI)) {
    throw new Error(`Kein Testaufbau gefunden (${LAUFDATEI}). Erst "npm run e2e:cad" `
      + 'oder "node e2e/setup.mjs" ausführen.');
  }
  return JSON.parse(fs.readFileSync(LAUFDATEI, 'utf8'));
}

/** Sammelt Prüfergebnisse und schreibt am Ende eine Bilanz. */
export function protokoll(name) {
  const liste = [];
  const pruefe = (id, was, ok, notiz = '') => {
    liste.push({ id, was, ok: !!ok, notiz });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${was}${notiz ? '   → ' + notiz : ''}`);
  };
  const kopf = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);
  const bilanz = (ordner) => {
    const fehler = liste.filter((r) => !r.ok);
    if (ordner) {
      fs.writeFileSync(path.join(ordner, `${name}.json`), JSON.stringify(liste, null, 2));
    }
    console.log(`\n=== ${name}: ${liste.length - fehler.length}/${liste.length} ===`);
    if (fehler.length) {
      console.log('OFFEN:\n' + fehler.map((f) => `  ${f.id} ${f.was} — ${f.notiz}`).join('\n'));
    }
    return fehler.length;
  };
  return { pruefe, kopf, bilanz, liste };
}

// Chromium liegt im CI-Container unter einem festen Pfad. Auf einem
// Arbeitsplatz gibt es den nicht — dort nimmt Playwright seinen eigenen,
// installierten Browser (`npx playwright install chromium`). Ohne diesen
// Rückfall liessen sich die Browsertests ausschliesslich im Container
// ausführen, und genau dann fehlt der Nachweis, wenn man ihn braucht.
// `PLAYWRIGHT_CHROMIUM` überschreibt beides.
const CI_CHROMIUM = '/opt/pw-browsers/chromium';
const chromiumPfad = () => {
  const gewuenscht = process.env.PLAYWRIGHT_CHROMIUM || CI_CHROMIUM;
  return fs.existsSync(gewuenscht) ? gewuenscht : undefined;
};

/** Browser + angemeldete Seite. Gibt eine Werkzeugkiste zurück. */
export async function starten() {
  const cfg = konfig();
  const browser = await chromium.launch({ executablePath: chromiumPfad() });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('hc_token', t);
    localStorage.setItem('hc_auth', u);
  }, [cfg.token, JSON.stringify(cfg.user)]);

  const kopfZeilen = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` };

  const w = {
    cfg, browser, page, fehler,

    /** Graph im Backend setzen. Der Endpunkt erwartet ihn UNTER `graph`. */
    graphSetzen: (graph) => fetch(`${cfg.api}/api/v1/schemas/${cfg.schemaId}/graph`, {
      method: 'PUT', headers: kopfZeilen, body: JSON.stringify({ graph }),
    }),

    graphLeeren: () => w.graphSetzen({ nodes: [], edges: [], layer_config: {} }),

    /** Was WIRKLICH gespeichert ist. */
    graphLesen: async () => {
      const r = await fetch(`${cfg.api}/api/v1/projects/${cfg.projectId}/schema-editor`,
        { headers: { Authorization: `Bearer ${cfg.token}` } });
      const d = await r.json();
      const g = d.schema?.graph ?? {};
      return typeof g === 'string' ? JSON.parse(g) : (g || {});
    },

    /** Editor öffnen und auf 100 % Zoom bringen. */
    laden: async () => {
      await page.goto(`${cfg.app}/projekte/${cfg.projectId}/schema`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2300);
      await w.zoomAuf(100);
    },

    /** Leeres Schema laden. Das Autosave kann den alten Stand zurückschreiben —
        darum prüfen und notfalls wiederholen. */
    frischLaden: async (versuche = 3) => {
      for (let i = 0; i < versuche; i += 1) {
        await w.graphLeeren();
        await w.laden();
        if ((await page.locator('.react-flow__node').count()) === 0) return true;
      }
      return false;
    },

    zoomJetzt: async () => Number((await page.locator('.hc-statusbar__zoom').innerText())
      .replace(/\D/g, '')),

    /** Über das Mausrad zoomen (wie ein Nutzer), Cursor in der Canvasmitte. */
    zoomAuf: async (ziel) => {
      const b = await page.locator('.hc-canvas-wrap').boundingBox();
      await page.mouse.move(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
      for (let i = 0; i < 60; i += 1) {
        const z = await w.zoomJetzt();
        if (Math.abs(z - ziel) <= Math.max(6, ziel * 0.1)) return z;
        await page.mouse.wheel(0, z > ziel ? 120 : -120);
        await page.waitForTimeout(60);
      }
      return w.zoomJetzt();
    },

    status: async () => (await page.locator('.hc-statusbar').innerText())
      .replace(/\n?\d+ mm(?=\n|$)/g, '').replace(/\n+/g, ' | '),

    /** Weltkoordinate → Bildschirmkoordinate über die echte Viewport-Matrix. */
    weltZuScreen: (punkt) => page.evaluate(([wx, wy]) => {
      const el = document.querySelector('.react-flow__viewport');
      const m = new DOMMatrix(getComputedStyle(el).transform);
      const r = document.querySelector('.react-flow').getBoundingClientRect();
      return { x: Math.round(wx * m.a + m.e + r.left), y: Math.round(wy * m.d + m.f + r.top) };
    }, [punkt.x, punkt.y]),

    /** Liegt der Punkt frei auf der Zeichenfläche (nicht unter einem Panel)? */
    istFrei: (pt) => page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && !!el.closest('.hc-canvas-wrap');
    }, [pt.x, pt.y]),

    /** Eine Stelle, an der wirklich die leere Zeichenfläche liegt. */
    freieFlaeche: async () => {
      const b = await page.locator('.hc-canvas-wrap').boundingBox();
      return page.evaluate(([bx, by, bw, bh]) => {
        for (let y = by + bh - 160; y > by + 80; y -= 24) {
          for (let x = bx + 100; x < bx + bw - 200; x += 24) {
            const el = document.elementFromPoint(x, y);
            if (el?.classList?.contains('react-flow__pane')) return { x, y };
          }
        }
        return null;
      }, [b.x, b.y, b.width, b.height]);
    },

    /** Alle Handle-Mittelpunkte eines Nodes in SCREEN-Koordinaten. */
    portsVon: (nodeId) => page.evaluate((id) => {
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
    }, nodeId),

    /** Maus aus dem Weg fahren. Ein überfahrenes Handle wird grösser
        gerendert; sein gemessener Mittelpunkt wandert dadurch um einige Pixel. */
    mausWeg: async () => {
      const b = await page.locator('.hc-canvas-wrap').boundingBox();
      await page.mouse.move(Math.round(b.x + 20), Math.round(b.y + 20));
      await page.waitForTimeout(220);
    },

    /** Anschlüsse in WELTkoordinaten. Über einen Neuladen hinweg ist nur das
        vergleichbar: der Bildausschnitt muss danach nicht identisch sein. */
    portsWeltVon: (nodeId) => page.evaluate((id) => {
      const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
      if (!node) return [];
      const vp = document.querySelector('.react-flow__viewport');
      const m = new DOMMatrix(getComputedStyle(vp).transform);
      const r = document.querySelector('.react-flow').getBoundingClientRect();
      return [...node.querySelectorAll('.react-flow__handle')].map((h) => {
        const b = h.getBoundingClientRect();
        const sx = b.left + b.width / 2;
        const sy = b.top + b.height / 2;
        return {
          handleId: h.dataset.handleid || null,
          x: Math.round(((sx - r.left - m.e) / m.a) * 10) / 10,
          y: Math.round(((sy - r.top - m.f) / m.d) * 10) / 10,
        };
      });
    }, nodeId),

    /** Nur echte Bauteile eines Typs — NICHT die unsichtbaren Leitungsanker. */
    bauteilIds: (typ) => page.evaluate((t) =>
      [...document.querySelectorAll(`.react-flow__node-${t}`)].map((n) => n.dataset.id), typ),

    nodeIds: () => page.evaluate(() =>
      [...document.querySelectorAll('.react-flow__node')].map((n) => n.dataset.id)),

    /** Letzte Fangentscheidung aus der Prüfsonde des Editors. */
    snapSonde: () => page.evaluate(() => window.__hcSnap || null),
    snapVerlauf: () => page.evaluate(() => (window.__hcSnapVerlauf || []).map((e) => e.typ)),
    snapVerlaufLeeren: () => page.evaluate(() => { window.__hcSnapVerlauf = []; }),

    /** SVG-Text muss über textContent gelesen werden — allInnerTexts() ist leer. */
    svgTexte: () => page.evaluate(() =>
      [...document.querySelectorAll('.react-flow__viewport text')]
        .map((t) => (t.textContent || '').trim()).filter(Boolean)),

    /** Der gezeichnete Fangmarker: Beschriftung und Koordinate aus dem Element. */
    markerAusSvg: () => page.evaluate(() => {
      const alle = [...document.querySelectorAll('.react-flow__viewport text')];
      const el = alle.find((t) => /^(Anschluss|Endpunkt|Eckpunkt|Schnittpunkt|Mittelpunkt|auf Leitung|Raster)$/
        .test((t.textContent || '').trim()));
      if (!el) return null;
      const form = el.parentElement?.querySelector('circle, rect, polygon, polyline, line');
      const cx = form?.getAttribute('cx');
      const cy = form?.getAttribute('cy');
      return {
        label: (el.textContent || '').trim(),
        x: cx != null ? Number(cx) : null,
        y: cy != null ? Number(cy) : null,
      };
    }),

    /** Bibliothekseintrag nach Beschriftung finden (Gruppen werden aufgeklappt). */
    palette: async (label) => {
      const gruppen = page.locator('.hc-palette-group__trigger');
      for (let i = 0; i < await gruppen.count(); i += 1) {
        const g = gruppen.nth(i);
        if (!(await g.evaluate((el) => el.className.includes('is-open')))) {
          await g.click({ force: true });
        }
        await page.waitForTimeout(120);
        // Bezeichnungen können Klammern enthalten („Wärmeerzeuger (WE)") —
        // die müssen für die Regex maskiert werden.
        const muster = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
        const item = page.locator('.hc-palette-item')
          .filter({ has: page.locator('strong', { hasText: muster }) }).first();
        if (await item.count()) return item;
      }
      return null;
    },

    /** Bauteil per Klick setzen (Platzierungsbefehl) und neue Node-ID liefern. */
    setzen: async (label, screenX, screenY) => {
      const item = await w.palette(label);
      if (!item) return null;
      await item.click({ force: true });
      await page.waitForTimeout(220);
      const vorher = new Set(await w.nodeIds());
      await page.mouse.move(screenX, screenY);
      await page.waitForTimeout(180);
      await page.mouse.click(screenX, screenY);
      await page.waitForTimeout(500);
      return (await w.nodeIds()).find((id) => !vorher.has(id)) || null;
    },

    /** Klick auf die Mitte eines bekannten Segments (Weltkoordinaten). */
    segmentKlicken: async (a, b) => {
      const s = await w.weltZuScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      if (!(await w.istFrei(s))) return null;
      await page.mouse.click(s.x, s.y);
      await page.waitForTimeout(500);
      // Die Auswahl kann den Eigenschaftenbereich öffnen und damit die
      // Zeichenfläche verschmälern. Der sichtbare Diamant liegt dann nicht
      // mehr an der alten Bildschirmkoordinate, obwohl seine Weltkoordinate
      // unverändert ist.
      const erwartet = await w.weltZuScreen({ x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 });
      const markierteGrips = page.locator('[data-cad-segment-index]');
      const grips = await markierteGrips.count() ? markierteGrips : page.locator('.react-flow__edge rect');
      let bester = null;
      for (let i = 0; i < await grips.count(); i += 1) {
        const box = await grips.nth(i).boundingBox();
        if (!box) continue;
        const punkt = { x:box.x + box.width / 2, y:box.y + box.height / 2 };
        const distanz = Math.hypot(punkt.x - erwartet.x, punkt.y - erwartet.y);
        if (!bester || distanz < bester.distanz) bester = { ...punkt, distanz };
      }
      const ziel = bester ? { x:Math.round(bester.x), y:Math.round(bester.y) } : erwartet;
      return ziel;
    },

    /** Von `von` nach `nach` ziehen (mit Zwischenschritten, damit Drags greifen). */
    ziehen: async (von, nach, schritte = 6) => {
      await page.mouse.move(von.x, von.y);
      await page.mouse.down();
      for (let i = 1; i <= schritte; i += 1) {
        await page.mouse.move(
          Math.round(von.x + ((nach.x - von.x) * i) / schritte),
          Math.round(von.y + ((nach.y - von.y) * i) / schritte));
        await page.waitForTimeout(50);
      }
      await page.mouse.up();
      await page.waitForTimeout(1400);
    },

    /** Leitungsbefehl starten (Taste L) — vorher jeden laufenden Befehl beenden. */
    leitungStarten: async (bei) => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      await page.mouse.move(bei.x, bei.y);
      await page.keyboard.press('l');
      await page.waitForTimeout(200);
    },

    /** Auf einen Fang zielen und die Entscheidung samt Marker zurückgeben. */
    zielen: async (pt, warten = 340) => {
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(warten);
      return { sonde: await w.snapSonde(), marker: await w.markerAusSvg() };
    },

    abbrechen: async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(220); },
  };
  return w;
}
