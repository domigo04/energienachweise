// Beendet den Testaufbau und räumt die temporären Dateien weg.
// Wiederholbar: ein zweiter Aufruf ohne laufenden Aufbau ist kein Fehler.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath statt .pathname: sonst bleibt in einem Pfad mit Leerzeichen
// («Mobile Documents») ein %20 stehen und jeder Kindprozess scheitert.
const HIER = path.dirname(fileURLToPath(import.meta.url));
const LAUFDATEI = path.join(HIER, '.run.json');

if (!fs.existsSync(LAUFDATEI)) {
  console.log('[stop] kein Testaufbau vorhanden');
  process.exit(0);
}

const lauf = JSON.parse(fs.readFileSync(LAUFDATEI, 'utf8'));
for (const p of lauf.prozesse || []) {
  try {
    process.kill(-p.pid, 'SIGTERM');       // ganze Prozessgruppe
    console.log(`[stop] ${p.name} (pid ${p.pid}) beendet`);
  } catch {
    console.log(`[stop] ${p.name} (pid ${p.pid}) lief nicht mehr`);
  }
}

// Kurz warten, damit die Ports frei werden, bevor ein neuer Lauf startet.
await new Promise((r) => setTimeout(r, 700));

if (lauf.arbeitsordner && !process.env.CAD_KEEP_FILES) {
  try {
    fs.rmSync(lauf.arbeitsordner, { recursive: true, force: true });
    console.log('[stop] Arbeitsordner entfernt');
  } catch (e) {
    console.log('[stop] Arbeitsordner blieb liegen:', e.message);
  }
}
fs.rmSync(LAUFDATEI, { force: true });
console.log('[stop] fertig');
