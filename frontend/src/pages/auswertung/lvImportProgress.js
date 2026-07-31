// Punkt 24 — sichtbarer Verarbeitungszustand statt scheinbar eingefrorener Seite.
export const PROCESSING = [
  { ab: 0, titel: "PDF wird hochgeladen", detail: "Datei wird sicher an den Import übergeben." },
  { ab: 2, titel: "Seiten werden gelesen und klassifiziert", detail: "Deckblatt, LV, Technik, Kosten und Konditionen werden getrennt." },
  { ab: 7, titel: "Technische Kennwerte werden erkannt", detail: "Erzeuger, Erdsonden, Rohrmeter, Pumpen und Wärmemessungen." },
  { ab: 18, titel: "Kosten und Abzüge werden geprüft", detail: "BKP-Positionen, Rabatt, Skonto, Abzüge und MWST werden nachgerechnet." },
  { ab: 45, titel: "KI-Prüfung und Resultat werden abgeschlossen", detail: "Nur unsichere Seiten werden visuell geprüft und normalisiert." },
];

// Kein Array.findLastIndex(): ältere Safari-/WebView-Versionen unterstützen
// die Methode nicht und liessen den LV-Importer während des Uploads komplett
// weiss abstürzen. Die kleine Schleife läuft in allen unterstützten Browsern.
export function processingSchritt(seconds) {
  let index = 0;
  for (let i = 0; i < PROCESSING.length; i += 1) {
    if (seconds < PROCESSING[i].ab) break;
    index = i;
  }
  return index;
}
