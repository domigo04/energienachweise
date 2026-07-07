# Heizungscockpit — Projekt-Leitplanken

Engineering-Plattform für Heizungsplanung (Dominic Goulon, SIREGO GmbH, Winterthur).
Kernidee: ein **lebendes Anlagenschema**, das selbst die Datenbank ist — Auslegungen sind
Eigenschaften der Bauteile im Schema, eine Wahrheit. Details im **[Pflichtenheft](Pflichtenheft.md)**,
alle physikalischen Regeln verbindlich in **[PHYSIK.md](PHYSIK.md)**.

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
- **Backend:** FastAPI + SQLAlchemy + SQLite in `backend/app/` (keine Auth, `tenant_id=1`).
  Start: `bash start_backend.sh` (Port 8000). Tests: `cd backend && /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m pytest tests -q` (51 grün).
- **Frontend:** React 18 + Vite + Tailwind in `frontend/`; Editor `pages/hc/HydraulikEditor.jsx`
  (React Flow). Start: `cd frontend && npm run dev` (Port 5173).
- Schema-Daten leben im Backend (Autosave). Lokale `energienachweise.db` **nicht** in Git.
- **Achtung:** Autosave schreibt ins gemeinsame Backend → beim Testen Wegwerf-Projekte nutzen
  («ZZ Wegwerf — Loop-A-Test» liegt bereit, darf gelöscht werden).

## Aktueller Stand (2026-07-06)
Phase-1-Schema ist ein guter MVP: man kann damit real arbeiten. Loops A–C + zwei Feinschliff-Runden
abgeschlossen. Ein paar Bauteile/Darstellungen stimmen noch nicht 100 %, funktionieren aber grob.

### Was funktioniert (mit Dateien)
- **Projekt-Verwaltung** (`hc_projects.py`, `ProjectList/ProjectDashboard.jsx`) + **Heizgruppen-Generator**
  (`hc_groups.py`, `heizgruppen.py`).
- **Schema-Editor** (`HydraulikEditor.jsx`, `HydraulikNodes.jsx`, `symbols.jsx`, `edges/FlowEdge.jsx`):
  Canvas, Palette, VL/RL-Leitungen (Tasten V/R), Autosave, Undo, Nummerierung + Legende, Warnungen-Panel.
- **Hydraulik rechnet komplett im Backend** (`calculations/hydraulik.py`, `POST /api/v1/hydraulik/berechnen`).
  Editor schickt den Graphen (debounced 350 ms), zeigt nur Resultate.
- **Verbrauchergruppe = ein CAD-Strang** (Node `gruppe`): Absperr → Pumpe → Thermometer → rotes
  Rechteck → STAD → Ventil → Absperr; optional Wärmezähler (`hat_wz`). Schaltungswahl beim Ablegen:
  **Einspritz / Beimisch / Drossel** (PHYSIK §6). Einspritz/Bypass im Block gerechnet (PHYSIK §4).
  Pumpe + Ventil im Strang auslegbar (Doppelklick-Modal, Tabs Gruppe/Pumpe/Ventil).
- **Verteiler = volles CAD-Layout** (VL-Balken oben, RL unten, Stränge dazwischen; 2–8 Abgänge,
  Balken-Abstand einstellbar; Summen + ungünstigster Ast auf den Balken).
- **Einzelbauteile ausgelegt** (Backend, `berechne_schema` Abschnitt 6): Ventil (kvs + Autorität),
  Hauptpumpe (gemeinsamer Teil + ungünstigster Ast), Wärmezähler, Expansionsgefäss
  (`calculations/expansion.py`, Dominics Excel-Methode, PHYSIK §8).
- **Anschluss-Marker** (Node `anschluss`, PHYSIK §9): virtuelle Verbindung zweier Marker gleichen
  Buchstabens. **Automatische Leitungsdimensionierung** (`leitungsdimension.py`, PHYSIK §10):
  DN + Pa/m aus Fluss; Leitung anklicken → Länge → Δp.
- **BWW-Speicher** (Node `bww`, grün) — nur Symbol, rechnet noch nichts (SIA 385 offen).
- **PDF-Export** (`export/schema_svg.py`, `export/pdf.py`, `hc_export.py`): Deckblatt + Schema
  (Vektor A3 quer) + Legende + Berechnungen. `GET /api/v1/schemas/{id}/pdf?inhalt=schema|berechnungen|beides`.
- **BKP-Fundament** (`bkp_eintraege`-Tabelle leer, Katalog `data/bkp_positionen.py`, `hc_bkp.py`,
  Zeitgewichtung `calculations/bkp.py`) — vorbereitet fürs spätere KV-Tool.
- **Schnell-Tools (UC2):** Ventil, Druckverlust, RAVEL.

### Bauteil-Symbole aus Dominics SVG-Vorlagen (alle übernommen, Editor + PDF konsistent)
Pumpe (Kreis+Dreieck+Motor), Kugelhahn/Absperr (`shutoff`, Doppeldreieck + schwarzer Knoten),
2-Weg-Ventil (`valve2`, + oranger Antriebskasten Σ links → Flussachse 75 %), 3-Weg-Ventil (`valve3`,
+ 3. Tor rechts, Flussachse 63 %), STAD (`stad`), Temperaturfühler (`temperatur`),
Sicherheitsventil (`sicherheitsventil`), Plattentauscher PWT (`pwt`), Expansionsgefäss (Kapsel unten rund).
Backend-Symbole in `schema_svg.py` via `_sym()` (bettet Vorlage-SVG skaliert in die Node-Box).
Palette ist in Kategorien sortiert (`PALETTE_GRUPPEN` in `HydraulikEditor.jsx`).

## Nächste Schritte (Dominic-Feedback 2026-07-06)
1. **Leitungen entbuggen** — Ziel: immer so **wenig Bögen wie möglich**, nur senkrecht/waagrecht.
   `FlowEdge.jsx` zickt gelegentlich beim Verschieben.
2. **Leitung auf Leitung führen → automatisches T-Stück:** eine Leitung auf eine andere ziehen soll
   sie verbinden und mittendrin ein T-Stück (Junction) erzeugen (Splice: Edge in zwei Segmente teilen).
   Damit lässt sich z.B. das Expansionsgefäss direkt auf eine Leitung setzen statt an ein Bauteil.
3. **Expansionsgefäss-Berechnung fertig wie Excel:** editierbare **Rohrinhalt-Tabelle** (pro Dimension
   Meterzahl eintippen → l/m aus Excel: 12/16→0.113 … DN200→33.8) statt nur einem Vsys-Feld, plus frei
   definierbare Zusatz-Bauteile. **VL-Temperatur automatisch** von der Verbrauchergruppe mit der höchsten
   VL nehmen; **Leistung automatisch** aus dem Schema (nicht mehr von Hand eintippen). Backend-Formel steht (PHYSIK §8),
   fehlt: Tabelle + Auto-Übernahme von VL/Leistung. IMI-Katalog (Statico) als Norm-Grössen noch offen.
4. **PDF:** Druckverlust übers Ventil umbenennen in **«Δp Ventil»** (statt «Δpv effektiv» o.ä.), `export/pdf.py`.
5. **Anschluss-Marker per Gruppe anwählbar:** In der Verbrauchergruppe eine Option «Anschluss für separate
   Gruppe» — dann erscheinen die Pfeile + der Buchstabe (aktuell nur als Einzel-Bauteil aus der Palette,
   funktioniert so noch nicht wie gewünscht).
6. **Alle Bauteile um 90° drehbar** (Anschlüsse drehen mit). Schlank lösen (z.B. `data.rotation` +
   Transform, Handle-Positionen mitrotieren).
7. ~~Neue SVG-Bauteile übernehmen~~ **✓ ERLEDIGT 2026-07-06** (Kugelhahn/2-Weg/3-Weg als drei
   verschiedene Symbole, STAD, Temperaturfühler, Sicherheitsventil, PWT; Palette kategorisiert).
8. **Leitungs-Beschriftung neues Format** (siehe Bild): zweizeilig — **DN** gross oben, **m' in kg/h**
   darunter (statt einer Zeile «m³/h · DN · Pa/m»). Editor-Label (`displayEdges` in `HydraulikEditor.jsx`)
   + PDF (`schema_svg.py`, `zeichne_edge`). Noch offen.

## Geparkt / später
- **Schema ↔ Heizgruppen-DB verknüpfen** (Kernversprechen F2: Änderung fliesst automatisch), manueller
  Override-Schalter pro Bauteil (F1), Projekt-Vorlagen EFH-WP / MFH-WP (Abnahme 7.2).
- **Projekt-Dashboard als Projektspiegel** (Loop D): Checklisten pro Anlagentyp, offene Punkte, Aktivitäts-Log.
- **BWW-Speicher SIA 385** (Excel-Vorlagen liegen bereit, noch nicht ausgewertet).
- **PHYSIK.md §8** (Expansionsgefäss) wartet auf Dominics Fach-Prüfung.

## Strategische Richtung (Dominic, 2026-07-04)
Sobald das Schema-MVP steht, verschiebt sich der Fokus bewusst weg vom Schema hin zum **KV-Tool
(Kostenvoranschlag):** reale, gerechnete Devis nach Gebäudekategorie/m²/WP-Leistung kategorisieren →
Wissensdatenbank für Kostenschätzungen. Das BKP-Fundament (Loop A) ist dafür vorbereitet.
**Login-Pflicht:** Sobald das KV-Tool gebaut wird, zuerst nach Login-Umsetzung fragen (Backend hat
aktuell keine Auth) — auch in Projekt-Memory `project_heizungscockpit.md` notiert.
