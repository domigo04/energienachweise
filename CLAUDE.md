# Heizungscockpit – Arbeitsregeln

Dieses Dokument enthält nur Regeln, die bei jeder Änderung relevant sind.
Historie und erledigte Bugs gehören in Git, nicht hierher.

`AGENTS.md` ist die werkzeugneutrale Grundlage für den Agentenworkflow und ist
auch für Claude verbindlich. Dieses Dokument ergänzt sie um die fachlichen und
technischen Regeln des Heizungscockpits. Bei einem materiellen Widerspruch nicht
selbst entscheiden, sondern Dominic die konkrete Frage vorlegen.

## Arbeitsauftrag

- Issue oder Auftrag vollständig lesen und Ziel, In-Scope, Out-of-Scope und
  Akzeptanzkriterien als Arbeitsvertrag verwenden.
- Vor Änderungen `git status`, Branch und bestehenden Diff prüfen. Nicht direkt
  auf `main` arbeiten und fremde Änderungen nicht überschreiben.
- Nur den freigegebenen Scope umsetzen. Commit, Push und PR-Erstellung erfolgen
  nur auf ausdrücklichen Auftrag.
- Übergaben enthalten geänderte Dateien, erreichte Akzeptanzkriterien,
  Prüfnachweise, nicht ausgeführte Prüfungen mit Grund, Risiken und offene
  Fragen. Die Vorlagen unter `.github/` sind dafür verbindlich.

## Vor jeder Änderung lesen

Je nach Aufgabe:

- Produkt und Grenzen: `docs/PRODUCT.md`
- Architektur, Daten und Rechte: `docs/ARCHITECTURE.md`
- aktuelle Reihenfolge: `docs/ROADMAP.md`
- Hydraulik und Formeln: `PHYSIK.md`

Bei Widersprüchen gilt die neueste ausdrückliche Vorgabe von Dominic. Offene
fachliche Entscheide nicht erraten.

## Verbindliche Regeln

1. So wenig Code und Sonderlogik wie möglich.
2. React Flow bleibt vorerst der produktive Schema-Editor.
3. Berechnungslogik lebt ausschliesslich im Backend.
4. Jede neue oder geänderte Formel braucht einen Backendtest und einen
   verständlichen Rechenweg für den Export.
5. Referenzprojekte und Kosten bleiben strikt innerhalb der Firma.
6. Projekte sind firmenweit. Rechte werden über Firmenrollen geregelt.
7. Automatische Werte müssen erkennbar, erklärbar und kontrolliert
   überschreibbar sein.
8. Freigegebene Stände sind unveränderbare Snapshots. Änderungen erzeugen eine
   neue Revision.
9. Jede relevante Änderung muss Benutzer, Zeitpunkt und Differenz protokollieren.
10. Keine echten Projekt- oder Benutzerdaten in Tests, Commits oder Logs.

## Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL Produktion, SQLite lokal
- Frontend: React, Vite, Tailwind, React Flow
- Schema: `frontend/src/pages/hc/HydraulikEditor.jsx`
- Hydraulik: `backend/app/calculations/hydraulik.py`
- Kostenschätzung: `backend/app/calculations/grobkostenschaetzung.py`

## Prüfen

```bash
cd backend && python -m pytest tests -q
cd frontend && npm test && npm run build
```

Bei Migrationen zusätzlich den in `AGENTS.md` dokumentierten Migrationstest auf
einer leeren SQLite-Datenbank ausführen. Bei React-Hook-Änderungen gilt auch die
gezielte Hook-Prüfung aus `.github/workflows/ci-deploy.yml`.

Bei Editoränderungen zusätzlich den vollständigen Ablauf prüfen:

1. Projekt und Schema öffnen.
2. Bauteil platzieren, drehen, verschieben und löschen.
3. Leitung zeichnen und Eckpunkte bearbeiten.
4. Berechnung kontrollieren.
5. Speichern und neu laden.
6. PDF mit Zeichenansicht vergleichen.

## Definition of Done

Eine Änderung ist erst fertig, wenn:

- das reale Nutzerproblem gelöst ist;
- bestehende Projekte weiter laden;
- Berechtigungen und Mandantentrennung stimmen;
- Berechnung und Export denselben Stand verwenden;
- relevante Akzeptanzkriterien nachweisbar erfüllt sind;
- relevante Tests und Frontend-Build erfolgreich sind oder eine nicht
  ausgeführte Prüfung ausdrücklich begründet ist;
- keine neue vermeidbare Sonderlogik entstanden ist.
