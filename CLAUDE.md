# Heizungscockpit — Projekt-Leitplanken

Engineering-Plattform für Heizungsplanung (Dominic Goulon, SIREGO GmbH, Winterthur).
Kernidee: ein **lebendes Anlagenschema**, das selbst die Datenbank ist — Auslegungen sind
Eigenschaften der Bauteile im Schema, eine Wahrheit. Details im **[Pflichtenheft](Pflichtenheft.md)**.

## Verbindliche Regeln (immer einhalten)
1. **Pflichtenheft ist bindend.** `Pflichtenheft.md` und alles, was Dominic schriftlich
   festlegt, gilt. **Nie stillschweigend abweichen** — Abweichung nur nach Rückfrage.
2. **Vor Umsetzung fragen.** Bei offenen Design-/Umsetzungs-Entscheiden zuerst einen
   Vorschlag machen und Dominic fragen. **Aber:** klare, bereits abgesprochene Inputs
   **zügig umsetzen** — kein Zerreden (Bias to Action).
3. **So schlank wie möglich.** Kein Ballast, keine Features auf Vorrat.
4. **Sprache:** einfaches (Schweizer) Deutsch, «ss» statt «ß». Dominic ist Heizungsplaner,
   kein Programmierer → Technisches immer **ELI5** erklären (wie für ein Kind).
5. **Korrektheit vor allem** bei der Hydraulik — «es muss stimmen». Alle physikalischen
   Regeln stehen verbindlich in **[PHYSIK.md](PHYSIK.md)** (wächst mit — bei jedem Physik-Feature
   dort nachschlagen und neue Erkenntnisse ergänzen).

## Agenten-Team (`.claude/agents/`)
- **hc-coder** — setzt eine *freigegebene* Änderung um; erfindet nie Scope; bei offener Frage stoppt er und fragt.
- **hc-tester** — startet die App, prüft Verhalten (Pass/Fail mit Beweis); testet auf Wegwerf-Projekt, überschreibt nie echte Daten.
- **hc-reviewer** — Review nach **Steelman-Prinzip** auf Bugs + Pflichtenheft-Treue; schlägt zusätzlich **3 ELI5-Varianten** fürs weitere Vorgehen vor (mit Empfehlung + erwartetem Ergebnis).

**Loop:** Dominic sagt was → Umsetzung vorschlagen & fragen → Coder → Tester → Reviewer →
Zusammenfassung → Dominic gibt Fach-Freigabe. Dominic testet auch selbst mit.

## Stack & Start
- **Backend:** FastAPI + SQLAlchemy + SQLite in `backend/app/` (keine Auth, `tenant_id=1`).
  Start: `bash start_backend.sh` (Port 8000). Schema-API: `hc_schema.py` (`hc_schemas`-Tabelle).
- **Frontend:** React 18 + Vite + Tailwind in `frontend/`; Editor mit React Flow
  (`pages/hc/HydraulikEditor.jsx`). Start: `cd frontend && npm run dev` (Port 5173).
- Schema-Daten leben im Backend (Autosave), nicht mehr im Browser. Die lokale
  `energienachweise.db` ist **nicht** in Git. Marketplace/lose Tools wurden entfernt — Repo ist HC-only.
- **Achtung:** Autosave schreibt ins gemeinsame Backend → beim Testen Wegwerf-Projekte nutzen,
  damit echte Schemas nicht überschrieben werden.
