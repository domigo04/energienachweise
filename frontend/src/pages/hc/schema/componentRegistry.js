// Zentrale Bauteil-Registry (§4/§8/§44). EINE deklarative Quelle für Kategorie,
// Beschriftung und Verhalten je Bauteiltyp — statt verstreuter `if type === …`.
// Die `type`-Werte entsprechen den BESTEHENDEN Editor-Nodes; hier werden keine
// Bauteile doppelt neu gebaut, nur ihre Eigenschaften zentral beschrieben.
//
// Felder:
//   type              Node-Typ im Schema-Graphen (Bestand)
//   label             Anzeigename in der Bauteilbox
//   category          fachliche Gruppe (§8)
//   placement         Wie das Bauteil auf eine bestehende Leitung trifft:
//                       free             frei platzieren, Leitung bleibt unberührt
//                       inline           teilt die Leitung, zwei gegenüberliegende Ports
//                       inline_threeway  wie inline, der dritte Port bleibt frei
//                       branch           hängt mit EINEM Port als Abzweig an der Leitung
//                     Verhalten hängt am Bauteil, nicht am deutschen Namen.
//   orientationAware  übernimmt beim Inline-Einsetzen die Leitungsrichtung (§5)
//   branch            Abzweig-Bauteile: { port, x, y, w, h } — Handle-ID und die
//                     Lage dieses Anschlusses IM Symbol (0…1 der Symbolgrösse),
//                     damit der Anschlusspunkt exakt am sichtbaren Anschluss sitzt
//   annotation        reine Zeichnung ohne hydraulische Bedeutung (§9/§10)

export const CATEGORIES = [
  { key: "erzeugung", label: "Erzeugung" },
  { key: "speicher", label: "Speicher" },
  { key: "verteilung", label: "Verteilung" },
  { key: "armaturen", label: "Armaturen" },
  { key: "messung", label: "Messung" },
  { key: "sicherheit", label: "Sicherheit" },
  { key: "verbraucher", label: "Verbraucher" },
  { key: "annotation", label: "Annotation" },
];

const INLINE = { placement: "inline", orientationAware: true };

export const COMPONENTS = [
  // Erzeugung
  { type: "erzeuger", label: "Wärmeerzeuger / WP", category: "erzeugung", placement: "free" },
  { type: "erdsonden", label: "Erdsonden", category: "erzeugung", placement: "free" },
  { type: "pwt", label: "Plattentauscher / Fernwärme", category: "erzeugung", placement: "free" },
  // Speicher
  { type: "speicher", label: "Pufferspeicher", category: "speicher", placement: "free" },
  { type: "bww", label: "BWW-Speicher", category: "speicher", placement: "free" },
  // Verteilung
  { type: "verteiler", label: "Verteiler", category: "verteilung", placement: "free" },
  { type: "pump", label: "Pumpe", category: "verteilung", ...INLINE },
  { type: "gruppe", label: "Heizgruppe", category: "verteilung", placement: "free" },
  // Armaturen
  { type: "valve2", label: "2-Weg-Ventil", category: "armaturen", ...INLINE },
  // 3-Weg: die beiden gegenüberliegenden Hauptports (top/bottom) bilden den
  // Inline-Weg, der dritte Port (right) bleibt für eine spätere Leitung frei.
  { type: "valve3", label: "3-Weg-Ventil", category: "armaturen",
    placement: "inline_threeway", orientationAware: true, freePort: "right" },
  { type: "stad", label: "STAD", category: "armaturen", ...INLINE },
  { type: "shutoff", label: "Absperrung", category: "armaturen", ...INLINE },
  { type: "checkvalve", label: "Rückschlagventil", category: "armaturen", ...INLINE },
  // Messung
  { type: "waermezaehler", label: "Wärmezähler", category: "messung", ...INLINE },
  // Der Temperaturfühler ist ein ABGRIFF, kein Bauteil mit zwei Anschlüssen.
  // Er teilt keine Leitung und erzeugt auch keinen hydraulischen Abzweig
  // (PHYSIK §7: nur Symbol) — deshalb frei platzierbar.
  { type: "temperatur", label: "Temperaturfühler", category: "messung", placement: "free" },
  // Sicherheit — beide hängen mit EINEM Anschluss an der Leitung (§15/§18).
  { type: "expansion", label: "Expansionsgefäss", category: "sicherheit",
    placement: "branch", branch: { port: "bottom", x: 0.488, y: 1, w: 38, h: 53 } },
  { type: "sicherheitsventil", label: "Sicherheitsventil", category: "sicherheit",
    placement: "branch", branch: { port: "an", x: 0.12, y: 0.61, w: 40, h: 34 } },
  // Verbraucher
  { type: "verbraucher", label: "Verbraucher", category: "verbraucher", placement: "free" },
  // Annotation — ohne hydraulische Bedeutung, nicht im ProjectContext (§9/§10)
  { type: "label", label: "Textblock", category: "annotation", annotation: true, placement: "free" },
  { type: "concrete_area", label: "Betonfläche", category: "annotation", annotation: true, placement: "free" },
  { type: "interface_line", label: "Systemgrenze", category: "annotation", annotation: true, placement: "free" },
];

const BY_TYPE = Object.fromEntries(COMPONENTS.map((c) => [c.type, c]));

export function componentDef(type) {
  return BY_TYPE[type] || null;
}

// Ein Bauteil ohne Eintrag verhält sich wie `free` — es fasst nie ungefragt
// eine bestehende Leitung an.
export function placementBehavior(type) {
  return BY_TYPE[type]?.placement || "free";
}

export function isInlineInsertable(type) {
  return ["inline", "inline_threeway"].includes(placementBehavior(type));
}

// Abzweig-Bauteil: erzeugt an der Leitung eine echte Junction und hängt mit
// seinem einzigen Anschluss daran (§18/§19).
export function isBranchInsertable(type) {
  return placementBehavior(type) === "branch" && Boolean(BY_TYPE[type]?.branch);
}

export function branchAnschluss(type) {
  return BY_TYPE[type]?.branch || null;
}

// Der dritte, bewusst frei bleibende Anschluss eines Inline-3-Weg-Ventils.
export function freierPort(type) {
  return BY_TYPE[type]?.freePort || null;
}

export function isOrientationAware(type) {
  return Boolean(BY_TYPE[type]?.orientationAware);
}

export function isAnnotation(type) {
  return Boolean(BY_TYPE[type]?.annotation);
}

// Bauteile einer Kategorie in deklarierter Reihenfolge (für die Bauteilbox §8).
export function componentsByCategory(category) {
  return COMPONENTS.filter((c) => c.category === category);
}

// Typen, die per Inline-Drop auf eine Leitung gesetzt werden dürfen (§4).
export function inlineInsertableTypes() {
  return COMPONENTS.filter((c) => isInlineInsertable(c.type)).map((c) => c.type);
}

// Sichtbare Grundgrössen der kompakten Inline-Symbole. Ihre hydraulische
// Hauptachse liegt bei allen exakt in der Mitte. Damit kann ein Bauteil beim
// Einsetzen ohne typabhängigen Schätzwert auf dem getroffenen Leitungspunkt
// zentriert werden. Bestehende Schemas bleiben kompatibel; die Grösse ist reine
// Darstellung und wird nicht in den Graph geschrieben.
export const INLINE_COMPONENT_SIZES = Object.freeze({
  pump:        { w: 24, h: 24 },
  valve2:      { w: 34, h: 24 },
  valve3:      { w: 38, h: 24 },
  stad:        { w: 12, h: 28 },
  shutoff:     { w: 14, h: 28 },
  checkvalve:  { w: 16, h: 28 },
  waermezaehler:{ w: 26, h: 26 },
});

export function inlineComponentSize(type) {
  return INLINE_COMPONENT_SIZES[type] || null;
}

export function inlineNodePosition(type, point) {
  const size = inlineComponentSize(type);
  if (!size || !point) return point;
  return { x: point.x - size.w / 2, y: point.y - size.h / 2 };
}
