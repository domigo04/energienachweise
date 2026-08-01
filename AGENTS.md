# Heizungscockpit – Agentenworkflow

Diese Regeln gelten für das gesamte Repository. Untergeordnete `AGENTS.md`
dürfen sie für ihren Verzeichnisbaum ergänzen, aber nicht stillschweigend
aufweichen.

## Auftrag und Reihenfolge

1. Die konkrete Aufgabe und ihre Akzeptanzkriterien bestimmen den Scope.
2. Diese `AGENTS.md` ist die werkzeugneutrale Grundlage für alle Agenten.
3. `CLAUDE.md` ergänzt die fachlichen und technischen Projektregeln.
4. Je nach Aufgabe sind zusätzlich `docs/PRODUCT.md`,
   `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `PHYSIK.md` und das einschlägige
   Kapitel in `Pflichtenheft.md` zu lesen.

Bei einem materiellen Widerspruch oder einer fachlich offenen Entscheidung:
nicht raten, sondern die konkrete Frage mit den realistischen Optionen an
Dominic zurückgeben.

## Vor jeder Änderung

- Issue beziehungsweise Auftrag vollständig lesen und Ziel, In-Scope,
  Out-of-Scope und Akzeptanzkriterien festhalten.
- `git status`, aktuellen Branch und bestehenden Diff prüfen. Fremde oder
  nicht zugehörige Änderungen nicht überschreiben.
- Relevante Nachbardateien, Tests und Dokumentation lesen, bevor Code geändert
  wird.
- Risiko für Berechnungen, Mandantentrennung, Berechtigungen, Migrationen,
  Revisionen, Audit-Log, Exporte und echte Daten ausdrücklich prüfen.
- Auf `main` wird nicht direkt gearbeitet. Neue Arbeitsbranches basieren auf
  dem aktuellen `origin/main` und heissen zum Beispiel `codex/<kurzer-name>`
  oder `claude/<kurzer-name>`.

## Rollen und Übergaben

### Koordination

- Zerlegt nur dann in Teilaufgaben, wenn Grenzen und Übergaben klar sind.
- Verhindert parallele Schreibzugriffe auf dieselben Dateien.
- Hält Scope, offene Entscheide und Prüfnachweise bis zur PR nachvollziehbar.

### Implementierung

- Ändert nur den freigegebenen Scope und folgt dem bestehenden Stil.
- Bevorzugt die kleinste vollständige Lösung ohne zusätzliche Sonderlogik.
- Ergänzt Tests für geändertes Verhalten; Formeln brauchen einen Backendtest
  und einen verständlichen Rechenweg für den Export.
- Commit, Push und PR-Erstellung erfolgen nur auf ausdrücklichen Auftrag.

### Review

- Prüft den tatsächlichen Diff gegen Auftrag, Akzeptanzkriterien und
  Projektdokumentation.
- Priorisiert Korrektheit, Daten- und Rechteisolation, Regressionen und fehlende
  Tests vor Stilfragen.
- Meldet Findings mit Priorität und genauer Stelle. Review-Agenten ändern den
  geprüften Code nicht selbst.

### Test

- Prüft das reale Verhalten und berichtet pro Prüfpunkt `PASS`, `FAIL` oder
  `NICHT AUSGEFÜHRT` mit Beleg.
- Verändert keinen Produktivcode. Für UI-/API-Tests werden ausschliesslich
  Wegwerf-Projekte verwendet und danach wieder entfernt.
- Preview-Server und andere gestartete Prozesse werden am Ende gestoppt.

Eine Übergabe enthält immer: geänderte Dateien, erreichte Akzeptanzkriterien,
ausgeführte Prüfungen mit Ergebnis, nicht ausgeführte Prüfungen mit Grund,
Risiken sowie offene Fragen.

## Projektinvarianten

- React Flow bleibt vorerst der produktive Schema-Editor.
- Berechnungslogik lebt ausschliesslich im Backend.
- Referenzprojekte und Kosten bleiben strikt innerhalb der Firma; Projekte sind
  firmenweit und Rechte werden über Firmenrollen geregelt.
- Automatische Werte sind erkennbar, erklärbar und kontrolliert
  überschreibbar.
- Freigegebene Stände sind unveränderbare Snapshots; Änderungen erzeugen eine
  neue Revision.
- Relevante Änderungen protokollieren Benutzer, Zeitpunkt und Differenz.
- Keine echten Projekt- oder Benutzerdaten in Tests, Commits, Issues, PRs oder
  Logs.

## Prüfen

Prüfungen richten sich nach dem betroffenen Bereich. Dokumentations- und
Governance-Änderungen brauchen keine vollständige Anwendungstest-Suite, müssen
aber syntaktisch geprüft und als Diff kontrolliert werden.

```bash
# Backend
cd backend
python -m pytest tests -q

# Migration auf leerer SQLite-Datenbank wie in CI
DATABASE_URL=sqlite:////tmp/hc-ci-migration.db ENVIRONMENT=test \
  python -m alembic -c alembic.ini upgrade head

# Frontend
cd frontend
npm ci
npm test
npm run build
```

Bei Änderungen am Schema-Editor zusätzlich den in `CLAUDE.md` beschriebenen
vollständigen Editorablauf und die passenden Skripte unter `frontend/e2e/`
prüfen. Änderungen an React Hooks müssen ausserdem die in
`.github/workflows/ci-deploy.yml` gefilterte Regel
`react-hooks/rules-of-hooks` bestehen.

## Aktueller CI-Rahmen

Die beiden bestehenden Workflows bleiben vorerst getrennt und unverändert:

- `.github/workflows/ci.yml`: Backendtests mit Python 3.12, Migrationstest,
  Frontendtests und Frontend-Build mit Node 20.19.0.
- `.github/workflows/ci-deploy.yml`: Backendtests mit Python 3.11 inklusive
  OCR-Systempaketen, React-Hook-Prüfung und Frontend-Build; auf `main` folgt
  optional ein Railway-Deploy.

Die teilweise doppelten Prüfungen und die abweichenden Laufzeitversionen sind
bekannte Konsolidierungspunkte. Sie werden erst in einer eigenen, ausdrücklich
freigegebenen CI-Aufgabe geändert.

## Pull Requests

- Eine PR behandelt ein Thema und verweist auf das zugehörige Issue.
- Die PR-Vorlage wird vollständig ausgefüllt; nicht relevante oder nicht
  ausgeführte Punkte werden begründet statt kommentarlos gelöscht.
- Der Diff enthält keine Debug-Artefakte, generierten Analyseordner, Secrets
  oder unabhängige Aufräumarbeiten.
- Vor der Freigabe müssen alle relevanten Akzeptanzkriterien und Prüfungen
  nachvollziehbar sein. CODEOWNERS-Freigaben ersetzen keine fachliche Prüfung.
