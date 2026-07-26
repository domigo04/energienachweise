# Browsertests für die CAD-Interaktion

Diese Tests fahren die Kerninteraktionen des Schemaeditors in einem echten
Browser durch. Sie prüfen **Geometrie**, nicht das Vorhandensein von Elementen:
gemessen werden Fangkoordinaten, gespeicherte Leitungspunkte und Portreferenzen
aus dem Backend.

Sie laufen **nicht** in CI — sie brauchen ein laufendes Backend mit Testdaten.
Der reguläre Testlauf (`npm test`) bleibt davon unberührt.

## Was geprüft wird

`portsnap.mjs` — der Anschlussfang, Fall für Fall:

- Fang auf einen Bauteilanschluss von aussen kommend
- die Vierfach-Identität: **Marker == gewählter Fang == gesetzter Endpunkt ==
  gespeicherte Portreferenz**
- Anschluss schlägt Raster
- kein Flackern beim langsamen Überfahren der Fanggrenze
- Fang bei 25 %, 50 %, 100 %, 200 % und 400 % Zoom
- Anschlusspositionen nach einer Drehung

`geometrie.mjs` — Bearbeiten bestehender Geometrie:

- Segment parallel verschieben (senkrecht und waagrecht), Nachbarsegmente
  verlängern sich, keine neue Ecke, keine Diagonale
- Portbindung übersteht einen Segment-Stretch
- Bauteil verschieben: Verbindung bleibt, anderes Ende bleibt liegen
- Undo nimmt Bauteilposition und Leitungsgeometrie gemeinsam zurück
- Drehung: Anschlüsse wandern sichtbar, IDs bleiben, Leitung folgt geometrisch
- Auswahlfenster
- Abbrüche hinterlassen keine Anker, keine Kanten, keine NaN-Koordinaten
- Speichern und Neuladen verändert die Geometrie nicht

## Vorbereitung

Die Tests brauchen ein Backend, ein Projekt mit Schema und ein Anmeldetoken.

```bash
# 1. Testdatenbank mit Benutzer, Projekt und Schema anlegen
cd backend
DATABASE_URL='sqlite:///./cadtest.db' python3 - <<'PY'
import json
from app.database import Base, engine, SessionLocal
from app.models.auth import User
from app.models.heizungscockpit import HcProject, HcSchema
from passlib.context import CryptContext
Base.metadata.create_all(bind=engine)
db = SessionLocal(); pwd = CryptContext(schemes=['bcrypt'], deprecated='auto')
u = db.query(User).filter(User.email=='cad@cad-demo.example.com').first()
if not u:
    u = User(tenant_id=1, email='cad@cad-demo.example.com',
             password_hash=pwd.hash('CadTest2026'), name='CAD Test',
             role='admin', firma_role='admin', is_verified=True, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
p = db.query(HcProject).first() or HcProject(tenant_id=1, name='CAD Demo',
                                            erstellt_von=u.id, status='aktiv')
db.add(p); db.commit(); db.refresh(p)
if not db.query(HcSchema).filter(HcSchema.project_id==p.id).first():
    db.add(HcSchema(tenant_id=1, project_id=p.id, name='Schema',
                    graph_json=json.dumps({'nodes':[],'edges':[]})))
    db.commit()
print('bereit: Projekt', p.id)
PY

# 2. Backend starten — der Vite-Port muss als Origin erlaubt sein
DATABASE_URL='sqlite:///./cadtest.db' ALLOWED_ORIGINS='["http://127.0.0.1:5199"]' \
  python3 -m uvicorn app.main:app --port 8011 &

# 3. Frontend starten
cd ../frontend
VITE_API_BASE=http://127.0.0.1:8011 npx vite --port 5199 --host 127.0.0.1 &

# 4. Token und Benutzer ablegen
mkdir -p /tmp/cad
curl -s -X POST http://127.0.0.1:8011/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cad@cad-demo.example.com","password":"CadTest2026"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); \
      open('/tmp/cad/token.txt','w').write(d['access_token']); \
      open('/tmp/cad/user.json','w').write(json.dumps(d['user']))"
```

## Ausführen

```bash
cd frontend
npm run e2e:portsnap
npm run e2e:geometrie
```

Über Umgebungsvariablen anpassbar: `CAD_OUT` (Ablage für Token und
Bildschirmfotos, Standard `/tmp/cad`), `CAD_APP`, `CAD_API`.

Die Zugangsdaten hier sind reine Testwerte für eine lokale SQLite-Datei. Es
gehören **keine** echten Projekt- oder Benutzerdaten in diese Tests.

## Die Prüfsonde

Der Editor legt im Entwicklungsmodus die letzte Fangentscheidung unter
`window.__hcSnap` ab (und die letzten Entscheidungen unter
`window.__hcSnapVerlauf`). Nur dadurch lässt sich prüfen, dass der angezeigte
Marker und der intern gewählte Fang dieselbe Koordinate haben — ohne das wäre
nur „irgendein Marker ist sichtbar" prüfbar. In der Produktion existiert die
Sonde nicht (`import.meta.env.DEV`).

## Stolperfallen, die hier schon Zeit gekostet haben

- Der Endpunkt `PUT /api/v1/schemas/{id}/graph` erwartet den Graphen **unter
  `graph`**. Flach gesendet antwortet er 200 und löscht nichts.
- `page.locator('text').allInnerTexts()` liefert für SVG-`<text>` leere Strings.
  Über `textContent` auslesen.
- Testgeometrie kompakt um die Bildmitte legen. Das Einpassen der Ansicht
  berücksichtigt nur Bauteilgrenzen, und die Leitungsanker sind 1 px gross —
  eine weit ausgreifende Leitung landet sonst unter dem Eigenschaften-Panel.
- Bauteile nicht über `nodeIds().at(-1)` suchen: das trifft die unsichtbaren
  Leitungsanker. `.react-flow__node-<typ>` verwenden.
