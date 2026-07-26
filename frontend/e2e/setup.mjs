// Testaufbau für die CAD-Browsertests: isolierte Datenbank, Backend, Frontend.
//
// Erzeugt eine temporäre SQLite-Datei, legt Benutzer, Projekt und Schema an,
// startet beide Server, meldet sich an und schreibt alles nach `e2e/.run.json`.
// Die erzeugten IDs werden weitergegeben — kein Test nimmt an, dass ein Schema
// die ID 1 hat.
//
// Es werden ausschliesslich Testwerte verwendet. Echte Projekt- oder
// Benutzerdaten haben hier nichts zu suchen.
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const HIER = path.dirname(new URL(import.meta.url).pathname);
const FRONTEND = path.resolve(HIER, '..');
const BACKEND = path.resolve(FRONTEND, '..', 'backend');
const LAUFDATEI = path.join(HIER, '.run.json');

const API_PORT = Number(process.env.CAD_API_PORT || 8021);
const APP_PORT = Number(process.env.CAD_APP_PORT || 5210);
const API = `http://127.0.0.1:${API_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;

// Testzugang — bewusst eine offensichtlich unechte Adresse.
const EMAIL = 'cad-e2e@cad-demo.example.com';
const PASSWORT = 'CadE2E-2026';

const arbeitsordner = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-e2e-'));
const DB = path.join(arbeitsordner, 'cad-e2e.db');

const log = (...a) => console.log('[setup]', ...a);

// ── 1. Datenbank anlegen und befüllen ──────────────────────────────────────
const SEED = `
import json, sys
from app.database import Base, engine, SessionLocal
from app.models.auth import User
from app.models.heizungscockpit import HcProject, HcSchema
from passlib.context import CryptContext

Base.metadata.create_all(bind=engine)
db = SessionLocal()
pwd = CryptContext(schemes=['bcrypt'], deprecated='auto')
u = User(tenant_id=1, email=${JSON.stringify(EMAIL)},
         password_hash=pwd.hash(${JSON.stringify(PASSWORT)}), name='CAD E2E',
         role='admin', firma_role='admin', is_verified=True, is_active=True)
db.add(u); db.commit(); db.refresh(u)
p = HcProject(tenant_id=1, name='CAD E2E', erstellt_von=u.id, status='aktiv')
db.add(p); db.commit(); db.refresh(p)
s = HcSchema(tenant_id=1, project_id=p.id, name='Schema',
             graph_json=json.dumps({'nodes': [], 'edges': []}))
db.add(s); db.commit(); db.refresh(s)
print(json.dumps({'userId': u.id, 'projectId': p.id, 'schemaId': s.id}))
`;

log('Datenbank:', DB);
const seedAusgabe = execFileSync('python3', ['-c', SEED], {
  cwd: BACKEND,
  env: { ...process.env, DATABASE_URL: `sqlite:///${DB}` },
  encoding: 'utf8',
});
const ids = JSON.parse(seedAusgabe.trim().split('\n').at(-1));
log('angelegt:', JSON.stringify(ids));

// ── 2. Server starten ──────────────────────────────────────────────────────
const kinder = [];
const starte = (name, cmd, args, opt) => {
  const datei = path.join(arbeitsordner, `${name}.log`);
  const aus = fs.openSync(datei, 'a');
  const kind = spawn(cmd, args, { ...opt, stdio: ['ignore', aus, aus], detached: true });
  // Ohne `unref()` hält der Kindprozess dieses Skript offen und `setup.mjs`
  // kehrt nie zurück — der Gesamtlauf wartet dann ewig auf den Aufbau.
  kind.unref();
  kinder.push({ name, pid: kind.pid, log: datei });
  log(`${name} gestartet (pid ${kind.pid}), Protokoll ${datei}`);
  return kind;
};

const aufraeumen = () => {
  for (const k of kinder) {
    try { process.kill(-k.pid, 'SIGTERM'); } catch { /* schon beendet */ }
  }
};
process.on('exit', () => { if (!process.env.CAD_KEEP) aufraeumen(); });

starte('backend', 'python3', ['-m', 'uvicorn', 'app.main:app', '--port', String(API_PORT)], {
  cwd: BACKEND,
  env: {
    ...process.env,
    DATABASE_URL: `sqlite:///${DB}`,
    ALLOWED_ORIGINS: JSON.stringify([APP]),
  },
});

starte('frontend', 'npx', ['vite', '--port', String(APP_PORT), '--host', '127.0.0.1'], {
  cwd: FRONTEND,
  env: { ...process.env, VITE_API_BASE: API },
});

// ── 3. Warten, bis beide antworten ─────────────────────────────────────────
const warteAuf = async (url, name, sekunden = 45) => {
  for (let i = 0; i < sekunden * 2; i += 1) {
    try {
      const r = await fetch(url);
      if (r.status < 500) { log(`${name} erreichbar`); return true; }
    } catch { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} antwortet nicht (${url}). Protokolle in ${arbeitsordner}`);
};

await warteAuf(`${API}/docs`, 'Backend');
await warteAuf(APP, 'Frontend');

// ── 4. Anmelden ────────────────────────────────────────────────────────────
const anmeldung = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORT }),
});
if (!anmeldung.ok) throw new Error(`Anmeldung fehlgeschlagen: ${anmeldung.status}`);
const daten = await anmeldung.json();

const lauf = {
  api: API,
  app: APP,
  token: daten.access_token,
  user: daten.user,
  projectId: ids.projectId,
  schemaId: ids.schemaId,
  db: DB,
  arbeitsordner,
  prozesse: kinder.map((k) => ({ name: k.name, pid: k.pid, log: k.log })),
};
fs.writeFileSync(LAUFDATEI, JSON.stringify(lauf, null, 2));
log('bereit — Projekt', lauf.projectId, 'Schema', lauf.schemaId);

// Die Prozesse laufen weiter; `stop.mjs` beendet sie und räumt auf.
process.env.CAD_KEEP = '1';
