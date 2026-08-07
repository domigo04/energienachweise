// Lage, Sichtbarkeit und automatische Erstplatzierung der Beschriftungsblöcke
// (§58).
//
// Bisher war die Lage eines Blocks ein VERSATZ zur Unterkante seines Bauteils
// (`caption_offset_x` / `caption_offset_y`). Wer das Bauteil verschob, nahm den
// Block mit — die mühsam ausgerichtete Flucht mehrerer Blöcke war damit sofort
// zerstört. Neu trägt der Block eine EIGENE Lage im Schema (`caption_pos`) und
// bleibt liegen.
//
// Der Anker ist in Editor und Export derselbe: waagrechte MITTE und OBERKANTE
// des Kastens. Der Editor zeichnet ihn mit `translateX(-50%)`, der Export mit
// `zeichne_datenkasten(mitte_x, oben_y)` — dieselbe Bedeutung, dieselbe Zahl.
//
// Rein, ohne React und ohne DOM.

/** Abstand der Blockoberkante zur Bauteilunterkante im Altmodell. */
export const ALT_ABSTAND = 10;

/**
 * Abstand der gedachten Linie zur Unterkante des tiefsten Bauteils.
 *
 * Weit genug, dass die Blöcke nicht in die Zeichnung ragen, aber nicht so
 * weit, dass man zum Lesen scrollen muss.
 */
export const LINIE_ABSTAND = 80;

/**
 * Rastermass einer Blockspalte und -zeile für die automatische Reihe.
 *
 * Bewusst ein festes Raster und nicht die gemessene Blockbreite: die steht
 * beim Platzieren noch gar nicht fest (der Kasten wird erst gezeichnet,
 * nachdem er im Graphen ist). Ein Raster ist ausserdem das, was man sehen
 * will — Blöcke in einer Flucht, nicht dicht an dicht gepackt.
 */
export const BLOCK_SPALTE = 170;
export const BLOCK_ZEILE = 95;

const ZAHL = (wert) => (Number.isFinite(Number(wert)) ? Number(wert) : 0);

/**
 * Eine brauchbare Koordinate — bewusst nicht `Number.isFinite(Number(...))`
 * allein: `Number(null)` ist 0 und damit endlich. Eine halb gespeicherte Lage
 * `{ x: null, y: 5 }` würde sonst als gültig durchgehen und den Block auf 0
 * schieben, statt auf das Altmodell zurückzufallen.
 */
const KOORDINATE = (wert) => wert !== null && wert !== undefined && wert !== ''
  && Number.isFinite(Number(wert));
const PUNKT = (p) => Boolean(p) && KOORDINATE(p.x) && KOORDINATE(p.y);

/** Ist der Block dieses Bauteils eingeblendet? */
export const blockSichtbar = (data) => data?.caption_hidden !== true;

/**
 * Lage nach dem ALTEN Modell: Bauteilmitte, Unterkante, plus Versatz.
 *
 * Genau die Formel, die Editor und Export bisher benutzt haben. Sie ist die
 * Grundlage der Migration — nur so landet ein bestehender Block exakt dort,
 * wo er vorher war.
 */
export function altLage(node, groesse) {
  const breite = ZAHL(groesse?.width);
  const hoehe = ZAHL(groesse?.height);
  const data = node?.data || {};
  return {
    x: ZAHL(node?.position?.x) + breite / 2 + ZAHL(data.caption_offset_x),
    y: ZAHL(node?.position?.y) + hoehe + ALT_ABSTAND + ZAHL(data.caption_offset_y),
  };
}

/**
 * Die eigene Lage eines Blocks — oder null, solange es keine gibt.
 *
 * Der Editor braucht genau diese Unterscheidung: mit eigener Lage zeichnet er
 * in Weltkoordinaten, ohne sie unverändert nach dem Altmodell. Ein Schema, das
 * noch nie im neuen Editor offen war, sieht dadurch aus wie immer.
 */
export function eigeneBlockLage(data) {
  const gespeichert = data?.caption_pos;
  return PUNKT(gespeichert) ? { x: Number(gespeichert.x), y: Number(gespeichert.y) } : null;
}

/** Die geltende Lage: die eigene, sonst die aus dem Altmodell hergeleitete. */
export function blockLage(node, groesse) {
  return eigeneBlockLage(node?.data) || altLage(node, groesse);
}

/**
 * Muss dieses Bauteil noch überführt werden?
 *
 * Nur Bauteile MIT Block (Nummer vorhanden) und noch ohne eigene Lage. Ein
 * Bauteil ohne Nummer zeigt keinen Block — für das gibt es nichts zu retten.
 */
export function brauchtMigration(node) {
  return node?.data?.nr != null && !PUNKT(node?.data?.caption_pos);
}

/**
 * Node-Daten nach der Migration: eigene Lage gesetzt, Altfelder entfernt.
 *
 * Die Altfelder werden bewusst gelöscht statt liegen gelassen. Blieben sie
 * stehen, gäbe es zwei Quellen für dieselbe Lage — und beim nächsten Umbau
 * fragt niemand mehr, welche gilt.
 */
export function migrierteDaten(node, groesse) {
  const daten = { ...(node?.data || {}) };
  const lage = altLage(node, groesse);
  delete daten.caption_offset_x;
  delete daten.caption_offset_y;
  return { ...daten, caption_pos: lage };
}

/**
 * Unterkante des gezeichneten Schemas — die gedachte Linie liegt darunter.
 *
 * Massgebend sind die Bauteile, nicht die Blöcke: sonst schöbe jeder neue
 * Block die Linie weiter nach unten und die Reihe liefe davon.
 */
export function schemaUnterkante(bauteile = []) {
  const kanten = bauteile
    .filter(teil => Number.isFinite(Number(teil?.y)))
    .map(teil => ZAHL(teil.y) + ZAHL(teil.hoehe));
  return kanten.length ? Math.max(...kanten) : 0;
}

/** Linke Kante des Schemas — dort beginnt die erste Blockspalte. */
export function schemaLinks(bauteile = []) {
  const kanten = bauteile
    .filter(teil => Number.isFinite(Number(teil?.x)))
    .map(teil => ZAHL(teil.x));
  return kanten.length ? Math.min(...kanten) : 0;
}

/** Rechte Kante des Schemas — dort bricht die Blockzeile um. */
export function schemaRechts(bauteile = []) {
  const kanten = bauteile
    .filter(teil => Number.isFinite(Number(teil?.x)))
    .map(teil => ZAHL(teil.x) + ZAHL(teil.breite));
  return kanten.length ? Math.max(...kanten) : 0;
}

/**
 * Der Rahmen, in dem die Blockreihe liegt.
 *
 * `bauteile`: [{ x, y, breite, hoehe }] — die Bauteile, nicht die Blöcke.
 */
export function blockRahmen(bauteile = []) {
  const links = schemaLinks(bauteile);
  const rechts = schemaRechts(bauteile);
  return {
    links,
    // Mindestens eine Spalte breit, damit auch ein Schema aus einem einzigen
    // schmalen Bauteil eine brauchbare Zeile bekommt.
    rechts: Math.max(rechts, links + BLOCK_SPALTE),
    oben: schemaUnterkante(bauteile) + LINIE_ABSTAND,
  };
}

/**
 * Alle Rasterplätze der Reihe, zeilenweise von links oben.
 *
 * Endlich, damit der Aufrufer nie in eine Endlosschleife läuft: `zeilen`
 * begrenzt, wie weit die Reihe nach unten wachsen darf.
 */
export function rasterPlaetze(rahmen, zeilen = 6) {
  const spalten = Math.max(1, Math.floor((rahmen.rechts - rahmen.links) / BLOCK_SPALTE) + 1);
  const plaetze = [];
  for (let zeile = 0; zeile < Math.max(1, zeilen); zeile += 1) {
    for (let spalte = 0; spalte < spalten; spalte += 1) {
      plaetze.push({
        // Die gespeicherte Lage ist die MITTE des Blocks — deshalb die halbe
        // Spalte dazu, sonst stünde die Reihe um eine halbe Spalte zu weit links.
        x: rahmen.links + spalte * BLOCK_SPALTE + BLOCK_SPALTE / 2,
        y: rahmen.oben + zeile * BLOCK_ZEILE,
      });
    }
  }
  return plaetze;
}

/** Liegt an dieser Stelle schon ein Block? */
const belegt = (platz, vorhandene, toleranz) => vorhandene.some(lage =>
  PUNKT(lage)
  && Math.abs(Number(lage.x) - platz.x) < toleranz
  && Math.abs(Number(lage.y) - platz.y) < toleranz);

/**
 * Die nächste freie Lage in der Blockreihe.
 *
 * `bauteile` spannt den Rahmen auf, `vorhandene` sind die Lagen der schon
 * gesetzten Blöcke. Ist die Reihe voll, kommt der Platz unterhalb der letzten
 * Zeile zurück — lieber gestapelt als gar nicht platziert.
 */
export function naechsteBlockLage(bauteile = [], vorhandene = [], { zeilen = 6 } = {}) {
  const rahmen = blockRahmen(bauteile);
  const plaetze = rasterPlaetze(rahmen, zeilen);
  const frei = plaetze.find(platz => !belegt(platz, vorhandene, BLOCK_SPALTE / 2));
  if (frei) return frei;
  return {
    x: rahmen.links + BLOCK_SPALTE / 2,
    y: rahmen.oben + zeilen * BLOCK_ZEILE,
  };
}
