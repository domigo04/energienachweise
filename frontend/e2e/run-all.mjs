// Gesamtlauf der CAD-Browsertests: aufsetzen, alle Läufe, abräumen.
//
//     npm run e2e:cad
//
// Ein Kommando, wiederholbar, ohne manuelles Aufräumen. Der Rückgabewert ist
// die Anzahl fehlgeschlagener Läufe — damit taugt es auch für CI.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const HIER = path.dirname(new URL(import.meta.url).pathname);

// Reihenfolge bewusst: erst die abgesicherte Basis (Regressionsschutz), dann das
// Neue. Bricht die Basis, ist alles Weitere ohnehin nicht aussagekräftig.
const LAEUFE = ['portsnap', 'geometrie', 'mirror', 'copy', 'underlay', 'inline'];
const nurDiese = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const auswahl = nurDiese.length ? LAEUFE.filter((l) => nurDiese.includes(l)) : LAEUFE;

const node = (datei, args = []) => spawnSync('node', [path.join(HIER, datei), ...args],
  { stdio: 'inherit', cwd: path.resolve(HIER, '..') });

const abraeumen = () => node('stop.mjs');

// Ein evtl. hängengebliebener Aufbau aus einem früheren Lauf zuerst weg.
if (fs.existsSync(path.join(HIER, '.run.json'))) {
  console.log('── Reste eines früheren Aufbaus entfernen ──');
  abraeumen();
}

console.log('══ Testaufbau ══');
const aufbau = node('setup.mjs');
if (aufbau.status !== 0) {
  console.error('\nTestaufbau fehlgeschlagen — Läufe übersprungen.');
  abraeumen();
  process.exit(1);
}

const bilanz = [];
for (const lauf of auswahl) {
  const datei = `${lauf}.mjs`;
  if (!fs.existsSync(path.join(HIER, datei))) {
    console.log(`\n══ ${lauf} ══  (nicht vorhanden, übersprungen)`);
    continue;
  }
  console.log(`\n══ ${lauf} ══`);
  const r = node(datei);
  bilanz.push({ lauf, code: r.status ?? 1 });
}

console.log('\n══ Abräumen ══');
abraeumen();

console.log('\n════════ Gesamtbilanz ════════');
for (const b of bilanz) {
  console.log(`  ${b.code === 0 ? 'GRÜN ' : 'ROT  '} ${b.lauf}${b.code ? `  (${b.code} Fehler)` : ''}`);
}
const rot = bilanz.filter((b) => b.code !== 0);
console.log(rot.length ? `\n${rot.length} Lauf/Läufe rot.` : '\nAlle Läufe grün.');
process.exit(rot.length ? 1 : 0);
