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
  Start: `bash start_backend.sh` (Port 8000). Tests: `cd backend && /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m pytest tests -q` (124 grün).
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

### 3) KV-Tool — Auswertung (die EINE Wissensbasis) + Baupreisindex
Referenzprojekt-Datenbank (`models/kv.py`: `RefProjekt`/`RefKostenzeile`), gepflegt über die
**Auswertung** (`hc_auswertung.py`, `AuswertungList/Form/Analyse.jsx`): CRUD, CSV-Import/-Export
(inkl. aller BKP-Spalten + `bww_bei_heizung`), Analyse-Kennwerte, **Mehrfach-Auswahl mit
Sammel-Löschen** (`POST /auswertung/loeschen`, Checkboxen auf den Karten, R2 2026-07-14).
Neu (R2): Feld **`bww_bei_heizung`** (Brauchwarmwasser-Schnittstelle bei Heizung statt Sanitär —
weiches Ähnlichkeitskriterium der Grobkostenschätzung) + Beispieldaten-Knopf (~80 Demo-Projekte,
Präfix «Beispiel — », per Knopf wieder entfernbar).
- **Baupreisindex** (`hc_bauindex.py`, Seite `BaupreisindexAdmin.jsx`): holt Werte live von
  opendata.swiss (CKAN `package_search`) + BFS-Excel-Parsing (`openpyxl`), manuelle Pflege als
  Fallback. **Seit R2 für ALLE Nutzer** (tenant-scoped, kein Admin nötig — jede Firma pflegt ihre
  eigenen Werte), Nav-Eintrag für alle sichtbar, zusätzlich Refresh direkt auf der Schätzungsseite.
- **ABGELÖST (R2, 2026-07-14):** die alte positions-basierte Kostenschätzung
  (`hc_kostenschaetzung.py` + `KostenschaetzungPage.jsx`, beide GELÖSCHT). Grund: sie summierte
  Kennwerte über einzelne BKP-POSITIONEN verschiedener Referenzen auf — mit teilweise gefüllten
  Referenzen ergab das absurde Summen (Dominics 744'000-CHF-Ausreisser bei einem 1100-m²-Projekt,
  ähnlichste Referenz 159'000 brutto). `calculations/kostenschaetzung.py` bleibt (Helfer wie
  `netto_aus_brutto`, `quantile`, `index_faktor` werden weiter verwendet); der alte
  Kostenschätzungs-PDF-Endpunkt in `hc_export.py` ist verwaist (keine UI ruft ihn mehr) — beim
  nächsten Aufräumen entfernen.

### 4) Grobkostenschätzung (BKP) — läuft IM Projekt, rechnet auf der Auswertung (R2, 2026-07-14)
Aus 7 Eckdaten eine **Schätzung pro BKP-GRUPPE** (241/242/243/247/248/249) mit voller
Nachvollziehbarkeit («ein Planer muss die Zahl vor dem Bauherrn verteidigen können», **das wichtigste
Feature**). Nach drei Feedback-Runden (K1–K3 am 2026-07-13, R1 gleichentags, R2 am 2026-07-14) gilt:
**EINE Wissensbasis** (die Auswertung, Abschnitt 3 — keine parallele Referenz-Datenbank mehr) und
**geschätzt wird im Projekt** (Projekte → Projekt → Grobkostenschätzung), Eingaben + Ergebnis werden
pro Projekt gespeichert (`Kostenschaetzung`-Tabelle, gleiche Mechanik wie früher).
**BKP-Gruppen-Bedeutung in diesem Projekt** (aus `data/bkp_positionen.py`, nicht Standard-BKP raten!):
241 Energielagerung (Erdsonden) · 242 Wärmeerzeugung · 243 Wärmeverteilung · 247 Spezialanlagen ·
248 Dämmungen · 249 Diverses. Treiber: 241/242 → kW, 243/247/248 → m² EBF, 249 → %-Anteil.
- **Berechnungskern** (`calculations/grobkostenschaetzung.py`, reine Funktionen, Dicts rein/raus,
  kein DB-Zugriff — jede Formel pytest-getestet):
  1. **Zeitgewicht** — exponentieller Zerfall, Halbwertszeit 3 Jahre; Referenz ohne Datum = neutral 1.0.
  2. **Ähnlichkeitssuche** — Hard-Filter (wp_typ/projektart/hat_erdsonden exakt) → Score (0.30 EBF-Nähe,
     0.25 kW-Nähe, 0.20 Nutzungsnähe [gleich 1.0 / MFH↔EFH 0.5 / sonst 0], 0.15 Abgabetyp-Nähe,
     0.10 **BWW-Schnittstelle** [gleich 1.0 / anders 0.0 / unbekannt neutral — bewusst KEIN Hard-Filter,
     Dominic 2026-07-14]) → ×Zeitgewicht = Rang, Top 5 rechnen, ganzes Segment für die Potenzfunktion.
  3. **Weg A** — gewichteter Kennwert × Zielgrösse; BKP 249 als %-Anteil vom Zwischentotal.
  4. **Weg B** — gelernte Mengen-Faktoren (rohr/hk/bohr) × Einheitspreis; eigene Mengen-EINGABEN des
     Ziels übersteuern den Faktor (`menge_quelle: "eingabe"`).
  5. **Kreuzcheck** — Abweichung Weg A/B → Vertrauen hoch/mittel/niedrig; sonst nach Referenz-Anzahl.
  6. **Potenzfunktion** — K=a×X^b (numpy, log-log), nur bei n≥8 im Segment und R²>0.7; liefert `punkte`
     und ehrliche `bandbreite` aus der Streuung um die Kurve. Bandbreiten umschliessen die Schätzung
     IMMER (min/max-Klammer in `_schaetze_eine_gruppe` — die gewichtete Kopfzahl kann sonst knapp
     ausserhalb der P25–P75 liegen).
  7. **Korrekturfaktoren** — aktive Faktoren aus DB multipliziert (Sanierung ×1.20 / Weiterbetrieb ×1.10 /
     Etappierung ×1.08, editierbar auf der Schätzungsseite; je Firma geseedet, `hc_auth.py` +
     `main.py::_seed_korrekturfaktoren`). 249 kriegt keine eigenen (Doppelzählung).
  8. **Baupreisindex** (`skaliere_auf_baupreisindex`) — skaliert Referenzkosten VOR allen Rechenwegen
     auf heute (Index heute ÷ Index Abrechnungsdatum, `index_faktor` aus `calculations/kostenschaetzung.py`);
     Faktor je Referenz bleibt in der Erklärung sichtbar.
- **Adapter Auswertung → Kern** (`routers/hc_grobkostenschaetzung.py::_ref_to_calc_dict`):
  Wärmeerzeuger-Häkchen → `wp_typ` (Erdsonden-WP→sole, Wasser/Wasser→wasser, Luft/Wasser→luft,
  sonst None = fällt bei WP-Zielen raus) + `hat_erdsonden`; Wärmeabgabe-Häkchen → `abgabe_dominant`
  (flächig [FBH/TABS/Wandheizung/Deckenstrahlplatten] / Körper [Heizkörper/Konvektoren] / beides =
  gemischt / Lufterhitzer = Luft); Kostenzeilen (Gewerk Heizung) → BKP-GRUPPEN-Summen **netto**
  (je Referenz eigener Rabatt/Skonto). Der 744k-Bug des alten Systems (Positions-Kennwerte
  verschiedener Referenzen aufsummiert) ist damit konstruktiv unmöglich — Test
  `test_adapter_ende_zu_ende_schaetzung_aus_auswertungsdaten` erzwingt, dass die Schätzung in der
  Grössenordnung der Referenzen liegt.
- **API** (`/api/v1/grobkostenschaetzung`): POST `/schaetzen` (zustandslos), GET/PUT `/projekt/{id}`
  (rechnen + speichern; Alt-Format-Ergebnisse aus der Vor-R2-Zeit werden beim GET verworfen),
  GET/PATCH `/korrekturfaktoren`, POST/DELETE `/beispieldaten` (schreibt ~80 Demo-Projekte in die
  AUSWERTUNG, Beträge auf der ersten Katalogposition je Gruppe, idempotent, Präfix «Beispiel — »).
  Achtung `jsonable_encoder` vor `json.dumps` (date-Objekte der Referenzen).
- **Frontend**: `pages/grobkosten/GrobkostenSchaetzung.jsx` unter `/projekte/:id/kostenschaetzung`
  (KEIN eigener Nav-Punkt mehr; `/grobkosten/*` leitet um). Formular: EBF, kW, Nutzung (kv.js-Liste),
  Anzahl Einheiten, Projektart (kv.js-Liste, neu inkl. «Ersatz Wärmeerzeuger»), WP-Typ, Abgabe,
  Erdsonden, **BWW bei Heizung**, Weiterbetrieb/Etappierung, **Baupreisindex-Häkchen mit
  Stand-Anzeige + «jetzt aktualisieren (BFS)»**, bekannte Mengen, Korrekturfaktoren-Editor.
  Ergebnis: 3 KPI-Kacheln, gestapelter BKP-Balken, BKP-Tabelle (Kennwert | Schätzung | tief–hoch |
  Vertrauen, InfoTips) — Zeile anklicken zeigt den Rechenweg als kurze Sätze mit echten Zahlen;
  Referenzliste mit Jahr/Nutzung/BWW/Index-Faktor/Gewicht und Link in die Auswertung.
  `GkVisuals.jsx` nur noch VertrauenBadge + GruppenStapel (grosse Visuals auf Dominics Wunsch raus).
- **Tests**: `tests/test_grobkostenschaetzung.py` (Kern + Adapter + Generator-Konsistenz + Bauindex-
  Skalierung + BWW). **137/137 grün gesamt.** End-to-end verifiziert (Dominics Szenario 1100 m²/35 kW/
  MFH/Neubau/Sole/420 Bohrmeter/Index: **CHF ~259'000** statt 744'000 — nach Bereinigung von 50
  «KV Test»-Fake-CSV-Referenzen aus der Auswertung, die die Kennwerte verzerrten).
- **Postgres-Bug gefixt** (`main.py::_ensure_columns`): lief vorher nur auf SQLite (früher `return`), auf
  Postgres fehlten dadurch nach Modell-Updates Spalten still — vermutete Ursache des Produktions-Login-
  Problems. **Noch nicht gepusht** — nach dem nächsten Deploy Login erneut testen.
- **Noch offen:**
  - PDF-Export der Grobkostenschätzung (der alte Kostenschätzungs-PDF-Endpunkt in `hc_export.py` passt
    nicht mehr zum neuen Ergebnis-Format und ist verwaist).
  - Referenz-`qualitaet` (gesichert/Devis/Schätzung) fliesst noch nicht in die Gewichtung der
    Grobkostenschätzung ein (das alte System nutzte sie).
  - **Fachfragen an Dominic:** (1) Sanierung-Korrekturfaktor greift nie zusätzlich zu passenden
    Sanierungs-Referenzen (Hard-Filter) — nur relevant, wenn gar keine da sind: so lassen oder
    Hard-Filter lockern? (2) `anzahl_ne` wird erfasst, fliesst aber nirgends ein — 5. Score-Dimension
    oder nur dokumentarisch?

## Nächste Schritte (Roadmap — Stand 2026-07-19, «◀ HIER» = aktueller Fokus)

**✅ Erledigt — UX-/Bedienbarkeits-Runde (2026-07-19, von Dominic committet):**
Einheitlicher Seitenkopf mit **Zurück-Buttons** (`components/ui/PageHeader.jsx`), **Gewerk-Leiste**
(`components/ui/GewerkLeiste.jsx`: Heizung aktiv, Sanitär/Kälte/Lüftung «Bald») in Auswertung +
Grobkostenschätzung, **Overlap-Bug** der «Zusammenstellung Heizung» behoben (eigene, klebende Spalte;
sticky nur `lg:` und nur wenn allein in der Spalte — sonst überdeckt es beim Scrollen), **«i»-Erklärungen**
ergänzt, die drei Rechner (Ventil/Druckverlust/RAVEL) + Heizgruppen von blauen Inline-Styles auf den
**SIREGO-Look** umgestellt (`.card/.input/.btn-*`), Anrede durchgehend **«du»**, responsive für jede
Bildschirmgrösse. **Berechnungen unangetastet.** Details/Standards: memory `feedback_ux_standards`.

**◀ HIER — Ähnlichkeits-/Kosten-Spezifikation der Grobkostenschätzung (VERBINDLICH, Dominic 2026-07-19).**
Leitsatz: «es muss stimmen» — ein Planer muss die Zahl vor dem Bauherrn verteidigen können. So läuft die
Schätzung; **FIX (hart)** = Kriterium muss exakt passen, sonst fällt die Referenz raus. **WEICH** = nur
Reihenfolge/Gewichtung, nie Ausschluss.

*A) HARTE Kriterien (müssen EXAKT gleich sein — Dominic 2026-07-19 bestätigt):*
- **Nutzung / Gebäudekategorie EXAKT** (MFH nur MFH, EFH nur EFH, Büro nur Büro …). NEU hart — war bisher
  weich (MFH↔EFH ist NICHT mehr erlaubt).
- **Wärmeerzeugung** = Wärmepumpen-Art (Erdsonden-/Luft-/Wasser-WP) + Erdsonden ja/nein. Erdsonden-WP-Ziel
  → NUR Erdsonden-WP-Referenzen (bereits hart via `hard_filter`).
- **Projektart** (Neubau/Sanierung/…) bleibt hart.

*B) WÄRMEABGABE — KEIN harter Filter, sondern steuert die Kosten-Positionen (Kernforderung, «essenziell»):*
- **Wärmeabgabe ist PFLICHT-Eingabe** für eine Schätzung (Dominic 2026-07-19) — ohne sie ist nicht
  klar, welche Kosten gelten. Formular: `gueltig` erst, wenn mindestens eine Abgabe gewählt ist.
- Referenzen mit anderer/breiterer Abgabe dürfen mitzählen (z.B. eine Referenz mit FBH UND Heizkörpern).
- Übernommen werden aber NUR die BKP-Positionen der vom Ziel **angewählten** Abgabe — nichts anderes:
  FBH→243.3a, TABS/Wandheizung→243.3a, Deckenstrahlplatten→243.3b, Heizkörper/Konvektoren→243.2*,
  Lufterhitzer→243.4*. Gemeinsame Positionen (243.1 Rohre, 243.5/6/7/8/9 Regelung/Messung/Schaltschrank/
  Montage) gelten immer.
- Und je Abgabe-Position zählen NUR Referenzen, die genau diese Abgabe wirklich hatten (NICHT als 0
  mitteln). → «FBH-Ziel bekommt nur die Fussbodenheizungs-Preise von Projekten, die FBH haben — nie die
  Heizkörper-Kosten einer gemischten Referenz. Nur was ich angewählt habe, nicht mehr und nicht weniger.»

*C) WEICHE Kriterien (Reihenfolge/Gewichtung):* EBF-Nähe, kW-Nähe, Zertifizierung, Anzahl Einheiten,
   BWW-Schnittstelle — alles × Zeitgewicht (Halbwertszeit 3 Jahre). Top 5 werden gezeigt, das ganze
   harte Segment fliesst in Kennwert + Bandbreite.

*D) Fachentscheide:*
1. ✅ Nutzung hart = EXAKT (Dominic 2026-07-19).
2. ✅ Projektart bleibt harter Filter (Dominic 2026-07-19).
3. ⏳ OFFEN — Anzahl Einheiten: zusätzlich zum Ähnlichkeits-Faktor ein CHF/Einheit-Wert bei der
   Wärmeverteilung, gemittelt/quergecheckt mit CHF/m² EBF (v.a. Wohnbau) — genaue Verrechnung noch
   mit Dominic festzulegen (eigener Schritt).

*E) Umsetzungsstand (2026-07-19 — UMGESETZT gemäss A–C, 125/125 Tests grün, noch NICHT committet):*
- **Nutzung jetzt HART** (`hard_filter` um `nutzung`-Exaktvergleich erweitert; `nutzungsnaehe` +
  `abgabetyp_naehe` aus dem Score raus). Weiche Gewichte neu: EBF 0.30 / kW 0.26 / Zertifizierung 0.16 /
  Anzahl Einheiten 0.16 / BWW 0.12 (Summe 1.0).
- **Wärmeabgabe filtert die Positionen** (`bkp_positionen.py`: `abgabe`-Tag an 243.2*/3*/4*,
  `abgabe_klassen_von`, `filter_positionen(..., abgabe_klassen)`), UND **je Abgabe-Position werden nur
  Referenzen mit genau dieser Abgabe gemittelt** (`schaetze_position` überspringt Referenzen ohne die
  Klasse; Referenz-Dict trägt `abgabe_klassen`). Kernregel als Test abgesichert
  (`test_position_nur_referenzen_mit_gewaehlter_abgabe`, `test_berechne_fbh_projekt_ohne_luftheizapparate`).
- **Zertifizierung**: `SchaetzungIn`-Feld + Adapter + `zertifizierungs_naehe` + Formular-Auswahl.
- **Wärmeabgabe = Pflichtfeld** im Formular (`gueltig` verlangt ≥1 Abgabe); «keine passenden Referenzen»-
  Hinweis nennt jetzt auch die Nutzung.
- Folge des strengeren Filters: findet nur noch Referenzen mit EXAKT gleicher Nutzung/Projektart/WP-Art —
  Beispieldaten/echte Referenzen mit passender Kombination nötig, sonst «keine passenden».
- OFFEN (Punkt D.3): CHF/Einheit-Quercheck der Wärmeverteilung — eigener Schritt, noch nicht gebaut.

*Danach noch:* Referenz-`qualitaet` (gesichert/Devis/Schätzung) in die Gewichtung; PDF-Export der
Grobkostenschätzung (alter Endpunkt in `hc_export.py` verwaist).

*F) NEU — weitere Fach-Anpassungen Grobkostenschätzung (Dominic 2026-07-19, NOCH NICHT umgesetzt):*

1. **Zurück-Navigation bei Referenz-Klick.** Klickt man in der Grobkostenschätzung auf ein verwendetes
   Referenzprojekt, landet man in der Auswertung — der Zurück-Button dort führt zur Auswertungs-Liste,
   nicht zurück zur Grobkostenschätzung des Projekts. Fix: Link mit Herkunfts-Info (`state`/Query-Param)
   oder Referenz in einem neuen Tab/Modal öffnen statt wegzunavigieren.

2. **Warnhinweis bei kleiner Datenbasis pro Position.** Wenn für eine BKP-Position (z.B. 243.3a
   Bodenheizung) nur 1 von 15 passenden Referenzen tatsächlich Daten liefert, ist der Kennwert nicht
   aussagekräftig — das "Vertrauen niedrig"-Badge existiert zwar schon (`_vertrauen_aus_abdeckung`),
   ist aber zu unauffällig. **[Vorschlag]** Bei `abdeckung <= 1` (oder generell "niedrig") einen expliziten
   Text-Hinweis in der aufgeklappten Zeile ergänzen, z.B. *"Nur 1 von 15 passenden Referenzen hatte diese
   Position — der Kennwert ist ein Einzelfall, keine breite Statistik. Mit Vorsicht verwenden."* Zusätzlich
   das Badge visuell verstärken (z.B. Warndreieck statt nur Punkt) bei niedrigem Vertrauen.

3. **Ähnlichkeit darf bei abweichender Wärmeabgabe nicht zu hoch wirken.** Beobachtung: eine Referenz mit
   identischer Wärmeabgabe zeigt ~90 % Ähnlichkeit, eine sonst gleiche Referenz mit ANDERER Wärmeabgabe
   (z.B. FBH statt Heizkörper) landet nur bei ~80 % — zu nah beieinander, obwohl die Wärmeabgabe seit
   der letzten Anpassung (Abschnitt E) *kein* Score-Faktor mehr ist (sie steuert nur noch die Positionen).
   Das täuscht Nähe vor, wo eigentlich ein wichtiges Merkmal abweicht. **[Vorschlag, 2 Teile]**
   - Die Wärmeabgabe wieder als **eigenen, stark gewichteten** Score-Faktor aufnehmen (zusätzlich zur
     Positions-Steuerung aus Abschnitt B) — z.B. 0.20–0.25 Gewicht, gleiche Abgabe voll, abweichende
     Abgabe deutlich tiefer (nicht 0, da die Referenz ja trotzdem für die *anderen* Positionen brauchbar
     bleibt).
   - Zusätzlich in der UI ein **Hinweis-Icon direkt an der Referenz** in der Liste "Verwendete
     Referenzprojekte", wenn `abgabe_klassen` der Referenz von der Ziel-Auswahl abweicht — z.B.
     *"⚠ hat zusätzlich Heizkörper — nur die Fussbodenheizungs-Kosten wurden übernommen"*.
   → Damit sinkt die Ähnlichkeit bei abweichender Abgabe spürbar UND man sieht auf einen Blick, warum.

4. **Referenz mit "verdünnter" Fläche erkennen (mehrere Abgabesysteme auf gleicher EBF).** Fall: Ziel hat
   nur Heizkörper, eine Referenz hat auf derselben Fläche sowohl Heizkörper ALS AUCH FBH — die Heizkörper-
   Kosten dieser Referenz verteilen sich nur auf einen Teil der EBF, der CHF/m²-Kennwert (bezogen auf die
   GANZE EBF) ist dadurch künstlich zu tief, wenn man ihn 1:1 aufs Ziel (100 % Heizkörper) anwendet.
   **[Vorschlag]** Referenzen mit **mehreren** Wärmeabgabe-Klassen (`len(abgabe_klassen) > 1`) bei der
   Ähnlichkeit generell tiefer gewichten (gehört zum Punkt 3 oben: "gemischte" Referenz ≠ "reine"
   Referenz, auch wenn eine der Klassen zum Ziel passt) UND in der UI kennzeichnen: *"Mischsystem (FBH +
   Heizkörper) — Kennwert evtl. verzerrt, da die Fläche geteilt ist"*. Sauberer wäre langfristig, in der
   Auswertung die **Fläche je Abgabesystem** separat zu erfassen (`flaeche_fbh_m2` gibt es dort ja schon
   für andere Zwecke) und den Kennwert direkt auf die passende Teilfläche statt auf die ganze EBF zu
   beziehen — das ist aber ein grösserer Umbau, erstmal nur der Hinweis.

5. **CHF/Einheit als Gegencheck zu CHF/m² (Ausreisser-Erkennung).** Für die Wärmeverteilung (243er-Gruppe)
   zusätzlich zum CHF/m²-Kennwert einen CHF/Einheit-Kennwert rechnen (Einheit = Wohnungen bei MFH,
   analog bei Büro etc. — keine Sonderlösung nötig, einfach `anzahl_ne` als zweiter Bezug). **[Vorschlag]**
   Beide Kennwerte parallel rechnen und den geschätzten Betrag gegen beide Wege prüfen (ähnlich dem
   alten "Weg A / Weg B"-Kreuzcheck aus Abschnitt 4, Kern-Punkt 5, der im aktuellen positionsbasierten
   System noch nicht existiert): weicht der EBF-basierte Betrag stark vom Einheiten-basierten Betrag ab
   (z.B. > 30–40 % in eine Richtung), Hinweis anzeigen: *"CHF/m² und CHF/Einheit weichen stark voneinander
   ab — Zahl prüfen."* Verrechnungsdetail (welcher Weg zählt am Ende, wie stark die Abweichungs-Schwelle
   ist) mit Dominic vor der Umsetzung festlegen.

**Reihenfolge-Vorschlag für F:** zuerst 1 (kleiner Fix), dann 3+4 zusammen (gehören fachlich zusammen,
gleiche Code-Stelle: Score + Referenzliste), dann 2 (Hinweistext), dann 5 (eigener Rechenweg, am meisten
Aufwand) — aber Dominic entscheidet die Reihenfolge.

*G) NEU — Auswertungsseite: mehr Funktionen (Dominic 2026-07-19, NOCH NICHT umgesetzt):*

1. **Filter nach Projekt-Merkmalen.** Auf `AuswertungList.jsx` Filterleiste ergänzen: Wärmeerzeuger-
   Häkchen (Mehrfachauswahl, "enthält" statt "exakt" — Filter "Erdsonden-WP" zeigt auch gemischte
   Projekte, die zusätzlich noch anderes haben) und Wärmeabgabe-Häkchen nach gleichem Prinzip. Dazu
   sinnvollerweise auch Nutzung/Projektart als Dropdown-Filter (bestehende Badges auf den Karten sind
   schon die richtigen Kandidaten). Rein client-seitig filterbar (Referenzliste ist schon geladen),
   kein Backend-Umbau nötig.
2. **"Alle auswählen"-Knopf** neben den Filtern — markiert alle aktuell (nach Filter) sichtbaren
   Karten für die bestehende Sammel-Löschen-Funktion, statt jede Karte einzeln anklicken zu müssen.
3. **Chatbot auf den Auswertungsdaten ("Spielerei", Aufwand einschätzen).** Idee: ein Chat-Fenster, das
   Fragen zu den Referenzprojekten beantwortet ("Welches Projekt hatte die höchsten Kosten pro m²?").
   **[Einschätzung]** Aufwand hängt stark vom Anspruch ab:
   - **Einfach (Tage):** Ein LLM-Aufruf, dem die aktuell geladenen Referenzprojekte (JSON) als Kontext
     mitgegeben werden, plus ein simples Chat-UI. Reicht für Fragen über die sichtbaren ~50–200 Projekte.
   - **Aufwendiger (Wochen):** Eine "Tool-Use"-Anbindung, bei der das LLM eigene Datenbank-Abfragen stellen
     kann (z.B. Aggregationen über alle Projekte, nicht nur die geladene Seite) — nötig, falls die
     Datenmenge wächst oder komplexere Auswertungen ("Trend über die letzten 3 Jahre") gefragt sind.
   - Braucht ausserdem einen LLM-API-Zugang (Kosten pro Anfrage) und ist reine Zusatzfunktion, kein
     Kernfeature — Empfehlung: zurückstellen, bis die Fach-Logik (Punkt F) und die Filter (oben) stehen.

## Schema-Editor: Werkzeug-Wechsel prüfen (Dominic 2026-07-19, NOCH NICHT entschieden)

**Problem, das Dominic beschreibt:** Die Berechnungs-Intelligenz des Schema-Editors ist gut (Graph aus
Bauteilen + Leitungen, Hydraulik rechnet automatisch) — aber die **Darstellung** ist unbefriedigend:
Leitungen (`FlowEdge.jsx`, aktuelles Werkzeug React Flow / `@xyflow/react`) lassen sich nicht frei wie
in AutoCAD führen, für Speziallösungen (ungewöhnliche Linienführung, Detail-Anpassungen) gibt es kaum
Freiheit. Das deckt sich mit den seit 2026-07-06 offenen Punkten 6+7 unten (Leitungen entbuggen,
T-Stück-Splice) — beides Symptome derselben Grund-Einschränkung.

**[Vorschlag] Drei Optionen, mit Aufwand/Nutzen-Einschätzung:**

1. **React Flow behalten, nur die Leitungs-Darstellung aufwerten.** Eigenes Orthogonal-Routing bauen
   (mehrere frei verschiebbare Eckpunkte pro Leitung statt automatischer Linienführung), dazu die
   T-Stück-Splice-Logik (Punkt 7). Kleinster Aufwand, bleibt im bestehenden System, behebt aber nur
   die Symptome — die grundsätzliche Freiheit bleibt beschränkt, weil React Flow für Knoten-Diagramme
   gebaut ist, nicht für freies CAD-Zeichnen.
2. **Wechsel auf eine Diagramm-Engine mit echtem Orthogonal-Routing** (z.B. die Technologie hinter
   draw.io/mxGraph, oder eine vergleichbare Bibliothek). Solche Engines sind genau für "Linien frei
   führen, aber sauber orthogonal, mit Verbindungspunkten" gebaut — näher an dem, was Dominic will,
   als React Flow. Der bestehende Graph (Bauteile + Verbindungen), auf dem die Hydraulik-Berechnung
   läuft, bliebe im Backend unverändert — nur die Zeichenfläche im Frontend würde ersetzt. Mittlerer
   Aufwand (kompletter Editor-Neubau im Frontend), aber die Backend-Berechnung/Datenmodell bleibt stehen.
3. **Freies Zeichnen auf einer Canvas-Bibliothek** (z.B. Konva.js/Fabric.js) mit selbstgebauter
   "Intelligenz" obendrauf (Linien erkennen, Kreisläufe/Verbindungen ableiten). Maximale gestalterische
   Freiheit (wirklich wie AutoCAD), aber die aktuell "geschenkte" Intelligenz von React Flow (Knoten +
   Kanten sind bereits ein Graph) müsste grösstenteils neu gebaut werden — grösster Aufwand, höchstes
   Risiko, aber auch höchste Freiheit.

**Empfehlung Claude:** Option 2 zuerst genauer anschauen (z.B. mit einem kleinen Prototyp/Vergleich),
bevor über 1 oder 3 entschieden wird — sie verspricht den besten Kompromiss aus "endlich frei zeichnen
können" und "Graph-Intelligenz bleibt geschenkt". Das ist aber eine Grundsatzentscheidung, die die Punkte
6+7 unten ersetzen würde (nicht zusätzlich dazu) — **Dominic entscheidet**, ob und wann dieser Wechsel
angegangen wird, danach ggf. eigener Rechercheschritt (Bibliotheken vergleichen, Prototyp bauen).

**DANN — zurück ins Schema-Tool (Hydraulik-Editor, Feedback 2026-07-06, seither nicht angefasst —
ODER siehe Werkzeug-Wechsel oben, falls das den Vorrang bekommt):**
6. **Leitungen entbuggen** — immer so wenig Bögen wie möglich, nur senkrecht/waagrecht; `FlowEdge.jsx`.
7. **Leitung auf Leitung → automatisches T-Stück** (Splice: Edge in zwei Segmente teilen).
8. **Expansionsgefäss wie Excel** — editierbare Rohrinhalt-Tabelle statt nur Vsys, Zusatz-Bauteile,
   VL-Temperatur automatisch von der Gruppe mit höchster VL, Leistung aus dem Schema. IMI-Katalog offen.
9. **PDF:** «Druckverlust übers Ventil» → **«Δp Ventil»** (`export/pdf.py`).
10. **Anschluss-Marker per Gruppe anwählbar** (Option in der Verbrauchergruppe).
11. **Alle Bauteile um 90° drehbar** (Anschlüsse drehen mit).
12. **Leitungs-Beschriftung zweizeilig** — DN gross oben, m' in kg/h darunter.

**Sonst:**
13. Produktions-Login nach dem nächsten Deploy verifizieren (Postgres-Fix, wartet auf Dominics OK).

## Sicherheits-Review (extern, 2026-07-19)

Externes Feedback. **Jeder Punkt im echten Code verifiziert, bevor er umgesetzt wird**
(✅ behoben / 🔍 bestätigt, offen / ❌ nicht zutreffend). Umsetzungs-Log direkt bei den Punkten.

1. **✅ teilweise behoben (2026-07-19) — Zugangsdaten/JWT-Schlüssel.**
   - `_seed_admin` (`main.py`) setzt das Adminpasswort jetzt nur noch zurück, wenn sich
     `ADMIN_INITIAL_PASSWORD` seit dem letzten Start WIRKLICH geändert hat (Fingerprint-Vergleich, neue
     Spalte `hc_users.admin_pw_seed_fingerprint`). Lokal verifiziert: (a) normaler Neustart lässt ein
     manuell übers Konto geändertes Passwort unangetastet, (b) eine bewusste Änderung der Env-Var setzt
     das Passwort wie gewollt neu — beides mit echtem Login getestet (HTTP 200).
   - `auth.py`/`main.py` geben jetzt beim Start eine sichtbare `[WARNUNG]` aus, wenn `SECRET_KEY` bzw.
     `ADMIN_INITIAL_PASSWORD` nicht gesetzt sind und der unsichere Code-Default aktiv ist.
   - **[Offene Handlung bei Dominic]** Das ist eine reine Code-Verbesserung — sie rotiert NICHT die
     tatsächlichen Geheimnisse. `Sirego2004!` steht weiterhin als Code-Default im Repo (Git-Historie).
     **Dominic muss auf dem Produktions-Server selbst** (Hosting-Dashboard/Env-Vars) `ADMIN_INITIAL_PASSWORD`
     auf ein neues, nur ihm bekanntes Passwort setzen UND eine eigene, zufällige `SECRET_KEY` setzen (z.B.
     `openssl rand -hex 32`) — dazu hat Claude keinen Zugriff, das kann nur er selbst im Hosting-Panel tun.
     Nach dem Setzen: einmal neu deployen, dann im Log auf die `[WARNUNG]`-Zeilen prüfen (dürfen nicht
     mehr erscheinen), danach das alte Passwort gilt als kompromittiert und muss ersetzt bleiben.
2. **✅ behoben (2026-07-19) — Mandantentrennung.** Noch gravierender als beschrieben: `hc_schema.py`,
   `hc_groups.py`, `hc_export.py` hatten GAR KEINE Authentifizierung (kein `Depends(get_current_user)`) —
   nicht nur `TENANT_ID=1` fest codiert, die Endpunkte waren komplett ohne Login aufrufbar. Fix (Muster
   aus `hc_projects.py` übernommen): alle Endpunkte verlangen jetzt `user: User = Depends(get_current_user)`,
   sämtliche Datenbank-Filter nutzen `user.tenant_id` statt der Konstante. Lokal mit echten HTTP-Requests
   bewiesen: `GET /projects/{id}/groups`, `GET /group-templates`, `GET /projects/{id}/schemas`,
   `GET /schemas/{id}/pdf` liefern ohne Token **401**, mit gültigem Token **200** (curl-Tests, beide Fälle).
   Backend-Testsuite weiterhin 125/125 grün (diese Router haben keine pytest-Abdeckung, da reine
   Integrations-Endpunkte — Absicherung nur via echtem HTTP-Test verifiziert, nicht automatisiert).
3. **✅ behoben (2026-07-19) — PDF-Export.** `HydraulikEditor.jsx`: `window.open()` durch eine
   `downloadPdf()`-Funktion ersetzt, die den PDF-Endpunkt authentifiziert per Axios als Blob lädt (Token
   kommt automatisch vom bestehenden Interceptor in `api.js`) und danach als Object-URL in einem neuen Tab
   öffnet. Live im Browser getestet: eingeloggt → Klick auf «⤓ Schema» → `GET /schemas/{id}/pdf` liefert
   HTTP 200 mit Token im Header (Netzwerk-Log geprüft), kein Klartext-Link mehr ohne Auth abrufbar.
   **Nebenbefund:** Das Entfernen von `allow_origin_regex=".*"` (Punkt 4) blockiert jetzt zurecht Anfragen
   von Origins, die nicht in `ALLOWED_ORIGINS` stehen — beim lokalen Testen mit einem Dev-Server auf einem
   Nicht-Standard-Port (5182 statt dem dokumentierten 5173) schlug das CORS zuerst fehl. Kein Bug, sondern
   der Fix wirkt wie gewollt; für produktive Zusatz-Domains muss `ALLOWED_ORIGINS` entsprechend gepflegt sein.
4. **✅ behoben (2026-07-19) — CORS.** `allow_origin_regex=".*"` aus `main.py` entfernt — nur noch die
   definierte `ALLOWED_ORIGINS`-Liste gilt. Lokal geprüft: Backend startet fehlerfrei, App funktioniert
   weiter (`localhost:5173`/`5182` sind Teil der Default-Liste). **Nach dem nächsten Deploy prüfen**, ob
   `ALLOWED_ORIGINS` auf dem Server die echte Produktions-Domain enthält.
5. **🔍 bestätigt — Firmeneintritt über Namen.** `routers/hc_auth.py` nimmt `firmenname` frei entgegen und
   lässt bei Namenstreffer automatisch beitreten, keine Einladung/kein Code nötig.
   **[Rückfrage an Dominic nötig]** wie der Einladungs-/Code-Fluss fachlich aussehen soll, bevor das
   umgebaut wird (Product-Entscheid, keine reine Code-Korrektur).

**Datenbank:**
🔍 bestätigt, sogar schlimmer als beschrieben — `backend/alembic/versions/` enthält NUR noch
`__pycache__`-Reste (`.pyc`), die zugehörigen `.py`-Migrationsquellen existieren im Repo nicht (auch nicht
in der Git-Historie) → Alembic ist im Projekt faktisch tot, die App migriert komplett über
`main.py::_ensure_columns()` mit `ALTER TABLE`/`DROP TABLE IF EXISTS` bei jedem Start.
`BauindexEintrag.periode` (`models/kv.py:130`) hat `unique=True` statt `UNIQUE(tenant_id, periode)` —
bestätigt, zweite Firma kann denselben Periodenwert nicht anlegen.
**[Rückfrage an Dominic nötig]** ein voller Alembic-Umbau (Migrationen aus dem Ist-Zustand neu aufbauen,
Start-Verhalten umstellen, Backup-Strategie) ist ein grösserer, produktionsnaher Eingriff — nicht einfach
nebenbei fixbar, eigener Schritt mit Dominic vor der Umsetzung planen.

**Umsetzungsplan / Reihenfolge (mit Dominic abgesprochen, 2026-07-19):**
- Zuerst die risikoarmen, klar umsetzbaren Code-Fixes: **4 (CORS)** → **1 (Secrets/Admin-Reset)** →
  **2 (Mandantentrennung)** → **3 (PDF-Export)**.
- **5 (Firmeneintritt)** und der **DB/Alembic-Umbau** brauchen zuerst einen Produkt-/Architektur-Entscheid
  von Dominic — nicht blind umsetzen, zuerst Vorschlag + Rückfrage.
- Status je Punkt wird hier direkt nachgetragen, sobald erledigt.

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
