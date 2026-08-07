// Die vier CAD-Modify-Befehle als reine Geometrie: Verschieben, Kopieren,
// Spiegeln, Drehen und Reihe. Kein React, keine Hydraulik.
//
// Alle vier folgen demselben Muster — Auswahl → Basispunkt → Zielpunkt — und
// unterscheiden sich nur in EINER Sache: der Abbildung, die einen Punkt auf
// seinen neuen Platz schickt. Darum gibt es hier nicht vier Befehle, sondern
// eine `Abbildung`:
//
//     { punkt(p) → p', lage(data) → { rotation, mirrored } }
//
// `punkt` gilt für jede Koordinate (Leitungspunkte, Bauteilmitten, Anker),
// `lage` sagt, wie sich die Drehung/Spiegelung eines BAUTEILZEICHENS mitdreht.
// Der Editor ruft für Kopieren, Spiegeln, Drehen und Reihe denselben Weg auf
// und rechnet keine eigene Geometrie mehr.
//
// Bildschirmkoordinaten: y zeigt nach unten. Ein positiver Winkel dreht daher
// im Uhrzeigersinn — genau wie CSS `rotate()` und wie `rotate()` im
// SVG-Export. Es gibt dadurch nur EINE Winkelkonvention im ganzen Editor.

export const VERSCHIEBEN = 'verschieben';
export const SPIEGELN = 'spiegeln';
export const DREHEN = 'drehen';

const ZAHL = (wert) => (Number.isFinite(Number(wert)) ? Number(wert) : 0);
const ENDLICH = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Winkel auf [0, 360). */
export function winkelNormiert(grad) {
  return ((ZAHL(grad) % 360) + 360) % 360;
}

/**
 * Auf den nächsten Viertelkreis runden.
 *
 * Die LAGE eines Bauteils ist im ganzen Projekt ein Vierteldrehungs-Modell:
 * `rotateNode` dreht um 90°, `gedrehteSeite` rechnet in Viertelschritten, und
 * der SVG-Export leitet die Anschlussseite genauso ab. Ein freier Symbolwinkel
 * müsste dieses Modell in Editor UND Export ersetzen — das wäre eine eigene
 * Aufgabe und würde die Anschlüsse gefährden.
 *
 * Darum: die ANORDNUNG (Punkte, Bauteilmitten) dreht sich exakt um den
 * getippten Winkel, das Bauteilzeichen rastet auf den nächsten Viertelkreis.
 */
export function viertelWinkel(grad) {
  return winkelNormiert(Math.round(winkelNormiert(grad) / 90) * 90);
}

/**
 * Cosinus/Sinus mit exakten Werten auf den Viertelkreisen.
 *
 * `Math.cos(Math.PI / 2)` ist 6.1e-17 und nicht 0. Ohne diese Sonderbehandlung
 * läge eine um 90° gedrehte Leitung um Bruchteile eines Mikrometers neben dem
 * Raster — nach Speichern und Neuladen wäre die Geometrie nicht mehr identisch.
 */
function cosSin(grad) {
  const norm = winkelNormiert(grad);
  if (norm === 0) return [1, 0];
  if (norm === 90) return [0, 1];
  if (norm === 180) return [-1, 0];
  if (norm === 270) return [0, -1];
  const rad = (norm * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

/** Richtungswinkel einer Achse a→b in Grad (Bildschirmsinn). */
export function achsWinkel(a, b) {
  if (!ENDLICH(a) || !ENDLICH(b)) return 0;
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Winkel, den der Cursor gegenüber dem Basispunkt aufspannt (Grad, 0–360). */
export function winkelZwischen(basis, punkt) {
  return winkelNormiert(achsWinkel(basis, punkt));
}

export function punktVerschoben(punkt, delta) {
  return { x: ZAHL(punkt?.x) + ZAHL(delta?.x), y: ZAHL(punkt?.y) + ZAHL(delta?.y) };
}

/** Punkt an der Geraden a→b spiegeln. Ohne Achsenlänge bleibt er, wo er ist. */
export function punktGespiegelt(punkt, a, b) {
  if (!ENDLICH(punkt) || !ENDLICH(a) || !ENDLICH(b)) return { ...punkt };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const quadrat = dx * dx + dy * dy;
  if (!quadrat) return { ...punkt };
  const t = ((punkt.x - a.x) * dx + (punkt.y - a.y) * dy) / quadrat;
  const lot = { x: a.x + t * dx, y: a.y + t * dy };
  return { x: 2 * lot.x - punkt.x, y: 2 * lot.y - punkt.y };
}

/** Punkt um den Basispunkt drehen (positiver Winkel = im Uhrzeigersinn). */
export function punktGedreht(punkt, basis, winkel) {
  if (!ENDLICH(punkt) || !ENDLICH(basis)) return { ...punkt };
  const [cos, sin] = cosSin(winkel);
  const dx = punkt.x - basis.x;
  const dy = punkt.y - basis.y;
  return {
    x: basis.x + dx * cos - dy * sin,
    y: basis.y + dx * sin + dy * cos,
  };
}

const lageVon = (data) => ({
  rotation: winkelNormiert(data?.rotation),
  mirrored: Boolean(data?.mirrored),
});

/** Verschieben und Kopieren: die Lage des Bauteilzeichens bleibt, wie sie ist. */
export function verschiebung(delta) {
  const dx = ZAHL(delta?.x);
  const dy = ZAHL(delta?.y);
  return {
    art: VERSCHIEBEN,
    punkt: (punkt) => punktVerschoben(punkt, { x: dx, y: dy }),
    lage: lageVon,
  };
}

/**
 * Spiegeln an der Achse a→b.
 *
 * Für das Bauteilzeichen gilt dieselbe Rechnung wie für die Geometrie, nur in
 * Transformationen statt in Punkten. Das Zeichen trägt `rotate(r) scaleX(-1)^m`;
 * eine Spiegelung an einer Achse mit Winkel α ergibt daraus
 * `rotate(2α + 180 − r) scaleX(-1)^(m+1)`.
 *
 * Probe: senkrechte Achse (α = 90°) auf ein ungedrehtes Zeichen ergibt
 * rotation 0 und mirrored — also genau das waagrechte Umklappen, das der Knopf
 * «Bauteil spiegeln» seit jeher macht.
 */
export function spiegelung(a, b) {
  const alpha = achsWinkel(a, b);
  return {
    art: SPIEGELN,
    achse: { a: { ...a }, b: { ...b } },
    punkt: (punkt) => punktGespiegelt(punkt, a, b),
    lage: (data) => ({
      rotation: viertelWinkel(2 * alpha + 180 - winkelNormiert(data?.rotation)),
      mirrored: !data?.mirrored,
    }),
  };
}

/** Drehen um den Basispunkt. */
export function drehung(basis, winkel) {
  const grad = ZAHL(winkel);
  return {
    art: DREHEN,
    winkel: grad,
    punkt: (punkt) => punktGedreht(punkt, basis, grad),
    lage: (data) => ({
      rotation: viertelWinkel(winkelNormiert(data?.rotation) + grad),
      mirrored: Boolean(data?.mirrored),
    }),
  };
}

/**
 * Lineare Reihe: die Versätze der KOPIEN.
 *
 * `anzahl` zählt wie im CAD das Original mit — drei Heizkörper heisst ein
 * bestehender und zwei neue. Ohne Abstand entsteht keine Reihe, sondern nur ein
 * Stapel auf demselben Fleck; das gibt bewusst eine leere Liste.
 */
export function reihenVersaetze(anzahl, abstand) {
  const n = Math.floor(ZAHL(anzahl));
  const dx = ZAHL(abstand?.x);
  const dy = ZAHL(abstand?.y);
  if (n < 2 || (!dx && !dy)) return [];
  return Array.from({ length: n - 1 }, (_, index) => ({ x: dx * (index + 1), y: dy * (index + 1) }));
}

/** Die Abbildungen einer linearen Reihe — eine je Kopie. */
export function reihenAbbildungen(anzahl, abstand) {
  return reihenVersaetze(anzahl, abstand).map(verschiebung);
}

/**
 * Eine Leitungsroute abbilden.
 *
 * Ein Ende, das an einem Bauteilanschluss hängt, darf NICHT wandern — sonst
 * würde die Geometrie die Hydraulik zerreissen. Statt das Ende mitzunehmen,
 * entsteht dort ein Stützpunkt an der abgebildeten Stelle: der Anschluss
 * bleibt, die Leitung führt neu dorthin. Dieselbe Regel wie beim Ausrichten.
 *
 * `startFrei`/`endFrei` heisst «dieses Ende wandert ohnehin mit» — weil es an
 * einem freien CAD-Anker hängt oder weil das Bauteil selbst mit abgebildet
 * wird. Die neuen Ankerpositionen kommen als `start`/`end` zurück.
 */
export function routeAbgebildet(route, abbildung, { startFrei = false, endFrei = false } = {}) {
  const punkt = typeof abbildung === 'function' ? abbildung : abbildung?.punkt;
  if (!Array.isArray(route) || route.length < 2 || typeof punkt !== 'function') return null;
  const erster = route[0];
  const letzter = route[route.length - 1];
  return {
    points: [
      ...(startFrei ? [] : [punkt(erster)]),
      ...route.slice(1, -1).map(punkt),
      ...(endFrei ? [] : [punkt(letzter)]),
    ],
    start: startFrei ? punkt(erster) : null,
    end: endFrei ? punkt(letzter) : null,
  };
}

/**
 * Neue Bauteilposition. React Flow speichert die linke obere Ecke, gespiegelt
 * und gedreht wird aber um die MITTE — sonst wandert ein Bauteil beim Spiegeln
 * um seine halbe Breite davon.
 */
export function bauteilPosition(position, groesse, abbildung) {
  const punkt = typeof abbildung === 'function' ? abbildung : abbildung?.punkt;
  const breite = ZAHL(groesse?.width);
  const hoehe = ZAHL(groesse?.height);
  const mitte = { x: ZAHL(position?.x) + breite / 2, y: ZAHL(position?.y) + hoehe / 2 };
  if (typeof punkt !== 'function') return { ...mitte, x: ZAHL(position?.x), y: ZAHL(position?.y) };
  const neu = punkt(mitte);
  return { x: neu.x - breite / 2, y: neu.y - hoehe / 2 };
}

/**
 * Neue Lage eines Bauteilzeichens.
 *
 * `drehbar` ist die Entscheidung des Aufrufers (`ROTATABLE`). Text-, Beschrif-
 * tungs- und Flächenblöcke sind NICHT drehbar: sie würden beim Spiegeln
 * seitenverkehrt stehen und wären nicht mehr lesbar. Sie wandern nur an ihren
 * neuen Platz — genau so hält es auch der PDF-Export, der Nummer und
 * Datenblock ausserhalb der Bauteildrehung zeichnet.
 */
export function bauteilLage(data, abbildung, { drehbar = true } = {}) {
  if (!drehbar || typeof abbildung?.lage !== 'function') return lageVon(data);
  return abbildung.lage(data);
}

/**
 * Bauplan für die unabhängige Kopie einer Auswahl — eine Kopie je Abbildung.
 *
 * Rein und ohne React: hier stehen nur IDs, Zuordnungen und Punkte. Der Editor
 * baut daraus die React-Flow-Objekte. Dadurch ist die Regel prüfbar, an der
 * eine Kopie steht oder fällt (§74, Prüfmuster `e2e/copy.mjs`):
 *
 *   • Bauteile, Leitungen UND Anker bekommen je eine neue ID;
 *   • ein Leitungsende hängt nur dann an einem kopierten Bauteil, wenn genau
 *     dieses Bauteil mitkopiert wurde — sonst bekommt es einen EIGENEN freien
 *     Anker und nie den Anschluss des Originals;
 *   • nummerierte Bauteile bekommen fortlaufende freie Nummern, auch über
 *     mehrere Kopien einer Reihe hinweg.
 *
 * Damit kann keine Kopie am Original hängen bleiben und kein Anker verwaisen.
 *
 * `snapshot`: { nodes:[{ id, type, position, data, groesse }],
 *               routes:[{ edge, route, whole, sourceRef, targetRef }] }
 * `neueId`:   Fabrik für frische IDs (im Editor `newId`).
 */
export function kopierPlan(snapshot, abbildungen, {
  neueId, ersteNummer = 1, nummeriert = () => false, drehbar = () => true,
} = {}) {
  const leer = { nodes: [], edges: [], anker: [] };
  if (!Array.isArray(snapshot?.nodes) || !Array.isArray(snapshot?.routes)
      || !Array.isArray(abbildungen) || !abbildungen.length
      || typeof neueId !== 'function') return leer;

  let nummer = Math.floor(ZAHL(ersteNummer)) || 1;
  const nodes = [];
  const edges = [];
  const anker = [];

  abbildungen.forEach((abbildung) => {
    if (typeof abbildung?.punkt !== 'function') return;
    // Die Zuordnung gilt NUR innerhalb dieser einen Kopie. Kopie 2 einer Reihe
    // darf niemals an den Bauteilen von Kopie 1 hängen.
    const idMap = new Map();
    snapshot.nodes.forEach((quelle) => {
      const id = neueId();
      idMap.set(quelle.id, id);
      nodes.push({
        id,
        quelle: quelle.id,
        position: bauteilPosition(quelle.position, quelle.groesse, abbildung),
        ...bauteilLage(quelle.data, abbildung, { drehbar: drehbar(quelle) }),
        nr: nummeriert(quelle) ? nummer++ : null,
      });
    });
    snapshot.routes.forEach((quelle) => {
      const route = (quelle.route || []).map(abbildung.punkt);
      if (route.length < 2) return;
      const amBauteil = (ref) => Boolean(ref) && idMap.has(ref);
      const eigenerSource = !amBauteil(quelle.sourceRef);
      const eigenerTarget = !amBauteil(quelle.targetRef);
      const source = eigenerSource ? neueId() : idMap.get(quelle.sourceRef);
      const target = eigenerTarget ? neueId() : idMap.get(quelle.targetRef);
      if (eigenerSource) anker.push({ id: source, punkt: route[0] });
      if (eigenerTarget) anker.push({ id: target, punkt: route[route.length - 1] });
      edges.push({
        id: neueId(),
        quelle: quelle.edge?.id ?? null,
        source, target, eigenerSource, eigenerTarget,
        route,
        whole: quelle.whole !== false,
      });
    });
  });
  return { nodes, edges, anker };
}

/**
 * Getippter Winkel → Grad.
 *
 * Anders als eine Länge darf ein Winkel 0 sein (dann passiert nichts) und über
 * 360 hinausgehen (dann zählt der Rest). Unvollständiges wie „12." ergibt null
 * statt NaN — dieselbe Regel wie bei `laengeAusBuffer`.
 */
export function winkelAusBuffer(buffer) {
  const wert = Number.parseFloat(buffer);
  return Number.isFinite(wert) ? winkelNormiert(wert) : null;
}

/** Getippte Anzahl einer Reihe → ganze Zahl ≥ 2, sonst null. */
export function anzahlAusBuffer(buffer) {
  const wert = Number.parseInt(buffer, 10);
  return Number.isFinite(wert) && wert >= 2 ? wert : null;
}
