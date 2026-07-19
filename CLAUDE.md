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

**DANN — zurück ins Schema-Tool (Hydraulik-Editor, Feedback 2026-07-06, seither nicht angefasst):**
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
