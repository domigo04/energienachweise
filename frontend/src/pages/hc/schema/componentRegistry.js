// Zentrale Bauteil-Registry (§4/§8/§44). EINE deklarative Quelle für Kategorie,
// Beschriftung und Verhalten je Bauteiltyp — statt verstreuter `if type === …`.
// Die `type`-Werte entsprechen den BESTEHENDEN Editor-Nodes; hier werden keine
// Bauteile doppelt neu gebaut, nur ihre Eigenschaften zentral beschrieben.
//
// Felder:
//   type              Node-Typ im Schema-Graphen (Bestand)
//   label             Anzeigename in der Bauteilbox
//   category          fachliche Gruppe (§8)
//   inlineInsertable  darf per Drag auf eine bestehende Leitung gesetzt werden
//                     und teilt diese dann (§3/§4)
//   orientationAware  übernimmt beim Inline-Einsetzen die Leitungsrichtung (§5)
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

export const COMPONENTS = [
  // Erzeugung
  { type: "erzeuger", label: "Wärmeerzeuger / WP", category: "erzeugung" },
  { type: "erdsonden", label: "Erdsonden", category: "erzeugung" },
  { type: "pwt", label: "Fernwärme / PWT", category: "erzeugung" },
  // Speicher
  { type: "speicher", label: "Pufferspeicher", category: "speicher" },
  { type: "bww", label: "BWW-Speicher", category: "speicher" },
  // Verteilung
  { type: "verteiler", label: "Verteiler", category: "verteilung" },
  { type: "pump", label: "Pumpe", category: "verteilung", inlineInsertable: true, orientationAware: true },
  { type: "gruppe", label: "Heizgruppe", category: "verteilung" },
  // Armaturen
  { type: "valve2", label: "2-Weg-Ventil", category: "armaturen", inlineInsertable: true, orientationAware: true },
  // 3-Weg bewusst NICHT inline: die Verzweigung ist noch nicht sauber gelöst (§4).
  { type: "valve3", label: "3-Weg-Ventil", category: "armaturen" },
  { type: "stad", label: "STAD", category: "armaturen", inlineInsertable: true, orientationAware: true },
  { type: "shutoff", label: "Absperrung", category: "armaturen", inlineInsertable: true, orientationAware: true },
  { type: "checkvalve", label: "Rückschlagventil", category: "armaturen", inlineInsertable: true, orientationAware: true },
  // Messung
  { type: "waermezaehler", label: "Wärmezähler", category: "messung", inlineInsertable: true, orientationAware: true },
  { type: "temperatur", label: "Temperaturfühler", category: "messung", inlineInsertable: true, orientationAware: true },
  // Sicherheit
  { type: "expansion", label: "Expansionsgefäss", category: "sicherheit" },
  { type: "sicherheitsventil", label: "Sicherheitsventil", category: "sicherheit" },
  // Verbraucher
  { type: "verbraucher", label: "Verbraucher", category: "verbraucher" },
  // Annotation — ohne hydraulische Bedeutung, nicht im ProjectContext (§9/§10)
  { type: "label", label: "Textblock", category: "annotation", annotation: true },
  { type: "concrete_area", label: "Betonfläche", category: "annotation", annotation: true },
  { type: "interface_line", label: "Systemgrenze", category: "annotation", annotation: true },
];

const BY_TYPE = Object.fromEntries(COMPONENTS.map((c) => [c.type, c]));

export function componentDef(type) {
  return BY_TYPE[type] || null;
}

export function isInlineInsertable(type) {
  return Boolean(BY_TYPE[type]?.inlineInsertable);
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
  return COMPONENTS.filter((c) => c.inlineInsertable).map((c) => c.type);
}
