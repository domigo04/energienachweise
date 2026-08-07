// Bauteilnummern in Leserichtung vergeben (§83).
//
// Die Nummer ist heute die Reihenfolge, in der jemand die Bauteile gesetzt hat.
// Wer das Schema von rechts nach links aufbaut, bekommt die 1 ganz rechts —
// beim Lesen des Plans und der Bauteilliste sucht man dann.
//
// Leserichtung heisst hier: waagrechte Bänder von oben nach unten, innerhalb
// eines Bandes von links nach rechts. Ein Schema ist zweidimensional; „links
// nach rechts" allein würde einen Heizkörper im Untergeschoss zwischen zwei
// Bauteile der obersten Zeile schieben.
//
// Rein, ohne React und ohne DOM: die Bauteile kommen als Rechtecke in
// Weltkoordinaten herein, heraus kommt die Reihenfolge. Nur dadurch ist die
// Regel prüfbar, ohne den Editor zu starten.

/**
 * Anteil der typischen Bauteilhöhe, den zwei Bauteile senkrecht auseinander
 * liegen dürfen und trotzdem als dieselbe Zeile gelten.
 *
 * DIE Stellschraube dieses Moduls. Zu klein zerfällt eine gewollte Zeile in
 * lauter Einzelbänder — ein Ventil, das zwei Millimeter höher sitzt als die
 * Pumpe daneben, bekäme eine eigene Zeile und damit eine Nummer, die weit vor
 * oder hinter der Pumpe liegt. Zu gross wachsen zwei getrennte Etagen zu einer
 * Zeile zusammen; dann nummeriert der Befehl quer durch den Plan, statt oben
 * fertig zu werden und dann nach unten zu gehen.
 */
export const BAND_TOLERANZ_FAKTOR = 0.5;

/**
 * Ersatzhöhe, wenn kein einziges Bauteil eine gemessene Höhe mitbringt.
 *
 * React Flow misst die Bauteile erst, nachdem sie gezeichnet wurden. Wird der
 * Befehl direkt nach dem Laden ausgelöst, können alle Höhen 0 sein — die
 * Toleranz wäre dann ebenfalls 0, und schon fünf Einheiten Versatz rissen eine
 * sichtbar gerade Zeile auseinander. Genau das ist im Browsertest passiert.
 *
 * Eine grobe Annahme ist hier besser als eine falsche Null: der Wert
 * entspricht der Höhe der kleinen Armaturen (Ventil, Absperrhahn), die den
 * Grossteil eines Schemas ausmachen.
 */
export const ERSATZ_HOEHE = 40;

const ZAHL = (wert) => (Number.isFinite(Number(wert)) ? Number(wert) : 0);

/**
 * Bisherige Nummer eines Bauteils, oder null.
 *
 * Bewusst nicht `Number(...)` allein: `Number(null)` ist 0 und damit endlich —
 * ein noch nie nummeriertes Bauteil sähe dann aus, als trüge es die Nummer 0.
 */
const nummerVon = (wert) => {
  if (wert === null || wert === undefined || wert === '') return null;
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? zahl : null;
};

/**
 * Der senkrechte Bezugswert eines Bauteils: seine OBERKANTE.
 *
 * Nicht die Mitte. Im Editor ist `position` die linke obere Ecke, und wer
 * Bauteile nebeneinander setzt, richtet sie an dieser Kante aus. Bändert man
 * nach der Mitte, zerfällt eine sichtbar gerade Zeile, sobald die Bauteile
 * unterschiedlich hoch sind: ein Erdsondenfeld von 200 Einheiten Höhe hat neben
 * einer 40 hohen Pumpe eine um 80 tiefere Mitte — beide stehen aber erkennbar
 * auf derselben Linie. Genau daran ist die erste Fassung im echten Schema
 * gescheitert.
 */
const bezugY = (bauteil) => ZAHL(bauteil?.y);

/**
 * Typische Bauteilhöhe einer Auswahl: der Median.
 *
 * Bewusst nicht der Mittelwert. Ein einzelner Verteilerbalken über die halbe
 * Zeichnung würde den Mittelwert so hochziehen, dass danach alles in EIN Band
 * fällt — der Median lässt sich davon nicht beeindrucken.
 */
export function typischeHoehe(bauteile = []) {
  const hoehen = bauteile
    .map(bauteil => ZAHL(bauteil?.hoehe))
    .filter(hoehe => hoehe > 0)
    .sort((a, b) => a - b);
  if (!hoehen.length) return 0;
  const mitte = Math.floor(hoehen.length / 2);
  return hoehen.length % 2
    ? hoehen[mitte]
    : (hoehen[mitte - 1] + hoehen[mitte]) / 2;
}

/**
 * Bandtoleranz aus der typischen Bauteilhöhe.
 *
 * Ohne jede gemessene Höhe greift `ERSATZ_HOEHE` — eine Toleranz von 0 würde
 * jede noch so kleine Abweichung zu einer eigenen Zeile machen.
 */
export function bandToleranz(bauteile = [], faktor = BAND_TOLERANZ_FAKTOR) {
  return (typischeHoehe(bauteile) || ERSATZ_HOEHE) * ZAHL(faktor);
}

/**
 * Bauteile in waagrechte Bänder gruppieren, von oben nach unten.
 *
 * Der Bezugswert eines Bandes ist das ERSTE (oberste) Bauteil darin und bleibt
 * fest. Würde stattdessen der laufende Mittelwert fortgeschrieben, könnten
 * sich viele knapp benachbarte Bauteile zu einem beliebig hohen Band
 * durchketten — am Ende läge die halbe Zeichnung in einer Zeile.
 */
export function baender(bauteile = [], toleranz = 0) {
  const grenze = Math.max(0, ZAHL(toleranz));
  const sortiert = [...bauteile].sort((a, b) => bezugY(a) - bezugY(b));
  const gruppen = [];
  let bezug = null;
  for (const bauteil of sortiert) {
    if (!gruppen.length || Math.abs(bezugY(bauteil) - bezug) > grenze) {
      gruppen.push([bauteil]);
      bezug = bezugY(bauteil);
    } else {
      gruppen.at(-1).push(bauteil);
    }
  }
  return gruppen;
}

/**
 * Bauteile in Leserichtung ordnen.
 *
 * `bauteile`: [{ id, x, y, hoehe }] in Weltkoordinaten.
 * `toleranz`: senkrechte Bandbreite; ohne Angabe aus der typischen Höhe.
 *
 * Bei genau gleicher Lage bleibt die eingegebene Reihenfolge erhalten
 * (`Array.prototype.sort` ist stabil). Zwei deckungsgleiche Bauteile tauschen
 * dadurch nicht bei jedem Aufruf ihre Nummern.
 */
export function inLeserichtung(bauteile = [], { toleranz = null } = {}) {
  if (!Array.isArray(bauteile) || !bauteile.length) return [];
  const grenze = toleranz === null ? bandToleranz(bauteile) : Math.max(0, ZAHL(toleranz));
  return baender(bauteile, grenze)
    .flatMap(band => [...band].sort((a, b) => ZAHL(a.x) - ZAHL(b.x)));
}

/**
 * Die neuen Nummern — fortlaufend ab 1 in Leserichtung.
 *
 * Rückgabe: [{ id, nr, vorher }]. `vorher` ist die bisherige Nummer, damit der
 * Aufrufer zeigen kann, was sich überhaupt ändert.
 */
export function neueNummern(bauteile = [], optionen = {}) {
  return inLeserichtung(bauteile, optionen).map((bauteil, index) => ({
    id: bauteil.id,
    nr: index + 1,
    vorher: nummerVon(bauteil.nr),
  }));
}

/**
 * Wie viele Bauteile bekämen eine ANDERE Nummer?
 *
 * Das ist die Zahl, die vor dem Ausführen gezeigt wird. Sie beantwortet die
 * Frage, die der Planer wirklich hat — „ändert sich etwas?" —, und nicht bloss,
 * wie viele Bauteile es gibt.
 */
export function anzahlAenderungen(nummern = []) {
  return nummern.filter(eintrag => eintrag.nr !== eintrag.vorher).length;
}
