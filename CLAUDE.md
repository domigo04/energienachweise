# Heizungscockpit — Projekt-Leitplanken

Engineering-Plattform für Heizungsplanung (Dominic Goulon, SIREGO GmbH, Winterthur).
Kernidee: ein **lebendes Anlagenschema**, das selbst die Datenbank ist — Auslegungen sind
Eigenschaften der Bauteile im Schema, eine Wahrheit. Details im **[Pflichtenheft](Pflichtenheft.md)**,
alle physikalischen Regeln verbindlich in **[PHYSIK.md](PHYSIK.md)**.

**Zwei Standbeine mittlerweile:** (1) der Schema-Editor/Hydraulik-Kern (die ursprüngliche Vision,
Pflichtenheft), (2) das **KV-Tool** (Kostenschätzung aus Referenzprojekten, seit der strategischen
Neuausrichtung 2026-07-04 aktiver Fokus, siehe unten). Das Pflichtenheft beschreibt aktuell nur (1)
und ist entsprechend nachzuführen, sobald das KV-Tool sich stabilisiert.

## Verbindliche Regeln (immer einhalten)
1. **Pflichtenheft ist bindend.** `Pflichtenheft.md` und alles, was Dominic schriftlich
   festlegt, gilt. **Nie stillschweigend abweichen** — Abweichung nur nach Rückfrage.
2. **Vor Umsetzung fragen** bei offenen Design-/Umsetzungs-Entscheiden (Vorschlag machen,
   dann fragen). **Aber:** klare, abgesprochene Inputs **zügig umsetzen** — kein Zerreden.
3. **So schlank wie möglich.** Kein Ballast, keine Features auf Vorrat.
4. **Sprache:** einfaches (Schweizer) Deutsch, «ss» statt «ß». Dominic ist Heizungsplaner,
   kein Programmierer → Technisches immer **ELI5** erklären.
5. **Korrektheit vor allem** bei der Hydraulik — «es muss stimmen». Bei jedem Physik-Feature
   in PHYSIK.md nachschlagen und neue Erkenntnisse dort ergänzen. Jede Formel hat einen pytest-Test.
6. **Goldene Regeln:** `tenant_id` in jedem DB-Modell · alle Endpunkte unter `/api/v1/` ·
   Berechnungslogik NUR im Backend · Schema IST die Datenbank · vollständige Dateien liefern.

## Agenten-Team (`.claude/agents/`)
- **hc-coder** — setzt freigegebene Änderung um, erfindet nie Scope, stoppt bei offener Frage.
- **hc-tester** — startet die App, prüft Verhalten (Pass/Fail mit Beweis), nur auf Wegwerf-Projekten.
- **hc-reviewer** — Steelman-Review auf Bugs + Pflichtenheft-Treue, schlägt 3 ELI5-Varianten fürs Weitere vor.

**Loop:** Dominic sagt was → Vorschlag & fragen → Coder → Tester → Reviewer → Zusammenfassung
→ Dominic gibt Fach-Freigabe (testet auch selbst mit).

## Stack & Start
- **Backend:** FastAPI + SQLAlchemy in `backend/app/`. Dev-DB SQLite (Default), Prod-DB Postgres
  (via `DATABASE_URL=postgresql+psycopg2://…`, `psycopg2-binary`) — `app/database.py` schaltet
  automatisch um. **Achtung Migrationen:** `_ensure_columns()` in `main.py` ergänzt fehlende Spalten
  auf bereits bestehenden Tabellen (SQLite **und** Postgres, seit 2026-07-13 — vorher lief das nur auf
  SQLite und liess auf dem Server nach jedem Modell-Update Spalten fehlen, siehe Nächste Schritte).
  Neue Tabellen brauchen dort **keinen** Eintrag (die legt `create_all()` schon korrekt an) — nur neue
  **Spalten auf bestehenden** Tabellen.
  Start: `bash start_backend.sh` (Port 8000). Tests: `cd backend && /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m pytest tests -q` (120 grün).
  Auth: JWT (PyJWT + bcrypt/passlib), `tenant_id`-Multi-Tenancy (`models/auth.py`: `Firma`/`User`).
- **Frontend:** React 18 + Vite + Tailwind v4 in `frontend/`; Schema-Editor `pages/hc/HydraulikEditor.jsx`
  (React Flow). Start: `cd frontend && npm run dev` (Port 5173). Login erforderlich (Registrierung →
  Admin-Freischaltung, ausser bei Selbst-Registrierung als Einzelperson, siehe unten).
- Schema-Daten leben im Backend (Autosave). Lokale `energienachweise.db` **nicht** in Git.
- **Achtung:** Autosave schreibt ins gemeinsame Backend → beim Testen Wegwerf-Projekte nutzen
  («ZZ Wegwerf — Loop-A-Test» liegt bereit, darf gelöscht werden).

## Aktueller Stand (2026-07-13)

### 1) Schema-Editor / Hydraulik-Kern (Phase-1-MVP, stabil, Fokus aktuell nicht hier)
Guter MVP: man kann damit real arbeiten. Ein paar Bauteile/Darstellungen stimmen noch nicht 100 %,
funktionieren aber grob — offene Punkte siehe «Nächste Schritte» unten (unverändert seit 2026-07-06,
niemand hat sie seither angefasst).
- **Projekt-Verwaltung** (`hc_projects.py`, `ProjectList/ProjectDashboard.jsx`) + **Heizgruppen-Generator**
  (`hc_groups.py`, `heizgruppen.py`).
- **Schema-Editor** (`HydraulikEditor.jsx`, `HydraulikNodes.jsx`, `symbols.jsx`, `edges/FlowEdge.jsx`):
  Canvas, Palette (kategorisiert), VL/RL-Leitungen (Tasten V/R), Autosave, Undo, Nummerierung + Legende,
  Warnungen-Panel. Bauteil-Symbole aus Dominics SVG-Vorlagen (Pumpe, Kugelhahn/Absperr, 2-Weg-/3-Weg-Ventil,
  STAD, Temperaturfühler, Sicherheitsventil, PWT, Expansionsgefäss) — Editor und PDF konsistent
  (`export/schema_svg.py`, `_sym()`).
- **Hydraulik rechnet komplett im Backend** (`calculations/hydraulik.py`, `POST /api/v1/hydraulik/berechnen`).
  Editor schickt den Graphen (debounced 350 ms), zeigt nur Resultate.
- **Verbrauchergruppe = ein CAD-Strang** (Node `gruppe`): Absperr → Pumpe → Thermometer → rotes
  Rechteck → STAD → Ventil → Absperr; optional Wärmezähler. Schaltungswahl beim Ablegen:
  **Einspritz / Beimisch / Drossel** (PHYSIK §6, Block-Berechnung PHYSIK §4). Pumpe + Ventil im Strang
  auslegbar (Doppelklick-Modal).
- **Verteiler = volles CAD-Layout** (VL-Balken oben, RL unten, Stränge dazwischen; 2–8 Abgänge,
  Balken-Abstand einstellbar; Summen + ungünstigster Ast auf den Balken).
- **Einzelbauteile ausgelegt** (Backend, `berechne_schema` Abschnitt 6): Ventil (kvs + Autorität),
  Hauptpumpe, Wärmezähler, Expansionsgefäss (`calculations/expansion.py`, PHYSIK §8).
- **Anschluss-Marker** (Node `anschluss`, PHYSIK §9) + **automatische Leitungsdimensionierung**
  (`leitungsdimension.py`, PHYSIK §10): DN + Pa/m aus Fluss; Leitung anklicken → Länge → Δp.
- **BWW-Speicher** (Node `bww`) — nur Symbol, rechnet noch nichts (SIA 385 offen).
- **PDF-Export** (`export/pdf.py`, `hc_export.py`): Deckblatt + Schema (Vektor A3 quer) + Legende +
  Berechnungen. `GET /api/v1/schemas/{id}/pdf?inhalt=schema|berechnungen|beides`.
- **Schnell-Tools (UC2):** Ventil, Druckverlust, RAVEL.

### 2) Auth & Konten
- **Registrierung** (`hc_auth.py`, `Login.jsx`): Einzelperson oder Firma. Einzelperson → eigene,
  private `Firma` (niemand sonst sieht diese Daten). Firma → Beitritt zu bestehender Firma (Name-Suche)
  oder Neugründung. Freischaltung durch Dominic (einziger globaler Admin,
  `pages/admin/BenutzerFreischaltung.jsx`). **Warum:** vorher landete jede Registrierung hart auf
  Dominics `tenant_id=1` — echter Privacy-Bug, gefixt.
  Admin-Konto wird bei **jedem Start** auf `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD` synchronisiert
  (`main.py::_seed_admin`, idempotent — vorher nur beim ersten Anlegen, ein einmal gesetztes altes
  Passwort blieb sonst für immer aktiv).
- **Konto-Seite** (`pages/KontoPage.jsx`, Route `/konto`, erreichbar über Profil in der Sidebar):
  Name/Passwort selbst ändern, Konto-Typ + Plan-Anzeige (`Firma.abo_plan`, aktuell nur `"kostenlos"` —
  **kein** Bezahl-System, ehrliche Anzeige «folgt später»).
- Projekte: echtes Hard-Delete zusätzlich zum Archivieren (`DELETE /api/v1/projects/{id}/endgueltig`,
  `.../archiviert/alle`) — vorher nur Archivieren möglich.

### 3) KV-Tool — Auswertung & Kostenschätzung (bestehendes System, aktiv genutzt)
Referenzprojekt-Datenbank (`models/kv.py`: `RefProjekt`/`RefKostenzeile`), Auswertung
(`hc_auswertung.py`, CSV-Import/-Export inkl. aller BKP-Spalten) und Kostenschätzung
(`calculations/kostenschaetzung.py`, `hc_kostenschaetzung.py`, `KostenschaetzungPage.jsx` —
Frontend-Bezeichnung «Grobkostenschätzung», nicht zu verwechseln mit dem NEUEN Modul unter 4):
- **Anlagenkonfiguration-Ähnlichkeit** (monovalent/bivalent/hybrid/kaskadiert/redundant,
  Kompatibilitäts-Matrix) fliesst in die Referenz-Auswahl ein.
- **Ähnlichkeit und Validierung getrennt ausgewiesen** (Dominics explizite Vorgabe: zwei unabhängige
  Fragen). `aehnlichkeit_stufe(gewicht)` — wie gut passt die *beste* Referenz (hoch/mittel/tief),
  unabhängig von der Menge. `confidence_from(neff, dispersion)` — wie viele *unabhängige* Referenzen
  bestätigen das mit ähnlichen Zahlen (Validierung/Vertrauen). Zwei separate UI-Kacheln, nie geblendet.
  Zeitgewichtung (`age_weight`, Halbwertszeit-Idee) und Baupreis-Index-Korrektur (`index_faktor`) fliessen
  in die Ähnlichkeits-Gewichtung ein.
- **Baupreisindex-Automatik** (`hc_bauindex.py`, Admin-UI `BaupreisindexAdmin.jsx`): holt Werte live von
  opendata.swiss (CKAN `package_search`, robust gegen Slug-Änderungen) + BFS-Excel-Parsing (`openpyxl`).
  Manueller Fallback-Link zur offiziellen BFS-Seite falls die Automatik doch mal versagt.
- Dynamische, datengetriebene Erklärungssätze pro Referenz (vergleicht Eingabe vs. beste Referenz auf
  konkreten Feldern) + grössere, interaktive Diagramme mit Hover-Tooltips (`charts/BoxPlot.jsx`,
  `BarPlot.jsx`, eigene `position:fixed`-Tooltips statt nativem `<title>`).

### 4) Grobkostenschätzung (BKP) — NEUES Modul, LOOP K1 fertig (2026-07-13)
Eigenständiges, präzise spezifiziertes System: aus 7 Eckdaten eines neuen Projekts eine **Schätzung pro
BKP-GRUPPE** (241/242/243/247/248/249) — mit voller Nachvollziehbarkeit («ein Planer muss die Zahl vor
dem Bauherrn verteidigen können», **das wichtigste Feature**). Bewusst in eigenen, neuen Dateien
aufgebaut (keine Kollision mit 3) — offene Frage, ob/wie beide Systeme langfristig zusammengeführt werden,
siehe unten.
- **Datenmodell** (`models/grobkostenschaetzung.py`): `ReferenzProjekt` (Stufe 1 Pflicht: ebf_m2,
  leistung_kw, gebaeudekategorie, projektart, wp_typ, abgabe_dominant, anzahl_ne, hat_erdsonden,
  datum_abrechnung; Stufe 2 optional: rohrmeter, bohrmeter, hk_anzahl, verteiler_abgaenge,
  fbh_flaeche_m2, anzahl_heizgruppen, etappierung, weiterbetrieb_umbau — verbessert Weg B, siehe unten),
  `BkpBetrag` (eine BKP-GRUPPE + Betrag, viele je Referenzprojekt), `Korrekturfaktor`
  (Sanierung ×1.20 / Weiterbetrieb ×1.10 / Etappierung ×1.08, editierbar, DB-geseedet).
- **Berechnungskern** (`calculations/grobkostenschaetzung.py`, alle 7 Funktionsgruppen reine Funktionen,
  Dicts rein/raus, kein DB-Zugriff — testbar ohne DB):
  1. **Zeitgewicht** — exponentieller Zerfall, Halbwertszeit 3 Jahre (`zeitgewicht`).
  2. **Ähnlichkeitssuche** — Hard-Filter (wp_typ/projektart/hat_erdsonden müssen exakt passen) → Score
     (Grösse/Leistung log-nah, Kategorie-Nachbarschaft, Abgabetyp-Nähe) → ×Zeitgewicht = Rang, Top 3–5
     (`finde_referenzen`).
  3. **Hochrechnung Weg A** — gewichteter Kennwert (CHF/kW bzw. CHF/m² EBF) × Zielgrösse; BKP 249 separat
     als %-Anteil vom Zwischentotal (`weg_a_hochrechnung`, `weg_a_bkp_249`).
  4. **Faktor-Brücke Weg B** — nur mit Stufe-2-Daten: lernt Mengen-Faktor (z. B. m Rohr/m² EBF) UND
     Einheitspreis aus Referenzen, wendet auf Zielprojekt an (`weg_b_hochrechnung`, `rohr_faktor`/
     `hk_faktor`/`bohr_faktor`).
  5. **Kreuzcheck** — Abweichung Weg A/B → Vertrauen hoch/mittel/niedrig; nur Weg A → Vertrauen nach
     Anzahl Referenzen (`kreuzcheck`).
  6. **Potenzfunktion** — K=a×X^b per log-log-Regression (numpy), nur verwendet wenn n≥8 im Segment
     UND R²>0.7, sonst Rückfall auf Weg A (`potenzfunktion_schaetzung`).
  7. **Korrekturfaktoren** — multipliziert alle zutreffenden aktiven Faktoren aus der DB-Tabelle
     (`wende_korrekturfaktoren_an`).
- **Tests** (`tests/test_grobkostenschaetzung.py`): 27 Tests, ein Test pro Formel mit konkreten Zahlen
  (inkl. Score-Ranking über 6 Kandidaten, das zeigt wie eine ältere Referenz von einer aktuelleren
  überholt wird; synthetischer Potenzfit mit bekanntem a/b). **120/120 Tests grün gesamt.**
- **Postgres-Bug nebenbei gefixt** (`main.py::_ensure_columns`): lief vorher nur auf SQLite (früher
  `return`), auf Postgres fehlten dadurch nach Modell-Updates Spalten still — vermutete Ursache des
  Produktions-Login-Problems (Dominic 2026-07-13: Login auf energienachweise.com ging nicht, lokal
  schon). Fix ist deploybereit, **auf dem Server noch nicht verifiziert** (kein lokaler Postgres-Zugriff)
  — nach dem nächsten Deploy Login erneut testen.
- **Noch offen (LOOP K2/K3, erst nach Dominics Review):**
  - K2 — API-Endpunkt (`POST /api/v1/kostenschaetzung` o.ä., „7+3 Eingaben → Schätzung mit erklaerung“)
    + das Erklärungs-Objekt, das die Kern-Funktionen zu einer Antwort pro BKP-Gruppe zusammensetzt.
  - K3 — Frontend (Eingabeformular + Ergebnis-Darstellung, transparent nachvollziehbar).
  - **Zwei offene Fragen an Dominic** (bewusst nicht selbst entschieden):
    1. Soll dieses Modul das bestehende Kostenschätzung/Auswertung-System (Abschnitt 3) langfristig
       **ersetzen** oder bleiben **beide parallel** bestehen (unterschiedlicher Detailgrad: BKP-Gruppen
       hier vs. einzelne Kostenzeilen dort)?
    2. `fbh_flaeche_m2`/`anzahl_heizgruppen` stehen in der neuen Spezifikation (Stufe 2, für Weg B), aber
       Dominic hatte in einer früheren Session explizit gesagt, er wolle **keine** Bezugsgrössen wie
       Anzahl Heizgruppen oder FBH-Fläche verwenden. Für K1 unverändert aus der Spezifikation übernommen
       (nullable, nicht zwingend) — vor K2/K3 klären, ob das so gewollt ist.

## Nächste Schritte
**Hydraulik-Editor (Dominic-Feedback 2026-07-06, seither nicht angefasst):**
1. **Leitungen entbuggen** — Ziel: immer so **wenig Bögen wie möglich**, nur senkrecht/waagrecht.
   `FlowEdge.jsx` zickt gelegentlich beim Verschieben.
2. **Leitung auf Leitung führen → automatisches T-Stück:** eine Leitung auf eine andere ziehen soll
   sie verbinden und mittendrin ein T-Stück (Junction) erzeugen (Splice: Edge in zwei Segmente teilen).
3. **Expansionsgefäss-Berechnung fertig wie Excel:** editierbare **Rohrinhalt-Tabelle** statt nur einem
   Vsys-Feld, plus frei definierbare Zusatz-Bauteile. VL-Temperatur automatisch von der Verbrauchergruppe
   mit der höchsten VL, Leistung automatisch aus dem Schema. IMI-Katalog (Statico) noch offen.
4. **PDF:** Druckverlust übers Ventil umbenennen in **«Δp Ventil»**, `export/pdf.py`.
5. **Anschluss-Marker per Gruppe anwählbar** («Anschluss für separate Gruppe» als Option in der
   Verbrauchergruppe, funktioniert aktuell nur als Einzel-Bauteil aus der Palette).
6. **Alle Bauteile um 90° drehbar** (Anschlüsse drehen mit).
7. **Leitungs-Beschriftung neues Format:** zweizeilig — DN gross oben, m' in kg/h darunter.

**Grobkostenschätzung (BKP):**
8. LOOP K2 (API + Erklärungs-Objekt) — wartet auf Dominics Review von K1 (Testresultate wurden
   gemeldet). Vorher die zwei offenen Fragen aus Abschnitt 4 klären.
9. LOOP K3 (Frontend) — erst nach K2.

**Sonst:**
10. Produktions-Login nach dem nächsten Deploy verifizieren (Postgres-Fix, siehe Abschnitt 4).

## Geparkt / später
- **Schema ↔ Heizgruppen-DB verknüpfen** (Kernversprechen F2: Änderung fliesst automatisch), manueller
  Override-Schalter pro Bauteil (F1), Projekt-Vorlagen EFH-WP / MFH-WP (Abnahme 7.2).
- **Projekt-Dashboard als Projektspiegel** (Loop D): Checklisten pro Anlagentyp, offene Punkte, Aktivitäts-Log.
- **BWW-Speicher SIA 385** (Excel-Vorlagen liegen bereit, noch nicht ausgewertet).
- **PHYSIK.md §8** (Expansionsgefäss) wartet auf Dominics Fach-Prüfung.
- **Bezahl-System** für `Firma.abo_plan` (aktuell nur Platzhalter «kostenlos», keine Durchsetzung).

## Strategische Richtung (Dominic, 2026-07-04)
Fokus liegt bewusst auf dem **KV-Tool** (Kostenvoranschlag): reale, gerechnete Devis nach
Gebäudekategorie/m²/WP-Leistung kategorisieren → Wissensdatenbank für Kostenschätzungen. Die
Grobkostenschätzung (BKP, Abschnitt 4) ist die konkrete Umsetzung davon.
**Login-Pflicht** (damals offen) ist seither gebaut — Auth voll funktionsfähig (Abschnitt 2).
