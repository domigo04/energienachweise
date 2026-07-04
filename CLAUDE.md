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

## Aktueller Stand
_Loop B abgeschlossen 2026-07-04 (Auftrag v3.0) — warte auf Fach-Freigabe für Loop C._

### 1. Was funktioniert bereits
- **Projekt-Verwaltung** (`hc_projects.py`, `ProjectList.jsx`, `ProjectDashboard.jsx`): anlegen/bearbeiten/archivieren, SIA-Kategorie + Klimastation, Zwei-Türen-Dashboard ✓.
- **Heizgruppen-Generator** (`hc_groups.py`, `heizgruppen.py`, `HeizgruppenPage.jsx`): Vorlagen, Volumenstrom, Misch-RL, Plausi-Warnungen, Reorder ✓.
- **Schema-Editor** (`HydraulikEditor.jsx`, `HydraulikNodes.jsx`): Canvas, Palette, VL/RL-Leitungen (Tasten V/R), Backend-Autosave, Undo, 1-Klick-Ansicht + Doppelklick-Auslegung ✓.
- **NEU Loop A — Hydraulik rechnet im Backend:** `calculations/hydraulik.py` + `POST /api/v1/hydraulik/berechnen` (`hc_hydraulik.py`). Der Editor schickt den Graphen (debounced 350 ms) und zeigt nur noch Resultate an (`useHydraulicFlows` im Frontend gelöscht) — Goldene Regel «Berechnungslogik NUR Backend» fürs Schema erfüllt.
- **Loop A/B — Verbrauchergruppe = vertikaler CAD-Strang** (Node-Typ `gruppe`, Pflichtenheft §10): Absperrventil → Pumpe → Thermometer → rotes Rechteck mit gedrehtem Text (Name, Q, VL/RL, m' in kg/h) → STAD → Mischventil → Absperrventil. Einspritz/Bypass wird **im Block** gerechnet (PHYSIK §4); bei aktiver Einspritzung erscheinen die gestrichelte blaue Bypass-Schleife + oranges M. VL-Anschluss oben, RL unten.
- **Loop A/B — Verteiler = volles CAD-Layout:** VL-Balken oben über die ganze Breite, RL-Balken unten, die Stränge hängen dazwischen (Führungslinien helfen beim Platzieren; nur die Balken sind greifbar). Wählbare Abgänge (2–8 im Panel; Leitungen an wegfallenden Stutzen werden entfernt). Summen (VL/RL, Σ Q, Σ V') + Δp ungünstigster Ast stehen direkt auf den Balken.
- **NEU Loop B — Nummerierung + Legende:** jedes Bauteil bekommt beim Ablegen eine stabile Nummer (`data.nr`, rotes Badge; ältere Schemas werden beim Laden nachnummeriert). «Legende»-Knopf im Editor zeigt die Tabelle Nr · Bauteil · Bezeichnung · Kennwerte; dieselben Zeilen stehen im PDF.
- **NEU Loop B — PDF-Export** (`export/schema_svg.py`, `export/pdf.py`, `hc_export.py`): `GET /api/v1/schemas/{id}/pdf?inhalt=schema|berechnungen|beides`. Deckblatt (Projektname, Schema, Datum, Planervermerk) immer dabei; Schema als **Vektor-SVG→PDF auf A3 quer** (kein Screenshot, eigener CAD-Renderer im Backend — Geometrie synchron mit `HydraulikNodes.jsx`); Legende-Tabelle; Berechnungen pro Bauteil (Eingaben + Resultat + Einheit, A4). 3 Knöpfe in der Editor-Topbar. Neue Abhängigkeiten: reportlab, svglib (pypdf für Tests).
- **NEU Loop A — BKP-Datenstruktur:** Tabelle `bkp_eintraege` (leer, alle Felder aus Auftrag 4.4, tenant_id) in `models/heizungscockpit.py`; Katalog 36 Positionen in `data/bkp_positionen.py` (kein Öl/Gas/Tank); `GET /api/v1/bkp/positionen?wp_typ=&kategorie=` (`hc_bkp.py`); Zeitgewichtung in `calculations/bkp.py` (Halbwertszeit 3 Jahre).
- **pytest:** 31 Tests grün in `backend/tests/` (PHYSIK-§4-Beispiel, 3 Parallelkreise inkl. Energieerhaltung + Kanten-Flüsse, Δp Reihe/parallel, Volumenstrom, BKP-Filter + Zeitgewicht, Misch-RL, Plausi, Ventil-kvs/-Autorität, RAVEL 0.1030, SVG-/Legenden-/PDF-Inhalte via pypdf). Ausführen: `cd backend && /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m pytest tests -q`.
- **Schnell-Tools (UC2):** Ventil, Druckverlust, RAVEL ✓.
- **Goldene Regeln:** tenant_id in jedem HC-Modell inkl. `bkp_eintraege` (per SQL über alle Tabellen geprüft) ✓ · alles unter `/api/v1/` ✓ · Schema-Berechnung Backend ✓ · Formel-Tests ✓ · BKP-Tabelle ab Tag 1 ✓.

### 2. Was ist halb fertig
- **Schema ≠ Heizgruppen-DB:** Gruppen-Blöcke im Schema haben eigene Q/VL/RL — Änderungen auf der Heizgruppen-Seite fliessen noch nicht automatisch ins Schema (Kernversprechen F2 noch offen).
- **Ventil-/Pumpen-Anzeige im Panel** rechnet kvs/Förderhöhe noch im Frontend → zieht in Loop C ins Backend um (das V' kommt aber bereits vom Backend).
- **Manueller Override-Schalter** pro Bauteil fehlt (F1).
- **Projekt-Vorlagen** EFH-WP / MFH-WP-2Gruppen / MFH-WP-3Gruppen fehlen (Abnahme 7.2); es gibt nur die 4 Schaltungs-Vorlagen.

### 3. Was fehlt komplett aus Phase 1 / MVP
- **Bauteil-Eigenschaften komplett** (Ventil im Backend, Pumpe = gemeinsamer Teil + ungünstigster Ast, Wärmezähler übernimmt Leitungs-Durchfluss, Expansionsgefäss-Auslegung; PHYSIK §5/§6) → **Loop C**.
- **Projekt-Dashboard als Projektspiegel** (Checklisten, offene Punkte, Aktivitäts-Log, rote Warnungen) → **Loop D**.
- **Projekt-Vorlagen** EFH-WP / MFH-WP-2Gruppen / MFH-WP-3Gruppen (Abnahme 7.2) → passt gut zu Loop C oder D.

### 4. Welche eine Lücke blockiert am meisten
Die **Bauteil-Auslegung im Strang** (Loop C): Pumpe/Ventil/Wärmezähler/Expansionsgefäss im Strang sind noch Symbole ohne eigene Auslegung — erst damit ist jede Zahl im PDF belegbar.

_Hinweise: Zum Ausprobieren liegt das Wegwerf-Projekt «ZZ Wegwerf — Loop-A-Test» mit dem «Loop-B CAD-Testschema» (3 Stränge am Verteiler) bereit — darf gelöscht werden. PHYSIK.md: §1-Beispiel-Tippfehler korrigiert (8.5 kW bei 35/30 → 1.462 m³/h; der Auftrag rundet fälschlich auf 1.464) und Druckverlust-Regeln neu als §5 ergänzt._
