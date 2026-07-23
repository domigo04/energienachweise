# Heizungscockpit

Engineering-Plattform für die Heizungsplanung. Der Kern ist ein lebendes
Anlagenschema: Bauteile und Leitungen tragen ihre Eigenschaften, das Backend
berechnet die Hydraulik und erzeugt nachvollziehbare Ergebnisse und Exporte.

## Produktbereiche

- **Schema:** Hydraulikschema mit React Flow, Berechnungen und PDF-Export
- **Grobkostenschätzung:** firmeninterne Referenzprojekte, BKP-Schätzung und Freigaben
- **Schnellrechner:** Ventil, Druckverlust und RAVEL ohne Projekt

Die verbindlichen Produkt- und Technikentscheide stehen in:

- [docs/PRODUCT.md](docs/PRODUCT.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [PHYSIK.md](PHYSIK.md)

## Lokal starten

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Tests:

```bash
cd backend
python3 -m pytest tests -q
```

Ohne `DATABASE_URL` verwendet das Backend lokal SQLite. Für Produktion muss
eine persistente PostgreSQL-Datenbank verbunden sein.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Production-Build:

```bash
cd frontend
npm run build
```

## Notwendige Produktionsvariablen

- `DATABASE_URL`: persistente PostgreSQL-Verbindung
- `SECRET_KEY`: eigener langer JWT-Schlüssel
- `ADMIN_EMAIL`
- `ADMIN_INITIAL_PASSWORD`
- `ALLOWED_ORIGINS`
- Frontend: `VITE_API_BASE`

Ein Git-Push darf keine Benutzer oder Projekte löschen. Das ist gewährleistet,
wenn `DATABASE_URL` auf eine persistente PostgreSQL-Instanz zeigt. Der
SQLite-Fallback ist nur für lokale Entwicklung geeignet und darf auf Railway
nicht als Produktionsdatenbank verwendet werden.
